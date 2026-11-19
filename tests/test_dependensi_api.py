"""Setiap paket pihak ketiga yang diimpor kode api/ harus tercantum di api/requirements.txt.

Vercel (builds @vercel/python untuk api/index.py) hanya memasang api/requirements.txt, bukan requirements.txt
di akar repo. Insiden 2026-11-19: httpx hanya ada di berkas akar, sehingga seluruh /api produksi 500.
Tes ini cepat dan tanpa jaringan: mem-parse AST semua api/*.py (termasuk impor di dalam fungsi dan blok try).
Yang tidak terlihat di sini: dependensi lewat extra paket (mis. greenlet untuk sqlalchemy.ext.asyncio); itu
diperiksa scripts/uji-impor-bersih.sh dengan mengimpor setiap modul di venv bersih.
"""
import ast
import importlib.util
import re
import sys
import sysconfig
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


# Modul tingkat atas pustaka standar Python 3.9 (termasuk modul khusus Windows dan Linux), dipakai bila
# sys.stdlib_module_names belum ada (baru sejak 3.10). Hanya nama publik; impor bernama _x tidak dipakai api/.
STDLIB_CADANGAN = frozenset("""
__future__ abc aifc antigravity argparse array ast asynchat asyncio asyncore atexit audioop base64 bdb
binascii binhex bisect builtins bz2 cProfile calendar cgi cgitb chunk cmath cmd code codecs codeop collections
colorsys compileall concurrent configparser contextlib contextvars copy copyreg crypt csv ctypes curses
dataclasses datetime dbm decimal difflib dis distutils doctest email encodings ensurepip enum errno
faulthandler fcntl filecmp fileinput fnmatch formatter fractions ftplib functools gc genericpath getopt getpass
gettext glob graphlib grp gzip hashlib heapq hmac html http imaplib imghdr imp importlib inspect io ipaddress
itertools json keyword lib2to3 linecache locale logging lzma mailbox mailcap marshal math mimetypes mmap
modulefinder msilib msvcrt multiprocessing netrc nis nntplib nt ntpath nturl2path numbers opcode operator
optparse os ossaudiodev parser pathlib pdb pickle pickletools pipes pkgutil platform plistlib poplib posix
posixpath pprint profile pstats pty pwd py_compile pyclbr pydoc pydoc_data pyexpat queue quopri random re
readline reprlib resource rlcompleter runpy sched secrets select selectors shelve shlex shutil signal site
smtpd smtplib sndhdr socket socketserver spwd sqlite3 sre_compile sre_constants sre_parse ssl stat statistics
string stringprep struct subprocess sunau symbol symtable sys sysconfig syslog tabnanny tarfile telnetlib
tempfile termios textwrap this threading time timeit tkinter token tokenize trace traceback tracemalloc tty
turtle turtledemo types typing unicodedata unittest urllib uu uuid venv warnings wave weakref webbrowser
winreg winsound wsgiref xdrlib xml xmlrpc xxlimited xxsubtype zipapp zipfile zipimport zlib zoneinfo
""".split())


def stdlib() -> set:
    """Nama modul pustaka standar: dari runtime (3.10+), atau STDLIB_CADANGAN untuk Python 3.9."""
    return set(getattr(sys, "stdlib_module_names", ())) or set(STDLIB_CADANGAN)


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
    """Tes lokal dan Vercel memasang paket API dari berkas yang sama."""
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
    """Jalur cadangan batchGet (googleapiclient) dihapus; paketnya tidak pernah terpasang di Vercel."""
    sumber = (API / "index.py").read_text(encoding="utf-8")
    assert not any(m.split(".")[0] == "googleapiclient" for m in nama_impor(sumber))
    nama = {s.name for s in ast.walk(ast.parse(sumber)) if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef))}
    assert "get_sheets_service" not in nama


def _modul_stdlib_diimpor_api() -> set:
    """Nama tingkat atas yang diimpor api/*.py dan ada di pustaka standar runtime ini (lewat find_spec)."""
    pustaka = Path(sysconfig.get_paths()["stdlib"]).resolve()
    nama = set()
    for path in berkas_produksi():
        for modul in nama_impor(path.read_text(encoding="utf-8")):
            akar = modul.split(".")[0]
            spec = importlib.util.find_spec(akar)
            if spec is None:
                continue
            asal = spec.origin or ""
            if asal in ("built-in", "frozen") or (asal and pustaka in Path(asal).resolve().parents):
                nama.add(akar)
    return nama


def test_stdlib_cadangan_mencakup_modul_bawaan_yang_diimpor_api():
    """Daftar cadangan (Python 3.9) mencakup setiap modul pustaka standar yang diimpor api/*.py."""
    diimpor = _modul_stdlib_diimpor_api()
    assert {"asyncio", "json", "os"} <= diimpor
    assert diimpor <= STDLIB_CADANGAN
    if hasattr(sys, "stdlib_module_names"):
        assert diimpor <= set(sys.stdlib_module_names)


def test_pemeriksa_dengan_stdlib_cadangan_sama_dengan_runtime(monkeypatch):
    teks = REQ_API.read_text(encoding="utf-8")
    runtime = paket_hilang(teks)
    monkeypatch.delattr(sys, "stdlib_module_names", raising=False)
    assert stdlib() == set(STDLIB_CADANGAN)
    assert paket_hilang(teks) == runtime == {}
