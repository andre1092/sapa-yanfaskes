import importlib
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def load_api(monkeypatch, **env):
    for name in ("AUTH0_DOMAIN", "SAPA_DEV_AUTH_BYPASS", "VERCEL_ENV", "SCIM_BEARER_TOKEN", "SMTP_HOST"):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    sys.modules.pop("index", None)
    api = importlib.import_module("index")
    if api.jwk_client:
        # Kunci uji menggantikan JWKS Auth0 agar tes tidak memakai jaringan.
        monkeypatch.setattr(api.jwk_client, "get_signing_key_from_jwt", lambda token: SimpleNamespace(key=KEY.public_key()))
    return api


def token(api, **claims):
    payload = {"sub": "auth0|ceo", "aud": api.AUTH0_API_AUDIENCE, "iss": f"https://{api.AUTH0_DOMAIN}/", "exp": int(time.time()) + 300, **claims}
    return jwt.encode(payload, KEY, algorithm="RS256")


def request_with(header):
    return SimpleNamespace(headers={"Authorization": header} if header else {})


@pytest.mark.parametrize("header", [None, "", "Bearer ", "Bearer undefined", "Bearer null", "Basic abc"])
def test_missing_token_is_rejected(monkeypatch, header):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    with pytest.raises(api.HTTPException) as err:
        api.require_auth(request_with(header))
    assert err.value.status_code == 401


def test_valid_token_returns_its_claims(monkeypatch):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    assert api.require_auth(request_with(f"Bearer {token(api)}"))["sub"] == "auth0|ceo"


@pytest.mark.parametrize("claims", [{"aud": "https://other.example"}, {"iss": "https://evil.example/"}, {"exp": int(time.time()) - 10}])
def test_wrong_or_expired_token_is_rejected_without_details(monkeypatch, claims):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    with pytest.raises(api.HTTPException) as err:
        api.require_auth(request_with(f"Bearer {token(api, **claims)}"))
    assert err.value.status_code == 401
    assert "Expected" not in err.value.detail and "auth0.com" not in err.value.detail


def test_forged_token_signed_by_another_key_is_rejected(monkeypatch):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode({"sub": "x", "aud": api.AUTH0_API_AUDIENCE, "iss": f"https://{api.AUTH0_DOMAIN}/", "exp": int(time.time()) + 60}, other, algorithm="RS256")
    with pytest.raises(api.HTTPException) as err:
        api.require_auth(request_with(f"Bearer {forged}"))
    assert err.value.status_code == 401


def test_missing_auth0_config_fails_closed(monkeypatch):
    api = load_api(monkeypatch)
    with pytest.raises(api.HTTPException) as err:
        api.require_auth(request_with("Bearer something"))
    assert err.value.status_code == 503


def test_dev_bypass_is_refused_on_vercel(monkeypatch):
    assert load_api(monkeypatch, SAPA_DEV_AUTH_BYPASS="1").require_auth(request_with(None))["sub"] == "local-dev"
    api = load_api(monkeypatch, SAPA_DEV_AUTH_BYPASS="1", VERCEL_ENV="production")
    with pytest.raises(api.HTTPException):
        api.require_auth(request_with(None))


def test_protected_endpoints_answer_401_over_http(monkeypatch):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    client = TestClient(api.app)
    for path in ("/api/v1/dashboard-stats", "/api/v1/fkrtl-kepatuhan/nakes", "/api/v1/fktp-antrol-stats", "/api/v1/monitoring-laras"):
        assert client.get(path).status_code == 401, path
    assert client.get("/api/v1/health").status_code == 200


def test_cors_no_longer_reflects_any_origin(monkeypatch):
    client = TestClient(load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com").app)
    evil = client.get("/api/v1/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in evil.headers
    own = client.get("/api/v1/health", headers={"Origin": "https://sapa-yanfaskes.vercel.app"})
    assert own.headers["access-control-allow-origin"] == "https://sapa-yanfaskes.vercel.app"
    assert "access-control-allow-credentials" not in own.headers


def test_scim_requires_its_own_token(monkeypatch):
    client = TestClient(load_api(monkeypatch).app)
    assert client.post("/api/v2/tenants/t1/Users", json={"userName": "a@b.co"}).status_code == 503
    client = TestClient(load_api(monkeypatch, SCIM_BEARER_TOKEN="scim-secret-value").app)
    assert client.post("/api/v2/tenants/t1/Users", json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_verification_email_requires_login_and_own_link(monkeypatch):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    client = TestClient(api.app)
    body = {"to_email": "admin@rs.co.id", "name": "<b>Admin</b>", "verification_url": "https://sapa-yanfaskes.vercel.app/verify?x=1"}
    assert client.post("/api/v1/auth/send-verification-email", json=body).status_code == 401
    auth = {"Authorization": f"Bearer {token(api)}"}
    ok = client.post("/api/v1/auth/send-verification-email", json=body, headers=auth)
    assert ok.status_code == 200 and ok.json()["verification_url"] == body["verification_url"]
    for link in ("https://evil.example/verify", "https://sapa-yanfaskes.vercel.app.evil.example/x", "javascript:alert(1)"):
        assert client.post("/api/v1/auth/send-verification-email", json={**body, "verification_url": link}, headers=auth).status_code == 400, link
    assert client.post("/api/v1/auth/send-verification-email", json={**body, "to_email": "a@b.co>\nBcc: x@y.z"}, headers=auth).status_code == 400
