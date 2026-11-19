"""Pemakaian ulang koneksi Postgres audit log dalam satu instans (tanpa jaringan: asyncpg.connect diganti)."""
import asyncio
import gc
import logging
import time
import weakref

import asyncpg
import pytest

import test_api_auth  # noqa: F401  (menambahkan api/ ke sys.path)
import audit_log  # noqa: E402

DSN_UJI = "postgresql://uji@db-uji.invalid/uji"


def _entri(status=403):
    return {"actor": "", "role": "", "action": "GET /api/v1/uji", "target": "/api/v1/uji", "status": status, "ip": ""}


class KoneksiPalsu:
    """Meniru bagian asyncpg.Connection yang dipakai audit_log dan mencatat setiap perintah.

    `galat` dilempar sebelum perintah dijalankan; `galat_setelah` dilempar sesudah perintah tercatat
    (balasan server hilang setelah perintah dieksekusi). `macet` membuat perintah tidak pernah dijawab
    sehingga berakhir dengan TimeoutError setelah batas waktunya, seperti koneksi setengah terbuka.
    """

    def __init__(self, nomor, command_timeout):
        self.nomor = nomor
        self.loop = asyncio.get_running_loop()  # koneksi asyncpg asli juga menyimpan loop pembuatnya
        self.command_timeout = command_timeout
        self.perintah = []
        self.ditutup = False
        self.ditutup_rapi = False
        self.dihentikan = False
        self.galat = None
        self.galat_setelah = None
        self.macet = False
        self.tunda = 0
        self.sedang = 0
        self.paralel_maks = 0
        self.tahan = None

    def is_closed(self):
        return self.ditutup

    async def _kerja(self, sql, timeout=None):
        assert asyncio.get_running_loop() is self.loop, "koneksi dipakai di loop lain"
        assert not self.ditutup, "koneksi yang sudah dibuang dipakai lagi"
        self.sedang += 1
        self.paralel_maks = max(self.paralel_maks, self.sedang)
        try:
            await asyncio.sleep(self.tunda)
            if self.macet:
                await asyncio.sleep(timeout if timeout is not None else self.command_timeout)
                raise asyncio.TimeoutError()
            if self.tahan is not None:
                await self.tahan
            if self.galat is not None:
                raise self.galat
            self.perintah.append(sql)
            await asyncio.sleep(0)
            if self.galat_setelah is not None:
                raise self.galat_setelah
        finally:
            self.sedang -= 1

    async def execute(self, sql, *args):
        await self._kerja(sql)
        return "INSERT 0 1"

    async def fetch(self, sql, *args):
        await self._kerja(sql)
        return []

    async def fetchval(self, sql, *args, timeout=None):
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
    """Mengganti asyncpg.connect dengan pabrik koneksi palsu.

    `gagal_sambung` membuat pembukaan koneksi galat, `tunda_sambung` memperlambatnya, dan
    `galat_koneksi_baru` dipasang pada setiap koneksi baru.
    """
    monkeypatch.setenv(audit_log.DSN_ENV, DSN_UJI)
    monkeypatch.setattr(audit_log, "_schema_ready", False)
    monkeypatch.setattr(audit_log, "_wadah_per_loop", {}, raising=False)
    keadaan = {"koneksi": [], "argumen": [], "gagal_sambung": None, "tunda_sambung": 0, "galat_koneksi_baru": None,
               "tunda_koneksi_baru": 0}

    async def sambung(dsn, **kw):
        keadaan["argumen"].append((dsn, kw))
        await asyncio.sleep(keadaan["tunda_sambung"])
        if keadaan["gagal_sambung"] is not None:
            raise keadaan["gagal_sambung"]
        conn = KoneksiPalsu(len(keadaan["koneksi"]) + 1, kw.get("command_timeout"))
        conn.galat = keadaan["galat_koneksi_baru"]
        conn.tunda = keadaan["tunda_koneksi_baru"]
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

    monkeypatch.setattr(audit_log, "_jam", lambda: (dasar_monoton + keadaan["geser"], dasar_dinding + keadaan["geser"]),
                        raising=False)
    return maju


def _jumlah_insert(conn):
    return sum(sql.startswith("INSERT") for sql in conn.perintah)


