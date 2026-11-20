#!/usr/bin/env python3
"""Siapkan akun SAPA di produksi dalam satu perintah, dijalankan pemilik di terminalnya sendiri.

Pemakaian (dari akar repo):
    python3 scripts/siapkan-produksi-akun.py

Yang dikerjakan, berurutan, dan berhenti di langkah pertama yang gagal:
 1. Meminta token API Cloudflare lewat prompt tersembunyi (izin hanya "Workers Scripts: Edit" dan "D1: Edit",
    berumur pendek). Token hanya diteruskan ke wrangler lewat env proses anak, tidak pernah ditulis ke berkas.
 2. Membuat D1 "sapa-akun" bila belum ada, lalu menjalankan migrasinya (--remote).
 3. Men-deploy Worker sapa-akun dengan berkas konfigurasi sementara berisi database_id (bukan rahasia), yang
    dihapus lagi di akhir. wrangler.toml di repo tidak diubah.
 4. Bila D1 masih kosong (belum ada akun): membuat kunci baru SAPA_AKUN_HMAC, SAPA_AKUN_PEPPER,
    SAPA_AKUN_KUNCI_MAC, dan SAPA_SESI_KUNCI (masing-masing 32 byte acak, base64), lalu memasang SAPA_AKUN_HMAC
    sebagai secret Worker lewat stdin. Bila D1 sudah berisi akun, kunci TIDAK dibuat ulang (mengganti pepper atau
    kunci MAC membuat sandi yang ada tidak berlaku) dan skrip berhenti.
 5. Menjalankan uji negatif Worker (scripts/uji-worker-akun.py) dengan kunci baru. Lanjut hanya bila semua LULUS.
 6. Meminta token Vercel lewat prompt tersembunyi, lalu mengisi env Production proyek sapa-yanfaskes:
    keempat kunci (tipe sensitive) dan SAPA_AKUN_WORKER_URL. Nilai lama dengan nama sama ditimpa (aman, karena
    D1 masih kosong dan login lokal belum dinyalakan).
Salinan kunci sengaja TIDAK disimpan di mana pun (termasuk Keychain), supaya tidak ada proses lain di laptop yang
bisa membacanya. Bila SAPA_AKUN_HMAC hilang, jalankan ulang skrip ini selama D1 masih kosong, atau ikuti rotasi
di runbook. Bila pepper atau kunci MAC hilang, akun dibuat ulang (lihat runbook bagian pemulihan).

Kunci dan token tidak pernah dicetak, dicatat, atau ditulis ke berkas. Setelah selesai, cabut kedua token di
dasbor masing-masing. Skrip tidak menyalakan SAPA_LOGIN_BFF dan tidak membuat SAPA_KODE_PENYIAPAN; keduanya
langkah terpisah sesudah PR di-merge (lihat docs/runbook-login-bff.md).
"""
from __future__ import annotations

import base64
import getpass
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
DIR_WORKER = AKAR / "workers" / "sapa-akun"
NAMA_D1 = "sapa-akun"
WRANGLER = ["npx", "--yes", "wrangler@4"]
PROYEK_VERCEL = "sapa-yanfaskes"
TIM_VERCEL = "andreasnugroho10-5087s-projects"
NAMA_KUNCI = ("SAPA_AKUN_HMAC", "SAPA_AKUN_PEPPER", "SAPA_AKUN_KUNCI_MAC", "SAPA_SESI_KUNCI")
NAMA_URL = "SAPA_AKUN_WORKER_URL"
API_VERCEL = "https://api.vercel.com"
POLA_URL_WORKER = re.compile(r"https://sapa-akun\.[a-z0-9-]+\.workers\.dev")
POLA_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class Gagal(Exception):
    """Langkah gagal; pesan aman untuk dicetak (tanpa nilai rahasia)."""


def langkah(teks: str) -> None:
    print(f"\n== {teks}", flush=True)


def kunci_baru() -> str:
    return base64.b64encode(secrets.token_bytes(32)).decode()


def konfigurasi_sementara(isi_wrangler: str, database_id: str) -> str:
    """Isi wrangler.toml dengan database_id asli; satu-satunya baris yang diganti adalah database_id."""
    if not POLA_UUID.match(database_id):
        raise Gagal("database_id D1 tidak dikenali.")
    baru, jumlah = re.subn(r'(?m)^database_id\s*=\s*"[^"]*"\s*$', f'database_id = "{database_id}"', isi_wrangler)
    if jumlah != 1:
        raise Gagal("Baris database_id di wrangler.toml tidak ditemukan tepat satu kali.")
    return baru


