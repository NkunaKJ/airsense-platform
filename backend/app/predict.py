import os
import time
from datetime import date as date_type
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import psycopg
import requests
from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from app.advice import advice_for
from app.features import GROUPS, RAW, SHOWN, add_features, band_for

router = APIRouter(prefix="/predict", tags=["predict"])

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/app/models"))
DATABASE_URL = os.environ["DATABASE_URL"]

AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WX_URL = "https://api.open-meteo.com/v1/forecast"
AQ_VARS = "pm2_5,pm10,nitrogen_dioxide,ozone"
WX_VARS = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,surface_pressure"
TIMEZONE = "Africa/Johannesburg"   # same as the training data
CACHE_SECONDS = 3600               # live values refresh once an hour

_cache = {}

_models = {}


def load_models():
    """Load every saved model once and keep it in memory."""
    _models.clear()
    for path in sorted(MODEL_DIR.glob("*.joblib")):
        bundle = joblib.load(path)
        _models[bundle["city"]] = bundle
    return _models


def get_models():
    if not _models:
        load_models()
    return _models


@router.get("/models")
def loaded_models():
    """Which trained models the API has loaded (a check that loading works)."""
    return [
        {
            "city": city,
            "model_name": b["model_name"],
            "n_features": len(b["features"]),
            "trained_through": b["trained_through"],
            "test_mae": round(b["test_mae"], 2),
        }
        for city, b in get_models().items()
    ]


def get_city(city_key):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT key, name, latitude, longitude FROM cities WHERE key = %s",
            (city_key,),
        ).fetchone()


def _fetch_hourly(url, lat, lon, variables):
    r = requests.get(
        url,
        params={
            "latitude": lat, "longitude": lon, "hourly": variables,
            "past_days": 10, "forecast_days": 1, "timezone": TIMEZONE,
        },
        timeout=30,
    )
    r.raise_for_status()
    return pd.DataFrame(r.json()["hourly"])


def fetch_live_daily(lat, lon):
    """Last 10 days plus today, as daily averages of hourly values (the same
    way the training data was made)."""
    aq = _fetch_hourly(AQ_URL, lat, lon, AQ_VARS)
    wx = _fetch_hourly(WX_URL, lat, lon, WX_VARS)
    df = aq.merge(wx, on="time")
    df["time"] = pd.to_datetime(df["time"])
    daily = df.set_index("time")[RAW].resample("D").mean().reset_index()
    return daily.rename(columns={"time": "obs_date"})


def predict_from_daily(bundle, daily):
    feats = add_features(daily)
    today = feats.iloc[-1]
    row = today[bundle["features"]]
    if row.isna().any():
        missing = list(row.index[row.isna()])
        raise ValueError(f"Not enough live data to predict (missing: {missing})")
    X = pd.DataFrame([row.astype(float)], columns=bundle["features"])
    value = max(0.0, float(bundle["model"].predict(X)[0]))
    return feats, today, value


def explain(bundle, row):
    """What pushed tomorrow's prediction up or down, compared with a typical day.

    For each factor we put its features back to their usual (training average)
    values and see how much the prediction changes. For a linear model such as
    Ridge this is exact and the effects add up to the prediction. For other
    models it is an approximation.
    """
    feats = bundle["features"]
    means = bundle["feature_means"]
    full = float(bundle["model"].predict(pd.DataFrame([row.astype(float)], columns=feats))[0])
    typical = float(bundle["model"].predict(pd.DataFrame([{f: means[f] for f in feats}], columns=feats))[0])

    drivers = []
    for name, cols in GROUPS.items():
        alt = row.astype(float).copy()
        for c in cols:
            alt[c] = means[c]
        effect = full - float(bundle["model"].predict(pd.DataFrame([alt], columns=feats))[0])
        item = {"factor": name, "effect": round(effect, 1),
                "direction": "up" if effect > 0 else "down" if effect < 0 else "none"}
        if name in SHOWN:
            col, unit = SHOWN[name]
            item.update({"today": round(float(row[col]), 1),
                         "usual": round(float(means[col]), 1), "unit": unit})
        drivers.append(item)
    drivers.sort(key=lambda d: abs(d["effect"]), reverse=True)
    is_linear = "ridge" in str(bundle["model_name"]).lower()
    return {
        "typical_day_prediction": round(typical, 1),
        "drivers": drivers,
        "method": "exact" if is_linear else "approximate",
        "how_to_read": ("Effects are in µg/m³, compared with a typical day in the "
                        "training data. Positive pushes tomorrow's PM2.5 up."),
    }


