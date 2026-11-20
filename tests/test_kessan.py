"""Monitoring Kessan FKRTL: olah CSV sheet kessan + db_fkrtl, cakupan Petugas RS, galat sumber.

Semua data tiruan (kode dan nama RS samaran, ID sheet samaran); tes tidak memakai jaringan.
"""
import logging
import threading
import time
from datetime import date

import pytest
from fastapi.testclient import TestClient

from test_api_auth import load_api, token

import kessan_service as ks  # noqa: E402

# Kolom sama dengan sheet asli; ada nama berkoma bertanda kutip, target kosong, dan persen berformat teks.
KESSAN_CSV = (
    "kode_ppk,nama_ppk,jumlah_kessan,target,%_kessan,skor_kepatuhan,bulan,kabupaten,last_update_bi\n"
    "0101R001,RSD Mawar,1644,278,591.37%,100,November 2026,Jember,Last Update : 2026-11-20 02:42:06\n"
    '0202R002,"MELATI LUMAJANG, RSUD",268,357,75.07%,75,November 2026,KAB. LUMAJANG,Last Update : 2026-11-20 02:42:06\n'
    "0303R003,RS Kenanga,120,,,100,November 2026,Bondowoso,Last Update : 2026-11-20 02:42:06\n"
    "0404R004,RS Anggrek,\"1,182\",0,,100,November 2026,Jember,Last Update : 2026-11-20 02:42:06\n"
    "0101R001,RSD Mawar,1500,278,539.57%,100,October 2026,Jember,Last Update : 2026-11-20 02:42:06\n"
    '0202R002,"MELATI LUMAJANG, RSUD",100,357,28.01%,25,October 2026,Lumajang,Last Update : 2026-11-20 02:42:06\n'
    "0101R001,RSD Mawar,900,278,323.74%,100,January 2026,Jember,Last Update : 2026-11-20 02:42:06\n"
    ",,,,,,,,\n"
)

DB_CSV = (
    "kode_ppk,kabupaten,nama_ppk,kelas_ppk,kepemilikan,vendor_ppk,keterangan\n"
    "0101R001,KAB. JEMBER,RSD MAWAR JEMBER,B,Pemda,x,\n"
    '0202R002,KAB. LUMAJANG,"MELATI LUMAJANG, RSUD",C,Pemda,x,\n'
    "0909R009,KAB. JEMBER,RS TERATAI,D,Swasta,x,\n"
)


def olah():
    return ks.susun(ks.baca_csv(KESSAN_CSV), ks.baca_csv(DB_CSV))


def baris(data, kode, bulan="2026-11"):
    return next(b for b in data["baris"] if b["kode_ppk"] == kode and b["bulan"] == bulan)


# --- fungsi murni ------------------------------------------------------------

@pytest.mark.parametrize("teks,kunci", [
    ("January 2026", "2026-01"), ("November 2026", "2026-11"), (" december  2026 ", "2026-12"),
    ("Sep 2026", "2026-09"), ("2026-03", "2026-03"), ("Bulan 13", None), ("", None), ("Smarch 2026", None),
])
def test_kunci_bulan(teks, kunci):
    assert ks.kunci_bulan(teks) == kunci


# Sheet ber-locale en-US (titik desimal, koma ribuan, lihat "591.37%"); pola id-ID hanya bila tak ambigu.
@pytest.mark.parametrize("teks,angka", [
    ("1644", 1644), ("1,182", 1182), (" 278 ", 278), ("", None), ("-", None), ("abc", None), ("100.0", 100),
    ("1,644.00", 1644), ("1.644,00", 1644), ("1,234,567", 1234567), ("1.234.567", 1234567), ("100.000", 100),
    ("1.182", None), ("12,5", None), ("2.5", None), ("1,182.5", None), ("-5", None), ("Rp1.644", None), ("1e3", None),
])
def test_bilangan_bulat(teks, angka):
    assert ks.bilangan_bulat(teks) == angka


