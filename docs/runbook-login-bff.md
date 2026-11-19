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

## 5. Konstanta tenggat jaringan dan database

| Konstanta | Nilai | Satuan |
| --- | --- | --- |
| `turnstile.TENGGAT_SITEVERIFY` | 5 | detik |
| `turnstile.TIMEOUT_SITEVERIFY_TAHAP` | connect 2, pool 0,5, baca 4, tulis 4 | detik |
| `sesi_service.TENGGAT_AUTH0` | 16 | detik |
| `sesi_service.TIMEOUT_AUTH0_SAMBUNG` / `_POOL` | 5 / 5 | detik |
| `sesi_service.TIMEOUT_AUTH0` | 8 | detik |
| `sesi_service.UMUR_KUNCI_SEGAR` | 30 | detik |
| `sesi_service.TENGGAT_TUTUP_DB` | 2 | detik |
| `sesi_service.MAKS_THREAD_DNS` | 64 | thread |
