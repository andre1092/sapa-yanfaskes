"""Pemakaian ulang koneksi Postgres penyimpanan sesi dalam satu instans (tanpa jaringan: asyncpg.connect diganti)."""
import asyncio
import time
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

import test_api_auth  # noqa: F401  (menambahkan api/ ke sys.path)
import sesi_service as ss  # noqa: E402

DSN_UJI = "postgresql://uji@db-uji.invalid/sesi"
WAKTU = datetime(2026, 11, 19, 8, 0, tzinfo=timezone.utc)


class KoneksiPalsu:
    """Meniru bagian asyncpg.Connection yang dipakai PostgresSesiStore dan mencatat setiap perintah.

    `galat` dilempar sebelum perintah dijalankan (sekali bila `galat_sekali`); `macet` membuat perintah
    tidak pernah dijawab sampai batas waktunya; `tahan` menahan perintah sampai Future itu selesai.
    """

    def __init__(self, nomor, command_timeout):
        self.nomor = nomor
        self.loop = asyncio.get_running_loop()
        self.command_timeout = command_timeout
        self.perintah = []
        self.ditutup = False
        self.ditutup_rapi = False
        self.dihentikan = False
        self.galat = None
        self.galat_sekali = False
        self.macet = False
        self.tahan = None
        self.sedang = 0
        self.paralel_maks = 0

    def is_closed(self):
        return self.ditutup

    async def _kerja(self, sql, timeout=None):
        assert asyncio.get_running_loop() is self.loop, "koneksi dipakai di loop lain"
        assert not self.ditutup, "koneksi yang sudah dibuang dipakai lagi"
        self.sedang += 1
        self.paralel_maks = max(self.paralel_maks, self.sedang)
        try:
            await asyncio.sleep(0)
            if self.macet:
                await asyncio.sleep(timeout if timeout is not None else self.command_timeout)
                raise asyncio.TimeoutError()
            if self.tahan is not None:
                await self.tahan
            if self.galat is not None:
                galat = self.galat
                if self.galat_sekali:
                    self.galat = None
                raise galat
            self.perintah.append(sql)
        finally:
            self.sedang -= 1

    async def execute(self, sql, *args):
        await self._kerja(sql)
        return "UPDATE 1"

    async def fetchrow(self, sql, *args):
        await self._kerja(sql)
        return None

    async def fetchval(self, sql, *args, timeout=None):
        self.timeout_terakhir = timeout
        await self._kerja(sql, timeout)
        return 1

    async def close(self, *, timeout=None):
        self.ditutup = True
        self.ditutup_rapi = True

    def terminate(self):
        self.ditutup = True
        self.dihentikan = True


@pytest.fixture
def db(monkeypatch):
    """Mengganti asyncpg.connect dengan pabrik koneksi palsu; `gagal_sambung` membuat pembukaan koneksi galat
    dan `galat_koneksi_baru` dipasang pada setiap koneksi baru."""
    monkeypatch.setattr(ss, "_kolam_per_loop", {}, raising=False)
    monkeypatch.setattr(ss, "pasang_executor_dns", lambda: None)
    keadaan = {"koneksi": [], "argumen": [], "gagal_sambung": None, "galat_koneksi_baru": None, "tahan": None}

    async def sambung(dsn, **kw):
        keadaan["argumen"].append((dsn, kw))
        await asyncio.sleep(0)
        if keadaan["gagal_sambung"] is not None:
            raise keadaan["gagal_sambung"]
        conn = KoneksiPalsu(len(keadaan["koneksi"]) + 1, kw.get("command_timeout"))
        conn.galat = keadaan["galat_koneksi_baru"]
        conn.tahan = keadaan["tahan"]
        keadaan["koneksi"].append(conn)
        return conn

    monkeypatch.setattr(asyncpg, "connect", sambung)
    return keadaan


@pytest.fixture
def jam(monkeypatch):
    """Jam palsu untuk lama menganggur koneksi; `maju(detik)` memajukan jam monoton dan jam dinding."""
    keadaan = {"geser": 0.0}
    dasar_monoton, dasar_dinding = time.monotonic(), time.time()

    def maju(detik):
        keadaan["geser"] += detik

    monkeypatch.setattr(ss, "_jam", lambda: (dasar_monoton + keadaan["geser"], dasar_dinding + keadaan["geser"]),
                        raising=False)
    return maju


