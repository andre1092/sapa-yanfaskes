# FEATURE.MD — MANIFEST FITUR APLIKASI
**Proyek**: SAPA YANFASKES (Saluran Analisis Performa & Akselerasi)  
**Versi Manifest**: 1.0.0  
**Terakhir Diperbarui**: 2026-09-24  

---

## 1. Fitur Utama Sistem (Core Features)

### A. Desain Antarmuka & Tema BPJS Kesehatan (BPJS Health Glassmorphism Theme)
- **Karakteristik Visual Utama**:
  - 🌿 **Warna Utama (BPJS Green)**: `#009B4D` / Emerald `#10B981` (melambangkan keandalan pelayanan kesehatan dan mutu fasilitas).
  - 🌊 **Warna Sekunder (BPJS Blue)**: `#00529C` / `#0A50A1` (melambangkan jaminan sosial yang kokoh dan integritas data terpusat).
  - 🪟 **Efek Glassmorphism Modern**:
    - Kartu dan panel translusen berkalibrasi 70% transparansi (`.glass-panel`, `.glass-card`, `.glass-input`, sidebar) dengan *backdrop blur* 20px, *optical saturation* 180%, dan garis tepi cahaya lembut (`border-emerald-500/20` & `border-white/10`).
    - *Ambient Lighting Aura*: Dua bola cahaya gradasi hijau dan biru di latar belakang aplikasi yang dibiaskan oleh kaca panel.
    - Kontras teks tinggi (*accessible high-contrast*) dengan keterbacaan optimal di atas panel kaca gelap.
- **Mode Tema (Theme Modes) [STATUS: AKTIF / LIVE]**:
  - 🌙 **Dark Glassmorphism**: Dominan Slate gelap (`#0B0F19` / `#0F172A`) berpadu gradasi hijau zamrud dan biru laut BPJS.
  - ☀️ **Light Glassmorphism**: Versi terang dengan frosted glass putih medis (`#F8FAFC`), kontras tinggi, border halus, dan aksen hijau-biru BPJS.
  - 💻 **System Theme (Sinkronisasi Waktu Komputer & OS)**: Mengikuti waktu lokal komputer pengguna secara cerdas (otomatis Mode Gelap pada pukul 18:00 – 05:59 dan Mode Terang pada pukul 06:00 – 17:59), serta sinkronisasi dinamis dengan preferensi skema warna OS via `matchMedia`, `focus`, dan `visibilitychange`.
  - **Komponen Kontrol**: `ThemeToggle` segmented control di header utama (`Header.tsx`) dan kartu pemilih visual di `AdminSettings.tsx`.
  - **Zero-FOUC Engine**: Dilengkapi inline script anti-flicker di `index.html` dan sinkronisasi store Zustand persisten (`localStorage`) dengan kalkulasi waktu instan.

### B. Pengalihan Bahasa Sistem (Language Switching) [STATUS: AKTIF / LIVE]
- **Bahasa yang Didukung**:
  - 🇮🇩 **Bahasa Indonesia (ID)**: Bahasa utama operasional dan pelaporan institusi resmi BPJS Kesehatan (default).
  - 🇬🇧 **English (EN)**: Bahasa internasional untuk keperluan presentasi dan standarisasi global.
- **Komponen Kontrol**: `LanguageSwitcher` floating glassmorphism dropdown di `Header.tsx` dengan bendera negara (🇮🇩 / 🇬🇧), indikator centang aktif, penutup otomatis *click-outside* & tombol *Esc*.
- **Mesin Lokalisasi**: `languageStore.ts` (Zustand + `persist` ke `localStorage` key `sapa-language-storage`), sinkronisasi atribut `document.documentElement.lang`, serta kamus translasi bilingual komprehensif (`t(...)`) untuk Header, Breadcrumbs, Sidebar, Portal Overview, dan Theme Toggle.

---

## 2. Fitur Analisis & Visualisasi Data (Data Analytics & Visualization)

### A. Integrasi Live Google Spreadsheet & Kotak Keterangan Last Update [STATUS: AKTIF / LIVE]
- **Sumber Data Langsung**: Terhubung langsung ke spreadsheet publik Google Docs (`1U5OFfqMkN0Wj0ATmkSsplJZD_whfwmh1ef797IH6LnY`) tanpa biaya API berbayar dengan respons sub-2 detik.
- **Kotak Keterangan Last Update**: Terletak di bagian atas dashboard dengan format baku `"Last Update : MM/DD/YYYY HH:MM:SS"` (misal: `09/24/2026 03:14:56`) yang diambil dari baris timestamp terakhir data spreadsheet.

### B. Filter Multi-Dimensi (5 Dimensi Terhubung) [STATUS: AKTIF / LIVE]
- **Kabupaten**: Pemilihan wilayah (Semua Kabupaten, Bondowoso, Jember, Lumajang).
- **Nama Faskes**: Opsi daftar rumah sakit FKRTL yang secara dinamis tersaring sesuai Kabupaten yang dipilih.
- **Bulan**: Pemilihan periode bulan (Semua Bulan, September 2026, Agustus 2026, dst.).
- **Tahun**: Pemilihan tahun transaksi (2026).
- **Sumber Antrean**: Pemilahan kanal pendaftaran antrean (All Sumber / Mobile JKN).

