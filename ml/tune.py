"""Step 5C: compare and tune models per city with time-ordered cross-validation.

The last 20% of dates (the test set) is NOT used here. It is kept for Step 5D.
"""
import json
import time
import warnings
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import common

warnings.filterwarnings("ignore")

TEST_FRACTION = 0.20
N_SPLITS = 5

CANDIDATES = {
    "Ridge (linear)": (
        make_pipeline(StandardScaler(), Ridge()),
        {"ridge__alpha": [0.1, 1, 10, 100, 1000]},
    ),
    "Random Forest": (
        RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1),
        {"max_depth": [4, 8, None], "min_samples_leaf": [3, 10]},
    ),
    "Gradient Boosting": (
        HistGradientBoostingRegressor(random_state=42),
        {"learning_rate": [0.03, 0.1], "max_depth": [3, 5], "max_iter": [150, 300]},
    ),
    "Neural Network (MLP)": (
        make_pipeline(
            StandardScaler(),
            MLPRegressor(max_iter=600, early_stopping=False, random_state=42),
        ),
        {
            "mlpregressor__hidden_layer_sizes": [(16,), (32,), (32, 16)],
            "mlpregressor__alpha": [0.001, 0.1, 1.0],
        },
    ),
}


def split_train_test(rows):
    cut = int(len(rows) * (1 - TEST_FRACTION))
    return rows.iloc[:cut], rows.iloc[cut:]


def persistence_cv_mae(X, y, tscv):
    """Baseline 'tomorrow = today', scored on the same validation folds."""
    errs = []
    for _, val_idx in tscv.split(X):
        errs.append(np.abs(y.iloc[val_idx].values - X["pm2_5"].iloc[val_idx].values))
    return float(np.mean(np.concatenate(errs)))


def tune_city(city, feats):
    rows = common.training_rows(feats)
    train, test = split_train_test(rows)
    X, y = train[common.FEATURES], train["target"]
    tscv = TimeSeriesSplit(n_splits=N_SPLITS)

    result = {
        "city": city,
        "train_rows": len(train),
        "test_rows": len(test),
        "train_end": str(train["obs_date"].iloc[-1].date()),
        "test_start": str(test["obs_date"].iloc[0].date()),
        "models": {},
    }
    result["models"]["Baseline (tomorrow = today)"] = {
        "cv_mae": persistence_cv_mae(X, y, tscv), "params": {},
    }
    for name, (estimator, grid) in CANDIDATES.items():
        t0 = time.time()
        search = GridSearchCV(
            estimator, grid, cv=tscv, scoring="neg_mean_absolute_error", n_jobs=-1,
        )
        search.fit(X, y)
        result["models"][name] = {
            "cv_mae": float(-search.best_score_),
            "params": {k: (list(v) if isinstance(v, tuple) else v)
                       for k, v in search.best_params_.items()},
        }
        print(f"   {name:<22} CV MAE {-search.best_score_:6.2f}   ({time.time()-t0:.0f}s)",
              flush=True)
    real = {k: v for k, v in result["models"].items() if not k.startswith("Baseline")}
    result["best_model"] = min(real, key=lambda k: real[k]["cv_mae"])
    return result


def main():
    data = common.load_observations()
    all_results = []
    for city, part in data.groupby("city"):
        print(f"\n{city}", flush=True)
        r = tune_city(city, common.build_features(part))
        print(f"   {'Baseline (today)':<22} CV MAE {r['models']['Baseline (tomorrow = today)']['cv_mae']:6.2f}")
        print(f"   --> best: {r['best_model']}")
        all_results.append(r)
    out = Path(__file__).resolve().parent / "cv_results.json"
    out.write_text(json.dumps(all_results, indent=2))
    print(f"\nSaved {out.name}")


if __name__ == "__main__":
    main()