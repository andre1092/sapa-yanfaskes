"""Sesi login SAPA di server (login satu halaman, flag SAPA_LOGIN_BFF=1, akun lokal tanpa Auth0).

- Browser hanya memegang cookie acak __Host-sapa_sesi (32 byte). Database hanya menyimpan sha256-nya.
- Isi sesi {akun: id akun, vs: versi_sandi, nama: username, peran} disimpan terenkripsi AES-GCM di kolom token_enc
  dengan kunci SAPA_SESI_KUNCI (base64, 32 byte), berformat "v2.<versi kunci>.<isi>". Versi kunci adalah sidik 8
  karakter dari kunci (HKDF, bukan kunci itu sendiri), jadi dekripsi langsung memilih SAPA_SESI_KUNCI atau
  SAPA_SESI_KUNCI_LAMA tanpa coba-coba. Isi yang terbuka dengan kunci lama, dan baris lama "v1." (tanpa versi,
  masih dicoba dengan kedua kunci), ditulis ulang dengan kunci baru (compare-and-swap atas token_enc). Isi
  terenkripsi diikat ke id sesi dan versi kunci (AAD). Kolom sub berisi "sapa|<id akun>" untuk pencabutan
  semua sesi satu akun. Baris lama dari login Auth0 (isi tanpa akun) tidak berlaku lagi dan dihapus saat dibaca.
- "Ingat saya": berlaku 30 hari. Tanpa centang: maksimal SAPA_SESI_TANPA_INGAT_JAM (12) jam total
  dan SAPA_SESI_IDLE_MENIT (120) menit menganggur.
- Revalidasi per permintaan (auth_bff.muat_sesi) membaca baris akun dan jangkar setiap permintaan, tanpa cache,
  sehingga sesi dengan versi_sandi lama, akun nonaktif, atau baris yang tidak utuh langsung 401.
- Jangkar anti-rollback: tabel akun_jangkar (akun_id, versi_sandi_min) di DB sesi ini. naikkan_jangkar hanya
  pernah menaikkan (GREATEST); baca_jangkar menjawab 0 bila belum ada baris.
- Batas menganggur khusus Admin dan Super Admin (usulan IDLE_ADMIN_USULAN_MENIT = 30) sudah disiapkan,
  tetapi nonaktif: berlaku hanya bila SAPA_SESI_IDLE_ADMIN_MENIT diisi.
- Tanpa cache sesi di memori. SLA pencabutan: sesi yang dihapus (keluar, ubah sandi, pemulihan, kedaluwarsa)
  ditolak pada permintaan berikutnya di instans mana pun, karena setiap permintaan membaca baris sesi dari DB.
- Pembatas percobaan (batas) memakai tabel sapa_batas supaya tahan lintas instance serverless. Hitungan
  gagal per (username + IP) untuk penanda lengket memakai tabel yang sama dengan jendela -1. Baris itu
  berumur pendek (umur_pendek sejak gagal terakhir) dan baru menjadi penanda lengket (umur_lengket sejak
  gagal terakhir) setelah hitungannya mencapai ambang.
  Baris kedaluwarsa dibersihkan sesekali (PELUANG_BERSIH per panggilan) dan saat login sukses. Setiap
  pembersihan juga menghitung baris sapa_batas (dibatasi LIMIT) dan mencatat peringatan di log bila
  jumlahnya melewati AMBANG_PERINGATAN_BARIS_BATAS.
- Skema: SCHEMA_SQL (CREATE TABLE IF NOT EXISTS) dijalankan sekali per instans, kecuali SAPA_SKEMA_MANUAL=1:
  saat itu tidak ada DDL sama sekali di runtime dan skema diasumsikan sudah dibuat pemilik dari api/sql/sesi_neon.sql
  (role aplikasi cukup SELECT, INSERT, UPDATE, DELETE pada tabel sesi; tanpa DELETE pada akun_jangkar).
- Koneksi Postgres dipakai ulang lintas permintaan dalam instans yang sama. Setiap event loop punya daftar
  koneksi siaga sendiri (koneksi asyncpg terikat ke loop pembuatnya, paling banyak MAKS_KONEKSI_SIAGA). Satu
  operasi meminjam koneksi siaga, atau membuka koneksi baru bila tidak ada, lalu mengembalikannya; satu koneksi
  hanya dipakai satu operasi pada satu waktu dan operasi serentak tidak saling menunggu. Koneksi siaga yang
  menganggur lebih dari AMBANG_PERIKSA diperiksa dulu (SELECT 1, BATAS_PERIKSA detik), yang lebih dari
  MAKS_MENGANGGUR dibuang. Koneksi siaga ditutup saat loop pemiliknya diakhiri.
  Koneksi dibuang bila galat koneksi, batas waktu, pembatalan, atau galat yang bukan penolakan biasa dari server.
  Perintah baca pada koneksi siaga yang ternyata putus dicoba sekali lagi dengan koneksi baru. Perintah tulis
  tidak diulang, karena bisa sudah dieksekusi (mis. hitungan pembatas bertambah dua kali).
- satu_koneksi(): semua operasi penyimpanan di dalam blok memakai satu koneksi Postgres, dikembalikan ke
  daftar siaga di akhir blok. Koneksi yang ditutup (daftar siaga penuh, atau dibuang karena galat) ikut
  tenggat: sisa tenggat dinding pemanggil (batas_akhir) atau TENGGAT_TUTUP_DB, lalu terminate() bila habis
  atau galat.
- Jalur login BFF memasang executor bawaan loop berukuran MAKS_THREAD_DNS sekali per loop
  (pasang_executor_dns); resolusi DNS loop.getaddrinfo (httpx dan asyncpg) memakai executor itu.
  Kunci pembatas dan penanda log memakai HMAC dengan kunci turunan SAPA_SESI_KUNCI (HKDF,
  label "sapa-jejak"), jadi tidak bisa dibalik dengan kamus username atau ruang IPv4.

Kegagalan penyimpanan atau konfigurasi selalu menjadi SesiBelumSiap (gagal tertutup, 503).
Nilai cookie, isi sesi, dan kunci tidak pernah dicatat di log.
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
import os
import random
import re
import secrets
import threading
import time
import weakref
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional, Protocol

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

logger = logging.getLogger("sapa-api")

NAMA_COOKIE = "__Host-sapa_sesi"
DSN_ENV = "SAPA_SESI_DATABASE_URL"
# DSN role aplikasi terbatas (env sendiri; SAPA_SESI_DATABASE_URL dikelola dan bisa ditimpa integrasi Neon).
DSN_APLIKASI_ENV = "SAPA_SESI_DSN_APLIKASI"
KUNCI_ENV = "SAPA_SESI_KUNCI"
KUNCI_LAMA_ENV = "SAPA_SESI_KUNCI_LAMA"
SKEMA_MANUAL_ENV = "SAPA_SKEMA_MANUAL"
SUB_AWALAN = "sapa|"
UMUR_INGAT = timedelta(days=30)
# Kuota global percobaan masuk (verifikasi argon2) per detik untuk seluruh SAPA.
KUNCI_GLOBAL_LOGIN = "global:login-lokal"
BATAS_GLOBAL_LOGIN = (1, 3)
_JEDA_SENTUH = timedelta(seconds=60)
# Timeout asyncpg (connect dan command masing-masing TIMEOUT_DB).
TIMEOUT_DB = 5
# Tenggat menutup koneksi Postgres bila pemanggil tidak memberi tenggat dinding (mis. /masuk).
TENGGAT_TUTUP_DB = 2
# Koneksi siaga yang menganggur lebih lama dari AMBANG_PERIKSA detik diperiksa dulu dengan SELECT 1 (batas
# BATAS_PERIKSA detik); yang menganggur lebih dari MAKS_MENGANGGUR detik dibuang tanpa diperiksa.
AMBANG_PERIKSA = 30
BATAS_PERIKSA = 2
MAKS_MENGANGGUR = 240
# Jumlah koneksi siaga per event loop; koneksi lebih dari ini ditutup setelah dipakai.
MAKS_KONEKSI_SIAGA = 4
# Satu operasi tulis terburuk: memeriksa koneksi siaga yang ternyata putus, lalu connect dan command koneksi baru.
WAKTU_TERBURUK_DB = BATAS_PERIKSA + 2 * TIMEOUT_DB
# Peluang satu panggilan pembatas ikut membersihkan baris sapa_batas yang sudah kedaluwarsa.
PELUANG_BERSIH = 0.01
BATAS_BERSIH = 1000
# Peringatan di log bila sapa_batas masih berisi lebih dari ini setelah pembersihan.
AMBANG_PERINGATAN_BARIS_BATAS = 200_000
IDLE_ADMIN_ENV = "SAPA_SESI_IDLE_ADMIN_MENIT"
IDLE_ADMIN_USULAN_MENIT = 30
# Executor bawaan loop yang dipasang jalur login BFF (pasang_executor_dns): jumlah thread dan awalan namanya.
MAKS_THREAD_DNS = 64
_AWALAN_THREAD_DNS = "sapa-dns"
_COOKIE_RE = re.compile(r"^[A-Za-z0-9_-]{20,128}$")

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
CREATE TABLE IF NOT EXISTS akun_jangkar (
    akun_id TEXT PRIMARY KEY,
    versi_sandi_min INTEGER NOT NULL
);
"""