### C. Visualisasi Analitik Khusus FKRTL [STATUS: AKTIF / LIVE]
1. **Line Chart Bulanan — Tren Capaian Antrol (Full Width)**:
   - Visualisasi kurva garis halus (*SVG Interactive Line Chart*) dinamis yang menghubungkan tren capaian antrol per bulan secara kronologis.
   - Mengambil data dari **Timestamp Terbaru** (`max(Timestamp)`) pada penutupan setiap bulan dengan informasi snapshot berformat `MM/DD/YYYY HH:MM:SS` (contoh: `01/31/2026 23:59:59` s.d. `09/24/2026 03:14:56`).
   - Garis target benchmark adaptif: **Garis Target 80%** hanya muncul saat filter Sumber = Mobile JKN, dan **Garis Target 95%** hanya muncul saat filter Sumber = All Sumber.
   - Dilengkapi *area fill gradient* bernuansa BPJS (Emerald ke Biru), *interactive data point markers*, dan *hover tooltip card* yang menampilkan capaian serta stempel waktu snapshot terbaru.
   - Dilengkapi strip daftar kartu snapshot stempel waktu terbaru per bulan di bawah grafik yang tersinkronisasi interaktif dengan kurva.
2. **Layout Grid 2 Kolom Berdampingan (Kiri: Faskes, Kanan: Nama Poli)**:
   - Di bawah Line Chart Bulanan, Grafik Faskes dan Grafik Nama Poli diposisikan berdampingan dalam grid responsif (`grid-cols-1 xl:grid-cols-2`).
   - **Grafik Batang Horisontal Faskes (Kolom Kiri)**:
     - Sumbu Y: Nama Faskes / Rumah Sakit FKRTL.
     - Sumbu X: Capaian 0% s.d. 100%.
     - **Garis Target Dinamis**: Garis vertikal putus-putus Target 80% (Cyan/Sky) aktif hanya bila Sumber = Mobile JKN; Garis Target 95% (Amber/Gold) aktif hanya bila Sumber = All Sumber.
     - Mistar skala horizontal, pewarnaan batang adaptif, badge pencapaian target, dan tombol pengurutan (Tertinggi ↓ / Terendah ↑).
   - **Grafik Batang Horisontal Nama Poli (Kolom Kanan)**:
     - Sumbu Y: Nama Poliklinik resmi dari master `ref_poli`.
     - Sumbu X: Capaian 0% s.d. 100%.
     - **Garis Target Dinamis**: Garis vertikal putus-putus Target 80% aktif hanya bila Sumber = Mobile JKN; Target 95% aktif hanya bila Sumber = All Sumber.
     - Mistar skala horizontal, pewarnaan batang adaptif, badge pencapaian target, dan tombol pengurutan.

### D. Modul Laporan Kepatuhan FKRTL (8 Indikator Mutu Rumah Sakit) [STATUS: AKTIF / LIVE]
- Terletak pada menu **FKRTL > Laporan Kepatuhan FKRTL** (`fkrtl-kepatuhan`).
- Dilengkapi **8 Segmented Glassmorphism Tabs**:
  1. 👨‍⚕️ **01. Jadwal Praktek Nakes**: Monitoring kesesuaian jadwal praktek dokter spesialis / nakes dengan sistem antrean online faskes (Target: ≥90%).
  2. 📢 **02. Penyelesaian Pengaduan**: Kecepatan respon dan tingkat penuntasan keluhan peserta JKN di rumah sakit (Target: ≥95%).
  3. 💬 **03. Umabl Peserta**: Evaluasi Indeks Kepuasan Peserta (IKP) melalui instrumen KESSAN (Target: ≥88%).
  4. 🛏️ **04. Update Display TT**: Pemutakhiran real-time integrasi ketersediaan tempat tidur rawat inap (Target: ≥95%).
  5. 💊 **05. Update TMO**: Pemutakhiran Tempat Pelayanan Obat kronis/PRB dan Telemedicine (Target: ≥85%).
  6. ⏱️ **06. Antrean & WTL**: Pemantauan Waktu Tunggu Layanan poliklinik & farmasi serta integrasi sistem antrol (Target: ≥85%).
  7. 📝 **07. Surkon**: Penerbitan Surat Kontrol terjadwal melalui bridging sistem elektronik (Target: ≥90%).
  8. 📑 **08. RME**: Tingkat integrasi Rekam Medis Elektronik dengan platform SatuSehat & BPJS Kesehatan (Target: ≥95%).
- Dilengkapi kartu statistik agregasi (Rata-rata Capaian, RS Patuh, RS Belum Patuh, Total RS), filter interaktif (Kabupaten, Status Kepatuhan), dan kotak live search rumah sakit.

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
