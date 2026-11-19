"""Sesi login SAPA di server (login satu halaman, di balik flag SAPA_LOGIN_BFF).

- Browser hanya memegang cookie acak __Host-sapa_sesi (32 byte). Database hanya menyimpan sha256-nya.
- Token Auth0 (access dan refresh) disimpan terenkripsi AES-GCM dengan kunci SAPA_SESI_KUNCI
  (base64, 32 byte). Kunci sebelumnya di SAPA_SESI_KUNCI_LAMA tetap bisa membuka sesi lama, lalu
  sesi itu dienkripsi ulang dengan kunci baru. Isi terenkripsi diikat ke id sesi (AAD).
- "Ingat saya": berlaku 30 hari. Tanpa centang: maksimal SAPA_SESI_TANPA_INGAT_JAM (12) jam total
  dan SAPA_SESI_IDLE_MENIT (120) menit menganggur.
- Access token disegarkan di server lewat refresh token bila sisa umurnya kurang dari 60 detik, dan
  paling lama tiap 15 menit, supaya akun yang diblokir di Auth0 cepat kehilangan sesinya.
  Penyegaran memakai kuota global /oauth/token tersendiri (KUNCI_GLOBAL_SEGAR), terpisah dari login,
  supaya banjir login tidak menunda penyegaran sesi yang sudah masuk. IP klien diteruskan lewat
  header auth0-forwarded-for, sama dengan login. Bila dua permintaan paralel menyegarkan bersamaan
  dan Auth0 menolak salah satunya, baris dibaca ulang sebelum sesi diakhiri.
- Batas menganggur khusus Admin dan Super Admin (usulan IDLE_ADMIN_USULAN_MENIT = 30) sudah disiapkan,
  tetapi NONAKTIF sampai CEO memutuskan: berlaku hanya bila SAPA_SESI_IDLE_ADMIN_MENIT diisi.
- Tanpa cache sesi di memori. SLA pencabutan: sesi yang dihapus (keluar, pencabutan admin,
  kedaluwarsa) ditolak pada permintaan berikutnya di instans mana pun, karena setiap permintaan membaca
  baris sesi dari DB. Batas atas yang disepakati bila kelak ada cache: 5 detik per instans.
- Pembatas percobaan (batas) memakai tabel sapa_batas supaya tahan lintas instance serverless.
  Baris kedaluwarsa dibersihkan sesekali (PELUANG_BERSIH per panggilan) dan saat login sukses.
- satu_koneksi(): semua operasi penyimpanan di dalam blok memakai satu koneksi Postgres.
  Kunci pembatas dan penanda log memakai HMAC dengan kunci turunan SAPA_SESI_KUNCI (HKDF,
  label "sapa-jejak"), jadi tidak bisa dibalik dengan kamus username atau ruang IPv4.

Kegagalan penyimpanan atau konfigurasi selalu menjadi SesiBelumSiap (gagal tertutup, 503).
Nilai cookie, token, dan kunci tidak pernah dicatat di log.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import contextlib
import contextvars
import functools
import hashlib
import hmac
import json
import logging
import math
import os
import random
import re
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional, Protocol

import jwt
import requests
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

logger = logging.getLogger("sapa-api")

NAMA_COOKIE = "__Host-sapa_sesi"
DSN_ENV = "SAPA_SESI_DATABASE_URL"
KUNCI_ENV = "SAPA_SESI_KUNCI"
KUNCI_LAMA_ENV = "SAPA_SESI_KUNCI_LAMA"
UMUR_INGAT = timedelta(days=30)
SISA_SEGAR_DETIK = 60
SEGAR_BERKALA = timedelta(minutes=15)
# Pembatas global ke /oauth/token dibagi dua kuota: login dan penyegaran token. Jumlah keduanya
# (5 per detik) sama dengan batas global sebelumnya, jadi tetap di bawah batas tenant Auth0.
KUNCI_GLOBAL_LOGIN = "global:oauth-login"
BATAS_GLOBAL_LOGIN = (1, 3)
KUNCI_GLOBAL_SEGAR = "global:oauth-refresh"
BATAS_GLOBAL_SEGAR = (1, 2)
_JEDA_SENTUH = timedelta(seconds=60)
# Peluang satu panggilan pembatas ikut membersihkan baris sapa_batas yang sudah kedaluwarsa.
PELUANG_BERSIH = 0.01
BATAS_BERSIH = 1000
IDLE_ADMIN_ENV = "SAPA_SESI_IDLE_ADMIN_MENIT"
IDLE_ADMIN_USULAN_MENIT = 30
_COOKIE_RE = re.compile(r"^[A-Za-z0-9_-]{20,128}$")
_GALAT_REFRESH_DITOLAK = {"invalid_grant", "unauthorized", "access_denied"}

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sapa_sesi (
    id_hash TEXT PRIMARY KEY,
    sub TEXT NOT NULL,
    ingat BOOLEAN NOT NULL,
    dibuat_pada TIMESTAMPTZ NOT NULL,
    terakhir_dipakai TIMESTAMPTZ NOT NULL,
    kedaluwarsa TIMESTAMPTZ NOT NULL,
    token_enc TEXT NOT NULL,
    token_exp TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sapa_sesi_sub_idx ON sapa_sesi (sub);
CREATE INDEX IF NOT EXISTS sapa_sesi_kedaluwarsa_idx ON sapa_sesi (kedaluwarsa);
CREATE TABLE IF NOT EXISTS sapa_batas (
    kunci_hash TEXT NOT NULL,
    jendela BIGINT NOT NULL,
    jumlah INTEGER NOT NULL DEFAULT 0,
    kedaluwarsa TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (kunci_hash, jendela)
);
CREATE INDEX IF NOT EXISTS sapa_batas_kedaluwarsa_idx ON sapa_batas (kedaluwarsa);
"""


