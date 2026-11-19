# Runbook login BFF dan deploy API

Pegangan operasi untuk login satu halaman (BFF, flag `SAPA_LOGIN_BFF`) dan setiap deploy yang menyentuh
`api/`. Dokumen ini tidak memuat rahasia; nilai env diatur di Vercel dan tidak pernah ditulis di sini.

Sumber rinci perilaku: docstring `api/auth_bff.py` dan `api/sesi_service.py`.

## 1. Dependensi API (insiden httpx 2026-11-19)

- Vercel (builds `@vercel/python` untuk `api/index.py`, runtime Python 3.12) hanya memasang
  `api/requirements.txt`. `requirements.txt` di akar repo tidak dipakai Vercel.
- Satu sumber: `requirements.txt` dan `requirements-dev.txt` di akar sama-sama memuat
  `-r api/requirements.txt`. Paket yang dipakai kode `api/` hanya boleh ditambahkan ke `api/requirements.txt`.
- `tests/test_dependensi_api.py` gagal bila ada impor pihak ketiga di `api/*.py` yang tidak tercantum di
  `api/requirements.txt` (termasuk impor di dalam fungsi dan blok try).
- Sebelum meminta merge PR yang menyentuh `api/` atau berkas requirements, jalankan uji impor bersih:

  ```sh
  scripts/uji-impor-bersih.sh                       # boleh mengunduh paket
  UJI_IMPOR_OFFLINE=1 scripts/uji-impor-bersih.sh   # hanya cache uv
  ```

  Skrip membuat venv sementara dari `api/requirements.txt` saja, lalu mengimpor `index` persis cara Vercel
  dengan `SAPA_LOGIN_BFF=0` dan `=1`.

## 2. Setiap deploy produksi

1. Buka log build deployment, cari baris `Using python version`. Harus 3.12 (sama dengan `.python-version`
   dan versi yang dipakai tes). Versi lain: hentikan promosi dan laporkan.
2. Jalankan uji asap (bagian 3) segera setelah deployment aktif.
3. Bila uji asap gagal, jalankan rollback (bagian 4) lebih dulu, perbaikan menyusul.

Untuk PR yang menyentuh `api/`, uji asap yang sama dijalankan di URL preview sebelum merge.

## 3. Uji asap pasca-deploy

Tanpa login, tanpa data pasien. Lulus bila semua kode sesuai harapan dan **tidak ada satu pun 5xx**.

| Permintaan | Harapan |
| --- | --- |
| `GET /api/v1/health` | 200 |
| `GET /api/v1/auth/mode` | 200 |
| `GET /api/v1/akun/status` | 401 |
| `GET /api/v1/surat-kontrol/data` | 401 |
| `GET /api/v1/ssbi-jadwal/bulan` | 401 |
| `GET /api/v1/fkrtl-kepatuhan/ringkasan` | 401 |
| `GET /api/v1/auth/sesi` | 404 bila flag 0; 200 `{"masuk": false}` bila flag 1 |

```sh
DASAR=https://sapa-yanfaskes.vercel.app   # atau URL preview
for jalur in health auth/mode akun/status surat-kontrol/data ssbi-jadwal/bulan fkrtl-kepatuhan/ringkasan auth/sesi; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$DASAR/api/v1/$jalur")" "$jalur"
done
```

## 4. Rollback otomatis (SOP-10)

Kriteria: health atau salah satu permintaan uji asap menjawab 5xx (termasuk `FUNCTION_INVOCATION_FAILED`)
sesudah deploy produksi.

1. Lakukan **Instant Rollback Vercel** ke deployment produksi sebelumnya (dashboard Vercel, Deployments,
   deployment terakhir yang sehat, Instant Rollback). Rollback sesuai kriteria ini boleh langsung dilakukan
   tanpa menunggu persetujuan.
2. Ulangi uji asap pada domain produksi sampai lulus.
3. Lapor CEO: waktu mulai dan pulih, gejala, deployment yang di-rollback, dan tindakan.
4. Perbaikan maju lewat PR biasa. Setelah Instant Rollback, Vercel tidak lagi otomatis mempromosikan deploy
   baru dari cabang produksi; deployment perbaikan dipromosikan secara sadar setelah uji asap preview lulus.

Rollback tidak mengubah env Vercel. Bila penyebabnya env (bukan kode), rollback kode tidak menolong:
kembalikan env lalu redeploy.

## 5. Pemantauan

- **Pemantau uptime eksternal** pada `GET /api/v1/health` (interval 5 menit, notifikasi ke CEO). Butuh
  pembuatan akun layanan pemantau, jadi menunggu izin CEO (keputusan terbuka).
