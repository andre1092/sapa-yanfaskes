"""Berkas tetap di Google Drive: data SSBI Kesesuaian Jadwal Praktik Dokter FKRTL dan Surat Kontrol.

Setiap data punya env ID berkasnya sendiri (parameter `env`).

Berkas dibuat CEO dan hanya berkas itu yang dibagikan ke akun layanan. Server tidak pernah membuat
berkas baru (akun layanan tidak punya kuota My Drive); integrasi menimpa isi berkas lewat files.update,
jadi penggantian bersifat atomik: gagal di tengah = isi lama tetap.

- Jalur baca memakai akun layanan baca (GCP_SA_CREDENTIALS_*) dengan scope drive.readonly.
- Jalur tulis memakai akun layanan tulis tersendiri (GCP_SA_DRIVE_TULIS_BASE64) dengan scope drive,
  dan hanya dipanggil dari endpoint integrasikan. Kunci tidak pernah dicatat di log.
"""
import base64
import json
import logging
import os
import re
import threading
import uuid
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("sapa-api")

ENV_FILE_ID = "SSBI_JADWAL_DRIVE_FILE_ID"
ENV_SURAT_KONTROL = "SURAT_KONTROL_DRIVE_FILE_ID"  # menu Monitoring Penerbitan Surat Kontrol
ENV_SURAT_KONTROL_DETAIL = "SURAT_KONTROL_DETAIL_DRIVE_FILE_ID"  # Download Detail SRK (tanpa nomor)
ENV_KUNCI_TULIS = "GCP_SA_DRIVE_TULIS_BASE64"
_ENV_KUNCI_BACA = ("GCP_SA_CREDENTIALS_BASE64", "GCP_SA_CREDENTIALS_JSON")
SCOPE_BACA = ("https://www.googleapis.com/auth/drive.readonly",)
SCOPE_TULIS = ("https://www.googleapis.com/auth/drive",)
API = "https://www.googleapis.com/drive/v3/files"
UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
_FILE_ID = re.compile(r"[A-Za-z0-9_-]{20,100}")
_FIELDS = "id,md5Checksum,modifiedTime,size,properties"
_TIMEOUT = (5, 30)

_sesi: Dict[str, Any] = {}
_sesi_lock = threading.Lock()


class DriveBelumSiap(Exception):
    """ID berkas atau kunci akun layanan belum diisi."""


class DriveGagal(Exception):
    """Drive menjawab selain 200."""


def file_id(env: str = ENV_FILE_ID) -> str:
    nilai = (os.environ.get(env) or "").strip()
    if not _FILE_ID.fullmatch(nilai):
        raise DriveBelumSiap()
    return nilai


def _info_kunci(raw: Optional[str]) -> Optional[dict]:
    if not raw:
        return None
    for decode in (lambda v: base64.b64decode(v, validate=True).decode("utf-8"), lambda v: v):
        try:
            info = json.loads(decode(raw))
        except Exception:
            continue
        if isinstance(info, dict):
            return info
    return None


def _session(jenis: str):
    with _sesi_lock:
        if jenis in _sesi:
            return _sesi[jenis]
        if jenis == "tulis":
            info, scopes = _info_kunci(os.environ.get(ENV_KUNCI_TULIS)), SCOPE_TULIS
        else:
            raw = next((os.environ.get(n) for n in _ENV_KUNCI_BACA if os.environ.get(n)), None)
            info, scopes = _info_kunci(raw), SCOPE_BACA
        if not info:
            raise DriveBelumSiap()
        try:
            from google.oauth2 import service_account
            from google.auth.transport.requests import AuthorizedSession
            sesi = AuthorizedSession(service_account.Credentials.from_service_account_info(info, scopes=scopes))
        except Exception as exc:
            logger.error("Akun layanan Drive (%s) tidak bisa disiapkan: %s", jenis, type(exc).__name__)
            raise DriveBelumSiap() from None
        _sesi[jenis] = sesi
        return sesi


def _cek(resp, apa: str):
    if resp.status_code != 200:
        logger.error("Drive %s gagal: HTTP %s", apa, resp.status_code)
        raise DriveGagal(apa)
    return resp


def info(env: str = ENV_FILE_ID) -> dict:
    """Metadata berkas: versi (md5/modifiedTime), ukuran, dan properti ringkasan unggahan."""
    fid = file_id(env)
    data = _cek(_session("baca").get(f"{API}/{fid}", params={"fields": _FIELDS, "supportsAllDrives": "true"},
                                     timeout=_TIMEOUT), "info").json()
    return {"versi": data.get("md5Checksum") or data.get("modifiedTime") or "", "ukuran": int(data.get("size") or 0),
            "properti": data.get("properties") or {}}


def unduh(env: str = ENV_FILE_ID) -> bytes:
    fid = file_id(env)
    return _cek(_session("baca").get(f"{API}/{fid}", params={"alt": "media", "supportsAllDrives": "true"},
                                     timeout=_TIMEOUT), "unduh").content


def tulis(isi: bytes, properti: Dict[str, str], env: str = ENV_FILE_ID) -> Tuple[str, dict]:
    """Menimpa isi berkas tetap sekaligus propertinya dalam satu permintaan multipart."""
    fid = file_id(env)
    batas = uuid.uuid4().hex
    meta = json.dumps({"mimeType": "application/gzip", "properties": properti}).encode("utf-8")
    body = b"".join([
        f"--{batas}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode(), meta,
        f"\r\n--{batas}\r\nContent-Type: application/gzip\r\n\r\n".encode(), isi, f"\r\n--{batas}--\r\n".encode(),
    ])
    resp = _session("tulis").patch(
        f"{UPLOAD}/{fid}", params={"uploadType": "multipart", "fields": _FIELDS, "supportsAllDrives": "true"},
        data=body, headers={"Content-Type": f"multipart/related; boundary={batas}"}, timeout=(5, 60))
    data = _cek(resp, "tulis").json()
    return data.get("md5Checksum") or data.get("modifiedTime") or "", data.get("properties") or {}