class SesiBelumSiap(Exception):
    """Konfigurasi atau penyimpanan sesi belum siap; pemanggil menjawab 503."""


@dataclass
class Sesi:
    id_hash: str
    sub: str
    ingat: bool
    dibuat_pada: datetime
    terakhir_dipakai: datetime
    kedaluwarsa: datetime
    token_exp: datetime
    access_token: str
    refresh_token: Optional[str] = None
    nama: Optional[str] = None
    diperoleh: Optional[datetime] = None  # waktu access token terakhir diperoleh dari Auth0
    token_enc: Optional[str] = field(default=None, repr=False)


def _sekarang() -> datetime:
    return datetime.now(timezone.utc)


def _env(nama: str) -> str:
    return os.environ.get(nama, "").strip()


def _hash(nilai: str) -> str:
    return hashlib.sha256(nilai.encode("utf-8")).hexdigest()


def _angka_env(nama: str, bawaan: int, minimum: int, maksimum: int) -> int:
    try:
        return min(max(int(_env(nama) or bawaan), minimum), maksimum)
    except ValueError:
        return bawaan


def umur_tanpa_ingat() -> timedelta:
    return timedelta(hours=_angka_env("SAPA_SESI_TANPA_INGAT_JAM", 12, 1, 24 * 30))


def batas_menganggur() -> timedelta:
    return timedelta(minutes=_angka_env("SAPA_SESI_IDLE_MENIT", 120, 1, 60 * 24 * 30))


def batas_menganggur_admin() -> Optional[timedelta]:
    """Batas menganggur khusus Admin/Super Admin; None (tidak berlaku) selama env kosong atau tidak sah."""
    nilai = _env(IDLE_ADMIN_ENV)
    if not nilai:
        return None
    try:
        menit = int(nilai)
    except ValueError:
        logger.error("%s tidak sah; batas menganggur admin tidak diterapkan", IDLE_ADMIN_ENV)
        return None
    return timedelta(minutes=min(max(menit, 1), 60 * 24)) if menit > 0 else None


# --- konfigurasi Auth0 (client "SAPA Login Server") ---------------------------------------------

def domain_auth0() -> str:
    return _env("AUTH0_DOMAIN").removeprefix("https://").removeprefix("http://").rstrip("/")


def konfigurasi_auth0() -> Optional[dict]:
    """Konfigurasi client login server; None bila ada yang kosong. Nilainya tidak pernah dikirim ke klien."""
    cfg = {"domain": domain_auth0(), "client_id": _env("AUTH0_LOGIN_CLIENT_ID"),
           "client_secret": _env("AUTH0_LOGIN_CLIENT_SECRET"), "realm": _env("AUTH0_LOGIN_REALM")}
    return cfg if all(cfg.values()) else None


async def _auth0_post(path: str, data: dict, headers: Optional[dict] = None) -> tuple[int, Optional[dict]]:
    """POST form ke Auth0; (0, None) bila tidak terjangkau. Body tidak pernah dicatat."""
    url = f"https://{domain_auth0()}{path}"

    def kirim():
        try:
            res = requests.post(url, data=data, headers=headers or {}, timeout=8)
        except requests.RequestException:
            return 0, None
        try:
            body = res.json()
        except ValueError:
            body = None
        return res.status_code, body if isinstance(body, dict) else None

    return await asyncio.to_thread(kirim)


# --- enkripsi token ----------------------------------------------------------------------------

def _kunci(nama: str) -> Optional[bytes]:
    nilai = _env(nama)
    if not nilai:
        return None
    try:
        kunci = base64.b64decode(nilai, validate=True)
    except (binascii.Error, ValueError):
        return None
    return kunci if len(kunci) == 32 else None


def kunci_siap() -> bool:
    return _kunci(KUNCI_ENV) is not None


# Cadangan bila kunci sesi belum diisi: penanda tetap tidak bisa dibalik, hanya tidak sama antar-instance.
_KUNCI_JEJAK_CADANGAN = secrets.token_bytes(32)


