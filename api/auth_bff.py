"""Endpoint login satu halaman (BFF): /api/v1/auth/masuk, /sesi, /keluar, /siap.

Router ini hanya dipasang di api/index.py bila SAPA_LOGIN_BFF=1. Dengan flag 0 rutenya tidak ada
sama sekali (404 bawaan), sehingga perilaku lama tidak berubah.

Urutan /masuk: asal (permintaan_sah: X-SAPA, plus Sec-Fetch-Site same-origin atau Origin sendiri) -> bentuk permintaan
-> IP klien tepercaya (kosong di Vercel berarti 503) -> pembatas kasar per IP -> hash token Turnstile dicatat
sekali pakai di tabel SAPA sebelum siteverify -> siteverify (httpx.AsyncClient, tenggat total TENGGAT_SITEVERIFY)
-> pembatas per IP -> batas username unik yang gagal per IP per hari -> pembatas kegagalan per
(username ternormal + IP) -> kuota global login /oauth/token -> Auth0 password-realm (tenggat total
sesi_service.TENGGAT_AUTH0) -> verifikasi token -> sesi.
Semua operasi penyimpanan satu permintaan /masuk memakai satu koneksi DB (sesi_service.satu_koneksi); koneksi
itu ditutup dengan tenggat sesi_service.TENGGAT_TUTUP_DB lalu dihentikan paksa.
Prosedur operasi (deploy, uji asap, rollback): docs/runbook-login-bff.md.

Pembatas (IPv6 per prefiks /64):
- per IP kasar: BATAS_IP_KASAR, semua percobaan, dihitung sebelum siteverify;
- per IP: BATAS_IP, hanya percobaan yang lolos siteverify;
- per (username ternormal + IP): BATAS_GAGAL_USERNAME_IP, hanya kegagalan kredensial, dengan perkiraan jendela
  geser. Satu slot dipesan atomik sebelum Auth0 dipanggil dan dikembalikan bila hasilnya bukan kegagalan
  kredensial (sukses, Turnstile, Auth0 bermasalah, mfa, kuota global);
- hitungan gagal per (username ternormal + IP), tanpa jendela geser: di bawah BATAS_GAGAL_USERNAME_IP berumur
  UMUR_HITUNGAN_GAGAL sejak gagal terakhir; pada kegagalan ke-BATAS_GAGAL_USERNAME_IP naik menjadi penanda
  lengket berumur UMUR_PENANDA sejak gagal terakhir (selama kuota BATAS_PENANDA_LENGKET_HARIAN belum penuh),
  yang direset oleh login sukses dari IP itu. Kegagalan sampai ke-BATAS_GAGAL_USERNAME_IP dijawab sandi_salah,
  sesudahnya terlalu_banyak;
- username unik yang gagal per IP: BATAS_USERNAME_UNIK_IP per hari UTC. Satu baris hitungan per IP per hari,
  bertambah hanya bila percobaan akan membuat hitungan gagal baru, dan dikembalikan bila hasilnya bukan kegagalan
  kredensial. Setelah batas penuh, percobaan tetap diteruskan ke Auth0; kegagalannya dijawab terlalu_banyak dan
  hitungan per username tidak ditulis;
- penanda lengket baru: BATAS_PENANDA_LENGKET_HARIAN per hari UTC untuk seluruh SAPA. Di atasnya hitungan yang
  mencapai ambang hanya berumur UMUR_HITUNGAN_GAGAL;
- global: BATAS_GLOBAL ke /oauth/token, kuota login terpisah dari kuota penyegaran sesi;
- peringatan per username: log dan audit mencatat sekali per jendela bila perkiraan jendela geser mencapai
  AMBANG_PERINGATAN_USERNAME kegagalan per jam.
Jendela harian berganti pukul 00.00 UTC.

Setiap respons gagal memuat field `kode` yang stabil (lihat KODE). Anti-enumerasi: jawaban /masuk hanya fungsi
hitungan SAPA, sama untuk akun ada dan tidak ada. Semua galat akun dari Auth0 (invalid_grant, blocked,
access_denied, password_leaked, too_many_attempts, dst.) dan semua HTTP 429 dari /oauth/token dijawab sandi_salah
(atau terlalu_banyak bila hitungan SAPA sudah lewat batas) dan dihitung sebagai kegagalan kredensial; hanya
mfa_required yang dibedakan. 429 selain too_many_attempts juga dicatat di log sebagai batas tenant. Tenggat Auth0
habis (status 0), koneksi Auth0 yang tidak terbentuk (sesi_service.STATUS_TIDAK_TERKIRIM), tenggat siteverify
habis, atau Cloudflare tidak terjangkau menjadi belum_siap.
Semua jawaban terlalu_banyak seragam: body sama dan tanpa Retry-After.
Semua jalur gagal ditahan minimal WAKTU_MINIMUM_GAGAL detik, termasuk galat tak terduga (503); bila
durasi asli sudah melewati batas itu, waktunya dibulatkan ke atas ke kelipatan LANGKAH_WAKTU_GAGAL dan
log memberi peringatan.
Sandi, username mentah, dan token tidak pernah dicatat; log dan audit hanya memuat penanda HMAC
username 12 karakter (ringkas_username), IP tersamar (audit_log.mask_ip), dan kode hasil.

Env: AUTH0_LOGIN_CLIENT_ID, AUTH0_LOGIN_CLIENT_SECRET, AUTH0_LOGIN_REALM (nama connection per
lingkungan, misalnya SAPA-Staging-DB), SAPA_SESI_KUNCI, SAPA_SESI_KUNCI_LAMA, SAPA_SESI_DATABASE_URL,
TURNSTILE_SECRET_KEY, serta AUTH0_DOMAIN dan AUTH0_API_AUDIENCE yang sudah ada.
"""
from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import logging
import math
import os
import re
import time
import unicodedata
from datetime import timedelta
from typing import Callable, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

