"""Riwayat aktivitas (audit log) di Postgres Neon, hanya bisa ditambah.

Yang dicatat: akses ditolak (401/403) dan tindakan admin (sinkronisasi, muat ulang,
ekspor, unggah dan unduh data SSBI, email verifikasi, membuka log, masuk dan keluar lewat
login satu halaman, penyiapan atau pemulihan akun, ubah sandi, dan baris akun yang ditolak saat revalidasi
karena tidak utuh atau dikembalikan ke versi lama). Tidak mencatat email, token, sandi, kode, hash, atau isi data.
Kegagalan menulis log tidak pernah menggagalkan permintaan pengguna.

Koneksi ke Postgres audit dipakai ulang lintas permintaan dalam instans yang sama. Setiap event loop punya
daftar koneksi siaga sendiri (koneksi asyncpg terikat ke loop pembuatnya). Sebuah permintaan meminjam satu
koneksi siaga, atau membuka koneksi baru bila tidak ada yang siaga, lalu mengembalikannya; satu koneksi
hanya dipakai satu permintaan pada satu waktu dan permintaan serentak tidak saling menunggu. Koneksi siaga
ditutup saat loop pemiliknya diakhiri.
"""
import asyncio
import logging
import os
import re
import threading
import time
from datetime import datetime
from typing import Optional

logger = logging.getLogger("sapa-api")

