"""Sesi login SAPA di server (login satu halaman, di balik flag SAPA_LOGIN_BFF).

- Browser hanya memegang cookie acak __Host-sapa_sesi (32 byte). Database hanya menyimpan sha256-nya.
- Token Auth0 (access dan refresh) disimpan terenkripsi AES-GCM dengan kunci SAPA_SESI_KUNCI
  (base64, 32 byte), berformat "v2.<versi kunci>.<isi>". Versi kunci adalah sidik 8 karakter dari kunci
  (HKDF, bukan kunci itu sendiri), jadi dekripsi langsung memilih SAPA_SESI_KUNCI atau
  SAPA_SESI_KUNCI_LAMA tanpa coba-coba. Sesi yang terbuka dengan kunci lama, dan baris lama "v1."
  (tanpa versi, masih dicoba dengan kedua kunci), ditulis ulang dengan kunci baru. Isi terenkripsi
  diikat ke id sesi dan versi kunci (AAD).
- "Ingat saya": berlaku 30 hari. Tanpa centang: maksimal SAPA_SESI_TANPA_INGAT_JAM (12) jam total
  dan SAPA_SESI_IDLE_MENIT (120) menit menganggur.
- Access token disegarkan di server lewat refresh token bila sisa umurnya kurang dari 60 detik, dan
  paling lama tiap 15 menit, supaya akun yang diblokir di Auth0 cepat kehilangan sesinya.
  Penyegaran memakai kuota global /oauth/token tersendiri (KUNCI_GLOBAL_SEGAR), terpisah dari login,
  supaya banjir login tidak menunda penyegaran sesi yang sudah masuk. IP klien diteruskan lewat
  header auth0-forwarded-for, sama dengan login; di Vercel tanpa IP tepercaya tidak ada penyegaran
  (token yang masih berlaku dipakai, selain itu 503).
- Single-flight per baris sesi (SES-6): hanya permintaan yang memenangi UPDATE bersyarat atas kolom
  segar_sampai (kunci sewa UMUR_KUNCI_SEGAR, 30 detik) yang memanggil Auth0. Permintaan lain memakai token
  lama bila masih berlaku, atau menunggu paling lama MAKS_TUNGGU_SEGAR waktu dinding, termasuk pembacaan DB
  (satu koneksi DB, jeda bertambah dari JEDA_TUNGGU_SEGAR sampai JEDA_TUNGGU_SEGAR_MAKS), lalu memakai
  token baru (503 bila tetap belum ada).
  Bila Auth0 tetap menolak refresh token, baris dibaca ulang sebelum sesi diakhiri.
- Sewa hanya dilepas bila Auth0 pasti tidak memproses refresh token (N3, K1, K6): galat sebelum Auth0 dipanggil,
  koneksi ke Auth0 yang tidak pernah terbentuk (STATUS_TIDAK_TERKIRIM: httpx.ConnectError, ConnectTimeout,
  PoolTimeout; permintaan pasti belum terkirim), atau jawaban penolakan yang jelas (_STATUS_PASTI_TIDAK_DIPROSES:
  400, 401, 403, 404, 429, 503). Jawaban lain (status 0 karena timeout baca atau tulis, koneksi putus sesudah
  tersambung, atau tenggat total habis; 200 tanpa access_token atau body bukan JSON; 500, 502, 504, 52x; galat
  apa pun sesudah Auth0 dipanggil) dianggap hasil tidak diketahui: sewa dibiarkan sampai kedaluwarsa alami
  (UMUR_KUNCI_SEGAR, 30 detik), supaya refresh token yang mungkin sudah dirotasi tidak dipakai dua kali.
  Konsekuensi: saat Auth0 5xx atau lambat, sesi yang access token-nya sudah habis menjawab 503 sampai sewa
  habis, dan bila Auth0 ternyata sudah merotasi refresh token, sesi itu berakhir (keluar paksa) pada penyegaran
  berikutnya sekitar 30 detik kemudian. Reuse interval refresh token di Auth0 akan mencegahnya, tetapi itu
  keputusan CEO (keputusan terbuka di docs/runbook-login-bff.md).
- Setiap panggilan Auth0 punya tenggat total TENGGAT_AUTH0 (N4, asyncio.wait_for), karena timeout httpx
  berlaku per tahap (connect, read), bukan untuk seluruh panggilan. Tenggat habis dianggap status 0. Klien
  httpx async bisa dibatalkan (K2), jadi tidak ada kiriman yang tertinggal sesudah tenggat. Pembatalan di
  tengah TLS handshake TIDAK menutup soket (httpcore hanya menutupnya untuk galat biasa, bukan pembatalan),
  jadi tenggat per tahap httpx (K4: connect TIMEOUT_AUTH0_SAMBUNG, pool TIMEOUT_AUTH0_POOL, baca dan tulis
  TIMEOUT_AUTH0) dibuat jauh di bawah tenggat total: TCP connect dan TLS handshake masing-masing paling lama
  5 detik, ditambah pool 5 detik, = 15 detik < 16. Dengan begitu sambungan yang macet dihentikan httpx sendiri
  (ConnectTimeout, soket ditutup) sebelum wait_for membatalkannya.
  Semua penulisan token bersyarat (S1): tulis ulang rotasi kunci atau v1 adalah compare-and-swap atas
  token_enc yang dibaca (tanpa menyentuh segar_sampai), dan hasil penyegaran hanya disimpan oleh pemegang
  sewa atau selama baris masih berisi token sebelum penyegaran. Bila syarat gagal, baris dibaca ulang dan
  isinya yang dipakai. Sewa mencakup waktu terburuk Auth0 dan DB; pemegang yang terlambat sebelum
  memanggil Auth0 berhenti tanpa memanggilnya.
- Batas menganggur khusus Admin dan Super Admin (usulan IDLE_ADMIN_USULAN_MENIT = 30) sudah disiapkan,
  tetapi NONAKTIF sampai CEO memutuskan: berlaku hanya bila SAPA_SESI_IDLE_ADMIN_MENIT diisi.
- Tanpa cache sesi di memori. SLA pencabutan: sesi yang dihapus (keluar, pencabutan admin,
  kedaluwarsa) ditolak pada permintaan berikutnya di instans mana pun, karena setiap permintaan membaca
  baris sesi dari DB. Batas atas yang disepakati bila kelak ada cache: 5 detik per instans.
- Pembatas percobaan (batas) memakai tabel sapa_batas supaya tahan lintas instance serverless. Hitungan
  gagal per (username + IP) untuk penanda lengket (B1) memakai tabel yang sama dengan jendela -1. Baris itu
  berumur pendek (umur_pendek sejak gagal terakhir) dan baru menjadi penanda lengket (umur_lengket sejak
  gagal terakhir) setelah hitungannya mencapai ambang (N1), jadi gagal sekali untuk banyak username tidak
  meninggalkan baris berumur 30 hari.
  Baris kedaluwarsa dibersihkan sesekali (PELUANG_BERSIH per panggilan) dan saat login sukses. Setiap
  pembersihan juga menghitung baris sapa_batas (dibatasi LIMIT) dan mencatat peringatan di log bila
  jumlahnya melewati AMBANG_PERINGATAN_BARIS_BATAS.
- satu_koneksi(): semua operasi penyimpanan di dalam blok memakai satu koneksi Postgres. Penutupan di akhir
  blok, dan koneksi yang dibuang karena galat di tengah blok, ikut tenggat (K5): sisa tenggat dinding pemanggil
  (batas_akhir) atau TENGGAT_TUTUP_DB, lalu terminate()
  bila habis atau galat, supaya close() yang menunggu server tidak menambah sampai 5 detik.
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
import os
import random
import re
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional, Protocol

import httpx
import jwt
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
# Timeout satu panggilan: httpx (baca dan tulis TIMEOUT_AUTH0) dan asyncpg (connect dan command masing-masing
# TIMEOUT_DB). Waktu terburuk satu panggilan = dua kali timeout-nya.
TIMEOUT_AUTH0 = 8
# K4: tenggat tahap connect (TCP connect dan TLS handshake masing-masing) dan menunggu pool httpx, jauh di
# bawah TENGGAT_AUTH0: 2 x 5 + 5 = 15 < 16 detik.
TIMEOUT_AUTH0_SAMBUNG = 5
TIMEOUT_AUTH0_POOL = 5
TIMEOUT_DB = 5
# K5: tenggat menutup koneksi satu_koneksi() bila pemanggil tidak memberi tenggat dinding (mis. /masuk).
TENGGAT_TUTUP_DB = 2
WAKTU_TERBURUK_AUTH0 = 2 * TIMEOUT_AUTH0
WAKTU_TERBURUK_DB = 2 * TIMEOUT_DB
# N4: tenggat total satu panggilan Auth0 (16 detik); lewat dari itu hasilnya dianggap tidak diketahui (status 0).
TENGGAT_AUTH0 = WAKTU_TERBURUK_AUTH0
# Single-flight penyegaran (S1): sewa mencakup jatah sebelum Auth0 (kuota global), panggilan Auth0 terburuk,
# dan simpanan token terburuk. Pemegang yang sudah melewati BATAS_SEBELUM_AUTH0 sebelum memanggil Auth0
# berhenti tanpa memanggil Auth0, jadi refresh token tidak dipakai dua kali karena sewa basi diambil alih.
BATAS_SEBELUM_AUTH0 = 4
# Sewa = 4 + 16 + 10 = 30 detik.
UMUR_KUNCI_SEGAR = timedelta(seconds=BATAS_SEBELUM_AUTH0 + WAKTU_TERBURUK_AUTH0 + WAKTU_TERBURUK_DB)
MAKS_TUNGGU_SEGAR = 2.0
# Jeda menunggu penyegar lain: 0,1 lalu berlipat dua sampai 0,5 detik (0,1 + 0,2 + 0,4 + 0,5 + ...).
JEDA_TUNGGU_SEGAR = 0.1
JEDA_TUNGGU_SEGAR_MAKS = 0.5
# N3 (K1): status Auth0 yang pasti berarti refresh token TIDAK diproses (ditolak sebelum rotasi, kuota, atau
# layanan tidak tersedia). Hanya untuk status ini sewa dilepas. Jawaban lain sesudah Auth0 dipanggil, termasuk
# 200 tanpa access_token, body bukan JSON, 500, 502/504, 52x, status 0 (timeout, koneksi putus, tenggat habis),
# dan status tak dikenal, dianggap hasil tidak diketahui: sewa dibiarkan sampai kedaluwarsa.
_STATUS_PASTI_TIDAK_DIPROSES = {400, 401, 403, 404, 429, 503}
# K6: status _auth0_post bila koneksi ke Auth0 tidak pernah terbentuk (ConnectError, ConnectTimeout, PoolTimeout):
# permintaan pasti belum terkirim, jadi sewa penyegaran boleh dilepas. Bernilai negatif supaya pemanggil yang
# memeriksa status <= 0 (login) memperlakukannya sama dengan Auth0 tidak terjangkau.
STATUS_TIDAK_TERKIRIM = -1
_GALAT_BELUM_TERKIRIM = (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout)
# Peluang satu panggilan pembatas ikut membersihkan baris sapa_batas yang sudah kedaluwarsa.
PELUANG_BERSIH = 0.01
BATAS_BERSIH = 1000
# N1: peringatan di log bila sapa_batas masih berisi lebih dari ini setelah pembersihan (kuota Neon).
AMBANG_PERINGATAN_BARIS_BATAS = 200_000
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
    token_exp TIMESTAMPTZ NOT NULL,
    segar_sampai TIMESTAMPTZ
);
ALTER TABLE sapa_sesi ADD COLUMN IF NOT EXISTS segar_sampai TIMESTAMPTZ;
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


def _klien_auth0(transport=None) -> httpx.AsyncClient:
    tahap = httpx.Timeout(connect=TIMEOUT_AUTH0_SAMBUNG, read=TIMEOUT_AUTH0, write=TIMEOUT_AUTH0,
                          pool=TIMEOUT_AUTH0_POOL)
    return httpx.AsyncClient(timeout=tahap, follow_redirects=False, transport=transport)


async def _auth0_post(path: str, data: dict, headers: Optional[dict] = None) -> tuple[int, Optional[dict]]:
    """POST form ke Auth0. Body tidak pernah dicatat.

    (STATUS_TIDAK_TERKIRIM, None) bila koneksi tidak pernah terbentuk (pasti belum terkirim, K6); (0, None) bila
    hasilnya tidak diketahui (galat sesudah koneksi terbentuk, atau tenggat total habis).
    """
    url = f"https://{domain_auth0()}{path}"

    async def kirim():
        try:
            async with _klien_auth0() as klien:
                res = await klien.post(url, data=data, headers=headers or {})
        except _GALAT_BELUM_TERKIRIM:
            return STATUS_TIDAK_TERKIRIM, None
        except (httpx.HTTPError, httpx.InvalidURL):
            return 0, None
        try:
            body = res.json()
        except ValueError:
            body = None
        return res.status_code, body if isinstance(body, dict) else None

    # N4: timeout httpx hanya per tahap; tenggat total membatasi seluruh panggilan. Klien async (K2), bukan
    # requests di thread: pembatalan oleh wait_for menghentikan penantian DNS, connect, atau kiriman yang belum
    # terjadi, jadi refresh token tidak pernah terkirim sesudah tenggat (atau sesudah sewa habis). Thread
    # getaddrinfo di executor bawaan loop tetap berjalan sampai resolver selesai, tetapi hasilnya dibuang. Pembatalan di tengah
    # TLS handshake tidak menutup soket; karena itu tenggat connect dan pool (K4) di bawah TENGGAT_AUTH0, supaya
    # handshake yang macet sudah dihentikan httpx (soket ditutup) sebelum tenggat total tercapai.
    try:
        return await asyncio.wait_for(kirim(), TENGGAT_AUTH0)
    except asyncio.TimeoutError:
        logger.warning("Panggilan Auth0 %s melewati tenggat total %s detik", path, TENGGAT_AUTH0)
        return 0, None


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


@functools.lru_cache(maxsize=8)
def versi_kunci(kunci: bytes) -> str:
    """Penanda versi kunci (R6): 8 karakter hex dari HKDF kunci; tidak bisa dipakai untuk membuka isi."""
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
    # v1 (baris sebelum R6): belum ada penanda versi, jadi kedua kunci dicoba lalu baris ditulis ulang.
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
    async def simpan_hasil_segar(self, id_hash: str, token_enc: str, token_exp: datetime, sampai: datetime,
                                 token_lama: str) -> bool: ...
    async def hapus(self, id_hash: str) -> bool: ...
    async def hapus_sub(self, sub: str) -> int: ...
    async def tambah_batas(self, kunci_hash: str, jendela: int, kedaluwarsa: datetime) -> int: ...
    async def tambah_batas_geser(self, kunci_hash: str, jendela: int, kedaluwarsa: datetime) -> tuple[int, int]: ...
    async def kurangi_batas(self, kunci_hash: str, jendela: int) -> None: ...
    async def baca_batas(self, kunci_hash: str, jendela: int) -> int: ...
    async def klaim_segar(self, id_hash: str, token_enc: str, sampai: datetime, sekarang: datetime) -> bool: ...
    async def lepas_segar(self, id_hash: str, sampai: datetime) -> None: ...
    async def tambah_gagal_kumulatif(self, kunci_hash: str, sekarang: datetime, kedaluwarsa_pendek: datetime,
                                     kedaluwarsa_lengket: datetime, ambang: int) -> int: ...
    async def ada_gagal_kumulatif(self, kunci_hash: str, sekarang: datetime) -> bool: ...
    async def padamkan_penanda(self, kunci_hash: str) -> None: ...
    async def bersihkan_batas(self, sekarang: datetime) -> None: ...
    async def hitung_baris_batas(self, batas: int) -> int: ...
    async def cek(self) -> None: ...


class MemorySesiStore:
    """Penyimpanan di memori untuk tes dan pengembangan lokal (tidak tahan lintas instance)."""

    def __init__(self):
        self.sesi: dict[str, dict] = {}
        self.batas: dict[tuple, int] = {}
        self.kedaluwarsa_batas: dict[tuple, datetime] = {}
        self.penanda: dict[str, tuple[int, datetime]] = {}  # kunci -> (jumlah gagal, kedaluwarsa)

    async def simpan(self, baris):
        self.sesi[baris["id_hash"]] = dict(baris)

    async def ambil(self, id_hash):
        baris = self.sesi.get(id_hash)
        return dict(baris) if baris else None

    async def sentuh(self, id_hash, waktu):
        if id_hash in self.sesi:
            self.sesi[id_hash]["terakhir_dipakai"] = waktu

    async def tulis_ulang_token(self, id_hash, token_lama, token_baru):
        # Compare-and-swap (S1): hanya bila baris masih berisi token yang dibaca; sewa tidak disentuh.
        baris = self.sesi.get(id_hash)
        if not baris or baris["token_enc"] != token_lama:
            return False
        baris["token_enc"] = token_baru
        return True

    async def simpan_hasil_segar(self, id_hash, token_enc, token_exp, sampai, token_lama):
        # Hanya pemegang sewa, atau bila belum ada penyegar lain yang menyimpan token lebih baru (S1).
        baris = self.sesi.get(id_hash)
        if not baris or (baris.get("segar_sampai") != sampai and baris["token_enc"] != token_lama):
            return False
        baris.update(token_enc=token_enc, token_exp=token_exp, segar_sampai=None)
        return True

    async def klaim_segar(self, id_hash, token_enc, sampai, sekarang):
        # Tanpa await di antara pemeriksaan dan penulisan, jadi atomik di satu event loop (setara UPDATE bersyarat).
        baris = self.sesi.get(id_hash)
        if not baris or baris["token_enc"] != token_enc:
            return False
        if baris.get("segar_sampai") is not None and baris["segar_sampai"] >= sekarang:
            return False
        baris["segar_sampai"] = sampai
        return True

    async def lepas_segar(self, id_hash, sampai):
        baris = self.sesi.get(id_hash)
        if baris and baris.get("segar_sampai") == sampai:
            baris["segar_sampai"] = None

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

    async def cek(self):
        return None


# Wadah koneksi milik satu permintaan (lihat satu_koneksi); None = satu koneksi per operasi.
_wadah_koneksi: contextvars.ContextVar[Optional[dict]] = contextvars.ContextVar("sapa_wadah_koneksi", default=None)
# Tenggat dinding blok satu_koneksi() yang sedang berjalan (waktu _monoton); None = tanpa tenggat dinding.
_batas_akhir_koneksi: contextvars.ContextVar[Optional[float]] = contextvars.ContextVar(
    "sapa_batas_akhir_koneksi", default=None)


def _sisa_tutup(batas_akhir: Optional[float]) -> float:
    return TENGGAT_TUTUP_DB if batas_akhir is None else batas_akhir - _monoton()


async def _tutup_koneksi(conn, sisa: float) -> None:
    """Tutup rapi paling lama `sisa` detik; bila tenggat sudah habis, lewat, atau galat, hentikan paksa tanpa
    menunggu server (K5). Tenggat yang sudah habis sebelum menutup adalah jalur normal, jadi tidak dicatat."""
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


@contextlib.asynccontextmanager
async def satu_koneksi(batas_akhir: Optional[float] = None):
    """Semua operasi penyimpanan Postgres di dalam blok memakai satu koneksi, dibuka saat pertama dipakai
    dan ditutup di akhir blok. Operasi di dalam blok harus berurutan (bukan asyncio.gather).

    `batas_akhir` (waktu _monoton) adalah tenggat dinding pemanggil; penutupan koneksi ikut tenggat itu (K5).
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
        for conn in wadah.values():
            await _tutup_koneksi(conn, _sisa_tutup(batas_akhir))


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

        return await asyncpg.connect(self.dsn, timeout=TIMEOUT_DB, command_timeout=TIMEOUT_DB, statement_cache_size=0)

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
        except BaseException as exc:
            # Koneksi bisa sudah rusak; operasi berikutnya membuka koneksi baru.
            wadah.pop(id(self), None)
            if isinstance(exc, Exception):
                # K5 (F1): penutupan koneksi rusak ikut tenggat yang sama dengan akhir blok, lalu terminate().
                await _tutup_koneksi(conn, _sisa_tutup(_batas_akhir_koneksi.get()))
            else:
                # Dibatalkan di tengah perintah (mis. tenggat menunggu penyegar, K3): tutup paksa tanpa
                # menunggu server.
                _hentikan(conn)
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
            "SELECT id_hash, sub, ingat, dibuat_pada, terakhir_dipakai, kedaluwarsa, token_enc, token_exp, segar_sampai "
            "FROM sapa_sesi WHERE id_hash = $1", id_hash)
        return dict(baris) if baris else None

    async def sentuh(self, id_hash, waktu):
        await self._jalankan("execute", "UPDATE sapa_sesi SET terakhir_dipakai = $2 WHERE id_hash = $1", id_hash, waktu)

    async def tulis_ulang_token(self, id_hash, token_lama, token_baru):
        # S1: compare-and-swap. Tulis ulang rotasi kunci atau v1 tidak pernah menimpa hasil penyegaran yang
        # tersimpan sesudah baris dibaca, dan tidak menyentuh sewa penyegaran (segar_sampai).
        hasil = await self._jalankan("execute", "UPDATE sapa_sesi SET token_enc = $3 WHERE id_hash = $1 AND token_enc = $2",
                                     id_hash, token_lama, token_baru)
        return str(hasil).endswith(" 1")

    async def simpan_hasil_segar(self, id_hash, token_enc, token_exp, sampai, token_lama):
        # S1: hanya pemegang sewa ini, atau bila baris masih berisi token sebelum penyegaran (sewa sudah diambil
        # alih tetapi penyegar lain belum menyimpan apa pun). Selain itu pemanggil membaca ulang baris.
        hasil = await self._jalankan(
            "execute",
            "UPDATE sapa_sesi SET token_enc = $2, token_exp = $3, segar_sampai = NULL "
            "WHERE id_hash = $1 AND (segar_sampai = $4 OR token_enc = $5)",
            id_hash, token_enc, token_exp, sampai, token_lama)
        return str(hasil).endswith(" 1")

    async def klaim_segar(self, id_hash, token_enc, sampai, sekarang):
        # UPDATE bersyarat: hanya satu permintaan yang mendapat "UPDATE 1" untuk token_enc yang sama.
        # Tanpa transaksi terbuka selama Auth0 dipanggil (aman untuk koneksi serverless).
        hasil = await self._jalankan(
            "execute",
            "UPDATE sapa_sesi SET segar_sampai = $3 "
            "WHERE id_hash = $1 AND token_enc = $2 AND (segar_sampai IS NULL OR segar_sampai < $4)",
            id_hash, token_enc, sampai, sekarang)
        return str(hasil).endswith(" 1")

    async def lepas_segar(self, id_hash, sampai):
        await self._jalankan("execute", "UPDATE sapa_sesi SET segar_sampai = NULL WHERE id_hash = $1 AND segar_sampai = $2",
                             id_hash, sampai)

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
            "fetchval", "SELECT jumlah FROM sapa_batas WHERE kunci_hash = $1 AND jendela = $2", kunci_hash, jendela) or 0)

    # Hitungan gagal (B1) memakai baris sapa_batas dengan jendela -1; baris yang sudah kedaluwarsa mulai lagi
    # dari 1 dan ikut dibersihkan bersihkan_batas. N1: setiap kegagalan memperpanjang kedaluwarsa ke yang
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
            kunci_hash, sekarang))

    async def padamkan_penanda(self, kunci_hash):
        await self._jalankan("execute", "DELETE FROM sapa_batas WHERE kunci_hash = $1 AND jendela = -1", kunci_hash)

    async def bersihkan_batas(self, sekarang):
        # Dibatasi BATAS_BERSIH baris per panggilan supaya tidak pernah menjadi kueri panjang.
        await self._jalankan(
            "execute",
            "DELETE FROM sapa_batas WHERE ctid IN "
            f"(SELECT ctid FROM sapa_batas WHERE kedaluwarsa < $1 LIMIT {int(BATAS_BERSIH)})", sekarang)

    async def hitung_baris_batas(self, batas):
        # N1: dibatasi LIMIT, jadi murah walau tabel membengkak; cukup untuk tahu ambang sudah lewat.
        return int(await self._jalankan(
            "fetchval", "SELECT count(*) FROM (SELECT 1 FROM sapa_batas LIMIT $1) AS t", int(batas)))

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
    isi, tulis_ulang = _dekripsi(baris["token_enc"], id_hash)
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
    if tulis_ulang:
        baru = _enkripsi(isi, id_hash)
        if await _aman(s.tulis_ulang_token(id_hash, token_enc, baru)):
            token_enc = baru
        else:
            # S1: baris sudah diubah permintaan lain sejak dibaca (misalnya hasil penyegaran tersimpan).
            # Isinya lebih baru, jadi dipakai apa adanya; tidak ada yang ditimpa.
            baris = await _aman(s.ambil(id_hash))
            if not baris:
                return None
            isi, _ = _dekripsi(baris["token_enc"], id_hash)
            if isi is None or not isinstance(isi.get("at"), str):
                logger.error("Sesi tidak dapat dibuka dengan kunci yang ada (%s)", KUNCI_ENV)
                raise SesiBelumSiap()
            token_enc = baris["token_enc"]
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