def _store(dsn=DSN_UJI):
    return ss.PostgresSesiStore(dsn)


def _tulis(pg):
    return pg.sentuh("id-uji", WAKTU)


def _sesi_aktif(conn):
    return sum(sql.startswith("UPDATE sapa_sesi SET terakhir_dipakai") for sql in conn.perintah)


# --- pemakaian ulang ---------------------------------------------------------------------------------

def test_dua_operasi_berturut_turut_memakai_satu_koneksi(db):
    pg = _store()

    async def jalan():
        await pg.ambil("id-uji")
        await _tulis(pg)
        await pg.baca_batas("k", 1)
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert conn.perintah[0] == ss.SCHEMA_SQL  # skema tetap dibuat sekali, di koneksi pertama
    assert len(conn.perintah) == 4


def test_koneksi_dibuka_dengan_batas_waktu_dan_tanpa_cache_statement(db):
    asyncio.run(_store().cek())
    [(dsn, kw)] = db["argumen"]
    assert dsn == DSN_UJI
    assert kw == {"timeout": ss.TIMEOUT_DB, "command_timeout": ss.TIMEOUT_DB, "statement_cache_size": 0}


def test_satu_koneksi_meminjam_koneksi_siaga_dan_mengembalikannya(db):
    pg = _store()

    async def jalan():
        await pg.cek()
        async with ss.satu_koneksi(ss._monoton() + 5):
            await pg.ambil("id-uji")
            await pg.ambil("id-uji")
        await pg.cek()
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert len(conn.perintah) == 5 and not conn.dihentikan


def test_loop_berbeda_tidak_memakai_koneksi_loop_lain(db):
    pg = _store()
    asyncio.run(pg.cek())
    asyncio.run(pg.cek())
    assert len(db["koneksi"]) == 2


def test_koneksi_siaga_ditutup_rapi_saat_loop_diakhiri(db):
    asyncio.run(_store().cek())
    [conn] = db["koneksi"]
    assert conn.ditutup_rapi and not conn.dihentikan
    assert ss._kolam_per_loop == {}


def test_koneksi_dsn_lain_tidak_dipakai(db):
    async def jalan():
        await _store().cek()
        await _store("postgresql://uji@db-lain.invalid/sesi").cek()
    asyncio.run(jalan())
    assert [dsn for dsn, _ in db["argumen"]] == [DSN_UJI, "postgresql://uji@db-lain.invalid/sesi"]


def test_operasi_serentak_memakai_koneksi_sendiri_dan_siaga_dibatasi(db):
    pg = _store()
    jumlah = ss.MAKS_KONEKSI_SIAGA + 2

    async def jalan():
        await pg.cek()  # skema siap
        tahan = db["tahan"] = asyncio.get_running_loop().create_future()
        db["koneksi"][0].tahan = tahan
        tugas = [asyncio.ensure_future(pg.ambil("id-uji")) for _ in range(jumlah)]
        await asyncio.sleep(0.01)
        tahan.set_result(None)
        await asyncio.gather(*tugas)
        kolam = ss._kolam_loop()
        return len(kolam.siaga)
    siaga = asyncio.run(jalan())
    assert len(db["koneksi"]) == jumlah
    assert all(conn.paralel_maks == 1 for conn in db["koneksi"])
    assert siaga == ss.MAKS_KONEKSI_SIAGA
    assert sum(conn.ditutup_rapi for conn in db["koneksi"]) == jumlah  # sisanya ditutup saat loop berakhir


# --- koneksi siaga yang menganggur -------------------------------------------------------------------

def test_koneksi_yang_baru_dipakai_tidak_diperiksa_dulu(db, jam):
    pg = _store()

    async def jalan():
        await pg.cek()
        jam(ss.AMBANG_PERIKSA - 1)
        await _tulis(pg)
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert conn.perintah.count("SELECT 1") == 1  # hanya cek() sendiri