try:
    from . import audit_log, sesi_service, turnstile
except ImportError:
    import audit_log
    import sesi_service
    import turnstile

logger = logging.getLogger("sapa-api")

_NO_STORE = {"Cache-Control": "no-store"}
WAKTU_MINIMUM_GAGAL = 0.7
LANGKAH_WAKTU_GAGAL = 0.25
MAKS_BODY = 4096
_MAKS_USERNAME = 254  # identitas (username atau email selama transisi)
_MAKS_SANDI_BYTE = 72  # batas bcrypt Auth0; lebih panjang ditolak, tidak dipotong
_FIELD_MASUK = {"username", "password", "ingat", "turnstile_token"}
_MAKS_TURNSTILE = 2048
# Token Turnstile berbentuk base64url bertitik. Pola ketat supaya varian token yang sama (spasi, karakter
# tak terlihat) tidak menghasilkan hash sekali pakai yang berbeda.
_POLA_TURNSTILE = re.compile(r"[A-Za-z0-9._-]{1,%d}" % _MAKS_TURNSTILE)
GRANT_REALM = "http://auth0.com/oauth/grant-type/password-realm"
SCOPE = "openid offline_access"
BATAS_IP_KASAR = (60, 60)
BATAS_IP = (60, 20)
BATAS_GAGAL_USERNAME_IP = (15 * 60, 10)
BATAS_GLOBAL = sesi_service.BATAS_GLOBAL_LOGIN
# Umur hitungan gagal per (username + IP) sejak gagal terakhir: pendek di bawah ambang, lengket sesudahnya.
UMUR_HITUNGAN_GAGAL = timedelta(seconds=BATAS_GAGAL_USERNAME_IP[0])
UMUR_PENANDA = timedelta(days=30)
BATAS_USERNAME_UNIK_IP = (24 * 60 * 60, 50)  # username unik yang gagal per IP per hari
# Penanda lengket baru (30 hari) per hari untuk seluruh SAPA. Di atasnya hitungan yang mencapai ambang hanya
# berumur UMUR_HITUNGAN_GAGAL.
BATAS_PENANDA_LENGKET_HARIAN = (24 * 60 * 60, 1000)
KUNCI_PENANDA_LENGKET_HARIAN = "global:penanda-lengket-baru"
TENGGAT_SITEVERIFY = turnstile.TENGGAT_SITEVERIFY  # tenggat total siteverify, detik
AMBANG_PERINGATAN_USERNAME = (60 * 60, 30)
# Hash token Turnstile disimpan 5 menit sejak diterima, sama dengan masa berlaku token di Cloudflare yang
# dihitung sejak token dibuat. Pemakaian ulang sesudahnya ditolak Cloudflare (timeout-or-duplicate).
UMUR_TURNSTILE = 300
SIMPAN_SIAP_DETIK = 30
_METODE_AMAN = {"GET", "HEAD", "OPTIONS"}
# Galat Auth0 yang menandakan salah atur client/tenant, bukan sandi salah.
_GALAT_KONFIG = {"invalid_client", "unauthorized_client", "unsupported_grant_type", "invalid_scope",
                 "invalid_request", "server_error", "temporarily_unavailable"}