def _semua_insert(db):
    return sum(_jumlah_insert(c) for c in db["koneksi"])


def test_dua_catatan_berturut_turut_memakai_satu_koneksi(db):
    async def jalan():
        await audit_log.record(_entri())
        await audit_log.record(_entri(401))
        return db["koneksi"][0].ditutup

    ditutup_saat_loop_berjalan = asyncio.run(jalan())
    assert len(db["koneksi"]) == 1 and not ditutup_saat_loop_berjalan
    conn = db["koneksi"][0]
    assert _jumlah_insert(conn) == 2
    # Skema cukup sekali per proses meski koneksi dipakai ulang.
    assert conn.perintah[0] == audit_log.SCHEMA_SQL and conn.perintah.count(audit_log.SCHEMA_SQL) == 1


def test_baca_dan_tulis_berbagi_koneksi_yang_sama(db):
    async def jalan():
        await audit_log.record(_entri())
        return await audit_log.read_entries(limit=5)

    assert asyncio.run(jalan()) == []
    assert len(db["koneksi"]) == 1 and db["koneksi"][0].perintah[-1].startswith("SELECT")


def test_koneksi_dibuka_dengan_batas_waktu_dan_tanpa_cache_statement(db):
    asyncio.run(audit_log.record(_entri()))
    dsn, kw = db["argumen"][0]
    assert dsn == DSN_UJI
    assert kw == {"timeout": 5, "command_timeout": 5, "statement_cache_size": 0}


def test_loop_berbeda_membuka_koneksi_baru_dan_tidak_memakai_koneksi_loop_lain(db):
    asyncio.run(audit_log.record(_entri()))
    asyncio.run(audit_log.record(_entri()))
    pertama, kedua = db["koneksi"]
    assert pertama.loop is not kedua.loop
    assert _jumlah_insert(pertama) == 1 and _jumlah_insert(kedua) == 1


def test_koneksi_ditutup_rapi_saat_loop_pemiliknya_diakhiri(db):
    # Runtime yang membuat loop baru per permintaan (asyncio.run): koneksi loop itu tidak boleh tertinggal.
    asyncio.run(audit_log.record(_entri()))
    pertama = db["koneksi"][0]
    assert pertama.ditutup_rapi and not pertama.dihentikan
    asyncio.run(audit_log.record(_entri()))
    assert all(c.ditutup_rapi for c in db["koneksi"])
    assert audit_log._wadah_per_loop == {}


def test_koneksi_milik_loop_yang_sudah_selesai_tidak_ditahan_modul(db):
    asyncio.run(audit_log.record(_entri()))
    loop_lama = weakref.ref(db["koneksi"][0].loop)
    asyncio.run(audit_log.record(_entri()))
    db["koneksi"].clear()
    gc.collect()
    assert loop_lama() is None


@pytest.mark.parametrize("galat", [ConnectionResetError("reset"), asyncpg.exceptions.InterfaceError("connection is closed"),
                                   asyncpg.exceptions.ConnectionDoesNotExistError("koneksi tertutup"),
                                   asyncpg.exceptions.AdminShutdownError("shutdown")])
def test_galat_koneksi_saat_membaca_dicoba_sekali_dengan_koneksi_baru(db, galat):
    async def jalan():
        await audit_log.record(_entri())
        db["koneksi"][0].galat = galat
        return await audit_log.read_entries(limit=1)

    assert asyncio.run(jalan()) == []
    assert len(db["koneksi"]) == 2 and db["koneksi"][0].dihentikan
    assert db["koneksi"][1].perintah[-1].startswith("SELECT")


@pytest.mark.parametrize("galat", [asyncpg.exceptions.ConnectionDoesNotExistError("koneksi tertutup di tengah operasi"),
                                   ConnectionResetError("reset"), asyncpg.exceptions.InterfaceError("protokol")])
