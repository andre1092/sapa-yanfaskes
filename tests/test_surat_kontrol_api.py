"""Endpoint Monitoring Penerbitan Surat Kontrol: izin, ganti per bulan, cakupan Petugas RS, audit.

Drive diganti tiruan di memori; tes tidak memakai jaringan. Nama RS samaran.
"""
import contextlib
import gzip

import pytest
from fastapi.testclient import TestClient

from test_api_auth import load_api, token
from test_surat_kontrol_service import kiriman, satu_jenis, sepuluh, LT, RS

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


@pytest.fixture
def env(monkeypatch):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    drive = FakeDrive()
    monkeypatch.setattr(api, "_sk_drive_info", drive.info)
    monkeypatch.setattr(api, "_sk_drive_unduh", drive.unduh)
    monkeypatch.setattr(api, "_sk_drive_tulis", drive.tulis)
    monkeypatch.setattr(api, "_sk_simpanan", {"versi": None, "isi": None})
    monkeypatch.setattr(api, "_ssbi_padanan", api.ssbi_jadwal_service.Padanan(
        [("RSD MAWAR", "0101R001"), ("MELATI LUMAJANG, RSUD", "0202R002")]))
    kode = {"auth0|petugas-mawar": "0101R001", "auth0|petugas-kenanga": "0303S003", "auth0|petugas-kosong": ""}
    monkeypatch.setattr(api.pengguna_service, "status_akun", lambda sub, segar=False: {
        "wajib_ganti_sandi": False, "nonaktif": False, "diatur_ulang_pada": None, "kode_ppk": kode.get(sub, "")})
    monkeypatch.setattr(api.pengguna_service, "get_client", lambda: None)
    monkeypatch.setattr(api.kepatuhan_service, "get_ref_lookup", lambda: {})  # tanpa jaringan
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


def unggah(call, bulan="2026-11", berkas=None, aksi="integrasikan", data=None, **kw):
    body = kiriman(berkas if berkas is not None else sepuluh()) if data is None else data
    return call("POST", f"/api/v1/surat-kontrol/{aksi}?bulan={bulan}", content=body,
                headers={**GZ, **kw.pop("headers", {})}, **kw)


def isi_drive(api, drive):
    return api.surat_kontrol_service.baca_simpanan(drive.isi)


# --- izin ------------------------------------------------------------------

@pytest.mark.parametrize("aksi", ["periksa", "integrasikan"])
@pytest.mark.parametrize("roles,status", [(None, 403), (["viewer"], 403), (["Petugas RS"], 403), (["admin"], 200), (["super_admin"], 200)])
def test_only_admins_can_upload(env, aksi, roles, status):
    _, drive, call, _ = env
    assert unggah(call, aksi=aksi, roles=roles, sub="auth0|petugas-mawar").status_code == status
    assert drive.tulis_dipanggil == (1 if status == 200 and aksi == "integrasikan" else 0)


def test_upload_without_token_is_401(env):
    api, drive, _, _ = env
    res = TestClient(api.app).post("/api/v1/surat-kontrol/integrasikan?bulan=2026-11", content=kiriman(sepuluh()), headers=GZ)
    assert res.status_code == 401 and drive.tulis_dipanggil == 0


def test_status_is_admin_only(env):
    _, _, call, _ = env
    assert call("GET", "/api/v1/surat-kontrol/status", roles=["viewer"]).status_code == 403
    assert call("GET", "/api/v1/surat-kontrol/status").json() == {"bulan": []}


@pytest.mark.parametrize("roles,sub", [(["viewer"], "auth0|v"), (["admin"], "auth0|a"), (["Petugas RS"], "auth0|petugas-mawar")])
def test_every_role_can_view(env, roles, sub):
    _, _, call, _ = env
    unggah(call)
    assert call("GET", "/api/v1/surat-kontrol/data", roles=roles, sub=sub).status_code == 200


def test_view_without_role_is_refused(env):
    _, _, call, _ = env
    assert call("GET", "/api/v1/surat-kontrol/data", roles=None).status_code == 403


# --- unggah ----------------------------------------------------------------

