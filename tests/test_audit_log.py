import json

import pytest
from fastapi.testclient import TestClient

from test_api_auth import load_api, token

import audit_log  # noqa: E402  (api/ ditambahkan ke sys.path oleh test_api_auth)


@pytest.fixture
def setup(monkeypatch):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    written = []

    async def fake_write(entry):
        written.append(entry)

    async def fake_read(**filters):
        return [{"id": 1, "at": "2026-11-13T00:00:00+00:00", "actor": "auth0|uji", "role": "super_admin",
                 "action": "POST /api/v1/fktp-antrol-sync", "target": "/api/v1/fktp-antrol-sync", "status": 200, "ip": "10.0.0.0"}]

    monkeypatch.setattr(audit_log, "write_entry", fake_write)
    monkeypatch.setattr(audit_log, "read_entries", fake_read)
    monkeypatch.setattr(api, "fetch_fktp_antrol_dfs", lambda **k: __import__("polars").DataFrame())

    def client_for(roles):
        claims = {} if roles is None else {api.ROLES_CLAIM: roles}
        headers = {"Authorization": f"Bearer {token(api, **claims)}", "X-Forwarded-For": "203.0.113.77, 10.1.1.1"}
        return TestClient(api.app, raise_server_exceptions=False), headers

    return api, written, client_for


def test_admin_action_is_recorded_without_email_or_token(setup):
    api, written, client_for = setup
    client, headers = client_for(["super_admin"])
    assert client.post("/api/v1/fktp-antrol-sync", headers=headers).status_code == 200
    assert len(written) == 1
    entry = written[0]
    assert entry["actor"] == "auth0|ceo" and entry["role"] == "super_admin"
    assert entry["action"] == "POST /api/v1/fktp-antrol-sync" and entry["status"] == 200
    assert entry["ip"] == "203.0.113.0"
    blob = json.dumps(entry)
    assert "Bearer" not in blob and "@" not in blob


@pytest.mark.parametrize("roles,expected", [(None, 403), (["viewer"], 403)])
def test_refused_access_is_recorded(setup, roles, expected):
    api, written, client_for = setup
    client, headers = client_for(roles)
    assert client.post("/api/v1/fktp-antrol-sync", headers=headers).status_code == expected
    assert written and written[-1]["status"] == expected and written[-1]["role"] in ("", "viewer")


def test_missing_login_is_recorded(setup):
    api, written, _ = setup
    TestClient(api.app).get("/api/v1/fkrtl-kepatuhan/ringkasan")
    assert written and written[-1]["status"] == 401 and written[-1]["actor"] == ""


def test_ordinary_dashboard_views_are_not_recorded(setup):
    api, written, client_for = setup
    client, headers = client_for(["viewer"])
    client.get("/api/v1/fktp-antrol-stats", headers=headers)
    assert written == []


@pytest.mark.parametrize("roles,expected", [(["viewer"], 403), (["admin"], 403), (["super_admin"], 200)])
def test_audit_log_page_is_super_admin_only(setup, roles, expected):
    api, written, client_for = setup
    client, headers = client_for(roles)
    response = client.get("/api/v1/audit-log", headers=headers)
    assert response.status_code == expected
    if expected == 200:
        assert response.json()["entries"][0]["action"] == "POST /api/v1/fktp-antrol-sync"


def test_audit_log_cannot_be_changed_through_the_api(setup):
    api, _, client_for = setup
    client, headers = client_for(["super_admin"])
    for method in ("put", "patch", "delete"):
        assert getattr(client, method)("/api/v1/audit-log", headers=headers).status_code == 405


def test_table_is_append_only_in_the_schema():
    sql = audit_log.SCHEMA_SQL
    assert "BEFORE UPDATE OR DELETE ON audit_log" in sql
    assert "BEFORE TRUNCATE ON audit_log" in sql


def test_database_failure_does_not_break_the_request(setup, monkeypatch):
    api, _, client_for = setup

    async def broken(entry):
        raise RuntimeError("db mati")

    monkeypatch.setattr(audit_log, "write_entry", broken)
    client, headers = client_for(["super_admin"])
    assert client.post("/api/v1/fktp-antrol-sync", headers=headers).status_code == 200