class SesiBelumSiap(Exception):
    """Konfigurasi atau penyimpanan sesi belum siap; pemanggil menjawab 503."""


@dataclass
class SesiLokal:
    """Sesi akun lokal yang masih berlaku (belum direvalidasi terhadap baris akun)."""
    id_hash: str
    sub: str
    akun_id: str
    versi_sandi: int
    nama: str
    peran: str
    ingat: bool
    dibuat_pada: datetime
    kedaluwarsa: datetime


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


# Loop yang executor bawaannya sudah diganti pasang_executor_dns (referensi lemah: loop yang ditutup lepas sendiri).
_loop_ber_executor_dns: "weakref.WeakSet[asyncio.AbstractEventLoop]" = weakref.WeakSet()


def _buat_executor_dns() -> ThreadPoolExecutor:
    return ThreadPoolExecutor(max_workers=MAKS_THREAD_DNS, thread_name_prefix=_AWALAN_THREAD_DNS)


def pasang_executor_dns() -> None:
    """Pasang executor bawaan loop yang sedang berjalan (MAKS_THREAD_DNS thread), sekali per loop.

    loop.getaddrinfo (resolusi DNS httpx/anyio untuk siteverify, Worker akun, dan HIBP, serta asyncpg) memakai
    executor bawaan loop. Dipanggil hanya dari jalur login BFF (/masuk, koneksi Postgres sesi), jadi perilaku
    flag 0 tidak berubah. Tanpa loop berjalan tidak melakukan apa pun.

    Executor bawaan yang dipasang pihak lain dipertahankan. Executor otomatis asyncio (dibuat saat
    run_in_executor(None) pertama, awalan thread "asyncio") diganti lalu dimatikan tanpa menunggu: tugas yang
    sedang berjalan di sana tetap selesai.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    if loop in _loop_ber_executor_dns:
        return
    lama = getattr(loop, "_default_executor", None)
    otomatis = isinstance(lama, ThreadPoolExecutor) and getattr(lama, "_thread_name_prefix", None) == "asyncio"
    if lama is None or otomatis:
        loop.set_default_executor(_buat_executor_dns())
        if otomatis:
            lama.shutdown(wait=False)
    _loop_ber_executor_dns.add(loop)


# --- enkripsi isi sesi ----------------------------------------------------------------------------

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


@functools.lru_cache(maxsize=8)
def versi_kunci(kunci: bytes) -> str:
    """Penanda versi kunci: 8 karakter hex dari HKDF kunci; tidak bisa dipakai untuk membuka isi."""
    return HKDF(algorithm=hashes.SHA256(), length=4, salt=None, info=b"sapa-versi-kunci").derive(kunci).hex()


def _aad(id_hash: str, versi: str = "") -> bytes:
    return f"{id_hash}|{versi}".encode("ascii") if versi else id_hash.encode("ascii")


def _enkripsi(isi: dict, id_hash: str) -> str:
    kunci = _kunci(KUNCI_ENV)
    if kunci is None:
        logger.error("Kunci sesi belum dikonfigurasi atau tidak sah (%s)", KUNCI_ENV)
        raise SesiBelumSiap()
    versi = versi_kunci(kunci)
    nonce = os.urandom(12)
    sandi = AESGCM(kunci).encrypt(nonce, json.dumps(isi).encode("utf-8"), _aad(id_hash, versi))
    return f"v2.{versi}." + base64.urlsafe_b64encode(nonce + sandi).decode("ascii")


def _buka(kunci: bytes, mentah: bytes, aad: bytes) -> Optional[dict]:
    try:
        isi = json.loads(AESGCM(kunci).decrypt(mentah[:12], mentah[12:], aad))
    except (InvalidTag, ValueError):
        return None
    return isi if isinstance(isi, dict) else None


def _dekripsi(teks: str, id_hash: str) -> tuple[Optional[dict], bool]:
    """(isi, perlu_tulis_ulang); isi None bila tidak ada kunci yang cocok.

    perlu_tulis_ulang benar bila isi dibuka dengan kunci lama atau masih berformat v1 (tanpa versi kunci).
    """
    if not isinstance(teks, str):
        return None, False
    bagian = teks.split(".")
    if len(bagian) == 3 and bagian[0] == "v2":
        _, versi, badan = bagian
    elif len(bagian) == 2 and bagian[0] == "v1":
        versi, badan = "", bagian[1]
    else:
        return None, False
    try:
        mentah = base64.urlsafe_b64decode(badan.encode("ascii"))
    except (binascii.Error, ValueError):
        return None, False
    kunci_ada = [(nama == KUNCI_LAMA_ENV, k) for nama in (KUNCI_ENV, KUNCI_LAMA_ENV) if (k := _kunci(nama))]
    if versi:
        # v2: kunci dipilih dari penanda versinya; versi yang tidak dikenal tidak pernah dicoba.
        for lama, kunci in kunci_ada:
            if hmac.compare_digest(versi_kunci(kunci), versi):
                isi = _buka(kunci, mentah, _aad(id_hash, versi))
                return (isi, lama) if isi is not None else (None, False)
        return None, False
    # v1 (baris lama): belum ada penanda versi, jadi kedua kunci dicoba lalu baris ditulis ulang.
    for _, kunci in kunci_ada:
        isi = _buka(kunci, mentah, _aad(id_hash))
        if isi is not None:
            return isi, True
    return None, False


# --- penyimpanan -------------------------------------------------------------------------------

class SesiStore(Protocol):
    """Antarmuka kecil penyimpanan sesi dan pembatas. Semua waktu bertipe datetime UTC."""

    async def simpan(self, baris: dict) -> None: ...
    async def ambil(self, id_hash: str) -> Optional[dict]: ...
    async def sentuh(self, id_hash: str, waktu: datetime) -> None: ...
    async def tulis_ulang_token(self, id_hash: str, token_lama: str, token_baru: str) -> bool: ...
    async def hapus(self, id_hash: str) -> bool: ...
    async def hapus_sub(self, sub: str) -> int: ...
    async def tambah_batas(self, kunci_hash: str, jendela: int, kedaluwarsa: datetime) -> int: ...
    async def tambah_batas_geser(self, kunci_hash: str, jendela: int, kedaluwarsa: datetime) -> tuple[int, int]: ...
    async def kurangi_batas(self, kunci_hash: str, jendela: int) -> None: ...
    async def baca_batas(self, kunci_hash: str, jendela: int) -> int: ...
    async def tambah_gagal_kumulatif(self, kunci_hash: str, sekarang: datetime, kedaluwarsa_pendek: datetime,
                                     kedaluwarsa_lengket: datetime, ambang: int) -> int: ...
    async def ada_gagal_kumulatif(self, kunci_hash: str, sekarang: datetime) -> bool: ...
    async def padamkan_penanda(self, kunci_hash: str) -> None: ...
    async def bersihkan_batas(self, sekarang: datetime) -> None: ...
    async def hitung_baris_batas(self, batas: int) -> int: ...
    async def baca_jangkar(self, akun_id: str) -> int: ...
    async def naikkan_jangkar(self, akun_id: str, versi: int) -> None: ...
    async def cek(self) -> None: ...


class MemorySesiStore:
    """Penyimpanan di memori untuk tes dan pengembangan lokal (tidak tahan lintas instance)."""

    def __init__(self):
        self.sesi: dict[str, dict] = {}
        self.batas: dict[tuple, int] = {}
        self.kedaluwarsa_batas: dict[tuple, datetime] = {}
        self.penanda: dict[str, tuple[int, datetime]] = {}  # kunci -> (jumlah gagal, kedaluwarsa)
        self.jangkar: dict[str, int] = {}

    async def simpan(self, baris):
        self.sesi[baris["id_hash"]] = dict(baris)

    async def ambil(self, id_hash):
        baris = self.sesi.get(id_hash)
        return dict(baris) if baris else None

    async def sentuh(self, id_hash, waktu):
        if id_hash in self.sesi:
            self.sesi[id_hash]["terakhir_dipakai"] = waktu

    async def tulis_ulang_token(self, id_hash, token_lama, token_baru):
        # Compare-and-swap: hanya bila baris masih berisi token yang dibaca; sewa tidak disentuh.
        baris = self.sesi.get(id_hash)
        if not baris or baris["token_enc"] != token_lama:
            return False
        baris["token_enc"] = token_baru
        return True

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

    async def baca_batas(self, kunci_hash, jendela):
        return self.batas.get((kunci_hash, jendela), 0)

    async def bersihkan_batas(self, sekarang):
        for kunci in [k for k, v in self.kedaluwarsa_batas.items() if v < sekarang]:
            self.batas.pop(kunci, None)
            self.kedaluwarsa_batas.pop(kunci, None)
        for kunci in [k for k, (_, v) in self.penanda.items() if v < sekarang]:
            del self.penanda[kunci]

    async def tambah_gagal_kumulatif(self, kunci_hash, sekarang, kedaluwarsa_pendek, kedaluwarsa_lengket, ambang):
        jumlah, lama = self.penanda.get(kunci_hash, (0, None))
        jumlah = jumlah + 1 if lama is not None and lama > sekarang else 1
        self.penanda[kunci_hash] = (jumlah, kedaluwarsa_lengket if jumlah >= ambang else kedaluwarsa_pendek)
        return jumlah

    async def ada_gagal_kumulatif(self, kunci_hash, sekarang):
        _, kedaluwarsa = self.penanda.get(kunci_hash, (0, None))
        return kedaluwarsa is not None and kedaluwarsa > sekarang

    async def hitung_baris_batas(self, batas):
        return min(len(self.batas) + len(self.penanda), batas)

    async def padamkan_penanda(self, kunci_hash):
        self.penanda.pop(kunci_hash, None)

    async def baca_jangkar(self, akun_id):
        return self.jangkar.get(akun_id, 0)

    async def naikkan_jangkar(self, akun_id, versi):
        self.jangkar[akun_id] = max(self.jangkar.get(akun_id, 0), int(versi))

    async def cek(self):
        return None


# Wadah koneksi milik satu permintaan (lihat satu_koneksi); None = satu pinjaman per operasi.
_wadah_koneksi: contextvars.ContextVar[Optional[dict]] = contextvars.ContextVar("sapa_wadah_koneksi", default=None)
# Tenggat dinding blok satu_koneksi() yang sedang berjalan (waktu _monoton); None = tanpa tenggat dinding.
_batas_akhir_koneksi: contextvars.ContextVar[Optional[float]] = contextvars.ContextVar(
    "sapa_batas_akhir_koneksi", default=None)


def _sisa_tutup(batas_akhir: Optional[float]) -> float:
    return TENGGAT_TUTUP_DB if batas_akhir is None else batas_akhir - _monoton()


async def _tutup_koneksi(conn, sisa: float) -> None:
    """Tutup rapi paling lama `sisa` detik; bila tenggat sudah habis, lewat, atau galat, hentikan paksa tanpa
    menunggu server. Tenggat yang sudah habis sebelum menutup adalah jalur normal, jadi tidak dicatat."""
    try:
        if sisa > 0:
            await asyncio.wait_for(conn.close(), sisa)
            return
    except Exception as exc:  # termasuk asyncio.TimeoutError
        logger.warning("Koneksi penyimpanan sesi tidak tertutup rapi: %s", type(exc).__name__)
    except BaseException:
        _hentikan(conn)  # dibatalkan saat menutup: tetap tidak meninggalkan soket
        raise
    _hentikan(conn)


def _hentikan(conn) -> None:
    try:
        conn.terminate()
    except Exception as exc:
        logger.warning("Koneksi penyimpanan sesi tidak dapat dihentikan: %s", type(exc).__name__)


def _jam() -> tuple:
    """Waktu monoton dan waktu dinding. Lama menganggur memakai yang terbesar dari keduanya supaya instans yang
    dibekukan lalu dilanjutkan tetap terhitung lama menganggur walau jam monotonnya tidak maju."""
    return time.monotonic(), time.time()


def _lama_menganggur(sejak: tuple) -> float:
    monoton, dinding = _jam()
    return max(monoton - sejak[0], dinding - sejak[1])


def _galat_koneksi() -> tuple:
    """Galat yang menandakan koneksi tidak bisa dipakai lagi (putus, ditutup server, soket galat, atau batas
    waktu perintah)."""
    from asyncpg import exceptions as e

    return (OSError, asyncio.TimeoutError, e.InterfaceError, e.PostgresConnectionError, e.AdminShutdownError,
            e.CrashShutdownError, e.CannotConnectNowError)


def _koneksi_masih_layak(conn, exc: Exception) -> bool:
    """True bila galat adalah penolakan biasa dari server (mis. pelanggaran constraint): koneksinya tetap
    sehat dan boleh dikembalikan. Galat koneksi, batas waktu, dan galat lain membuang koneksi."""
    from asyncpg import exceptions as e

    return (isinstance(exc, e.PostgresError) and not isinstance(exc, _galat_koneksi())
            and not conn.is_closed())


class _KolamLoop:
    """Koneksi siaga penyimpanan sesi milik satu event loop."""

    def __init__(self):
        self.siaga = []  # (koneksi, dsn, waktu mulai menganggur), yang terakhir dikembalikan di ujung
        self.ditutup = False
        self.penjaga = None

    async def pinjam(self, dsn: str, sambung):
        """Koneksi siaga yang masih layak (dipakai_ulang=True) atau koneksi baru dari `sambung()`
        (dipakai_ulang=False). Paling banyak satu pemeriksaan SELECT 1 per pinjaman."""
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
                    break
            return conn, True
        return await sambung(), False

    async def kembalikan(self, conn, dsn: str, sisa_tutup: float) -> None:
        if conn.is_closed():
            return
        if self.ditutup or len(self.siaga) >= MAKS_KONEKSI_SIAGA:
            await _tutup_koneksi(conn, sisa_tutup)
            return
        self.siaga.append((conn, dsn, _jam()))

    def buang_semua(self) -> None:
        siaga, self.siaga = self.siaga, []
        for conn, _, _ in siaga:
            _hentikan(conn)


# Kolam koneksi per event loop. Entri dilepas oleh penjaga loop saat loop diakhiri; entri loop yang sudah
# ditutup atau tidak berjalan lagi tanpa penjaga sempat jalan dilepas saat registri diakses berikutnya.
_kolam_per_loop: dict = {}
_registri_kunci = threading.Lock()


async def _penjaga(loop, kolam: _KolamLoop) -> None:
    """Menunggu sampai loop diakhiri (asyncio.run membatalkan tugas yang tersisa), lalu menutup koneksi siaga
    loop itu supaya tidak tertinggal terbuka di server."""
    try:
        await loop.create_future()
    finally:
        kolam.ditutup = True
        with _registri_kunci:
            if _kolam_per_loop.get(loop) is kolam:
                del _kolam_per_loop[loop]
        siaga, kolam.siaga = kolam.siaga, []
        await asyncio.gather(*(_tutup_koneksi(conn, TENGGAT_TUTUP_DB) for conn, _, _ in siaga),
                             return_exceptions=True)


def _kolam_loop() -> _KolamLoop:
    """Kolam koneksi untuk loop yang sedang berjalan; dibuat (beserta penjaganya) saat pertama dipakai."""
    loop = asyncio.get_running_loop()
    with _registri_kunci:
        for lain in [l for l in _kolam_per_loop if l is not loop and (l.is_closed() or not l.is_running())]:
            del _kolam_per_loop[lain]
        kolam = _kolam_per_loop.get(loop)
        if kolam is None:
            kolam = _kolam_per_loop[loop] = _KolamLoop()
            kolam.penjaga = loop.create_task(_penjaga(loop, kolam))
    return kolam


@contextlib.asynccontextmanager
async def satu_koneksi(batas_akhir: Optional[float] = None):
    """Semua operasi penyimpanan Postgres di dalam blok memakai satu koneksi, dipinjam saat pertama dipakai
    dan dikembalikan ke daftar siaga di akhir blok. Operasi di dalam blok harus berurutan (bukan asyncio.gather).

    `batas_akhir` (waktu _monoton) adalah tenggat dinding pemanggil; koneksi yang ditutup ikut tenggat itu.
    Tanpa batas_akhir, penutupan paling lama TENGGAT_TUTUP_DB detik. Lewat dari itu koneksi dihentikan paksa.
    """
    wadah: dict = {}
    token = _wadah_koneksi.set(wadah)
    token_batas = _batas_akhir_koneksi.set(batas_akhir)
    try:
        yield
    finally:
        _batas_akhir_koneksi.reset(token_batas)
        _wadah_koneksi.reset(token)
        for pinjaman in wadah.values():
            await pinjaman.kolam.kembalikan(pinjaman.conn, pinjaman.dsn, _sisa_tutup(batas_akhir))


@dataclass
class _Pinjaman:
    """Koneksi yang sedang dipinjam satu operasi atau satu blok satu_koneksi()."""
    conn: object
    kolam: _KolamLoop
    dsn: str
    dipakai_ulang: bool  # berasal dari daftar siaga dan belum terbukti sehat di pinjaman ini
    dibuang: bool = False  # sudah dihentikan atau ditutup karena galat; tidak boleh dikembalikan


class PostgresSesiStore:
    """Tabel sapa_sesi dan sapa_batas di Postgres (Neon), DSN dari dsn_aktif().

    Koneksi dipinjam dari daftar siaga event loop yang sedang berjalan dan dikembalikan sesudah operasi (atau di
    akhir blok satu_koneksi()); lihat docstring modul. Skema dibuat dengan CREATE TABLE IF NOT EXISTS (aman
    maju-mundur), kecuali SAPA_SKEMA_MANUAL=1 (tanpa DDL; skema dari api/sql/sesi_neon.sql).
    """

    def __init__(self, dsn: Optional[str] = None):
        self.dsn = dsn or dsn_aktif()
        self._skema_siap = False

    async def _sambung(self):
        import asyncpg

        pasang_executor_dns()
        return await asyncpg.connect(self.dsn, timeout=TIMEOUT_DB, command_timeout=TIMEOUT_DB, statement_cache_size=0)

    async def _jalankan_di(self, conn, perintah: list):
        if not self._skema_siap:
            if _env(SKEMA_MANUAL_ENV) != "1":
                await conn.execute(SCHEMA_SQL)
            self._skema_siap = True
        return [await getattr(conn, cara)(sql, *args) for cara, sql, args in perintah]

    async def _pinjam(self) -> _Pinjaman:
        kolam = _kolam_loop()
        conn, dipakai_ulang = await kolam.pinjam(self.dsn, self._sambung)
        return _Pinjaman(conn, kolam, self.dsn, dipakai_ulang)

    async def _coba(self, pinjaman: _Pinjaman, perintah: list, sisa_tutup: Callable[[], float]):
        """Jalankan perintah pada pinjaman. Bila galat, koneksi dibuang kecuali galatnya penolakan biasa dari
        server (koneksi yang belum dibuang dikembalikan oleh pemanggil)."""
        conn = pinjaman.conn
        try:
            hasil = await self._jalankan_di(conn, perintah)
        except Exception as exc:
            if isinstance(exc, _galat_koneksi()):
                pinjaman.dibuang = True
                _hentikan(conn)  # koneksi sudah pasti rusak: tidak menunggu server
            elif not _koneksi_masih_layak(conn, exc):
                # Keadaan koneksi tidak pasti: tutup rapi dalam tenggat pemanggil, lalu terminate().
                pinjaman.dibuang = True
                await _tutup_koneksi(conn, sisa_tutup())
            raise
        except BaseException:
            # Dibatalkan di tengah perintah (mis. tenggat menunggu penyegar): tutup paksa tanpa menunggu server.
            pinjaman.dibuang = True
            _hentikan(conn)
            raise
        pinjaman.dipakai_ulang = False
        return hasil

    @staticmethod
    def _boleh_ulang(pinjaman: _Pinjaman, exc: BaseException, baca: bool) -> bool:
        """Perintah baca pada koneksi siaga yang ternyata putus boleh dicoba sekali dengan koneksi baru. Perintah
        tulis, batas waktu, dan koneksi baru tidak diulang."""
        return (baca and pinjaman.dipakai_ulang and isinstance(exc, _galat_koneksi())
                and not isinstance(exc, asyncio.TimeoutError))

    async def _urutan(self, perintah: list, baca: bool = False):
        wadah = _wadah_koneksi.get()
        if wadah is None:
            return await self._urutan_sendiri(perintah, baca)
        sisa_tutup = lambda: _sisa_tutup(_batas_akhir_koneksi.get())  # noqa: E731
        pinjaman = wadah.get(id(self))
        if pinjaman is None:
            pinjaman = wadah[id(self)] = await self._pinjam()
        try:
            return await self._coba(pinjaman, perintah, sisa_tutup)
        except BaseException as exc:
            if pinjaman.dibuang:
                wadah.pop(id(self), None)  # operasi berikutnya di blok ini membuka koneksi baru
            if not isinstance(exc, Exception) or not self._boleh_ulang(pinjaman, exc, baca):
                raise
        pinjaman = wadah[id(self)] = _Pinjaman(await self._sambung(), pinjaman.kolam, self.dsn, False)
        try:
            return await self._coba(pinjaman, perintah, sisa_tutup)
        except BaseException:
            if pinjaman.dibuang:
                wadah.pop(id(self), None)
            raise

    async def _urutan_sendiri(self, perintah: list, baca: bool):
        sisa_tutup = lambda: TENGGAT_TUTUP_DB  # noqa: E731
        pinjaman = await self._pinjam()
        try:
            hasil = await self._coba(pinjaman, perintah, sisa_tutup)
        except BaseException as exc:
            await self._kembalikan_bila_layak(pinjaman)
            if not isinstance(exc, Exception) or not self._boleh_ulang(pinjaman, exc, baca):
                raise
        else:
            await self._kembalikan_bila_layak(pinjaman)
            return hasil
        pinjaman = _Pinjaman(await self._sambung(), pinjaman.kolam, self.dsn, False)
        try:
            hasil = await self._coba(pinjaman, perintah, sisa_tutup)
        finally:
            await self._kembalikan_bila_layak(pinjaman)
        return hasil

    @staticmethod
    async def _kembalikan_bila_layak(pinjaman: _Pinjaman) -> None:
        if not pinjaman.dibuang:
            await pinjaman.kolam.kembalikan(pinjaman.conn, pinjaman.dsn, TENGGAT_TUTUP_DB)

    async def _jalankan(self, cara: str, sql: str, *args, baca: bool = False):
        return (await self._urutan([(cara, sql, args)], baca=baca))[0]

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
            "FROM sapa_sesi WHERE id_hash = $1", id_hash, baca=True)
        return dict(baris) if baris else None

    async def sentuh(self, id_hash, waktu):
        await self._jalankan("execute", "UPDATE sapa_sesi SET terakhir_dipakai = $2 WHERE id_hash = $1", id_hash, waktu)

    async def tulis_ulang_token(self, id_hash, token_lama, token_baru):
        # Compare-and-swap: hanya bila baris masih berisi isi terenkripsi yang dibaca (rotasi kunci atau v1).
        hasil = await self._jalankan("execute", "UPDATE sapa_sesi SET token_enc = $3 WHERE id_hash = $1 AND token_enc = $2",
                                     id_hash, token_lama, token_baru)
        return str(hasil).endswith(" 1")

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

    async def baca_batas(self, kunci_hash, jendela):
        return int(await self._jalankan(
            "fetchval", "SELECT jumlah FROM sapa_batas WHERE kunci_hash = $1 AND jendela = $2", kunci_hash, jendela,
            baca=True) or 0)

    # Hitungan gagal memakai baris sapa_batas dengan jendela -1; baris yang sudah kedaluwarsa mulai lagi
    # dari 1 dan ikut dibersihkan bersihkan_batas. Setiap kegagalan memperpanjang kedaluwarsa ke yang
    # pendek ($2), atau ke yang lengket ($3) bila hitungan baru sudah mencapai ambang ($5). Ambang > 1, jadi
    # baris baru (jumlah 1) selalu berumur pendek. Di DO UPDATE kedua CASE membaca nilai lama baris.
    async def tambah_gagal_kumulatif(self, kunci_hash, sekarang, kedaluwarsa_pendek, kedaluwarsa_lengket, ambang):
        lanjut = "CASE WHEN sapa_batas.kedaluwarsa > $4 THEN sapa_batas.jumlah + 1 ELSE 1 END"
        return int(await self._jalankan(
            "fetchval",
            "INSERT INTO sapa_batas (kunci_hash, jendela, jumlah, kedaluwarsa) VALUES ($1, -1, 1, $2) "
            "ON CONFLICT (kunci_hash, jendela) DO UPDATE SET "
            f"jumlah = {lanjut}, kedaluwarsa = CASE WHEN {lanjut} >= $5 THEN $3 ELSE $2 END "
            "RETURNING jumlah",
            kunci_hash, kedaluwarsa_pendek, kedaluwarsa_lengket, sekarang, int(ambang)))

    async def ada_gagal_kumulatif(self, kunci_hash, sekarang):
        return bool(await self._jalankan(
            "fetchval", "SELECT 1 FROM sapa_batas WHERE kunci_hash = $1 AND jendela = -1 AND kedaluwarsa > $2",
            kunci_hash, sekarang, baca=True))

    async def padamkan_penanda(self, kunci_hash):
        await self._jalankan("execute", "DELETE FROM sapa_batas WHERE kunci_hash = $1 AND jendela = -1", kunci_hash)

    async def bersihkan_batas(self, sekarang):
        # Dibatasi BATAS_BERSIH baris per panggilan supaya tidak pernah menjadi kueri panjang.
        await self._jalankan(
            "execute",
            "DELETE FROM sapa_batas WHERE ctid IN "
            f"(SELECT ctid FROM sapa_batas WHERE kedaluwarsa < $1 LIMIT {int(BATAS_BERSIH)})", sekarang)

    async def hitung_baris_batas(self, batas):
        # Dibatasi LIMIT; cukup untuk tahu ambang sudah lewat.
        return int(await self._jalankan(
            "fetchval", "SELECT count(*) FROM (SELECT 1 FROM sapa_batas LIMIT $1) AS t", int(batas), baca=True))

    async def baca_jangkar(self, akun_id):
        return int(await self._jalankan(
            "fetchval", "SELECT versi_sandi_min FROM akun_jangkar WHERE akun_id = $1", akun_id, baca=True) or 0)

    async def naikkan_jangkar(self, akun_id, versi):
        # Hanya pernah naik: baris lama (salinan D1 yang dikembalikan) tidak bisa menurunkan jangkar.
        await self._jalankan(
            "execute",
            "INSERT INTO akun_jangkar (akun_id, versi_sandi_min) VALUES ($1, $2) ON CONFLICT (akun_id) DO UPDATE "
            "SET versi_sandi_min = GREATEST(akun_jangkar.versi_sandi_min, EXCLUDED.versi_sandi_min)",
            akun_id, int(versi))

    async def cek(self):
        await self._jalankan("fetchval", "SELECT 1", baca=True)


_store: Optional[SesiStore] = None
_store_pg: dict[str, PostgresSesiStore] = {}


def dsn_aktif() -> str:
    """DSN yang dipakai: SAPA_SESI_DSN_APLIKASI (role terbatas) bila ada, selain itu DSN integrasi.

    Dengan SAPA_SKEMA_MANUAL=1 hanya DSN role terbatas yang diterima, sehingga role bawaan integrasi (pemilik
    database) tidak pernah dipakai diam-diam; tanpa DSN itu penyimpanan dianggap belum siap (503, gagal tertutup).
    """
    aplikasi = _env(DSN_APLIKASI_ENV)
    if aplikasi or _env(SKEMA_MANUAL_ENV) == "1":
        return aplikasi
    return _env(DSN_ENV)


def store() -> Optional[SesiStore]:
    """Penyimpanan aktif: yang dipasang lewat atur_store (tes), atau Postgres bila DSN diisi."""
    if _store is not None:
        return _store
    dsn = dsn_aktif()
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
        nama = DSN_APLIKASI_ENV if _env(SKEMA_MANUAL_ENV) == "1" else DSN_ENV
        logger.error("Penyimpanan sesi belum dikonfigurasi (%s kosong)", nama)
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


# --- sesi ---------------------------------------------------------------------------------------

async def buat_sesi_lokal(akun_id: str, versi_sandi: int, nama: str, peran: str, ingat: bool) -> str:
    """Buat sesi baru untuk akun lokal yang sudah diverifikasi; kembalikan nilai cookie (bukan hash)."""
    s = _store_wajib()
    cookie = secrets.token_urlsafe(32)
    id_hash = _hash(cookie)
    sekarang = _sekarang()
    kedaluwarsa = sekarang + (UMUR_INGAT if ingat else umur_tanpa_ingat())
    isi = {"akun": akun_id, "vs": int(versi_sandi), "nama": nama, "peran": peran}
    baris = {
        "id_hash": id_hash, "sub": SUB_AWALAN + akun_id, "ingat": bool(ingat), "dibuat_pada": sekarang,
        "terakhir_dipakai": sekarang, "kedaluwarsa": kedaluwarsa, "token_enc": _enkripsi(isi, id_hash),
        "token_exp": kedaluwarsa,
    }
    await _aman(s.simpan(baris))
    return cookie


def _isi_lokal(isi: Optional[dict]) -> bool:
    return (isinstance(isi, dict) and isinstance(isi.get("akun"), str) and type(isi.get("vs")) is int
            and isinstance(isi.get("nama"), str) and isinstance(isi.get("peran"), str))


async def ambil_sesi_lokal(cookie, adalah_admin: Optional[Callable[[str], bool]] = None) -> Optional[SesiLokal]:
    """Sesi akun lokal yang masih berlaku untuk nilai cookie ini, atau None. Sesi kedaluwarsa, menganggur, atau
    berisi format lama (token Auth0) langsung dihapus.

    `adalah_admin(peran)` hanya dipakai bila batas menganggur admin diaktifkan lewat env.
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
    isi, tulis_ulang = _dekripsi(baris["token_enc"], id_hash)
    if isi is None:
        # Baris ada tetapi tidak terbuka: kemungkinan besar kunci salah pasang. Gagal tertutup (503) tanpa
        # menghapus baris maupun cookie, supaya sesi kembali terbaca setelah kunci dibetulkan.
        logger.error("Sesi tidak dapat dibuka dengan kunci yang ada (%s)", KUNCI_ENV)
        raise SesiBelumSiap()
    if not _isi_lokal(isi) or baris["sub"] != SUB_AWALAN + isi["akun"]:
        # Sesi dari login Auth0 sebelumnya (atau isi tak dikenal) tidak berlaku di jalur akun lokal.
        await _aman(s.hapus(id_hash))
        return None
    batas_admin = batas_menganggur_admin()
    if (batas_admin is not None and adalah_admin is not None
            and sekarang - baris["terakhir_dipakai"] > batas_admin and adalah_admin(isi["peran"])):
        await _aman(s.hapus(id_hash))
        return None
    if tulis_ulang:
        # Rotasi kunci: tulis ulang dengan kunci baru (compare-and-swap; isi sesi tidak pernah berubah).
        await _aman(s.tulis_ulang_token(id_hash, baris["token_enc"], _enkripsi(isi, id_hash)))
    if sekarang - baris["terakhir_dipakai"] >= _JEDA_SENTUH:
        await sentuh(id_hash, sekarang)
    return SesiLokal(id_hash=id_hash, sub=baris["sub"], akun_id=isi["akun"], versi_sandi=isi["vs"], nama=isi["nama"],
                     peran=isi["peran"], ingat=baris["ingat"], dibuat_pada=baris["dibuat_pada"],
                     kedaluwarsa=baris["kedaluwarsa"])