def test_check_returns_summary_without_writing(env):
    _, drive, call, written = env
    res = unggah(call, aksi="periksa")
    body = res.json()
    assert res.status_code == 200 and res.headers["cache-control"] == "no-store"
    assert body["ringkasan"]["jenis"]["RJ"]["total"]["lt"] == 3600 and body["ada"] is None
    assert body["faskes_tak_dikenal"] == ["0303S003"] and "KENANGA" not in res.text
    assert body["ringkasan"]["jenis"]["RI"]["selisih_poli"] == 0 and body["ringkasan"]["peringatan"] == []
    assert drive.tulis_dipanggil == 0
    assert written[-1]["action"] == "POST /api/v1/surat-kontrol/periksa"
    assert "bulan=2026-11" in written[-1]["target"] and "sha256=" in written[-1]["target"]


def test_check_reports_month_that_will_be_replaced(env):
    _, _, call, _ = env
    unggah(call)
    ada = unggah(call, aksi="periksa").json()["ada"]
    assert ada["sampai"] == "2026-11-12" and ada["diunggah_oleh"] == "Admin"


def test_reupload_replaces_only_that_month(env):
    api, drive, call, written = env
    unggah(call, "2026-11")
    unggah(call, "2026-10")
    baru = satu_jenis("RJ", angka={LT: {RS[0]: 10}}) + satu_jenis("RI")
    res = unggah(call, "2026-11", berkas=baru, roles=["super_admin"])
    assert res.status_code == 200
    isi = isi_drive(api, drive)
    assert sorted(isi["bulan"]) == ["2026-10", "2026-11"]
    assert isi["bulan"]["2026-11"]["RJ"]["total"]["lt"] == 10
    assert isi["bulan"]["2026-11"]["meta"]["diunggah_oleh"] == "Super Admin"
    assert isi["bulan"]["2026-10"]["RJ"]["total"]["lt"] == 3600
    assert drive.properti["bulan_awal"] == "2026-10" and drive.properti["bulan_akhir"] == "2026-11"
    assert all(len(k) + len(v) <= 124 for k, v in drive.properti.items()) and "MAWAR" not in str(drive.properti)
    assert [b["bulan"] for b in res.json()["bulan"]] == ["2026-10", "2026-11"]
    assert written[-1]["action"] == "POST /api/v1/surat-kontrol/integrasikan"


@pytest.mark.parametrize("data,headers,status", [
    (kiriman(sepuluh()), {"Content-Type": "text/csv"}, 415),
    (b"bukan gzip", GZ, 400),
    (kiriman(sepuluh())[:-10], GZ, 400),
    (kiriman(sepuluh()[:-1]), GZ, 400),
    (b"\x1f\x8b" + b"\x00" * (1024 * 1024 + 1), GZ, 413),
])
def test_bad_upload_keeps_old_data(env, data, headers, status):
    _, drive, call, _ = env
    unggah(call)
    lama = (drive.isi, drive.properti)
    res = call("POST", "/api/v1/surat-kontrol/integrasikan?bulan=2026-11", content=data, headers=headers)
    assert res.status_code == status
    assert (drive.isi, drive.properti) == lama and drive.tulis_dipanggil == 1


@pytest.mark.parametrize("bulan", ["", "2026-13", "semua", "November 2026"])
def test_upload_month_must_be_valid(env, bulan):
    _, drive, call, _ = env
    res = call("POST", "/api/v1/surat-kontrol/integrasikan", params={"bulan": bulan}, content=kiriman(sepuluh()), headers=GZ)
    assert res.status_code == 400 and drive.tulis_dipanggil == 0
    assert not bulan or bulan not in res.text


def test_second_admin_waits_for_the_lock(env, monkeypatch):
    api, drive, call, _ = env

    @contextlib.asynccontextmanager
    async def sibuk():
        yield False

    monkeypatch.setattr(api, "_sk_kunci", sibuk)
    res = unggah(call)
    assert res.status_code == 409 and "Admin lain" in res.json()["detail"]
    assert drive.tulis_dipanggil == 0


def test_drive_failure_keeps_old_data(env):
    _, drive, call, _ = env
    drive.gagal_tulis = True
    res = unggah(call)
    assert res.status_code == 502 and "Data lama tetap dipakai" in res.json()["detail"]
    assert "drive mati" not in res.text


def test_missing_drive_configuration_is_503(env, monkeypatch):
    api, _, call, _ = env

    def belum():
        raise api.drive_ssbi.DriveBelumSiap()

    monkeypatch.setattr(api, "_sk_drive_info", belum)
    assert call("GET", "/api/v1/surat-kontrol/data").status_code == 503
    assert unggah(call).status_code == 503


# --- lihat data ------------------------------------------------------------

