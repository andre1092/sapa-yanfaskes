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
    ("get", "/api/v1/ssbi-jadwal/status", "admin"),
    ("post", "/api/v1/ssbi-jadwal/periksa", "admin"),
    ("post", "/api/v1/ssbi-jadwal/integrasikan", "admin"),
    ("post", "/api/v1/auth/send-verification-email", "super_admin"),
]


# Flag login BFF dibaca saat index diimpor, jadi setiap tes memuat ulang modul dengan flag 0 dan 1:
# matriks izin jalur Bearer harus sama di kedua mode.
@pytest.fixture(params=["0", "1"], ids=["bff0", "bff1"])
def api(monkeypatch, request):
    module = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com", SAPA_LOGIN_BFF=request.param)
    assert module.LOGIN_BFF is (request.param == "1")
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
    assert call(api, "get", "/api/v1/ssbi-jadwal/status", roles).status_code not in (401, 403)


@pytest.mark.parametrize("claims", [{"role": "super_admin"}, {"roles": ["super_admin"]}, {"https://sapa-yanfaskes.com/roles": "super_admin"}])
def test_roles_outside_the_trusted_claim_are_ignored(api, claims):
    headers = {"Authorization": f"Bearer {token(api, **claims)}"}
    assert TestClient(api.app).get("/api/v1/fkrtl-kepatuhan/ringkasan", headers=headers).status_code == 403


def test_no_token_is_still_401(api):
    assert TestClient(api.app).get("/api/v1/fkrtl-kepatuhan/ringkasan").status_code == 401


@pytest.mark.parametrize("path", ["/api/v1/fkrtl-antrol-sync", "/api/v1/fkrtl-kepatuhan-sync", "/api/v1/fktp-antrol-sync"])
def test_old_sync_endpoints_are_gone(api, path):
    for method in ("get", "post"):
        assert call(api, method, path, ["super_admin"]).status_code == 404


def test_every_data_route_requires_a_role(api):
    guarded = {"require_viewer", "require_admin", "require_super_admin", "require_viewer_fktp", "require_fkrtl_export", "require_signed_in", "require_ssbi_unduh", "require_sk_lihat"}
    # /api/v1/verifikasi-manusia dipanggil di tengah login, sebelum ada token SAPA. Penjaganya
    # session_token bertanda tangan dari Action Auth0 (tes di test_verifikasi_manusia.py).
    # /api/v1/auth/mode hanya menjawab mode login ({"bff": bool}) dan dibaca sebelum pengguna masuk.
    open_routes = {"/", "/api", "/api/index.py", "/api/v1/health", "/health", "/api/v2/tenants/{tenant_id}/Users",
                   "/api/v1/verifikasi-manusia", "/api/v1/auth/mode"}
    # Login satu halaman (hanya ada bila SAPA_LOGIN_BFF=1) memang terbuka sebelum masuk; penjaganya sendiri
    # diuji di test_auth_bff.py: /masuk (CSRF, Turnstile, pembatas), /sesi (hanya status sesi pemanggil),
    # /keluar (CSRF, hanya sesi pemanggil), /siap (rincian hanya untuk Super Admin).
    rute_bff = {"/api/v1/auth/masuk", "/api/v1/auth/sesi", "/api/v1/auth/keluar", "/api/v1/auth/siap"}
    semua = list(_api_routes(api.app.routes))
    paths = {route.path for route in semua}
    # Rute dari router yang di-include harus ikut diperiksa (FastAPI baru membungkusnya, bukan meratakan).
    if api.LOGIN_BFF:
        assert rute_bff <= paths
    else:
        assert not rute_bff & paths
    for route in semua:
        if route.path in open_routes or (api.LOGIN_BFF and route.path in rute_bff):
            continue
        names = {dep.call.__name__ for dep in route.dependant.dependencies if dep.call}
        assert names & guarded, f"{sorted(route.methods)} {route.path} tidak memeriksa peran"


def _api_routes(routes):
    """Semua APIRoute, termasuk yang berada di dalam router yang di-include."""
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
        elif getattr(route, "original_router", None) is not None:
            yield from _api_routes(route.original_router.routes)
        elif getattr(route, "routes", None):
            yield from _api_routes(route.routes)


def test_refused_requests_do_not_leak_details(api):
    body = call(api, "get", "/api/v1/ssbi-jadwal/status", ["viewer"]).json()
    assert body == {"detail": "Akun Anda tidak memiliki izin untuk tindakan ini"}