def cari_url_worker(keluaran: str) -> str:
    cocok = POLA_URL_WORKER.search(keluaran)
    if not cocok:
        raise Gagal("Alamat Worker tidak ditemukan di keluaran wrangler deploy.")
    return cocok.group(0)


def muat_json(keluaran: str):
    """JSON dari keluaran wrangler; baris peringatan npx/wrangler di depannya dilewati."""
    try:
        return json.loads(keluaran)
    except json.JSONDecodeError:
        pass
    pengurai = json.JSONDecoder()
    for cocok in re.finditer(r"(?m)^[\[{]", keluaran):
        try:
            return pengurai.raw_decode(keluaran, cocok.start())[0]
        except json.JSONDecodeError:
            continue
    raise json.JSONDecodeError("tidak ada JSON", keluaran, 0)


def cari_id_d1(daftar_json: str) -> str | None:
    try:
        daftar = muat_json(daftar_json)
    except json.JSONDecodeError as exc:
        raise Gagal("Keluaran wrangler d1 list tidak bisa dibaca.") from exc
    for db in daftar if isinstance(daftar, list) else []:
        if isinstance(db, dict) and db.get("name") == NAMA_D1:
            return str(db.get("uuid") or db.get("database_id") or "") or None
    return None


def jumlah_akun_dari_json(keluaran: str) -> int:
    """Membaca hasil `wrangler d1 execute --json` untuk SELECT COUNT(*) AS n."""
    try:
        data = muat_json(keluaran)
        baris = data[0]["results"][0]
        return int(baris["n"])
    except (json.JSONDecodeError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise Gagal("Jumlah akun di D1 tidak bisa dibaca.") from exc


def isian_env_vercel(nama: str, nilai: str, sensitif: bool) -> dict:
    return {"key": nama, "value": nilai, "type": "sensitive" if sensitif else "plain", "target": ["production"]}


def jalankan(perintah: list, *, env: dict | None = None, masukan: str | None = None, cwd: Path = DIR_WORKER,
             tampilkan: bool = True) -> str:
    hasil = subprocess.run(perintah, cwd=cwd, env=env, input=masukan, capture_output=True, text=True)
    keluaran = (hasil.stdout or "") + (hasil.stderr or "")
    if tampilkan:
        # Keluaran wrangler tidak memuat token maupun nilai secret yang dikirim lewat stdin.
        print(keluaran.strip()[-2000:])
    if hasil.returncode != 0:
        raise Gagal(f"Perintah gagal: {' '.join(perintah[:4])} ... (kode {hasil.returncode})")
    return keluaran


def panggil_vercel(token: str, metode: str, jalur: str, isi: dict | None = None) -> dict:
    url = f"{API_VERCEL}{jalur}{'&' if '?' in jalur else '?'}slug={urllib.parse.quote(TIM_VERCEL)}"
    data = json.dumps(isi).encode() if isi is not None else None
    permintaan = urllib.request.Request(url, data=data, method=metode, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "siapkan-produksi-akun"})
    try:
        with urllib.request.urlopen(permintaan, timeout=20) as res:
            return json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raise Gagal(f"API Vercel menjawab {exc.code} untuk {metode} {jalur.split('?')[0]}.") from None
    except urllib.error.URLError as exc:
        raise Gagal("API Vercel tidak terjangkau.") from exc


def isi_env_vercel(token: str, nilai: dict) -> None:
    jalur_env = f"/v10/projects/{PROYEK_VERCEL}/env"
    ada = panggil_vercel(token, "GET", f"{jalur_env}?decrypt=false").get("envs", [])
    for nama, (isi, sensitif) in nilai.items():
        lama = [e for e in ada if e.get("key") == nama and "production" in (e.get("target") or [])]
        if lama:
            for e in lama:
                panggil_vercel(token, "DELETE", f"/v9/projects/{PROYEK_VERCEL}/env/{e['id']}")
        panggil_vercel(token, "POST", jalur_env, isian_env_vercel(nama, isi, sensitif))
        print(f"   {nama}: {'diganti' if lama else 'ditambahkan'} (Production)")


