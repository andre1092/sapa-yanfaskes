# Runbook login BFF dan deploy API

Pegangan operasi untuk login satu halaman dengan akun lokal (flag `SAPA_LOGIN_BFF`, tanpa Auth0) dan setiap
deploy yang menyentuh `api/`. Dokumen ini tidak memuat rahasia; nilai env diatur di Vercel dan tidak pernah
ditulis di sini, di chat, atau di repo.

Sumber rinci perilaku: docstring `api/auth_bff.py`, `api/akun_service.py`, `api/sesi_service.py`, dan
`workers/sapa-akun/README.md`.

Ringkasan arsitektur flag 1:

- Akun (satu Super Admin pada tahap ini) ada di tabel `akun_sapa` Cloudflare D1, yang hanya bisa dijangkau
  lewat Worker `sapa-akun` (operasi tetap, permintaan bertanda tangan HMAC). Vercel tidak memegang token API
  Cloudflare.
- Sandi diperiksa di server SAPA (argon2id m=19456 KiB, t=2, p=1, dengan pepper `SAPA_AKUN_PEPPER`). Setiap baris
  akun punya MAC (`SAPA_AKUN_KUNCI_MAC`) yang diperiksa setiap login dan setiap permintaan.
- Sesi, pembatas, hash token Turnstile, dan jangkar versi sandi (`akun_jangkar`, anti-rollback) ada di DB sesi
  Neon yang sudah ada.
- Flag 0 tetap perilaku lama persis (Auth0 SPA, Bearer). Flag 1: Bearer Auth0 ditolak tanpa syarat; menu
  Pengguna FKRTL, ganti sandi awal lewat Auth0, halaman `/verifikasi`, dan token asisten HeroUI menjawab 503
  "Fitur ini belum tersedia di sistem akun baru."

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
- `argon2-cffi` (hash sandi akun lokal) tercantum di `api/requirements.txt`; tesnya ada di
  `tests/test_dependensi_api.py`.
- Tes Worker: `cd workers/sapa-akun && node --test test/*.test.mjs` (tanpa paket npm; D1 tiruan memakai
  `node:sqlite`).

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
| `GET /api/v1/auth/siapkan-akun` | 404 (flag 0, atau flag 1 tanpa env kode); 200 hanya selama penyiapan/pemulihan |

```sh
DASAR=https://sapa-yanfaskes.vercel.app   # atau URL preview
for jalur in health auth/mode akun/status surat-kontrol/data ssbi-jadwal/bulan fkrtl-kepatuhan/ringkasan auth/sesi auth/siapkan-akun; do
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

## 5. Konstanta tenggat jaringan dan database

| Konstanta | Nilai | Satuan |
| --- | --- | --- |
| `turnstile.TENGGAT_SITEVERIFY` | 5 | detik |
| `turnstile.TIMEOUT_SITEVERIFY_TAHAP` | connect 2, pool 0,5, baca 4, tulis 4 | detik |
| `akun_service.TENGGAT_WORKER` | 3 | detik |
| `akun_service.TENGGAT_HIBP` | 3 | detik |
| `sesi_service.TENGGAT_TUTUP_DB` | 2 | detik |
| `sesi_service.MAKS_THREAD_DNS` | 64 | thread |

## 6. Env login lokal (flag 1)

Semua di Vercel scope **Production** saja, tipe **Sensitive**. Setiap nilai kunci dibuat terpisah dengan
`openssl rand -base64 32` di terminal pemilik sendiri dan langsung ditempel ke Vercel. Jangan memakai satu nilai
untuk dua env, dan jangan pernah menulis nilainya di chat, berkas, atau repo.

| Env | Isi | Catatan |
| --- | --- | --- |
| `SAPA_AKUN_WORKER_URL` | `https://sapa-akun.<subdomain>.workers.dev` | wajib https |
| `SAPA_AKUN_HMAC` | `openssl rand -base64 32` | sama persis dengan secret Worker `SAPA_AKUN_HMAC` |
| `SAPA_AKUN_PEPPER` | `openssl rand -base64 32` | **baru**; simpan salinan offline. Hilang = semua sandi harus dipulihkan |
| `SAPA_AKUN_KUNCI_MAC` | `openssl rand -base64 32` | terpisah dari pepper; hilang = MAC semua baris tidak cocok |
| `SAPA_SESI_KUNCI` | `openssl rand -base64 32` | sudah ada sejak login BFF; isi bila belum |
| `SAPA_SESI_DSN_APLIKASI` | DSN pooled role `sapa_aplikasi` | role terbatas (bagian 7 langkah 7); didahulukan dari `SAPA_SESI_DATABASE_URL` |
| `SAPA_SKEMA_MANUAL` | `1` | tanpa DDL; hanya `SAPA_SESI_DSN_APLIKASI` yang diterima, DSN integrasi ditolak (503) |
| `SAPA_KODE_PENYIAPAN` | `openssl rand -base64 32` | sementara, hanya selama penyiapan akun pertama (bagian 8) |
| `SAPA_KODE_PEMULIHAN` | `openssl rand -base64 32` | sementara, hanya selama pemulihan (bagian 9) |
| `SAPA_LOGIN_BFF` | `1` | diisi paling akhir (bagian 10) |

