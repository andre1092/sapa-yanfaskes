#!/usr/bin/env python3
"""Uji negatif Worker sapa-akun di produksi, dijalankan pemilik di terminalnya sendiri (hanya pustaka standar).

Pemakaian:
    python3 scripts/uji-worker-akun.py https://sapa-akun.<subdomain>.workers.dev

Kunci HMAC dibaca dari env SAPA_AKUN_HMAC bila ada, selain itu dari prompt tersembunyi (getpass). Kunci tidak
pernah dicetak, dicatat, atau ditulis ke berkas. Hanya operasi yang aman saat D1 kosong maupun berisi yang dipakai:
akun/jumlah dan kode/terpakai (baca), serta akun/ganti-hash untuk id akun acak yang tidak ada (UPDATE tidak
mengenai baris mana pun). Tidak ada akun yang dibuat atau diubah.

Kasus yang diuji (semua harus LULUS):
    kontrol_baca    tanda tangan sah ke akun/jumlah -> 200
    kode_uji        kode/terpakai dengan hash uji acak -> 200, terpakai false
    tanpa_tanda     tanpa header tanda tangan -> 401
    tanda_salah     tanda tangan dengan kunci lain -> 401
    waktu_lewat     timestamp 120 detik lalu (di luar 60 detik) -> 401
    nonce_ganda     operasi tulis dua kali dengan nonce yang sama -> yang kedua 401
    path_asing      path yang tidak dikenal -> 404
    body_diubah     body diubah setelah ditandatangani -> 401
Keluar dengan kode 0 bila semua lulus, 1 bila ada yang gagal, 2 bila argumen atau kunci tidak sah.
"""
import base64
import binascii
import getpass
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
import uuid

AWALAN = "sapa-akun-v1"


def kanonik(metode: str, path: str, waktu: str, nonce: str, body: bytes) -> str:
    return "\n".join([AWALAN, metode, path, waktu, nonce, hashlib.sha256(body).hexdigest()])


def kirim(dasar: str, path: str, body: bytes, rahasia_hmac: bytes, *, nonce: str = "", waktu=None,
          tanpa_tanda: bool = False, body_kirim=None) -> tuple:
    waktu = str(int(time.time()) if waktu is None else waktu)
    header = {"Content-Type": "application/json", "User-Agent": "uji-worker-akun"}
    if not tanpa_tanda:
        header["X-Sapa-Waktu"] = waktu
        header["X-Sapa-Tanda"] = hmac.new(rahasia_hmac, kanonik("POST", path, waktu, nonce, body).encode(),
                                          hashlib.sha256).hexdigest()
        if nonce:
            header["X-Sapa-Nonce"] = nonce
    permintaan = urllib.request.Request(dasar + path, data=body if body_kirim is None else body_kirim,
                                        headers=header, method="POST")
    try:
        with urllib.request.urlopen(permintaan, timeout=10) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, None


def json_bytes(isi: dict) -> bytes:
    return json.dumps(isi, sort_keys=True, separators=(",", ":")).encode()


def main() -> int:
    if len(sys.argv) != 2 or not sys.argv[1].startswith("https://"):
        print("Pemakaian: python3 scripts/uji-worker-akun.py https://<alamat Worker>", file=sys.stderr)
        return 2
    dasar = sys.argv[1].rstrip("/")
    mentah = os.environ.get("SAPA_AKUN_HMAC") or getpass.getpass("SAPA_AKUN_HMAC (tidak ditampilkan): ")
    try:
        rahasia_hmac = base64.b64decode(mentah.strip(), validate=True)
    except (binascii.Error, ValueError):
        rahasia_hmac = b""
    del mentah
    if len(rahasia_hmac) < 32:
        print("Kunci tidak sah (harus base64, minimal 32 byte).", file=sys.stderr)
        return 2
    kunci_palsu = secrets.token_bytes(32)
    kosong = json_bytes({})
    hasil = []

    def periksa(nama: str, lulus: bool, keterangan: str) -> None:
        hasil.append(lulus)
        print(f"{'LULUS' if lulus else 'GAGAL'}  {nama:<13} {keterangan}")

    status, isi = kirim(dasar, "/akun/jumlah", kosong, rahasia_hmac)
    periksa("kontrol_baca", status == 200 and isinstance((isi or {}).get("jumlah"), int), f"status {status}")
    status, isi = kirim(dasar, "/kode/terpakai", json_bytes({"hash_kode": secrets.token_hex(32)}), rahasia_hmac)
    periksa("kode_uji", status == 200 and (isi or {}).get("terpakai") is False, f"status {status}")
    status, _ = kirim(dasar, "/akun/jumlah", kosong, rahasia_hmac, tanpa_tanda=True)
    periksa("tanpa_tanda", status == 401, f"status {status}")
    status, _ = kirim(dasar, "/akun/jumlah", kosong, kunci_palsu)
    periksa("tanda_salah", status == 401, f"status {status}")
    status, _ = kirim(dasar, "/akun/jumlah", kosong, rahasia_hmac, waktu=int(time.time()) - 120)
    periksa("waktu_lewat", status == 401, f"status {status}")
    # Id acak yang tidak ada: UPDATE tidak mengenai baris mana pun, jadi aman di produksi.
    tulis = json_bytes({"id": str(uuid.uuid4()), "versi_lama": 1, "versi_baru": 2, "hash_kode": None, "jenis": None,
                        "hash": "$argon2id$v=19$m=19456,t=2,p=1$" + "A" * 22 + "$" + "B" * 43, "mac": "0" * 64})
    nonce = secrets.token_hex(16)
    pertama, _ = kirim(dasar, "/akun/ganti-hash", tulis, rahasia_hmac, nonce=nonce)
    kedua, _ = kirim(dasar, "/akun/ganti-hash", tulis, rahasia_hmac, nonce=nonce)
    periksa("nonce_ganda", pertama == 200 and kedua == 401, f"pertama {pertama}, kedua {kedua}")
    status, _ = kirim(dasar, "/akun/hapus-semua", kosong, rahasia_hmac)
    periksa("path_asing", status == 404, f"status {status}")
    status, _ = kirim(dasar, "/akun/ambil-username", json_bytes({"username": "uji-tidak-ada"}), rahasia_hmac,
                      body_kirim=json_bytes({"username": "uji-lain"}))
    periksa("body_diubah", status == 401, f"status {status}")
    print(f"{sum(hasil)}/{len(hasil)} lulus")
    return 0 if all(hasil) else 1


if __name__ == "__main__":
    sys.exit(main())