@functools.lru_cache(maxsize=4)
def _kunci_jejak(kunci: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"sapa-jejak").derive(kunci)


def jejak(nilai: str) -> str:
    """HMAC-SHA256 berkunci rahasia server untuk kunci pembatas dan penanda log (bukan sha256 polos)."""
    kunci = _kunci(KUNCI_ENV)
    rahasia = _kunci_jejak(kunci) if kunci else _KUNCI_JEJAK_CADANGAN
    return hmac.new(rahasia, nilai.encode("utf-8"), hashlib.sha256).hexdigest()


def _enkripsi(isi: dict, id_hash: str) -> str:
    kunci = _kunci(KUNCI_ENV)
    if kunci is None:
        logger.error("Kunci sesi belum dikonfigurasi atau tidak sah (%s)", KUNCI_ENV)
        raise SesiBelumSiap()
    nonce = os.urandom(12)
    sandi = AESGCM(kunci).encrypt(nonce, json.dumps(isi).encode("utf-8"), id_hash.encode("ascii"))
    return "v1." + base64.urlsafe_b64encode(nonce + sandi).decode("ascii")


def _dekripsi(teks: str, id_hash: str) -> tuple[Optional[dict], bool]:
    """(isi, pakai_kunci_lama); isi None bila tidak ada kunci yang cocok."""
    if not isinstance(teks, str) or not teks.startswith("v1."):
        return None, False
    try:
        mentah = base64.urlsafe_b64decode(teks[3:].encode("ascii"))
    except (binascii.Error, ValueError):
        return None, False
    nonce, sandi = mentah[:12], mentah[12:]
    for lama, nama in ((False, KUNCI_ENV), (True, KUNCI_LAMA_ENV)):
        kunci = _kunci(nama)
        if kunci is None:
            continue
        try:
            isi = json.loads(AESGCM(kunci).decrypt(nonce, sandi, id_hash.encode("ascii")))
        except (InvalidTag, ValueError):
            continue
        return (isi, lama) if isinstance(isi, dict) else (None, False)
    return None, False


# --- penyimpanan -------------------------------------------------------------------------------

class SesiStore(Protocol):
    """Antarmuka kecil penyimpanan sesi dan pembatas. Semua waktu bertipe datetime UTC."""

    async def simpan(self, baris: dict) -> None: ...
    async def ambil(self, id_hash: str) -> Optional[dict]: ...
    async def sentuh(self, id_hash: str, waktu: datetime) -> None: ...
    async def perbarui_token(self, id_hash: str, token_enc: str, token_exp: datetime) -> None: ...
    async def hapus(self, id_hash: str) -> bool: ...
    async def hapus_sub(self, sub: str) -> int: ...
    async def tambah_batas(self, kunci_hash: str, jendela: int, kedaluwarsa: datetime) -> int: ...
    async def tambah_batas_geser(self, kunci_hash: str, jendela: int, kedaluwarsa: datetime) -> tuple[int, int]: ...
    async def kurangi_batas(self, kunci_hash: str, jendela: int) -> None: ...
    async def bersihkan_batas(self, sekarang: datetime) -> None: ...
    async def cek(self) -> None: ...


class MemorySesiStore:
    """Penyimpanan di memori untuk tes dan pengembangan lokal (tidak tahan lintas instance)."""

    def __init__(self):
        self.sesi: dict[str, dict] = {}
        self.batas: dict[tuple, int] = {}
        self.kedaluwarsa_batas: dict[tuple, datetime] = {}

    async def simpan(self, baris):
        self.sesi[baris["id_hash"]] = dict(baris)

    async def ambil(self, id_hash):
        baris = self.sesi.get(id_hash)
        return dict(baris) if baris else None

    async def sentuh(self, id_hash, waktu):
        if id_hash in self.sesi:
            self.sesi[id_hash]["terakhir_dipakai"] = waktu

    async def perbarui_token(self, id_hash, token_enc, token_exp):
        if id_hash in self.sesi:
            self.sesi[id_hash].update(token_enc=token_enc, token_exp=token_exp)

    async def hapus(self, id_hash):
        return self.sesi.pop(id_hash, None) is not None

    async def hapus_sub(self, sub):
        ids = [k for k, v in self.sesi.items() if v["sub"] == sub]
        for k in ids:
            del self.sesi[k]
        return len(ids)

    async def tambah_batas(self, kunci_hash, jendela, kedaluwarsa):
        kunci = (kunci_hash, jendela)
        self.batas[kunci] = self.batas.get(kunci, 0) + 1
        self.kedaluwarsa_batas.setdefault(kunci, kedaluwarsa)
        return self.batas[kunci]

    async def tambah_batas_geser(self, kunci_hash, jendela, kedaluwarsa):
        ini = await self.tambah_batas(kunci_hash, jendela, kedaluwarsa)
        return ini, self.batas.get((kunci_hash, jendela - 1), 0)

    async def kurangi_batas(self, kunci_hash, jendela):
        kunci = (kunci_hash, jendela)
        if self.batas.get(kunci, 0) > 0:
            self.batas[kunci] -= 1

    async def bersihkan_batas(self, sekarang):
        for kunci in [k for k, v in self.kedaluwarsa_batas.items() if v < sekarang]:
            self.batas.pop(kunci, None)
            self.kedaluwarsa_batas.pop(kunci, None)

    async def cek(self):
        return None


