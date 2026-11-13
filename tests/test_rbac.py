import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from test_api_auth import load_api, token

ROLES = {
    "tanpa_peran": None,
    "viewer": ["viewer"],
    "admin": ["admin"],
    "super_admin": ["super_admin"],
}
RANK = {"tanpa_peran": 0, "viewer": 1, "admin": 2, "super_admin": 3}
VERIFY_BODY = {"to_email": "uji@example.com", "verification_url": "https://sapa-yanfaskes.vercel.app"}

# (metode, alamat, peran minimum) sesuai matriks yang disetujui CEO 2026-11-13.
MATRIX = [
    ("get", "/api/v1/fkrtl-antrol-stats", "viewer"),
    ("get", "/api/v1/dashboard-stats", "viewer"),
    *[("get", f"/api/v1/fkrtl-kepatuhan/{name}", "viewer")
      for name in ("nakes", "pengaduan", "umabl", "umbal", "display-tt", "ringkasan", "tmo", "antrean-wtl", "surkon", "rme")],
    ("get", "/api/v1/fktp-antrol-stats", "viewer"),
    ("get", "/api/v1/monitoring-laras", "viewer"),
    ("get", "/api/v1/fkrtl-export?type=faskes", "admin"),
    ("get", "/api/v1/fkrtl-antrol-stats?refresh=true", "admin"),
    ("get", "/api/v1/fktp-antrol-stats?refresh=true", "admin"),
    ("get", "/api/v1/monitoring-laras?refresh=true", "admin"),
    ("post", "/api/v1/fkrtl-antrol-sync", "admin"),
    ("post", "/api/v1/fkrtl-kepatuhan-sync", "admin"),
    ("post", "/api/v1/fktp-antrol-sync", "admin"),
    ("post", "/api/v1/auth/send-verification-email", "super_admin"),
]


@pytest.fixture
def api(monkeypatch):
    module = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    for name in ("GCP_SA_CREDENTIALS_BASE64", "GCP_SA_CREDENTIALS_JSON"):
        monkeypatch.delenv(name, raising=False)
    return module


def call(api, method, path, roles):
    claims = {} if roles is None else {api.ROLES_CLAIM: roles}
    headers = {"Authorization": f"Bearer {token(api, **claims)}"}
    client = TestClient(api.app, raise_server_exceptions=False)
    if method == "post":
        return client.post(path, headers=headers, json=VERIFY_BODY if "verification" in path else None)
    return client.get(path, headers=headers)


@pytest.mark.parametrize("method,path,minimum", MATRIX)
@pytest.mark.parametrize("role", ROLES)
def test_each_endpoint_follows_the_approved_matrix(api, method, path, minimum, role):
    status = call(api, method, path, ROLES[role]).status_code
    if RANK[role] >= RANK[minimum]:
        assert status not in (401, 403), (role, path, status)
    else:
        assert status == 403, (role, path, status)


@pytest.mark.parametrize("roles", [["Super Admin"], ["Admin", "viewer"], ["owner", "super_admin"]])
def test_role_names_from_auth0_are_recognised(api, roles):
    assert call(api, "post", "/api/v1/fkrtl-antrol-sync", roles).status_code not in (401, 403)


@pytest.mark.parametrize("claims", [{"role": "super_admin"}, {"roles": ["super_admin"]}, {"https://sapa-yanfaskes.com/roles": "super_admin"}])
def test_roles_outside_the_trusted_claim_are_ignored(api, claims):
    headers = {"Authorization": f"Bearer {token(api, **claims)}"}
    assert TestClient(api.app).get("/api/v1/fkrtl-kepatuhan/ringkasan", headers=headers).status_code == 403


def test_no_token_is_still_401(api):
    assert TestClient(api.app).get("/api/v1/fkrtl-kepatuhan/ringkasan").status_code == 401


@pytest.mark.parametrize("path", ["/api/v1/fkrtl-antrol-sync", "/api/v1/fkrtl-kepatuhan-sync", "/api/v1/fktp-antrol-sync"])
def test_sync_no_longer_accepts_get(api, path):
    assert call(api, "get", path, ["super_admin"]).status_code == 405


def test_every_data_route_requires_a_role(api):
    guarded = {"require_viewer", "require_admin", "require_super_admin", "require_viewer_fktp", "require_fkrtl_export", "require_signed_in"}
    open_routes = {"/", "/api", "/api/index.py", "/api/v1/health", "/health", "/api/v2/tenants/{tenant_id}/Users"}
    for route in api.app.routes:
        if not isinstance(route, APIRoute) or route.path in open_routes:
            continue
        names = {dep.call.__name__ for dep in route.dependant.dependencies if dep.call}
        assert names & guarded, f"{sorted(route.methods)} {route.path} tidak memeriksa peran"


def test_refused_requests_do_not_leak_details(api):
    body = call(api, "post", "/api/v1/fkrtl-antrol-sync", ["viewer"]).json()
    assert body == {"detail": "Akun Anda tidak memiliki izin untuk tindakan ini"}