def _sesi_dari_baris(sesi: Sesi, baris: dict) -> Optional[Sesi]:
    """Sesi dengan token dari baris terbaru, atau None bila isinya tidak terbuka."""
    isi, _ = _dekripsi(baris["token_enc"], sesi.id_hash)
    if isi is None or not isinstance(isi.get("at"), str):
        return None
    sesi.access_token, sesi.refresh_token = isi["at"], isi.get("rt")
    sesi.token_exp, sesi.token_enc = baris["token_exp"], baris["token_enc"]
    sesi.diperoleh = _waktu_epoch(isi.get("t")) or sesi.diperoleh
    return sesi


async def _baca_ulang(sesi: Sesi) -> Optional[Sesi]:
    """Sesi dengan token yang sudah disegarkan permintaan lain (baris berubah sejak dibaca), atau None."""
    baris = await _aman(_store_wajib().ambil(sesi.id_hash))
    if not baris or baris["token_enc"] == sesi.token_enc:
        return None
    return _sesi_dari_baris(sesi, baris)


async def _tunggu(detik: float) -> None:
    await asyncio.sleep(detik)


def _monoton() -> float:
    return time.monotonic()


_HABIS = object()  # penanda: baris sesi sudah dihapus permintaan lain
_TANPA_TOKEN_BARU = object()  # penanda: penyegar tidak memperoleh token baru (Auth0 pasti tidak memprosesnya)
_HASIL_TIDAK_DIKETAHUI = object()  # penanda N3: Auth0 mungkin sudah memproses refresh token