# Wadah koneksi milik satu permintaan (lihat satu_koneksi); None = satu koneksi per operasi.
_wadah_koneksi: contextvars.ContextVar[Optional[dict]] = contextvars.ContextVar("sapa_wadah_koneksi", default=None)


@contextlib.asynccontextmanager
async def satu_koneksi():
    """Semua operasi penyimpanan Postgres di dalam blok memakai satu koneksi, dibuka saat pertama dipakai
    dan ditutup di akhir blok. Operasi di dalam blok harus berurutan (bukan asyncio.gather)."""
    wadah: dict = {}
    token = _wadah_koneksi.set(wadah)
    try:
        yield
    finally:
        _wadah_koneksi.reset(token)
        for conn in wadah.values():
            try:
                await conn.close()
            except Exception as exc:
                logger.warning("Koneksi penyimpanan sesi tidak tertutup rapi: %s", type(exc).__name__)


class PostgresSesiStore:
    """Tabel sapa_sesi dan sapa_batas di Postgres (Neon), DSN dari SAPA_SESI_DATABASE_URL.

    Di luar satu_koneksi(): satu koneksi asyncpg per operasi lalu ditutup, sama dengan audit_log:
    runtime serverless bisa membuat event loop baru per permintaan, jadi pool yang terikat ke loop lama
    tidak bisa ditutup rapi. Di dalam satu_koneksi(): satu koneksi untuk seluruh permintaan.
    Skema dibuat dengan CREATE TABLE IF NOT EXISTS (aman maju-mundur).
    """

    def __init__(self, dsn: Optional[str] = None):
        self.dsn = dsn or _env(DSN_ENV)
        self._skema_siap = False

    async def _sambung(self):
        import asyncpg

        return await asyncpg.connect(self.dsn, timeout=5, command_timeout=5, statement_cache_size=0)

    async def _jalankan_di(self, conn, perintah: list):
        if not self._skema_siap:
            await conn.execute(SCHEMA_SQL)
            self._skema_siap = True
        return [await getattr(conn, cara)(sql, *args) for cara, sql, args in perintah]

    async def _urutan(self, perintah: list):
        wadah = _wadah_koneksi.get()
        if wadah is None:
            conn = await self._sambung()
            try:
                return await self._jalankan_di(conn, perintah)
            finally:
                await conn.close()
        conn = wadah.get(id(self))
        if conn is None:
            conn = wadah[id(self)] = await self._sambung()
        try:
            return await self._jalankan_di(conn, perintah)
        except Exception:
            # Koneksi bisa sudah rusak; operasi berikutnya membuka koneksi baru.
            wadah.pop(id(self), None)
            try:
                await conn.close()
            except Exception:
                pass
            raise

    async def _jalankan(self, cara: str, sql: str, *args):
        return (await self._urutan([(cara, sql, args)]))[0]

    async def simpan(self, baris):
        # Satu koneksi: sisipkan sesi, lalu bersih-bersih ringan sesi dan hitungan pembatas yang sudah lewat.
        await self._urutan([
            ("execute",
             "INSERT INTO sapa_sesi (id_hash, sub, ingat, dibuat_pada, terakhir_dipakai, kedaluwarsa, token_enc, token_exp) "
             "VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
             (baris["id_hash"], baris["sub"], baris["ingat"], baris["dibuat_pada"], baris["terakhir_dipakai"],
              baris["kedaluwarsa"], baris["token_enc"], baris["token_exp"])),
            ("execute", "DELETE FROM sapa_sesi WHERE kedaluwarsa < $1", (baris["dibuat_pada"],)),
            ("execute", "DELETE FROM sapa_batas WHERE kedaluwarsa < $1", (baris["dibuat_pada"],)),
        ])

    async def ambil(self, id_hash):
        baris = await self._jalankan(
            "fetchrow",
            "SELECT id_hash, sub, ingat, dibuat_pada, terakhir_dipakai, kedaluwarsa, token_enc, token_exp "
            "FROM sapa_sesi WHERE id_hash = $1", id_hash)
        return dict(baris) if baris else None

    async def sentuh(self, id_hash, waktu):
        await self._jalankan("execute", "UPDATE sapa_sesi SET terakhir_dipakai = $2 WHERE id_hash = $1", id_hash, waktu)

    async def perbarui_token(self, id_hash, token_enc, token_exp):
        await self._jalankan("execute", "UPDATE sapa_sesi SET token_enc = $2, token_exp = $3 WHERE id_hash = $1",
                             id_hash, token_enc, token_exp)

    async def hapus(self, id_hash):
        hasil = await self._jalankan("execute", "DELETE FROM sapa_sesi WHERE id_hash = $1", id_hash)
        return str(hasil).endswith(" 1")

    async def hapus_sub(self, sub):
        hasil = await self._jalankan("execute", "DELETE FROM sapa_sesi WHERE sub = $1", sub)
        try:
            return int(str(hasil).split()[-1])
        except (ValueError, IndexError):
            return 0

    async def tambah_batas(self, kunci_hash, jendela, kedaluwarsa):
        return int(await self._jalankan(
            "fetchval",
            "INSERT INTO sapa_batas (kunci_hash, jendela, jumlah, kedaluwarsa) VALUES ($1, $2, 1, $3) "
            "ON CONFLICT (kunci_hash, jendela) DO UPDATE SET jumlah = sapa_batas.jumlah + 1 RETURNING jumlah",
            kunci_hash, jendela, kedaluwarsa))

    async def tambah_batas_geser(self, kunci_hash, jendela, kedaluwarsa):
        ini, lalu = await self._urutan([
            ("fetchval",
             "INSERT INTO sapa_batas (kunci_hash, jendela, jumlah, kedaluwarsa) VALUES ($1, $2, 1, $3) "
             "ON CONFLICT (kunci_hash, jendela) DO UPDATE SET jumlah = sapa_batas.jumlah + 1 RETURNING jumlah",
             (kunci_hash, jendela, kedaluwarsa)),
            ("fetchval", "SELECT jumlah FROM sapa_batas WHERE kunci_hash = $1 AND jendela = $2",
             (kunci_hash, jendela - 1)),
        ])
        return int(ini), int(lalu or 0)

    async def kurangi_batas(self, kunci_hash, jendela):
        await self._jalankan(
            "execute", "UPDATE sapa_batas SET jumlah = GREATEST(jumlah - 1, 0) WHERE kunci_hash = $1 AND jendela = $2",
            kunci_hash, jendela)

    async def bersihkan_batas(self, sekarang):
        # Dibatasi BATAS_BERSIH baris per panggilan supaya tidak pernah menjadi kueri panjang.
        await self._jalankan(
            "execute",
            "DELETE FROM sapa_batas WHERE ctid IN "
            f"(SELECT ctid FROM sapa_batas WHERE kedaluwarsa < $1 LIMIT {int(BATAS_BERSIH)})", sekarang)

    async def cek(self):
        await self._jalankan("fetchval", "SELECT 1")


