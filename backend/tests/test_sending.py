"""Automated tests for sending a saved forecast (TC-25 to TC-33).

Email is tested against a small mail server that runs inside the test (nothing leaves the
computer). SMS runs in demo mode, so it is tested by checking the text it builds.
"""
import socket
from datetime import datetime, timedelta

import pytest
from aiosmtpd.controller import Controller
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.accounts as A
from tests.test_accounts import FORECAST, PASSWORD, clean

EMAIL = "test-send@example.com"


class Inbox:
    def __init__(self):
        self.messages = []

    async def handle_DATA(self, server, session, envelope):
        self.messages.append(envelope)
        return "250 OK"


@pytest.fixture(scope="module")
def inbox():
    box = Inbox()
    with socket.socket() as probe:  # ask the system for a free port
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    ctl = Controller(box, hostname="127.0.0.1", port=port)
    ctl.start()
    yield box, port
    ctl.stop()


@pytest.fixture(scope="module")
def client():
    A.ensure_tables()
    app = FastAPI()
    app.include_router(A.router)
    clean()
    yield TestClient(app)
    clean()


@pytest.fixture()
def saved(client):
    A._sent.clear()
    client.post("/auth/register", json={"name": "Sender", "email": EMAIL, "password": PASSWORD})
    token = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    sid = client.post("/saved", json=FORECAST, headers=headers).json()["id"]
    yield headers, sid
    clean()


