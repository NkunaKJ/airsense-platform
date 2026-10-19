"""AirSense SIMULATED devices (clearly labelled as simulated in the database).

Each simulated device takes the current regional estimate for its city from
Open-Meteo and adds small random sensor-style noise, then sends it to the
AirSense API exactly like a real device would. These are NOT real sensors.
"""
import os
import random
import time
from datetime import datetime, timezone

import requests

API_URL = os.environ.get("API_URL", "http://backend:8000")
API_KEY = os.environ.get("IOT_API_KEY", "")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "300"))

DEVICES = {
    "sim-capetown": (-33.92, 18.42),
    "sim-durban": (-29.86, 31.02),
    "sim-emalahleni": (-25.87, 29.23),
}
AQ = "https://air-quality-api.open-meteo.com/v1/air-quality"
WX = "https://api.open-meteo.com/v1/forecast"


def noisy(value, pct, rng):
    if value is None:
        return None
    return round(value * (1 + rng.uniform(-pct, pct)), 2)


def build_payload(device_key, aq_current, wx_current, rng):
    if aq_current.get("pm2_5") is None:
        return None
    t = datetime.fromisoformat(aq_current["time"]).replace(tzinfo=timezone.utc)
    return {
        "device_key": device_key,
        "reading_time": t.isoformat(),
        "pm2_5": noisy(aq_current.get("pm2_5"), 0.10, rng),
        "pm10": noisy(aq_current.get("pm10"), 0.10, rng),
        "temperature": noisy(wx_current.get("temperature_2m"), 0.03, rng),
        "humidity": noisy(wx_current.get("relative_humidity_2m"), 0.05, rng),
        "pressure": noisy(wx_current.get("surface_pressure"), 0.002, rng),
    }


def get_current(url, lat, lon, fields):
    r = requests.get(
        url,
        params={"latitude": lat, "longitude": lon, "current": fields, "timezone": "GMT"},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["current"]


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
    rng = random.Random()
    wait_for_api()
    while True:
        for key, (lat, lon) in DEVICES.items():
            try:
                aq = get_current(AQ, lat, lon, "pm2_5,pm10")
                wx = get_current(WX, lat, lon, "temperature_2m,relative_humidity_2m,surface_pressure")
                payload = build_payload(key, aq, wx, rng)
                if payload is None:
                    print(f"{key}: no data", flush=True)
                    continue
                r = requests.post(
                    f"{API_URL}/iot/readings",
                    json=payload,
                    headers={"X-API-Key": API_KEY},
                    timeout=20,
                )
                print(f"{key}: SIMULATED reading {payload['reading_time']} -> {r.status_code}", flush=True)
            except Exception as e:
                print(f"{key}: error {e}", flush=True)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()