Pepper atau kunci MAC kosong/tidak sah: login, revalidasi, dan penyiapan menjawab 503 `belum_siap` (gagal
tertutup).

## 7. Tindakan pemilik sebelum flag 1

Setiap langkah dikerjakan pemilik produk sendiri. Perintah lengkap Worker ada di `workers/sapa-akun/README.md`.

**Jalur satu perintah (disarankan).** Setelah langkah 1 dan 2 (akun Cloudflare khusus dan token API berumur
pendek), serta token Vercel berumur pendek dengan cakupan proyek ini, jalankan dari akar repo:

```sh
python3 scripts/siapkan-produksi-akun.py
```

Skrip meminta kedua token lewat prompt tersembunyi, lalu mengerjakan langkah 3 sampai 6 dan 8 secara berurutan:
membuat D1 dan migrasinya, men-deploy Worker, membuat empat kunci baru, memasang `SAPA_AKUN_HMAC` di Worker, menjalankan
uji negatif, dan mengisi env Vercel Production. Kunci dan token tidak pernah dicetak, ditulis ke berkas, atau
disimpan di Keychain; tidak ada salinan lain selain di Vercel dan Worker. Skrip menolak membuat ulang kunci bila D1 sudah berisi akun, dan tidak
menyalakan `SAPA_LOGIN_BFF`. Setelah selesai, cabut kedua token di dasbornya. Langkah manual di bawah tetap
berlaku bila skrip tidak bisa dipakai.

1. **Akun Cloudflare khusus.** Buat akun Cloudflare baru yang hanya berisi Worker dan D1 ini. Pasang dua kunci
   keamanan WebAuthn dan simpan kode cadangan; jangan memakai 2FA email saja. Anggota akun hanya pemilik.
2. **Token API berumur pendek.** Di dasbor akun khusus, buat token dengan izin "Workers Scripts: Edit" dan
   "D1: Edit" saja, TTL beberapa jam, dan filter IP laptop bila tersedia. **Dilarang `wrangler login`.** Token
   diberikan lewat prompt tersembunyi (`read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN`).
3. **D1 dan migrasi.** `npx wrangler@4 d1 create sapa-akun`, isi `database_id` di salinan lokal
   `wrangler.toml`, lalu `npx wrangler@4 d1 migrations apply sapa-akun --remote`.
4. **Secret Worker.** Buat nilai dengan `openssl rand -base64 32`, lalu `npx wrangler@4 secret put SAPA_AKUN_HMAC`
   dan tempel nilai yang sama ke env Vercel Production `SAPA_AKUN_HMAC`.
5. **Deploy Worker.** `npx wrangler@4 deploy`. Catat alamat `workers.dev`. Lalu `unset CLOUDFLARE_API_TOKEN`,
   **cabut token di dasbor**, dan pastikan `npx wrangler@4 whoami` menyatakan tidak login.
6. **Env Vercel Production.** Isi `SAPA_AKUN_WORKER_URL`, `SAPA_AKUN_HMAC`, `SAPA_AKUN_PEPPER`,
   `SAPA_AKUN_KUNCI_MAC`, dan `SAPA_SESI_KUNCI` (bila belum ada) sesuai bagian 6. `SAPA_LOGIN_BFF` belum diubah.