def unusual_inputs(bundle, today):
    """Typed-in values far outside what this city's model was trained on."""
    out = []
    for factor, (col, unit) in SHOWN.items():
        mean = float(bundle["feature_means"][col])
        std = float(bundle["feature_stds"][col])
        value = float(today[col])
        if std > 0 and abs(value - mean) > 4 * std:
            out.append({
                "factor": "Today's PM2.5" if col == "pm2_5" else factor,
                "value": round(value, 1), "usual": round(mean, 1), "unit": unit,
            })
    return out


def build_response(city_key, bundle, city, today, value, recent, source, note, extra=None):
    """The one response shape used by all three ways of getting today's conditions."""
    today_date = today["obs_date"]
    band = band_for(value)
    data = {
        "city": city_key,
        "city_name": city["name"],
        "source": source,
        "model_name": bundle["model_name"],
        "based_on_date": str(today_date.date()),
        "predicts_for_date": str((today_date + pd.Timedelta(days=1)).date()),
        "predicted_pm2_5": round(value, 1),
        "band": band,
        "typical_error": round(bundle["test_mae"], 1),
        "advice": advice_for(band),
        "inputs_today": {k: round(float(today[k]), 2) for k in RAW},
        "explanation": explain(bundle, today[bundle["features"]]),
        "recent_days": recent,
        "note": note,
        "refreshed_at": pd.Timestamp.now(tz="UTC").isoformat(),
    }
    if extra:
        data.update(extra)
    return data


def _recent_list(frame):
    return [
        {"date": str(d.date()), "pm2_5": None if pd.isna(v) else round(float(v), 1)}
        for d, v in zip(frame["obs_date"], frame["pm2_5"])
    ]


def _model_and_city(city_key):
    models = get_models()
    if city_key not in models:
        raise HTTPException(status_code=404, detail="Unknown city")
    return models[city_key], get_city(city_key)


def load_city_daily(city_key):
    """Every stored day for one city, oldest first."""
    cols = ", ".join(f"o.{c}" for c in RAW)
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        rows = conn.execute(
            f"SELECT o.obs_date, {cols} FROM observations o "
            "JOIN cities c ON c.id = o.city_id WHERE c.key = %s ORDER BY o.obs_date",
            (city_key,),
        ).fetchall()
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["obs_date"] = pd.to_datetime(df["obs_date"])
    for c in RAW:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


@router.get("/{city_key}/dates")
def dataset_dates(city_key: str):
    """First and last stored day the model can start from (it needs a week of history)."""
    bundle, _ = _model_and_city(city_key)
    daily = load_city_daily(city_key)
    if daily.empty:
        raise HTTPException(status_code=404, detail="No stored data for this city")
    feats = add_features(daily).dropna(subset=bundle["features"])
    if feats.empty:
        raise HTTPException(status_code=404, detail="No complete days stored for this city")
    return {
        "city": city_key,
        "first": str(feats["obs_date"].min().date()),
        "last": str(feats["obs_date"].max().date()),
        # a typical day for this city, shown as hints in the manual form
        "usual": {k: round(float(bundle["feature_means"][k]), 1) for k in RAW},
    }


