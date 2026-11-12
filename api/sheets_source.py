"""Membaca Google Sheets lewat akun layanan (Sheets API v4, hanya-baca).

Semua pengambil data mencoba jalur ini lebih dulu. Bila akun layanan belum
dikonfigurasi atau belum diberi akses ke sebuah lembar, fungsi mengembalikan
None dan pemanggil memakai jalur lamanya.
"""
import base64
import csv
import io
import json
import logging
import os
import re
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

logger = logging.getLogger("sapa-api")

SCOPES = ("https://www.googleapis.com/auth/spreadsheets.readonly",)
API_ROOT = "https://sheets.googleapis.com/v4/spreadsheets"
_SPREADSHEET_ID = re.compile(r"[A-Za-z0-9_-]{20,100}")
_TIMEOUT = (4, 15)
_TITLES_TTL = 3600

_credentials: Any = None
_credentials_lock = threading.Lock()
_local = threading.local()
# spreadsheet_id -> (waktu, [(gid, judul lembar)]) menurut urutan tab.
_titles: Dict[str, Tuple[float, List[Tuple[int, str]]]] = {}


class SheetsReadError(Exception):
    """Lembar tidak bisa dibaca lewat akun layanan."""


def _service_account_info() -> Optional[dict]:
    raw = os.environ.get("GCP_SA_CREDENTIALS_BASE64") or os.environ.get("GCP_SA_CREDENTIALS_JSON")
    if not raw:
        return None
    for decode in (lambda value: base64.b64decode(value, validate=True).decode("utf-8"), lambda value: value):
        try:
            info = json.loads(decode(raw))
        except Exception:
            continue
        if isinstance(info, dict):
            return info
    logger.error("Kredensial akun layanan Sheets tidak bisa dibaca")
    return None


def _get_session():
    """Sesi HTTP bertoken untuk utas ini, atau None bila akun layanan belum dikonfigurasi."""
    global _credentials
    session = getattr(_local, "session", None)
    if session is not None:
        return session
    try:
        with _credentials_lock:
            if _credentials is None:
                info = _service_account_info()
                if not info:
                    return None
                from google.oauth2 import service_account
                _credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
        from google.auth.transport.requests import AuthorizedSession
        _local.session = AuthorizedSession(_credentials)
        return _local.session
    except Exception as exc:
        logger.error("Akun layanan Sheets tidak bisa disiapkan: %s", type(exc).__name__)
        return None


def _get_json(session, url: str, params: Dict[str, str]) -> dict:
    response = session.get(url, params=params, timeout=_TIMEOUT)
    if response.status_code != 200:
        raise SheetsReadError(f"HTTP {response.status_code}")
    return response.json()


def _sheet_title(session, spreadsheet_id: str, gid) -> Optional[str]:
    now = time.time()
    cached = _titles.get(spreadsheet_id)
    if not cached or now - cached[0] >= _TITLES_TTL:
        data = _get_json(session, f"{API_ROOT}/{spreadsheet_id}", {"fields": "sheets.properties(sheetId,title,index)"})
        tabs = sorted((sheet.get("properties", {}) for sheet in data.get("sheets", [])), key=lambda tab: tab.get("index", 0))
        cached = (now, [(int(tab["sheetId"]), str(tab["title"])) for tab in tabs if "sheetId" in tab and "title" in tab])
        _titles[spreadsheet_id] = cached
    tabs = cached[1]
    if gid is None or str(gid).strip() == "":
        return tabs[0][1] if tabs else None
    wanted = int(str(gid).strip())
    return next((title for tab_gid, title in tabs if tab_gid == wanted), None)


def read_sheet_csv(spreadsheet_id: str, gid=None, label: str = "") -> Optional[bytes]:
    """Isi satu lembar sebagai CSV UTF-8, atau None bila tidak terbaca lewat akun layanan.

    `gid` kosong berarti tab pertama, sama seperti ekspor CSV tanpa gid.
    """
    name = label or "lembar"
    if not isinstance(spreadsheet_id, str) or not _SPREADSHEET_ID.fullmatch(spreadsheet_id):
        return None
    session = _get_session()
    if session is None:
        return None
    try:
        title = _sheet_title(session, spreadsheet_id, gid)
        if not title:
            raise SheetsReadError("tab tidak ditemukan")
        a1_range = "'" + title.replace("'", "''") + "'"
        data = _get_json(
            session,
            f"{API_ROOT}/{spreadsheet_id}/values/{quote(a1_range, safe='')}",
            {"majorDimension": "ROWS", "valueRenderOption": "FORMATTED_VALUE"},
        )
        rows = data.get("values") or []
        if not rows:
            raise SheetsReadError("tab kosong")
        # API memangkas sel kosong di ujung baris; ekspor CSV tidak. Samakan lebarnya.
        width = max(len(row) for row in rows)
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        for row in rows:
            writer.writerow([str(cell) for cell in row] + [""] * (width - len(row)))
        logger.info("Sheets %s dibaca lewat akun layanan (%d baris)", name, len(rows))
        return buffer.getvalue().encode("utf-8")
    except Exception as exc:
        reason = str(exc) if isinstance(exc, SheetsReadError) else type(exc).__name__
        logger.warning("Sheets %s tidak terbaca lewat akun layanan (%s); memakai jalur lama", name, reason)
        return None
