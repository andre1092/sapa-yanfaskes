# Worker sapa-akun

Pintu sempit ke tabel akun SAPA di Cloudflare D1. Server SAPA (Vercel) tidak memegang token API Cloudflare; ia
hanya memanggil Worker ini dengan permintaan bertanda tangan HMAC. Worker hanya menyediakan operasi tetap (tanpa
SQL bebas) dan tidak memegang pepper sandi maupun kunci MAC baris.

| Path (POST JSON) | Jenis | Isi | Jawaban |
| --- | --- | --- | --- |
| `/akun/ambil-username` | baca | `{username}` | `{akun: baris \| null}` (memuat hash, hanya untuk verifikasi di server SAPA) |
| `/akun/ambil-id` | baca | `{id}` | `{akun: baris \| null}` |
| `/akun/jumlah` | baca | `{}` | `{jumlah}` |
| `/kode/terpakai` | baca | `{hash_kode}` | `{terpakai}` |
| `/akun/sisip-pertama` | tulis | `{akun, hash_kode}` | `{ok}`; INSERT hanya bila tabel kosong, sekaligus menandai kode penyiapan |
| `/akun/ganti-hash` | tulis | `{id, versi_lama, versi_baru, hash, mac, hash_kode, jenis}` | `{ok}`; UPDATE bersyarat versi lama; kode pemulihan ditandai bila diisi |

Path atau metode lain, dan query string apa pun: 404. Isian tidak sah: 400. Kode sudah terpakai: 409.

## Tanda tangan

Header setiap permintaan:

- `X-Sapa-Waktu`: detik Unix (10 digit).
- `X-Sapa-Nonce`: 32 karakter hex acak, wajib untuk operasi tulis; tidak dikirim untuk operasi baca.
- `X-Sapa-Tanda`: `hex(HMAC-SHA256(kunci, kanonik))`.

```
kanonik = "sapa-akun-v1" + "\n" + METODE + "\n" + PATH + "\n" + WAKTU + "\n" + NONCE + "\n" + hex(SHA-256(body mentah))
kunci   = base64-decode(secret SAPA_AKUN_HMAC)
```

- Tanda tangan diperiksa paling awal dengan `crypto.subtle.verify` (waktu-konstan), sebelum D1 disentuh.
- Jendela waktu: operasi tulis 60 detik, operasi baca 15 detik.
- Nonce tulis disimpan sekali pakai di `nonce_terpakai` (umur 120 detik) dalam `db.batch` yang sama dengan
  operasinya; batch yang sama juga menghapus nonce yang sudah kedaluwarsa. Nonce ganda: 401.
- Tanda tangan salah, waktu di luar jendela, atau header tidak lengkap: 401 tanpa rincian.
- Vektor uji bersama Python dan JavaScript: `test/vektor-tanda.json`.

Log Worker hanya metadata: path (nama operasi tetap atau `lain`), status, dan durasi. Body, hash, username, kode,
dan header tanda tangan tidak pernah dicatat.

## Tes

```sh
cd workers/sapa-akun
node --test test/*.test.mjs     # Node 22.5+; D1 tiruan memakai node:sqlite bawaan, tanpa paket npm
```

## Deploy (dijalankan pemilik sendiri)

Aturan:

- Akun Cloudflare khusus yang hanya berisi Worker dan D1 ini, dilindungi dua kunci keamanan WebAuthn (plus kode
  cadangan), tanpa 2FA email saja, dengan anggota hanya pemilik.
- Dilarang `wrangler login` (OAuth). Pakai token API berumur pendek yang dibuat di dasbor akun khusus itu:
  izin hanya "Workers Scripts: Edit" dan "D1: Edit", TTL beberapa jam, dan filter IP laptop bila tersedia.
- Token diberikan lewat prompt tersembunyi, tidak pernah diketik di baris perintah, berkas, atau chat, dan dicabut
  di dasbor segera setelah selesai.

```sh
cd workers/sapa-akun
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN   # tempel token, tidak tampil di layar

npx wrangler@4 d1 create sapa-akun
# Salin database_id hasil perintah di atas ke wrangler.toml di salinan lokal (bukan rahasia; tidak perlu di-commit).

npx wrangler@4 d1 migrations apply sapa-akun --remote

openssl rand -base64 32                       # nilai ini juga ditempel ke env Vercel Production SAPA_AKUN_HMAC
npx wrangler@4 secret put SAPA_AKUN_HMAC      # tempel nilai di prompt

npx wrangler@4 deploy                          # catat alamat https://sapa-akun.<subdomain>.workers.dev

unset CLOUDFLARE_API_TOKEN
npx wrangler@4 whoami                          # harus menyatakan tidak login
```

Sesudah deploy: cabut token di dasbor Cloudflare, lalu jalankan uji negatif dari terminal sendiri:

```sh
python3 scripts/uji-worker-akun.py https://sapa-akun.<subdomain>.workers.dev
```

Skrip membaca `SAPA_AKUN_HMAC` dari prompt tersembunyi (atau env), tidak pernah mencetaknya, dan hanya memakai
operasi yang aman saat D1 kosong maupun berisi. Semua baris harus `LULUS`.
