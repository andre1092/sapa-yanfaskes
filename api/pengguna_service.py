"""Akun petugas RS (peran Petugas RS) lewat Auth0 Management API.

SAPA tidak menyimpan kata sandi. Sandi awal dibuat acak di server, dikirim ke Auth0, dan hanya
dikembalikan sekali ke layar Super Admin. Tanda `wajib_ganti_sandi` di app_metadata Auth0
menahan akses data sampai petugas mengganti sandinya sendiri.
"""
from __future__ import annotations

import logging
import os
import secrets
import string
import threading
import time
from typing import Any
from urllib.parse import quote

import requests

logger = logging.getLogger("sapa-api")

PERAN_PETUGAS = "petugas_rs"
DEFAULT_CONNECTION = "Username-Password-Authentication"
PESAN_WAJIB_GANTI = "Ganti kata sandi awal Anda terlebih dahulu."
PESAN_BELUM_SIAP = "Pengelolaan akun belum dikonfigurasi. Hubungi Super Admin."
_TTL_STATUS = 60.0
_status: dict[str, tuple[float, bool]] = {}
_status_lock = threading.Lock()


class PenggunaBelumSiap(Exception):
    """Variabel Management API atau peran Petugas RS belum diisi."""


class Auth0Error(Exception):
    def __init__(self, status: int):
        super().__init__(f"Auth0 menjawab {status}")
        self.status = status


def _domain() -> str:
    domain = os.environ.get("AUTH0_DOMAIN", "").strip().removeprefix("https://").removeprefix("http://").rstrip("/")
    return domain


class Auth0Management:
    def __init__(self, domain: str, client_id: str, client_secret: str, connection: str, spa_client_id: str):
        self.domain, self.client_id, self._secret = domain, client_id, client_secret
        self.connection, self.spa_client_id = connection, spa_client_id
        self._token: tuple[str, float] | None = None
        self._lock = threading.Lock()

    def _access_token(self) -> str:
        with self._lock:
            if self._token and self._token[1] > time.time():
                return self._token[0]
            res = requests.post(f"https://{self.domain}/oauth/token", timeout=10, json={
                "grant_type": "client_credentials", "client_id": self.client_id, "client_secret": self._secret,
                "audience": f"https://{self.domain}/api/v2/",
            })
            if res.status_code >= 400:
                logger.error("Token Management API ditolak: %s", res.status_code)
                raise Auth0Error(res.status_code)
            data = res.json()
            self._token = (data["access_token"], time.time() + max(60, int(data.get("expires_in", 3600)) - 60))
            return self._token[0]

    def request(self, method: str, path: str, json: Any = None, params: dict | None = None) -> Any:
        res = requests.request(method, f"https://{self.domain}{path}", json=json, params=params, timeout=10,
                               headers={"Authorization": f"Bearer {self._access_token()}"})
        if res.status_code == 404:
            raise LookupError(path)
        if res.status_code >= 400:
            # Isi jawaban Auth0 tidak dicatat: bisa memuat email atau data akun.
            logger.warning("Management API %s %s ditolak: %s", method, path.split("/")[3] if path.count("/") >= 3 else path, res.status_code)
            raise Auth0Error(res.status_code)
        return res.json() if res.content else {}

    def send_change_password_email(self, email: str) -> None:
        if not self.spa_client_id:
            raise PenggunaBelumSiap()
        res = requests.post(f"https://{self.domain}/dbconnections/change_password", timeout=10,
                            json={"client_id": self.spa_client_id, "email": email, "connection": self.connection})
        if res.status_code >= 400:
            logger.warning("Email ganti sandi ditolak: %s", res.status_code)
            raise Auth0Error(res.status_code)


_client: tuple[tuple, Auth0Management] | None = None


def get_client() -> Auth0Management | None:
    """Klien Management API, atau None bila variabel lingkungannya belum lengkap."""
    global _client
    config = (_domain(), os.environ.get("AUTH0_MGMT_CLIENT_ID", ""), os.environ.get("AUTH0_MGMT_CLIENT_SECRET", ""),
              os.environ.get("AUTH0_DB_CONNECTION", DEFAULT_CONNECTION), os.environ.get("AUTH0_SPA_CLIENT_ID", ""))
    if not all(config[:3]):
        return None
    if _client is None or _client[0] != config:
        _client = (config, Auth0Management(*config))
    return _client[1]


def role_id() -> str:
    value = os.environ.get("AUTH0_ROLE_PETUGAS_RS_ID", "").strip()
    if not value:
        raise PenggunaBelumSiap()
    return value


# --- Kata sandi ---
_HURUF = "".join(c for c in string.ascii_letters if c not in "IlO")
_ANGKA = "23456789"
_SIMBOL = "!@#$%*-_=+?"


def buat_sandi_awal(panjang: int = 16) -> str:
    """Sandi acak kuat: huruf besar, huruf kecil, angka, simbol; tanpa karakter yang mirip."""
    semua = _HURUF + _ANGKA + _SIMBOL
    while True:
        sandi = "".join(secrets.choice(semua) for _ in range(panjang))
        if (any(c.islower() for c in sandi) and any(c.isupper() for c in sandi)
                and any(c in _ANGKA for c in sandi) and any(c in _SIMBOL for c in sandi)):
            return sandi