PESAN_SALAH = "Nama pengguna atau kata sandi salah."
PESAN_MFA = ("Akun ini memakai verifikasi dua langkah yang belum didukung di halaman ini. "
             "Hubungi administrator SAPA.")
PESAN_TURNSTILE_GAGAL = "Verifikasi keamanan gagal. Ulangi centang."
PESAN_TURNSTILE_KEDALUWARSA = "Verifikasi keamanan sudah kedaluwarsa. Ulangi centang."
PESAN_SESI_BERAKHIR = "Sesi berakhir. Silakan masuk kembali."
PESAN_TERLALU_BANYAK = "Terlalu banyak percobaan. Coba lagi beberapa saat lagi."
PESAN_BELUM_SIAP = "Layanan masuk sedang tidak tersedia. Coba beberapa saat lagi."
PESAN_ISIAN = "Isian masuk tidak lengkap atau tidak sah."
PESAN_DITOLAK = "Permintaan ditolak. Muat ulang halaman lalu coba lagi."
PESAN_KELUAR_GAGAL = "Sesi belum dapat diakhiri. Coba lagi."

# Kode galat stabil untuk frontend -> (status bawaan, pesan bawaan). Jangan mengganti nama kode yang ada.
KODE = {
    "sandi_salah": (401, PESAN_SALAH),
    "terlalu_banyak": (429, PESAN_TERLALU_BANYAK),
    "turnstile_gagal": (403, PESAN_TURNSTILE_GAGAL),
    "turnstile_kedaluwarsa": (403, PESAN_TURNSTILE_KEDALUWARSA),
    "mfa": (403, PESAN_MFA),
    "belum_siap": (503, PESAN_BELUM_SIAP),
    "asal_tidak_sah": (403, PESAN_DITOLAK),
    "isian_tidak_sah": (400, PESAN_ISIAN),  # semua pelanggaran isian 400 dengan satu pesan
    "sesi_berakhir": (401, PESAN_SESI_BERAKHIR),
}


async def _tidur(detik: float) -> None:
    await asyncio.sleep(detik)


def _monoton() -> float:
    return time.monotonic()


class _Gagal(Exception):
    def __init__(self, kode: str, status: Optional[int] = None, pesan: Optional[str] = None):
        bawaan_status, bawaan_pesan = KODE[kode]
        super().__init__(kode)
        self.kode, self.status, self.pesan = kode, status or bawaan_status, pesan or bawaan_pesan


def normal_username(username: str) -> str:
    """Bentuk ternormal untuk kunci pembatas dan penanda: NFKC, trim, huruf kecil."""
    return unicodedata.normalize("NFKC", username).strip().casefold()


def ringkas_username(username: str) -> str:
    """Penanda log dan audit untuk username: 12 karakter HMAC berkunci server, bukan nilai mentah."""
    return sesi_service.jejak("username:" + normal_username(username))[:12]


def kunci_ip(ip: Optional[str]) -> str:
    """Kunci pembatas IP: IPv4 apa adanya, IPv6 per prefiks /64 (satu alokasi pelanggan)."""
    if not ip:
        return "tidak-diketahui"
    try:
        alamat = ipaddress.ip_address(ip)
    except ValueError:
        return "tidak-diketahui"
    if alamat.version == 6:
        if alamat.ipv4_mapped:
            return str(alamat.ipv4_mapped)
        return str(ipaddress.ip_network(f"{alamat}/64", strict=False))
    return str(alamat)


def permintaan_sah(request, asal_diizinkan) -> bool:
    """Penjaga CSRF untuk /masuk, /keluar, dan setiap non-GET bercookie: X-SAPA: 1 dan
    bukti asal sendiri yang WAJIB ada.

    Lolos hanya bila Sec-Fetch-Site = same-origin, atau header itu tidak dikirim dan Origin termasuk
    asal_diizinkan. Origin asing, Sec-Fetch-Site selain same-origin (termasuk none), dan permintaan tanpa
    Origin maupun Sec-Fetch-Site ditolak.
    """
    h = request.headers
    if h.get("x-sapa") != "1":
        return False
    origin = h.get("origin")
    if origin and origin.rstrip("/") not in asal_diizinkan:
        return False
    situs = h.get("sec-fetch-site")
    if situs is not None:
        return situs == "same-origin"
    return bool(origin)


def waktu_tahan_gagal(durasi: float) -> float:
    """Total durasi jawaban gagal: minimal WAKTU_MINIMUM_GAGAL, di atasnya dibulatkan ke kelipatan langkah."""
    if durasi <= WAKTU_MINIMUM_GAGAL:
        return WAKTU_MINIMUM_GAGAL
    langkah = math.ceil(round((durasi - WAKTU_MINIMUM_GAGAL) / LANGKAH_WAKTU_GAGAL, 9))
    return WAKTU_MINIMUM_GAGAL + langkah * LANGKAH_WAKTU_GAGAL


