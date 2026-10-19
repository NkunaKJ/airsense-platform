"""Step 7I: top up the observations table (and the CSV files) up to yesterday.

Same method as the notebook that built the original data: hourly values from
Open-Meteo, averaged into one value per day, using South African (SAST) days.
Safe to run again: days already in the database are never changed or duplicated.
"""
import json
import time
import urllib.parse
import urllib.request
from datetime import timedelta

import pandas as pd
import psycopg

import common

AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WX_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
WX_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AQ_VARS = ["pm2_5", "pm10", "nitrogen_dioxide", "ozone"]
WX_VARS = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m",
           "precipitation", "surface_pressure"]
OVERLAP_DAYS = 5   # re-download the last few stored days to prove the method matches


def get_hourly(url, variables, start, end, lat, lon, retries=4):
    query = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon, "hourly": ",".join(variables),
        "start_date": start, "end_date": end, "timezone": "Africa/Johannesburg",
    })
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(f"{url}?{query}", timeout=60) as resp:
                df = pd.DataFrame(json.load(resp)["hourly"])
            df["time"] = pd.to_datetime(df["time"])
            return df.set_index("time")
        except Exception as err:   # network or server problem: wait and try again
            last_error = err
            print(f"  attempt {attempt} failed ({type(err).__name__}: {err}); waiting...")
            time.sleep(5 * attempt)
    raise RuntimeError(f"Could not download {url}: {last_error}")


def daily_values(lat, lon, start, end):
    """One row per day: the mean of that day's hourly values (like the notebook)."""
    air = get_hourly(AQ_URL, AQ_VARS, start, end, lat, lon)
    time.sleep(1)
    try:
        weather = get_hourly(WX_ARCHIVE_URL, WX_VARS, start, end, lat, lon)
    except RuntimeError:
        weather = None
    time.sleep(1)
    # The weather archive lags a few days behind, so its newest hours are empty.
    # Those gaps are filled from Open-Meteo's forecast service (recent past days).
    recent = get_hourly(WX_FORECAST_URL, WX_VARS, start, end, lat, lon)
    weather = recent if weather is None else weather.combine_first(recent)
    hourly = air.join(weather, how="inner")
    daily = hourly.resample("D").mean()
    daily.index = daily.index.date
    return daily[common.RAW]


def main():
    yesterday = (pd.Timestamp.now(tz="Africa/Johannesburg").normalize()
                 - timedelta(days=1)).date()
    print(f"Topping up to {yesterday} (today is left out because it is not finished)\n")
    csv_cols = ["time"] + common.RAW

    with psycopg.connect(common.db_url()) as conn:
        cities = conn.execute(
            "SELECT id, key, latitude, longitude FROM cities ORDER BY id").fetchall()
        for city_id, key, lat, lon in cities:
            last = conn.execute("SELECT max(obs_date) FROM observations WHERE city_id = %s",
                                (city_id,)).fetchone()[0]
            if last >= yesterday:
                print(f"{key}: already up to date ({last})")
                continue
            start = last - timedelta(days=OVERLAP_DAYS - 1)
            print(f"{key}: database ends {last}; downloading {start} to {yesterday} ...")
            daily = daily_values(lat, lon, start, yesterday)

            # Check: do re-downloaded old days match what is stored?
            stored = pd.DataFrame(
                conn.execute(f"SELECT obs_date, {', '.join(common.RAW)} FROM observations "
                             "WHERE city_id = %s AND obs_date >= %s AND obs_date <= %s",
                             (city_id, start, last), ).fetchall(),
                columns=["obs_date"] + common.RAW).set_index("obs_date")
            both = stored.index.intersection(daily.index)
            if len(both):
                diff = (daily.loc[both, ["pm2_5", "temperature_2m"]].astype(float)
                        - stored.loc[both, ["pm2_5", "temperature_2m"]].astype(float)).abs().max()
                print(f"  check on {len(both)} overlapping days: biggest difference "
                      f"PM2.5 {diff['pm2_5']:.2f}, temperature {diff['temperature_2m']:.2f}")

            new = daily[daily.index > last]
            rows = [(city_id, d, *[None if pd.isna(v) else float(v) for v in r])
                    for d, r in zip(new.index, new[common.RAW].to_numpy())]
            with conn.cursor() as cur:
                cur.executemany(
                    f"INSERT INTO observations (city_id, obs_date, {', '.join(common.RAW)}) "
                    f"VALUES ({', '.join(['%s'] * (2 + len(common.RAW)))}) "
                    "ON CONFLICT (city_id, obs_date) DO NOTHING", rows)
            conn.commit()

            # Keep the CSV file in step, so rebuilding the database later gives the same data.
            csv_path = common.ROOT / "data" / f"{key}_air_quality.csv"
            if csv_path.exists():
                csv_last = pd.to_datetime(
                    pd.read_csv(csv_path, usecols=["time"])["time"]).max().date()
                add = new[new.index > csv_last].copy()
                if len(add):
                    add.index.name = "time"
                    text = csv_path.read_text()
                    if not text.endswith("\n"):
                        csv_path.write_text(text + "\n")
                    add.reset_index()[csv_cols].to_csv(csv_path, mode="a", header=False,
                                                       index=False)
            empty = int(new["pm2_5"].isna().sum())
            print(f"  added {len(new)} days ({new.index.min()} to {new.index.max()}); "
                  f"days with no PM2.5: {empty}")

    print("\nDone. Next: retrain (tune.py, then finalize.py).")


if __name__ == "__main__":
    main()