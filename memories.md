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

---

## 4. Metrik Kualitas & Pemantauan (Quality Metrics)
- **Token Efficiency**: 100% kepatuhan bedah modul presisi (*surgical edits*), tanpa pembacaan ulang repositori menyeluruh (*zero unnecessary reads*).
- **Security Posture**: File kredensial lokal (`api-sapa-yanfaskes-*.json`) tidak di-commit dan diamankan dalam `.gitignore`.
- **Integrity Status**: Repositori berada dalam kondisi bersih, terstruktur, siap untuk iterasi fitur dan pengujian performa.