@pytest.mark.parametrize("jumlah,target,persen", [(1644, 278, 591.37), (16191, 7782, 208.06), (5, 0, None),
                                                  (5, None, None), (0, 10, 0.0),
                                                  # pembulatan setengah ke atas seperti ROUND di Sheets/BI
                                                  (1, 32, 3.13), (5, 32, 15.63), (1, 160, 0.63)])
def test_hitung_persen(jumlah, target, persen):
    assert ks.hitung_persen(jumlah, target) == persen


@pytest.mark.parametrize("teks,tanggal", [
    ("Last Update : 2026-11-20 02:42:06", date(2026, 11, 20)), ("", None), ("Last Update : kemarin", None),
    ("Last Update : 2026-13-40 00:00:00", None),
    # Hanya ISO yang menjadi kontrak sheet; DD/MM dan M/D ambigu sehingga tidak ditebak.
    ("Last Update : 20/11/2026 02:42:06", None), ("Last Update : 12/01/2026 02:00", None),
])
def test_tanggal_last_update(teks, tanggal):
    assert ks.tanggal_last_update(teks) == tanggal


def test_bulan_sementara_mengikuti_tanggal_last_update():
    bulan = ["2026-09", "2026-10", "2026-11"]
    assert ks.bulan_sementara(bulan, date(2026, 11, 20)) == ["2026-11"]
    # Belum diperbarui pada 1 Desember: November tetap sementara karena diambil sebelum bulan selesai.
    assert ks.bulan_sementara(bulan, date(2026, 11, 30)) == ["2026-11"]
    assert ks.bulan_sementara(bulan, date(2026, 12, 1)) == []
    assert ks.bulan_sementara(["2026-12"], date(2026, 12, 31)) == ["2026-12"]
    assert ks.bulan_sementara(bulan, None) == []


@pytest.mark.parametrize("teks,nama", [("Jember", "Jember"), ("KAB. JEMBER", "Jember"), ("Kabupaten Lumajang", "Lumajang"),
                                       ("kab bondowoso", "Bondowoso"), ("", "")])
def test_nama_kabupaten(teks, nama):
    assert ks.nama_kabupaten(teks) == nama


def test_baca_csv_menghormati_tanda_kutip_dan_bom():
    rows = ks.baca_csv(("\ufeff" + DB_CSV).encode("utf-8"))
    assert rows[1]["nama_ppk"] == "MELATI LUMAJANG, RSUD" and rows[1]["kelas_ppk"] == "C"
    assert list(rows[0])[0] == "kode_ppk"


def test_susun_respons_lengkap():
    data = olah()
    assert data["status"] == "success"
    assert data["last_update_bi"] == "Last Update : 2026-11-20 02:42:06"
    assert data["last_update_tanggal"] == "2026-11-20"
    assert data["bulan_tersedia"] == ["2026-01", "2026-10", "2026-11"]
    assert data["bulan_sementara"] == ["2026-11"]
    assert data["kabupaten"] == ["Jember", "Lumajang", "Bondowoso"]
    assert data["rs"] is None and data["terkunci"] is False
    assert len(data["baris"]) == 7  # baris kosong dibuang


def test_nama_dari_db_fkrtl_dengan_cadangan_nama_sheet():
    data = olah()
    assert baris(data, "0101R001")["nama_faskes"] == "RSD MAWAR JEMBER"
    assert baris(data, "0202R002")["nama_faskes"] == "MELATI LUMAJANG, RSUD"
    assert baris(data, "0303R003")["nama_faskes"] == "RS Kenanga"  # tidak ada di db_fkrtl


def test_persen_dihitung_ulang_dan_target_kosong_null():
    data = olah()
    mawar = baris(data, "0101R001")
    assert mawar == {"kode_ppk": "0101R001", "nama_faskes": "RSD MAWAR JEMBER", "kabupaten": "Jember", "bulan": "2026-11",
                     "jumlah_kessan": 1644, "target": 278, "persen": 591.37, "skor": 100}
    assert baris(data, "0202R002")["persen"] == 75.07 and baris(data, "0202R002")["skor"] == 75
    kenanga = baris(data, "0303R003")
    assert (kenanga["target"], kenanga["persen"], kenanga["skor"]) == (None, None, 100)
    anggrek = baris(data, "0404R004")
    assert (anggrek["jumlah_kessan"], anggrek["target"], anggrek["persen"], anggrek["skor"]) == (1182, None, None, 100)