def test_galat_ambigu_setelah_insert_tidak_menulis_baris_kedua(db, galat, caplog):
    async def jalan():
        await audit_log.record(_entri())
        db["koneksi"][0].galat_setelah = galat  # INSERT sudah dieksekusi server, balasannya hilang
        with caplog.at_level(logging.ERROR, logger="sapa-api"):
            await audit_log.record(_entri(401))  # tidak melempar
        sesudah_galat = _semua_insert(db)
        await audit_log.record(_entri(401))
        return sesudah_galat

    assert asyncio.run(jalan()) == 2  # satu baris per panggilan record()
    assert f"Gagal menulis audit log: {type(galat).__name__}" in caplog.text
    lama, baru = db["koneksi"]
    assert lama.dihentikan and _jumlah_insert(baru) == 1


@pytest.mark.parametrize("galat", [asyncpg.exceptions.AdminShutdownError("shutdown"),
                                   asyncpg.exceptions.CannotConnectNowError("starting up")])
def test_penolakan_server_saat_menulis_dicoba_sekali_dengan_koneksi_baru(db, galat):
    # Galat yang dikirim server berarti perintah tidak dieksekusi, jadi aman diulang.
    async def jalan():
        await audit_log.record(_entri())
        db["koneksi"][0].galat = galat
        await audit_log.record(_entri(401))
        await audit_log.record(_entri(401))

    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and _jumlah_insert(lama) == 1
    assert _jumlah_insert(baru) == 2 and not baru.dihentikan


def test_koneksi_yang_sudah_tertutup_diganti_sebelum_dipakai(db):
    async def jalan():
        await audit_log.record(_entri())
        db["koneksi"][0].ditutup = True  # server memutus koneksi saat menganggur
        await audit_log.record(_entri())

    asyncio.run(jalan())
    assert len(db["koneksi"]) == 2 and _jumlah_insert(db["koneksi"][1]) == 1


def test_koneksi_yang_baru_dipakai_tidak_diperiksa_dulu(db, jam):
    async def jalan():
        await audit_log.record(_entri())
        jam(audit_log.AMBANG_PERIKSA - 1)
        await audit_log.record(_entri())

    asyncio.run(jalan())
    assert len(db["koneksi"]) == 1 and "SELECT 1" not in db["koneksi"][0].perintah


def test_koneksi_menganggur_diperiksa_dulu_sebelum_menulis(db, jam):
    async def jalan():
        await audit_log.record(_entri())
        jam(audit_log.AMBANG_PERIKSA + 1)
        await audit_log.record(_entri())

    asyncio.run(jalan())
    conn, = db["koneksi"]
    assert conn.perintah[-2] == "SELECT 1" and conn.perintah[-1].startswith("INSERT")


def test_koneksi_setengah_terbuka_diganti_tanpa_kehilangan_baris(db, jam, monkeypatch):
    monkeypatch.setattr(audit_log, "BATAS_PERIKSA", 0.05, raising=False)
    monkeypatch.setattr(audit_log, "COMMAND_TIMEOUT", 0.5)

    async def jalan():
        await audit_log.record(_entri())
        jam(audit_log.AMBANG_PERIKSA + 1)
        db["koneksi"][0].macet = True  # server hilang tanpa memutus koneksi
        mulai = time.monotonic()
        await audit_log.record(_entri(401))
        return time.monotonic() - mulai

    lama_catat = asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and _jumlah_insert(lama) == 1 and _jumlah_insert(baru) == 1
    assert lama_catat < 0.4  # menunggu batas pemeriksaan singkat, bukan batas waktu perintah


def test_koneksi_menganggur_terlalu_lama_dibuang_tanpa_diperiksa(db, jam):
    async def jalan():
        await audit_log.record(_entri())
        jam(audit_log.MAKS_MENGANGGUR + 1)
        await audit_log.record(_entri())

    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and "SELECT 1" not in lama.perintah and _jumlah_insert(baru) == 1


def test_galat_permanen_ditelan_record_dan_dilempar_read_entries(db, caplog):
    async def tulis_lalu_rusak():
        await audit_log.record(_entri())
        db["koneksi"][0].galat = ConnectionResetError("reset")
        db["gagal_sambung"] = OSError("tidak terjangkau")
        with caplog.at_level(logging.ERROR, logger="sapa-api"):
            await audit_log.record(_entri())  # tidak melempar
        sambung_sesudah_tulis = len(db["argumen"])
        with pytest.raises(OSError):
            await audit_log.read_entries(limit=1)
        return sambung_sesudah_tulis, len(db["argumen"])

    sesudah_tulis, sesudah_baca = asyncio.run(tulis_lalu_rusak())
    # Galat ambigu saat menulis tidak diulang; baca membuka satu koneksi baru yang gagal lalu galatnya dilempar.
    assert sesudah_tulis == 1 and sesudah_baca == 2
    assert db["koneksi"][0].dihentikan
    assert "Gagal menulis audit log: ConnectionResetError" in caplog.text