_store: Optional[SesiStore] = None
_store_pg: dict[str, PostgresSesiStore] = {}


def store() -> Optional[SesiStore]:
    """Penyimpanan aktif: yang dipasang lewat atur_store (tes), atau Postgres bila DSN diisi."""
    if _store is not None:
        return _store
    dsn = _env(DSN_ENV)
    if not dsn:
        return None
    if dsn not in _store_pg:
        _store_pg[dsn] = PostgresSesiStore(dsn)
    return _store_pg[dsn]


def atur_store(baru: Optional[SesiStore]) -> None:
    global _store
    _store = baru


def _store_wajib() -> SesiStore:
    s = store()
    if s is None:
        logger.error("Penyimpanan sesi belum dikonfigurasi (%s kosong)", DSN_ENV)
        raise SesiBelumSiap()
    return s


async def _aman(coro):
    """Jalankan operasi penyimpanan; galat apa pun menjadi SesiBelumSiap tanpa rincian."""
    try:
        return await coro
    except SesiBelumSiap:
        raise
    except Exception as exc:
        logger.error("Penyimpanan sesi gagal: %s", type(exc).__name__)
        raise SesiBelumSiap() from None


# --- sesi --------------------------------------------------------------------------------------

def _nama_dari_id_token(id_token) -> Optional[str]:
    # id_token datang langsung dari Auth0 lewat TLS ke client rahasia ini; hanya dipakai untuk nama tampilan.
    if not isinstance(id_token, str) or not id_token:
        return None
    try:
        klaim = jwt.decode(id_token, options={"verify_signature": False})
    except jwt.PyJWTError:
        return None
    nama = klaim.get("name") or klaim.get("nickname")
    return str(nama)[:100] if nama else None


def _umur_token(token: dict) -> timedelta:
    try:
        return timedelta(seconds=max(int(token.get("expires_in") or 0), 0))
    except (TypeError, ValueError):
        return timedelta(0)