def test_persen_tidak_dibaca_dari_kolom_sheet():
    teks = KESSAN_CSV.replace("591.37%", "1.00%")
    data = ks.susun(ks.baca_csv(teks), ks.baca_csv(DB_CSV))
    assert baris(data, "0101R001")["persen"] == 591.37


def test_skor_kosong_dihitung_dari_aturan():
    teks = KESSAN_CSV.replace("268,357,75.07%,75,", "268,357,75.07%,,")
    assert baris(ks.susun(ks.baca_csv(teks), []), "0202R002")["skor"] == 75


def test_skor_cadangan_memakai_persen_asli_bukan_yang_dibulatkan():
    # 3752 / 5003 = 74,995%: persen tampil 75,0 tetapi ambang memakai nilai asli, jadi skor 50.
    teks = KESSAN_CSV.replace("268,357,75.07%,75,", "3752,5003,75.00%,,")
    mel = baris(ks.susun(ks.baca_csv(teks), []), "0202R002")
    assert (mel["persen"], mel["skor"]) == (75.0, 50)
    assert ks.skor_dari_aturan(74.999) == 50 and ks.skor_dari_aturan(75) == 75 and ks.skor_dari_aturan(0) == 0


def test_kode_ppk_dinormalkan_dan_baris_ganda_dicatat(caplog):
    teks = KESSAN_CSV + "0101r001 ,RSD Mawar,10,278,,100,November 2026,Jember,Last Update : 2026-11-20 02:42:06\n"
    with caplog.at_level(logging.WARNING, logger="sapa-api"):
        data = ks.susun(ks.baca_csv(teks), ks.baca_csv(DB_CSV))
    mawar = [b for b in data["baris"] if b["bulan"] == "2026-11" and b["kode_ppk"].upper() == "0101R001"]
    assert len(mawar) == 1 and mawar[0]["kode_ppk"] == "0101R001" and mawar[0]["nama_faskes"] == "RSD MAWAR JEMBER"
    assert "ganda" in caplog.text and "Mawar" not in caplog.text and "0101" not in caplog.text
    assert ks.peta_nama(ks.baca_csv(DB_CSV.replace("0909R009", " 0909r009")))["0909R009"] == "RS TERATAI"


def test_nilai_negatif_atau_target_tak_terbaca_dibuang_dan_dicatat(caplog):
    teks = (KESSAN_CSV
            + "0505R005,RS Negatif,-5,-10,,,November 2026,Jember,Last Update : 2026-11-20 02:42:06\n"
            + "0606R006,RS Rahasia,50,abc,,,November 2026,Jember,Last Update : 2026-11-20 02:42:06\n")
    with caplog.at_level(logging.WARNING, logger="sapa-api"):
        data = ks.susun(ks.baca_csv(teks), [])
    kode = {b["kode_ppk"] for b in data["baris"]}
    assert "0505R005" not in kode and "0606R006" not in kode and len(data["baris"]) == 7
    assert "2 dari 9 baris" in caplog.text and "Rahasia" not in caplog.text  # jumlah saja, tanpa isi data


def test_lebih_dari_separuh_baris_tak_terbaca_dianggap_gagal():
    # Mis. format kolom diganti sehingga angka tak dikenali: jangan kirim total yang jauh lebih kecil diam-diam.
    teks = KESSAN_CSV.replace(",1644,", ",x,").replace(",268,", ",x,").replace(",120,", ",x,").replace('"1,182"', "x")
    with pytest.raises(ks.KessanGagalDimuat):
        ks.susun(ks.baca_csv(teks), [])


def test_last_update_tak_terbaca_dicatat_tanpa_isi(caplog):
    teks = KESSAN_CSV.replace("Last Update : 2026-11-20 02:42:06", "Last Update : 11/20/2026 02:42:06")
    with caplog.at_level(logging.WARNING, logger="sapa-api"):
        data = ks.susun(ks.baca_csv(teks), [])
    assert data["last_update_bi"] == "Last Update : 11/20/2026 02:42:06"
    assert data["last_update_tanggal"] is None and data["bulan_sementara"] == []
    assert "Last Update" in caplog.text and "11/20" not in caplog.text


