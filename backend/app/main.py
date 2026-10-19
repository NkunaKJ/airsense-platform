import os

import psycopg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row
from app.iot import router as iot_router
from app.models_api import router as models_router
from app.eda import router as eda_router
from app.predict import router as predict_router
from app.advice import router as advice_router

DATABASE_URL = os.environ["DATABASE_URL"]

app = FastAPI(title="AirSense API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


@app.get("/health")
def health():
    with get_conn() as conn:
        conn.execute("SELECT 1")
    return {"status": "ok"}


@app.get("/cities")
def cities():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT key, name, latitude, longitude FROM cities ORDER BY name"
        ).fetchall()
    return rows


@app.get("/cities/{city_key}/history")
def history(city_key: str, days: int = Query(60, ge=1, le=2000)):
    with get_conn() as conn:
        city = conn.execute(
            "SELECT id, name FROM cities WHERE key = %s", (city_key,)
        ).fetchone()
        if city is None:
            raise HTTPException(status_code=404, detail="Unknown city")
        rows = conn.execute(
            """
            SELECT obs_date, pm2_5 FROM observations
            WHERE city_id = %s AND pm2_5 IS NOT NULL
            ORDER BY obs_date DESC LIMIT %s
            """,
            (city["id"], days),
        ).fetchall()
    rows.reverse()
    return {
        "city": city["name"],
        "points": [
            {"date": r["obs_date"].isoformat(), "pm2_5": round(r["pm2_5"], 1)}
            for r in rows
        ],
    }
app.include_router(iot_router)
app.include_router(models_router)
app.include_router(eda_router)
app.include_router(predict_router)
app.include_router(advice_router)