async def sentuh(id_hash: str, waktu: Optional[datetime] = None) -> None:
    await _aman(_store_wajib().sentuh(id_hash, waktu or _sekarang()))


def _monoton() -> float:
    return time.monotonic()


async def hapus_sesi(cookie) -> bool:
    if not isinstance(cookie, str) or not _COOKIE_RE.fullmatch(cookie):
        return False
    return await _aman(_store_wajib().hapus(_hash(cookie)))


async def hapus_sesi_id(id_hash: str) -> bool:
    return await _aman(_store_wajib().hapus(id_hash))


async def hapus_semua_sesi_user(sub: str) -> int:
    """Akhiri semua sesi satu akun (ubah sandi, pemulihan, penyiapan)."""
    return await _aman(_store_wajib().hapus_sub(sub))


async def baca_jangkar(akun_id: str) -> int:
    """versi_sandi_min akun ini (0 bila belum ada); SesiBelumSiap bila tidak terbaca."""
    return await _aman(_store_wajib().baca_jangkar(akun_id))


async def naikkan_jangkar(akun_id: str, versi: int) -> None:
    await _aman(_store_wajib().naikkan_jangkar(akun_id, versi))


# --- pembatas ----------------------------------------------------------------------------------

async def batas(kunci: str, jendela_detik: int, maks: int) -> bool:
    """True bila percobaan ini masih di bawah batas `maks` per jendela tetap `jendela_detik`.

    Kunci disimpan sebagai HMAC berkunci (bersama panjang jendela), tidak pernah mentah.
    """
    jumlah, _ = await hitung(kunci, jendela_detik)
    return jumlah <= maks