def utama() -> int:
    if not (DIR_WORKER / "wrangler.toml").exists():
        print("Jalankan dari salinan repo yang memuat workers/sapa-akun.", file=sys.stderr)
        return 2
    if not sys.stdin.isatty():
        print("Jalankan dari Terminal interaktif supaya token tidak tampil di layar.", file=sys.stderr)
        return 2
    for alat in ("npx", "node"):
        if not shutil.which(alat):
            print(f"Perintah {alat} tidak ditemukan.", file=sys.stderr)
            return 2

    konfig = DIR_WORKER / "wrangler.produksi.toml"
    try:
        langkah("1. Token Cloudflare (Workers Scripts: Edit, D1: Edit; berumur pendek)")
        token_cf = getpass.getpass("Token API Cloudflare (tidak ditampilkan): ").strip()
        if not token_cf:
            raise Gagal("Token Cloudflare kosong.")
        env_cf = {**os.environ, "CLOUDFLARE_API_TOKEN": token_cf, "WRANGLER_SEND_METRICS": "false"}

        langkah("2. D1 sapa-akun")
        id_d1 = cari_id_d1(jalankan([*WRANGLER, "d1", "list", "--json"], env=env_cf, tampilkan=False))
        if not id_d1:
            jalankan([*WRANGLER, "d1", "create", NAMA_D1], env=env_cf)
            id_d1 = cari_id_d1(jalankan([*WRANGLER, "d1", "list", "--json"], env=env_cf, tampilkan=False))
        if not id_d1:
            raise Gagal("D1 sapa-akun tidak ditemukan setelah dibuat.")
        konfig.write_text(konfigurasi_sementara((DIR_WORKER / "wrangler.toml").read_text(), id_d1))
        jalankan([*WRANGLER, "d1", "migrations", "apply", NAMA_D1, "--remote", "--config", konfig.name], env=env_cf,
                 masukan="y\n")
        jumlah = jumlah_akun_dari_json(jalankan(
            [*WRANGLER, "d1", "execute", NAMA_D1, "--remote", "--json", "--config", konfig.name,
             "--command", "SELECT COUNT(*) AS n FROM akun_sapa"], env=env_cf, tampilkan=False))
        if jumlah > 0:
            raise Gagal("D1 sudah berisi akun. Kunci tidak dibuat ulang supaya sandi yang ada tetap berlaku; "
                        "untuk rotasi kunci ikuti runbook.")

        langkah("3. Deploy Worker")
        url_worker = cari_url_worker(jalankan([*WRANGLER, "deploy", "--config", konfig.name], env=env_cf))

        langkah("4. Kunci baru dan secret Worker")
        kunci = {nama: kunci_baru() for nama in NAMA_KUNCI}
        jalankan([*WRANGLER, "secret", "put", "SAPA_AKUN_HMAC", "--config", konfig.name], env=env_cf,
                 masukan=kunci["SAPA_AKUN_HMAC"] + "\n")
        del token_cf, env_cf
        print("   Token Cloudflare tidak dipakai lagi. Cabut token itu di dasbor Cloudflare.")

        langkah(f"5. Uji negatif Worker ({url_worker})")
        time.sleep(5)  # memberi waktu secret dan deploy tersebar
        uji = subprocess.run([sys.executable, str(AKAR / "scripts" / "uji-worker-akun.py"), url_worker],
                             env={**os.environ, "SAPA_AKUN_HMAC": kunci["SAPA_AKUN_HMAC"]}, capture_output=True,
                             text=True)
        print(uji.stdout.strip())
        if uji.returncode != 0:
            raise Gagal("Uji negatif Worker tidak lulus semua; env Vercel tidak diubah.")

        langkah("6. Env Vercel Production")
        token_vc = getpass.getpass("Token Vercel (tidak ditampilkan): ").strip()
        if not token_vc:
            raise Gagal("Token Vercel kosong.")
        isi_env_vercel(token_vc, {**{nama: (nilai, True) for nama, nilai in kunci.items()},
                                  NAMA_URL: (url_worker, False)})
        del token_vc
        print("   Token Vercel tidak dipakai lagi. Cabut token itu di dasbor Vercel.")

        del kunci

        langkah("Selesai")
        print(f"Alamat Worker: {url_worker}")
        print("Kirim alamat itu dan ringkasan uji di atas ke tim (tanpa kunci). Login lokal belum menyala.")
        return 0
    except Gagal as exc:
        print(f"\nBERHENTI: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nDibatalkan.", file=sys.stderr)
        return 1
    finally:
        konfig.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(utama())
