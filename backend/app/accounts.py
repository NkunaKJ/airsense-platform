"""Accounts and saved forecasts for AirSense.

Visitors can look at everything. A registered user can also save forecasts, edit the
note on a saved forecast, delete it, and download the list as a CSV file.

Security choices (kept simple on purpose, and explained in the report):
- Passwords are never stored. Only a salted scrypt hash is kept.
- Logging in creates a random session token. Only a SHA-256 hash of the token is stored,
  so a copy of the database cannot be used to sign in. Logging out deletes the session.
- Every saved forecast belongs to one user, and a user can only see or change their own.
"""
import csv
import hashlib
import hmac
import io
import os
import logging
import re
import secrets
import smtplib
import time
from email.message import EmailMessage
from datetime import date, datetime, timedelta, timezone

import psycopg
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

DATABASE_URL = os.environ["DATABASE_URL"]
SESSION_DAYS = 7
BANDS = ("Good", "Moderate", "Poor", "Very poor")
SOURCES = ("live", "day", "manual")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

log = logging.getLogger("airsense.accounts")
router = APIRouter(tags=["accounts"])

DDL = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_forecasts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    city_id INTEGER NOT NULL REFERENCES cities (id),
    source TEXT NOT NULL CHECK (source IN ('live', 'day', 'manual')),
    based_on_date DATE NOT NULL,
    predicts_for_date DATE NOT NULL,
    predicted_pm2_5 DOUBLE PRECISION NOT NULL CHECK (predicted_pm2_5 >= 0),
    band TEXT NOT NULL CHECK (band IN ('Good', 'Moderate', 'Poor', 'Very poor')),
    typical_error DOUBLE PRECISION NOT NULL CHECK (typical_error >= 0),
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_forecasts_user_idx ON saved_forecasts (user_id, created_at DESC);
"""


def get_conn():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def ensure_tables():
    """Create the account tables if they are missing (safe to run on every start)."""
    with get_conn() as conn:
        conn.execute(DDL)


# ---------- passwords and sessions ----------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except ValueError:
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user(authorization: str | None = Header(default=None)) -> dict:
    """The signed-in user, or a 401 error."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Please log in.")
    token = authorization[7:].strip()
    with get_conn() as conn:
        user = conn.execute(
            """SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = %s AND s.expires_at > now()""",
            (token_hash(token),),
        ).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Your session has ended. Please log in again.")
    return user


# ---------- request shapes ----------

class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class SaveIn(BaseModel):
    city: str
    source: str
    based_on_date: date
    predicts_for_date: date
    predicted_pm2_5: float = Field(ge=0, le=1000)
    band: str
    typical_error: float = Field(ge=0, le=1000)
    note: str = Field(default="", max_length=300)


class NoteIn(BaseModel):
    note: str = Field(max_length=300)


# ---------- accounts ----------

def _new_session(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (%s, %s, %s)",
        (token_hash(token), user_id, datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)),
    )
    return token


@router.post("/auth/register", status_code=201)
def register(body: RegisterIn):
    email = body.email.strip().lower()
    name = body.name.strip()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    if not name:
        raise HTTPException(status_code=422, detail="Enter your name.")
    with get_conn() as conn:  # one transaction: the user and the first session are saved together
        try:
            user = conn.execute(
                "INSERT INTO users (email, name, password_hash) VALUES (%s, %s, %s) RETURNING id, email, name",
                (email, name, hash_password(body.password)),
            ).fetchone()
        except psycopg.errors.UniqueViolation:
            raise HTTPException(status_code=409, detail="An account with that email already exists. Try logging in.")
        token = _new_session(conn, user["id"])
    return {"token": token, "user": {"name": user["name"], "email": user["email"]}}


@router.post("/auth/login")
def login(body: LoginIn):
    email = body.email.strip().lower()
    with get_conn() as conn:
        user = conn.execute("SELECT id, email, name, password_hash FROM users WHERE email = %s", (email,)).fetchone()
        # The same message for "no such email" and "wrong password", so the page does not reveal which emails exist.
        if user is None or not check_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="That email and password do not match.")
        conn.execute("DELETE FROM sessions WHERE expires_at < now()")
        token = _new_session(conn, user["id"])
    return {"token": token, "user": {"name": user["name"], "email": user["email"]}}


