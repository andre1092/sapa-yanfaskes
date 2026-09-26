# MEMORIES.MD — PERSISTENT AGENT CONTEXT & TASK METRICS
**Proyek**: SAPA YANFASKES (Saluran Analisis Performa & Akselerasi)  
**Entitas**: AntiGravity AI Agent  
**Terakhir Diperbarui**: 2026-09-25  

---

## 1. Identitas Sistem & Sasaran Utama (Core Objectives)
- **Nama Aplikasi**: SAPA YANFASKES (Saluran Analisis Performa & Akselerasi Fasilitas Kesehatan)
- **Target Kinerja**: Waktu respons sub-2-detik (< 2s latency)
- **Konektivitas Data**: Terhubung langsung ke Google Spreadsheet via Service Account & Polars Lazy Engine
- **Tema Desain**: Modern Glassmorphism UI Theme
- **Palet Warna Merek**: BPJS Kesehatan (Hijau: `#009B4D` / `#00A86B`, Biru: `#00529C` / `#0A50A1`, Aksen Cyan: `#06B6D4`)
- **Batasan Biaya**: 100% Free Tier (Vercel Serverless + FastAPI + React Vite + Polars + Google Sheets API + Supabase/Free PostgreSQL)
- **Bahasa Operasional**: Bahasa Indonesia formal dan baku
- **Mandat Deployment Produksi**: Aturan No. 10 — Wajib selalu mengeksekusi komit dan pemicuan rilis produksi secara otomatis setiap kali siklus tugas selesai.

---

## 2. Arsitektur Produksi Aktif
```
sapa-yanfaskes/
├── .agents/
│   ├── rules/rules.md           # Aturan baku sistem & batasan operasional (Termasuk Aturan 10)
│   └── workflows/workflows.md   # Pipeline alur kerja 10 langkah (Mandatory Step 9)
├── api/                         # Serverless Backend API (FastAPI)
│   ├── index.py                 # Endpoint data, parser Polars, integrasi Sheets
│   ├── db.py                    # Koneksi async SQLAlchemy & tenant context
│   └── schemas.sql              # Skema DDL PostgreSQL multi-tenant
├── frontend/                    # Single Page Application (React 19 + Vite)
│   ├── src/                     # Komponen, hook, store Zustand, tema Tailwind
│   └── package.json             # Dependensi frontend
├── documentations/              # Spesifikasi teknis, arsitektur IAM, DevSecOps
├── memories.md                  # Log konteks & status persisten (File ini)
├── source.md                    # Grounding parameter resmi & fakta BPJS Kesehatan
├── struktur.md                  # Manifest hierarki menu aktif
├── feature.md                   # Manifest fitur aktif dashboard
├── requirements.txt             # Dependensi Python backend
└── vercel.json                  # Konfigurasi routing & deployment Vercel
```

---

## 3. Log Riwayat Tugas & Status Proyek (Completed Milestones)

