"""Endpoint Download Detail SRK (versi 1, tanpa nomor): izin, penolakan pola nomor, cakupan Petugas RS, audit.

Drive diganti tiruan; nilai palsu.
"""
import gzip
import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from test_api_auth import load_api, token
from test_surat_kontrol_detail_service import BAIK, BESAR, csv

import audit_log  # noqa: E402

GZ = {"Content-Type": "application/gzip"}


class FakeDrive:
    def __init__(self):
        self.isi, self.versi, self.tulis_n = b"", "v0", 0

    def info(self):
        return {"versi": self.versi, "ukuran": len(self.isi), "properti": {}}

    def unduh(self):
        return self.isi

    def tulis(self, isi, properti):
        self.tulis_n += 1
        self.isi, self.versi = isi, f"v{self.tulis_n}"
        return self.versi, dict(properti)


@pytest.fixture(autouse=True)
def _flag_0(monkeypatch):
    """Tes memakai Bearer Auth0 dan kode PPK petugas dari Auth0 (flag 0). Perilaku flag 1 diuji di test_auth_bff.py dan test_akun_lokal.py."""
    monkeypatch.setenv("SAPA_LOGIN_BFF", "0")


@pytest.fixture
def env(monkeypatch):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    drive = FakeDrive()
    monkeypatch.setattr(api, "_skd_drive_info", drive.info)
    monkeypatch.setattr(api, "_skd_drive_unduh", drive.unduh)
    monkeypatch.setattr(api, "_skd_drive_tulis", drive.tulis)
    monkeypatch.setattr(api, "_skd_simpanan", {"versi": None, "isi": None})
    monkeypatch.setattr(api, "_ssbi_padanan", api.ssbi_jadwal_service.Padanan(
        [("RSD Mawar", "0189R001"), ("MELATI LUMAJANG, RSUD", "1330R002")]))
    monkeypatch.setattr(api.kepatuhan_service, "get_ref_lookup", lambda: {})
    from datetime import date
    monkeypatch.setattr(api, "_sk_hari_ini", lambda: date(2026, 11, 20))
    kode = {"auth0|petugas-mawar": "0189R001", "auth0|petugas-kosong": ""}
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


def unggah(call, aksi="integrasikan", raw=None, bulan="2026-11", **kw):
    return call("POST", f"/api/v1/surat-kontrol-detail/{aksi}?bulan={bulan}", content=gzip.compress(raw or csv(*BAIK)), headers=GZ, **kw)


@pytest.mark.parametrize("aksi", ["periksa", "integrasikan"])
@pytest.mark.parametrize("roles,status", [(None, 403), (["viewer"], 403), (["Petugas RS"], 403), (["admin"], 200)])
def test_only_admins_can_upload(env, aksi, roles, status):
    _, drive, call, _ = env
    assert unggah(call, aksi, roles=roles, sub="auth0|petugas-mawar").status_code == status
    assert drive.tulis_n == (1 if status == 200 and aksi == "integrasikan" else 0)


def test_number_pattern_is_refused_and_nothing_written(env):
    _, drive, call, written = env
    b = list(BAIK[0]); b[2] = "0189R0011125V000123"
    res = unggah(call, raw=csv(tuple(b)))
    assert res.status_code == 400 and "0189R0011125V000123" not in res.text and drive.tulis_n == 0
    assert "bulan=2026-11" in written[-1]["target"] and "0189R0011125V000123" not in str(written[-1])


def test_check_summary_and_audit(env):
    _, drive, call, written = env
    res = unggah(call, "periksa")
    assert res.json()["ringkasan"]["baris"] == 2 and drive.tulis_n == 0
    assert written[-1]["action"] == "POST /api/v1/surat-kontrol-detail/periksa" and "sha256=" in written[-1]["target"]


@pytest.mark.parametrize("roles,sub,status", [(["viewer"], "auth0|v", 403), (None, "auth0|x", 403), (["Petugas RS"], "auth0|petugas-kosong", 403)])
def test_download_refused_for_viewer_and_unlinked_officer(env, roles, sub, status):
    _, _, call, _ = env
    unggah(call)
    assert call("GET", "/api/v1/surat-kontrol-detail/detail?bulan=2026-11&jenis=semua&status=semua", roles=roles, sub=sub).status_code == status


def _rows(res):
    return [[c.value for c in r] for r in load_workbook(io.BytesIO(res.content)).active.iter_rows(min_row=6)]


def test_admin_download_all_hospitals(env):
    _, _, call, written = env
    unggah(call)
    res = call("GET", "/api/v1/surat-kontrol-detail/detail?bulan=2026-11&jenis=semua&status=semua")
    assert res.status_code == 200 and res.headers["cache-control"] == "no-store"
    assert 'filename="Detail_Surat_Kontrol_November_2026_Semua.xlsx"' in res.headers["content-disposition"]
    assert len(_rows(res)) == 2
    assert written[-1]["action"] == "GET /api/v1/surat-kontrol-detail/detail" and "baris=2" in written[-1]["target"]


