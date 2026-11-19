#!/usr/bin/env bash
# Uji impor bersih (tindak lanjut insiden httpx 2026-11-19).
#
# Membuat venv sementara HANYA dari api/requirements.txt (berkas yang dipasang Vercel), lalu mengimpor
# api/index.py persis cara Vercel: direktori api/ di sys.path, lalu "import index". Dijalankan dua kali,
# SAPA_LOGIN_BFF=0 dan SAPA_LOGIN_BFF=1. Lingkungan dikosongkan (env -i, python -I): tidak ada .env, rahasia,
# PYTHONPATH, atau paket dari venv lain yang ikut terbaca.
#
# Pemakaian:
#   scripts/uji-impor-bersih.sh                         # paket diunduh dari PyPI bila belum ada di cache
#   UJI_IMPOR_OFFLINE=1 scripts/uji-impor-bersih.sh     # hanya cache uv, tanpa jaringan
#   UJI_IMPOR_PYTHON=3.12 scripts/uji-impor-bersih.sh   # versi Python (bawaan 3.12, sama dengan Vercel)
# Keluar dengan kode bukan 0 bila venv tidak bisa dibuat atau impor gagal.
set -euo pipefail

AKAR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${UJI_IMPOR_PYTHON:-3.12}"
SEMENTARA="$(mktemp -d "${TMPDIR:-/tmp}/sapa-uji-impor.XXXXXX")"
trap 'rm -rf "$SEMENTARA"' EXIT
VENV="$SEMENTARA/venv"

if [ "${UJI_IMPOR_OFFLINE:-0}" = "1" ]; then
  export UV_OFFLINE=1 UV_PYTHON_DOWNLOADS=never
fi

echo "== venv sementara Python $PY dari api/requirements.txt saja"
if command -v uv >/dev/null 2>&1; then
  uv venv --quiet --python "$PY" "$VENV"
  uv pip install --quiet --python "$VENV/bin/python" -r "$AKAR/api/requirements.txt"
else
  if [ "${UJI_IMPOR_OFFLINE:-0}" = "1" ]; then
    echo "uv tidak ditemukan; mode offline butuh uv" >&2
    exit 2
  fi
  "python$PY" -m venv "$VENV"
  "$VENV/bin/pip" install --quiet -r "$AKAR/api/requirements.txt"
fi

for FLAG in 0 1; do
  (cd "$SEMENTARA" && env -i PATH="/usr/bin:/bin" HOME="$SEMENTARA" SAPA_LOGIN_BFF="$FLAG" \
    "$VENV/bin/python" -I -B - "$AKAR/api" "$FLAG" <<'PY'
import sys

api, flag = sys.argv[1], sys.argv[2]
sys.path.insert(0, api)  # seperti Vercel: api/index.py dimuat sebagai modul tingkat atas "index"
import index  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

assert index.LOGIN_BFF == (flag == "1"), f"LOGIN_BFF tidak sesuai SAPA_LOGIN_BFF={flag}"
klien = TestClient(index.app, base_url="https://localhost")
sehat = klien.get("/api/v1/health").status_code
assert sehat == 200, f"health {sehat}"
# Rute login BFF hanya ada bila flag 1: GET /masuk menjawab 405 (rute ada, metode salah), selain itu 404.
masuk = klien.get("/api/v1/auth/masuk").status_code
assert masuk == (405 if flag == "1" else 404), f"GET /api/v1/auth/masuk {masuk} dengan SAPA_LOGIN_BFF={flag}"
print(f"SAPA_LOGIN_BFF={flag}: import index berhasil (Python {sys.version.split()[0]}); health {sehat}, "
      f"GET /api/v1/auth/masuk {masuk}")
PY
  )
done

# Impor yang gagal di api/index.py sering ditelan "except Exception" (mis. db.get_db jatuh ke stub), jadi
# "import index" saja tidak cukup. Di sini setiap modul pihak ketiga yang diimpor api/*.py (AST, termasuk impor
# di dalam fungsi dan blok try) diimpor langsung di venv bersih. Ini juga menangkap dependensi lewat extra
# (mis. greenlet untuk sqlalchemy.ext.asyncio) yang tidak terlihat oleh tests/test_dependensi_api.py.
echo "== impor langsung setiap modul pihak ketiga api/*.py"
(cd "$SEMENTARA" && env -i PATH="/usr/bin:/bin" HOME="$SEMENTARA" \
  "$VENV/bin/python" -I -B - "$AKAR/api" <<'PY'
import ast
import importlib
import sys
from pathlib import Path

api = Path(sys.argv[1])
sys.path.insert(0, str(api))
# Gagal yang sudah diketahui dan diterima, dengan alasannya. Bila salah satunya mulai berhasil, hapus dari sini.
DIKETAHUI = {
    # SQLAlchemy 2.1 memasang greenlet hanya lewat extra [asyncio]; extra itu belum dipasang di
    # api/requirements.txt.
    "sqlalchemy.ext.asyncio": "greenlet belum terpasang",
}
lokal = {p.stem for p in api.glob("*.py")} | {p.name for p in api.iterdir() if (p / "__init__.py").exists()}
lokal.add("api")  # impor paket api.* dari tes di dalam api/
modul = set()
# Sama dengan tests/test_dependensi_api.py: berkas tes (test_*.py) bukan jalur produksi.
for berkas in sorted(p for p in api.glob("*.py") if not p.name.startswith("test_")):
    for simpul in ast.walk(ast.parse(berkas.read_text(encoding="utf-8"))):
        if isinstance(simpul, ast.Import):
            modul |= {a.name for a in simpul.names}
        elif isinstance(simpul, ast.ImportFrom) and simpul.level == 0 and simpul.module:
            modul.add(simpul.module)
pihak_ketiga = sorted(m for m in modul
                      if m.split(".")[0] not in sys.stdlib_module_names and m.split(".")[0] not in lokal
                      and m.split(".")[0] != "__future__")
gagal = {}
for m in pihak_ketiga:
    try:
        importlib.import_module(m)
    except Exception as exc:
        gagal[m] = f"{type(exc).__name__}: {str(exc)[:120]}"
for m, alasan in sorted(DIKETAHUI.items()):
    if m in gagal:
        print(f"diketahui gagal: {m} ({alasan})")
    else:
        print(f"catatan: {m} kini berhasil diimpor; hapus dari DIKETAHUI")
baru = {m: g for m, g in gagal.items() if m not in DIKETAHUI}
for m, g in sorted(baru.items()):
    print(f"GAGAL: {m}: {g}")
print(f"{len(pihak_ketiga)} modul pihak ketiga diperiksa, {len(baru)} gagal baru")
sys.exit(1 if baru else 0)
PY
)
echo "== uji impor bersih lulus"