| Tanggal | Tahapan / Milestone | Status | Keterangan |
| :--- | :--- | :--- | :--- |
| **2026-08** | Migrasi Arsitektur | Selesai | Migrasi tuntas dari prototipe lama (Streamlit) ke React 19 + FastAPI di Vercel. |
| **2026-09-24** | Audit Komprehensif Repositori | Selesai | Dilakukan identifikasi menyeluruh 25+ item berkas di repositori. |
| **2026-09-24** | Persetujuan Pengguna (*User Approval*) | Selesai | Pengguna memberikan persetujuan eksplisit ("APPROVED") untuk rencana pembersihan. |
| **2026-09-24** | Pembersihan Berkas Usang (*Cleanup*) | Selesai | Dihapus: `app.py`, `main.py`, `.streamlit/`, `modules/`, `antigravity.rules`, `gw_config.json`, `print_columns.py`, `read_docx.py`, `test_jwks.py`, `test_jwt.py`, `.DS_Store`. |
| **2026-09-24** | Reorganisasi Dokumen Spesifikasi | Selesai | Folder `Enterprise-Grade SAML 2.0 & OIDC Identity Provider (IdP)` dipindahkan ke `documentations/ENTERPRISE SECURITY & IAM ARCHITECTURE/`. |
| **2026-09-24** | Inisialisasi Tata Kelola Wajib | Selesai | Pembentukan berkas `memories.md`, `source.md`, `struktur.md`, dan `feature.md`. |
| **2026-09-24** | Komit Produksi & Verifikasi Build | Selesai | Komit `a2866fb` terbentuk. Kompilasi backend dan build Vite frontend sukses 100%. |
| **2026-09-24** | Implementasi Tema BPJS Kesehatan | Selesai | Penerapan tema resmi BPJS Kesehatan (Dominan Green `#009B4D` & Blue `#00529C`) dengan efek Glassmorphism murni (`.glass-card`, `.glass-panel`, ambient aura). Build Vite tuntas dalam 635ms. |
| **2026-09-24** | Pengesahan Aturan Deployment Otomatis | Selesai | Penambahan Aturan No. 10 (Mandatory Production Deployment), sinkronisasi workflows.md Langkah 9, dan aktivasi `credential.helper store`. |
| **2026-09-24** | Rilis Produksi & Verifikasi CI/CD Otonom | Selesai | Push cabang `main` sukses ke remote GitHub `origin/main` (`b34b125..6a5a1f4`). Kredensial helper store terverifikasi aktif, otomatisasi push otonom berfungsi 100%. |
| **2026-09-24** | Fitur Dark, Light, & System Modes | Selesai | Pembangunan store tema terpadu (Zustand + anti-FOUC + listener OS), token CSS Glassmorphism untuk Light & Dark, komponen ThemeToggle di Header & AdminSettings, lolos uji build (650ms). |
| **2026-09-25** | Penyempurnaan Glassmorphism Transparansi 70% | Selesai | Kalibrasi token CSS kaca ke transparansi 70% (alpha 0.70) di mode Dark & Light, penambahan backdrop-filter saturate(180%), penyelarasan sidebar, build Vite tuntas (658ms). |
| **2026-09-25** | Rekonstruksi Visual Eksekutif BPJS Green & Blue | Selesai | Transformasi total UI/UX institusional BPJS Kesehatan: restrukturisasi Sidebar (Green-to-Blue gradient aktif, clean transparent inaktif, user card), pembaruan Header terpadu, pembangunan portal Home eksekutif dengan 3 modul gateway, perbaikan token CSS tanpa konflik override, build Vite tuntas (638ms). |
| **2026-09-25** | Validasi & Persetujuan Pengguna (User Approval) | Selesai | Pengguna memberikan persetujuan eksplisit ("APPROVED") atas pembaruan sistem visual BPJS Kesehatan dan stabilitas produksi Vercel. |
| **2026-09-25** | Perbaikan Mode Sistem Berbasis Waktu Komputer | Selesai | Integrasi algoritma waktu lokal (18:00 - 05:59 Dark, 06:00 - 17:59 Light) dan preferensi OS pada getSystemTheme() serta anti-FOUC script index.html. Pengecekan real-time via interval 60s, focus, dan visibilitychange. Build Vite tuntas dalam 692ms. |
| **2026-09-25** | Implementasi Menu Dropdown Pengalihan Bahasa (ID/EN) | Selesai | Pembangunan store bahasa (Zustand persist key sapa-language-storage), komponen LanguageSwitcher floating glassmorphism di Header, integrasi dinamis pada Sidebar, Header, Home Overview, dan Theme Toggle, build Vite tuntas dalam 636ms. |
| **2026-09-25** | Perbaikan Clipping Dropdown Bahasa (Header Overflow) | Selesai | Mengganti overflow-hidden dengan overflow-visible z-40 pada Header.tsx dan meningkatkan kontras backdrop-blur-2xl pada LanguageSwitcher.tsx. Build Vite tuntas dalam 640ms. |
| **2026-09-25** | Integrasi Live Google Spreadsheet & 3 Grafik Batang Antrol FKRTL | Selesai | Integrasi langsung spreadsheet publik Google Docs (ID: 1U5OFfqMkN0Wj0ATmkSsplJZD_whfwmh1ef797IH6LnY) via paralel CSV stream + in-memory cache Polars (sub-2s). Pembangunan: (1) Kotak Keterangan "Last Update : MM/DD/YYYY HH:MM:SS" (09/24/2026 03:14:56), (2) Filter 5-dimensi (Kabupaten, Nama Faskes, Bulan, Tahun, Sumber), (3) Grafik Batang Horisontal Bulanan dengan snapshot Timestamp Terbaru per bulan, (4) Grafik Batang Vertikal Faskes dengan scroll horizontal dan toggle sort, (5) Grafik Batang Vertikal Nama Poli dengan mapping ref_poli resmi. Build Vite tuntas dalam 671ms. |
| **2026-09-25** | Investigasi Loading Lama & Error 500 Google Sheets | Selesai | Analisis mendalam akar penyebab: (1) Inisialisasi dependensi database `get_db` yang tidak diperlukan pada endpoint spreadsheet memicu timeout/unhandled exception di serverless Vercel, (2) SSL certificate handshake issue pada `urllib.request`, (3) Cold-start berat dari binary Polars (~115MB) di serverless, (4) Adapter ASGI Mangum belum ter-deploy ke Vercel, (5) Belum adanya fail-safe fallback di frontend. Rencana aksi perbaikan komprehensif disiapkan. |
| **2026-09-25** | Resolusi Tuntas Loading Lama & Error 500 Ter-Deploy | Selesai | Penghapusan dependensi blocking `get_db` pada endpoint spreadsheet, integrasi SSL resilient context & fallback, penyematan Mangum ASGI adapter, dan implementasi dual-layer fail-safe fallback pada React hook. Commit `750abc8` sukses di-deploy ke Vercel production. Teruji via curl: HTTP 200 dengan waktu respons 0.71 detik (sub-detik) dan live data utuh 100%. |
| **2026-09-25** | Transformasi Line Chart Bulanan Capaian Antrol | Selesai | Mengubah visualisasi bulanan pada menu FKRTL > Pemanfaatan Antrol dari grafik batang horizontal menjadi Line Chart Bulanan interaktif berbasis SVG Glassmorphism (cubic bezier curve, area fill gradient BPJS Green & Blue, garis target 85%, interactive markers & hover tooltip dengan snapshot Timestamp Terbaru MM/DD/YYYY HH:MM:SS, serta strip kartu ringkasan). Build Vite tuntas dalam 642ms. |
| **2026-09-25** | Transformasi Grafik Batang Horisontal Faskes & Poli (Target 80% & 95%) | Selesai | Mentransformasi Grafik Batang Faskes dan Grafik Batang Nama Poli menjadi Grafik Batang Horisontal dengan sumbu Y nama lengkap (tanpa terpotong), mistar skala horizontal (0% - 100%), dan dua garis target vertikal putus-putus: Target Antrol Mobile JKN = 80% (Cyan/Sky) dan Target Antrol All Sumber = 95% (Amber/Gold). Garis target ganda 80% & 95% juga diselaraskan pada Line Chart Bulanan SVG. Build Vite tuntas dalam 640ms. |
| **2026-09-25** | Tata Letak Berdampingan (Kiri: Faskes, Kanan: Poli) & Garis Target Kondisional | Selesai | Mengubah tata letak Grafik Faskes dan Grafik Nama Poli menjadi berdampingan (Grid 2 Kolom responsif: Kiri Faskes, Kanan Poli) di bawah Line Chart Bulanan. Menerapkan logika kondisional: Garis Target 80% hanya muncul saat filter Sumber = Mobile JKN, dan Garis Target 95% hanya muncul saat filter Sumber = All Sumber pada Line Chart Bulanan, Grafik Faskes, dan Grafik Poli. Build Vite tuntas dalam 657ms. |
| **2026-09-25** | Implementasi Menu FKRTL > Laporan Kepatuhan FKRTL (8 Tab Indikator) | Selesai | Menambahkan sub-menu FKRTL > Laporan Kepatuhan FKRTL (`fkrtl-kepatuhan`), sinkronisasi `struktur.md`, tipe `NavTab`, `Sidebar.tsx`, `Header.tsx`, dan `App.tsx`. Membangun komponen antarmuka Glassmorphism `LaporanKepatuhanDashboard.tsx` dengan 8 tab indikator: (1) Jadwal Praktek Nakes, (2) Penyelesaian Pengaduan, (3) Umabl Peserta, (4) Update Display TT, (5) Update TMO, (6) Antrean & WTL, (7) Surkon, dan (8) RME. Terintegrasi kartu KPI, filter status/kabupaten, dan matriks faskes. Build Vite tuntas dalam 648ms. |
| **2026-09-26** | Penerapan Palet 7 Warna Resmi BPJS (Clean, Neat & Structured) & Resolusi Kontras Teks | Selesai | Mengonfigurasi token CSS dengan kombinasi 7 kode warna spesifik instruksi pengguna: `#2b4390`, `#44853b`, `#f7fcfa`, `#afbade`, `#83a67e`, `#d4ecd1`, dan `#6573a1`. Memperbaiki bug visual teks putih di atas kartu putih pada mode siang/terang (Light Mode) di seluruh dashboard kepatuhan, antrol, header, dan sidebar menjadi kontras adaptif berstruktur tajam (`text-[#2b4390] dark:text-[#f7fcfa]` & `text-[#6573a1] dark:text-[#afbade]`). Badge status patuh menggunakan latar `#d4ecd1` teks `#44853b`. Build Vite sukses dalam 723ms. |
| **2026-09-26** | Integrasi Live Google Sheets Tab 01. Jadwal Praktek Nakes (Bobot 25%) | Selesai | Menghubungkan Tab 01 Laporan Kepatuhan ke Google Spreadsheet Jadwal Nakes (`1ZAER9fLUrqz-4qs970gog1ZSb1AZn00MAqspzU7HLZU`) dan Referensi Faskes (`17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs`) via parallel stream CSV & in-memory cache (sub-2s latency: 0.94s cold, 14ms warm). Membangun komponen `NakesComplianceTab.tsx` dengan 4 filter (Kabupaten, Nama Faskes, Bulan, Tipe Faskes), kartu KPI "Persen Sesuai" & "Capaian" (bobot 25%), grafik bulanan SVG interaktif Januari-September 2026 dengan garis target 80%, serta tabel matriks detail dengan pencarian, status patuh, dan paginasi. Build Vite sukses dalam 626ms. |
| **2026-09-26** | Transformasi 2 Line Chart Terpisah (Kiri/Kanan), Status Tercapai (Nilai 100), & Restrukturisasi Tabel | Selesai | Mengubah grafik tren bulanan menjadi 2 Line Chart berdampingan: Line Chart Kiri ("Persen Sesuai" Biru `#2b4390`) dan Line Chart Kanan ("Capaian" Hijau `#44853b`). Memperbarui logika status kepatuhan menjadi "Tercapai" jika nilai mencapai 100 dan "Belum Tercapai" jika di bawah 100. Merestrukturisasi kolom tabel matriks menjadi: Nama Faskes, Tipe Faskes, Total Kunjungan, Tidak Sesuai, Sesuai, Persen Sesuai, Capaian, dan Status. Build Vite sukses dalam 633ms. |
| **2026-09-26** | Implementasi Cascading Dependent Filters (Kabupaten, Nama Faskes, Tipe Faskes) | Selesai | Memperbaiki anomali opsi filter di mana seluruh faskes dan tipe faskes muncul saat Kabupaten Jember atau Bondowoso dipilih. Mengimplementasikan generator filter dependen di backend FastAPI (`api/index.py`), auto-reset state di frontend (`NakesComplianceTab.tsx`), dan sanitasi mismatch filter. Pengujian assert unit backend lulus 100%, build Vite tuntas (655ms). |
| **2026-09-26** | Penyelarasan Nomenklatur Indikator, Target Nasional 100%, Definisi HFIS, & Nama Tab | Selesai | Memperbarui header banner modul kepatuhan menjadi "Kesesuaian Jadwal Praktik Dokter atau Tenaga Kesehatan", deskripsi definisi resmi HFIS (bobot 25%), target nasional nakes menjadi 100% (indikator badge &ge; 100%), dan menghilangkan frasa "- bobot 25%" pada nama tombol tab "01. Jadwal Praktek Nakes". Build Vite sukses (681ms). |
| **2026-09-26** | Implementasi Tab 02. Penyelesaian Pengaduan (Bobot 20%) & Dinamisasi Banner Header | Selesai | Integrasi langsung Google Spreadsheet Pengaduan (`1iOsYZmtLLcLbKiqgbt8NJqEFoEeHorL7qE6PQwswvbk`) dan Referensi Faskes (`17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs`) via parallel stream CSV & in-memory cache pada backend FastAPI (`/api/v1/fkrtl-kepatuhan/pengaduan`). Membangun komponen antarmuka `PengaduanComplianceTab.tsx` dengan filter cascading 4-dimensi, 4 kartu KPI (Capaian rata-rata, kontribusi 20%, total pengaduan, status), Line Chart bulanan SVG interaktif dengan garis target 100 poin, dan tabel matriks 10 kolom persis sesuai instruksi. Mengimplementasikan dinamisasi judul & sub judul banner header secara reaktif pada `LaporanKepatuhanDashboard.tsx` saat pergantian tab (Tab 01 vs Tab 02). Build Vite tuntas 100% (625ms). |
| **2026-09-26** | Penyesuaian Label Badge Persentase Tab Kepatuhan (Tab 01: 25% & Tab 02: 20%) | Selesai | Menyesuaikan label badge persentase pada tombol tab kepatuhan FKRTL di `LaporanKepatuhanDashboard.tsx`: Tab 01 "Jadwal Praktek Nakes" menampilkan badge `25%` dan Tab 02 "Penyelesaian Pengaduan" menampilkan badge `20%` (mencerminkan bobot pilar indikator resmi), sementara target kepatuhan nasional pada banner header tetap konsisten dipertahankan $\ge 100\%$. Build Vite sukses tuntas (665ms). |
| **2026-09-26** | Deduplikasi Faskes Tabel & Logika Formula Capaian Resmi Tab 01 Nakes | Selesai | Mengimplementasikan pengelompokan berbasis faskes unik (`kode_ppk`) pada tabel kepatuhan nakes sehingga tidak ada duplikasi baris faskes (26 faskes unik KC Jember). Menghitung sum Total Kunjungan, sum Tidak Sesuai, sum Sesuai, serta Persen Sesuai tertimbang. Menerapkan logika perhitungan Capaian resmi: 100 (jika 100% sesuai atau tidak ada kunjungan), 75 (>60%-<100%), 50 (>40%-60%), 25 (>20%-40%), dan 0 (<=20%). Status Tercapai jika Capaian = 100, Belum Tercapai jika < 100. Build Vite tuntas 100% (654ms). |
| **2026-09-26** | Revitalisasi Desain UI Menu Pengaturan (Admin Settings) dengan 7 Warna BPJS | Selesai | Mentransformasi antarmuka `AdminSettings.tsx` dan `ThemeToggle.tsx` (expanded mode) berstandar resmi BPJS Kesehatan: (1) Menghilangkan teks tidak terbaca (*zero invisible text*) dengan kontras adaptif `#2b4390` & `#6573a1`, (2) Banner eksekutif berbadge sistem dan status operasional real-time, (3) Kartu sinkronisasi data cache FKRTL (Pemanfaatan Antrol 2.052 baris & Kepatuhan Mutu Tab 01-02), (4) Kartu pemilih tema Glassmorphism 7 warna kontras tinggi, (5) Panel ringkasan DevSecOps & infrastruktur. Build Vite sukses tuntas (773ms). |

---

## 4. Metrik Kualitas & Pemantauan (Quality Metrics)
- **Token Efficiency**: 100% kepatuhan bedah modul presisi (*surgical edits*), tanpa pembacaan ulang repositori menyeluruh (*zero unnecessary reads*).
- **Security Posture**: File kredensial lokal (`api-sapa-yanfaskes-*.json`) tidak di-commit dan diamankan dalam `.gitignore`.
- **Integrity Status**: Repositori berada dalam kondisi bersih, terstruktur, siap untuk iterasi fitur dan pengujian performa.