- Pesan log yang perlu diperhatikan (logger `sapa-api`, tanpa username mentah):
  - `Batas 50 username unik yang gagal per IP tercapai`: satu IP mencoba banyak username (sekali per IP per
    hari).
  - `Peringatan: username ... mencapai ... login gagal dalam satu jam`: tebakan pada satu akun.
  - `Kuota penanda lengket harian penuh`: banjir kegagalan lintas IP.
  - `Peringatan: tabel sapa_batas berisi lebih dari`: periksa ukuran database Neon.
  - `Auth0 429 batas tenant`: batas laju tenant Auth0, bukan blokir akun.
  - `Hasil penyegaran token Auth0 tidak diketahui`: Auth0 5xx atau lambat (lihat bagian 6).
  - `Cloudflare Turnstile melewati tenggat` atau `tidak dapat dihubungi`: login menjawab `belum_siap`.
  - `Durasi masuk gagal ... melewati batas minimum`: latensi DB atau layanan luar.

## 6. Perilaku login BFF yang perlu diketahui

- **Insiden Auth0 5xx atau lambat.** Saat penyegaran token mendapat jawaban yang tidak pasti (5xx selain 503,
  timeout baca, koneksi putus sesudah tersambung, tenggat 16 detik habis), sewa penyegaran baris sesi itu
  dibiarkan sampai habis (30 detik, N3), supaya refresh token yang mungkin sudah dirotasi Auth0 tidak dipakai
  dua kali. Selama itu sesi yang access token-nya sudah habis menjawab 503. Bila Auth0 ternyata sudah
  merotasi refresh token, penyegaran berikutnya ditolak dan **pengguna keluar paksa sekitar 30 detik
  kemudian**. Koneksi yang tidak pernah terbentuk (gagal connect atau timeout connect, K6) pasti belum
  mengirim refresh token, jadi sewanya langsung dilepas.
- **Pengguna di NAT yang sama dengan username yang diserang** bisa ditolak (`terlalu_banyak`) 15 sampai 30
  menit: slot 10 kegagalan per 15 menit (jendela geser) per username + IP sudah dipenuhi penyerang. Pengguna
  lain di NAT itu tidak terdampak. Penanda lengket 30 hari tidak menghalangi sandi yang benar.
- **Batas 50 username unik per IP per hari.** Setelah penuh, sandi yang benar tetap bisa masuk, tetapi
  sandi salah dari IP itu dijawab `terlalu_banyak` sampai pergantian hari, untuk username yang belum punya
  hitungan gagal yang masih hidup dari IP itu. Username yang hitungannya masih hidup (gagal dalam 15 menit
  terakhir, atau sudah berpenanda) tetap lewat jalur biasa: `sandi_salah` sampai kegagalan ke-10, lalu
  `terlalu_banyak`. Kegagalan yang ditolak karena batas ini tidak lagi dihitung untuk peringatan per username
  per jam (K2), jadi penyerang yang lebih dulu menghabiskan 50
  username per IP tidak memicu peringatan per username; yang terlihat adalah peringatan batas unik per IP.
- **Jendela harian tetap**, berganti pukul 00.00 UTC (07.00 WIB), bukan 24 jam bergulir. Berlaku untuk batas
  username unik per IP, kuota penanda lengket harian, dan peringatan per IP.
- **Kuota penanda lengket harian (1000 per hari, S2) adalah batas lunak** (K3): pembacaan kuota dan
  penulisan penanda tidak atomik, dan promosi yang melewati tengah malam dihitung di hari berikutnya, jadi
  jumlahnya bisa sedikit melebihi 1000.
- **Pertumbuhan `sapa_batas`** dibatasi umur baris: setiap percobaan yang lolos batas kasar per IP menulis hash
  token Turnstile (5 menit, sebelum siteverify, TS-2), dan yang lolos Turnstile juga menulis slot geser (paling
  lama 30 menit); hitungan gagal per username berumur 15 menit dan baru
  menjadi penanda 30 hari pada kegagalan ke-10. Pembersihan berjalan acak (1% panggilan) dan saat login sukses.

## 7. Tenggat jaringan dan database

