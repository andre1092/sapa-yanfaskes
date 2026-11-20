"""Endpoint data SSBI Kesesuaian Jadwal Praktik Dokter: izin, validasi, penggantian atomik, unduhan per RS.

Drive diganti tiruan di memori; tes tidak memakai jaringan. Nama dokter dan RS samaran.
"""
import contextlib
import gzip
import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from test_api_auth import load_api, token
from test_ssbi_jadwal_service import csv_bytes

import audit_log  # noqa: E402

GZ = {"Content-Type": "application/gzip"}


class FakeDrive:
    def __init__(self):
        self.isi, self.properti, self.versi = b"", {}, "v0"
        self.tulis_dipanggil, self.unduh_dipanggil = 0, 0
        self.gagal_tulis = False

    def info(self):
        return {"versi": self.versi, "ukuran": len(self.isi), "properti": dict(self.properti)}

    def unduh(self):
        self.unduh_dipanggil += 1
        return self.isi

    def tulis(self, isi, properti):
        self.tulis_dipanggil += 1
        if self.gagal_tulis:
            raise RuntimeError("drive mati")
        self.isi, self.properti = isi, dict(properti)
        self.versi = f"v{self.tulis_dipanggil}"
        return self.versi, dict(properti)



@pytest.fixture(autouse=True)
def _flag_0(monkeypatch):
    """Tes memakai Bearer Auth0 dan kode PPK petugas dari Auth0 (flag 0). Perilaku flag 1 diuji di test_auth_bff.py dan test_akun_lokal.py."""
    monkeypatch.setenv("SAPA_LOGIN_BFF", "0")

@pytest.fixture
def env(monkeypatch):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    drive = FakeDrive()
    for name in ("info", "unduh", "tulis"):
        monkeypatch.setattr(api.drive_ssbi, name, getattr(drive, name))
    monkeypatch.setattr(api, "_ssbi_simpanan", {"versi": None, "baris": None})
    monkeypatch.setattr(api, "_ssbi_padanan", api.ssbi_jadwal_service.Padanan(
        [("RSD Melati", "0101R001"), ("KENANGA LUMAJANG, RSUD", "0202R002")]))
    kode = {"auth0|petugas-melati": "0101R001", "auth0|petugas-kenanga": "0202R002", "auth0|petugas-asing": "0909R009"}
    monkeypatch.setattr(api.pengguna_service, "status_akun", lambda sub, segar=False: {
        "wajib_ganti_sandi": False, "nonaktif": False, "diatur_ulang_pada": None, "kode_ppk": kode.get(sub, "")})
    monkeypatch.setattr(api.pengguna_service, "get_client", lambda: None)
    monkeypatch.delenv(audit_log.DSN_ENV, raising=False)
    written = []

    async def fake_write(entry):
        written.append(entry)

    monkeypatch.setattr(audit_log, "write_entry", fake_write)

    def call(method, path, roles=("admin",), sub="auth0|ceo", **kw):
        claims = {} if roles is None else {api.ROLES_CLAIM: list(roles)}
        headers = {"Authorization": f"Bearer {token(api, sub=sub, **claims)}", **kw.pop("headers", {})}
        return TestClient(api.app, raise_server_exceptions=False).request(method, path, headers=headers, **kw)

    return api, drive, call, written


def unggah(call, path="/api/v1/ssbi-jadwal/integrasikan", data=None, **kw):
    body = gzip.compress(csv_bytes()) if data is None else data
    return call("POST", path, content=body, headers={**GZ, "X-Nama-Berkas": "FKRTL.csv"}, **kw)


def integrasikan(call):
    assert unggah(call).status_code == 200


# --- izin ------------------------------------------------------------------

