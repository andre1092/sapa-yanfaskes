"""Pemeriksaan Cloudflare Turnstile di server (siteverify), dipakai bersama oleh semua endpoint.

Yang dicek: success, hostname termasuk host APP_ORIGINS (tanpa localhost di produksi), dan action
yang sesuai endpoint, supaya token untuk satu formulir tidak bisa dipakai di formulir lain.
Cloudflare menolak token yang dipakai ulang (timeout-or-duplicate), tetapi tidak seketika; sifat
sekali pakai dijamin pemanggil lewat tabel SAPA sebelum siteverify (auth_bff, TS-2).
Gagal tertutup: tanpa kunci rahasia atau bila Cloudflare tidak terjangkau, hasilnya 503.
Token dan jawaban Cloudflare tidak pernah dicatat di log, hanya kode galatnya.
"""
from __future__ import annotations

import logging
import os
from urllib.parse import urlparse

import requests

logger = logging.getLogger("sapa-api")

TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
SECRET_ENV = "TURNSTILE_SECRET_KEY"
AKSI_MASUK = "login"  # sama dengan action widget di SPEK Kim v2.1
HOST_LOKAL = {"localhost", "127.0.0.1", "::1"}


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


def cek_turnstile(token: str, ip: str | None, aksi_diharapkan: str, *, cdata: str | None = None,
                  idempotency_key: str | None = None, post=None) -> dict:
    """Periksa jawaban Turnstile ke Cloudflare; kembalikan jawaban Cloudflare bila lolos."""
    rahasia = kunci_rahasia()
    if not rahasia:
        logger.error("Turnstile belum dikonfigurasi (%s kosong)", SECRET_ENV)
        raise TurnstileGagal(503, "belum dikonfigurasi")
    data = {"secret": rahasia, "response": token}
    if ip:
        data["remoteip"] = ip
    if idempotency_key:
        data["idempotency_key"] = idempotency_key
    try:
        res = (post or _kirim)(TURNSTILE_URL, data=data, timeout=8)
        hasil = res.json() if res.status_code == 200 else None
    except (requests.RequestException, ValueError):
        hasil = None
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