async def buat_sesi(sub: str, ingat: bool, token: dict) -> str:
    """Buat sesi baru untuk token Auth0 yang sudah diverifikasi; kembalikan nilai cookie (bukan hash)."""
    s = _store_wajib()
    cookie = secrets.token_urlsafe(32)
    id_hash = _hash(cookie)
    sekarang = _sekarang()
    isi = {"at": token["access_token"], "rt": token.get("refresh_token"), "nama": _nama_dari_id_token(token.get("id_token")),
           "t": int(sekarang.timestamp())}
    baris = {
        "id_hash": id_hash, "sub": sub, "ingat": bool(ingat), "dibuat_pada": sekarang, "terakhir_dipakai": sekarang,
        "kedaluwarsa": sekarang + (UMUR_INGAT if ingat else umur_tanpa_ingat()),
        "token_enc": _enkripsi(isi, id_hash), "token_exp": sekarang + _umur_token(token),
    }
    await _aman(s.simpan(baris))
    return cookie


async def ambil_sesi(cookie, adalah_admin: Optional[Callable[[str], bool]] = None) -> Optional[Sesi]:
    """Sesi yang masih berlaku untuk nilai cookie ini, atau None. Sesi kedaluwarsa langsung dihapus.

    `adalah_admin(access_token)` hanya dipakai bila batas menganggur admin diaktifkan lewat env.
    """
    if not isinstance(cookie, str) or not _COOKIE_RE.fullmatch(cookie):
        return None
    if not kunci_siap():
        logger.error("Kunci sesi belum dikonfigurasi atau tidak sah (%s)", KUNCI_ENV)
        raise SesiBelumSiap()
    s = _store_wajib()
    id_hash = _hash(cookie)
    baris = await _aman(s.ambil(id_hash))
    if not baris:
        return None
    sekarang = _sekarang()
    menganggur = not baris["ingat"] and sekarang - baris["terakhir_dipakai"] > batas_menganggur()
    if sekarang >= baris["kedaluwarsa"] or menganggur:
        await _aman(s.hapus(id_hash))
        return None
    isi, pakai_kunci_lama = _dekripsi(baris["token_enc"], id_hash)
    if isi is None or not isinstance(isi.get("at"), str):
        # Baris ada tetapi tidak terbuka: kemungkinan besar kunci salah pasang. Gagal tertutup (503) tanpa
        # menghapus baris maupun cookie, supaya sesi kembali terbaca setelah kunci dibetulkan.
        logger.error("Sesi tidak dapat dibuka dengan kunci yang ada (%s)", KUNCI_ENV)
        raise SesiBelumSiap()
    batas_admin = batas_menganggur_admin()
    if (batas_admin is not None and adalah_admin is not None
            and sekarang - baris["terakhir_dipakai"] > batas_admin and adalah_admin(isi["at"])):
        await _aman(s.hapus(id_hash))
        return None
    token_enc = baris["token_enc"]
    if pakai_kunci_lama:
        token_enc = _enkripsi(isi, id_hash)
        await _aman(s.perbarui_token(id_hash, token_enc, baris["token_exp"]))
    if sekarang - baris["terakhir_dipakai"] >= _JEDA_SENTUH:
        await sentuh(id_hash, sekarang)
    return Sesi(id_hash=id_hash, sub=baris["sub"], ingat=baris["ingat"], dibuat_pada=baris["dibuat_pada"],
                terakhir_dipakai=sekarang, kedaluwarsa=baris["kedaluwarsa"], token_exp=baris["token_exp"],
                access_token=isi["at"], refresh_token=isi.get("rt"), nama=isi.get("nama"),
                diperoleh=_waktu_epoch(isi.get("t")) or baris["dibuat_pada"], token_enc=token_enc)


def _waktu_epoch(nilai) -> Optional[datetime]:
    try:
        return datetime.fromtimestamp(int(nilai), tz=timezone.utc) if nilai is not None else None
    except (TypeError, ValueError, OverflowError, OSError):
        return None


async def sentuh(id_hash: str, waktu: Optional[datetime] = None) -> None:
    await _aman(_store_wajib().sentuh(id_hash, waktu or _sekarang()))


async def _baca_ulang(sesi: Sesi) -> Optional[Sesi]:
    """Sesi dengan token yang sudah disegarkan permintaan lain (baris berubah sejak dibaca), atau None."""
    baris = await _aman(_store_wajib().ambil(sesi.id_hash))
    if not baris or baris["token_enc"] == sesi.token_enc:
        return None
    isi, _ = _dekripsi(baris["token_enc"], sesi.id_hash)
    if isi is None or not isinstance(isi.get("at"), str):
        return None
    sesi.access_token, sesi.refresh_token = isi["at"], isi.get("rt")
    sesi.token_exp, sesi.token_enc = baris["token_exp"], baris["token_enc"]
    sesi.diperoleh = _waktu_epoch(isi.get("t")) or sesi.diperoleh
    return sesi