async def _tunggu_penyegar(sesi: Sesi):
    """Tunggu permintaan lain yang sedang menyegarkan baris ini (single-flight).

    Kembalikan Sesi bertoken baru yang masih berlaku, _HABIS bila baris dihapus (refresh ditolak), atau
    None bila waktu tunggu habis atau penyegar melepas kunci tanpa token baru.
    """
    s = _store_wajib()
    sisa, jeda = MAKS_TUNGGU_SEGAR, JEDA_TUNGGU_SEGAR
    # K3: tenggat waktu dinding, bukan hanya jumlah jeda tidur, supaya pembacaan DB yang lambat ikut dihitung.
    batas_akhir = _monoton() + MAKS_TUNGGU_SEGAR
    # Satu koneksi untuk seluruh penantian, dengan jeda yang bertambah, supaya tidak membuka koneksi
    # Postgres baru setiap 100 ms.
    async with satu_koneksi(batas_akhir):
        while sisa > 1e-9:
            langkah = min(jeda, sisa, batas_akhir - _monoton())
            if langkah <= 0:
                break
            await _tunggu(langkah)
            sisa -= langkah
            jeda = min(jeda * 2, JEDA_TUNGGU_SEGAR_MAKS)
            tersisa = batas_akhir - _monoton()
            if tersisa <= 0:
                break
            try:
                baris = await asyncio.wait_for(_aman(s.ambil(sesi.id_hash)), tersisa)
            except asyncio.TimeoutError:
                logger.warning("Menunggu penyegar lain melewati %s detik saat membaca sesi", MAKS_TUNGGU_SEGAR)
                break
            if not baris:
                return _HABIS
            if baris["token_enc"] != sesi.token_enc and baris["token_exp"] > _sekarang():
                return _sesi_dari_baris(sesi, baris)
            if baris.get("segar_sampai") is None and baris["token_enc"] == sesi.token_enc:
                return None  # penyegar gagal dan sudah melepas kunci
    return None