def test_koneksi_menganggur_diperiksa_dulu_sebelum_dipakai(db, jam):
    pg = _store()

    async def jalan():
        await pg.cek()
        jam(ss.AMBANG_PERIKSA + 1)
        await _tulis(pg)
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert conn.perintah[-2:] == ["SELECT 1", "UPDATE sapa_sesi SET terakhir_dipakai = $2 WHERE id_hash = $1"]


def test_koneksi_menganggur_yang_putus_diganti_sebelum_menulis(db, jam):
    pg = _store()

    async def jalan():
        await pg.cek()
        jam(ss.AMBANG_PERIKSA + 1)
        db["koneksi"][0].galat = asyncpg.exceptions.ConnectionDoesNotExistError("ditutup server")
        await _tulis(pg)
    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and _sesi_aktif(lama) == 0
    assert _sesi_aktif(baru) == 1


def test_pemeriksaan_koneksi_dibatasi_waktu(db, jam):
    pg = _store()

    async def jalan():
        await pg.cek()
        jam(ss.AMBANG_PERIKSA + 1)
        db["koneksi"][0].macet = True
        await _tulis(pg)
    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and _sesi_aktif(baru) == 1
    assert lama.timeout_terakhir == ss.BATAS_PERIKSA  # bukan command_timeout


def test_paling_banyak_satu_pemeriksaan_per_pinjaman(db, jam):
    """Koneksi siaga lain yang sama-sama menganggur dibuang tanpa diperiksa, supaya waktu terburuk satu operasi
    tetap BATAS_PERIKSA + connect + command (WAKTU_TERBURUK_DB)."""
    pg = _store()

    async def jalan():
        await pg.cek()
        tahan = db["tahan"] = asyncio.get_running_loop().create_future()
        db["koneksi"][0].tahan = tahan
        tugas = [asyncio.ensure_future(pg.cek()) for _ in range(3)]
        await asyncio.sleep(0.01)
        tahan.set_result(None)
        await asyncio.gather(*tugas)
        db["tahan"] = None
        assert len(ss._kolam_loop().siaga) == 3
        jam(ss.AMBANG_PERIKSA + 1)
        for conn in db["koneksi"]:
            conn.tahan = None
            conn.macet = True
        await _tulis(pg)
    asyncio.run(jalan())
    lama, baru = db["koneksi"][:3], db["koneksi"][3]
    assert all(conn.dihentikan for conn in lama)
    assert sum(conn.timeout_terakhir == ss.BATAS_PERIKSA for conn in lama) == 1
    assert _sesi_aktif(baru) == 1


def test_pembatalan_saat_pemeriksaan_menghentikan_koneksi(db, jam):
    pg = _store()

    async def jalan():
        await pg.cek()
        jam(ss.AMBANG_PERIKSA + 1)
        db["koneksi"][0].macet = True
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(pg.ambil("id-uji"), 0.05)
        assert ss._kolam_loop().siaga == []
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert conn.dihentikan and not conn.ditutup_rapi


def test_koneksi_yang_dikembalikan_sesudah_loop_ditutup_tidak_disimpan(db):
    async def jalan():
        kolam = ss._kolam_loop()
        await _store().cek()
        [conn] = db["koneksi"]
        kolam.siaga.clear()
        kolam.ditutup = True  # penjaga loop sudah menutup daftar siaga
        await kolam.kembalikan(conn, DSN_UJI, 1)
        assert conn.ditutup_rapi and kolam.siaga == []  # diperiksa sebelum loop berakhir
    asyncio.run(jalan())


def test_koneksi_menganggur_terlalu_lama_dibuang_tanpa_diperiksa(db, jam):
    pg = _store()

    async def jalan():
        await pg.cek()
        jam(ss.MAKS_MENGANGGUR + 1)
        await _tulis(pg)
    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and lama.perintah.count("SELECT 1") == 1
    assert _sesi_aktif(baru) == 1