def test_kabupaten_hanya_yang_ada_di_data():
    rows = [r for r in ks.baca_csv(KESSAN_CSV) if r.get("kabupaten") != "Bondowoso"]
    assert ks.susun(rows, [])["kabupaten"] == ["Jember", "Lumajang"]


def test_sheet_tanpa_baris_data():
    data = ks.susun([], [])
    assert data["baris"] == [] and data["bulan_tersedia"] == [] and data["last_update_bi"] is None
    assert data["last_update_tanggal"] is None and data["bulan_sementara"] == []


def test_saring_petugas_hanya_baris_rs_sendiri():
    data = olah()
    hasil = ks.saring_petugas(data, "0202R002", ks.peta_nama(ks.baca_csv(DB_CSV)))
    assert {b["kode_ppk"] for b in hasil["baris"]} == {"0202R002"}
    assert hasil["rs"] == {"kode": "0202R002", "nama": "MELATI LUMAJANG, RSUD"} and hasil["terkunci"] is True
    assert hasil["kabupaten"] == ["Lumajang"]
    assert hasil["bulan_tersedia"] == data["bulan_tersedia"] and hasil["bulan_sementara"] == ["2026-11"]
    assert len(data["baris"]) == 7  # data asli tidak berubah


def test_saring_petugas_rs_tanpa_baris():
    hasil = ks.saring_petugas(olah(), "0909R009", ks.peta_nama(ks.baca_csv(DB_CSV)))
    assert hasil["baris"] == [] and hasil["rs"] == {"kode": "0909R009", "nama": "RS TERATAI"}
    hasil = ks.saring_petugas(olah(), "7777R777", {})
    assert hasil["rs"] == {"kode": "7777R777", "nama": "7777R777"}


def test_saring_petugas_kode_akun_huruf_kecil_dan_berspasi():
    nama_db = ks.peta_nama(ks.baca_csv(DB_CSV))
    hasil = ks.saring_petugas(olah(), " 0202r002 ", nama_db)
    assert {b["kode_ppk"] for b in hasil["baris"]} == {"0202R002"} and len(hasil["baris"]) == 2
    assert hasil["rs"] == {"kode": "0202R002", "nama": "MELATI LUMAJANG, RSUD"}
    # RS tanpa baris: nama tetap ketemu di db_fkrtl walau kode akun huruf kecil, juga bila peta berkunci huruf kecil.
    assert ks.saring_petugas(olah(), "0909r009", nama_db)["rs"] == {"kode": "0909R009", "nama": "RS TERATAI"}
    assert ks.saring_petugas(olah(), "0909R009", {"0909r009": "RS TERATAI"})["rs"]["nama"] == "RS TERATAI"


# --- konfigurasi dan pengambilan ---------------------------------------------

ID_TIRUAN = "ID-TIRUAN-" + "x" * 30


@pytest.fixture
def sumber(monkeypatch):
    """Env terisi nilai samaran; pembaca lembar diganti tiruan yang menghitung panggilan."""
    monkeypatch.setenv(ks.ENV_SPREADSHEET, ID_TIRUAN)
    monkeypatch.setenv(ks.ENV_GID, "111")
    monkeypatch.setenv(ks.ENV_GID_DB, "222")
    monkeypatch.setattr(ks, "_CACHE", {})
    isi = {"111": KESSAN_CSV, "222": DB_CSV}
    panggil = []

    def baca(spreadsheet_id, gid, label):
        panggil.append(gid)
        assert spreadsheet_id == ID_TIRUAN
        if isinstance(isi.get(gid), Exception):
            raise isi[gid]
        return isi.get(gid)

    monkeypatch.setattr(ks, "_baca_lembar", baca)
    return isi, panggil


@pytest.mark.parametrize("nama", ["ENV_SPREADSHEET", "ENV_GID", "ENV_GID_DB"])
def test_env_kosong_belum_dikonfigurasi(sumber, monkeypatch, nama):
    monkeypatch.delenv(getattr(ks, nama))
    with pytest.raises(ks.KessanBelumDikonfigurasi):
        ks.data_kessan(None)