@pytest.mark.parametrize("path", ["/api/v1/ssbi-jadwal/periksa", "/api/v1/ssbi-jadwal/integrasikan"])
@pytest.mark.parametrize("roles,status", [(None, 403), (["viewer"], 403), (["Petugas RS"], 403), (["admin"], 200), (["super_admin"], 200)])
def test_only_admins_can_upload(env, path, roles, status):
    _, drive, call, _ = env
    assert unggah(call, path, roles=roles, sub="auth0|petugas-melati").status_code == status
    assert drive.tulis_dipanggil == (1 if status == 200 and path.endswith("integrasikan") else 0)


def test_upload_without_token_is_401(env):
    api, drive, _, _ = env
    assert TestClient(api.app).post("/api/v1/ssbi-jadwal/integrasikan", content=gzip.compress(csv_bytes()), headers=GZ).status_code == 401
    assert drive.tulis_dipanggil == 0


@pytest.mark.parametrize("path", ["/api/v1/ssbi-jadwal/bulan", "/api/v1/ssbi-jadwal/detail?bulan=2026-04"])
@pytest.mark.parametrize("roles", [None, ["viewer"]])
def test_viewer_cannot_download(env, path, roles):
    _, _, call, _ = env
    integrasikan(call)
    assert call("GET", path, roles=roles).status_code == 403


# --- unggah ----------------------------------------------------------------

def test_check_returns_summary_without_writing(env):
    _, drive, call, _ = env
    res = unggah(call, "/api/v1/ssbi-jadwal/periksa")
    assert res.json()["ringkasan"]["baris"] == 4 and res.json()["aktif"] is None
    assert drive.tulis_dipanggil == 0 and res.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("data,headers,status", [
    (gzip.compress(csv_bytes()), {"Content-Type": "text/csv"}, 415),
    (csv_bytes(), GZ, 400),
    (gzip.compress(csv_bytes())[:-10], GZ, 400),
    (gzip.compress(b"\x00" * (31 * 1024 * 1024)), GZ, 400),
    (gzip.compress(csv_bytes().replace(b",SESUAI,", b",MUNGKIN,")), GZ, 400),
    (b"\x1f\x8b" + b"\x00" * (4 * 1024 * 1024 + 1), GZ, 413),
])
def test_bad_upload_keeps_old_data(env, data, headers, status):
    _, drive, call, _ = env
    integrasikan(call)
    lama = (drive.isi, drive.properti)
    res = call("POST", "/api/v1/ssbi-jadwal/integrasikan", content=data, headers=headers)
    assert res.status_code == status
    assert (drive.isi, drive.properti) == lama and drive.tulis_dipanggil == 1
    assert "MUNGKIN" not in res.text


def test_integration_replaces_data_and_records_summary(env):
    _, drive, call, written = env
    res = unggah(call)
    aktif = res.json()["aktif"]
    assert aktif["baris"] == 4 and aktif["faskes"] == 3 and aktif["bulan"] == ["2026-04", "2026-05"]
    assert aktif["nama_berkas"] == "FKRTL.csv" and aktif["diunggah_oleh"] == "Admin"
    assert gzip.decompress(drive.isi).startswith(b"Kabupaten,Nama Faskes")
    assert all(len(k) + len(v) <= 124 for k, v in drive.properti.items())
    assert "DOKTER" not in str(drive.properti)
    entry = written[-1]
    assert entry["action"] == "POST /api/v1/ssbi-jadwal/integrasikan"
    assert "baris=4" in entry["target"] and "sha256=" in entry["target"] and "DOKTER" not in entry["target"]


def test_second_admin_waits_for_the_lock(env, monkeypatch):
    api, drive, call, _ = env

    @contextlib.asynccontextmanager
    async def sibuk():
        yield False

    monkeypatch.setattr(api, "_ssbi_kunci", sibuk)
    res = unggah(call)
    assert res.status_code == 409 and "Admin lain" in res.json()["detail"]
    assert drive.tulis_dipanggil == 0


def test_drive_failure_says_old_data_is_kept(env):
    _, drive, call, _ = env
    drive.gagal_tulis = True
    res = unggah(call)
    assert res.status_code == 502 and "Data lama tetap dipakai" in res.json()["detail"]
    assert "drive mati" not in res.text