async def segarkan_bila_perlu(sesi: Sesi, ip: Optional[str] = None, ip_wajib: bool = False) -> Optional[Sesi]:
    """Segarkan access token lewat refresh token bila sisa umurnya < 60 detik atau sudah 15 menit.

    `ip` adalah IP klien tepercaya (BF-1) untuk header auth0-forwarded-for. `ip_wajib` (di Vercel): tanpa
    IP tidak ada penyegaran (BF-2). None bila Auth0 menolak refresh token (sesi dihapus). SesiBelumSiap bila
    token sudah habis dan token baru tidak bisa diperoleh (Auth0 tidak terjangkau, kuota global penuh,
    IP tidak ada, atau penyegar lain belum selesai).
    """
    sekarang = _sekarang()
    hampir_habis = (sesi.token_exp - sekarang).total_seconds() <= SISA_SEGAR_DETIK
    sudah_lama = sesi.diperoleh is not None and sekarang - sesi.diperoleh >= SEGAR_BERKALA
    if not hampir_habis and not sudah_lama:
        return sesi
    masih_berlaku = sesi.token_exp > sekarang

    def tanpa_token_baru() -> Sesi:
        if masih_berlaku:
            return sesi
        raise SesiBelumSiap()

    cfg = konfigurasi_auth0()
    if not sesi.refresh_token or cfg is None:
        if masih_berlaku:
            return sesi
        if cfg is None:
            logger.error("Client login Auth0 belum dikonfigurasi; sesi tidak dapat disegarkan")
            raise SesiBelumSiap()
        await _aman(_store_wajib().hapus(sesi.id_hash))
        return None
    if ip_wajib and not ip:
        logger.error("Penyegaran token dilewati: IP klien tepercaya tidak tersedia (periksa header Vercel)")
        return tanpa_token_baru()
    s = _store_wajib()
    sampai = sekarang + UMUR_KUNCI_SEGAR
    mulai = _monoton()
    if not await _aman(s.klaim_segar(sesi.id_hash, sesi.token_enc, sampai, sekarang)):
        # Permintaan lain sedang (atau baru saja) menyegarkan baris ini.
        if masih_berlaku:
            return sesi
        terbaru = await _tunggu_penyegar(sesi)
        if terbaru is _HABIS:
            return None
        if terbaru is not None:
            return terbaru
        logger.warning("Penyegaran token oleh permintaan lain belum selesai; permintaan ini 503")
        raise SesiBelumSiap()
    keadaan = {"auth0_dipanggil": False}
    try:
        hasil = await _segarkan_sebagai_pemegang_kunci(sesi, cfg, ip, sekarang, sampai, mulai, keadaan)
    except BaseException:
        # N3: sesudah Auth0 dipanggil hasilnya tidak diketahui, jadi sewa dibiarkan habis sendiri.
        if keadaan["auth0_dipanggil"]:
            logger.warning("Sewa penyegaran dibiarkan sampai kedaluwarsa: galat sesudah Auth0 dipanggil")
        else:
            await _lepas_kunci(s, sesi.id_hash, sampai)
        raise
    if hasil is _HASIL_TIDAK_DIKETAHUI:
        return tanpa_token_baru()
    if hasil is _TANPA_TOKEN_BARU:
        await _lepas_kunci(s, sesi.id_hash, sampai)
        return tanpa_token_baru()
    return hasil