def test_no_data_yet(env):
    _, _, call, _ = env
    res = call("GET", "/api/v1/surat-kontrol/data")
    assert res.status_code == 200 and res.json()["bulan_tersedia"] == [] and res.json()["data"] is None


def test_latest_month_is_shown_by_default(env):
    _, _, call, _ = env
    unggah(call, "2026-11")
    unggah(call, "2026-10")
    res = call("GET", "/api/v1/surat-kontrol/data", roles=["viewer"])
    body = res.json()
    assert res.headers["cache-control"] == "no-store"
    assert body["bulan_tersedia"] == ["2026-10", "2026-11"] and body["bulan"] == "2026-11"
    assert body["terkunci"] is False and body["rs"] is None
    assert len(body["data"]["RJ"]["faskes"]) == 2 and body["data"]["RJ"]["tren"]
    assert "meta" not in body["data"] and body["diunggah_pada"]


def test_chosen_month_and_missing_month(env):
    _, _, call, _ = env
    unggah(call, "2026-11")
    assert call("GET", "/api/v1/surat-kontrol/data?bulan=2026-11").json()["bulan"] == "2026-11"
    assert call("GET", "/api/v1/surat-kontrol/data?bulan=2026-10").status_code == 404
    res = call("GET", "/api/v1/surat-kontrol/data?bulan=<b>")
    assert res.status_code == 400 and "<b>" not in res.text


def test_petugas_sees_only_own_hospital_and_parameter_is_ignored(env):
    _, _, call, _ = env
    unggah(call)
    res = call("GET", "/api/v1/surat-kontrol/data?kode_ppk=0202R002&faskes=0202R002", roles=["Petugas RS"], sub="auth0|petugas-mawar")
    body = res.json()
    assert body["terkunci"] is True and body["rs"] == {"kode": "0101R001", "nama": "RSD MAWAR"}
    assert [f["kode"] for f in body["data"]["RJ"]["faskes"]] == ["0101R001"]
    assert body["data"]["RJ"]["total"]["lt"] == 3513
    # Tren dan Poli = total cabang berlabel (keputusan CEO 2b, disetujui Clara).
    assert body["data"]["RJ"]["poli"] and body["data"]["RJ"]["tren"]
    # Syarat Clara C: tidak ada baris atau kode RS lain di mana pun dalam JSON.
    for lain in ("MELATI", "KENANGA", "0202R002", "0303S003"):
        assert lain not in res.text


def test_petugas_hospital_absent_this_month_gets_empty_rows(env):
    _, _, call, _ = env
    unggah(call)
    body = call("GET", "/api/v1/surat-kontrol/data", roles=["Petugas RS"], sub="auth0|petugas-kenanga").json()
    assert body["data"]["RJ"]["faskes"] == [] and body["data"]["RI"]["total"]["eq"] == 15
    assert body["rs"]["kode"] == "0303S003"


def test_petugas_without_ppk_code_is_refused(env):
    _, _, call, _ = env
    unggah(call)
    res = call("GET", "/api/v1/surat-kontrol/data", roles=["Petugas RS"], sub="auth0|petugas-kosong")
    assert res.status_code == 403 and "MAWAR" not in res.text


def test_cache_follows_the_drive_version(env, monkeypatch):
    api, drive, call, _ = env
    unggah(call)
    monkeypatch.setattr(api, "_sk_simpanan", {"versi": None, "isi": None})
    call("GET", "/api/v1/surat-kontrol/data")
    call("GET", "/api/v1/surat-kontrol/data")
    assert drive.unduh_dipanggil == 1
    drive.versi = "v-baru-dari-instans-lain"
    call("GET", "/api/v1/surat-kontrol/data")
    assert drive.unduh_dipanggil == 2


def test_admin_status_lists_stored_months(env):
    _, _, call, _ = env
    unggah(call, "2026-11")
    bulan = call("GET", "/api/v1/surat-kontrol/status").json()["bulan"]
    assert bulan == [{"bulan": "2026-11", "sampai": "2026-11-12", "diunggah_pada": bulan[0]["diunggah_pada"],
                      "diunggah_oleh": "Admin"}]


def test_check_warns_when_content_equals_another_stored_month(env):
    _, _, call, _ = env
    unggah(call, "2026-11")
    body = unggah(call, "2026-10", aksi="periksa").json()
    assert any("Isi sama persis dengan data November 2026" in p for p in body["ringkasan"]["peringatan"])
    assert unggah(call, "2026-11", aksi="periksa").json()["ringkasan"]["peringatan"] == []