| Konstanta | Nilai | Keterangan |
| --- | --- | --- |
| `turnstile.TENGGAT_SITEVERIFY` | 5 detik | tenggat total siteverify login (`asyncio.wait_for`) |
| `turnstile.TIMEOUT_SITEVERIFY_TAHAP` | connect 2, pool 0,5, baca 4, tulis 4 | per tahap httpx; 2 x connect + pool < 5 |
| `sesi_service.TENGGAT_AUTH0` | 16 detik | tenggat total satu panggilan Auth0 |
| `sesi_service.TIMEOUT_AUTH0_SAMBUNG` / `_POOL` | 5 / 5 detik | per tahap httpx; 2 x 5 + 5 = 15 < 16 |
| `sesi_service.TIMEOUT_AUTH0` | 8 detik | baca dan tulis Auth0 |
| `sesi_service.UMUR_KUNCI_SEGAR` | 30 detik | sewa penyegaran token |
| `sesi_service.TENGGAT_TUTUP_DB` | 2 detik | menutup koneksi `satu_koneksi()` tanpa tenggat dinding, lalu `terminate()` |

Tenggat connect httpx dibuat di bawah tenggat total karena pembatalan oleh `wait_for` di tengah TLS handshake
tidak menutup soket (K4); dengan tenggat per tahap, httpx sendiri yang menghentikan sambungan macet.
Siteverify login memakai `httpx.AsyncClient` (K1), tidak lagi `asyncio.to_thread`, jadi Cloudflare yang
lambat menjawab tidak lagi meninggalkan thread. Sisa yang diketahui: resolusi DNS httpx (siteverify maupun
Auth0) tetap berjalan di executor bawaan loop, dan thread `getaddrinfo` tidak ikut berhenti saat tenggat habis.
Bila resolver DNS lambat, thread itu bisa memenuhi executor sehingga DNS Auth0 ikut tertahan dan login sehat
dijawab `belum_siap`. Tanda di log: `Cloudflare Turnstile tidak dapat dihubungi` dan
`Auth0 /oauth/token bermasalah: status 0` (atau status negatif, belum terkirim) muncul serentak dalam beberapa
menit. Biasanya pulih sendiri setelah resolver normal; bila menetap,
periksa status DNS penyedia (Vercel, Cloudflare) sebelum menyentuh kode.

## 8. Keputusan terbuka (CEO)

- **Reuse interval refresh token Auth0.** Mengizinkan refresh token lama dipakai ulang dalam beberapa detik
  setelah rotasi akan mencegah keluar paksa pada insiden Auth0 (bagian 6). Ini perubahan pengaturan tenant
  Auth0, jadi menunggu keputusan CEO.
- **Pemantau uptime eksternal** untuk `/api/v1/health` (bagian 5): perlu akun baru.
- **Batas menganggur Admin dan Super Admin** (`SAPA_SESI_IDLE_ADMIN_MENIT`, usulan 30 menit): nonaktif
  sampai diputuskan.
- **`SQLAlchemy[asyncio]` (greenlet) di `api/requirements.txt`.** SQLAlchemy 2.1 memasang greenlet hanya lewat
  extra `asyncio`, jadi di Vercel `sqlalchemy.ext.asyncio` gagal diimpor dan `db.get_db` di `api/index.py` jatuh
  ke stub tanpa log: endpoint SCIM stub (`/api/v2/tenants/{id}/Users`) menjawab `Database not configured`.
  Ini sudah begitu sejak sebelum PR login BFF, dan login BFF tidak terdampak (memakai asyncpg langsung).
  Menambah extra akan menghidupkan jalur DB SCIM di produksi (bila `DATABASE_URL` dan token SCIM diisi), jadi
  pilihannya diputuskan dulu: pasang extra, atau hapus SCIM stub dan `api/db.py` bila memang tidak dipakai.
  `scripts/uji-impor-bersih.sh` mencatatnya sebagai gagal yang diketahui; gagal impor lain membuat skrip gagal.
- **Paket di `requirements.txt` akar tanpa pemakai** (fastexcel, google-auth-oauthlib, alembic, gunicorn,
  passlib[argon2], argon2-cffi): dipertahankan sampai diputuskan dihapus.

## 9. Catatan tes

- Tes N2 (`test_n2_primitive_asyncio_hanya_dibuat_di_dalam_coroutine`) memeriksa AST supaya primitive asyncio
  (Event, Lock, Queue, dst.) tidak dibuat di luar coroutine. Yang dikenali: `asyncio.X()`, alias modul,
  atribut bertingkat (`asyncio.locks.Event()`), `from asyncio import Event` (termasuk `from asyncio import *`),
  serta default argumen, dekorator, dan anotasi parameter atau return fungsi. Titik buta yang tersisa: akses dinamis (`getattr`, `importlib`), kelas primitive yang diteruskan
  tanpa dipanggil (`default_factory=asyncio.Event`) lalu dipanggil di luar loop, dan alias lewat penugasan
  (`E = asyncio.Event`). Lambda dan fungsi biasa selalu dianggap di luar coroutine (konservatif).