@router.get("/{city_key}/day")
def predict_dataset_day(city_key: str, date: date_type):
    """Predict the day after a recorded day, and show what actually happened."""
    bundle, city = _model_and_city(city_key)
    daily = load_city_daily(city_key)
    chosen = pd.Timestamp(date)
    upto = daily[daily["obs_date"] <= chosen].tail(15)
    if upto.empty or upto["obs_date"].iloc[-1] != chosen:
        raise HTTPException(status_code=404, detail="That day is not in the dataset.")
    try:
        feats, today, value = predict_from_daily(bundle, upto)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="That day does not have a full week of earlier data. Pick a later day.",
        )
    nxt = daily[daily["obs_date"] == chosen + pd.Timedelta(days=1)]
    actual = None
    if not nxt.empty and not pd.isna(nxt["pm2_5"].iloc[0]):
        actual = round(float(nxt["pm2_5"].iloc[0]), 1)
    note = ("This is a recorded day. The saved model was trained on days like this one, "
            "so it looks better here than it would on brand-new days. The Analysis page "
            "shows the fair test.")
    return build_response(
        city_key, bundle, city, today, value, _recent_list(feats.tail(7)), "day", note,
        {"actual_next_day": actual},
    )


class ManualInput(BaseModel):
    """Everything the model needs, in plain terms. Limits keep the values believable."""
    date: date_type
    pm2_5: float = Field(ge=0, le=500)
    pm10: float = Field(ge=0, le=1000)
    nitrogen_dioxide: float = Field(ge=0, le=500)
    ozone: float = Field(ge=0, le=500)
    temperature_2m: float = Field(ge=-30, le=55)
    relative_humidity_2m: float = Field(ge=0, le=100)
    wind_speed_10m: float = Field(ge=0, le=200)
    precipitation: float = Field(ge=0, le=300)
    surface_pressure: float = Field(ge=600, le=1100)
    pm2_5_yesterday: float = Field(ge=0, le=500)
    pm2_5_2_days_ago: float = Field(ge=0, le=500)
    pm2_5_3_days_ago: float = Field(ge=0, le=500)


@router.post("/{city_key}/manual")
def predict_manual(city_key: str, body: ManualInput):
    """Predict from values the person typed in."""
    bundle, city = _model_and_city(city_key)
    when = pd.Timestamp(body.date)
    earlier = [body.pm2_5_yesterday, body.pm2_5_2_days_ago, body.pm2_5_3_days_ago]
    doy = when.dayofyear
    today = pd.Series({
        "obs_date": when,
        **{k: float(getattr(body, k)) for k in RAW},
        "pm2_5_lag1": earlier[0],
        "pm2_5_lag2": earlier[1],
        "pm2_5_lag3": earlier[2],
        # Only four days are typed in, so the 7-day average is estimated from those four.
        "pm2_5_roll7": float(np.mean([body.pm2_5, *earlier])),
        "doy_sin": float(np.sin(2 * np.pi * doy / 365.25)),
        "doy_cos": float(np.cos(2 * np.pi * doy / 365.25)),
    })
    row = today[bundle["features"]].astype(float)
    X = pd.DataFrame([row], columns=bundle["features"])
    value = max(0.0, float(bundle["model"].predict(X)[0]))
    recent = [
        {"date": str((when - pd.Timedelta(days=n)).date()), "pm2_5": round(float(v), 1)}
        for n, v in zip((3, 2, 1, 0), (earlier[2], earlier[1], earlier[0], body.pm2_5))
    ]
    note = ("These are the values you typed in. The 7-day average PM2.5 is estimated from the "
            "four PM2.5 values you gave, so the result is a good guide, not an exact match "
            "to the model's usual inputs.")
    return build_response(
        city_key, bundle, city, today, value, recent, "manual", note,
        {"unusual_inputs": unusual_inputs(bundle, today)},
    )


@router.get("/{city_key}")
def predict_city(city_key: str):
    """Tomorrow's PM2.5 for a city, from live data (refreshed hourly)."""
    bundle, city = _model_and_city(city_key)
    cached = _cache.get(city_key)
    if cached and time.time() - cached["at"] < CACHE_SECONDS:
        return cached["data"]

    try:
        daily = fetch_live_daily(city["latitude"], city["longitude"])
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Live data unavailable: {e}")
    try:
        feats, today, value = predict_from_daily(bundle, daily)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))

    note = ("Today's average mixes hours already measured with the model's "
            "forecast for the rest of today.")
    data = build_response(
        city_key, bundle, city, today, value, _recent_list(feats.tail(7)), "live", note,
    )
    _cache[city_key] = {"at": time.time(), "data": data}
    return data