def test_current_month_with_future_days_is_refused(env, monkeypatch):
    api, drive, call, _ = env
    from datetime import date
    monkeypatch.setattr(api, "_sk_hari_ini", lambda: date(2026, 11, 5))
    res = unggah(call, "2026-11")
    assert res.status_code == 400 and "tanggal yang belum terjadi" in res.json()["detail"] and drive.tulis_dipanggil == 0



@pytest.mark.parametrize("bulan", ["２０２６-11", "\u0662\u0660\u0662\u0666-11"])
def test_unicode_digit_month_is_refused_by_api(env, bulan):
    _, drive, call, _ = env
    assert unggah(call, bulan).status_code == 400 and drive.tulis_dipanggil == 0
    assert call("GET", "/api/v1/surat-kontrol/data", params={"bulan": bulan}).status_code == 400


def test_refused_upload_is_still_audited_with_month_and_hash(env):
    _, _, call, written = env
    res = unggah(call, data=kiriman(sepuluh()[:-1]))
    assert res.status_code == 400
    assert "bulan=2026-11" in written[-1]["target"] and "sha256=" in written[-1]["target"]


def test_oversized_drive_file_is_not_downloaded(env, monkeypatch):
    api, drive, call, _ = env
    unggah(call)
    monkeypatch.setattr(api, "_sk_simpanan", {"versi": None, "isi": None})
    monkeypatch.setattr(api.surat_kontrol_service, "BATAS_SIMPANAN", 10)
    sebelum = drive.unduh_dipanggil
    assert call("GET", "/api/v1/surat-kontrol/data").status_code == 502
    assert drive.unduh_dipanggil == sebelum


# --- kabupaten untuk tabel JPEG (perintah CEO 2026-11-19) -------------------

def _ref(monkeypatch, api, gagal=False):
    def lookup():
        if gagal:
            raise RuntimeError("sheet mati")
        return {"0101R001": {"kabupaten": "KAB. JEMBER"}, "0202R002": {"kabupaten": " KAB. LUMAJANG "}, "9999R999": {"kabupaten": "KAB. LAIN"}}
    monkeypatch.setattr(api.kepatuhan_service, "get_ref_lookup", lookup)


def test_data_includes_kabupaten_for_listed_hospitals(env, monkeypatch):
    api, _, call, _ = env
    _ref(monkeypatch, api)
    unggah(call)
    kab = call("GET", "/api/v1/surat-kontrol/data").json()["kabupaten"]
    assert kab == {"0101R001": "KAB. JEMBER", "0202R002": "KAB. LUMAJANG"}


def test_petugas_gets_only_own_kabupaten(env, monkeypatch):
    api, _, call, _ = env
    _ref(monkeypatch, api)
    unggah(call)
    res = call("GET", "/api/v1/surat-kontrol/data", roles=["Petugas RS"], sub="auth0|petugas-mawar")
    assert res.json()["kabupaten"] == {"0101R001": "KAB. JEMBER"} and "LUMAJANG" not in res.text


def test_reference_failure_does_not_break_data(env, monkeypatch):
    api, _, call, _ = env
    _ref(monkeypatch, api, gagal=True)
    unggah(call)
    res = call("GET", "/api/v1/surat-kontrol/data")
    assert res.status_code == 200 and res.json()["kabupaten"] == {}


def test_kabupaten_falls_back_to_ppk_prefix_when_missing_in_reference(env, monkeypatch):
    api, _, call, _ = env
    monkeypatch.setattr(api.kepatuhan_service, "get_ref_lookup", lambda: {"0101R001": {"kabupaten": "KAB. JEMBER"}})
    monkeypatch.setattr(api, "_SK_KAB_PREFIX", {"0202": "LUMAJANG"})
    unggah(call)
    kab = call("GET", "/api/v1/surat-kontrol/data").json()["kabupaten"]
    assert kab == {"0101R001": "KAB. JEMBER", "0202R002": "LUMAJANG"}  # 0303S003 tidak dikenal: tetap kosong


def test_ppk_prefix_table_matches_cinta_reference():
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
    import index
    assert index._SK_KAB_PREFIX == {"0188": "LUMAJANG", "1330": "LUMAJANG", "0189": "JEMBER", "1329": "JEMBER",
                                    "0191": "BONDOWOSO", "1332": "BONDOWOSO"}