def _teks(nilai, maks: int) -> str:
    if not isinstance(nilai, str) or len(nilai) > maks or not nilai.strip():
        raise _Gagal("isian_tidak_sah")
    if any(ord(c) < 32 for c in nilai):
        raise _Gagal("isian_tidak_sah")
    return nilai


async def _baca_json(request: Request) -> dict:
    if (request.headers.get("content-type") or "").split(";")[0].strip().lower() != "application/json":
        raise _Gagal("isian_tidak_sah")
    try:
        if int(request.headers.get("content-length") or 0) > MAKS_BODY:
            raise _Gagal("isian_tidak_sah")
    except ValueError:
        raise _Gagal("isian_tidak_sah") from None
    isi = bytearray()
    async for potong in request.stream():
        isi += potong
        if len(isi) > MAKS_BODY:
            raise _Gagal("isian_tidak_sah")
    try:
        body = json.loads(bytes(isi))
    except (ValueError, UnicodeDecodeError):
        raise _Gagal("isian_tidak_sah") from None
    if not isinstance(body, dict):
        raise _Gagal("isian_tidak_sah")
    return body


def _cookie(res: JSONResponse, nilai: str, ingat: bool) -> None:
    res.set_cookie(sesi_service.NAMA_COOKIE, nilai, max_age=int(sesi_service.UMUR_INGAT.total_seconds()) if ingat else None,
                   path="/", secure=True, httponly=True, samesite="strict")


def _hapus_cookie(res: JSONResponse) -> None:
    res.delete_cookie(sesi_service.NAMA_COOKIE, path="/", secure=True, httponly=True, samesite="strict")


def _jawab(status: int, isi: dict) -> JSONResponse:
    return JSONResponse(status_code=status, headers=_NO_STORE, content=isi)


def _jawab_gagal(gagal: _Gagal) -> JSONResponse:
    # Tanpa Retry-After: semua jawaban terlalu_banyak seragam.
    return _jawab(gagal.status, {"detail": gagal.pesan, "kode": gagal.kode})


def _detail_audit(catatan: dict, hasil: str) -> str:
    """Detail audit login: hash username pendek, hasil/kode, dan peringatan. Tanpa nilai mentah."""
    bagian = [f"u={catatan['u']}"] if catatan.get("u") else []
    bagian.append(f"hasil={hasil}")
    if catatan.get("peringatan"):
        bagian.append(f"peringatan={catatan['peringatan']}")
    return " ".join(bagian)


