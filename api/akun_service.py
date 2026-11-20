"""Akun login lokal SAPA (flag SAPA_LOGIN_BFF=1), tanpa Auth0.

Penyimpanan akun: tabel akun_sapa di Cloudflare D1 yang hanya bisa dijangkau lewat Worker sapa-akun
(workers/sapa-akun/). Server SAPA memanggil Worker lewat WorkerAkunStore; tidak ada token API Cloudflare di Vercel.
Operasi Worker tetap (tanpa SQL bebas): akun/ambil-username, akun/ambil-id, akun/jumlah, akun/sisip-pertama,
akun/ganti-hash, kode/terpakai. Tes dan pengembangan lokal memakai MemoryAkunStore dengan perilaku yang sama.

Sandi
- Hash argon2id format PHC (ARGON2_MEMORI KiB, ARGON2_WAKTU, ARGON2_PARALEL) atas HMAC-SHA256(pepper, NFC(sandi)).
  Pepper dari env SAPA_AKUN_PEPPER (base64, minimal 32 byte), tidak pernah disimpan di D1.
- Username yang tidak ada atau baris yang tidak utuh tetap menjalankan satu verifikasi argon2 atas hash tiruan
  berparameter sama (cocokkan_palsu), supaya waktu jawab seragam.
- Sandi baru: SANDI_MIN..SANDI_MAKS karakter (NFC), tanpa karakter kontrol, tidak sama dengan username, kode,
  atau sandi lama, dan lolos HIBP k-anonymity (cek_bocor: hanya 5 karakter awal SHA-1 dikirim, header
  Add-Padding, tenggat total TENGGAT_HIBP). HIBP tidak terjangkau berarti HibpTidakTersedia (gagal tertutup).

Integritas baris
- Kolom mac = HMAC-SHA256(SAPA_AKUN_KUNCI_MAC, kanonik) dengan kanonik = JSON berkunci terurut tanpa spasi atas
  {aktif, hash, id, peran, username, v: "akun-mac-v1", versi_sandi} (kanonik_mac). Kunci MAC terpisah dari pepper
  dan tidak pernah dipegang Worker. MAC diperiksa setiap login dan setiap revalidasi sesi (periksa_akun).
- Jangkar anti-rollback di DB sesi Neon (sesi_service.baca_jangkar/naikkan_jangkar): baris dengan versi_sandi di
  bawah versi_sandi_min ditolak.
- Pepper atau kunci MAC kosong/tidak sah: AkunBelumSiap (503 belum_siap).

Kode penyiapan dan pemulihan
- Nilai dari env SAPA_KODE_PENYIAPAN / SAPA_KODE_PEMULIHAN (minimal KODE_MIN karakter; lebih pendek dianggap
  tidak ada). Kode masukan dibandingkan dengan semua kode env aktif lewat hmac.compare_digest (cocok_kode).
- Kode terpakai disimpan sebagai hash_kode = HMAC-SHA256(HKDF(kunci MAC, "sapa-kode-v1"), kode) di tabel
  kode_terpakai D1, sehingga kode yang sama ditolak walau env belum dihapus.

Tanda tangan permintaan ke Worker (sama dengan workers/sapa-akun/src/index.js dan test/vektor-tanda.json)
- kanonik = "sapa-akun-v1\\nMETODE\\nPATH\\nWAKTU\\nNONCE\\nhex(SHA-256(body))"; tanda = hex(HMAC-SHA256(kunci,
  kanonik)); kunci = base64-decode(env SAPA_AKUN_HMAC). Header X-Sapa-Waktu (detik Unix), X-Sapa-Nonce (32 hex,
  hanya operasi tulis), X-Sapa-Tanda.
- Tenggat total satu panggilan TENGGAT_WORKER (asyncio.wait_for). Galat jaringan, tenggat habis, 401, 5xx, atau
  jawaban yang tidak berbentuk menjadi AkunBelumSiap (gagal tertutup, tanpa jalan pintas). 409 pada operasi tulis
  (kode sudah terpakai) berarti operasi tidak dijalankan.

Env: SAPA_AKUN_WORKER_URL (https), SAPA_AKUN_HMAC, SAPA_AKUN_PEPPER, SAPA_AKUN_KUNCI_MAC, SAPA_KODE_PENYIAPAN,
SAPA_KODE_PEMULIHAN. Nilai sandi, hash, kode, dan kunci tidak pernah dicatat di log.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import functools
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
import unicodedata
import uuid
from dataclasses import dataclass, replace
from typing import Optional, Protocol

import httpx
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

logger = logging.getLogger("sapa-api")

PEPPER_ENV = "SAPA_AKUN_PEPPER"
KUNCI_MAC_ENV = "SAPA_AKUN_KUNCI_MAC"
HMAC_ENV = "SAPA_AKUN_HMAC"
WORKER_URL_ENV = "SAPA_AKUN_WORKER_URL"
KODE_PENYIAPAN_ENV = "SAPA_KODE_PENYIAPAN"
KODE_PEMULIHAN_ENV = "SAPA_KODE_PEMULIHAN"

ARGON2_MEMORI = 19456  # KiB
ARGON2_WAKTU = 2
ARGON2_PARALEL = 1
ARGON2_PANJANG_HASH = 32
ARGON2_PANJANG_GARAM = 16
SANDI_MIN = 15
SANDI_MAKS = 128
KODE_MIN = 32
TENGGAT_WORKER = 3.0  # detik, total satu panggilan Worker
TENGGAT_HIBP = 3.0  # detik, total satu panggilan HIBP
HIBP_URL = "https://api.pwnedpasswords.com/range/"
PERAN_SAH = ("super_admin", "admin", "viewer", "petugas_rs")
PERAN_SUPER_ADMIN = "super_admin"
AWALAN_TANDA = "sapa-akun-v1"
VERSI_MAC = "akun-mac-v1"
HEADER_WAKTU = "X-Sapa-Waktu"
HEADER_NONCE = "X-Sapa-Nonce"
HEADER_TANDA = "X-Sapa-Tanda"
PESAN_HIBP_TIDAK_TERSEDIA = "Pemeriksaan keamanan sandi sedang tidak tersedia. Coba lagi beberapa saat lagi."
_POLA_USERNAME = re.compile(r"[a-z0-9][a-z0-9._%+@-]{2,253}")
_POLA_HEX64 = re.compile(r"[0-9a-f]{64}")


class AkunBelumSiap(Exception):
    """Kunci, penyimpanan akun, atau Worker belum siap; pemanggil menjawab 503 belum_siap."""


class HibpTidakTersedia(Exception):
    """Pemeriksaan HIBP tidak bisa diselesaikan; sandi baru ditolak (gagal tertutup)."""


@dataclass(frozen=True)
class Akun:
    id: str
    username: str
    hash: str
    peran: str
    versi_sandi: int
    aktif: int
    mac: str


def _env(nama: str) -> str:
    return os.environ.get(nama, "").strip()


def _kunci(nama: str) -> Optional[bytes]:
    nilai = _env(nama)
    if not nilai:
        return None
    try:
        kunci = base64.b64decode(nilai, validate=True)
    except (binascii.Error, ValueError):
        return None
    return kunci if len(kunci) >= 32 else None


def kunci_siap() -> bool:
    """Pepper dan kunci MAC terisi dan sah."""
    return _kunci(PEPPER_ENV) is not None and _kunci(KUNCI_MAC_ENV) is not None


def konfigurasi_siap() -> bool:
    return kunci_siap() and store() is not None


def _kunci_wajib(nama: str) -> bytes:
    kunci = _kunci(nama)
    if kunci is None:
        logger.error("Kunci akun belum dikonfigurasi atau tidak sah (%s)", nama)
        raise AkunBelumSiap()
    return kunci


def normal_username(username: str) -> str:
    """NFKC, trim, huruf kecil; sama dengan kunci pembatas login."""
    return unicodedata.normalize("NFKC", username).strip().casefold()


def username_sah(normal: str) -> bool:
    return bool(_POLA_USERNAME.fullmatch(normal))


# --- hash sandi --------------------------------------------------------------------------------

def _pengolah() -> PasswordHasher:
    return _pengolah_untuk(ARGON2_WAKTU, ARGON2_MEMORI, ARGON2_PARALEL)


@functools.lru_cache(maxsize=4)
def _pengolah_untuk(waktu: int, memori: int, paralel: int) -> PasswordHasher:
    return PasswordHasher(time_cost=waktu, memory_cost=memori, parallelism=paralel, hash_len=ARGON2_PANJANG_HASH,
                          salt_len=ARGON2_PANJANG_GARAM, type=Type.ID)


def _masukan(sandi: str) -> bytes:
    """Masukan argon2: HMAC-SHA256(pepper, NFC(sandi))."""
    pepper = _kunci_wajib(PEPPER_ENV)
    return hmac.new(pepper, unicodedata.normalize("NFC", sandi).encode("utf-8"), hashlib.sha256).digest()


def hash_sandi(sandi: str) -> str:
    return _pengolah().hash(_masukan(sandi))


def _verifikasi(hash_phc: str, data: bytes) -> bool:
    try:
        return _pengolah().verify(hash_phc, data)
    except (VerifyMismatchError, VerificationError, InvalidHashError, ValueError, TypeError):
        return False


def cocokkan_sandi(hash_phc: str, sandi: str) -> bool:
    return _verifikasi(hash_phc, _masukan(sandi))


_hash_palsu: dict = {}


def _hash_palsu_sekarang() -> str:
    kunci = (ARGON2_WAKTU, ARGON2_MEMORI, ARGON2_PARALEL)
    if kunci not in _hash_palsu:
        _hash_palsu[kunci] = _pengolah().hash(secrets.token_bytes(32))
    return _hash_palsu[kunci]


def cocokkan_palsu(sandi: str) -> bool:
    """Satu verifikasi argon2 atas hash tiruan berparameter sama; selalu False."""
    _verifikasi(_hash_palsu_sekarang(), _masukan(sandi))
    return False


# --- MAC baris ---------------------------------------------------------------------------------

def kanonik_mac(id: str, username: str, hash: str, peran: str, versi_sandi: int, aktif: int) -> bytes:
    isi = {"aktif": aktif, "hash": hash, "id": id, "peran": peran, "username": username, "v": VERSI_MAC,
           "versi_sandi": versi_sandi}
    return json.dumps(isi, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def hitung_mac(id: str, username: str, hash: str, peran: str, versi_sandi: int, aktif: int) -> str:
    kunci = _kunci_wajib(KUNCI_MAC_ENV)
    return hmac.new(kunci, kanonik_mac(id, username, hash, peran, versi_sandi, aktif), hashlib.sha256).hexdigest()


def mac_sah(akun: Akun) -> bool:
    if not (isinstance(akun.id, str) and isinstance(akun.username, str) and isinstance(akun.hash, str)
            and isinstance(akun.peran, str) and type(akun.versi_sandi) is int and type(akun.aktif) is int
            and isinstance(akun.mac, str)):
        return False
    harap = hitung_mac(akun.id, akun.username, akun.hash, akun.peran, akun.versi_sandi, akun.aktif)
    return hmac.compare_digest(harap, akun.mac)


def periksa_akun(akun: Akun, versi_min: int) -> Optional[str]:
    """None bila baris boleh dipakai; selain itu alasan: integritas_gagal, rollback_terdeteksi, nonaktif."""
    if not mac_sah(akun) or akun.peran not in PERAN_SAH or akun.aktif not in (0, 1):
        return "integritas_gagal"
    if akun.versi_sandi < versi_min:
        return "rollback_terdeteksi"
    if akun.aktif != 1:
        return "nonaktif"
    return None


def dengan_mac(akun: Akun, **ubah) -> Akun:
    """Salinan akun dengan perubahan kolom dan MAC yang dihitung ulang."""
    baru = replace(akun, **ubah)
    return replace(baru, mac=hitung_mac(baru.id, baru.username, baru.hash, baru.peran, baru.versi_sandi, baru.aktif))


def akun_baru(username_normal: str, sandi: str, peran: str = PERAN_SUPER_ADMIN) -> Akun:
    """Akun baru (id acak, versi_sandi 1, aktif) dengan hash dan MAC; belum disimpan."""
    akun = Akun(id=str(uuid.uuid4()), username=username_normal, hash=hash_sandi(sandi), peran=peran, versi_sandi=1,
                aktif=1, mac="")
    return dengan_mac(akun)


def baris_dari(akun: Akun) -> dict:
    return {"id": akun.id, "username": akun.username, "hash": akun.hash, "versi_sandi": akun.versi_sandi,
            "peran": akun.peran, "aktif": akun.aktif, "mac": akun.mac}


def akun_dari(baris: dict) -> Akun:
    """Akun dari baris penyimpanan. Bentuk yang rusak tetap menjadi Akun, tetapi MAC-nya tidak akan sah."""
    def ambil(nama, tipe, bawaan):
        nilai = baris.get(nama)
        return nilai if type(nilai) is tipe else bawaan
    return Akun(id=ambil("id", str, ""), username=ambil("username", str, ""), hash=ambil("hash", str, ""),
                peran=ambil("peran", str, ""), versi_sandi=ambil("versi_sandi", int, -1), aktif=ambil("aktif", int, -1),
                mac=ambil("mac", str, ""))


# --- kode penyiapan dan pemulihan --------------------------------------------------------------

_sama = hmac.compare_digest


def kode_env() -> dict:
    """{jenis: kode} untuk env kode yang terisi dan cukup panjang."""
    hasil = {}
    for jenis, nama in (("penyiapan", KODE_PENYIAPAN_ENV), ("pemulihan", KODE_PEMULIHAN_ENV)):
        nilai = _env(nama)
        if nilai and len(nilai) >= KODE_MIN:
            hasil[jenis] = nilai
        elif nilai:
            logger.error("%s terlalu pendek; dianggap tidak ada", nama)
    return hasil


def cocok_kode(kode: str, aktif: dict) -> Optional[str]:
    """Jenis kode env yang sama dengan `kode`, atau None. Selalu membandingkan dengan semua kode aktif."""
    masukan = kode.encode("utf-8")
    cocok = None
    for jenis in ("penyiapan", "pemulihan"):
        if jenis in aktif and _sama(masukan, aktif[jenis].encode("utf-8")) and cocok is None:
            cocok = jenis
    return cocok


@functools.lru_cache(maxsize=4)
def _kunci_kode(kunci_mac: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"sapa-kode-v1").derive(kunci_mac)


def hash_kode(kode: str) -> str:
    return hmac.new(_kunci_kode(_kunci_wajib(KUNCI_MAC_ENV)), kode.encode("utf-8"), hashlib.sha256).hexdigest()


# --- kebijakan sandi baru dan HIBP --------------------------------------------------------------

def kebijakan_sandi(sandi: str, larangan=()) -> Optional[str]:
    """None bila memenuhi kebijakan; "sandi_lemah" bila terlalu pendek/panjang, berkarakter kontrol, atau sama
    dengan salah satu nilai `larangan` (username, kode)."""
    nfc = unicodedata.normalize("NFC", sandi)
    if not SANDI_MIN <= len(nfc) <= SANDI_MAKS or any(unicodedata.category(c) == "Cc" for c in nfc):
        return "sandi_lemah"
    rendah = nfc.casefold()
    if any(nilai and rendah == unicodedata.normalize("NFC", nilai).strip().casefold() for nilai in larangan):
        return "sandi_lemah"
    return None


def sama_sandi(a: str, b: str) -> bool:
    return _sama(unicodedata.normalize("NFC", a).encode("utf-8"), unicodedata.normalize("NFC", b).encode("utf-8"))


def _klien_hibp(transport=None) -> httpx.AsyncClient:
    tahap = httpx.Timeout(connect=1.5, read=2.5, write=2.5, pool=0.5)
    return httpx.AsyncClient(timeout=tahap, follow_redirects=False, transport=transport)


async def cek_bocor(sandi: str) -> bool:
    """True bila sandi ada di HIBP Pwned Passwords. HibpTidakTersedia bila tidak bisa dipastikan."""
    sha1 = hashlib.sha1(unicodedata.normalize("NFC", sandi).encode("utf-8")).hexdigest().upper()
    awalan, akhiran = sha1[:5], sha1[5:]

    async def ambil():
        async with _klien_hibp() as klien:
            return await klien.get(HIBP_URL + awalan, headers={"Add-Padding": "true"})
    try:
        res = await asyncio.wait_for(ambil(), TENGGAT_HIBP)
    except (httpx.HTTPError, httpx.InvalidURL, asyncio.TimeoutError) as exc:
        logger.warning("HIBP tidak terjangkau: %s", type(exc).__name__)
        raise HibpTidakTersedia() from None
    if res.status_code != 200:
        logger.warning("HIBP menjawab status %s", res.status_code)
        raise HibpTidakTersedia()
    for baris in res.text.splitlines():
        nilai, _, jumlah = baris.strip().partition(":")
        if nilai.upper() == akhiran:
            try:
                return int(jumlah or "0") > 0  # baris padding berjumlah 0
            except ValueError:
                raise HibpTidakTersedia() from None
    return False


# --- tanda tangan permintaan ke Worker ------------------------------------------------------------

def kanonik_tanda(metode: str, path: str, waktu: str, nonce: str, body: bytes) -> str:
    return "\n".join([AWALAN_TANDA, metode, path, waktu, nonce, hashlib.sha256(body).hexdigest()])


def tanda_tangan(kunci: bytes, metode: str, path: str, waktu: str, nonce: str, body: bytes) -> str:
    return hmac.new(kunci, kanonik_tanda(metode, path, waktu, nonce, body).encode("utf-8"), hashlib.sha256).hexdigest()


# --- penyimpanan --------------------------------------------------------------------------------

class AkunStore(Protocol):
    """Operasi tetap penyimpanan akun (sama dengan operasi Worker sapa-akun). Baris berbentuk baris_dari()."""

    async def ambil_username(self, username: str) -> Optional[dict]: ...
    async def ambil_id(self, akun_id: str) -> Optional[dict]: ...
    async def jumlah(self) -> int: ...
    async def sisip_pertama(self, baris: dict, hash_kode: str) -> bool: ...
    async def ganti_hash(self, akun_id: str, versi_lama: int, hash: str, versi_baru: int, mac: str,
                         hash_kode: Optional[str], jenis: Optional[str]) -> bool: ...
    async def kode_terpakai(self, hash_kode: str) -> bool: ...


class MemoryAkunStore:
    """Penyimpanan akun di memori untuk tes dan pengembangan lokal; semantik sama dengan Worker (atomik per
    operasi karena tidak ada await di antara pemeriksaan dan penulisan)."""

    def __init__(self):
        self.akun: dict[str, dict] = {}
        self.kode: dict[str, str] = {}

    async def ambil_username(self, username):
        for baris in self.akun.values():
            if baris.get("username") == username:
                return dict(baris)
        return None

    async def ambil_id(self, akun_id):
        baris = self.akun.get(akun_id)
        return dict(baris) if baris else None

    async def jumlah(self):
        return len(self.akun)

    async def sisip_pertama(self, baris, hash_kode):
        if self.akun or hash_kode in self.kode:
            return False
        self.kode[hash_kode] = "penyiapan"
        self.akun[baris["id"]] = dict(baris)
        return True

    async def ganti_hash(self, akun_id, versi_lama, hash, versi_baru, mac, hash_kode, jenis):
        baris = self.akun.get(akun_id)
        if baris is None or baris.get("versi_sandi") != versi_lama or versi_baru != versi_lama + 1:
            return False
        if hash_kode is not None:
            if hash_kode in self.kode:
                return False
            self.kode[hash_kode] = jenis
        baris.update(hash=hash, versi_sandi=versi_baru, mac=mac)
        return True

    async def kode_terpakai(self, hash_kode):
        return hash_kode in self.kode


def _klien_worker(transport=None) -> httpx.AsyncClient:
    tahap = httpx.Timeout(connect=1.0, read=2.0, write=2.0, pool=0.5)
    return httpx.AsyncClient(timeout=tahap, follow_redirects=False, transport=transport)


def _waktu_unix() -> int:
    return int(time.time())


class WorkerAkunStore:
    """Klien Worker sapa-akun: setiap permintaan ditandatangani HMAC; tenggat total TENGGAT_WORKER."""

    def __init__(self, url: str, kunci: bytes):
        self.url = url.rstrip("/")
        self._kunci = kunci

    async def _panggil(self, path: str, isi: dict, tulis: bool) -> dict:
        body = json.dumps(isi, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
        waktu = str(_waktu_unix())
        nonce = secrets.token_hex(16) if tulis else ""
        header = {"Content-Type": "application/json", HEADER_WAKTU: waktu,
                  HEADER_TANDA: tanda_tangan(self._kunci, "POST", path, waktu, nonce, body)}
        if tulis:
            header[HEADER_NONCE] = nonce

        async def kirim():
            async with _klien_worker() as klien:
                return await klien.post(self.url + path, content=body, headers=header)
        try:
            res = await asyncio.wait_for(kirim(), TENGGAT_WORKER)
        except (httpx.HTTPError, httpx.InvalidURL, asyncio.TimeoutError) as exc:
            logger.error("Worker akun tidak terjangkau (%s): %s", path, type(exc).__name__)
            raise AkunBelumSiap() from None
        if tulis and res.status_code == 409:
            return {"ok": False}
        if res.status_code != 200:
            logger.error("Worker akun menjawab status %s (%s)", res.status_code, path)
            raise AkunBelumSiap()
        try:
            data = res.json()
        except ValueError:
            data = None
        if not isinstance(data, dict):
            logger.error("Jawaban Worker akun tidak berbentuk objek (%s)", path)
            raise AkunBelumSiap()
        return data

    @staticmethod
    def _baris(data: dict) -> Optional[dict]:
        baris = data.get("akun")
        if baris is None:
            return None
        if not isinstance(baris, dict):
            raise AkunBelumSiap()
        return baris

    @staticmethod
    def _bool(data: dict, nama: str) -> bool:
        nilai = data.get(nama)
        if not isinstance(nilai, bool):
            raise AkunBelumSiap()
        return nilai

    async def ambil_username(self, username):
        return self._baris(await self._panggil("/akun/ambil-username", {"username": username}, False))

    async def ambil_id(self, akun_id):
        return self._baris(await self._panggil("/akun/ambil-id", {"id": akun_id}, False))

    async def jumlah(self):
        nilai = (await self._panggil("/akun/jumlah", {}, False)).get("jumlah")
        if type(nilai) is not int or nilai < 0:
            raise AkunBelumSiap()
        return nilai

    async def sisip_pertama(self, baris, hash_kode):
        return self._bool(await self._panggil("/akun/sisip-pertama", {"akun": baris, "hash_kode": hash_kode}, True), "ok")

    async def ganti_hash(self, akun_id, versi_lama, hash, versi_baru, mac, hash_kode, jenis):
        isi = {"id": akun_id, "versi_lama": versi_lama, "versi_baru": versi_baru, "hash": hash, "mac": mac,
               "hash_kode": hash_kode, "jenis": jenis}
        return self._bool(await self._panggil("/akun/ganti-hash", isi, True), "ok")

    async def kode_terpakai(self, hash_kode):
        return self._bool(await self._panggil("/kode/terpakai", {"hash_kode": hash_kode}, False), "terpakai")


_store: Optional[AkunStore] = None


def store() -> Optional[AkunStore]:
    """Penyimpanan aktif: yang dipasang lewat atur_store (tes), atau Worker bila URL https dan kunci HMAC sah."""
    if _store is not None:
        return _store
    url = _env(WORKER_URL_ENV)
    kunci = _kunci(HMAC_ENV)
    if not url.startswith("https://") or kunci is None:
        return None
    return WorkerAkunStore(url, kunci)


def atur_store(baru: Optional[AkunStore]) -> None:
    global _store
    _store = baru


def _store_wajib() -> AkunStore:
    s = store()
    if s is None:
        logger.error("Penyimpanan akun belum dikonfigurasi (%s/%s)", WORKER_URL_ENV, HMAC_ENV)
        raise AkunBelumSiap()
    return s


async def _aman(coro):
    try:
        return await coro
    except AkunBelumSiap:
        raise
    except Exception as exc:
        logger.error("Penyimpanan akun gagal: %s", type(exc).__name__)
        raise AkunBelumSiap() from None


async def ambil_username(username_normal: str) -> Optional[Akun]:
    baris = await _aman(_store_wajib().ambil_username(username_normal))
    return akun_dari(baris) if baris is not None else None


async def ambil_id(akun_id: str) -> Optional[Akun]:
    baris = await _aman(_store_wajib().ambil_id(akun_id))
    return akun_dari(baris) if baris is not None else None


async def jumlah() -> int:
    return await _aman(_store_wajib().jumlah())


async def kode_terpakai(hash_kode_: str) -> bool:
    return await _aman(_store_wajib().kode_terpakai(hash_kode_))


async def sisip_pertama(akun: Akun, hash_kode_: str) -> bool:
    """INSERT akun hanya bila tabel kosong, sekaligus menandai kode penyiapan terpakai (atomik)."""
    return await _aman(_store_wajib().sisip_pertama(baris_dari(akun), hash_kode_))


async def ganti_hash(akun: Akun, hash_baru: str, hash_kode_: Optional[str] = None,
                     jenis: Optional[str] = None) -> Optional[Akun]:
    """Ganti hash akun (versi_sandi + 1, MAC baru) bila baris masih pada versi akun; akun baru atau None."""
    baru = dengan_mac(akun, hash=hash_baru, versi_sandi=akun.versi_sandi + 1)
    ok = await _aman(_store_wajib().ganti_hash(akun.id, akun.versi_sandi, baru.hash, baru.versi_sandi, baru.mac,
                                               hash_kode_, jenis))
    return baru if ok else None
