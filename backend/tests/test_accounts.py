"""Automated tests for accounts and saved forecasts (see the test plan: TC-01 to TC-24).

They run against the real database, create their own throwaway users (emails that start
with "test-"), and delete them afterwards. Run them with:
    docker compose exec backend python -m pytest tests -v
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.accounts import ensure_tables, get_conn, router

EMAIL_A = "test-a@example.com"
EMAIL_B = "test-b@example.com"
PASSWORD = "password123"

FORECAST = {
    "city": "johannesburg",
    "source": "live",
    "based_on_date": "2026-10-16",
    "predicts_for_date": "2026-10-17",
    "predicted_pm2_5": 22.7,
    "band": "Moderate",
    "typical_error": 11.8,
    "note": "  school run  ",
}


def city_name(key="johannesburg"):
    with get_conn() as conn:
        return conn.execute("SELECT name FROM cities WHERE key = %s", (key,)).fetchone()["name"]


def clean():
    with get_conn() as conn:
        conn.execute("DELETE FROM users WHERE email LIKE 'test-%'")


@pytest.fixture(scope="module")
def client():
    ensure_tables()
    app = FastAPI()
    app.include_router(router)
    clean()
    yield TestClient(app)
    clean()


def register(client, email=EMAIL_A, name="Test A", password=PASSWORD):
    return client.post("/auth/register", json={"name": name, "email": email, "password": password})


def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def user_a(client):
    r = register(client)
    assert r.status_code == 201  # TC-01 register a new user
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_b(client):
    return register(client, EMAIL_B, "Test B").json()["token"]


def test_tc02_duplicate_email_is_refused(client, user_a):
    assert register(client, EMAIL_A.upper()).status_code == 409


def test_tc03_short_password_is_refused(client):
    assert register(client, "test-c@example.com", password="short").status_code == 422


def test_tc04_bad_email_is_refused(client):
    assert register(client, "not-an-email").status_code == 422


def test_tc05_password_is_stored_as_a_hash(client, user_a):
    with get_conn() as conn:
        stored = conn.execute("SELECT password_hash FROM users WHERE email = %s", (EMAIL_A,)).fetchone()["password_hash"]
    assert stored.startswith("scrypt$") and PASSWORD not in stored


def test_tc06_login_with_correct_password(client, user_a):
    r = client.post("/auth/login", json={"email": EMAIL_A, "password": PASSWORD})
    assert r.status_code == 200 and r.json()["user"]["email"] == EMAIL_A


def test_tc07_login_with_wrong_password(client, user_a):
    assert client.post("/auth/login", json={"email": EMAIL_A, "password": "wrong-password"}).status_code == 401


def test_tc08_wrong_password_and_unknown_email_look_the_same(client, user_a):
    wrong = client.post("/auth/login", json={"email": EMAIL_A, "password": "wrong-password"})
    unknown = client.post("/auth/login", json={"email": "test-nobody@example.com", "password": PASSWORD})
    assert wrong.json() == unknown.json()


def test_tc09_session_token_is_stored_hashed(client, user_a):
    with get_conn() as conn:
        n = conn.execute("SELECT count(*) AS n FROM sessions WHERE token_hash = %s", (user_a,)).fetchone()["n"]
    assert n == 0


def test_tc10_me_needs_a_token(client):
    assert client.get("/auth/me").status_code == 401


def test_tc11_me_returns_the_user(client, user_a):
    assert client.get("/auth/me", headers=headers(user_a)).json()["email"] == EMAIL_A


def test_tc12_save_requires_login(client):
    assert client.post("/saved", json=FORECAST).status_code == 401


def test_tc13_save_a_forecast(client, user_a):
    r = client.post("/saved", json=FORECAST, headers=headers(user_a))
    assert r.status_code == 201
    assert r.json()["city_name"] == city_name() and r.json()["note"] == "school run"


@pytest.mark.parametrize(
    "change",
    [{"band": "Awful"}, {"city": "mars"}, {"predicted_pm2_5": -3}, {"source": "guess"}],
    ids=["bad-band", "bad-city", "negative-pm", "bad-source"],
)
def test_tc14_invalid_forecasts_are_refused(client, user_a, change):  # TC-14 (four cases)
    assert client.post("/saved", json={**FORECAST, **change}, headers=headers(user_a)).status_code in (422,)


def test_tc15_list_shows_own_forecasts(client, user_a):
    r = client.get("/saved", headers=headers(user_a))
    assert r.status_code == 200 and len(r.json()) >= 1


def test_tc16_edit_a_note(client, user_a):
    sid = client.get("/saved", headers=headers(user_a)).json()[0]["id"]
    r = client.patch(f"/saved/{sid}", json={"note": "updated note"}, headers=headers(user_a))
    assert r.status_code == 200 and r.json()["note"] == "updated note"


def test_tc17_export_is_a_csv_file(client, user_a):
    r = client.get("/saved/export", headers=headers(user_a))
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert r.text.splitlines()[0].startswith("City,Method") and city_name() in r.text


def test_tc18_another_user_sees_nothing(client, user_a, user_b):
    assert client.get("/saved", headers=headers(user_b)).json() == []


def test_tc19_another_user_cannot_edit(client, user_a, user_b):
    sid = client.get("/saved", headers=headers(user_a)).json()[0]["id"]
    assert client.patch(f"/saved/{sid}", json={"note": "hack"}, headers=headers(user_b)).status_code == 404


def test_tc20_another_user_cannot_delete(client, user_a, user_b):
    sid = client.get("/saved", headers=headers(user_a)).json()[0]["id"]
    assert client.delete(f"/saved/{sid}", headers=headers(user_b)).status_code == 404


def test_tc21_delete_own_forecast(client, user_a):
    sid = client.get("/saved", headers=headers(user_a)).json()[0]["id"]
    assert client.delete(f"/saved/{sid}", headers=headers(user_a)).status_code == 200
    assert client.delete(f"/saved/{sid}", headers=headers(user_a)).status_code == 404


def test_tc22_note_too_long_is_refused(client, user_a):
    assert client.post("/saved", json={**FORECAST, "note": "x" * 301}, headers=headers(user_a)).status_code == 422


def test_tc23_logout_ends_only_that_session(client, user_a):
    second = client.post("/auth/login", json={"email": EMAIL_A, "password": PASSWORD}).json()["token"]
    assert client.post("/auth/logout", headers=headers(second)).status_code == 200
    assert client.get("/auth/me", headers=headers(second)).status_code == 401
    assert client.get("/auth/me", headers=headers(user_a)).status_code == 200


def test_tc24_deleting_a_user_removes_their_data(client, user_a):
    client.post("/saved", json=FORECAST, headers=headers(user_a))
    with get_conn() as conn:
        uid = conn.execute("SELECT id FROM users WHERE email = %s", (EMAIL_A,)).fetchone()["id"]
        conn.execute("DELETE FROM users WHERE id = %s", (uid,))
        left = conn.execute("SELECT count(*) AS n FROM saved_forecasts WHERE user_id = %s", (uid,)).fetchone()["n"]
        sessions = conn.execute("SELECT count(*) AS n FROM sessions WHERE user_id = %s", (uid,)).fetchone()["n"]
    assert left == 0 and sessions == 0