@router.post("/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.lower().startswith("bearer "):
        with get_conn() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = %s", (token_hash(authorization[7:].strip()),))
    return {"ok": True}


@router.get("/auth/me")
def me(user: dict = Depends(current_user)):
    return {"name": user["name"], "email": user["email"]}


# ---------- saved forecasts ----------

SELECT_SAVED = """
    SELECT f.id, c.key AS city, c.name AS city_name, f.source, f.based_on_date, f.predicts_for_date,
           f.predicted_pm2_5, f.band, f.typical_error, f.note, f.created_at
    FROM saved_forecasts f JOIN cities c ON c.id = f.city_id
"""


def _row(r: dict) -> dict:
    return {
        "id": r["id"],
        "city": r["city"],
        "city_name": r["city_name"],
        "source": r["source"],
        "based_on_date": r["based_on_date"].isoformat(),
        "predicts_for_date": r["predicts_for_date"].isoformat(),
        "predicted_pm2_5": round(r["predicted_pm2_5"], 1),
        "band": r["band"],
        "typical_error": round(r["typical_error"], 1),
        "note": r["note"],
        "saved_at": r["created_at"].isoformat(),
    }


@router.post("/saved", status_code=201)
def save_forecast(body: SaveIn, user: dict = Depends(current_user)):
    if body.source not in SOURCES:
        raise HTTPException(status_code=422, detail="Unknown forecast source.")
    if body.band not in BANDS:
        raise HTTPException(status_code=422, detail="Unknown air quality band.")
    with get_conn() as conn:
        city = conn.execute("SELECT id FROM cities WHERE key = %s", (body.city,)).fetchone()
        if city is None:
            raise HTTPException(status_code=422, detail="Unknown city.")
        new = conn.execute(
            """INSERT INTO saved_forecasts
               (user_id, city_id, source, based_on_date, predicts_for_date, predicted_pm2_5, band, typical_error, note)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (user["id"], city["id"], body.source, body.based_on_date, body.predicts_for_date,
             body.predicted_pm2_5, body.band, body.typical_error, body.note.strip()),
        ).fetchone()
        row = conn.execute(SELECT_SAVED + " WHERE f.id = %s", (new["id"],)).fetchone()
    return _row(row)


@router.get("/saved")
def list_saved(user: dict = Depends(current_user)):
    with get_conn() as conn:
        rows = conn.execute(
            SELECT_SAVED + " WHERE f.user_id = %s ORDER BY f.created_at DESC, f.id DESC", (user["id"],)
        ).fetchall()
    return [_row(r) for r in rows]


@router.get("/saved/export")
def export_saved(user: dict = Depends(current_user)):
    """The user's saved forecasts as a CSV file (one of the system's reports)."""
    with get_conn() as conn:
        rows = conn.execute(
            SELECT_SAVED + " WHERE f.user_id = %s ORDER BY f.created_at DESC, f.id DESC", (user["id"],)
        ).fetchall()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["City", "Method", "Based on", "Forecast for", "PM2.5 (ug/m3)", "Air quality", "Typical error", "Note", "Saved at"])
    for r in rows:
        x = _row(r)
        w.writerow([x["city_name"], x["source"], x["based_on_date"], x["predicts_for_date"],
                    x["predicted_pm2_5"], x["band"], x["typical_error"], x["note"], x["saved_at"]])
    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="airsense-saved-forecasts.csv"'},
    )


@router.patch("/saved/{saved_id}")
def update_note(saved_id: int, body: NoteIn, user: dict = Depends(current_user)):
    with get_conn() as conn:
        updated = conn.execute(
            "UPDATE saved_forecasts SET note = %s WHERE id = %s AND user_id = %s RETURNING id",
            (body.note.strip(), saved_id, user["id"]),
        ).fetchone()
        if updated is None:
            raise HTTPException(status_code=404, detail="That saved forecast was not found.")
        row = conn.execute(SELECT_SAVED + " WHERE f.id = %s", (saved_id,)).fetchone()
    return _row(row)


@router.delete("/saved/{saved_id}")
def delete_saved(saved_id: int, user: dict = Depends(current_user)):
    with get_conn() as conn:
        deleted = conn.execute(
            "DELETE FROM saved_forecasts WHERE id = %s AND user_id = %s RETURNING id", (saved_id, user["id"])
        ).fetchone()
    if deleted is None:
        raise HTTPException(status_code=404, detail="That saved forecast was not found.")
    return {"deleted": saved_id}


# ---------- sending a saved forecast (email, or SMS in demo mode) ----------
#
# Email goes through an SMTP account set in environment variables (see the README). Until one is
# set, email runs in demo mode like SMS: the exact message is built and shown, and nothing is sent.
# Email is only ever sent to the address of the signed-in account, so the page cannot be used to
# send mail to strangers. SMS is always demo mode: it checks the number and builds the text that
# would be sent, but sends nothing and does not keep the number.
# A phone reminder is a calendar file (.ics): attached to the email, or downloaded for SMS.
# Opening it on a phone adds an alarm to the calendar app.

SEND_LIMIT = 10          # messages per user per hour
_sent: dict[int, list[float]] = {}
PHONE_RE = re.compile(r"^\+27[6-8]\d{8}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
SAST = timezone(timedelta(hours=2))  # South Africa has no daylight saving


def mail_settings() -> dict | None:
    host, user, password = os.environ.get("SMTP_HOST"), os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASSWORD")
    if not (host and user and password):
        return None
    return {
        "host": host,
        "port": int(os.environ.get("SMTP_PORT", "587")),
        "user": user,
        "password": password,
        "sender": os.environ.get("MAIL_FROM", user),
        "security": os.environ.get("SMTP_SECURITY", "starttls").lower(),  # starttls, ssl or none
    }


def normalise_phone(raw: str) -> str | None:
    """A South African mobile number in +27 form, or None if it is not one."""
    digits = re.sub(r"[ \-()]", "", raw)
    if digits.startswith("0") and len(digits) == 10:
        digits = "+27" + digits[1:]
    elif digits.startswith("27") and len(digits) == 11:
        digits = "+" + digits
    return digits if PHONE_RE.match(digits) else None


def _day(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b %Y')}"


def email_text(f: dict) -> tuple[str, str]:
    x = _row(f)
    subject = f"AirSense: {x['city_name']} on {_day(x['predicts_for_date'])}, {round(x['predicted_pm2_5'])} µg/m³ ({x['band']})"
    lines = [
        f"Your saved AirSense forecast for {x['city_name']}",
        "",
        f"Forecast for:   {_day(x['predicts_for_date'])}",
        f"PM2.5:          {x['predicted_pm2_5']} µg/m³ ({x['band']})",
        f"Typical error:  about {x['typical_error']} µg/m³",
        f"Based on:       {_day(x['based_on_date'])}",
    ]
    if x["note"]:
        lines.append(f"Your note:      {x['note']}")
    lines += [
        "",
        "This is a regional model estimate on a grid of about 45 km, not a reading from a station on your street.",
        "Sent from AirSense because you asked for a copy.",
    ]
    return subject, "\n".join(lines)


def sms_text(f: dict) -> str:
    x = _row(f)
    d = date.fromisoformat(x["predicts_for_date"])
    text = f"AirSense {x['city_name']} {d.strftime('%a')} {d.day} {d.strftime('%b')}: {round(x['predicted_pm2_5'])} ug/m3 PM2.5, {x['band']} (off by ~{round(x['typical_error'])})."
    if x["note"]:
        text += f" Note: {x['note']}"
    return text if len(text) <= 160 else text[:157] + "..."


def _ics_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def reminder_ics(f: dict, hhmm: str) -> str:
    """A calendar file with one event and an alarm at the chosen South African time on the forecast day."""
    x = _row(f)
    day = date.fromisoformat(x["predicts_for_date"])
    start_local = datetime(day.year, day.month, day.day, int(hhmm[:2]), int(hhmm[3:]), tzinfo=SAST)
    start, end = (start_local + timedelta(minutes=d) for d in (0, 30))
    fmt = lambda t: t.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    desc = f"AirSense forecast for {x['city_name']}: {round(x['predicted_pm2_5'])} ug/m3 PM2.5 ({x['band']}), typically off by about {round(x['typical_error'])}."
    if x["note"]:
        desc += f" Your note: {x['note']}"
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AirSense//Saved forecast//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:airsense-saved-{x['id']}-{hhmm.replace(':', '')}@airsense",
        f"DTSTAMP:{fmt(datetime.now(timezone.utc))}",
        f"DTSTART:{fmt(start)}", f"DTEND:{fmt(end)}",
        f"SUMMARY:{_ics_escape('AirSense: check the air in ' + x['city_name'] + ' (' + x['band'] + ')')}",
        f"DESCRIPTION:{_ics_escape(desc)}",
        "BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{_ics_escape('AirSense: ' + x['city_name'] + ' is ' + x['band'])}", "TRIGGER:PT0S", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"


def _check_reminder(f: dict, hhmm: str) -> None:
    if not TIME_RE.match(hhmm):
        raise HTTPException(status_code=422, detail="Choose a time for the reminder.")
    if f["predicts_for_date"] < datetime.now(SAST).date():
        raise HTTPException(status_code=422, detail="That forecast is for a day that has already passed, so a reminder would not help.")


class SendIn(BaseModel):
    channel: str
    phone: str = Field(default="", max_length=40)
    reminder_time: str = Field(default="", max_length=5)  # "" for no reminder, or "07:00"


@router.get("/notify/status")
def notify_status():
    """Tells the pages which ways of sending are available."""
    return {"email": mail_settings() is not None, "sms": "demo"}


@router.post("/saved/{saved_id}/send")
def send_saved(saved_id: int, body: SendIn, user: dict = Depends(current_user)):
    if body.channel not in ("email", "sms"):
        raise HTTPException(status_code=422, detail="Choose email or SMS.")
    phone = None
    if body.channel == "sms":
        phone = normalise_phone(body.phone)
        if phone is None:
            raise HTTPException(status_code=422, detail="Enter a South African mobile number, for example 082 123 4567.")

    now = time.time()
    recent = [t for t in _sent.get(user["id"], []) if now - t < 3600]
    if len(recent) >= SEND_LIMIT:
        raise HTTPException(status_code=429, detail="You have sent a lot of messages. Please try again in an hour.")

    with get_conn() as conn:
        row = conn.execute(SELECT_SAVED + " WHERE f.id = %s AND f.user_id = %s", (saved_id, user["id"])).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="That saved forecast was not found.")

    if body.reminder_time:
        _check_reminder(row, body.reminder_time)

    if body.channel == "sms":
        _sent[user["id"]] = recent + [now]
        return {"channel": "sms", "mode": "demo", "to": phone, "text": sms_text(row)}

    subject, text = email_text(row)
    cfg = mail_settings()
    if cfg is None:  # demo mode: show the message instead of sending it
        _sent[user["id"]] = recent + [now]
        return {"channel": "email", "mode": "demo", "to": user["email"], "subject": subject, "text": text,
                "reminder_time": body.reminder_time or None}

    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, cfg["sender"], user["email"]
    msg.set_content(text)
    if body.reminder_time:
        msg.add_attachment(reminder_ics(row, body.reminder_time).encode(), maintype="text", subtype="calendar",
                           filename="airsense-reminder.ics")
    try:
        if cfg["security"] == "ssl":
            server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=15)
        else:
            server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=15)
        with server:
            if cfg["security"] == "starttls":
                server.starttls()
            if cfg["security"] != "none":
                server.login(cfg["user"], cfg["password"])
            server.send_message(msg)
    except (smtplib.SMTPException, OSError):
        log.exception("Could not send the email")
        raise HTTPException(status_code=502, detail="We could not send the email just now. Please try again later.")
    _sent[user["id"]] = recent + [now]
    return {"channel": "email", "mode": "sent", "to": user["email"], "reminder_time": body.reminder_time or None}


@router.get("/saved/{saved_id}/reminder")
def download_reminder(saved_id: int, time: str = "07:00", user: dict = Depends(current_user)):
    """The reminder as a calendar file (.ics) to open on a phone."""
    with get_conn() as conn:
        row = conn.execute(SELECT_SAVED + " WHERE f.id = %s AND f.user_id = %s", (saved_id, user["id"])).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="That saved forecast was not found.")
    _check_reminder(row, time)
    return Response(
        content=reminder_ics(row, time),
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="airsense-reminder.ics"'},
    )