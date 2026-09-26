# FEATURE.MD — MANIFEST FITUR APLIKASI
**Proyek**: SAPA YANFASKES (Saluran Analisis Performa & Akselerasi)  
**Versi Manifest**: 1.0.0  
**Terakhir Diperbarui**: 2026-09-24  

---

## 1. Fitur Utama Sistem (Core Features)

### A. Desain Antarmuka & Tema BPJS Kesehatan (Clean, Neat & Structured BPJS Theme) [STATUS: AKTIF / LIVE]
- **Karakteristik Visual & Palet Warna Standar (Kombinasi 7 Warna Resmi BPJS)**:
  - 🏛️ **Royal Navy Blue (`#2b4390`)**: Identitas utama institusi BPJS, teks judul/heading, nilai KPI primer, dan border aktif.
  - 🌿 **Forest Green (`#44853b`)**: Simbol kesehatan, capaian target patuh, tombol gradasi aksi (`bpjs-gradient-btn`), dan pulsator aktif.
  - ⚪ **Clean Mint White (`#f7fcfa`)**: Dasar latar belakang Light Mode dan kontras teks utama pada Dark Mode.
  - 🪟 **Soft Periwinkle (`#afbade`)**: Garis batas kartu (*border*), divider elegan, dan aksen latar netral.
  - 🍃 **Sage Green (`#83a67e`)**: Aksen gradasi pencapaian, garis tepi sekunder, dan penanda harmoni visual.
  - 🟢 **Mint Light Tint (`#d4ecd1`)**: Latar belakang badge status Patuh, badge indikator aktif, dan efek hover baris tabel yang lembut.
  - 🔷 **Slate Blue Midtone (`#6573a1`)**: Tipografi sekunder, label filter berstruktur, dan deskripsi indikator yang terbaca tajam.
- **Penyempurnaan Aksesibilitas & Kontras Adaptif (Zero Invisible Text)**:
  - Mengeliminasi masalah teks putih di atas kartu putih pada mode siang/terang (Light Mode).
  - Seluruh komponen (Dashboard Kepatuhan, Antrol, Header, Sidebar) secara dinamis menggunakan utilitas warna adaptif: `text-[#2b4390] dark:text-[#f7fcfa]` untuk judul dan angka KPI, serta `text-[#6573a1] dark:text-[#afbade]` untuk keterangan.
  - Badge kepatuhan menggunakan latar belakang `#d4ecd1` dengan teks `#44853b` yang kontras dan berwibawa di mode terang.
- **Mode Tema (Theme Modes) [STATUS: AKTIF / LIVE]**:
  - 🌙 **Dark Glassmorphism**: Slate gelap dalam (`#0c1427` / `#0f172a`) berpadu gradasi `#44853b` dan `#2b4390`.
  - ☀️ **Light Glassmorphism**: Medis bersih `#f7fcfa` dengan kartu putih terstruktur, border `#afbade`/`#83a67e`, dan teks `#2b4390` yang tajam.
  - 💻 **System Theme (Sinkronisasi Waktu Komputer & OS)**: Mengikuti waktu lokal komputer pengguna secara cerdas (otomatis Mode Gelap pada pukul 18:00 – 05:59 dan Mode Terang pada pukul 06:00 – 17:59), serta sinkronisasi dinamis dengan preferensi skema warna OS.
  - **Komponen Kontrol**: `ThemeToggle` segmented control di header utama (`Header.tsx`) dan kartu pemilih visual di `AdminSettings.tsx`.

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
- **Tab 01. Jadwal Praktek Nakes [STATUS: LIVE INTEGRASI SPREADSHEET]**:
  - **Koneksi Live Google Spreadsheet**: Terhubung langsung secara paralel ke Spreadsheet Jadwal Nakes (`1ZAER9fLUrqz-4qs970gog1ZSb1AZn00MAqspzU7HLZU`) dan Master Referensi Faskes (`17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs`) dengan *join match rate* 100% (228 baris).
  - **Filter 4 Dimensi dengan Cascading / Dependent Filtering Dinamis**:
    - **Kabupaten**: Bondowoso, Jember, Lumajang (Master wilayah KC Jember).
    - **Nama Faskes (FKRTL)**: Disaring secara dinamis (*dependent cascading*) hanya memuat faskes di kabupaten yang aktif (misal: 14 faskes saat Jember dipilih, 3 faskes saat Bondowoso dipilih, 9 faskes saat Lumajang dipilih).
    - **Tipe Faskes**: Disaring secara dinamis (*dependent cascading*) hanya memuat tipe faskes yang ada di kabupaten terpilih (misal: 3 tipe faskes di Bondowoso).
    - **Bulan**: Januari s.d. September 2026.
    - **Mekanisme Auto-Reset Tangguh**: Pergantian kabupaten secara otomatis mereset nilai faskes/tipe faskes ke "Semua" dan melakukan sanitasi pada backend sehingga tidak terjadi anomali data faskes luar daerah ataupun filter kosong (*deadlock*).
  - **Kartu Ringkasan KPI**:
    - **"Persen Sesuai"**: Rata-rata dan tertimbang kesesuaian jadwal praktek dokter terhadap jadwal resmi dengan badge target 100%.
    - **"Capaian"**: Skor poin bertingkat (0, 25, 50, 75, 100) dengan penanda bobot 25%.
    - **Total Kunjungan**: Realisasi kunjungan dokter nakes terdata (Sesuai vs Tidak Sesuai).
    - **Status Kepatuhan RS**: Jumlah faskes berstatus **Tercapai** (nilai 100) vs **Belum Tercapai** (nilai < 100).
  - **Dua Line Chart Bulanan Berdampingan (Kiri & Kanan)**:
    - **Grafik Kiri (Line Chart Persen Sesuai)**: Kurva garis dan area SVG warna Royal Navy Blue (`#2b4390`) yang memetakan tren Persen Sesuai per bulan (Januari s.d. September 2026), garis target 100%, serta tooltip interaktif.
    - **Grafik Kanan (Line Chart Capaian)**: Kurva garis dan area SVG warna Forest Green (`#44853b`) yang memetakan tren Capaian Poin (0 - 100) per bulan, garis target 100 poin, serta tooltip interaktif.
  - **Tabel Matriks Nakes Berstruktur Rapi**:
    - Kolom terstruktur: `No`, `Nama Faskes`, `Tipe Faskes`, `Total Kunjungan`, `Tidak Sesuai`, `Sesuai`, `Persen Sesuai`, `Capaian`, dan `Status` (Tercapai / Belum Tercapai).
    - Dilengkapi pencarian *live search*, filter status, pengurutan kolom (*sorting*), dan paginasi adaptif.