7. **Opsional: role DB sesi Neon terbatas.** Di konsol SQL Neon, sebagai owner database, jalankan
   `api/sql/sesi_neon.sql` (membuat `sapa_sesi`, `sapa_batas`, `akun_jangkar`, dan GRANT contoh untuk role
   `sapa_aplikasi`). Buat role itu **lewat SQL**, bukan tombol Add role: role buatan konsol, API, atau CLI otomatis
   menjadi anggota `neon_superuser` (pg_read_all_data, pg_write_all_data, CREATEROLE, BYPASSRLS). Contoh:
   `CREATE ROLE sapa_aplikasi WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;` dijalankan
   sebelum GRANT, dan pastikan `pg_has_role('sapa_aplikasi', 'neon_superuser', 'MEMBER')` bernilai false.
   Neon hanya bisa me-reset sandi role yang sudah bersandi, jadi beri dulu sandi awal acak buatan server yang
   tidak pernah ditampilkan: `DO $$ BEGIN EXECUTE format('ALTER ROLE sapa_aplikasi WITH PASSWORD %L',
   md5(random()::text || clock_timestamp()::text) || md5(random()::text)); END $$;`. Lalu sandi asli diatur lewat
   Reset password di halaman Roles (sandi tidak tertulis di riwayat SQL), dan pemeriksaan role diulang. DSN pooled role
   itu diambil dari dialog Connect dan diisi ke env baru
   `SAPA_SESI_DSN_APLIKASI` (Production, Sensitive). Jangan mengubah `SAPA_SESI_DATABASE_URL`: env itu dikelola
   integrasi Neon dan bisa ditimpa ulang ke role bawaan. Dengan `SAPA_SKEMA_MANUAL=1` DSN integrasi ditolak,
   jadi role bawaan tidak pernah dipakai diam-diam.
   Lalu isi `SAPA_SKEMA_MANUAL=1` supaya aplikasi tidak menjalankan DDL. Role aplikasi hanya SELECT, INSERT,
   UPDATE, DELETE pada tabel sesi dan pembatas, serta SELECT, INSERT, UPDATE pada `akun_jangkar` (tanpa DELETE,
   tanpa DDL). Tanpa langkah ini, aplikasi membuat tabelnya sendiri dengan `CREATE TABLE IF NOT EXISTS`.
8. **Uji negatif Worker** dari terminal sendiri: `python3 scripts/uji-worker-akun.py <alamat Worker>`. Semua
   kasus harus `LULUS` (tanpa tanda tangan 401, tanda tangan salah 401, waktu di luar 60 detik 401, nonce ganda
   ditolak, path asing 404, body diubah 401). Skrip membaca kunci dari prompt tersembunyi dan tidak mencetaknya.
9. Redeploy Vercel dan jalankan uji asap (bagian 3) dengan flag masih 0.

## 8. Penyiapan akun pertama (satu Super Admin)

Sandi hanya ditetapkan pemilik sendiri, di browser sendiri. Sandi tidak pernah diketik di chat atau diberikan ke
siapa pun; sandi yang pernah tertulis di chat tidak boleh dipakai.

1. Di laptop pemilik: `openssl rand -base64 32`. Tempel hasilnya ke env Vercel Production (Sensitive)
   `SAPA_KODE_PENYIAPAN`, lalu redeploy.
2. Buka `https://<domain SAPA>/siapkan-akun`. Halaman hanya tersedia selama env itu ada, kodenya belum terpakai,
   dan tabel akun masih kosong; selain itu 404.
3. Isi nama pengguna (email pemilik), kode dari langkah 1, dan sandi baru (minimal 15 karakter, paling panjang
   256 byte, tidak sama dengan nama pengguna atau kode, tidak ada di daftar sandi bocor), lalu centang
   verifikasi keamanan.
4. Berhasil: akun dibuat sekali saja (INSERT hanya bila tabel kosong) dan kode langsung tercatat terpakai, jadi
   kode itu tidak bisa dipakai lagi walau env belum dihapus. Akun kedua tidak bisa dibuat lewat jalur ini.
5. **Hapus env `SAPA_KODE_PENYIAPAN`** di Vercel, lalu redeploy.
6. Masuk dengan sandi baru. Uji "Ubah password" di Pengaturan akun: perangkat kedua yang sudah masuk harus
   langsung keluar (401) dan perangkat ini tetap masuk dengan sesi baru.

Bila pemeriksaan sandi bocor tidak terjangkau, sandi baru ditolak dengan pesan "Pemeriksaan keamanan sandi
sedang tidak tersedia. Coba lagi beberapa saat lagi." (gagal tertutup); ulangi beberapa saat kemudian.

## 9. Pemulihan bila sandi lupa