async def _lepas_kunci(s: SesiStore, id_hash: str, sampai: datetime) -> None:
    """Lepas sewa penyegaran milik permintaan ini saja; kegagalan hanya dicatat (sewa habis sendiri)."""
    try:
        await s.lepas_segar(id_hash, sampai)
    except Exception as exc:
        logger.warning("Kunci penyegaran tidak dapat dilepas: %s", type(exc).__name__)


async def _segarkan_sebagai_pemegang_kunci(sesi: Sesi, cfg: dict, ip: Optional[str], sekarang: datetime,
                                           sampai: datetime, mulai: float, keadaan: dict):
    """Panggil Auth0 sebagai satu-satunya penyegar baris ini (sewa `sampai`, diklaim pada monoton `mulai`).

    Kembalikan Sesi bertoken baru (kunci dilepas oleh simpan_hasil_segar), None bila sesi diakhiri,
    _TANPA_TOKEN_BARU bila token baru pasti tidak diperoleh (sewa dilepas), atau _HASIL_TIDAK_DIKETAHUI bila
    Auth0 mungkin sudah memproses refresh token (sewa tidak dilepas, N3). `keadaan["auth0_dipanggil"]`
    diset tepat sebelum Auth0 dipanggil.
    """
    s = _store_wajib()
    if not await batas(KUNCI_GLOBAL_SEGAR, *BATAS_GLOBAL_SEGAR):
        logger.warning("Penyegaran token ditunda: kuota global penyegaran /oauth/token penuh")
        return _TANPA_TOKEN_BARU
    if _monoton() - mulai > BATAS_SEBELUM_AUTH0:
        # S1: sisa sewa tidak cukup untuk Auth0 dan simpanan terburuk; penyegar lain bisa mengambil alih
        # dan memakai refresh token yang sama. Lebih baik tidak memanggil Auth0 sama sekali.
        logger.warning("Penyegaran token dibatalkan: sisa sewa tidak cukup sebelum Auth0")
        return _TANPA_TOKEN_BARU
    keadaan["auth0_dipanggil"] = True
    status, body = await _auth0_post("/oauth/token", {
        "grant_type": "refresh_token", "client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
        "refresh_token": sesi.refresh_token,
    }, {"auth0-forwarded-for": ip} if ip else None)
    if status == 200 and body and isinstance(body.get("access_token"), str):
        rt = body.get("refresh_token") or sesi.refresh_token
        token_exp = sekarang + _umur_token(body)
        isi = {"at": body["access_token"], "rt": rt, "nama": sesi.nama, "t": int(sekarang.timestamp())}
        token_enc = _enkripsi(isi, sesi.id_hash)
        if await _aman(s.simpan_hasil_segar(sesi.id_hash, token_enc, token_exp, sampai, sesi.token_enc)):
            sesi.access_token, sesi.refresh_token = body["access_token"], rt
            sesi.token_exp, sesi.diperoleh, sesi.token_enc = token_exp, sekarang, token_enc
            return sesi
        # S1: sewa sudah diambil alih dan penyegar lain sudah menyimpan token yang lebih baru: pakai itu.
        logger.warning("Hasil penyegaran tidak disimpan: baris sudah berisi token dari penyegar lain")
        baris = await _aman(s.ambil(sesi.id_hash))
        if not baris:
            return None
        terbaru = _sesi_dari_baris(sesi, baris)
        return terbaru if terbaru is not None else _TANPA_TOKEN_BARU
    galat = (body or {}).get("error")
    if status in (400, 401, 403) and galat in _GALAT_REFRESH_DITOLAK:
        # Penyegar lain (mis. setelah sewa kunci basi) bisa sudah merotasi refresh token lebih dulu.
        terbaru = await _baca_ulang(sesi)
        if terbaru is not None:
            return terbaru
        logger.info("Refresh token ditolak Auth0 (%s); sesi diakhiri", galat)
        await _aman(s.hapus(sesi.id_hash))
        return None
    if status in _STATUS_PASTI_TIDAK_DIPROSES:
        logger.warning("Penyegaran token Auth0 gagal: status %s", status)
        return _TANPA_TOKEN_BARU
    if status == STATUS_TIDAK_TERKIRIM:
        # K6: koneksi ke Auth0 tidak pernah terbentuk, refresh token pasti belum terkirim. Sewa dilepas.
        logger.warning("Penyegaran token Auth0 gagal: koneksi tidak terbentuk; sewa dilepas")
        return _TANPA_TOKEN_BARU
    # K1: selain jawaban yang pasti tidak diproses, Auth0 mungkin sudah merotasi refresh token (mis. 200 tanpa
    # access_token, body bukan JSON, 500, 52x, timeout). Sewa dibiarkan sampai kedaluwarsa.
    logger.warning("Hasil penyegaran token Auth0 tidak diketahui (status %s); sewa dibiarkan sampai kedaluwarsa",
                   status)
    return _HASIL_TIDAK_DIKETAHUI