def test_galat_saat_percobaan_ulang_juga_dilempar_read_entries(db):
    async def jalan():
        await audit_log.record(_entri())
        db["koneksi"][0].galat = ConnectionResetError("reset")
        db["galat_koneksi_baru"] = asyncpg.exceptions.ConnectionDoesNotExistError("putus lagi")
        await audit_log.read_entries(limit=1)

    with pytest.raises(asyncpg.exceptions.ConnectionDoesNotExistError):
        asyncio.run(jalan())
    assert len(db["koneksi"]) == 2 and all(c.dihentikan for c in db["koneksi"])


def test_gagal_membuka_koneksi_baru_tidak_diulang(db):
    db["gagal_sambung"] = OSError("tidak terjangkau")

    async def jalan():
        await audit_log.record(_entri())
        with pytest.raises(OSError):
            await audit_log.read_entries(limit=1)

    asyncio.run(jalan())
    assert len(db["argumen"]) == 2  # satu kali per panggilan, sama seperti sebelumnya


def test_galat_bukan_koneksi_tidak_membuang_koneksi(db):
    async def jalan():
        await audit_log.record(_entri())
        db["koneksi"][0].galat = asyncpg.exceptions.RaiseError("audit_log hanya bisa ditambah")
        with pytest.raises(asyncpg.exceptions.RaiseError):
            await audit_log.read_entries(limit=1)
        db["koneksi"][0].galat = None
        await audit_log.record(_entri())

    asyncio.run(jalan())
    assert len(db["koneksi"]) == 1 and _jumlah_insert(db["koneksi"][0]) == 2


def test_query_melewati_batas_waktu_membuang_koneksi_tanpa_mengulang(db):
    async def jalan():
        await audit_log.record(_entri())
        db["koneksi"][0].galat = asyncio.TimeoutError()
        with pytest.raises(asyncio.TimeoutError):
            await audit_log.read_entries(limit=1)
        await audit_log.record(_entri())

    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and _jumlah_insert(baru) == 1


def test_catatan_serentak_tidak_menjalankan_query_paralel_pada_satu_koneksi(db):
    async def jalan():
        await asyncio.gather(*(audit_log.record(_entri()) for _ in range(6)),
                             audit_log.read_entries(limit=1))

    asyncio.run(jalan())
    assert all(c.paralel_maks == 1 for c in db["koneksi"])
    assert _semua_insert(db) == 6


def test_catatan_serentak_tidak_saling_menunggu(db):
    db["tunda_koneksi_baru"] = 0.1

    async def jalan():
        await audit_log.record(_entri())
        mulai = time.monotonic()
        await asyncio.gather(*(audit_log.record(_entri()) for _ in range(8)))
        return time.monotonic() - mulai

    lama = asyncio.run(jalan())
    assert _semua_insert(db) == 9 and all(c.paralel_maks == 1 for c in db["koneksi"])
    assert lama < 0.4  # bergiliran pada satu koneksi butuh sekitar 8 x 0,1 detik


def test_catatan_serentak_saat_db_tidak_terjangkau_gagal_bersamaan(db, caplog):
    db["tunda_sambung"] = 0.2
    db["gagal_sambung"] = asyncio.TimeoutError()

    async def jalan():
        mulai = time.monotonic()
        with caplog.at_level(logging.ERROR, logger="sapa-api"):
            await asyncio.gather(*(audit_log.record(_entri()) for _ in range(6)))
        return time.monotonic() - mulai

    lama = asyncio.run(jalan())
    assert lama < 0.45  # sekitar satu batas waktu, bukan 6 x 0,2 detik
    assert caplog.text.count("Gagal menulis audit log: TimeoutError") == 6


