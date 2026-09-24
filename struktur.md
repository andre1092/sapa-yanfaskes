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
├── 🏠 1. Home
│   └── Deskripsi: Ringkasan eksekutif, portal overview, status integrasi, metrik makro faskes.
│   └── Tab ID: 'home'
│   └── Rute Frontend: '/'
│
├── 🏥 2. FKTP (Fasilitas Kesehatan Tingkat Pertama)
│   └── Deskripsi: Analisis performa pelayanan primer (Puskesmas, Klinik Pratama, Dokter Mandiri).
│   └── Tab ID: 'fktp'
│   └── Rute Frontend: '/fktp'
│
├── 🏢 3. FKRTL (Fasilitas Kesehatan Rujukan Tingkat Lanjutan)
│   └── Deskripsi: Analisis performa rumah sakit dan fasilitas rujukan sekunder/tersier.
│   └── Tab ID: 'fkrtl'
│   └── Sub-Menu:
│       └── 📊 Pemanfaatan Antrol FKRTL (Tab ID: 'fkrtl-antrol')
│           ├── Indikator KPI Utama (Total Antrean, Total SEP, Rasio Pemanfaatan %)
│           ├── Tren Bulanan Pemanfaatan Antrean Online
│           ├── Analisis Agregasi per Faskes / Rumah Sakit
│           └── Analisis Distribusi per Poliklinik Spesialis
│   └── Rute Frontend: '/fkrtl'
│
├── ⚙️ 4. Settings (Admin & Pengaturan)
│   └── Deskripsi: Pengaturan konfigurasi faskes, sinkronisasi Google Spreadsheet, manajemen kredensial, dan preferensi akun.
│   └── Tab ID: 'admin'
│   └── Rute Frontend: '/settings'
│
└── 🚪 5. Log out
    └── Deskripsi: Terminasi sesi pengguna, pembersihan token Auth0 / identitas sesi lokal, dan pengalihan ke gerbang login.
    └── Aksi: `logout()` via Auth0 React SDK
```

---

## 2. Pemetaan Hak Akses Menu (Role-Based Access Control)

| Menu / Sub-Menu | Public / Tamu | Faskes User | Verifikator BPJS | Super Administrator |
| :--- | :---: | :---: | :---: | :---: |
| **Home** | ✅ (Terbatas) | ✅ | ✅ | ✅ |
| **FKTP** | ❌ | ✅ (Data Mandiri) | ✅ (Wilayah Kerja) | ✅ (Seluruh Data) |
| **FKRTL - Antrol** | ❌ | ✅ (Data RS Bersangkutan) | ✅ (Wilayah Kerja) | ✅ (Nasional/Seluruh Data) |
| **Settings** | ❌ | ❌ | ✅ (Profil) | ✅ (Konfigurasi Penuh) |
| **Log out** | ❌ | ✅ | ✅ | ✅ |

---

## 3. Protokol Sinkronisasi Dinamis
Setiap kali pengguna meminta penambahan, perubahan, atau penghapusan item menu:
1. Manifest `struktur.md` harus diperbarui terlebih dahulu.
2. Tipe TypeScript `NavTab` dan daftar konfigurasi `navItems` pada `frontend/src/components/Sidebar.tsx` dimutakhirkan secara konsisten.
3. Rute komponen pada `frontend/src/App.tsx` disinkronkan.
