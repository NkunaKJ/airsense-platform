import os
import secrets
from datetime import datetime

import psycopg
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/iot", tags=["iot"])

DATABASE_URL = os.environ["DATABASE_URL"]
IOT_API_KEY = os.environ.get("IOT_API_KEY", "")


class Reading(BaseModel):
    device_key: str
    reading_time: datetime
    pm2_5: float | None = None
    pm10: float | None = None
    temperature: float | None = None
    humidity: float | None = None
    pressure: float | None = None


@router.post("/readings")
def add_reading(r: Reading, x_api_key: str | None = Header(default=None)):
    if not IOT_API_KEY or not x_api_key or not secrets.compare_digest(x_api_key, IOT_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    with psycopg.connect(DATABASE_URL) as conn:
        dev = conn.execute(
            "SELECT id FROM devices WHERE device_key = %s", (r.device_key,)
        ).fetchone()
        if dev is None:
            raise HTTPException(status_code=404, detail="Unknown device")
        row = conn.execute(
            """INSERT INTO sensor_readings
               (device_id, reading_time, pm2_5, pm10, temperature, humidity, pressure)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (device_id, reading_time) DO NOTHING
               RETURNING id""",
            (dev[0], r.reading_time, r.pm2_5, r.pm10, r.temperature, r.humidity, r.pressure),
        ).fetchone()
    return {"stored": row is not None}


@router.get("/latest")
def latest_readings():
    with psycopg.connect(DATABASE_URL) as conn:
        rows = conn.execute(
            """SELECT DISTINCT ON (d.id) d.device_key, d.label, d.is_simulated,
                      s.reading_time, s.pm2_5, s.pm10, s.temperature, s.humidity, s.pressure
               FROM devices d
               LEFT JOIN sensor_readings s ON s.device_id = d.id
               ORDER BY d.id, s.reading_time DESC"""
        ).fetchall()
    keys = ["device_key", "label", "is_simulated", "reading_time",
            "pm2_5", "pm10", "temperature", "humidity", "pressure"]
    return [dict(zip(keys, r)) for r in rows]


@router.get("/history")
def history(hours: int = Query(24, ge=1, le=168)):
    """Readings from every device over the last N hours (feeds the Sensors page chart)."""
    with psycopg.connect(DATABASE_URL) as conn:
        rows = conn.execute(
            """SELECT d.device_key, d.label, d.is_simulated,
                      s.reading_time, s.pm2_5, s.temperature, s.humidity
               FROM sensor_readings s JOIN devices d ON d.id = s.device_id
               WHERE s.reading_time >= now() - make_interval(hours => %s)
               ORDER BY d.id, s.reading_time""",
            (hours,),
        ).fetchall()
    devices = {}
    for key, label, sim, t, pm, temp, hum in rows:
        dev = devices.setdefault(
            key, {"device_key": key, "label": label, "is_simulated": sim, "points": []}
        )
        dev["points"].append({"time": t.isoformat(), "pm2_5": pm, "temperature": temp, "humidity": hum})
    return {"hours": hours, "devices": list(devices.values())}