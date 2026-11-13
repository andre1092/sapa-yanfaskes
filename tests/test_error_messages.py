import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from test_api_auth import load_api, token

SECRET = "rahasia-internal /srv/sapa token=abc123"


@pytest.fixture
def client_api(monkeypatch):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")

    def boom(*args, **kwargs):
        raise RuntimeError(SECRET)

    for name in ("process_ringkasan_kepatuhan", "fetch_multiple_sheets", "fetch_fktp_antrol_dfs", "clear_kepatuhan_cache", "fetch_csv_records"):
        monkeypatch.setattr(api, name, boom)
    headers = {"Authorization": f"Bearer {token(api, **{api.ROLES_CLAIM: ['super_admin']})}"}
    return TestClient(api.app, raise_server_exceptions=False), headers


@pytest.mark.parametrize("method,path", [
    ("get", "/api/v1/fkrtl-kepatuhan/ringkasan"),
    ("get", "/api/v1/fkrtl-kepatuhan/nakes"),
    ("get", "/api/v1/fkrtl-antrol-stats"),
    ("get", "/api/v1/fkrtl-export?type=faskes"),
    ("get", "/api/v1/fktp-antrol-stats"),
    ("post", "/api/v1/fkrtl-antrol-sync"),
    ("post", "/api/v1/fkrtl-kepatuhan-sync"),
    ("post", "/api/v1/fktp-antrol-sync"),
])
def test_internal_errors_are_not_shown_to_users(client_api, method, path):
    client, headers = client_api
    response = getattr(client, method)(path, headers=headers)
    assert response.status_code >= 500
    assert SECRET not in response.text and "RuntimeError" not in response.text


def test_no_exception_text_in_http_errors_in_source():
    root = Path(__file__).resolve().parents[1] / "api"
    pattern = re.compile(r"detail\s*=\s*(f[\"'][^\"']*\{(str\()?(e|exc)\)?\}|str\((e|exc)\))")
    for name in ("index.py", "db.py"):
        assert not pattern.search((root / name).read_text(encoding="utf-8")), name