DSN_ENV = "AUDIT_DB_DATABASE_URL"
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    status INTEGER NOT NULL,
    ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC);
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log hanya bisa ditambah';
END
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
"""

_ACTION_PATHS = re.compile(r"^/api/v1/(fkrtl-export|ssbi-jadwal/(periksa|integrasikan|detail)|surat-kontrol/(periksa|integrasikan)|surat-kontrol-detail/(periksa|integrasikan|detail)|auth/(send-verification-email|masuk|keluar|siapkan-akun)|audit-log|akun/(ganti-sandi|ubah-sandi)|pengguna-fkrtl(/[^/]+(/(atur-ulang-sandi|undangan|username))?)?)$")
# Rute login satu halaman hanya ada bila SAPA_LOGIN_BFF=1; selain POST, dan 404/405 (rute tidak ada, metode salah,
# atau penyiapan akun tidak tersedia), tidak dicatat.
_AUTH_BFF_PATHS = re.compile(r"^/api/v1/(auth/(masuk|keluar|siapkan-akun)|akun/ubah-sandi)$")
_schema_ready = False
_TANPA_DSN = object()
CONNECT_TIMEOUT = 5
COMMAND_TIMEOUT = 5
# Koneksi siaga yang menganggur lebih lama dari AMBANG_PERIKSA detik diperiksa dulu dengan SELECT 1 (batas
# BATAS_PERIKSA detik); yang menganggur lebih dari MAKS_MENGANGGUR detik dibuang tanpa diperiksa.
AMBANG_PERIKSA = 30
BATAS_PERIKSA = 2
MAKS_MENGANGGUR = 240
# Jumlah koneksi siaga per loop; koneksi lebih dari ini ditutup setelah dipakai.
MAKS_KONEKSI_SIAGA = 4
BATAS_TUTUP = 2


def _jam() -> tuple:
    """Waktu monoton dan waktu dinding. Lama menganggur memakai yang terbesar dari keduanya supaya instans yang
    dibekukan lalu dilanjutkan tetap terhitung lama menganggur walau jam monotonnya tidak maju."""
    return time.monotonic(), time.time()


def _lama_menganggur(sejak: tuple) -> float:
    monoton, dinding = _jam()
    return max(monoton - sejak[0], dinding - sejak[1])


def _galat_koneksi() -> tuple:
    """Galat yang menandakan koneksi tidak bisa dipakai lagi (putus, ditutup server, atau soket galat)."""
    from asyncpg import exceptions as e

    return (OSError, asyncio.TimeoutError, e.InterfaceError, e.PostgresConnectionError, e.AdminShutdownError, e.CrashShutdownError,
            e.CannotConnectNowError)


def _ditolak_server(exc: BaseException) -> bool:
    """True bila galat dikirim server sebagai jawaban atas perintah: perintah itu tidak dieksekusi (transaksi
    implisitnya batal), jadi aman diulang. ConnectionDoesNotExistError dibuat klien saat koneksi putus di tengah
    perintah sehingga tidak pasti apakah perintah sudah dieksekusi."""
    from asyncpg import exceptions as e

    return isinstance(exc, e.PostgresError) and not isinstance(exc, e.ConnectionDoesNotExistError)


def _hentikan(conn) -> None:
    """Memutus koneksi seketika tanpa menunggu server."""
    try:
        conn.terminate()
    except Exception as exc:
        logger.warning("Koneksi audit log tidak dapat dihentikan: %s", type(exc).__name__)


async def _tutup(conn) -> None:
    """Menutup koneksi dengan pesan penutupan ke server; bila gagal atau melewati batas, koneksi dihentikan."""
    try:
        await conn.close(timeout=BATAS_TUTUP)
    except Exception:
        _hentikan(conn)
    except BaseException:
        _hentikan(conn)
        raise


class _WadahLoop:
    """Koneksi siaga milik satu event loop dan status pembuatan skema di loop itu."""

    def __init__(self):
        self.siaga = []  # (koneksi, dsn, waktu mulai menganggur), yang terakhir dikembalikan di ujung
        self.skema = None  # Future pembuatan skema yang sedang berjalan di loop ini
        self.ditutup = False
        self.penjaga = None

    async def pinjam(self, dsn: str):
        """Koneksi siaga yang masih layak (dipakai_ulang=True) atau koneksi baru (dipakai_ulang=False)."""
        while self.siaga:
            conn, dsn_conn, sejak = self.siaga.pop()
            menganggur = _lama_menganggur(sejak)
            if dsn_conn != dsn or conn.is_closed() or menganggur > MAKS_MENGANGGUR:
                _hentikan(conn)
                continue
            if menganggur > AMBANG_PERIKSA:
                try:
                    await conn.fetchval("SELECT 1", timeout=BATAS_PERIKSA)
                except Exception:
                    # Koneksi siaga lain lebih lama menganggur: kemungkinan bernasib sama, jadi ikut dibuang.
                    _hentikan(conn)
                    self.buang_semua()
                    break
                except BaseException:
                    _hentikan(conn)
                    raise
                if conn.is_closed():
                    continue
            return conn, True
        return await _connect(), False

    async def kembalikan(self, conn, dsn: str) -> None:
        if conn.is_closed():
            return
        if self.ditutup or len(self.siaga) >= MAKS_KONEKSI_SIAGA:
            await _tutup(conn)
            return
        self.siaga.append((conn, dsn, _jam()))

    def buang_semua(self) -> None:
        siaga, self.siaga = self.siaga, []
        for conn, _, _ in siaga:
            _hentikan(conn)


# Wadah koneksi per event loop. Entri dilepas oleh penjaga loop saat loop diakhiri; entri loop yang sudah
# ditutup atau tidak berjalan lagi tanpa penjaga sempat jalan dilepas saat registri diakses berikutnya.
_wadah_per_loop: dict = {}
_registri_kunci = threading.Lock()


async def _penjaga(loop, wadah: _WadahLoop) -> None:
    """Menunggu sampai loop diakhiri (asyncio.run membatalkan tugas yang tersisa), lalu menutup koneksi siaga
    loop itu supaya tidak tertinggal terbuka di server."""
    try:
        await loop.create_future()
    finally:
        wadah.ditutup = True
        with _registri_kunci:
            if _wadah_per_loop.get(loop) is wadah:
                del _wadah_per_loop[loop]
        siaga, wadah.siaga = wadah.siaga, []
        await asyncio.gather(*(_tutup(conn) for conn, _, _ in siaga), return_exceptions=True)


def _wadah_loop() -> _WadahLoop:
    """Wadah koneksi untuk loop yang sedang berjalan; dibuat (beserta penjaganya) saat pertama dipakai."""
    loop = asyncio.get_running_loop()
    with _registri_kunci:
        for lain in [l for l in _wadah_per_loop if l is not loop and (l.is_closed() or not l.is_running())]:
            del _wadah_per_loop[lain]
        wadah = _wadah_per_loop.get(loop)
        if wadah is None:
            wadah = _wadah_per_loop[loop] = _WadahLoop()
            wadah.penjaga = loop.create_task(_penjaga(loop, wadah))
    return wadah


def should_record(method: str, path: str, status: int, query: str) -> bool:
    if not path.startswith("/api/"):
        return False
    if _AUTH_BFF_PATHS.match(path) and (method != "POST" or status in (404, 405)):
        return False
    if status in (401, 403):
        return True
    if _ACTION_PATHS.match(path):
        return True
    return "refresh=true" in query.lower() or "refresh=1" in query.lower()


def mask_ip(forwarded: Optional[str], fallback: Optional[str]) -> str:
    raw = (forwarded or "").split(",")[0].strip() or (fallback or "")
    if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", raw):
        return ".".join(raw.split(".")[:3] + ["0"])
    if ":" in raw:
        return ":".join(raw.split(":")[:3]) + "::"
    return ""


def build_entry(method: str, path: str, status: int, claims: Optional[dict], role: str, forwarded: Optional[str], client_ip: Optional[str],
                detail: str = "") -> dict:
    sub = claims.get("sub", "") if isinstance(claims, dict) else ""
    return {
        "actor": str(sub)[:200],
        "role": role,
        "action": f"{method} {path}"[:300],
        "target": (f"{path} {detail}" if detail else path)[:300],
        "status": int(status),
        "ip": mask_ip(forwarded, client_ip),
    }


async def _connect():
    import asyncpg

    dsn = os.environ.get(DSN_ENV)
    if not dsn:
        return None
    return await asyncpg.connect(dsn, timeout=CONNECT_TIMEOUT, command_timeout=COMMAND_TIMEOUT, statement_cache_size=0)


async def _kerjakan(wadah: _WadahLoop, conn, dsn: str, kerja):
    """Menjalankan `kerja(conn)` lalu mengembalikan koneksi ke wadah. Koneksi dibuang bila galat koneksi, batas
    waktu, pembatalan, atau koneksinya tertutup; galat perintah biasa (mis. dari trigger) tidak membuangnya."""
    try:
        hasil = await kerja(conn, wadah)
    except _galat_koneksi():
        _hentikan(conn)
        raise
    except Exception:
        if conn.is_closed():
            _hentikan(conn)
        else:
            await wadah.kembalikan(conn, dsn)
        raise
    except BaseException:
        # Dibatalkan di tengah perintah: keadaan koneksi tidak pasti.
        _hentikan(conn)
        raise
    await wadah.kembalikan(conn, dsn)
    return hasil


async def _jalankan(kerja, *, boleh_ulang: bool):
    """Menjalankan `kerja(conn, wadah)` pada koneksi audit loop ini. Mengembalikan _TANPA_DSN bila DSN kosong.

    Bila koneksi siaga yang dipinjam ternyata galat koneksi, koneksi itu dibuang dan kerja dicoba sekali dengan
    koneksi baru, asalkan aman: `boleh_ulang` (perintah baca) atau galatnya penolakan dari server (perintah
    tidak dieksekusi). Galat yang tidak pasti setelah perintah tulis terkirim tidak diulang supaya satu
    panggilan tidak menulis dua baris. Koneksi baru yang galat dan batas waktu perintah tidak diulang.
    """
    dsn = os.environ.get(DSN_ENV)
    if not dsn:
        return _TANPA_DSN
    wadah = _wadah_loop()
    conn, dipakai_ulang = await wadah.pinjam(dsn)
    if conn is None:
        return _TANPA_DSN
    try:
        return await _kerjakan(wadah, conn, dsn, kerja)
    except _galat_koneksi() as exc:
        if not dipakai_ulang or isinstance(exc, asyncio.TimeoutError) or not (boleh_ulang or _ditolak_server(exc)):
            raise
    conn = await _connect()
    if conn is None:
        return _TANPA_DSN
    return await _kerjakan(wadah, conn, dsn, kerja)


async def _ensure_schema(conn, wadah: _WadahLoop):
    """Membuat skema sekali per proses. Permintaan serentak di loop yang sama menunggu pembuatan yang sedang
    berjalan (tidak menjalankan SCHEMA_SQL bersamaan) dan ikut menerima galatnya bila gagal."""
    global _schema_ready
    if _schema_ready:
        return
    if wadah.skema is not None:
        await asyncio.shield(wadah.skema)
        return
    selesai = wadah.skema = asyncio.get_running_loop().create_future()
    try:
        await conn.execute(SCHEMA_SQL)
        _schema_ready = True
        selesai.set_result(None)
    except BaseException as exc:
        selesai.set_exception(exc if isinstance(exc, Exception) else RuntimeError("pembuatan skema dibatalkan"))
        selesai.exception()  # galat sudah diteruskan ke pemanggil ini; penunggu lain menerimanya lewat shield
        raise
    finally:
        wadah.skema = None


async def write_entry(entry: dict) -> None:
    async def tulis(conn, wadah):
        await _ensure_schema(conn, wadah)
        await conn.execute(
            "INSERT INTO audit_log (actor, role, action, target, status, ip) VALUES ($1, $2, $3, $4, $5, $6)",
            entry["actor"], entry["role"], entry["action"], entry["target"], entry["status"], entry["ip"],
        )

    if await _jalankan(tulis, boleh_ulang=False) is _TANPA_DSN:
        logger.warning("Audit log belum dikonfigurasi (%s kosong)", DSN_ENV)


async def read_entries(*, limit: int = 100, before_id: Optional[int] = None, actor: str = "", action: str = "",
                       since: Optional[datetime] = None, until: Optional[datetime] = None) -> list:
    async def baca(conn, wadah):
        await _ensure_schema(conn, wadah)
        return await conn.fetch(
            "SELECT id, at, actor, role, action, target, status, ip FROM audit_log "
            "WHERE ($1::bigint IS NULL OR id < $1) AND ($2 = '' OR actor = $2) AND ($3 = '' OR action ILIKE '%' || $3 || '%') "
            "AND ($5::timestamptz IS NULL OR at >= $5) AND ($6::timestamptz IS NULL OR at < $6) "
            "ORDER BY id DESC LIMIT $4",
            before_id, actor, action, limit, since, until,
        )

    rows = await _jalankan(baca, boleh_ulang=True)
    if rows is _TANPA_DSN:
        return []
    return [{**dict(r), "at": r["at"].isoformat()} for r in rows]


async def record(entry: dict) -> None:
    try:
        await write_entry(entry)
    except Exception as exc:  # jangan pernah menggagalkan permintaan pengguna
        logger.error("Gagal menulis audit log: %s", type(exc).__name__)