def _acak() -> float:
    return random.random()


async def _bersihkan_kadang(s: SesiStore) -> None:
    """Sesekali hapus baris sapa_batas kedaluwarsa (PELUANG_BERSIH per panggilan).

    Sesudahnya ukuran tabel diperiksa; di atas AMBANG_PERINGATAN_BARIS_BATAS hanya dicatat di log.
    """
    if _acak() >= PELUANG_BERSIH:
        return
    try:
        await s.bersihkan_batas(_sekarang())
        jumlah = await s.hitung_baris_batas(AMBANG_PERINGATAN_BARIS_BATAS + 1)
    except Exception as exc:
        logger.warning("Pembersihan sapa_batas dilewati: %s", type(exc).__name__)
        return
    if jumlah > AMBANG_PERINGATAN_BARIS_BATAS:
        logger.warning("Peringatan: tabel sapa_batas berisi lebih dari %d baris setelah pembersihan; "
                       "periksa ukuran database Neon dan pola percobaan login", AMBANG_PERINGATAN_BARIS_BATAS)


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


async def baca_hitungan(kunci: str, jendela_detik: int) -> int:
    """Hitungan jendela berjalan `kunci` tanpa menambahnya (0 bila belum ada); tidak membuat baris."""
    jendela, _ = _jendela(_sekarang().timestamp(), jendela_detik)
    return await _aman(_store_wajib().baca_batas(jejak(f"{jendela_detik}:{kunci}"), jendela))