async def segarkan_bila_perlu(sesi: Sesi, ip: Optional[str] = None) -> Optional[Sesi]:
    """Segarkan access token lewat refresh token bila sisa umurnya < 60 detik atau sudah 15 menit.

    `ip` adalah IP klien tepercaya (BF-1) untuk header auth0-forwarded-for; tanpa IP header tidak dikirim.
    None bila Auth0 menolak refresh token (sesi dihapus). SesiBelumSiap bila Auth0 tidak terjangkau
    atau kuota global penyegaran penuh, dan access token sudah habis.
    """
    sekarang = _sekarang()
    hampir_habis = (sesi.token_exp - sekarang).total_seconds() <= SISA_SEGAR_DETIK
    sudah_lama = sesi.diperoleh is not None and sekarang - sesi.diperoleh >= SEGAR_BERKALA
    if not hampir_habis and not sudah_lama:
        return sesi
    masih_berlaku = sesi.token_exp > sekarang
    cfg = konfigurasi_auth0()
    if not sesi.refresh_token or cfg is None:
        if masih_berlaku:
            return sesi
        if cfg is None:
            logger.error("Client login Auth0 belum dikonfigurasi; sesi tidak dapat disegarkan")
            raise SesiBelumSiap()
        await _aman(_store_wajib().hapus(sesi.id_hash))
        return None
    if not await batas(KUNCI_GLOBAL_SEGAR, *BATAS_GLOBAL_SEGAR):
        logger.warning("Penyegaran token ditunda: kuota global penyegaran /oauth/token penuh")
        if masih_berlaku:
            return sesi
        raise SesiBelumSiap()
    status, body = await _auth0_post("/oauth/token", {
        "grant_type": "refresh_token", "client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
        "refresh_token": sesi.refresh_token,
    }, {"auth0-forwarded-for": ip} if ip else None)
    if status == 200 and body and isinstance(body.get("access_token"), str):
        rt = body.get("refresh_token") or sesi.refresh_token
        sesi.access_token, sesi.refresh_token = body["access_token"], rt
        sesi.token_exp, sesi.diperoleh = sekarang + _umur_token(body), sekarang
        isi = {"at": sesi.access_token, "rt": rt, "nama": sesi.nama, "t": int(sekarang.timestamp())}
        sesi.token_enc = _enkripsi(isi, sesi.id_hash)
        await _aman(_store_wajib().perbarui_token(sesi.id_hash, sesi.token_enc, sesi.token_exp))
        return sesi
    galat = (body or {}).get("error")
    if status in (400, 401, 403) and galat in _GALAT_REFRESH_DITOLAK:
        # Permintaan paralel dengan cookie yang sama bisa sudah menyegarkan lebih dulu (rotasi refresh token).
        terbaru = await _baca_ulang(sesi)
        if terbaru is not None:
            return terbaru
        logger.info("Refresh token ditolak Auth0 (%s); sesi diakhiri", galat)
        await _aman(_store_wajib().hapus(sesi.id_hash))
        return None
    logger.warning("Penyegaran token Auth0 gagal: status %s", status)
    if masih_berlaku:
        return sesi
    raise SesiBelumSiap()


async def ambil_sesi_segar(cookie, adalah_admin: Optional[Callable[[str], bool]] = None,
                           ip: Optional[str] = None) -> Optional[Sesi]:
    sesi = await ambil_sesi(cookie, adalah_admin)
    return await segarkan_bila_perlu(sesi, ip) if sesi else None


async def hapus_sesi(cookie) -> bool:
    if not isinstance(cookie, str) or not _COOKIE_RE.fullmatch(cookie):
        return False
    return await _aman(_store_wajib().hapus(_hash(cookie)))


async def hapus_semua_sesi_user(sub: str) -> int:
    """Akhiri semua sesi satu akun (dipakai pencabutan sesi oleh admin)."""
    return await _aman(_store_wajib().hapus_sub(sub))


async def cabut_refresh_token(refresh_token: Optional[str]) -> bool:
    """Best effort: /oauth/revoke. Kegagalan hanya dicatat."""
    cfg = konfigurasi_auth0()
    if not refresh_token or cfg is None:
        return False
    status, _ = await _auth0_post("/oauth/revoke", {
        "client_id": cfg["client_id"], "client_secret": cfg["client_secret"], "token": refresh_token})
    if status != 200:
        logger.warning("Pencabutan refresh token gagal: status %s", status)
    return status == 200


# --- pembatas ----------------------------------------------------------------------------------

async def batas(kunci: str, jendela_detik: int, maks: int) -> bool:
    """True bila percobaan ini masih di bawah batas `maks` per jendela tetap `jendela_detik`.

    Kunci disimpan sebagai HMAC berkunci (bersama panjang jendela), tidak pernah mentah.
    """
    jumlah, _ = await hitung(kunci, jendela_detik)
    return jumlah <= maks