def test_officer_gets_only_own_rows_and_parameter_is_ignored(env):
    _, _, call, _ = env
    unggah(call)
    res = call("GET", "/api/v1/surat-kontrol-detail/detail?bulan=2026-11&jenis=semua&status=semua&faskes=1330R002",
               roles=["Petugas RS"], sub="auth0|petugas-mawar")
    rows = _rows(res)
    assert res.status_code == 200 and {r[1] for r in rows} == {"0189R001"}
    assert "RSD_Mawar" in res.headers["content-disposition"]


@pytest.mark.parametrize("q", ["bulan=2026-13&jenis=RJ&status=semua", "bulan=2026-11&jenis=X&status=semua",
                               "bulan=2026-11&jenis=RJ&status=lt", "bulan=２０２６-11&jenis=RJ&status=semua",
                               "bulan=2026-11&jenis=RJ&status=semua&faskes=<b>"])
def test_invalid_parameters_are_400(env, q):
    _, _, call, _ = env
    unggah(call)
    res = call("GET", f"/api/v1/surat-kontrol-detail/detail?{q}")
    assert res.status_code == 400 and "<b>" not in res.text


def test_missing_month_and_empty_filter_are_404(env):
    _, _, call, _ = env
    assert call("GET", "/api/v1/surat-kontrol-detail/detail?bulan=2026-11&jenis=RJ&status=semua").status_code == 404
    unggah(call)
    assert call("GET", "/api/v1/surat-kontrol-detail/detail?bulan=2026-11&jenis=RJ&status=gt").status_code == 404


def test_months_endpoint_for_download_roles(env):
    _, _, call, _ = env
    unggah(call)
    assert call("GET", "/api/v1/surat-kontrol-detail/bulan").json()["bulan"] == ["2026-11"]
    assert call("GET", "/api/v1/surat-kontrol-detail/bulan", roles=["viewer"]).status_code == 403
    assert call("GET", "/api/v1/surat-kontrol-detail/status").json()["bulan"][0]["bulan"] == "2026-11"


# --- Review Clara PR #87 (2026-11-19), butir wajib 1, 2c, 4 (sha256), 6. Nilai palsu. ------------------------

def test_padanan_unreadable_fails_closed_with_503(env, monkeypatch):
    api, drive, call, _ = env

    def rusak():
        raise OSError("padanan hilang")

    monkeypatch.setattr(api, "_ssbi_padanan", None)
    monkeypatch.setattr(api.ssbi_jadwal_service.Padanan, "dari_berkas", staticmethod(rusak))
    for aksi in ("periksa", "integrasikan"):
        assert unggah(call, aksi).status_code == 503
    assert drive.tulis_n == 0


def test_unmatched_codes_are_audited_without_names(env):
    _, _, call, written = env
    b = ("0191R006", "Rawat Inap", "", "November 4, 2026", "November 5, 2026", "RS BARU PALSU", BESAR)
    res = unggah(call, "periksa", raw=csv(BAIK[0], b))
    assert res.status_code == 200 and res.json()["ringkasan"]["kode_tak_dikenal"] == ["0191R006"]
    target = written[-1]["target"]
    assert "tak_terpadan=1" in target and "0191R006" in target and "RS BARU PALSU" not in target


def test_rejected_upload_is_audited_without_hash(env):
    _, _, call, written = env
    b = list(BAIK[0]); b[5] = "0189 R001 1125 V000123"
    assert unggah(call, "periksa", raw=csv(tuple(b))).status_code == 400
    assert "bulan=2026-11" in written[-1]["target"] and "sha256=" not in written[-1]["target"]


@pytest.mark.parametrize("bulan", ["2026-08", "2026-12", "2027-01"])
@pytest.mark.parametrize("aksi", ["periksa", "integrasikan"])
def test_upload_month_outside_window_is_400(env, aksi, bulan):
    _, drive, call, _ = env
    res = unggah(call, aksi, bulan=bulan)
    assert res.status_code == 400 and "3 bulan terakhir" in res.json()["detail"] and drive.tulis_n == 0
    assert "Muat ulang halaman" in res.json()["detail"]


def test_integrate_reports_months_including_uploaded_one(env):
    _, _, call, _ = env
    res = unggah(call, bulan="2026-11")
    assert res.status_code == 200 and "2026-11" in [b["bulan"] for b in res.json()["bulan"]]


def test_all_types_with_only_outpatient_rows_is_labelled_outpatient(env):
    # Keputusan CEO 2026-11-24 "RJ saja dulu": berkas "Semua" yang isinya hanya RJ diberi label Rawat Jalan.
    _, _, call, _ = env
    unggah(call, raw=csv(BAIK[0]))
    res = call("GET", "/api/v1/surat-kontrol-detail/detail?bulan=2026-11&jenis=semua&status=semua")
    assert res.status_code == 200
    assert 'filename="Detail_Surat_Kontrol_November_2026_RJ.xlsx"' in res.headers["content-disposition"]
    ws = load_workbook(io.BytesIO(res.content)).active
    assert "Rawat jalan" in ws["A2"].value  # judul SAPA, huruf besar sama dengan label filter (review Kim)
    assert ws["D6"].value == "Rawat Jalan"  # nilai kolom tetap seperti tulisan SSBI
