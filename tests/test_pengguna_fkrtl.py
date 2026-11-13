"""Akun petugas RS: peran Petugas RS, wajib ganti sandi, dan pengelolaan oleh Super Admin.

Semua panggilan ke Auth0 Management API diganti klien palsu; tes tidak memakai jaringan.
"""

import re

import pytest
from fastapi.testclient import TestClient

from test_api_auth import load_api, token

REF = [
    {"kode_ppk": "0114R001", "nama_ppk": "RSD dr Soebandi", "kabupaten": "Jember", "kelas_ppk": "B"},
    {"kode_ppk": "0211R002", "nama_ppk": "RS Bhayangkara Bondowoso", "kabupaten": "Bondowoso", "kelas_ppk": "C"},
]


class FakeAuth0:
    """Meniru Management API secukupnya dan mencatat setiap panggilan."""

    def __init__(self):
        self.calls = []
        self.users = {
            "auth0|petugas": {"user_id": "auth0|petugas", "name": "Petugas Soebandi", "email": "petugas@rs.test", "blocked": False,
                              "app_metadata": {"sapa_peran": "petugas_rs", "kode_ppk": "0114R001", "wajib_ganti_sandi": False}},
            "auth0|ceo": {"user_id": "auth0|ceo", "name": "CEO", "email": "ceo@test", "app_metadata": {}},
        }

    def request(self, method, path, json=None, params=None):
        self.calls.append((method, path, json))
        if method == "GET" and path == "/api/v2/users":
            return [u for u in self.users.values() if u["app_metadata"].get("sapa_peran") == "petugas_rs"]
        if method == "POST" and path == "/api/v2/users":
            user = {"user_id": "auth0|baru", "name": json["name"], "email": json["email"], "blocked": False, "app_metadata": json["app_metadata"]}
            self.users[user["user_id"]] = user
            return user
        match = re.fullmatch(r"/api/v2/users/([^/]+)", path)
        if match:
            from urllib.parse import unquote
            user = self.users.get(unquote(match[1]))
            if user is None:
                raise LookupError("tidak ada")
            if method == "PATCH":
                user.update({k: v for k, v in json.items() if k not in ("password", "connection", "app_metadata")})
                user["app_metadata"].update(json.get("app_metadata", {}))
            return user
        return {}

    def send_change_password_email(self, email):
        self.calls.append(("EMAIL", email, None))


@pytest.fixture
def api(monkeypatch):
    module = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com", AUTH0_ROLE_PETUGAS_RS_ID="rol_petugas")
    for name in ("GCP_SA_CREDENTIALS_BASE64", "GCP_SA_CREDENTIALS_JSON"):
        monkeypatch.delenv(name, raising=False)
    fake = FakeAuth0()
    monkeypatch.setattr(module.pengguna_service, "get_client", lambda: fake)
    module.pengguna_service.lupakan_status()
    monkeypatch.setattr(module, "fetch_csv_records", lambda *args, **kwargs: REF)
    module.fake = fake
    return module


def client():
    return TestClient


def call(api, method, path, roles, sub="auth0|ceo", body=None):
    claims = {} if roles is None else {api.ROLES_CLAIM: roles}
    headers = {"Authorization": f"Bearer {token(api, sub=sub, **claims)}"}
    return TestClient(api.app, raise_server_exceptions=False).request(method, path, headers=headers, json=body)


PETUGAS = ["Petugas RS"]
FKRTL = ["/api/v1/fkrtl-antrol-stats", "/api/v1/dashboard-stats", "/api/v1/monitoring-laras",
         "/api/v1/fkrtl-kepatuhan/ringkasan", "/api/v1/fkrtl-kepatuhan/antrean-wtl", "/api/v1/fkrtl-export?type=faskes"]
TERLARANG = [("GET", "/api/v1/fktp-antrol-stats"), ("GET", "/api/v1/fkrtl-antrol-stats?refresh=true"),
             ("POST", "/api/v1/fkrtl-antrol-sync"), ("POST", "/api/v1/fktp-antrol-sync"), ("GET", "/api/v1/audit-log"),
             ("GET", "/api/v1/pengguna-fkrtl")]