1. Di laptop pemilik: `openssl rand -base64 32`. Tempel ke env Vercel Production (Sensitive)
   `SAPA_KODE_PEMULIHAN`, lalu redeploy.
2. Buka `/siapkan-akun`. Isi nama pengguna akun yang sudah ada, kode, dan sandi baru.
3. Pemulihan hanya mengganti hash akun yang username-nya cocok (versi sandi naik, MAC dihitung ulang, jangkar
   dinaikkan) dan mencabut semua sesi akun itu. Pemulihan tidak pernah membuat akun; selama tabel akun kosong
   halamannya 404.
4. Kode pemulihan sekali pakai. **Hapus env `SAPA_KODE_PEMULIHAN`**, lalu redeploy. Untuk pemulihan berikutnya
   buat kode baru.

Selama penyiapan atau pemulihan tidak tersedia, `POST /api/v1/auth/siapkan-akun` selalu menjawab 404, apa pun
kode yang dikirim. Bila kode env yang **benar** dipakai lagi (sudah terpakai, atau jenisnya tidak berlaku saat
itu), kejadiannya tetap tercatat: log peringatan "Kode ... yang benar ditolak" dan audit `POST
/api/v1/auth/siapkan-akun` status 404 dengan `hasil=kode_terpakai` atau `hasil=kode_tidak_berlaku` (tanpa nilai
kode). Catatan seperti ini berarti env kode belum dihapus atau nilainya bocor: hapus env itu, redeploy, lalu
periksa siapa yang memegang kode.

## 10. Urutan nyala dan rollback

Urutan nyala (setiap langkah dengan izin pemilik produk):

1. PR ter-merge dengan `SAPA_LOGIN_BFF=0`; deploy hijau; uji asap (bagian 3) lulus. Perilaku masih Auth0 SPA.
2. Tindakan pemilik bagian 7 selesai, termasuk uji negatif Worker.
3. Isi `SAPA_LOGIN_BFF=1`, redeploy, uji asap flag 1 (`/auth/mode` `{"bff": true}`, `/auth/sesi`
   `{"masuk": false}`, endpoint data 401 tanpa cookie, tidak ada 5xx).
4. Penyiapan akun pertama (bagian 8), masuk, uji "Ubah password" dengan dua perangkat.
5. Pastikan Bearer Auth0 lama ditolak 401 di endpoint data.

Rollback:

- **Kode bermasalah** (5xx sesudah deploy): Instant Rollback Vercel (bagian 4).
- **Login lokal bermasalah**: ubah `SAPA_LOGIN_BFF` ke `0` lalu redeploy. Aplikasi kembali ke Auth0 SPA selama
  tenant Auth0 dan env `AUTH0_*`/`VITE_AUTH0_*` masih ada. Sesi cookie flag 1 tidak dipakai di flag 0. Data akun
  di D1 dan jangkar di Neon tetap ada untuk percobaan berikutnya.
- Sesudah env Auth0 dihapus, rollback ke flag 0 tidak lagi memulihkan login; saat itu hanya Instant Rollback ke
  deployment flag 1 yang sehat.

## 11. Worker: kuota habis atau serangan

Tanda:

- Galat Cloudflare 1027 (batas harian Workers gratis terlampaui) di metrik Worker, dan login, revalidasi,
  penyiapan, serta ubah sandi menjawab 503 `belum_siap` (gagal tertutup, tanpa jalan pintas).
- Lonjakan permintaan berstatus 401 di metrik Worker (permintaan tanpa tanda tangan sah ke alamat
  `workers.dev`).

Langkah darurat pemilik:

1. Buat token API berumur pendek baru (bagian 7 langkah 2).
2. Deploy Worker yang sama dengan nama baru, mis. ubah `name` di salinan lokal `wrangler.toml`
   (`sapa-akun-2`), `npx wrangler@4 deploy`, lalu `npx wrangler@4 secret put SAPA_AKUN_HMAC` untuk Worker baru.
   Binding D1 tetap ke database yang sama, jadi data akun tidak berpindah.
3. Perbarui env Vercel Production `SAPA_AKUN_WORKER_URL` ke alamat baru, lalu redeploy.
4. Hapus Worker lama di dasbor, cabut token, lalu jalankan `scripts/uji-worker-akun.py` ke alamat baru.
5. Bila ada tanda kunci HMAC bocor: buat nilai baru, pasang di Worker dan Vercel bersamaan, lalu redeploy.
