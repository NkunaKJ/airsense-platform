"""AirSense ML helpers: load data from PostgreSQL and build model features."""
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg

ROOT = Path(__file__).resolve().parent.parent

RAW = [
    "pm2_5", "pm10", "nitrogen_dioxide", "ozone", "temperature_2m",
    "relative_humidity_2m", "wind_speed_10m", "precipitation", "surface_pressure",
]
ENGINEERED = [
    "pm2_5_lag1", "pm2_5_lag2", "pm2_5_lag3", "pm2_5_roll7",
    "doy_sin", "doy_cos",
]
FEATURES = RAW + ENGINEERED


def read_env():
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def db_url():
    e = read_env()
    return (f"postgresql://{e['POSTGRES_USER']}:{e['POSTGRES_PASSWORD']}"
            f"@localhost:5432/{e['POSTGRES_DB']}")


def load_observations():
    cols = ", ".join(f"o.{c}" for c in RAW)
    q = (f"SELECT c.key AS city, o.obs_date, {cols} FROM observations o "
         f"JOIN cities c ON c.id = o.city_id ORDER BY c.key, o.obs_date")
    with psycopg.connect(db_url()) as conn:
        cur = conn.execute(q)
        names = [d.name for d in cur.description]
        rows = cur.fetchall()
    df = pd.DataFrame(rows, columns=names)
    df["obs_date"] = pd.to_datetime(df["obs_date"])
    for c in RAW:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def build_features(city_df):
    """One city's daily rows -> feature table with a 'target' (tomorrow's PM2.5).

    Missing days are inserted as empty rows first, so a lag never jumps over a gap.
    The final row has no target (that is 'today', used for live prediction).
    """
    df = (city_df.sort_values("obs_date").set_index("obs_date")
          .asfreq("D").rename_axis("obs_date").reset_index())
    out = df.copy()
    for lag in (1, 2, 3):
        out[f"pm2_5_lag{lag}"] = df["pm2_5"].shift(lag)
    out["pm2_5_roll7"] = df["pm2_5"].rolling(7).mean()
    doy = df["obs_date"].dt.dayofyear
    out["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    out["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)
    out["target"] = df["pm2_5"].shift(-1)
    return out


def training_rows(feature_df):
    return feature_df.dropna(subset=FEATURES + ["target"]).reset_index(drop=True)


if __name__ == "__main__":
    data = load_observations()
    print(f"Loaded {len(data)} rows from PostgreSQL\n")
    for city, part in data.groupby("city"):
        feats = build_features(part)
        usable = training_rows(feats)
        print(f"{city}: {len(part)} days | {part.obs_date.min().date()} to "
              f"{part.obs_date.max().date()} | usable training rows: {len(usable)}")
    print("\nFeatures used:", len(FEATURES))
    print(FEATURES)