@pytest.mark.parametrize("roles", [PETUGAS, ["petugas_rs"]])
@pytest.mark.parametrize("path", FKRTL)
def test_petugas_rs_boleh_melihat_dan_mengunduh_data_fkrtl(api, roles, path):
    assert call(api, "GET", path, roles, sub="auth0|petugas").status_code not in (401, 403)


@pytest.mark.parametrize("method,path", TERLARANG)
def test_petugas_rs_ditolak_di_fktp_sinkron_dan_administrasi(api, method, path):
    assert call(api, method, path, PETUGAS, sub="auth0|petugas").status_code == 403


def test_viewer_tetap_tidak_boleh_ekspor_tetapi_boleh_fktp(api):
    assert call(api, "GET", "/api/v1/fkrtl-export?type=faskes", ["viewer"]).status_code == 403
    assert call(api, "GET", "/api/v1/fktp-antrol-stats", ["viewer"]).status_code not in (401, 403)


def test_petugas_wajib_ganti_sandi_ditolak_semua_data(api):
    api.fake.users["auth0|petugas"]["app_metadata"]["wajib_ganti_sandi"] = True
    res = call(api, "GET", "/api/v1/fkrtl-antrol-stats", PETUGAS, sub="auth0|petugas")
    assert res.status_code == 403
    assert res.json() == {"detail": api.pengguna_service.PESAN_WAJIB_GANTI}
    assert call(api, "GET", "/api/v1/akun/status", PETUGAS, sub="auth0|petugas").json() == {"wajib_ganti_sandi": True, "petugas_rs": True, "nonaktif": False}


def test_status_akun_peran_lain_tidak_memanggil_auth0(api):
    assert call(api, "GET", "/api/v1/akun/status", ["viewer"]).json() == {"wajib_ganti_sandi": False, "petugas_rs": False, "nonaktif": False}
    assert api.fake.calls == []


@pytest.mark.parametrize("sandi", ["pendek1A!", "tanpaangkasamasekali", "123456789012", ""])
def test_ganti_sandi_menolak_sandi_lemah(api, sandi):
    api.fake.users["auth0|petugas"]["app_metadata"]["wajib_ganti_sandi"] = True
    res = call(api, "POST", "/api/v1/akun/ganti-sandi", PETUGAS, sub="auth0|petugas", body={"sandi_baru": sandi})
    assert res.status_code in (400, 422)
    assert not [c for c in api.fake.calls if c[0] == "PATCH"]


def test_ganti_sandi_berhasil_membuka_akses(api):
    api.fake.users["auth0|petugas"]["app_metadata"]["wajib_ganti_sandi"] = True
    assert call(api, "GET", "/api/v1/fkrtl-antrol-stats", PETUGAS, sub="auth0|petugas").status_code == 403
    res = call(api, "POST", "/api/v1/akun/ganti-sandi", PETUGAS, sub="auth0|petugas", body={"sandi_baru": "SandiBaruKuat2026"})
    assert res.status_code == 200
    patches = [c for c in api.fake.calls if c[0] == "PATCH"]
    assert any(c[2].get("password") == "SandiBaruKuat2026" for c in patches)
    assert api.fake.users["auth0|petugas"]["app_metadata"]["wajib_ganti_sandi"] is False
    assert call(api, "GET", "/api/v1/fkrtl-antrol-stats", PETUGAS, sub="auth0|petugas").status_code not in (401, 403)


def test_ganti_sandi_hanya_untuk_petugas_rs(api):
    assert call(api, "POST", "/api/v1/akun/ganti-sandi", ["viewer"], body={"sandi_baru": "SandiBaruKuat2026"}).status_code == 403


@pytest.mark.parametrize("roles", [["viewer"], ["admin"], PETUGAS])
@pytest.mark.parametrize("method,path", [("GET", "/api/v1/pengguna-fkrtl"), ("POST", "/api/v1/pengguna-fkrtl"),
                                         ("POST", "/api/v1/pengguna-fkrtl/auth0%7Cpetugas/atur-ulang-sandi")])
def test_kelola_pengguna_hanya_super_admin(api, roles, method, path):
    body = {"nama": "A", "email": "a@rs.test", "kode_ppk": "0114R001"} if method == "POST" else None
    assert call(api, method, path, roles, body=body).status_code == 403


