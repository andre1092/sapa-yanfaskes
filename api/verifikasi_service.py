"""Verifikasi Cloudflare Turnstile di tengah login Auth0 (post-login Action redirect).

1. Action (auth0/actions/sapa-verifikasi-turnstile.js) mengalihkan pengguna ke /verifikasi dengan
   `state` dan `session_token` (JWT HS256 dari api.redirect.encodeToken).
2. Halaman /verifikasi menampilkan Turnstile dengan action AKSI dan cData = ringkas_state(state).
3. verifikasi() memeriksa session_token, memeriksa jawaban Turnstile ke Cloudflare, lalu menerbitkan
   token balasan bertanda tangan yang diperiksa Action lewat api.redirect.validateToken.

Gagal tertutup: tanpa konfigurasi atau bila Cloudflare tidak terjangkau, verifikasi ditolak.
Token dan state tidak pernah dicatat di log.
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
import time

import jwt
import requests

try:
    from . import turnstile
except ImportError:
    import turnstile

logger = logging.getLogger(__name__)

TURNSTILE_URL = turnstile.TURNSTILE_URL
AKSI = "sapa_login"
TUJUAN = "sapa-verifikasi"
UMUR_TOKEN_BALASAN = 120
_MAKS_STATE = 2048
_MAKS_TOKEN = 4096
_MAKS_TURNSTILE = 2048

PESAN_GAGAL = "Verifikasi keamanan tidak berhasil. Kembali ke halaman masuk lalu coba lagi."
PESAN_TAUTAN = "Tautan verifikasi tidak sah atau sudah kedaluwarsa. Kembali ke halaman masuk lalu coba lagi."
PESAN_LAYANAN = "Layanan verifikasi sedang bermasalah. Coba beberapa saat lagi."


class VerifikasiGagal(Exception):
    def __init__(self, status: int, pesan: str):
        super().__init__(pesan)
        self.status, self.pesan = status, pesan


def ringkas_state(state: str) -> str:
    """Ringkasan state untuk cData Turnstile (huruf dan angka saja, maks 255 karakter)."""
    return hashlib.sha256(state.encode("utf-8")).hexdigest()[:32]


def _env(nama: str) -> str:
    return os.environ.get(nama, "").strip()


def _domain_auth0() -> str:
    return _env("AUTH0_DOMAIN").removeprefix("https://").removeprefix("http://").rstrip("/")


def _kirim(url: str, data: dict | None = None, timeout: float | None = None):
    return requests.post(url, data=data, timeout=timeout)


def _teks(nilai, maks: int) -> str:
    if not isinstance(nilai, str) or not nilai or len(nilai) > maks:
        raise VerifikasiGagal(400, PESAN_TAUTAN)
    return nilai


def verifikasi(state, session_token, turnstile_token, remote_ip: str | None, post=None) -> dict:
    state = _teks(state, _MAKS_STATE)
    session_token = _teks(session_token, _MAKS_TOKEN)
    turnstile_token = _teks(turnstile_token, _MAKS_TURNSTILE)

    rahasia, kunci_turnstile, domain = _env("SAPA_VERIFIKASI_SECRET"), turnstile.kunci_rahasia(), _domain_auth0()
    if not (rahasia and kunci_turnstile and domain):
        logger.error("Verifikasi Turnstile belum dikonfigurasi")
        raise VerifikasiGagal(503, PESAN_LAYANAN)

    try:
        masuk = jwt.decode(session_token, rahasia, algorithms=["HS256"], options={"require": ["exp", "sub"]}, leeway=5)
    except jwt.PyJWTError:
        raise VerifikasiGagal(400, PESAN_TAUTAN) from None
    sub = masuk.get("sub")
    if masuk.get("tujuan") != TUJUAN or not isinstance(sub, str) or not sub:
        raise VerifikasiGagal(400, PESAN_TAUTAN)
    # Klaim opsional dari encodeToken: bila ada, harus cocok dengan transaksi dan tenant ini.
    if "state" in masuk and masuk["state"] != state:
        raise VerifikasiGagal(400, PESAN_TAUTAN)
    if "iss" in masuk and str(masuk["iss"]).removeprefix("https://").rstrip("/") != domain:
        raise VerifikasiGagal(400, PESAN_TAUTAN)

    # Token Turnstile memang sekali pakai, jadi kunci idempotensi acak tidak menambah perlindungan.
    try:
        turnstile.cek_turnstile(turnstile_token, remote_ip, AKSI, cdata=ringkas_state(state), post=post or _kirim)
    except turnstile.TurnstileGagal as exc:
        gagal = VerifikasiGagal(503, PESAN_LAYANAN) if exc.status == 503 else VerifikasiGagal(403, PESAN_GAGAL)
        raise gagal from None

    sekarang = int(time.time())
    balasan = jwt.encode({
        "iss": "sapa-yanfaskes", "sub": sub, "state": state, "turnstile": True,
        "iat": sekarang, "exp": sekarang + UMUR_TOKEN_BALASAN, "jti": secrets.token_urlsafe(16),
    }, rahasia, algorithm="HS256")
    # Alamat lanjutan tetap dari konfigurasi server, bukan dari masukan, supaya tidak ada pengalihan terbuka.
    return {"continue_url": f"https://{domain}/continue", "state": state, "sapa_token": balasan}
