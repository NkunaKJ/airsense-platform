import os

import psycopg
from fastapi import APIRouter
from psycopg.rows import dict_row

router = APIRouter(prefix="/eda", tags=["eda"])

DATABASE_URL = os.environ["DATABASE_URL"]

FEATURES = [
    "pm2_5", "pm10", "nitrogen_dioxide", "ozone", "temperature_2m",
    "relative_humidity_2m", "wind_speed_10m", "precipitation", "surface_pressure",
]

# AirSense PM2.5 bands in ug/m3 (lower bound inclusive, upper bound exclusive)
BANDS = [
    {"name": "Good", "min": 0, "max": 15},
    {"name": "Moderate", "min": 15, "max": 35},
    {"name": "Poor", "min": 35, "max": 55},
    {"name": "Very poor", "min": 55, "max": None},
]


def query(sql, params=None):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        return conn.execute(sql, params or ()).fetchall()


def rnd(v, n=2):
    return None if v is None else round(float(v), n)


@router.get("/summary")
def summary():
    """Size of the data and basic PM2.5 statistics for each city."""
    rows = query(
        """SELECT c.key AS city_key, c.name AS city_name,
                  COUNT(o.pm2_5) AS days_with_pm2_5,
                  MIN(o.obs_date) AS first_date, MAX(o.obs_date) AS last_date,
                  AVG(o.pm2_5) AS mean, STDDEV(o.pm2_5) AS std,
                  MIN(o.pm2_5) AS min, MAX(o.pm2_5) AS max,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY o.pm2_5) AS median,
                  percentile_cont(0.95) WITHIN GROUP (ORDER BY o.pm2_5) AS p95
           FROM observations o JOIN cities c ON c.id = o.city_id
           WHERE o.pm2_5 IS NOT NULL
           GROUP BY c.key, c.name ORDER BY c.key"""
    )
    for r in rows:
        for k in ("mean", "std", "min", "max", "median", "p95"):
            r[k] = rnd(r[k])
    return rows


@router.get("/monthly")
def monthly():
    """PM2.5 by calendar month (1 = January) for each city: shows seasonality."""
    rows = query(
        """SELECT c.key AS city_key, EXTRACT(MONTH FROM o.obs_date)::int AS month,
                  AVG(o.pm2_5) AS mean,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY o.pm2_5) AS median,
                  percentile_cont(0.9) WITHIN GROUP (ORDER BY o.pm2_5) AS p90
           FROM observations o JOIN cities c ON c.id = o.city_id
           WHERE o.pm2_5 IS NOT NULL
           GROUP BY c.key, month ORDER BY c.key, month"""
    )
    for r in rows:
        for k in ("mean", "median", "p90"):
            r[k] = rnd(r[k])
    return rows


@router.get("/bands")
def bands():
    """Share of days in each PM2.5 band, per city."""
    rows = query(
        """SELECT c.key AS city_key, COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE o.pm2_5 < 15) AS good,
                  COUNT(*) FILTER (WHERE o.pm2_5 >= 15 AND o.pm2_5 < 35) AS moderate,
                  COUNT(*) FILTER (WHERE o.pm2_5 >= 35 AND o.pm2_5 < 55) AS poor,
                  COUNT(*) FILTER (WHERE o.pm2_5 >= 55) AS very_poor
           FROM observations o JOIN cities c ON c.id = o.city_id
           WHERE o.pm2_5 IS NOT NULL
           GROUP BY c.key ORDER BY c.key"""
    )
    cities = []
    for r in rows:
        t = r["total"]
        cities.append({
            "city_key": r["city_key"], "days": t,
            "share_pct": {
                "Good": rnd(100 * r["good"] / t, 1),
                "Moderate": rnd(100 * r["moderate"] / t, 1),
                "Poor": rnd(100 * r["poor"] / t, 1),
                "Very poor": rnd(100 * r["very_poor"] / t, 1),
            },
        })
    return {"bands": BANDS, "cities": cities}


@router.get("/correlations")
def correlations():
    """Correlation of each of today's measurements with TOMORROW's PM2.5.
    The pm2_5 row is how well 'today predicts tomorrow'."""
    cols = ", ".join(FEATURES)
    corr = ", ".join(f"corr({f}, next_pm) AS {f}" for f in FEATURES)
    rows = query(
        f"""WITH x AS (
              SELECT city_id, obs_date, {cols},
                     LEAD(pm2_5) OVER w AS next_pm, LEAD(obs_date) OVER w AS next_date
              FROM observations
              WINDOW w AS (PARTITION BY city_id ORDER BY obs_date))
            SELECT c.key AS city_key, {corr}
            FROM x JOIN cities c ON c.id = x.city_id
            WHERE next_date = obs_date + 1 AND next_pm IS NOT NULL
            GROUP BY c.key ORDER BY c.key"""
    )
    return [
        {"city_key": r["city_key"],
         "correlations": [{"feature": f, "r": rnd(r[f], 3)} for f in FEATURES]}
        for r in rows
    ]


@router.get("/test-window")
def test_window():
    """Is the test period different from the training period? Compares average
    PM2.5 before and after each city's test start date (from model_results)."""
    rows = query(
        """SELECT r.city_key, r.test_start,
                  AVG(o.pm2_5) FILTER (WHERE o.obs_date < r.test_start) AS train_mean,
                  AVG(o.pm2_5) FILTER (WHERE o.obs_date >= r.test_start) AS test_mean,
                  percentile_cont(0.9) WITHIN GROUP (ORDER BY o.pm2_5)
                      FILTER (WHERE o.obs_date < r.test_start) AS train_p90,
                  percentile_cont(0.9) WITHIN GROUP (ORDER BY o.pm2_5)
                      FILTER (WHERE o.obs_date >= r.test_start) AS test_p90
           FROM model_results r
           JOIN cities c ON c.key = r.city_key
           JOIN observations o ON o.city_id = c.id
           WHERE o.pm2_5 IS NOT NULL
           GROUP BY r.city_key, r.test_start ORDER BY r.city_key"""
    )
    for r in rows:
        for k in ("train_mean", "test_mean", "train_p90", "test_p90"):
            r[k] = rnd(r[k])
    return rows