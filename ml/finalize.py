"""Step 5D: score the chosen models ONCE on the untouched test dates,
save the final models, and store all results in PostgreSQL."""
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import psycopg
from psycopg.types.json import Jsonb
from sklearn.base import clone
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

import common
import tune

HERE = Path(__file__).resolve().parent
MODEL_DIR = common.ROOT / "backend" / "models"

SCHEMA = """
CREATE TABLE IF NOT EXISTS model_results (
    city_key TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    params JSONB NOT NULL,
    cv_mae DOUBLE PRECISION,
    baseline_cv_mae DOUBLE PRECISION,
    test_mae DOUBLE PRECISION,
    test_rmse DOUBLE PRECISION,
    test_r2 DOUBLE PRECISION,
    baseline_test_mae DOUBLE PRECISION,
    train_rows INTEGER,
    test_rows INTEGER,
    train_end DATE,
    test_start DATE,
    trained_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS model_candidates (
    city_key TEXT NOT NULL,
    model_name TEXT NOT NULL,
    cv_mae DOUBLE PRECISION,
    params JSONB NOT NULL,
    is_selected BOOLEAN NOT NULL,
    PRIMARY KEY (city_key, model_name)
);
"""


def build_model(name, params):
    estimator, _ = tune.CANDIDATES[name]
    fixed = {k: (tuple(v) if isinstance(v, list) else v) for k, v in params.items()}
    return clone(estimator).set_params(**fixed)


def main():
    cv = json.loads((HERE / "cv_results.json").read_text())
    data = common.load_observations()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    final = []

    for r in cv:
        city, name = r["city"], r["best_model"]
        params = r["models"][name]["params"]
        rows = common.training_rows(common.build_features(data[data.city == city]))
        train, test = tune.split_train_test(rows)
        F = common.FEATURES

        # 1) fit on TRAIN only, score ONCE on TEST
        model = build_model(name, params).fit(train[F], train["target"])
        pred = model.predict(test[F])
        y = test["target"].values
        test_mae = float(mean_absolute_error(y, pred))
        test_rmse = float(np.sqrt(mean_squared_error(y, pred)))
        test_r2 = float(r2_score(y, pred))
        base_mae = float(mean_absolute_error(y, test["pm2_5"].values))

        # 2) refit on ALL usable days for the model the app will use live
        deploy = build_model(name, params).fit(rows[F], rows["target"])
        joblib.dump({
            "city": city, "model_name": name, "model": deploy, "features": F,
            "feature_means": rows[F].mean().to_dict(),
            "feature_stds": rows[F].std().to_dict(),
            "trained_through": str(rows["obs_date"].iloc[-1].date()),
            "test_mae": test_mae,
        }, MODEL_DIR / f"{city}.joblib")

        final.append({
            "city_key": city, "model_name": name, "params": params,
            "cv_mae": r["models"][name]["cv_mae"],
            "baseline_cv_mae": r["models"]["Baseline (tomorrow = today)"]["cv_mae"],
            "test_mae": test_mae, "test_rmse": test_rmse, "test_r2": test_r2,
            "baseline_test_mae": base_mae,
            "train_rows": r["train_rows"], "test_rows": r["test_rows"],
            "train_end": r["train_end"], "test_start": r["test_start"],
            "candidates": r["models"],
        })

    now = datetime.now(timezone.utc)
    with psycopg.connect(common.db_url()) as conn:
        conn.execute(SCHEMA)
        for f in final:
            conn.execute(
                """INSERT INTO model_results (city_key, model_name, params, cv_mae,
                   baseline_cv_mae, test_mae, test_rmse, test_r2, baseline_test_mae,
                   train_rows, test_rows, train_end, test_start, trained_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (city_key) DO UPDATE SET
                   model_name=EXCLUDED.model_name, params=EXCLUDED.params,
                   cv_mae=EXCLUDED.cv_mae, baseline_cv_mae=EXCLUDED.baseline_cv_mae,
                   test_mae=EXCLUDED.test_mae, test_rmse=EXCLUDED.test_rmse,
                   test_r2=EXCLUDED.test_r2, baseline_test_mae=EXCLUDED.baseline_test_mae,
                   train_rows=EXCLUDED.train_rows, test_rows=EXCLUDED.test_rows,
                   train_end=EXCLUDED.train_end, test_start=EXCLUDED.test_start,
                   trained_at=EXCLUDED.trained_at""",
                (f["city_key"], f["model_name"], Jsonb(f["params"]), f["cv_mae"],
                 f["baseline_cv_mae"], f["test_mae"], f["test_rmse"], f["test_r2"],
                 f["baseline_test_mae"], f["train_rows"], f["test_rows"],
                 f["train_end"], f["test_start"], now),
            )
            for mname, m in f["candidates"].items():
                conn.execute(
                    """INSERT INTO model_candidates (city_key, model_name, cv_mae, params, is_selected)
                       VALUES (%s,%s,%s,%s,%s)
                       ON CONFLICT (city_key, model_name) DO UPDATE SET
                       cv_mae=EXCLUDED.cv_mae, params=EXCLUDED.params, is_selected=EXCLUDED.is_selected""",
                    (f["city_key"], mname, m["cv_mae"], Jsonb(m["params"]),
                     mname == f["model_name"]),
                )

    print("\nFINAL RESULTS (test = the last 20% of dates, scored once)\n")
    print(f"{'City':<14}{'Model':<22}{'Test MAE':>9}{'Baseline':>10}{'Better by':>11}{'R2':>7}")
    for f in final:
        gain = (1 - f["test_mae"] / f["baseline_test_mae"]) * 100
        print(f"{f['city_key']:<14}{f['model_name']:<22}{f['test_mae']:>9.2f}"
              f"{f['baseline_test_mae']:>10.2f}{gain:>10.1f}%{f['test_r2']:>7.2f}")
    print("\nChosen settings:")
    for f in final:
        print(f"  {f['city_key']}: {f['params']}")
    print(f"\nModels saved in: {MODEL_DIR}")
    print("Results stored in PostgreSQL tables: model_results, model_candidates")


if __name__ == "__main__":
    main()