@pytest.mark.parametrize("nama,nilai", [("ENV_GID", "abc"), ("ENV_SPREADSHEET", "../x?y")])
def test_env_tidak_valid_belum_dikonfigurasi(sumber, monkeypatch, nama, nilai):
    monkeypatch.setenv(getattr(ks, nama), nilai)
    with pytest.raises(ks.KessanBelumDikonfigurasi):
        ks.data_kessan(None)


def test_data_kessan_memakai_cache_singkat(sumber):
    _, panggil = sumber
    assert len(ks.data_kessan(None)["baris"]) == 7
    ks.data_kessan("0101R001")
    assert sorted(panggil) == ["111", "222"]


def test_cache_kedaluwarsa_dibaca_ulang(sumber, monkeypatch):
    _, panggil = sumber
    jam = [1000.0]
    monkeypatch.setattr(ks.time, "time", lambda: jam[0])
    ks.data_kessan(None)
    jam[0] += ks.CACHE_TTL + 1
    ks.data_kessan(None)
    assert panggil.count("111") == 2


def test_sheet_kessan_gagal_tanpa_cache(sumber):
    isi, _ = sumber
    isi["111"] = None
    with pytest.raises(ks.KessanGagalDimuat):
        ks.data_kessan(None)
    ks._CACHE.clear()  # lewati jeda coba ulang
    isi["111"] = RuntimeError("https://docs.google.com/rahasia")
    with pytest.raises(ks.KessanGagalDimuat) as err:
        ks.data_kessan(None)
    assert "google" not in str(err.value)


def test_gagal_tanpa_cache_tidak_membaca_ulang_dalam_jeda(sumber, monkeypatch):
    isi, panggil = sumber
    jam = [1000.0]
    monkeypatch.setattr(ks.time, "time", lambda: jam[0])
    isi["111"] = None
    for _ in range(3):
        with pytest.raises(ks.KessanGagalDimuat):
            ks.data_kessan(None)
    assert panggil.count("111") == 1
    isi["111"] = KESSAN_CSV
    jam[0] += ks.JEDA_GAGAL + 1
    assert len(ks.data_kessan(None)["baris"]) == 7 and panggil.count("111") == 2


def test_sheet_kessan_gagal_memakai_cache_lama(sumber, monkeypatch):
    isi, _ = sumber
    jam = [1000.0]
    monkeypatch.setattr(ks.time, "time", lambda: jam[0])
    ks.data_kessan(None)
    isi["111"] = None
    jam[0] += ks.CACHE_TTL + 1
    assert len(ks.data_kessan(None)["baris"]) == 7


def test_data_simpanan_lama_tidak_membaca_ulang_dalam_jeda(sumber, monkeypatch):
    isi, panggil = sumber
    jam = [1000.0]
    monkeypatch.setattr(ks.time, "time", lambda: jam[0])
    ks.data_kessan(None)
    isi["111"] = RuntimeError("lambat")
    jam[0] += ks.CACHE_TTL + 1
    ks.data_kessan(None)
    jam[0] += ks.JEDA_GAGAL - 1
    assert len(ks.data_kessan("0101R001")["baris"]) == 3
    assert panggil.count("111") == 2  # sekali sukses, sekali gagal; permintaan dalam jeda memakai simpanan
    jam[0] += 2
    ks.data_kessan(None)
    assert panggil.count("111") == 3


def test_pengambilan_serentak_hanya_sekali(sumber, monkeypatch):
    _, panggil = sumber
    baca_asli = ks._baca_lembar
    mulai, lanjut = threading.Event(), threading.Event()

    def baca_lambat(spreadsheet_id, gid, label):
        mulai.set()
        lanjut.wait(5)
        return baca_asli(spreadsheet_id, gid, label)
    monkeypatch.setattr(ks, "_baca_lembar", baca_lambat)
    hasil = []
    utas = [threading.Thread(target=lambda: hasil.append(len(ks.data_kessan(None)["baris"]))) for _ in range(4)]
    for u in utas:
        u.start()
    assert mulai.wait(5)
    time.sleep(0.05)  # beri kesempatan utas lain ikut mengantre
    lanjut.set()
    for u in utas:
        u.join(5)
    assert hasil == [7, 7, 7, 7] and panggil.count("111") == 1 and panggil.count("222") == 1


