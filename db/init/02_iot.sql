CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    device_key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    city_id INTEGER REFERENCES cities(id),
    is_simulated BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE sensor_readings (
    id BIGSERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(id),
    reading_time TIMESTAMPTZ NOT NULL,
    pm2_5 DOUBLE PRECISION,
    pm10 DOUBLE PRECISION,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    pressure DOUBLE PRECISION,
    UNIQUE (device_id, reading_time)
);

INSERT INTO devices (device_key, label, city_id, is_simulated)
SELECT 'sc-81150', 'Sensor.Community 81150 (real public sensor)', id, FALSE
FROM cities WHERE key = 'johannesburg';