def test_missing_drive_configuration_is_503(env, monkeypatch):
    api, _, call, _ = env

    def belum():
        raise api.drive_ssbi.DriveBelumSiap()

    monkeypatch.setattr(api.drive_ssbi, "info", belum)
    assert call("GET", "/api/v1/ssbi-jadwal/status").status_code == 503


# --- bulan dan unduh -------------------------------------------------------

def test_admin_sees_all_months(env):
    _, _, call, _ = env
    integrasikan(call)
    res = call("GET", "/api/v1/ssbi-jadwal/bulan")
    assert res.json()["bulan"] == ["2026-04", "2026-05"] and res.json()["rs"] is None
    assert res.headers["cache-control"] == "no-store"


def test_petugas_sees_only_own_hospital_and_rs_parameter_is_ignored(env):
    _, _, call, _ = env
    integrasikan(call)
    res = call("GET", "/api/v1/ssbi-jadwal/bulan?rs=RS+MAWAR&kode_ppk=0202R002", roles=["Petugas RS"], sub="auth0|petugas-melati")
    assert res.json() == {"ada_data": True, "rs": "RSD Melati", "bulan": ["2026-04"], "data_per": res.json()["data_per"]}
    assert "KENANGA" not in res.text


def test_unmapped_petugas_is_refused_without_listing_hospitals(env):
    _, _, call, _ = env
    integrasikan(call)
    for path in ("/api/v1/ssbi-jadwal/bulan", "/api/v1/ssbi-jadwal/detail?bulan=2026-04"):
        res = call("GET", path, roles=["Petugas RS"], sub="auth0|petugas-asing")
        assert res.status_code == 403 and "Melati" not in res.text and "KENANGA" not in res.text


@pytest.mark.parametrize("bulan", ["", "Semua Bulan", "2026-13", "April 2026", "2026-04-01"])
def test_month_must_be_a_single_valid_month(env, bulan):
    _, _, call, _ = env
    integrasikan(call)
    res = call("GET", "/api/v1/ssbi-jadwal/detail", params={"bulan": bulan})
    assert res.status_code == 400 and (not bulan or bulan not in res.text)


def _rows(res):
    ws = load_workbook(io.BytesIO(res.content)).active
    return [[c.value for c in row] for row in ws.iter_rows(min_row=5)]


def test_admin_download_has_every_hospital_for_the_month(env):
    _, _, call, written = env
    integrasikan(call)
    res = call("GET", "/api/v1/ssbi-jadwal/detail?bulan=2026-05")
    assert res.status_code == 200
    assert res.headers["content-disposition"] == 'attachment; filename="Detail_Jadwal_Dokter_FKRTL_Mei_2026.xlsx"'
    assert res.headers["cache-control"] == "no-store"
    assert len(_rows(res)) == 2
    assert written[-1]["target"].endswith("bulan=2026-05 baris=2")


def test_petugas_download_has_only_own_hospital(env):
    _, _, call, _ = env
    integrasikan(call)
    res = call("GET", "/api/v1/ssbi-jadwal/detail?bulan=2026-05", roles=["Petugas RS"], sub="auth0|petugas-kenanga")
    assert 'filename="Detail_Jadwal_Dokter_FKRTL_KENANGA_LUMAJANG_RSUD_Mei_2026.xlsx"' in res.headers["content-disposition"]
    assert {row[1] for row in _rows(res)} == {"KENANGA LUMAJANG, RSUD"}
    assert call("GET", "/api/v1/ssbi-jadwal/detail?bulan=2026-04", roles=["Petugas RS"], sub="auth0|petugas-kenanga").status_code == 404


def test_no_data_yet(env):
    _, _, call, _ = env
    assert call("GET", "/api/v1/ssbi-jadwal/bulan").json()["ada_data"] is False
    assert call("GET", "/api/v1/ssbi-jadwal/detail?bulan=2026-04").status_code == 404
    assert call("GET", "/api/v1/ssbi-jadwal/status").json() == {"aktif": None}