def test_sheet_kessan_tanpa_kolom_wajib_dianggap_gagal(sumber):
    isi, _ = sumber
    isi["111"] = "a,b\n1,2\n"
    with pytest.raises(ks.KessanGagalDimuat):
        ks.data_kessan(None)


@pytest.mark.parametrize("kolom", ["target", "kabupaten", "last_update_bi", "jumlah_kessan"])
def test_kolom_penting_hilang_atau_berganti_nama_dianggap_gagal(sumber, kolom):
    isi, _ = sumber
    kepala, sisa = KESSAN_CSV.split("\n", 1)
    isi["111"] = kepala.replace(kolom, "trgt") + "\n" + sisa
    with pytest.raises(ks.KessanGagalDimuat):
        ks.data_kessan(None)


def test_db_fkrtl_gagal_nama_memakai_cadangan_dengan_cache_singkat(sumber, monkeypatch):
    isi, panggil = sumber
    jam = [1000.0]
    monkeypatch.setattr(ks.time, "time", lambda: jam[0])
    isi["222"] = None
    assert baris(ks.data_kessan(None), "0101R001")["nama_faskes"] == "RSD Mawar"
    isi["222"] = DB_CSV
    assert baris(ks.data_kessan(None), "0101R001")["nama_faskes"] == "RSD Mawar"  # masih dalam cache singkat
    assert panggil.count("222") == 1 and ks.CACHE_TTL_SINGKAT < ks.CACHE_TTL
    jam[0] += ks.CACHE_TTL_SINGKAT + 1
    assert baris(ks.data_kessan(None), "0101R001")["nama_faskes"] == "RSD MAWAR JEMBER"
    assert panggil.count("222") == 2


# --- endpoint ----------------------------------------------------------------

@pytest.fixture(autouse=True)
def _flag_0(monkeypatch):
    """Tes memakai Bearer Auth0 dan kode PPK petugas dari Auth0 (flag 0), seperti tes Surat Kontrol."""
    monkeypatch.setenv("SAPA_LOGIN_BFF", "0")


@pytest.fixture
def api_env(monkeypatch, sumber):
    api = load_api(monkeypatch, AUTH0_DOMAIN="sapa.test.auth0.com")
    kode = {"auth0|petugas-mawar": "0101R001", "auth0|petugas-kosong": ""}
    monkeypatch.setattr(api.pengguna_service, "status_akun", lambda sub, segar=False: {
        "wajib_ganti_sandi": False, "nonaktif": False, "diatur_ulang_pada": None, "kode_ppk": kode.get(sub, "")})
    monkeypatch.setattr(api.pengguna_service, "get_client", lambda: None)
    # Modul layanan yang dipakai index harus sama dengan yang ditambal fixture sumber.
    monkeypatch.setattr(api, "kessan_service", ks)

    def call(roles=("admin",), sub="auth0|ceo", path="/api/v1/kessan/data"):
        claims = {} if roles is None else {api.ROLES_CLAIM: list(roles)}
        headers = {"Authorization": f"Bearer {token(api, sub=sub, **claims)}"}
        return TestClient(api.app, raise_server_exceptions=False).get(path, headers=headers)

    return api, call, sumber[0]


def test_tanpa_login_401(api_env):
    api, _, _ = api_env
    assert TestClient(api.app).get("/api/v1/kessan/data").status_code == 401


def test_tanpa_peran_403(api_env):
    _, call, _ = api_env
    assert call(roles=None).status_code == 403


@pytest.mark.parametrize("roles", [["viewer"], ["admin"], ["super_admin"]])
def test_admin_dan_viewer_melihat_semua(api_env, roles):
    _, call, _ = api_env
    res = call(roles=roles)
    assert res.status_code == 200 and res.headers["cache-control"] == "no-store"
    body = res.json()
    assert len(body["baris"]) == 7 and body["rs"] is None and body["terkunci"] is False
    assert body["kabupaten"] == ["Jember", "Lumajang", "Bondowoso"]