def sisa_jendela(jendela_detik: int) -> int:
    """Detik sampai jendela tetap `jendela_detik` yang sedang berjalan berakhir (untuk Retry-After)."""
    detik = _sekarang().timestamp()
    return max(1, math.ceil((int(detik // jendela_detik) + 1) * jendela_detik - detik))


def _acak() -> float:
    return random.random()


async def _bersihkan_kadang(s: SesiStore) -> None:
    """Sesekali hapus baris sapa_batas kedaluwarsa, supaya banjir tanpa login sukses tidak menumbuhkan tabel."""
    if _acak() >= PELUANG_BERSIH:
        return
    try:
        await s.bersihkan_batas(_sekarang())
    except Exception as exc:
        logger.warning("Pembersihan sapa_batas dilewati: %s", type(exc).__name__)


def _jendela(detik: float, jendela_detik: int, umur_jendela: int = 1) -> tuple[int, datetime]:
    jendela = int(detik // jendela_detik)
    return jendela, datetime.fromtimestamp((jendela + umur_jendela) * jendela_detik, tz=timezone.utc)


async def hitung(kunci: str, jendela_detik: int) -> tuple[int, tuple]:
    """Tambah satu hitungan pada jendela berjalan; kembalikan (jumlah, tiket). Tiket dipakai `kembalikan`."""
    s = _store_wajib()
    jendela, kedaluwarsa = _jendela(_sekarang().timestamp(), jendela_detik)
    kunci_hash = jejak(f"{jendela_detik}:{kunci}")
    jumlah = await _aman(s.tambah_batas(kunci_hash, jendela, kedaluwarsa))
    await _bersihkan_kadang(s)
    return jumlah, (kunci_hash, jendela)


@dataclass
class HitunganGeser:
    """Hasil hitung_geser: perkiraan jendela geser dari dua jendela tetap berturut-turut."""
    ini: int          # hitungan jendela berjalan, termasuk percobaan ini
    lalu: int         # hitungan jendela sebelumnya
    lewat: float      # detik yang sudah lewat di jendela berjalan
    jendela_detik: int
    tiket: tuple

    @property
    def perkiraan(self) -> float:
        # Dibulatkan supaya galat pecahan biner (mis. 10 x 0.9) tidak menggeser keputusan batas.
        return round(self.ini + self.lalu * (1 - self.lewat / self.jendela_detik), 6)

    def coba_lagi(self, maks: int) -> int:
        """Detik sampai satu percobaan berikutnya muat di bawah `maks` (percobaan ini dianggap dikembalikan)."""
        lain, j = self.ini - 1, self.jendela_detik
        if lain + 1 <= maks:
            # Jendela ini masih muat; tunggu porsi jendela lalu menyusut.
            perlu = j * (1 - (maks - lain - 1) / self.lalu) - self.lewat if self.lalu else 0
        else:
            # Tunggu jendela ini selesai; hitungannya menjadi "lalu" yang menyusut di jendela berikutnya.
            perlu = (j - self.lewat) + j * (1 - (maks - 1) / lain)
        return max(1, math.ceil(round(perlu, 6)))


async def hitung_geser(kunci: str, jendela_detik: int) -> HitunganGeser:
    """Seperti `hitung`, tetapi dengan perkiraan jendela geser: hitungan jendela ini + hitungan jendela
    lalu x porsi jendela lalu yang masih tercakup. Mencegah dua kali batas di sekitar pergantian jendela."""
    s = _store_wajib()
    detik = _sekarang().timestamp()
    jendela, kedaluwarsa = _jendela(detik, jendela_detik, umur_jendela=2)  # baris dipakai lagi di jendela berikutnya
    kunci_hash = jejak(f"{jendela_detik}:{kunci}")
    ini, lalu = await _aman(s.tambah_batas_geser(kunci_hash, jendela, kedaluwarsa))
    await _bersihkan_kadang(s)
    lewat = detik - jendela * jendela_detik
    return HitunganGeser(ini=ini, lalu=lalu, lewat=lewat, jendela_detik=jendela_detik, tiket=(kunci_hash, jendela))


async def kembalikan(tiket: tuple) -> None:
    """Batalkan satu hitungan dari `hitung` (misalnya percobaan yang ternyata bukan kegagalan)."""
    await _aman(_store_wajib().kurangi_batas(*tiket))


async def sekali_pakai(kunci: str, umur_detik: int) -> bool:
    """True hanya pada pemakaian pertama `kunci` (misalnya token Turnstile) selama `umur_detik`.

    Memakai baris sapa_batas dengan jendela 0 dan INSERT ... ON CONFLICT, jadi atomik lintas instance.
    """
    s = _store_wajib()
    kedaluwarsa = _sekarang() + timedelta(seconds=umur_detik)
    pertama = await _aman(s.tambah_batas(jejak(f"sekali:{kunci}"), 0, kedaluwarsa)) == 1
    await _bersihkan_kadang(s)
    return pertama


async def cek_kesiapan() -> dict:
    """Pemeriksaan kesehatan tanpa nilai rahasia: kunci, db, auth0_client."""
    db = False
    s = store()
    if s is not None:
        try:
            await s.cek()
            db = True
        except Exception as exc:
            logger.error("Penyimpanan sesi tidak terjangkau: %s", type(exc).__name__)
    return {"kunci": kunci_siap(), "db": db, "auth0_client": konfigurasi_auth0() is not None}