def test_lama_menganggur_memakai_jam_dinding_bila_instans_dibekukan(monkeypatch):
    sejak = (100.0, 1000.0)
    monkeypatch.setattr(ss, "_jam", lambda: (100.0, 1000.0 + ss.MAKS_MENGANGGUR + 1))  # monoton tidak maju
    assert ss._lama_menganggur(sejak) > ss.MAKS_MENGANGGUR


def test_koneksi_yang_sudah_tertutup_diganti_sebelum_dipakai(db):
    pg = _store()

    async def jalan():
        await pg.cek()
        db["koneksi"][0].ditutup = True
        await _tulis(pg)
    asyncio.run(jalan())
    assert len(db["koneksi"]) == 2 and _sesi_aktif(db["koneksi"][1]) == 1


# --- galat -------------------------------------------------------------------------------------------

@pytest.mark.parametrize("galat", [ConnectionResetError("reset"), asyncpg.exceptions.InterfaceError("connection is closed"),
                                   asyncpg.exceptions.ConnectionDoesNotExistError("koneksi tertutup"),
                                   asyncpg.exceptions.AdminShutdownError("shutdown")])
def test_galat_koneksi_saat_membaca_dicoba_sekali_dengan_koneksi_baru(db, galat):
    pg = _store()

    async def jalan():
        await pg.cek()
        db["koneksi"][0].galat = galat
        return await pg.baca_batas("k", 1)
    assert asyncio.run(jalan()) == 1
    lama, baru = db["koneksi"]
    assert lama.dihentikan and not baru.dihentikan
    assert baru.ditutup_rapi  # kembali ke daftar siaga, lalu ditutup saat loop berakhir


@pytest.mark.parametrize("galat", [ConnectionResetError("reset"),
                                   asyncpg.exceptions.ConnectionDoesNotExistError("koneksi tertutup"),
                                   asyncpg.exceptions.AdminShutdownError("shutdown")])
def test_galat_koneksi_saat_menulis_tidak_diulang(db, galat):
    """Perintah tulis yang mungkin sudah dieksekusi tidak diulang: hitungan pembatas tidak bertambah dua kali."""
    pg = _store()

    async def jalan():
        await pg.cek()
        db["koneksi"][0].galat = galat
        with pytest.raises(type(galat)):
            await pg.tambah_batas("k", 1, WAKTU)
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert conn.dihentikan


def test_galat_koneksi_saat_menulis_di_satu_koneksi_tidak_diulang(db):
    pg = _store()

    async def jalan():
        await pg.cek()
        db["koneksi"][0].galat = ConnectionResetError("reset")
        async with ss.satu_koneksi(ss._monoton() + 5):
            with pytest.raises(ConnectionResetError):
                await pg.tambah_batas("k", 1, WAKTU)
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert conn.dihentikan


def test_galat_baca_sesudah_koneksi_terbukti_sehat_di_blok_tidak_diulang(db):
    pg = _store()

    async def jalan():
        await pg.cek()
        async with ss.satu_koneksi(ss._monoton() + 5):
            await pg.ambil("id-uji")
            db["koneksi"][0].galat = ConnectionResetError("reset")
            with pytest.raises(ConnectionResetError):
                await pg.ambil("id-uji")
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert conn.dihentikan


def test_galat_koneksi_di_layanan_menjadi_belum_siap(db, monkeypatch):
    pg = _store()
    monkeypatch.setattr(ss, "_store", pg)

    async def jalan():
        await pg.cek()
        db["koneksi"][0].galat = ConnectionResetError("reset")
        with pytest.raises(ss.SesiBelumSiap):
            await ss.sentuh("id-uji", WAKTU)
        await ss.sentuh("id-uji", WAKTU)  # permintaan berikutnya memakai koneksi baru
    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and _sesi_aktif(baru) == 1


def test_gagal_membuka_koneksi_baru_tidak_diulang(db):
    db["gagal_sambung"] = OSError("tidak terjangkau")
    with pytest.raises(OSError):
        asyncio.run(_store().baca_batas("k", 1))
    assert len(db["argumen"]) == 1


def test_galat_di_koneksi_baru_tidak_diulang(db):
    db["galat_koneksi_baru"] = asyncpg.exceptions.ConnectionDoesNotExistError("putus")
    with pytest.raises(asyncpg.exceptions.ConnectionDoesNotExistError):
        asyncio.run(_store().baca_batas("k", 1))
    [conn] = db["koneksi"]
    assert conn.dihentikan


