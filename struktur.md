# STRUKTUR.MD — MANIFEST STRUKTUR MENU APLIKASI
**Proyek**: SAPA YANFASKES (Saluran Analisis Performa & Akselerasi)  
**Versi Manifest**: 1.0.0  
**Sinkronisasi Komponen**: [`frontend/src/components/Sidebar.tsx`](file:///Volumes/WD_BLACK_PRO/sapa-yanfaskes/frontend/src/components/Sidebar.tsx) & [`frontend/src/App.tsx`](file:///Volumes/WD_BLACK_PRO/sapa-yanfaskes/frontend/src/App.tsx)  
**Terakhir Diperbarui**: 2026-09-24  

---

## 1. Hierarki Menu Resmi (Menu Structure Hierarchy)

Sesuai aturan sistem, struktur menu wajib terdiri dari 5 pilar utama:

```
SAPA YANFASKES
│
├── 🔐 0. Gerbang Autentikasi (Official Login Page — Split-Screen Enterprise BPJS Green) [BARU]
│   └── Deskripsi: Halaman masuk resmi bertata letak Split-Screen Enterprise (kiri: panel identitas hijau resmi BPJS #009B4D non-navy/non-AI, kanan: formulir masuk bersih putih) dengan validasi kredensial pengguna, remember me, toggle show/hide password, tanpa pilihan SSO, dan verifikasi keamanan resmi Cloudflare Turnstile.
│   └── Komponen: LoginPage.tsx & CloudflareTurnstile.tsx
│   └── Keamanan: Cloudflare Turnstile Site Key & Content Security Policy Headers
│
├── 🏠 1. Home
│   └── Deskripsi: Ringkasan eksekutif, portal overview, status integrasi, metrik makro faskes.
│   └── Tab ID: 'home'
│   └── Rute Frontend: '/'
│
├── 🏥 2. FKTP (Fasilitas Kesehatan Tingkat Pertama)
│   └── Deskripsi: Analisis performa pelayanan primer (Puskesmas, Klinik Pratama, Dokter Mandiri).
│   └── Tab ID: 'fktp'
│   └── Sub-Menu:
│       └── 📊 Pemanfaatan Antrol FKTP (Tab ID: 'fktp-antrol') [BARU]
│           ├── Indikator KPI Utama (Capaian Antrol %, Total Antrean CF, Total Transaksi, Jumlah FKTP)
│           ├── Tren Bulanan Pemanfaatan Antrean Online FKTP (SVG Line Chart Glassmorphism)
│           ├── Tabel Matriks Capaian FKTP (Nama FKTP & Persentase Capaian)
│           └── Floating Tooltip Detail Antrean pada Kolom Persentase Capaian (sumber_antrean_cf, sumber_antrean_total_transaksi, total_transaksi, persentase_capaian, sumber_antrean)
│   └── Rute Frontend: '/fktp'
│
├── 🏢 3. FKRTL (Fasilitas Kesehatan Rujukan Tingkat Lanjutan)
│   └── Deskripsi: Analisis performa rumah sakit dan fasilitas rujukan sekunder/tersier.
│   └── Tab ID: 'fkrtl'
│   └── Sub-Menu:
│       ├── 📊 Pemanfaatan Antrol FKRTL (Tab ID: 'fkrtl-antrol')
│       │   ├── Indikator KPI Utama (Total Antrean, Total SEP, Rasio Pemanfaatan %)
│       │   ├── Tren Bulanan Pemanfaatan Antrean Online
│       │   ├── Analisis Agregasi per Faskes / Rumah Sakit
│       │   └── Analisis Distribusi per Poliklinik Spesialis
│       └── 📋 Laporan Kepatuhan FKRTL (Tab ID: 'fkrtl-kepatuhan') [LENGKAP - 9 TAB SPREADSHEET]
│           ├── Tab 00. Ringkasan Nilai Akhir (Konsolidasi 8 pilar standar mutu kepatuhan FKRTL dari nilai_kepatuhan_fkrtl)
│           ├── Tab 01. Jadwal Praktik Nakes (Kepatuhan jadwal dokter/nakes dari 01_jadwal_praktik)
│           ├── Tab 02. Penyelesaian Pengaduan (Kecepatan respon penanganan keluhan dari 02_penyelesaian_pengaduan_FKRTL)
│           ├── Tab 03. Umbal Peserta (Umpan Balik / Kepuasan Peserta JKN KESSAN dari 03_umbal_peserta)
│           ├── Tab 04. Update Display TT (Pemutakhiran ketersediaan tempat tidur harian dari 04_display_tt)
│           ├── Tab 05. Update TMO (Tempat Pelayanan Obat / Jadwal Operasi dari 05_update_tmo)
│           ├── Tab 06. Antrean MJKN & WTL (Waktu Tunggu Layanan Task 2-4 & Pemanfaatan Mobile JKN dari 06_antrean_waktu_tunggu)
│           ├── Tab 07. Surkon (Penerbitan Surat Kontrol & SPRI bridging V-Claim dari 07_surkon_terbit)
│           └── Tab 08. RME (Adopsi & Integrasi Rekam Medis Elektronik <= 7 hari dari 08_RME)
│           └── Master Referensi RS (Metadata kelas, kabupaten, status dari ref_fkrtl)
│   └── Rute Frontend: '/fkrtl'
│
├── ⚙️ 4. Settings (Admin & Pengaturan)
│   └── Deskripsi: Pengaturan konfigurasi faskes, profil admin, integrasi Google Spreadsheet, dan manajemen pengguna.
│   └── Tab ID: 'admin'
│   └── Rute Frontend: '/settings'
│   └── Tab Pengaturan Internal:
│       ├── 👤 1. Profil (Edit Nama, Username, Email, Ubah Kata Sandi, Dialog Verifikasi Akun & Surat Digital No-Reply)
│       ├── 🏥 2. Integrasi Data FKTP (Konektivitas & Sinkronisasi Data Pelayanan Tingkat Pertama)
│       ├── 🏢 3. Integrasi Data FKRTL (Tombol Sinkronisasi Data Spreadsheet Antrol & Kepatuhan FKRTL dengan Perekaman Timestamp Live)
│       └── 👥 4. User Setting (Tabel Akun, Live Search, Filter Role, Show/Hide Password, Tambah, Edit, dan Hapus Pengguna)
│
├── 📊 5. SAPA Yanfaskes (Capaian Kepatuhan FKRTL & FKTP) [BARU]
│   └── Deskripsi: Dashboard pelacak analitik performa layanan faskes & statistik distribusi geografis (PROFI UI Fidelity Engine).
│   └── Tab ID: 'insight-tracer'
│   └── Rute Frontend: '/?preview=insight-tracer' atau Nav Tab 'insight-tracer'
│   └── Komponen Utama:
│       ├── 🧭 Dark Navigation Sidebar (#1E1F31, 4 Section: ACTION CENTRE, DASHBOARD [Capaian Kepatuhan FKRTL, Capaian Kepatuhan FKTP], ENGAGEMENTS, MANAGE [User Management, Smart Banners, Events, Validation Rules, Integration])
│       ├── 👤 User Management View (CRUD Pengguna: Username, Email, Password, Status, & Role: Super Admin, Admin, User)
│       ├── 📈 2 Comparative KPI Metric Cards (Touchpoints: Clicks, Impressions, Organic, Non-Organic; Installs: Organic, Non-Organic, 0% Organic, Fraudulent)
│       ├── 🗺️ Geographical Distribution World Map (Hotspot 5 Negara: India 50.61%, US 26.21%, UK 12.44%, Greenland 6.61%, Australia 4.61% & 3 Metrik Agregat: Viewed 25,344, Dropouts 21,887, Responses 12,834)
│       └── 📋 Breakdown By Media Source Data Table (Demo Partner, Google Ads, Meta Audience, Apple Search Ads)
│
└── 🚪 6. Log out
    └── Deskripsi: Terminasi sesi pengguna, pembersihan token dan kredensial sesi lokal di authStore, serta pengalihan otomatis kembali ke Halaman Login Resmi.
    └── Aksi: Modal Dialog Konfirmasi Keluar & `logoutUser()` via Zustand `authStore.ts` / Auth0 React SDK fallback.
```

---

## 2. Pemetaan Hak Akses Menu (Role-Based Access Control / RBAC)

Sesuai spesifikasi resmi 3 tingkatan peran:
- **Super Admin**: Melihat data, mendownload laporan/data, menambah user, mengedit user, dan menghapus user (Hak Akses Penuh).
- **Admin**: Melihat data dan mendownload laporan/data (Hak Akses Operasional).
- **User**: Hanya melihat menu tertentu saja (Hak Akses Terbatas).

| Menu / Fitur Sistem | User (Terbatas) | Admin (Operasional) | Super Admin (Penuh) |
| :--- | :---: | :---: | :---: |
| **Home (Dashboard Ringkasan)** | ✅ Melihat | ✅ Melihat | ✅ Melihat |
| **FKTP - Pemanfaatan Antrol** | ❌ (Menu Tertentu) | ✅ Melihat & Unduh | ✅ Melihat & Unduh |
| **FKRTL - Pemanfaatan Antrol** | ❌ (Menu Tertentu) | ✅ Melihat & Unduh | ✅ Melihat & Unduh |
| **FKRTL - Laporan Kepatuhan Mutu (9 Tab)** | ❌ (Menu Tertentu) | ✅ Melihat & Unduh | ✅ Melihat & Unduh |
| **Manajemen Pengguna (User Management)** | ❌ | ❌ | ✅ CRUD User Lengkap & Unduh |
| **Settings & Konfigurasi Sistem** | ❌ | ❌ | ✅ Konfigurasi Penuh |
| **Log out** | ✅ | ✅ | ✅ |

---

## 3. Protokol Sinkronisasi Dinamis
Setiap kali pengguna meminta penambahan, perubahan, atau penghapusan item menu:
1. Manifest `struktur.md` harus diperbarui terlebih dahulu.
2. Tipe TypeScript `NavTab` dan daftar konfigurasi `navItems` pada `frontend/src/components/Sidebar.tsx` dimutakhirkan secara konsisten.
3. Rute komponen pada `frontend/src/App.tsx` disinkronkan.
