"""Endpoint login satu halaman (BFF): /api/v1/auth/masuk, /sesi, /keluar, /siap.

Router ini hanya dipasang di api/index.py bila SAPA_LOGIN_BFF=1. Dengan flag 0 rutenya tidak ada
sama sekali (404 bawaan), sehingga perilaku lama tidak berubah.

Urutan /masuk: asal (X-SAPA, plus Sec-Fetch-Site same-origin atau Origin sendiri) -> bentuk permintaan
-> IP klien tepercaya (BF-1; kosong di Vercel berarti 503) -> pembatas kasar per IP (sebelum Turnstile)
-> hash token Turnstile dicatat sekali pakai di tabel SAPA SEBELUM siteverify (TS-2) -> siteverify
-> pembatas per IP (hanya percobaan yang lolos Turnstile) -> pembatas kegagalan per (hash username + IP)
-> kuota global login /oauth/token -> Auth0 password-realm -> verifikasi token -> sesi.
Semua operasi penyimpanan satu permintaan /masuk memakai satu koneksi DB (sesi_service.satu_koneksi).

Pembatas (Clara, 2026-11-19; IPv6 per prefiks /64):
- per IP kasar: BATAS_IP_KASAR, semua percobaan, hanya untuk menahan banjir sebelum Turnstile;
- per IP: BATAS_IP, hanya percobaan yang lolos siteverify. Jadi pengguna lain di NAT yang sama tidak
  bisa mengunci login IP itu dengan token Turnstile sembarang (BF-6);
- per (username ternormal + IP): BATAS_GAGAL_USERNAME_IP, hanya kegagalan kredensial yang dihitung,
  dengan perkiraan jendela geser (tidak bisa dua kali batas di sekitar pergantian jendela).
  Satu slot dipesan atomik sebelum Auth0 dipanggil (tahan permintaan paralel) dan dikembalikan bila
  hasilnya bukan kegagalan kredensial (sukses, Turnstile, Auth0 bermasalah, mfa, kuota global);
- global: BATAS_GLOBAL ke /oauth/token, kuota login terpisah dari kuota penyegaran sesi;
- TIDAK ada blokir per username lintas IP (supaya akun korban tidak bisa dikunci dari banyak IP);
  sebagai gantinya log dan audit memberi peringatan sekali per jendela bila perkiraan jendela geser
  mencapai AMBANG_PERINGATAN_USERNAME kegagalan per jam.

Setiap respons gagal memuat field `kode` yang stabil (lihat KODE). Semua galat akun dari Auth0
(invalid_grant, blocked, access_denied, password_leaked, dst.) menjadi sandi_salah; too_many_attempts menjadi terlalu_banyak
(AUTH-7, anti-oracle); hanya mfa_required yang dibedakan. Auth0 HTTP 429 lain menjadi terlalu_banyak.
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
import ipaddress
import json
import logging
import math
import re
import time
import unicodedata
from typing import Callable, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

try:
    from . import sesi_service, turnstile
except ImportError:
    import sesi_service
    import turnstile

logger = logging.getLogger("sapa-api")

_NO_STORE = {"Cache-Control": "no-store"}
WAKTU_MINIMUM_GAGAL = 0.7
LANGKAH_WAKTU_GAGAL = 0.25
MAKS_BODY = 4096
_MAKS_USERNAME = 254  # AUTH-5: identitas (username atau email selama transisi)
_MAKS_SANDI_BYTE = 72  # AUTH-5: batas bcrypt Auth0; lebih panjang ditolak, tidak dipotong
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
# Retry-After bila Auth0 sendiri menjawab HTTP 429 (header Auth0 tidak diteruskan _auth0_post).
COBA_LAGI_AUTH0 = 60
AMBANG_PERINGATAN_USERNAME = (60 * 60, 30)
UMUR_TURNSTILE = 600  # hash token Turnstile disimpan 10 menit (token sendiri berlaku 5 menit di Cloudflare)
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
    "isian_tidak_sah": (400, PESAN_ISIAN),  # AUTH-5: semua pelanggaran isian 400 dengan satu pesan
    "sesi_berakhir": (401, PESAN_SESI_BERAKHIR),
}


async def _tidur(detik: float) -> None:
    await asyncio.sleep(detik)


def _monoton() -> float:
    return time.monotonic()


class _Gagal(Exception):
    def __init__(self, kode: str, status: Optional[int] = None, pesan: Optional[str] = None,
                 coba_lagi: Optional[int] = None):
        bawaan_status, bawaan_pesan = KODE[kode]
        super().__init__(kode)
        self.kode, self.status, self.pesan = kode, status or bawaan_status, pesan or bawaan_pesan
        self.coba_lagi = coba_lagi


def normal_username(username: str) -> str:
    """Bentuk ternormal untuk kunci pembatas dan penanda (AUTH-6): NFKC, trim, huruf kecil."""
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
    """Penjaga CSRF untuk permintaan bercookie: header X-SAPA: 1, Origin sendiri, Sec-Fetch-Site sama asal.

    Origin dan Sec-Fetch-Site hanya diperiksa bila dikirim. Untuk /masuk dipakai permintaan_masuk_sah.
    """
    h = request.headers
    if h.get("x-sapa") != "1":
        return False
    origin = h.get("origin")
    if origin and origin.rstrip("/") not in asal_diizinkan:
        return False
    situs = h.get("sec-fetch-site")
    if situs and situs not in ("same-origin", "none"):
        return False
    return True


def permintaan_masuk_sah(request, asal_diizinkan) -> bool:
    """R5/CSRF-2 untuk /masuk (dan kelak /lupa-sandi): X-SAPA: 1 dan bukti asal sendiri yang WAJIB ada.

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
    res = _jawab(gagal.status, {"detail": gagal.pesan, "kode": gagal.kode})
    if gagal.coba_lagi:
        res.headers["Retry-After"] = str(int(gagal.coba_lagi))
    return res


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
            raise _Gagal("terlalu_banyak", coba_lagi=sesi_service.sisa_jendela(aturan[0]))

    async def _kembalikan_slot(tiket: tuple) -> None:
        try:
            await sesi_service.kembalikan(tiket)
        except sesi_service.SesiBelumSiap:
            # Hitungan tetap lebih tinggi (lebih ketat), jadi aman dilewati.
            logger.warning("Slot pembatas kegagalan tidak dapat dikembalikan")

    async def _pesan_slot_gagal(kunci: str) -> tuple:
        """Pesan satu slot kegagalan per (username + IP) secara atomik; 429 bila jendela geser sudah penuh."""
        jendela, maks = BATAS_GAGAL_USERNAME_IP
        try:
            hasil = await sesi_service.hitung_geser(kunci, jendela)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if hasil.perkiraan > maks:
            await _kembalikan_slot(hasil.tiket)
            raise _Gagal("terlalu_banyak", coba_lagi=hasil.coba_lagi(maks))
        return hasil.tiket

    async def _catat_gagal_username(normal: str, jejak: str, catatan: dict) -> None:
        """Hitung kegagalan per username lintas IP hanya untuk peringatan; tidak pernah memblokir.

        Memakai jendela geser (tidak lolos dengan 29 sebelum dan 29 sesudah pergantian jam) dan
        memberi peringatan sekali per jendela.
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
        if not permintaan_masuk_sah(request, asal_diizinkan):
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
            # BF-1: tanpa IP klien tepercaya, Auth0 dan pembatas akan melihat semua login dari satu IP.
            logger.error("IP klien tepercaya tidak tersedia; login ditolak (periksa header Vercel)")
            raise _Gagal("belum_siap")
        # Batas kasar sebelum Turnstile hanya menahan banjir; batas 20/menit dihitung setelah siteverify.
        await _batas(f"ip-kasar:{kunci_ip(ip)}", BATAS_IP_KASAR)
        # TS-2: hash token dicatat SEBELUM siteverify, jadi kiriman ganda tidak pernah sampai ke Cloudflare.
        try:
            pertama = await sesi_service.sekali_pakai(f"turnstile:{token_turnstile}", UMUR_TURNSTILE)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if not pertama:
            logger.info("Token Turnstile dipakai ulang: %s", jejak)
            raise _Gagal("turnstile_kedaluwarsa")
        try:
            await run_in_threadpool(turnstile.cek_turnstile, token_turnstile, ip, turnstile.AKSI_MASUK)
        except turnstile.TurnstileGagal as exc:
            if exc.status == 503:
                raise _Gagal("belum_siap") from None
            kedaluwarsa = exc.alasan == turnstile.ALASAN_KEDALUWARSA
            raise _Gagal("turnstile_kedaluwarsa" if kedaluwarsa else "turnstile_gagal") from None
        await _batas(f"ip:{kunci_ip(ip)}", BATAS_IP)

        tiket = await _pesan_slot_gagal(f"gagal:username:{normal}|ip:{kunci_ip(ip)}")
        kredensial_salah = False
        try:
            await _batas(sesi_service.KUNCI_GLOBAL_LOGIN, BATAS_GLOBAL)
            status, jawaban = await sesi_service._auth0_post("/oauth/token", {
                "grant_type": GRANT_REALM, "realm": cfg["realm"], "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"], "audience": audience, "scope": SCOPE,
                "username": username, "password": password,
            }, {"auth0-forwarded-for": ip})
            galat = (jawaban or {}).get("error")
            if status != 200 or not jawaban or not isinstance(jawaban.get("access_token"), str):
                if galat == "mfa_required":
                    # Risiko diterima sadar (lampiran T22): Auth0 hanya menjawab mfa_required setelah sandi
                    # benar, jadi pesan ini mengonfirmasi sandi untuk akun ber-MFA. Tetap dipilih karena
                    # memetakannya ke "sandi salah" mengunci pengguna dengan pesan menyesatkan; penebak masih
                    # tertahan Turnstile dan pembatas, dan tetap tidak bisa masuk tanpa faktor kedua.
                    logger.warning("Masuk ditolak (mfa_required): %s", jejak)
                    raise _Gagal("mfa")
                # too_many_attempts (blokir brute-force akun) dijawab sama dengan pembatas SAPA (L6), koreksi
                # Clara 2026-11-19. Aman karena pembatas SAPA menghitung username yang tidak ada persis sama.
                if status == 429:
                    logger.warning("Auth0 membatasi /oauth/token (galat %s)", galat or "-")
                    raise _Gagal("terlalu_banyak", coba_lagi=COBA_LAGI_AUTH0)
                if status == 0 or status >= 500 or galat in _GALAT_KONFIG or status == 200:
                    logger.error("Auth0 /oauth/token bermasalah: status %s, galat %s", status, galat or "-")
                    raise _Gagal("belum_siap")
                logger.info("Masuk ditolak (%s): %s", galat or status, jejak)
                kredensial_salah = True
                await _catat_gagal_username(normal, jejak, catatan)
                raise _Gagal("sandi_salah")
        finally:
            # Hanya kegagalan kredensial yang dihitung; sukses dan kegagalan lain mengembalikan slot.
            if not kredensial_salah:
                await _kembalikan_slot(tiket)

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
        if aktif is None:
            # Cookie dibawa tetapi sesinya sudah tidak ada (kedaluwarsa, keluar, dicabut): sesi_berakhir.
            # Bila DB sesi bermasalah (sapa_sesi_galat), cookie dibiarkan supaya sesi kembali setelah pulih.
            if request.cookies.get(sesi_service.NAMA_COOKIE) and not getattr(request.state, "sapa_sesi_galat", None):
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