def buat_router(*, verifikasi_token: Callable, ip_pengguna: Callable, label_peran: Callable,
                klaim_opsional: Callable, asal_diizinkan, audience: str) -> APIRouter:
    """Router BFF yang memakai fungsi auth api/index.py (disuntikkan agar tidak ada impor melingkar)."""
    router = APIRouter(prefix="/api/v1/auth")

    simpanan_siap = {"waktu": None, "siap": False}

    async def _batas(kunci: str, aturan: tuple) -> None:
        try:
            lolos = await sesi_service.batas(kunci, *aturan)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if not lolos:
            raise _Gagal("terlalu_banyak")

    async def _kembalikan_slot(tiket: tuple) -> None:
        try:
            await sesi_service.kembalikan(tiket)
        except sesi_service.SesiBelumSiap:
            # Hitungan tetap lebih tinggi (lebih ketat), jadi aman dilewati.
            logger.warning("Slot pembatas kegagalan tidak dapat dikembalikan")

    async def _pesan_slot_gagal(kunci: str) -> sesi_service.HitunganGeser:
        """Pesan satu slot kegagalan per (username + IP) secara atomik; 429 bila jendela geser sudah penuh."""
        jendela, maks = BATAS_GAGAL_USERNAME_IP
        try:
            hasil = await sesi_service.hitung_geser(kunci, jendela)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if hasil.perkiraan > maks:
            await _kembalikan_slot(hasil.tiket)
            raise _Gagal("terlalu_banyak")
        return hasil

    async def _tambah_gagal_kumulatif(kunci: str) -> int:
        """Tambah hitungan gagal (username + IP). Penanda lengket baru dibatasi per hari untuk seluruh SAPA.

        Kuota harian dibaca sebelum menulis: bila sudah penuh, hitungan yang mencapai ambang hanya berumur
        pendek. Jawaban tetap fungsi hitungan SAPA saja (kuota global sama untuk akun ada dan tidak ada).
        """
        jendela, maks = BATAS_PENANDA_LENGKET_HARIAN
        ambang = BATAS_GAGAL_USERNAME_IP[1]
        try:
            boleh_lengket = await sesi_service.baca_hitungan(KUNCI_PENANDA_LENGKET_HARIAN, jendela) < maks
            jumlah = await sesi_service.tambah_gagal_kumulatif(
                kunci, UMUR_HITUNGAN_GAGAL, UMUR_PENANDA if boleh_lengket else UMUR_HITUNGAN_GAGAL, ambang)
            if jumlah == ambang:
                if boleh_lengket:
                    await sesi_service.hitung(KUNCI_PENANDA_LENGKET_HARIAN, jendela)
                else:
                    logger.warning("Kuota penanda lengket harian penuh; penanda baru hanya berumur %d menit",
                                   int(UMUR_HITUNGAN_GAGAL.total_seconds() // 60))
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        return jumlah

    async def _pesan_username_unik(kunci_gagal: str, ip: str) -> tuple[Optional[tuple], bool]:
        """Pesan satu tempat username unik yang gagal untuk IP ini hari ini.

        Kembalikan (tiket, lewat_batas). Tiket None bila hitungan gagal username ini masih hidup (tidak akan
        menambah baris baru) atau bila batas hari ini sudah penuh. lewat_batas benar bila batas sudah penuh:
        percobaan tetap diteruskan ke Auth0, tetapi kegagalannya tidak menulis hitungan per username dan dijawab
        terlalu_banyak.
        Hanya bergantung pada data SAPA, jadi sama untuk username yang ada dan tidak ada.
        """
        jendela, maks = BATAS_USERNAME_UNIK_IP
        try:
            if await sesi_service.ada_gagal_kumulatif(kunci_gagal):
                return None, False
            jumlah, tiket = await sesi_service.hitung(f"unik-gagal:ip:{kunci_ip(ip)}", jendela)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if jumlah > maks:
            await _kembalikan_slot(tiket)
            await _peringatkan_batas_username_unik(ip, jendela)
            return None, True
        return tiket, False

    async def _peringatkan_batas_username_unik(ip: str, jendela: int) -> None:
        """Satu peringatan per IP (/64) per hari saat batas username unik tercapai. IP disamarkan dan tanpa
        username. Satu baris penanda per IP per hari."""
        try:
            jumlah, _ = await sesi_service.hitung(f"peringatan-unik:ip:{kunci_ip(ip)}", jendela)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if jumlah == 1:
            logger.warning("Batas %d username unik yang gagal per IP tercapai untuk IP %s; kegagalan berikutnya "
                           "hari ini dijawab terlalu_banyak", BATAS_USERNAME_UNIK_IP[1],
                           audit_log.mask_ip(ip, None) or "tidak-diketahui")

    async def _padamkan_penanda(kunci: str) -> None:
        try:
            await sesi_service.padamkan_penanda(kunci)
        except sesi_service.SesiBelumSiap:
            # Penanda yang tertinggal hanya lebih ketat; login yang sudah sukses tidak digagalkan.
            logger.warning("Penanda lengket tidak dapat dipadamkan")

    async def _catat_gagal_username(normal: str, jejak: str, catatan: dict) -> None:
        """Hitung kegagalan per username lintas IP untuk peringatan log dan audit.

        Memakai jendela geser (perkiraan dari jendela ini dan jendela sebelumnya) dan memberi peringatan sekali
        per jendela.
        """
        jendela, ambang = AMBANG_PERINGATAN_USERNAME
        try:
            hasil = await sesi_service.hitung_geser(f"gagal-jam:username:{normal}", jendela)
            if hasil.perkiraan < ambang:
                return
            pertama = await sesi_service.sekali_pakai(f"peringatan:username:{normal}:{hasil.tiket[1]}", 2 * jendela)
        except sesi_service.SesiBelumSiap:
            return
        if pertama:
            jumlah = math.floor(hasil.perkiraan)
            logger.warning("Peringatan: username %s mencapai %d login gagal dalam satu jam (tidak diblokir)",
                           jejak, jumlah)
            catatan["peringatan"] = f"gagal_{jumlah}_per_jam"

    async def _proses_masuk(request: Request, catatan: dict) -> tuple[dict, str, bool]:
        # Sandi tidak boleh lewat URL: query string apa pun ditolak.
        if request.url.query:
            raise _Gagal("isian_tidak_sah")
        if not permintaan_sah(request, asal_diizinkan):
            raise _Gagal("asal_tidak_sah")
        body = await _baca_json(request)
        username = _teks(body.get("username"), _MAKS_USERNAME).strip()
        if set(body) - _FIELD_MASUK:
            raise _Gagal("isian_tidak_sah")
        password = body.get("password")
        if not isinstance(password, str) or not password or len(password.encode("utf-8")) > _MAKS_SANDI_BYTE \
                or any(ord(c) < 32 for c in password):
            raise _Gagal("isian_tidak_sah")
        token_turnstile = _teks(body.get("turnstile_token"), _MAKS_TURNSTILE)
        if not _POLA_TURNSTILE.fullmatch(token_turnstile):
            raise _Gagal("turnstile_gagal")
        ingat = body.get("ingat")
        if not isinstance(ingat, bool):
            raise _Gagal("isian_tidak_sah")
        normal = normal_username(username)
        jejak = ringkas_username(username)
        catatan["u"] = jejak

        cfg = sesi_service.konfigurasi_auth0()
        kurang = [nama for nama, siap in (("auth0_client", cfg is not None), ("kunci", sesi_service.kunci_siap()),
                                          ("db", sesi_service.store() is not None),
                                          ("turnstile", bool(turnstile.kunci_rahasia()))) if not siap]
        if kurang:
            logger.error("Login BFF belum siap: %s", ",".join(kurang))
            raise _Gagal("belum_siap")

        ip = ip_pengguna(request)
        if not ip:
            # Tanpa IP klien tepercaya, Auth0 dan pembatas akan melihat semua login dari satu IP.
            logger.error("IP klien tepercaya tidak tersedia; login ditolak (periksa header Vercel)")
            raise _Gagal("belum_siap")
        # Batas kasar dihitung sebelum Turnstile; batas 20/menit dihitung setelah siteverify.
        await _batas(f"ip-kasar:{kunci_ip(ip)}", BATAS_IP_KASAR)
        # Hash token dicatat sebelum siteverify, jadi kiriman ganda tidak sampai ke Cloudflare.
        try:
            pertama = await sesi_service.sekali_pakai(f"turnstile:{token_turnstile}", UMUR_TURNSTILE)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if not pertama:
            logger.info("Token Turnstile dipakai ulang: %s", jejak)
            raise _Gagal("turnstile_kedaluwarsa")
        try:
            # Tenggat total atas klien httpx async; pembatalan menghentikan penantian HTTP ke Cloudflare.
            await asyncio.wait_for(turnstile.cek_turnstile_async(token_turnstile, ip, turnstile.AKSI_MASUK),
                                   TENGGAT_SITEVERIFY)
        except asyncio.TimeoutError:
            logger.warning("Cloudflare Turnstile melewati tenggat total %s detik", TENGGAT_SITEVERIFY)
            raise _Gagal("belum_siap") from None
        except turnstile.TurnstileGagal as exc:
            if exc.status == 503:
                raise _Gagal("belum_siap") from None
            kedaluwarsa = exc.alasan == turnstile.ALASAN_KEDALUWARSA
            raise _Gagal("turnstile_kedaluwarsa" if kedaluwarsa else "turnstile_gagal") from None
        await _batas(f"ip:{kunci_ip(ip)}", BATAS_IP)

        kunci_gagal = f"gagal:username:{normal}|ip:{kunci_ip(ip)}"
        kredensial_salah = False
        tiket_unik, lewat_batas_unik = await _pesan_username_unik(kunci_gagal, ip)
        try:
            slot = await _pesan_slot_gagal(kunci_gagal)
        except _Gagal:
            if tiket_unik is not None:
                await _kembalikan_slot(tiket_unik)
            raise
        try:
            await _batas(sesi_service.KUNCI_GLOBAL_LOGIN, BATAS_GLOBAL)
            status, jawaban = await sesi_service._auth0_post("/oauth/token", {
                "grant_type": GRANT_REALM, "realm": cfg["realm"], "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"], "audience": audience, "scope": SCOPE,
                "username": username, "password": password,
            }, {"auth0-forwarded-for": ip})
            galat = (jawaban or {}).get("error")
            if status != 200 or not jawaban or not isinstance(jawaban.get("access_token"), str):
                if galat is not None and not isinstance(galat, str):
                    logger.error("Auth0 /oauth/token bermasalah: status %s, galat tidak berbentuk teks", status)
                    raise _Gagal("belum_siap")
                if galat == "mfa_required":
                    # Akun ber-MFA mendapat pesan sendiri (belum didukung di halaman ini).
                    logger.warning("Masuk ditolak (mfa_required): %s", jejak)
                    raise _Gagal("mfa")
                # Semua 429 Auth0 (termasuk too_many_attempts) dihitung sebagai kegagalan kredensial biasa: slot
                # tidak dikembalikan dan jawabannya hanya ditentukan hitungan SAPA. Di bawah ini jalurnya sama
                # dengan invalid_grant, termasuk operasi DB-nya.
                diblokir_auth0 = status == 429
                if diblokir_auth0 and galat != "too_many_attempts":
                    # 429 selain too_many_attempts dicatat sebagai batas tenant Auth0 (tanpa username); jawaban
                    # tetap sandi_salah.
                    logger.warning("Auth0 429 batas tenant pada /oauth/token (galat %s); dijawab sandi_salah dan "
                                   "dihitung sebagai kegagalan", galat or "-")
                # status <= 0: Auth0 tidak terjangkau, tenggat habis (0), atau pasti belum terkirim (-1).
                if not diblokir_auth0 and (status <= 0 or status >= 500 or galat in _GALAT_KONFIG or status == 200):
                    logger.error("Auth0 /oauth/token bermasalah: status %s, galat %s", status, galat or "-")
                    raise _Gagal("belum_siap")
                kredensial_salah = True
                if lewat_batas_unik:
                    # Batas username unik IP ini penuh: jawaban terlalu_banyak dan hitungan per username tidak
                    # ditulis. lewat_batas_unik hanya fungsi data SAPA.
                    logger.info("Masuk ditolak (batas username unik per IP): %s", jejak)
                    raise _Gagal("terlalu_banyak")
                await _catat_gagal_username(normal, jejak, catatan)
                jumlah = await _tambah_gagal_kumulatif(kunci_gagal)
                if jumlah > BATAS_GAGAL_USERNAME_IP[1]:
                    # Kegagalan ke-10 masih sandi_salah; sesudahnya terlalu_banyak sampai sukses atau 30 hari.
                    logger.info("Masuk ditolak (penanda lengket): %s", jejak)
                    raise _Gagal("terlalu_banyak")
                logger.info("Masuk ditolak (%s): %s", galat or status, jejak)
                raise _Gagal("sandi_salah")
        finally:
            # Hanya kegagalan kredensial yang dihitung; sukses dan kegagalan lain mengembalikan slot dan
            # tempat username unik.
            if not kredensial_salah:
                await _kembalikan_slot(slot.tiket)
                if tiket_unik is not None:
                    await _kembalikan_slot(tiket_unik)
        # Login sukses dari IP ini mereset hitungan kumulatif dan penanda lengket (username + IP).
        await _padamkan_penanda(kunci_gagal)

        try:
            klaim = await run_in_threadpool(verifikasi_token, jawaban["access_token"])
        except HTTPException as exc:
            logger.error("Token dari Auth0 tidak lolos verifikasi (status %s); periksa audience client login", exc.status_code)
            raise _Gagal("belum_siap") from None
        sub = klaim.get("sub")
        if not isinstance(sub, str) or not sub:
            raise _Gagal("belum_siap")
        try:
            cookie = await sesi_service.buat_sesi(sub, ingat, jawaban)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        # Sesi lama di browser yang sama diakhiri, supaya setiap login memakai id baru.
        lama = request.cookies.get(sesi_service.NAMA_COOKIE)
        if lama:
            try:
                await sesi_service.hapus_sesi(lama)
            except sesi_service.SesiBelumSiap:
                pass
        logger.info("Masuk berhasil: %s", jejak)
        return klaim, cookie, ingat

    @router.post("/masuk")
    async def masuk(request: Request):
        mulai = _monoton()
        sesi_service.pasang_executor_dns()
        if os.environ.get("VERCEL_ENV") == "preview":
            # Sementara untuk uji staging: apakah loop dipakai ulang antar permintaan. Hapus sesudah uji.
            jejak_loop = hashlib.sha256(str(id(asyncio.get_running_loop())).encode()).hexdigest()[:8]
            logger.info("uji-staging loop=%s pid=%s", jejak_loop, os.getpid())
        catatan: dict = {}
        try:
            async with sesi_service.satu_koneksi():
                klaim, cookie, ingat = await _proses_masuk(request, catatan)
        except Exception as exc:
            if isinstance(exc, _Gagal):
                gagal = exc
            else:
                # Jaring pengaman: galat tak terduga tetap 503 seragam, tanpa rincian atau isian di log.
                logger.error("Masuk gagal tak terduga: %s", type(exc).__name__)
                gagal = _Gagal("belum_siap")
            durasi = _monoton() - mulai
            sisa = waktu_tahan_gagal(durasi) - durasi
            if sisa > 0:
                await _tidur(sisa)
            if durasi > WAKTU_MINIMUM_GAGAL:
                logger.warning("Durasi masuk gagal %d ms melewati batas minimum %d ms (kode %s)",
                               round(durasi * 1000), round(WAKTU_MINIMUM_GAGAL * 1000), gagal.kode)
            request.state.audit_detail = _detail_audit(catatan, gagal.kode)
            return _jawab_gagal(gagal)
        request.state.audit_claims = {"sub": klaim["sub"]}
        request.state.audit_detail = _detail_audit(catatan, "berhasil")
        res = _jawab(200, {"masuk": True, "peran": label_peran(klaim)})
        _cookie(res, cookie, ingat)
        return res

    @router.get("/sesi")
    async def sesi(request: Request):
        aktif = getattr(request.state, "sapa_sesi", None)
        if getattr(request.state, "sapa_sesi_galat", None):
            # DB sesi (atau kunci) bermasalah bukan berarti tidak masuk. Cookie dibiarkan supaya sesi
            # kembali setelah pulih.
            return _jawab_gagal(_Gagal("belum_siap"))
        if aktif is None:
            # Cookie dibawa tetapi sesinya sudah tidak ada (kedaluwarsa, keluar, dicabut): sesi_berakhir.
            if request.cookies.get(sesi_service.NAMA_COOKIE):
                res = _jawab(200, {"masuk": False, "kode": "sesi_berakhir"})
                _hapus_cookie(res)
                return res
            return _jawab(200, {"masuk": False})
        try:
            klaim = await run_in_threadpool(verifikasi_token, aktif.access_token)
        except HTTPException as exc:
            if exc.status_code == 401:
                return _jawab(200, {"masuk": False, "kode": "sesi_berakhir"})
            # JWKS Auth0 tidak terjangkau atau auth belum dikonfigurasi: sesi mungkin masih sah.
            return _jawab_gagal(_Gagal("belum_siap"))
        isi = {"masuk": True, "peran": label_peran(klaim)}
        if aktif.nama:
            isi["nama"] = aktif.nama
        return _jawab(200, isi)

    @router.post("/keluar")
    async def keluar(request: Request):
        if not permintaan_sah(request, asal_diizinkan):
            return _jawab_gagal(_Gagal("asal_tidak_sah"))
        aktif = getattr(request.state, "sapa_sesi", None)
        if aktif is not None:
            request.state.audit_claims = {"sub": aktif.sub}
        cookie = request.cookies.get(sesi_service.NAMA_COOKIE)
        if cookie:
            try:
                await sesi_service.hapus_sesi(cookie)
            except sesi_service.SesiBelumSiap:
                return _jawab_gagal(_Gagal("belum_siap", pesan=PESAN_KELUAR_GAGAL))
        if aktif is not None and aktif.refresh_token:
            await sesi_service.cabut_refresh_token(aktif.refresh_token)
        res = _jawab(200, {"keluar": True})
        _hapus_cookie(res)
        # Browser juga membuang cookie dan penyimpanan lain milik asal ini.
        # Tinjau ulang bila SAPA kelak memakai domain bersama: "cookies" berlaku untuk seluruh domain
        # terdaftar (eTLD+1), jadi bisa ikut menghapus cookie aplikasi lain di domain itu.
        res.headers["Clear-Site-Data"] = '"cookies", "storage"'
        return res

    async def _cek_lengkap() -> dict:
        cek = await sesi_service.cek_kesiapan()
        cek["turnstile"] = bool(turnstile.kunci_rahasia())
        return cek

    @router.get("/siap")
    async def siap(request: Request):
        # Rincian hanya untuk Super Admin (selalu segar); tanpa login cukup satu nilai siap/tidak yang
        # disimpan sementara SIMPAN_SIAP_DETIK, supaya permintaan anonim tidak membebani DB.
        klaim: Optional[dict] = await run_in_threadpool(klaim_opsional, request)
        if klaim and label_peran(klaim) == "super_admin":
            cek = await _cek_lengkap()
            return _jawab(200, {"siap": all(cek.values()), "cek": cek})
        sekarang = _monoton()
        if simpanan_siap["waktu"] is None or sekarang - simpanan_siap["waktu"] >= SIMPAN_SIAP_DETIK:
            simpanan_siap.update(waktu=sekarang, siap=all((await _cek_lengkap()).values()))
        return _jawab(200, {"siap": simpanan_siap["siap"]})

    return router