def configure(monkeypatch, port):
    monkeypatch.setenv("SMTP_HOST", "127.0.0.1")
    monkeypatch.setenv("SMTP_PORT", str(port))
    monkeypatch.setenv("SMTP_USER", "airsense@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "x")
    monkeypatch.setenv("SMTP_SECURITY", "none")


def test_tc25_status_reports_email_setup(client, monkeypatch):
    for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"):
        monkeypatch.delenv(k, raising=False)
    assert client.get("/notify/status").json() == {"email": False, "sms": "demo"}
    configure(monkeypatch, 1)
    assert client.get("/notify/status").json()["email"] is True


def test_tc26_email_is_sent_to_the_account_address(client, saved, inbox, monkeypatch):
    box, port = inbox
    configure(monkeypatch, port)
    headers, sid = saved
    r = client.post(f"/saved/{sid}/send", json={"channel": "email"}, headers=headers)
    assert r.status_code == 200 and r.json()["to"] == EMAIL
    sent = box.messages[-1]
    assert sent.rcpt_tos == [EMAIL]
    body = sent.content.decode()
    assert "22.7" in body and "Moderate" in body and "school run" in body


def test_tc27_email_without_mail_settings_runs_in_demo_mode(client, saved, monkeypatch):
    for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"):
        monkeypatch.delenv(k, raising=False)
    headers, sid = saved
    r = client.post(f"/saved/{sid}/send", json={"channel": "email"}, headers=headers)
    out = r.json()
    assert r.status_code == 200 and out["mode"] == "demo" and out["to"] == EMAIL
    assert "22.7" in out["text"] and "Moderate" in out["subject"]


def test_tc28_mail_server_down_is_handled(client, saved, monkeypatch):
    configure(monkeypatch, 1)  # nothing listens on port 1
    headers, sid = saved
    r = client.post(f"/saved/{sid}/send", json={"channel": "email"}, headers=headers)
    assert r.status_code == 502 and "could not send" in r.json()["detail"]


@pytest.mark.parametrize("raw", ["082 123 4567", "0821234567", "+27821234567", "27 82 123 4567", "082-123-4567"])
def test_tc29_sms_demo_accepts_south_african_numbers(client, saved, raw):
    headers, sid = saved
    r = client.post(f"/saved/{sid}/send", json={"channel": "sms", "phone": raw}, headers=headers)
    assert r.status_code == 200
    out = r.json()
    assert out["mode"] == "demo" and out["to"] == "+27821234567"
    assert len(out["text"]) <= 160 and "23 ug/m3" in out["text"] and "Moderate" in out["text"]


@pytest.mark.parametrize("raw", ["", "12345", "0111234567", "+1 555 123 4567", "abc"])
def test_tc30_sms_rejects_bad_numbers(client, saved, raw):
    headers, sid = saved
    r = client.post(f"/saved/{sid}/send", json={"channel": "sms", "phone": raw}, headers=headers)
    assert r.status_code == 422


def test_tc31_long_note_keeps_sms_within_160_characters(client, saved):
    headers, sid = saved
    client.patch(f"/saved/{sid}", json={"note": "x" * 300}, headers=headers)
    r = client.post(f"/saved/{sid}/send", json={"channel": "sms", "phone": "0821234567"}, headers=headers)
    assert len(r.json()["text"]) <= 160


def test_tc32_cannot_send_someone_elses_forecast(client, saved):
    headers, sid = saved
    client.post("/auth/register", json={"name": "Other", "email": "test-other@example.com", "password": PASSWORD})
    tok = client.post("/auth/login", json={"email": "test-other@example.com", "password": PASSWORD}).json()["token"]
    r = client.post(f"/saved/{sid}/send", json={"channel": "sms", "phone": "0821234567"}, headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 404


def test_tc33_sending_needs_login_and_is_rate_limited(client, saved):
    headers, sid = saved
    assert client.post(f"/saved/{sid}/send", json={"channel": "sms", "phone": "0821234567"}).status_code == 401
    codes = [client.post(f"/saved/{sid}/send", json={"channel": "sms", "phone": "0821234567"}, headers=headers).status_code for _ in range(A.SEND_LIMIT + 1)]
    assert codes[:-1] == [200] * A.SEND_LIMIT and codes[-1] == 429


# ---- phone reminder (calendar file) ----

def tomorrow():
    return str(datetime.now(A.SAST).date() + timedelta(days=1))


@pytest.fixture()
def future(client, saved):
    headers, _ = saved
    body = {**FORECAST, "predicts_for_date": tomorrow(), "based_on_date": str(datetime.now(A.SAST).date())}
    return headers, client.post("/saved", json=body, headers=headers).json()["id"]


def test_tc34_reminder_file_has_an_alarm_at_the_chosen_time(client, future):
    headers, sid = future
    r = client.get(f"/saved/{sid}/reminder?time=07:30", headers=headers)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    ics = r.text
    day = tomorrow().replace("-", "")
    assert ics.startswith("BEGIN:VCALENDAR") and "BEGIN:VALARM" in ics and "TRIGGER:PT0S" in ics
    assert f"DTSTART:{day}T053000Z" in ics  # 07:30 in South Africa (UTC+2) is 05:30 UTC
    assert "school run" in ics and ics.count("\r\n") > 10


@pytest.mark.parametrize("bad", ["7am", "25:00", "", "07:60"])
def test_tc35_reminder_needs_a_valid_time(client, future, bad):
    headers, sid = future
    assert client.get(f"/saved/{sid}/reminder?time={bad}", headers=headers).status_code == 422


def test_tc36_reminder_for_a_past_day_is_refused(client, saved):
    headers, sid = saved  # this forecast is for a day in the past
    assert client.get(f"/saved/{sid}/reminder?time=07:00", headers=headers).status_code == 422
    r = client.post(f"/saved/{sid}/send", json={"channel": "email", "reminder_time": "07:00"}, headers=headers)
    assert r.status_code == 422 and "already passed" in r.json()["detail"]


def test_tc37_email_carries_the_reminder_as_an_attachment(client, future, inbox, monkeypatch):
    box, port = inbox
    configure(monkeypatch, port)
    headers, sid = future
    r = client.post(f"/saved/{sid}/send", json={"channel": "email", "reminder_time": "07:00"}, headers=headers)
    assert r.status_code == 200 and r.json()["reminder_time"] == "07:00"
    raw = box.messages[-1].content.decode()
    assert "airsense-reminder.ics" in raw and "text/calendar" in raw


def test_tc38_cannot_download_someone_elses_reminder(client, future):
    headers, sid = future
    client.post("/auth/register", json={"name": "Other", "email": "test-other@example.com", "password": PASSWORD})
    tok = client.post("/auth/login", json={"email": "test-other@example.com", "password": PASSWORD}).json()["token"]
    assert client.get(f"/saved/{sid}/reminder?time=07:00", headers={"Authorization": f"Bearer {tok}"}).status_code == 404
    assert client.get(f"/saved/{sid}/reminder?time=07:00").status_code == 401
