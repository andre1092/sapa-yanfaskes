"""Pemeriksaan Cloudflare Turnstile di server (siteverify), dipakai bersama oleh semua endpoint.

Yang dicek: success, hostname termasuk host APP_ORIGINS (tanpa localhost di produksi), dan action
yang sesuai endpoint, supaya token untuk satu formulir tidak bisa dipakai di formulir lain.
Cloudflare menolak token yang dipakai ulang (timeout-or-duplicate), tetapi tidak seketika; sifat
sekali pakai dijamin pemanggil lewat tabel SAPA sebelum siteverify (auth_bff).
Gagal tertutup: tanpa kunci rahasia atau bila Cloudflare tidak terjangkau, hasilnya 503.
Token dan jawaban Cloudflare tidak pernah dicatat di log, hanya kode galatnya.

Dua varian dengan pemetaan jawaban yang sama (_periksa_jawaban):
- cek_turnstile (sinkron, requests): verifikasi manusia (verifikasi_service), tidak berubah sejak flag 0.
- cek_turnstile_async (httpx.AsyncClient): login BFF (/masuk, action AKSI_MASUK) dan penyiapan akun
  (/siapkan-akun, action AKSI_SIAPKAN_AKUN). Pemanggil membungkusnya dengan asyncio.wait_for
  (TENGGAT_SITEVERIFY); pembatalan menghentikan permintaan HTTP ke Cloudflare. Tenggat per tahap httpx
  (TIMEOUT_SITEVERIFY_TAHAP) di bawah tenggat total, supaya sambungan yang macet dihentikan httpx sendiri
  (soket ditutup). Resolusi DNS httpx memakai executor bawaan loop (sesi_service.pasang_executor_dns). Bila
  resolusi DNS tertahan, connect habis tenggat: login menjawab belum_siap, dan log memuat "Cloudflare Turnstile
  tidak dapat dihubungi".
"""
from __future__ import annotations

import logging
import os
from urllib.parse import urlparse

import httpx
import requests

logger = logging.getLogger("sapa-api")

TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
SECRET_ENV = "TURNSTILE_SECRET_KEY"
AKSI_MASUK = "login"  # sama dengan action widget Turnstile di halaman login
AKSI_SIAPKAN_AKUN = "sapa_siapkan_akun"  # widget Turnstile halaman /siapkan-akun
HOST_LOKAL = {"localhost", "127.0.0.1", "::1"}
TIMEOUT_SITEVERIFY = 5  # detik
TENGGAT_SITEVERIFY = TIMEOUT_SITEVERIFY  # tenggat total siteverify login, dipakai auth_bff
# Tenggat per tahap klien async. TCP connect dan TLS handshake masing-masing mendapat tenggat connect, jadi
# 2 x connect + pool (4,5 detik) tetap di bawah tenggat total 5 detik.
TIMEOUT_SITEVERIFY_TAHAP = httpx.Timeout(connect=2.0, read=4.0, write=4.0, pool=0.5)


ALASAN_KEDALUWARSA = "kedaluwarsa"


class TurnstileGagal(Exception):
    """status 403: jawaban ditolak (alasan "kedaluwarsa" untuk timeout-or-duplicate);
    status 503: belum dikonfigurasi atau Cloudflare tidak terjangkau."""

    def __init__(self, status: int, alasan: str = ""):
        super().__init__(alasan or str(status))
        self.status, self.alasan = status, alasan


def kunci_rahasia() -> str:
    return os.environ.get(SECRET_ENV, "").strip()


def host_diizinkan() -> set[str]:
    asal = os.environ.get("APP_ORIGINS", "").strip() or "https://sapa-yanfaskes.vercel.app"
    host = {urlparse(o.strip()).hostname for o in asal.split(",") if urlparse(o.strip()).hostname}
    if os.environ.get("VERCEL_ENV") == "production":
        host -= HOST_LOKAL
    return host


def _kirim(url: str, data: dict | None = None, timeout: float | None = None):
    return requests.post(url, data=data, timeout=timeout)


def _klien_siteverify(transport=None) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT_SITEVERIFY_TAHAP, follow_redirects=False, transport=transport)


def _data_siteverify(token: str, ip: str | None, idempotency_key: str | None) -> dict:
    rahasia = kunci_rahasia()
    if not rahasia:
        logger.error("Turnstile belum dikonfigurasi (%s kosong)", SECRET_ENV)
        raise TurnstileGagal(503, "belum dikonfigurasi")
    data = {"secret": rahasia, "response": token}
    if ip:
        data["remoteip"] = ip
    if idempotency_key:
        data["idempotency_key"] = idempotency_key
    return data


def _periksa_jawaban(hasil, aksi_diharapkan: str, cdata: str | None) -> dict:
    """Pemetaan jawaban siteverify, sama untuk varian sinkron dan async."""
    if not isinstance(hasil, dict):
        logger.warning("Cloudflare Turnstile tidak dapat dihubungi")
        raise TurnstileGagal(503, "tidak terjangkau")

    cocok = (hasil.get("success") is True and hasil.get("hostname") in host_diizinkan()
             and hasil.get("action") == aksi_diharapkan and (cdata is None or hasil.get("cdata") == cdata))
    if not cocok:
        # Hanya kode galat Cloudflare yang dicatat; jawaban dan token tidak.
        kode = [str(k) for k in (hasil.get("error-codes") or []) if isinstance(k, (str, int))]
        logger.info("Turnstile ditolak: %s", ",".join(kode) or "tidak cocok")
        # timeout-or-duplicate: token kedaluwarsa (lebih dari 300 detik) atau sudah pernah diperiksa.
        raise TurnstileGagal(403, ALASAN_KEDALUWARSA if "timeout-or-duplicate" in kode else "ditolak")
    return hasil


def cek_turnstile(token: str, ip: str | None, aksi_diharapkan: str, *, cdata: str | None = None,
                  idempotency_key: str | None = None, post=None) -> dict:
    """Periksa jawaban Turnstile ke Cloudflare; kembalikan jawaban Cloudflare bila lolos."""
    data = _data_siteverify(token, ip, idempotency_key)
    try:
        res = (post or _kirim)(TURNSTILE_URL, data=data, timeout=TIMEOUT_SITEVERIFY)
        hasil = res.json() if res.status_code == 200 else None
    except (requests.RequestException, ValueError):
        hasil = None
    return _periksa_jawaban(hasil, aksi_diharapkan, cdata)


async def cek_turnstile_async(token: str, ip: str | None, aksi_diharapkan: str, *, cdata: str | None = None,
                              idempotency_key: str | None = None) -> dict:
    """Seperti cek_turnstile, lewat httpx.AsyncClient. Tenggat total dipasang pemanggil (wait_for)."""
    data = _data_siteverify(token, ip, idempotency_key)
    try:
        async with _klien_siteverify() as klien:
            res = await klien.post(TURNSTILE_URL, data=data)
        hasil = res.json() if res.status_code == 200 else None
    except (httpx.HTTPError, httpx.InvalidURL, ValueError):
        hasil = None
    return _periksa_jawaban(hasil, aksi_diharapkan, cdata)
