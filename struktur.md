# STRUKTUR.MD — MANIFEST STRUKTUR MENU APLIKASI
**Proyek**: SAPA YANFASKES (Saluran Analisis Performa & Akselerasi)  
**Versi Manifest**: 1.0.0  
**Sinkronisasi Komponen**: [`frontend/src/components/Sidebar.tsx`](file:///Volumes/WD_BLACK_PRO/sapa-yanfaskes/frontend/src/components/Sidebar.tsx) & [`frontend/src/App.tsx`](file:///Volumes/WD_BLACK_PRO/sapa-yanfaskes/frontend/src/App.tsx)  
**Terakhir Diperbarui**: 2026-09-24  

---

## 1. Hierarki Menu Resmi (Menu Structure Hierarchy)

Sesuai aturan sistem, struktur menu wajib terdiri dari 5 pilar utama:

```
SAPA YANFASKES (SISTEM TATA LETAK TUNGGAL NON-OVERLAPPING)
│
├── 🔐 0. Gerbang Autentikasi (Official Login Page — Split-Screen Enterprise BPJS Green)
│   └── Deskripsi: Halaman masuk resmi bertata letak Split-Screen Enterprise dengan Logo Resmi SAPA Yanfaskes (Nano Banana 2.1 high-res emblem), panel identitas hijau resmi BPJS #009B4D non-navy/non-AI, formulir masuk bersih putih dengan validasi kredensial pengguna, remember me, toggle show/hide password, tanpa pilihan SSO, dan verifikasi keamanan resmi Cloudflare Turnstile.
│   └── Komponen: LoginPage.tsx & CloudflareTurnstile.tsx
│
└── 📊 1. SAPA Yanfaskes Dashboard (Root Layout Utama Aplikasi)
    └── Komponen Induk: InsightTracerDashboard.tsx (Satu-satunya Sidebar Auto-Hide/Hover-Expand dengan Logo Resmi SAPA Yanfaskes Nano Banana 2.1 & Header Tunggal)
    │
    ├── 🧭 A. ACTION CENTRE
    │   └── 🏠 Home: Ringkasan KPI eksekutif (Touchpoints, Installs, Peta Distribusi Geografis, Breakdown Media Table).
    │
    ├── 📈 B. DASHBOARD
    │   ├── 🏢 Capaian Kepatuhan FKRTL: Modul 9 Tab Kepatuhan Google Drive resmi (Ringkasan Nilai Akhir, Nakes, Pengaduan, Umbal, Display TT, TMO, Antrean & WTL, Surkon, RME) dengan diagram garis tren seragam.
    │   ├── 📊 Pemanfaatan Antrol FKRTL: Analisis tren bulanan antrol dan distribusi faskes serta poliklinik.
    │   └── 🏥 Capaian Kepatuhan FKTP: Modul Pemanfaatan Antrol FKTP (KPI, diagram garis tren bulanan, matriks capaian faskes, dan hover popover data antrean).
    │
    ├── ⚡ C. ENGAGEMENTS
    │   └── Activity, Touchpoints, Installs & Uninstalls, Agency, Fraud.
    │
    ├── ⚙️ D. MANAGE
    │   ├── 👥 User: Manajemen Pengguna RBAC 3 Tingkatan (Super Admin, Admin, User) dengan operasi CRUD lengkap, pencarian, dan unduh data CSV.
    │   ├── 📋 Logs [BARU]: Catatan Aktivitas Sistem (Audit Trail) merekam seluruh aktivitas nyata user, admin, dan superadmin termasuk log gagal login, view, add, update, delete, live search, 4 kartu KPI, filter status/aksi/role, dan ekspor CSV resmi.
    │   └── 🔗 Integration [DIPERBARUI]: Pusat Integrasi & Pembaruan Data Capaian (Data Integration & Update Hub — DataIntegrationView.tsx) mengelola sinkronisasi live Google Spreadsheet untuk 11 modul capaian (9 Tab Kepatuhan Mutu FKRTL, Antrol RS, Antrol FKTP Primer), One-Click Master Sync, pencatatan jejak audit UPDATE real-time, dan ekspor rekapitulasi status CSV.
    │
    └── 🚪 E. Keluar Sesi (Log Out)
        └── Aksi: Modal Dialog Konfirmasi Keluar resmi dan pemanggilan `logoutUser()` yang mengembalikan pengguna ke Gerbang Login.
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
