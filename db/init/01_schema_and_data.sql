-- Cities
CREATE TABLE cities (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL
);

INSERT INTO cities (key, name, latitude, longitude) VALUES
    ('johannesburg', 'Johannesburg', -26.2041, 28.0473),
    ('capetown', 'Cape Town', -33.9249, 18.4241),
    ('durban', 'Durban', -29.8587, 31.0218),
    ('emalahleni', 'Emalahleni', -25.8771, 29.2332);

-- One row per city per day
CREATE TABLE observations (
    id BIGSERIAL PRIMARY KEY,
    city_id INTEGER NOT NULL REFERENCES cities (id),
    obs_date DATE NOT NULL,
    pm2_5 DOUBLE PRECISION,
    pm10 DOUBLE PRECISION,
    nitrogen_dioxide DOUBLE PRECISION,
    ozone DOUBLE PRECISION,
    temperature_2m DOUBLE PRECISION,
    relative_humidity_2m DOUBLE PRECISION,
    wind_speed_10m DOUBLE PRECISION,
    precipitation DOUBLE PRECISION,
    surface_pressure DOUBLE PRECISION,
    UNIQUE (city_id, obs_date)
);

-- Temporary table that receives each CSV file before it is copied across
CREATE TEMP TABLE staging (
    ts TEXT,
    pm2_5 DOUBLE PRECISION,
    pm10 DOUBLE PRECISION,
    nitrogen_dioxide DOUBLE PRECISION,
    ozone DOUBLE PRECISION,
    temperature_2m DOUBLE PRECISION,
    relative_humidity_2m DOUBLE PRECISION,
    wind_speed_10m DOUBLE PRECISION,
    precipitation DOUBLE PRECISION,
    surface_pressure DOUBLE PRECISION
);

-- Johannesburg
COPY staging FROM '/data/johannesburg_air_quality.csv' WITH (FORMAT csv, HEADER true);
INSERT INTO observations (city_id, obs_date, pm2_5, pm10, nitrogen_dioxide, ozone,
    temperature_2m, relative_humidity_2m, wind_speed_10m, precipitation, surface_pressure)
SELECT (SELECT id FROM cities WHERE key = 'johannesburg'), to_date(left(ts, 10), 'YYYY-MM-DD'),
    pm2_5, pm10, nitrogen_dioxide, ozone, temperature_2m, relative_humidity_2m,
    wind_speed_10m, precipitation, surface_pressure
FROM staging;
TRUNCATE staging;

-- Cape Town
COPY staging FROM '/data/capetown_air_quality.csv' WITH (FORMAT csv, HEADER true);
INSERT INTO observations (city_id, obs_date, pm2_5, pm10, nitrogen_dioxide, ozone,
    temperature_2m, relative_humidity_2m, wind_speed_10m, precipitation, surface_pressure)
SELECT (SELECT id FROM cities WHERE key = 'capetown'), to_date(left(ts, 10), 'YYYY-MM-DD'),
    pm2_5, pm10, nitrogen_dioxide, ozone, temperature_2m, relative_humidity_2m,
    wind_speed_10m, precipitation, surface_pressure
FROM staging;
TRUNCATE staging;

-- Durban
COPY staging FROM '/data/durban_air_quality.csv' WITH (FORMAT csv, HEADER true);
INSERT INTO observations (city_id, obs_date, pm2_5, pm10, nitrogen_dioxide, ozone,
    temperature_2m, relative_humidity_2m, wind_speed_10m, precipitation, surface_pressure)
SELECT (SELECT id FROM cities WHERE key = 'durban'), to_date(left(ts, 10), 'YYYY-MM-DD'),
    pm2_5, pm10, nitrogen_dioxide, ozone, temperature_2m, relative_humidity_2m,
    wind_speed_10m, precipitation, surface_pressure
FROM staging;
TRUNCATE staging;

-- Emalahleni
COPY staging FROM '/data/emalahleni_air_quality.csv' WITH (FORMAT csv, HEADER true);
INSERT INTO observations (city_id, obs_date, pm2_5, pm10, nitrogen_dioxide, ozone,
    temperature_2m, relative_humidity_2m, wind_speed_10m, precipitation, surface_pressure)
SELECT (SELECT id FROM cities WHERE key = 'emalahleni'), to_date(left(ts, 10), 'YYYY-MM-DD'),
    pm2_5, pm10, nitrogen_dioxide, ozone, temperature_2m, relative_humidity_2m,
    wind_speed_10m, precipitation, surface_pressure
FROM staging;
TRUNCATE staging;