- **Tab 02. Penyelesaian Pengaduan [STATUS: LIVE INTEGRASI SPREADSHEET]**:
  - **Koneksi Live Google Spreadsheet**: Terhubung ke Spreadsheet Pengaduan (`1iOsYZmtLLcLbKiqgbt8NJqEFoEeHorL7qE6PQwswvbk`) dan Master Referensi Faskes (`17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs`) via parallel stream CSV & cache Polars (sub-2s latency).
  - **Filter 4 Dimensi dengan Cascading Dinamis**: Kabupaten, Nama Faskes, Bulan, Tipe Faskes dengan auto-reset dan auto-sanitize.
  - **Dinamisasi Judul Banner Otomatis**: Judul berganti menjadi "Tindak Lanjut dan Penyelesaian Pengaduan" dan Sub Judul menjadi "Waktu penyelesaian pengaduan atau SLA 1 sampai 3 hari kerja sejak diterimanya pengaduan pada Aplikasi SIPP - bobot 20%".
  - **4 Kartu Ringkasan KPI**: Rata-rata Capaian (skala 100), Kontribusi Nilai Riil (bobot 20%), Pengaduan Bulan Penilaian (Sesuai SLA vs Tidak Ditindaklanjuti), dan Status Kepatuhan RS (Tercapai nilai 100 vs Belum Tercapai).
  - **Grafik Tren Bulanan (Line Chart)**: Kurva SVG interaktif dengan garis target 100 poin dan tooltip detail bulanan.
  - **Tabel Matriks Kepatuhan Pengaduan**: Kolom No, Nama Faskes, Tipe Faskes, Pengaduan 3 Bln Terakhir, Jml Pengaduan Bln Penilaian, Jml Pengaduan Ditindaklanjuti Sesuai SLA, Jml Pengaduan Top 10 Thn Lalu, Jml Pengaduan Tidak Ditindaklanjuti, Capaian, dan Status (Tercapai / Belum Tercapai).
- Dilengkapi **8 Segmented Glassmorphism Tabs**:
  1. 👨‍⚕️ **01. Jadwal Praktek Nakes**: Monitoring kesesuaian jadwal praktek dokter spesialis / nakes terintegrasi live Google Sheets (Target: 100%, Bobot: 25%).
  2. 📢 **02. Penyelesaian Pengaduan**: Tindak lanjut dan penyelesaian pengaduan sesuai SLA 1-3 hari kerja di Aplikasi SIPP terintegrasi live Google Sheets (Target: 100%, Bobot: 20%).
  3. 💬 **03. Umabl Peserta**: Evaluasi Indeks Kepuasan Peserta (IKP) melalui instrumen KESSAN (Target: ≥88%).
  4. 🛏️ **04. Update Display TT**: Pemutakhiran real-time integrasi ketersediaan tempat tidur rawat inap (Target: ≥95%).
  5. 💊 **05. Update TMO**: Pemutakhiran Tempat Pelayanan Obat kronis/PRB dan Telemedicine (Target: ≥85%).
  6. ⏱️ **06. Antrean & WTL**: Pemantauan Waktu Tunggu Layanan poliklinik & farmasi serta integrasi sistem antrol (Target: ≥85%).
  7. 📝 **07. Surkon**: Penerbitan Surat Kontrol terjadwal melalui bridging sistem elektronik (Target: ≥90%).
  8. 📑 **08. RME**: Tingkat integrasi Rekam Medis Elektronik dengan platform SatuSehat & BPJS Kesehatan (Target: ≥95%).

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
