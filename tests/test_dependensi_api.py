"""Setiap paket pihak ketiga yang diimpor kode api/ harus tercantum di api/requirements.txt.

Vercel (builds @vercel/python untuk api/index.py) hanya memasang api/requirements.txt, bukan requirements.txt
di akar repo. Insiden 2026-11-19: httpx hanya ada di berkas akar, sehingga seluruh /api produksi 500.
Tes ini cepat dan tanpa jaringan: mem-parse AST semua api/*.py (termasuk impor di dalam fungsi dan blok try).
Yang tidak terlihat di sini: dependensi lewat extra paket (mis. greenlet untuk sqlalchemy.ext.asyncio); itu
diperiksa scripts/uji-impor-bersih.sh dengan mengimpor setiap modul di venv bersih.
"""
import ast
import re
import sys
from pathlib import Path

import pytest

AKAR = Path(__file__).resolve().parents[1]
API = AKAR / "api"
REQ_API = API / "requirements.txt"

# Nama impor -> nama paket di PyPI, bila berbeda. Modul bawaan paket lain dianggap dari paket itu.
PETA_PAKET = {
    "jwt": "PyJWT",
    "multipart": "python-multipart",
    "python_multipart": "python-multipart",
    "google.auth": "google-auth",
    "google.oauth2": "google-auth",
    "googleapiclient": "google-api-python-client",
    "google_auth_httplib2": "google-auth-httplib2",
    "google_auth_oauthlib": "google-auth-oauthlib",
    "sqlalchemy": "SQLAlchemy",
    "xlsxwriter": "XlsxWriter",
    "yaml": "PyYAML",
    "PIL": "Pillow",
    "dateutil": "python-dateutil",
    "dotenv": "python-dotenv",
    "pydantic": "fastapi",  # dipasang sebagai dependensi fastapi
    "starlette": "fastapi",
}


def normal(nama: str) -> str:
    """Nama paket ternormal (PEP 503)."""
    return re.sub(r"[-_.]+", "-", nama).lower()


def paket_tercantum(teks: str) -> set:
    paket = set()
    for baris in teks.splitlines():
        baris = baris.split("#", 1)[0].strip()
        if not baris or baris.startswith("-"):
            continue
        cocok = re.match(r"[A-Za-z0-9][A-Za-z0-9._-]*", baris)
        if cocok:
            paket.add(normal(cocok.group(0)))
    return paket


def modul_lokal() -> set:
    return {p.stem for p in API.glob("*.py")} | {p.name for p in API.iterdir() if (p / "__init__.py").exists()}


def berkas_produksi() -> list:
    # api/test_*.py dikecualikan .vercelignore (tidak ikut deployment).
    return sorted(p for p in API.glob("*.py") if not p.name.startswith("test_"))


def stdlib() -> set:
    if not hasattr(sys, "stdlib_module_names"):
        pytest.skip("butuh Python 3.10+ (runtime resmi 3.12)")
    return set(sys.stdlib_module_names)


def nama_impor(sumber: str) -> set:
    """Nama modul absolut yang diimpor di mana pun dalam berkas (tingkat modul, fungsi, try/except)."""
    nama = set()
    for simpul in ast.walk(ast.parse(sumber)):
        if isinstance(simpul, ast.Import):
            nama |= {a.name for a in simpul.names}
        elif isinstance(simpul, ast.ImportFrom) and simpul.level == 0 and simpul.module:
            nama.add(simpul.module)
    return nama


def paket_untuk(modul: str) -> str:
    bagian = modul.split(".")
    for i in range(len(bagian), 0, -1):
        if ".".join(bagian[:i]) in PETA_PAKET:
            return PETA_PAKET[".".join(bagian[:i])]
    return bagian[0]


def paket_hilang(teks_requirements: str, berkas=None) -> dict:
    """{paket: [berkas yang mengimpornya]} untuk paket pihak ketiga yang tidak tercantum."""
    tercantum, lokal, bawaan = paket_tercantum(teks_requirements), modul_lokal(), stdlib()
    hilang: dict = {}
    for path in berkas or berkas_produksi():
        for modul in nama_impor(path.read_text(encoding="utf-8")):
            akar = modul.split(".")[0]
            if akar in bawaan or akar in lokal or akar == "api":
                continue
            paket = paket_untuk(modul)
            if normal(paket) not in tercantum:
                hilang.setdefault(paket, set()).add(path.name)
    return {k: sorted(v) for k, v in hilang.items()}


def test_semua_impor_pihak_ketiga_api_tercantum_di_api_requirements():
    assert paket_hilang(REQ_API.read_text(encoding="utf-8")) == {}


def test_pemeriksa_gagal_bila_httpx_dihapus_dari_api_requirements():
    """Bukti tes di atas menangkap insiden 2026-11-19: tanpa httpx, sesi_service terdeteksi."""
    teks = "\n".join(b for b in REQ_API.read_text(encoding="utf-8").splitlines()
                     if normal(re.split(r"[<>=\[ ;]", b.strip())[0] or "-") != "httpx")
    hilang = paket_hilang(teks)
    assert list(hilang) == ["httpx"] and "sesi_service.py" in hilang["httpx"]


def test_pemeriksa_menangkap_impor_di_fungsi_try_dan_nama_paket_berbeda(tmp_path):
    contoh = tmp_path / "contoh.py"
    contoh.write_text(
        "try:\n    import jwt\nexcept ImportError:\n    jwt = None\n"
        "def f():\n    from google.oauth2 import service_account\n    import multipart\n"
        "    from googleapiclient.discovery import build\n    import os, json\n"
        "    from starlette.concurrency import run_in_threadpool\n",
        encoding="utf-8")
    hilang = paket_hilang("fastapi>=0.110\n", berkas=[contoh])
    assert hilang == {"PyJWT": ["contoh.py"], "google-auth": ["contoh.py"], "python-multipart": ["contoh.py"],
                      "google-api-python-client": ["contoh.py"]}
    assert paket_hilang("fastapi\nPyJWT[crypto]>=2\ngoogle_auth\npython-multipart\ngoogle-api-python-client  # x\n",
                        berkas=[contoh]) == {}


def test_satu_sumber_dependensi_requirements_akar_dan_dev_memuat_api():
    """D1: tes lokal dan Vercel memasang paket API dari berkas yang sama."""
    for nama in ("requirements.txt", "requirements-dev.txt"):
        baris = [b.strip() for b in (AKAR / nama).read_text(encoding="utf-8").splitlines()]
        assert "-r api/requirements.txt" in baris, nama
    dev = paket_tercantum((AKAR / "requirements-dev.txt").read_text(encoding="utf-8"))
    assert {"pytest", "openpyxl"} <= dev
    # Paket API tidak diulang di berkas lain (satu sumber versi minimum).
    api = paket_tercantum(REQ_API.read_text(encoding="utf-8"))
    for nama in ("requirements.txt", "requirements-dev.txt"):
        assert not (api & paket_tercantum((AKAR / nama).read_text(encoding="utf-8"))), nama


def test_index_tidak_lagi_memakai_googleapiclient():
    """D3: jalur cadangan batchGet (googleapiclient) dihapus; paketnya tidak pernah terpasang di Vercel."""
    sumber = (API / "index.py").read_text(encoding="utf-8")
    assert not any(m.split(".")[0] == "googleapiclient" for m in nama_impor(sumber))
    nama = {s.name for s in ast.walk(ast.parse(sumber)) if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef))}
    assert "get_sheets_service" not in nama
