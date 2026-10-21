-- AirSense: accounts and saved forecasts.
-- Runs automatically on a new, empty database, after 01_schema_and_data.sql has created "cities".
-- The back end also runs these same statements when it starts (CREATE TABLE IF NOT EXISTS),
-- so an existing database gets the tables without being rebuilt.

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,                      -- scrypt hash; the password itself is never stored
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,                      -- SHA-256 of the session token; the token itself is never stored
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_forecasts (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    city_id           INTEGER NOT NULL REFERENCES cities (id),
    source            TEXT NOT NULL CHECK (source IN ('live', 'day', 'manual')),
    based_on_date     DATE NOT NULL,
    predicts_for_date DATE NOT NULL,
    predicted_pm2_5   DOUBLE PRECISION NOT NULL CHECK (predicted_pm2_5 >= 0),
    band              TEXT NOT NULL CHECK (band IN ('Good', 'Moderate', 'Poor', 'Very poor')),
    typical_error     DOUBLE PRECISION NOT NULL CHECK (typical_error >= 0),
    note              TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_forecasts_user_idx ON saved_forecasts (user_id, created_at DESC);