def test_koneksi_siaga_dibatasi_setelah_lonjakan(db):
    db["tunda_koneksi_baru"] = 0.05

    async def jalan():
        await asyncio.gather(*(audit_log.record(_entri()) for _ in range(audit_log.MAKS_KONEKSI_SIAGA + 3)))
        terbuka = [c for c in db["koneksi"] if not c.ditutup]
        sambung_sebelum = len(db["argumen"])
        await audit_log.record(_entri())
        return terbuka, sambung_sebelum

    terbuka, sambung_sebelum = asyncio.run(jalan())
    assert len(db["koneksi"]) == audit_log.MAKS_KONEKSI_SIAGA + 3
    assert len(terbuka) == audit_log.MAKS_KONEKSI_SIAGA
    assert all(c.ditutup_rapi for c in db["koneksi"] if c not in terbuka)
    assert len(db["argumen"]) == sambung_sebelum  # catatan berikutnya memakai koneksi siaga


def test_skema_dibuat_sekali_meski_catatan_pertama_serentak(db):
    db["tunda_koneksi_baru"] = 0.02

    async def jalan():
        await asyncio.gather(*(audit_log.record(_entri()) for _ in range(5)))

    asyncio.run(jalan())
    assert sum(c.perintah.count(audit_log.SCHEMA_SQL) for c in db["koneksi"]) == 1
    assert _semua_insert(db) == 5


def test_skema_gagal_dibuat_tidak_membuat_catatan_lain_antre(db, caplog):
    db["tunda_koneksi_baru"] = 0.2
    db["galat_koneksi_baru"] = asyncio.TimeoutError()

    async def jalan():
        mulai = time.monotonic()
        with caplog.at_level(logging.ERROR, logger="sapa-api"):
            await asyncio.gather(*(audit_log.record(_entri()) for _ in range(4)))
        return time.monotonic() - mulai

    lama = asyncio.run(jalan())
    assert lama < 0.5  # semua gagal bersama pembuatan skema pertama, tidak bergiliran 4 x 0,2 detik
    assert caplog.text.count("Gagal menulis audit log") == 4
    assert audit_log._schema_ready is False


def test_permintaan_yang_dibatalkan_membuang_koneksi(db):
    async def jalan():
        await audit_log.record(_entri())
        conn = db["koneksi"][0]
        conn.tahan = asyncio.get_running_loop().create_future()
        tugas = asyncio.ensure_future(audit_log.record(_entri()))
        await asyncio.sleep(0.01)
        tugas.cancel()
        with pytest.raises(asyncio.CancelledError):
            await tugas
        conn.tahan = None
        await audit_log.record(_entri())

    asyncio.run(jalan())
    lama, baru = db["koneksi"]
    assert lama.dihentikan and _jumlah_insert(lama) == 1 and _jumlah_insert(baru) == 1


def test_tanpa_dsn_tidak_ada_koneksi(db, monkeypatch, caplog):
    monkeypatch.delenv(audit_log.DSN_ENV)

    async def jalan():
        with caplog.at_level(logging.WARNING, logger="sapa-api"):
            await audit_log.record(_entri())
        return await audit_log.read_entries(limit=1)

    assert asyncio.run(jalan()) == []
    assert db["argumen"] == [] and db["koneksi"] == []
    assert "Audit log belum dikonfigurasi" in caplog.text
    assert audit_log._wadah_per_loop == {}


@pytest.mark.parametrize("method,path,status,query,harap", [
    ("GET", "/api/v1/fktp-antrol-stats", 200, "", False),
    ("GET", "/api/v1/fktp-antrol-stats", 401, "", True),
    ("GET", "/api/v1/fktp-antrol-stats", 403, "", True),
    ("GET", "/api/v1/fktp-antrol-stats", 200, "refresh=true", True),
    ("GET", "/api/v1/audit-log", 200, "", True),
    ("GET", "/api/v1/auth/masuk", 405, "", False),
    ("POST", "/api/v1/auth/masuk", 200, "", True),
    ("GET", "/halaman", 403, "", False),
])
def test_aturan_pencatatan_tidak_berubah(method, path, status, query, harap):
    assert audit_log.should_record(method, path, status, query) is harap