def test_galat_saat_percobaan_ulang_dilempar(db):
    pg = _store()

    async def jalan():
        await pg.cek()
        db["koneksi"][0].galat = ConnectionResetError("reset")
        db["galat_koneksi_baru"] = asyncpg.exceptions.ConnectionDoesNotExistError("putus lagi")
        with pytest.raises(asyncpg.exceptions.ConnectionDoesNotExistError):
            await pg.baca_batas("k", 1)
    asyncio.run(jalan())
    assert len(db["koneksi"]) == 2 and all(conn.dihentikan for conn in db["koneksi"])


def test_batas_waktu_perintah_membuang_koneksi_tanpa_mengulang(db, monkeypatch):
    pg = _store()

    async def jalan():
        await pg.cek()
        db["koneksi"][0].galat = asyncio.TimeoutError()
        with pytest.raises(asyncio.TimeoutError):
            await pg.baca_batas("k", 1)
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert conn.dihentikan


def test_penolakan_server_biasa_tidak_membuang_koneksi(db):
    pg = _store()

    async def jalan():
        await pg.cek()
        db["koneksi"][0].galat = asyncpg.exceptions.UniqueViolationError("duplikat")
        db["koneksi"][0].galat_sekali = True
        with pytest.raises(asyncpg.exceptions.UniqueViolationError):
            await _tulis(pg)
        await _tulis(pg)
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert not conn.dihentikan and _sesi_aktif(conn) == 1


def test_galat_tak_dikenal_membuang_koneksi(db):
    pg = _store()

    async def jalan():
        await pg.cek()
        db["koneksi"][0].galat = RuntimeError("tak terduga")
        with pytest.raises(RuntimeError):
            await _tulis(pg)
        await _tulis(pg)
    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.ditutup and _sesi_aktif(baru) == 1


def test_operasi_yang_dibatalkan_menghentikan_koneksi(db):
    pg = _store()

    async def jalan():
        await pg.cek()
        db["koneksi"][0].macet = True
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(_tulis(pg), 0.05)
        db["koneksi"][0].macet = False
        await _tulis(pg)
    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and not lama.ditutup_rapi and _sesi_aktif(baru) == 1


def test_galat_koneksi_di_satu_koneksi_membaca_dicoba_sekali_lalu_dipakai_sisa_blok(db):
    pg = _store()

    async def jalan():
        await pg.cek()
        db["koneksi"][0].galat = ConnectionResetError("reset")
        async with ss.satu_koneksi(ss._monoton() + 5):
            await pg.ambil("id-uji")
            await pg.ambil("id-uji")
    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and len(baru.perintah) == 2


def test_satu_koneksi_dibatalkan_saat_menunggu_tetap_mengembalikan_koneksi(db):
    """Pembatalan di luar perintah DB (mis. saat jeda menunggu penyegar) tidak merusak koneksi."""
    pg = _store()

    async def blok():
        async with ss.satu_koneksi(ss._monoton() + 5):
            await pg.ambil("id-uji")
            await asyncio.sleep(1)

    async def jalan():
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(blok(), 0.05)
        await pg.cek()
    asyncio.run(jalan())
    [conn] = db["koneksi"]
    assert not conn.dihentikan and conn.perintah[-1] == "SELECT 1"


# --- sewa penyegaran ---------------------------------------------------------------------------------

def test_sewa_penyegaran_mencakup_pemeriksaan_koneksi_siaga():
    """Simpanan hasil penyegaran terburuk: periksa koneksi siaga, lalu koneksi baru dan perintahnya."""
    assert ss.WAKTU_TERBURUK_DB >= ss.BATAS_PERIKSA + 2 * ss.TIMEOUT_DB
    assert ss.UMUR_KUNCI_SEGAR == timedelta(seconds=ss.BATAS_SEBELUM_AUTH0 + ss.WAKTU_TERBURUK_AUTH0 + ss.WAKTU_TERBURUK_DB)
