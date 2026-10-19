"""Feature building for live predictions. Must match ml/common.py exactly."""
import numpy as np
import pandas as pd

RAW = [
    "pm2_5", "pm10", "nitrogen_dioxide", "ozone", "temperature_2m",
    "relative_humidity_2m", "wind_speed_10m", "precipitation", "surface_pressure",
]

BAND_LIMITS = [(15, "Good"), (35, "Moderate"), (55, "Poor")]


def band_for(pm25):
    for limit, name in BAND_LIMITS:
        if pm25 < limit:
            return name
    return "Very poor"


def add_features(daily):
    """daily: one row per day with 'obs_date' and the RAW columns."""
    df = (daily.sort_values("obs_date").set_index("obs_date")
          .asfreq("D").rename_axis("obs_date").reset_index())
    out = df.copy()
    for lag in (1, 2, 3):
        out[f"pm2_5_lag{lag}"] = df["pm2_5"].shift(lag)
    out["pm2_5_roll7"] = df["pm2_5"].rolling(7).mean()
    doy = df["obs_date"].dt.dayofyear
    out["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    out["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)
    return out

# Plain-language factors used to explain a prediction. Each factor is a group
# of model features that are changed together.
GROUPS = {
    "Recent PM2.5 levels": ["pm2_5", "pm2_5_lag1", "pm2_5_lag2", "pm2_5_lag3", "pm2_5_roll7"],
    "Coarse particles (PM10)": ["pm10"],
    "Nitrogen dioxide": ["nitrogen_dioxide"],
    "Ozone": ["ozone"],
    "Temperature": ["temperature_2m"],
    "Humidity": ["relative_humidity_2m"],
    "Wind speed": ["wind_speed_10m"],
    "Rain": ["precipitation"],
    "Air pressure": ["surface_pressure"],
    "Time of year": ["doy_sin", "doy_cos"],
}

# (feature shown to the reader, unit) for each factor
SHOWN = {
    "Recent PM2.5 levels": ("pm2_5", "µg/m³"),
    "Coarse particles (PM10)": ("pm10", "µg/m³"),
    "Nitrogen dioxide": ("nitrogen_dioxide", "µg/m³"),
    "Ozone": ("ozone", "µg/m³"),
    "Temperature": ("temperature_2m", "°C"),
    "Humidity": ("relative_humidity_2m", "%"),
    "Wind speed": ("wind_speed_10m", "km/h"),
    "Rain": ("precipitation", "mm"),
    "Air pressure": ("surface_pressure", "hPa"),
}