def test_cache_follows_the_drive_version(env, monkeypatch):
    api, drive, call, _ = env
    integrasikan(call)
    monkeypatch.setattr(api, "_ssbi_simpanan", {"versi": None, "baris": None})
    call("GET", "/api/v1/ssbi-jadwal/bulan")
    call("GET", "/api/v1/ssbi-jadwal/bulan")
    assert drive.unduh_dipanggil == 1
    drive.versi = "v-baru-dari-instans-lain"
    call("GET", "/api/v1/ssbi-jadwal/bulan")
    assert drive.unduh_dipanggil == 2


def test_errors_are_not_cached(env):
    _, _, call, _ = env
    res = call("GET", "/api/v1/ssbi-jadwal/detail?bulan=Semua")
    assert res.status_code == 400 and res.headers["cache-control"] == "no-store"


def test_check_lists_hospitals_missing_from_the_mapping(env):
    _, _, call, _ = env
    assert unggah(call, "/api/v1/ssbi-jadwal/periksa").json()["faskes_tak_terpetakan"] == ["RS MAWAR"]


@pytest.mark.parametrize("nama", ["andreas.dwi@bpjs-kesehatan.go.id", "Andreas <andreas@contoh.test>", ""])
def test_uploader_name_never_contains_an_email(env, monkeypatch, nama):
    api, drive, call, _ = env

    class Klien:
        def request(self, method, path):
            return {"name": nama}

    monkeypatch.setattr(api.pengguna_service, "get_client", lambda: Klien())
    unggah(call, roles=["super_admin"])
    assert drive.properti["diunggah_oleh"] == "Super Admin"


def test_uploader_display_name_is_kept(env, monkeypatch):
    api, drive, call, _ = env

    class Klien:
        def request(self, method, path):
            return {"name": "Andreas Dwi"}

    monkeypatch.setattr(api.pengguna_service, "get_client", lambda: Klien())
    unggah(call)
    assert drive.properti["diunggah_oleh"] == "Andreas Dwi"


def test_utf16_tab_upload_is_integrated(env):
    from test_ssbi_jadwal_service import _tsv
    _, drive, call, _ = env
    res = unggah(call, data=gzip.compress(_tsv().encode("utf-16")))
    assert res.status_code == 200 and res.json()["aktif"]["baris"] == 4


def test_admin_can_download_all_months(env):
    _, _, call, written = env
    integrasikan(call)
    res = call("GET", "/api/v1/ssbi-jadwal/detail?bulan=semua")
    assert res.status_code == 200
    assert res.headers["content-disposition"] == 'attachment; filename="Detail_Jadwal_Dokter_FKRTL_April-Mei_2026.xlsx"'
    assert len(_rows(res)) == 4
    assert written[-1]["target"].endswith("bulan=semua baris=4")


def test_petugas_all_months_has_only_own_hospital(env):
    _, _, call, _ = env
    integrasikan(call)
    res = call("GET", "/api/v1/ssbi-jadwal/detail?bulan=semua", roles=["Petugas RS"], sub="auth0|petugas-melati")
    assert {row[1] for row in _rows(res)} == {"RSD Melati"}
    assert 'filename="Detail_Jadwal_Dokter_FKRTL_RSD_Melati_April_2026.xlsx"' in res.headers["content-disposition"]


@pytest.mark.parametrize("roles", [None, ["viewer"]])
def test_viewer_cannot_download_all_months(env, roles):
    _, _, call, _ = env
    integrasikan(call)
    assert call("GET", "/api/v1/ssbi-jadwal/detail?bulan=semua", roles=roles).status_code == 403


def test_too_large_all_months_file_asks_for_a_single_month(env, monkeypatch):
    api, _, call, _ = env
    integrasikan(call)
    monkeypatch.setattr(api, "_SSBI_BATAS_RESPON", 10)
    res = call("GET", "/api/v1/ssbi-jadwal/detail?bulan=semua")
    assert res.status_code == 413 and "filter Bulan" in res.json()["detail"]