def test_daftar_pengguna_dan_faskes(api):
    res = call(api, "GET", "/api/v1/pengguna-fkrtl", ["super_admin"])
    assert res.status_code == 200
    data = res.json()
    assert data["siap"] is True
    assert [p["email"] for p in data["pengguna"]] == ["petugas@rs.test"]
    assert data["pengguna"][0]["faskes"] == {"kode_ppk": "0114R001", "nama_ppk": "RSD dr Soebandi", "kabupaten": "Jember"}
    assert [f["kode_ppk"] for f in data["faskes"]] == ["0211R002", "0114R001"]  # urut nama


def test_buat_pengguna_memberi_sandi_awal_sekali(api):
    res = call(api, "POST", "/api/v1/pengguna-fkrtl", ["super_admin"], body={"nama": "Petugas Bondowoso", "email": "p@rs.test", "kode_ppk": "0211R002"})
    assert res.status_code == 201
    assert res.headers["cache-control"] == "no-store"
    sandi = res.json()["sandi_awal"]
    assert api.pengguna_service.cek_sandi(sandi) is None
    dibuat = next(c for c in api.fake.calls if c[:2] == ("POST", "/api/v2/users"))[2]
    assert dibuat["password"] == sandi
    assert dibuat["app_metadata"] == {"sapa_peran": "petugas_rs", "kode_ppk": "0211R002", "wajib_ganti_sandi": True}
    assert ("POST", "/api/v2/roles/rol_petugas/users", {"users": ["auth0|baru"]}) in api.fake.calls


@pytest.mark.parametrize("body", [{"nama": "A", "email": "bukan-email", "kode_ppk": "0114R001"},
                                  {"nama": "A", "email": "a@rs.test", "kode_ppk": "9999X999"},
                                  {"nama": "", "email": "a@rs.test", "kode_ppk": "0114R001"}])
def test_buat_pengguna_menolak_isian_salah(api, body):
    assert call(api, "POST", "/api/v1/pengguna-fkrtl", ["super_admin"], body=body).status_code in (400, 422)
    assert not [c for c in api.fake.calls if c[:2] == ("POST", "/api/v2/users")]


def test_atur_ulang_sandi_mewajibkan_ganti_lagi(api):
    res = call(api, "POST", "/api/v1/pengguna-fkrtl/auth0%7Cpetugas/atur-ulang-sandi", ["super_admin"])
    assert res.status_code == 200 and res.headers["cache-control"] == "no-store"
    assert api.pengguna_service.cek_sandi(res.json()["sandi_awal"]) is None
    assert api.fake.users["auth0|petugas"]["app_metadata"]["wajib_ganti_sandi"] is True


def test_undangan_dan_nonaktif(api):
    assert call(api, "POST", "/api/v1/pengguna-fkrtl/auth0%7Cpetugas/undangan", ["super_admin"]).status_code == 200
    assert ("EMAIL", "petugas@rs.test", None) in api.fake.calls
    assert call(api, "PATCH", "/api/v1/pengguna-fkrtl/auth0%7Cpetugas", ["super_admin"], body={"aktif": False}).status_code == 200
    assert api.fake.users["auth0|petugas"]["blocked"] is True


def test_akun_bukan_petugas_tidak_bisa_diubah_lewat_menu_ini(api):
    for method, path, body in [("POST", "/api/v1/pengguna-fkrtl/auth0%7Cceo/atur-ulang-sandi", None),
                               ("PATCH", "/api/v1/pengguna-fkrtl/auth0%7Cceo", {"aktif": False}),
                               ("POST", "/api/v1/pengguna-fkrtl/auth0%7Ctidakada/undangan", None)]:
        assert call(api, method, path, ["super_admin"], body=body).status_code == 404
    assert not [c for c in api.fake.calls if c[0] in ("PATCH", "EMAIL")]


def test_belum_dikonfigurasi_memberi_503(api, monkeypatch):
    monkeypatch.setattr(api.pengguna_service, "get_client", lambda: None)
    res = call(api, "GET", "/api/v1/pengguna-fkrtl", ["super_admin"])
    assert res.status_code == 200 and res.json()["siap"] is False
    assert call(api, "POST", "/api/v1/pengguna-fkrtl", ["super_admin"], body={"nama": "A", "email": "a@rs.test", "kode_ppk": "0114R001"}).status_code == 503
    # Tanpa Management API status sandi petugas tidak bisa dicek: akses data ditutup.
    assert call(api, "GET", "/api/v1/fkrtl-antrol-stats", PETUGAS, sub="auth0|petugas").status_code == 503