async def kembalikan(tiket: tuple) -> None:
    """Batalkan satu hitungan dari `hitung` (misalnya percobaan yang ternyata bukan kegagalan)."""
    await _aman(_store_wajib().kurangi_batas(*tiket))


# --- hitungan gagal per (username + IP) ---------------------------------------------------------

async def tambah_gagal_kumulatif(kunci: str, umur_pendek: timedelta, umur_lengket: timedelta, ambang: int) -> int:
    """Tambah satu kegagalan pada hitungan `kunci`; kembalikan jumlahnya termasuk kegagalan ini.

    Hitungan berumur `umur_pendek` sejak gagal terakhir (mulai lagi dari 1 bila sudah lewat). Begitu jumlahnya
    mencapai `ambang`, baris naik menjadi penanda lengket berumur `umur_lengket` sejak gagal terakhir.
    Kunci disimpan sebagai HMAC.
    """
    sekarang = _sekarang()
    return await _aman(_store_wajib().tambah_gagal_kumulatif(
        jejak(f"kumulatif:{kunci}"), sekarang, sekarang + umur_pendek, sekarang + umur_lengket, ambang))


async def ada_gagal_kumulatif(kunci: str) -> bool:
    """True bila hitungan gagal `kunci` (pendek atau lengket) masih hidup."""
    return await _aman(_store_wajib().ada_gagal_kumulatif(jejak(f"kumulatif:{kunci}"), _sekarang()))


async def padamkan_penanda(kunci: str) -> None:
    """Reset hitungan kumulatif `kunci` (login sukses)."""
    await _aman(_store_wajib().padamkan_penanda(jejak(f"kumulatif:{kunci}")))


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
    """Pemeriksaan kesehatan tanpa nilai rahasia: kunci, db."""
    db = False
    s = store()
    if s is not None:
        try:
            await s.cek()
            db = True
        except Exception as exc:
            logger.error("Penyimpanan sesi tidak terjangkau: %s", type(exc).__name__)
    return {"kunci": kunci_siap(), "db": db}
