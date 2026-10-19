"""AirSense IoT gateway.

Polls a public Sensor.Community sensor pair near Johannesburg and forwards
each reading to the AirSense API (POST /iot/readings).
"""
import os
import time
from datetime import datetime, timezone

import requests

API_URL = os.environ.get("API_URL", "http://backend:8000")
API_KEY = os.environ.get("IOT_API_KEY", "")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "300"))

# device_key -> the two public sensor ids (particle sensor, weather sensor)
DEVICES = {"sc-81150": {"particle": 81150, "weather": 81151}}
FEED = "https://data.sensor.community/airrohr/v1/sensor/{}/"


def latest_values(records):
    """Return ({value_type: float}, newest_timestamp_str) from a feed."""
    values, newest = {}, None
    for rec in records:
        ts = rec.get("timestamp")
        if newest is None or (ts and ts > newest):
            newest = ts
    for rec in records:
        if rec.get("timestamp") != newest:
            continue
        for item in rec.get("sensordatavalues", []):
            try:
                values[item["value_type"]] = float(item["value"])
            except (KeyError, ValueError, TypeError):
                pass
    return values, newest


def build_payload(device_key, particle_records, weather_records):
    p, p_ts = latest_values(particle_records)
    w, w_ts = latest_values(weather_records)
    stamps = [t for t in (p_ts, w_ts) if t]
    if not stamps or "P2" not in p:
        return None
    reading_time = datetime.strptime(max(stamps), "%Y-%m-%d %H:%M:%S").replace(
        tzinfo=timezone.utc
    )
    return {
        "device_key": device_key,
        "reading_time": reading_time.isoformat(),
        "pm2_5": p.get("P2"),
        "pm10": p.get("P1"),
        "temperature": w.get("temperature"),
        "humidity": w.get("humidity"),
        "pressure": round(w["pressure"] / 100, 1) if "pressure" in w else None,
    }


def fetch(sensor_id):
    r = requests.get(FEED.format(sensor_id), timeout=20)
    r.raise_for_status()
    return r.json()


def wait_for_api():
    while True:
        try:
            if requests.get(f"{API_URL}/health", timeout=5).ok:
                return
        except requests.RequestException:
            pass
        print("Waiting for API...", flush=True)
        time.sleep(3)


def main():
    wait_for_api()
    while True:
        for key, ids in DEVICES.items():
            try:
                payload = build_payload(key, fetch(ids["particle"]), fetch(ids["weather"]))
                if payload is None:
                    print(f"{key}: no usable data", flush=True)
                    continue
                r = requests.post(
                    f"{API_URL}/iot/readings",
                    json=payload,
                    headers={"X-API-Key": API_KEY},
                    timeout=20,
                )
                print(f"{key}: sent {payload['reading_time']} -> {r.status_code}", flush=True)
            except Exception as e:  # keep the gateway alive
                print(f"{key}: error {e}", flush=True)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()