def test_sandi_awal_acak_dan_kuat(api):
    sandi = {api.pengguna_service.buat_sandi_awal() for _ in range(50)}
    assert len(sandi) == 50
    assert all(api.pengguna_service.cek_sandi(s) is None and len(s) >= 16 for s in sandi)


def test_tindakan_akun_tercatat_di_audit_log(api):
    for path in ("/api/v1/pengguna-fkrtl", "/api/v1/pengguna-fkrtl/auth0|x/atur-ulang-sandi",
                 "/api/v1/pengguna-fkrtl/auth0|x/undangan", "/api/v1/pengguna-fkrtl/auth0|x", "/api/v1/akun/ganti-sandi"):
        assert api.audit_log.should_record("POST", path, 200, ""), path


# --- Temuan review keamanan Agen Clara (2026-11-13) ---
def test_ganti_sandi_ditolak_bila_tidak_wajib_ganti(api):
    # Token curian atau browser yang ditinggal terbuka tidak bisa mengganti sandi lewat SAPA.
    res = call(api, "POST", "/api/v1/akun/ganti-sandi", PETUGAS, sub="auth0|petugas", body={"sandi_baru": "SandiBaruKuat2026"})
    assert res.status_code == 403
    assert not [c for c in api.fake.calls if c[0] == "PATCH"]


def test_ganti_sandi_membaca_status_langsung_dari_auth0(api):
    api.fake.users["auth0|petugas"]["app_metadata"]["wajib_ganti_sandi"] = True
    assert call(api, "GET", "/api/v1/fkrtl-antrol-stats", PETUGAS, sub="auth0|petugas").status_code == 403  # status tersimpan: wajib
    api.fake.users["auth0|petugas"]["app_metadata"]["wajib_ganti_sandi"] = False  # sudah diganti di tempat lain
    res = call(api, "POST", "/api/v1/akun/ganti-sandi", PETUGAS, sub="auth0|petugas", body={"sandi_baru": "SandiBaruKuat2026"})
    assert res.status_code == 403
    assert not [c for c in api.fake.calls if c[0] == "PATCH"]


def test_akun_nonaktif_ditolak_walau_token_masih_berlaku(api):
    api.fake.users["auth0|petugas"]["blocked"] = True
    res = call(api, "GET", "/api/v1/fkrtl-antrol-stats", PETUGAS, sub="auth0|petugas")
    assert res.status_code == 403
    assert res.json() == {"detail": api.pengguna_service.PESAN_NONAKTIF}
    assert call(api, "GET", "/api/v1/akun/status", PETUGAS, sub="auth0|petugas").json() == {"wajib_ganti_sandi": False, "petugas_rs": True, "nonaktif": True}
    api.fake.users["auth0|petugas"]["app_metadata"]["wajib_ganti_sandi"] = True
    assert call(api, "POST", "/api/v1/akun/ganti-sandi", PETUGAS, sub="auth0|petugas", body={"sandi_baru": "SandiBaruKuat2026"}).status_code == 403


def test_nonaktifkan_langsung_berlaku_di_instance_yang_sama(api):
    assert call(api, "GET", "/api/v1/fkrtl-antrol-stats", PETUGAS, sub="auth0|petugas").status_code not in (401, 403)
    assert call(api, "PATCH", "/api/v1/pengguna-fkrtl/auth0%7Cpetugas", ["super_admin"], body={"aktif": False}).status_code == 200
    assert call(api, "GET", "/api/v1/fkrtl-antrol-stats", PETUGAS, sub="auth0|petugas").status_code == 403


def test_atur_ulang_memasang_wajib_ganti_sebelum_sandi_baru(api):
    call(api, "POST", "/api/v1/pengguna-fkrtl/auth0%7Cpetugas/atur-ulang-sandi", ["super_admin"])
    patches = [c[2] for c in api.fake.calls if c[0] == "PATCH"]
    assert patches[0] == {"app_metadata": {"wajib_ganti_sandi": True}}
    assert "password" in patches[1]