def cek_sandi(sandi: str) -> str | None:
    """Pesan kesalahan bila sandi lemah, None bila memenuhi syarat."""
    if not isinstance(sandi, str) or len(sandi) < 12:
        return "Kata sandi minimal 12 karakter."
    if len(sandi) > 128:
        return "Kata sandi maksimal 128 karakter."
    if not (any(c.islower() for c in sandi) and any(c.isupper() for c in sandi) and any(c.isdigit() for c in sandi)):
        return "Kata sandi harus memuat huruf besar, huruf kecil, dan angka."
    return None


# --- Status wajib ganti sandi (disimpan sebentar supaya tidak memanggil Auth0 tiap permintaan) ---
def lupakan_status(user_id: str | None = None) -> None:
    with _status_lock:
        if user_id is None:
            _status.clear()
        else:
            _status.pop(user_id, None)


def wajib_ganti_sandi(user_id: str) -> bool:
    now = time.monotonic()
    with _status_lock:
        cached = _status.get(user_id)
        if cached and now - cached[0] < _TTL_STATUS:
            return cached[1]
    client = get_client()
    if client is None:
        raise PenggunaBelumSiap()
    try:
        user = client.request("GET", f"/api/v2/users/{quote(user_id, safe='')}")
    except LookupError:
        value = True  # akun tidak ditemukan: tutup akses
    else:
        value = bool((user.get("app_metadata") or {}).get("wajib_ganti_sandi"))
    with _status_lock:
        _status[user_id] = (now, value)
    return value


# --- Pengelolaan oleh Super Admin ---
def _ringkas(user: dict) -> dict:
    meta = user.get("app_metadata") or {}
    return {
        "user_id": user.get("user_id"), "nama": user.get("name") or "", "email": user.get("email") or "",
        "aktif": not user.get("blocked", False), "wajib_ganti_sandi": bool(meta.get("wajib_ganti_sandi")),
        "kode_ppk": meta.get("kode_ppk") or "", "login_terakhir": user.get("last_login"), "dibuat": user.get("created_at"),
    }


def daftar_petugas(client) -> list[dict]:
    hasil: list[dict] = []
    for page in range(10):
        users = client.request("GET", "/api/v2/users", params={
            "q": f'app_metadata.sapa_peran:"{PERAN_PETUGAS}"', "search_engine": "v3", "per_page": 100, "page": page,
            "fields": "user_id,name,email,blocked,last_login,created_at,app_metadata", "include_fields": "true",
        })
        hasil.extend(_ringkas(u) for u in users if (u.get("app_metadata") or {}).get("sapa_peran") == PERAN_PETUGAS)
        if len(users) < 100:
            break
    return hasil


def ambil_petugas(client, user_id: str) -> dict | None:
    try:
        user = client.request("GET", f"/api/v2/users/{quote(user_id, safe='')}")
    except LookupError:
        return None
    return user if (user.get("app_metadata") or {}).get("sapa_peran") == PERAN_PETUGAS else None


def buat_petugas(client, nama: str, email: str, kode_ppk: str) -> tuple[dict, str]:
    peran = role_id()
    sandi = buat_sandi_awal()
    user = client.request("POST", "/api/v2/users", json={
        "connection": getattr(client, "connection", DEFAULT_CONNECTION), "email": email, "name": nama,
        "password": sandi, "verify_email": False,
        "app_metadata": {"sapa_peran": PERAN_PETUGAS, "kode_ppk": kode_ppk, "wajib_ganti_sandi": True},
    })
    try:
        client.request("POST", f"/api/v2/roles/{quote(peran, safe='')}/users", json={"users": [user["user_id"]]})
    except Exception:
        # Jangan tinggalkan akun tanpa peran.
        client.request("DELETE", f"/api/v2/users/{quote(user['user_id'], safe='')}")
        raise
    return _ringkas(user), sandi


def _ubah_sandi(client, user_id: str, sandi: str, wajib: bool) -> None:
    path = f"/api/v2/users/{quote(user_id, safe='')}"
    client.request("PATCH", path, json={"password": sandi, "connection": getattr(client, "connection", DEFAULT_CONNECTION)})
    client.request("PATCH", path, json={"app_metadata": {"wajib_ganti_sandi": wajib}})
    lupakan_status(user_id)


def atur_ulang_sandi(client, user_id: str) -> str:
    sandi = buat_sandi_awal()
    _ubah_sandi(client, user_id, sandi, wajib=True)
    return sandi


def ganti_sandi_sendiri(client, user_id: str, sandi: str) -> None:
    _ubah_sandi(client, user_id, sandi, wajib=False)


def set_aktif(client, user_id: str, aktif: bool) -> dict:
    user = client.request("PATCH", f"/api/v2/users/{quote(user_id, safe='')}", json={"blocked": not aktif})
    lupakan_status(user_id)
    return _ringkas(user)
