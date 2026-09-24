# FEATURE.MD — MANIFEST FITUR APLIKASI
**Proyek**: SAPA YANFASKES (Saluran Analisis Performa & Akselerasi)  
**Versi Manifest**: 1.0.0  
**Terakhir Diperbarui**: 2026-09-24  

---

## 1. Fitur Utama Sistem (Core Features)

### A. Pengalihan Tema Antarmuka (Theme Toggle Engine)
- **Mode yang Didukung**:
  - 🌙 **Dark Mode**: Latar belakang gelap futuristik Slate (`#0B0F19` / `#0F172A`) dengan kontras kartu glassmorphism tinggi.
  - ☀️ **Light Mode**: Latar belakang terang bersih bernuansa institusional medis (`#F8FAFC` / `#FFFFFF`) dengan bayangan halus.
  - 💻 **System Theme**: Mengikuti preferensi otomatis tema pada sistem operasi / peramban pengguna.
- **Implementasi**: Integrasi Tailwind CSS class-based dark mode (`dark` class pada elemen `<html>`) disimpan dalam `localStorage`.

### B. Pengalihan Bahasa Sistem (Language Switching)
- **Bahasa yang Didukung**:
  - 🇮🇩 **Bahasa Indonesia (ID)**: Bahasa utama operasional dan pelaporan institusi resmi.
  - 🇬🇧 **English (EN)**: Bahasa internasional untuk keperluan presentasi dan standarisasi global.
- **Implementasi**: Penanganan kamus translasi dinamis untuk judul metrik, label filter, tooltip, dan pesan status sistem.

---

## 2. Fitur Analisis & Visualisasi Data (Data Analytics & Visualization)

### A. Filter Multi-Dimensi Berkecepatan Tinggi
- **Filter Periode / Waktu**: Filter tahunan dan bulanan dengan pemilahan data instan via Polars LazyFrame di backend.
- **Filter Wilayah**: Berdasarkan Kabupaten / Kota.
- **Filter Kelas Rumah Sakit**: Kelas A, Kelas B, Kelas C, dan Kelas D.
- **Filter Faskes / Rumah Sakit**: Pencarian autokomplet nama RS dengan penggabungan cerdas atribut *fallback*.
- **Filter Poliklinik**: Analisis spesifik poli rawat jalan (Penyakit Dalam, Anak, Kebidanan, Bedah, dll).

### B. Kartu Indikator Kinerja Utama (KPI Indicator Cards)
- **Total Antrean Terbit**: Menampilkan agregat pemanfaatan antrean melalui kanal Mobile JKN dan Bridging.
- **Total SEP RJTL**: Menampilkan total kunjungan rawat jalan tingkat lanjutan.
- **Rasio Pemanfaatan (%)**: Persentase kepatuhan dengan penanda visual warna status (Hijau $\ge 85\%$, Kuning $60-84\%$, Merah $<60\%$).

### C. Visualisasi Interaktif Plotly.js
- **Grafik Tren Garis & Batang**: Menampilkan pergerakan pemanfaatan antrol dari bulan ke bulan.
- **Grafik Agregasi per Faskes**: Komparasi performa antrean antar faskes dalam wilayah kerja.
- **Grafik Distribusi per Poliklinik**: Identifikasi poli dengan adopsi antrol tertinggi dan terendah.

---

## 3. Fitur Ekspor & Pelaporan (Export & Reporting Engine)

### A. Ekspor Data Tabular Excel (`.xlsx`)
- Pembuatan berkas spreadsheet terformat menggunakan **ExcelJS** di sisi klien secara instan tanpa membebani server.
- Menyertakan header berlogo BPJS, styling warna tabel, dan kalkulasi otomatis rasio pemanfaatan.

### B. Ekspor Visual Gambar Beresolusi Tinggi (`.jpeg`)
- Pengambilan tangkapan visual komponen dashboard menggunakan library **html-to-image**.
- Rendering tabel dan grafik berposisi rapi tanpa terpotong (*off-screen positioning technique*).

---

## 4. Fitur Keamanan & Multi-Tenant (Security & IAM)
- **Otentikasi Aman**: Integrasi OAuth 2.0 / OIDC melalui Auth0 React SDK.
- **Isolasi Data Multi-Tenant**: Context injection pada query PostgreSQL dan filter token faskes sehingga pengguna RS hanya dapat melihat data fasilitas kesehatannya sendiri.
- **Perlindungan Token**: Tanpa penyimpanan kunci privat Google Service Account di sisi publik frontend.