async def ambil_sesi_segar(cookie, adalah_admin: Optional[Callable[[str], bool]] = None,
                           ip: Optional[str] = None, ip_wajib: bool = False) -> Optional[Sesi]:
    sesi = await ambil_sesi(cookie, adalah_admin)
    return await segarkan_bila_perlu(sesi, ip, ip_wajib) if sesi else None


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


def _acak() -> float:
    return random.random()


async def _bersihkan_kadang(s: SesiStore) -> None:
    """Sesekali hapus baris sapa_batas kedaluwarsa, supaya banjir tanpa login sukses tidak menumbuhkan tabel.

    Sesudahnya ukuran tabel diperiksa (N1); di atas AMBANG_PERINGATAN_BARIS_BATAS hanya dicatat di log.
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


# --- hitungan gagal per (username + IP), B1 dan N1 ------------------------------------------------

async def tambah_gagal_kumulatif(kunci: str, umur_pendek: timedelta, umur_lengket: timedelta, ambang: int) -> int:
    """Tambah satu kegagalan pada hitungan `kunci`; kembalikan jumlahnya termasuk kegagalan ini.

    Hitungan berumur `umur_pendek` sejak gagal terakhir (mulai lagi dari 1 bila sudah lewat). Begitu jumlahnya
    mencapai `ambang`, baris naik menjadi penanda lengket berumur `umur_lengket` sejak gagal terakhir (N1).
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