def test_petugas_rs_hanya_baris_sendiri_dan_parameter_diabaikan(api_env):
    _, call, _ = api_env
    res = call(roles=["Petugas RS"], sub="auth0|petugas-mawar", path="/api/v1/kessan/data?kode_ppk=0202R002")
    body = res.json()
    assert res.status_code == 200 and res.headers["cache-control"] == "no-store"
    assert {b["kode_ppk"] for b in body["baris"]} == {"0101R001"} and len(body["baris"]) == 3
    assert body["rs"] == {"kode": "0101R001", "nama": "RSD MAWAR JEMBER"} and body["terkunci"] is True
    assert "MELATI" not in res.text


def test_petugas_rs_kode_akun_huruf_kecil_berspasi(api_env, monkeypatch):
    api, call, _ = api_env
    monkeypatch.setattr(api.pengguna_service, "status_akun", lambda sub, segar=False: {
        "wajib_ganti_sandi": False, "nonaktif": False, "diatur_ulang_pada": None, "kode_ppk": " 0101r001 "})
    res = call(roles=["Petugas RS"], sub="auth0|petugas-mawar")
    body = res.json()
    assert res.status_code == 200 and {b["kode_ppk"] for b in body["baris"]} == {"0101R001"}
    assert body["rs"] == {"kode": "0101R001", "nama": "RSD MAWAR JEMBER"} and "MELATI" not in res.text


def test_last_update_tak_terbaca_di_respons(api_env):
    _, call, isi = api_env
    isi["111"] = KESSAN_CSV.replace("2026-11-20 02:42:06", "kemarin sore")
    body = call().json()
    assert body["last_update_bi"] == "Last Update : kemarin sore"
    assert body["last_update_tanggal"] is None and body["bulan_sementara"] == []


def test_petugas_rs_login_lokal_ditolak_tanpa_data(monkeypatch, sumber):
    """Flag 1: akun lokal belum punya kode PPK, jadi Petugas RS ditolak 403 tanpa baris RS mana pun."""
    from login_uji import ENV, kepala_sesi
    api = load_api(monkeypatch, **ENV)
    monkeypatch.setattr(api, "kessan_service", ks)
    assert api.LOGIN_BFF
    headers, _ = kepala_sesi(api, monkeypatch, "petugas_rs")
    res = TestClient(api.app, base_url="https://testserver", raise_server_exceptions=False).get(
        "/api/v1/kessan/data", headers=headers)
    assert res.status_code == 403 and res.headers["cache-control"] == "no-store"
    assert "baris" not in res.json() and "Mawar" not in res.text and "MAWAR" not in res.text
    assert sumber[1] == []  # sheet tidak dibaca sama sekali
    admin, _ = kepala_sesi(api, monkeypatch, "admin", username="admin.uji@contoh.invalid")
    res = TestClient(api.app, base_url="https://testserver", raise_server_exceptions=False).get(
        "/api/v1/kessan/data", headers=admin)
    assert res.status_code == 200 and len(res.json()["baris"]) == 7


def test_petugas_tanpa_kode_ppk_ditolak(api_env):
    _, call, _ = api_env
    res = call(roles=["Petugas RS"], sub="auth0|petugas-kosong")
    assert res.status_code == 403 and "Mawar" not in res.text


def test_env_kosong_503(api_env, monkeypatch):
    _, call, _ = api_env
    monkeypatch.delenv(ks.ENV_SPREADSHEET)
    res = call()
    assert res.status_code == 503 and res.json() == {"detail": "Data Kessan belum dikonfigurasi."}
    assert res.headers["cache-control"] == "no-store"


def test_sheet_gagal_503_tanpa_detail(api_env):
    _, call, isi = api_env
    isi["111"] = RuntimeError(f"https://docs.google.com/spreadsheets/d/{ID_TIRUAN}/export")
    res = call()
    assert res.status_code == 503 and res.json() == {"detail": "Data Kessan belum bisa dimuat."}
    assert ID_TIRUAN not in res.text and "google" not in res.text
