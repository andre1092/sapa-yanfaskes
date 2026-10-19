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

### C. Bilah Navigasi Samping Auto-Hide & Hover-Expand (Icon-Only Rail Mode) [STATUS: AKTIF / LIVE]
- **Perilaku Kursor Menjauh (Auto-Collapse / Unhover)**:
  - Bilah navigasi samping secara otomatis menyusut (*auto-hide/collapse*) menjadi rel ramping (*slim rail*).
  - Menyembunyikan seluruh teks label menu, kategori header, nama brand teks, dan detail akun profil.
  - **Murni hanya menampilkan simbol/ikon menu** navigasi secara rapi, vertikal, dan presisi di tengah kolom rel.
  - Dilengkapi atribut `title` pada masing-masing ikon sebagai indikator kontekstual saat pengguna mengarahkan kursor ke ikon tertentu.
- **Perilaku Kursor Mendekat (Hover-Expand)**:
  - Bilah navigasi melebar kembali secara mulus (*smooth transition* `transition-all duration-300 ease-in-out`).
  - Menampilkan kembali nama aplikasi, badge status, judul kategori menu, label teks menu lengkap, chevron ekspansi, serta panel profil pengguna dan tombol logout.
- **Komponen Pengendali**: `Sidebar.tsx` dan `InsightTracerDashboard.tsx`.

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
- Dilengkapi **9 Segmented Glassmorphism Tabs Terintegrasi Google Drive Folder**:
  0. 🏆 **00. Ringkasan Nilai Akhir**: Konsolidasi capaian 8 pilar standar mutu kepatuhan FKRTL terintegrasi live dari spreadsheet `nilai_kepatuhan_fkrtl` (Target Nasional: ≥85.00 Poin).
  1. 👨‍⚕️ **01. Jadwal Praktik Nakes**: Monitoring kesesuaian jadwal praktek dokter spesialis / nakes terintegrasi live dari subfolder `01 JADWAL PRAKTIK NAKES/01_jadwal_praktik` (Target: 100%, Bobot: 25%).
  2. 📢 **02. Penyelesaian Pengaduan**: Tindak lanjut dan penyelesaian pengaduan sesuai SLA 1-3 hari kerja di Aplikasi SIPP terintegrasi live dari subfolder `02 PENYELESAIAN PENGADUAN/02_penyelesaian_pengaduan_FKRTL` (Target: 100%, Bobot: 20%).
  3. 💬 **03. Umbal Peserta (KESSAN)**: Evaluasi Indeks Kepuasan Peserta (IKP) melalui instrumen KESSAN terintegrasi live dari subfolder `03 UMBAL PESERTA/03_umbal_peserta` (Target: ≥100% target responden, Bobot: 10%).
  4. 🛏️ **04. Update Display TT**: Pemutakhiran ketersediaan tempat tidur rawat inap terintegrasi live dari subfolder `04 UPDATE DISPLAY TT/04_display_tt` (Target: ≥25 hari, Bobot: 10%).
  5. 💊 **05. Update TMO**: Pemutakhiran Tempat Pelayanan Obat kronis/PRB dan Jadwal Tindakan Operasi terintegrasi live dari subfolder `05 UPDATE TMO/05_update_tmo` (Target: 100%, Bobot: 5%).
  6. ⏱️ **06. Antrean MJKN & WTL**: Pemantauan Waktu Tunggu Layanan Task 2-4 dan rasio adopsi antrean Mobile JKN terintegrasi live dari subfolder `06 ANTREAN MJKN DAN WAKTU TUNGGU/06_antrean_waktu_tunggu` (Target: 100%, Bobot: 20%).
  7. 📝 **07. Surkon**: Penerbitan Surat Kontrol & SPRI bridging sistem V-Claim BPJS Kesehatan terintegrasi live dari subfolder `07 SURKON/07_surkon_terbit` (Target: ≥90%, Bobot: 5%).
  8. 📑 **08. RME**: Tingkat integrasi dan adopsi Rekam Medis Elektronik rawat jalan & rawat inap ≤ 7 hari terintegrasi live dari subfolder `08 RME/08_RME` (Target: ≥95%, Bobot: 5%).

### E. Modul Pemanfaatan Antrol FKTP (Fasilitas Kesehatan Tingkat Pertama) [STATUS: DALAM PENGEMBANGAN]
- Terletak pada menu **FKTP > Pemanfaatan Antrol** (`fktp-antrol`).
- **Integrasi Live Google Spreadsheet**:
  - Spreadsheet Capaian Antrol FKTP (`1vjrWC6LxtgQojQmqP0MtXn4hsIWZCNuMJa2P0kW--Wo`) dan Ref Faskes FKTP (`1vxR2JmrvFZVvO4m8VsT8Vryl5NCkonNaNya5H99gqj4`) melalui relasi kunci `kode_fktp`.
- **Sistem Filter 4-Dimensi**:
  - `bulan`: Diekstraksi dari kolom `Timestamp` (Januari - September 2026).
  - `kabupaten`: Bondowoso, Jember, Lumajang (dari sheet referensi).
  - `jenis_fktp`: Puskesmas, Klinik Pratama, Dokter Keluarga, Dokter Gigi, Klinik TNI, Klinik Polri.
  - `sumber_antrean`: Mobile JKN dan All Sumber.
- **Visualisasi & Analisis Data**:
  - **Grafik Tren Bulanan**: SVG Interactive Line Chart kurva tren capaian per bulan Januari s.d. September 2026 dengan target benchmark 80% (Mobile JKN) dan 95% (All Sumber), dilengkapi Zero Layout Shift container.
  - **Tabel Pemanfaatan Antrol FKTP**: Menampilkan kolom `nama_fktp` dan `persentase_capaian`.
  - **Interaksi Hover Floating Tooltip**: Saat kursor diletakkan di atas angka `persentase_capaian`, muncul informasi mengambang (*floating tooltip*) memuat:
    1. `sumber_antrean_cf`
    2. `sumber_antrean_total_transaksi`
    3. `total_transaksi`
    4. `persentase_capaian`
    5. `sumber_antrean`

---

## 3. Fitur Ekspor & Pelaporan (Export & Reporting Engine)

### A. Ekspor Data Tabular Excel (`.xlsx`)
- Pembuatan berkas spreadsheet terformat menggunakan **ExcelJS** di sisi klien secara instan tanpa membebani server.
- Menyertakan header berlogo BPJS, styling warna tabel, dan kalkulasi otomatis rasio pemanfaatan.

### B. Ekspor Visual Gambar Beresolusi Tinggi (`.jpeg`)
- Pengambilan tangkapan visual komponen dashboard menggunakan library **html-to-image**.
- Rendering tabel dan grafik berposisi rapi tanpa terpotong (*off-screen positioning technique*).

---

## 4. Fitur Keamanan & Multi-Tenant (Security & IAM) [STATUS: AKTIF / LIVE]
- **Gerbang Masuk Resmi (Official Login Page — Split-Screen Enterprise Portal)**:
  - Mengusung tata letak dua kolom (**Split-Screen Enterprise**) non-AI yang bersih, terpercaya, dan berwibawa:
    - **Panel Kiri (Branding Institusional BPJS Kesehatan)**: Latar belakang solid warna hijau resmi BPJS Kesehatan (`#009B4D`), logo lambang resmi BPJS Kesehatan, informasi pilar 8 indikator kepatuhan, integrasi data real-time, serta penanda legal hak cipta institusi BPJS Kesehatan. Menghindari warna deep navy/gelap dan bola glow neon agar tidak terkesan generik AI.
    - **Panel Kanan (Formulir Masuk Bersih)**: Latar putih bersih (`bg-white`), input field solid standar perbankan/pemerintahan (`border-slate-300`, fokus ring `#009B4D`), tombol submit solid hijau resmi BPJS Kesehatan (`#009B4D`), dan fitur ingat sesi login.
  - **Peniadaan Pilihan SSO BPJS**: Opsi tombol login Single Sign-On (SSO) BPJS dan divider "Atau" ditiadakan sepenuhnya untuk menjamin alur masuk langsung yang fokus dan deterministik.
  - Penanganan pesan peringatan (*error alert*) yang ramah pengguna apabila kredensial tidak sesuai atau verifikasi keamanan belum diselesaikan.
- **Perlindungan Keamanan Resmi Cloudflare (Official Cloudflare Protection)**:
  - **Cloudflare Turnstile Anti-Bot Protection**:
    - Integrasi skrip widget resmi `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`.
    - Dukungan konfigurasi variabel lingkungan `VITE_CLOUDFLARE_TURNSTILE_SITE_KEY` serta fallback test key resmi Cloudflare `1x00000000000000000000AA` (*Always Passes* untuk verifikasi deterministik).
    - Mekanisme fallback interaktif jika koneksi ke server Cloudflare terhalang secara lokal.
    - Menghalangi pengiriman kredensial form secara otomatis (*brute-force* atau serangan bot otomasi) sebelum verifikasi captcha/turnstile sukses.
  - **HTTP Security Headers & Content Security Policy (CSP)**:
    - Konfigurasi `vercel.json` diperkuat dengan header proteksi: `Content-Security-Policy` yang mengizinkan domain skrip dan frame resmi Cloudflare (`challenges.cloudflare.com`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, dan `Permissions-Policy`.
- **Terminasi Sesi Pengguna & Dialog Konfirmasi Keluar (Log Out)**:
  - Tombol aksi "Keluar Sesi (Log Out)" pada bilah navigasi samping (`Sidebar.tsx` dan `InsightTracerDashboard.tsx`).
  - Modal dialog konfirmasi keluar bertema Glassmorphism untuk mencegah terminasi sesi yang tidak disengaja.
  - Pembersihan token sesi, status login, dan identitas pengguna di `authStore.ts`, serta pengalihan otomatis ke Halaman Login.
- **Isolasi Data Multi-Tenant & Perlindungan Token**:
  - Context injection pada query PostgreSQL dan filter token faskes sehingga pengguna RS hanya dapat melihat data fasilitas kesehatannya sendiri.
  - Tanpa penyimpanan kunci privat Google Service Account di sisi publik frontend.

---

## 5. Fitur Pengaturan & Manajemen Admin (Admin Settings) [STATUS: AKTIF / LIVE - 4 TAB TERINTEGRASI]
- **Palet Warna Harmonis (7 Warna Resmi BPJS)**: Implementasi penuh token `#2b4390`, `#44853b`, `#f7fcfa`, `#afbade`, `#83a67e`, `#d4ecd1`, `#6573a1` dengan kontras adaptif bebas teks putih pudar (*zero invisible text*).
- **Struktur 4 Tab Glassmorphism**:
  1. 👤 **Tab Profil**:
     - Form penyuntingan data diri: Nama Lengkap Administrator, Username, Alamat Email Resmi, dan opsi Ubah Kata Sandi (Password).
     - Tombol Simpan 100% fungsional dengan persistensi data lokal di store `userStore.ts`.
     - Dialog Konfirmasi Khusus Verifikasi Email: Saat email diubah dan disimpan, muncul dialog interaktif *"Info Sapa Yanfaskes: Harap verifikasi akun Anda untuk mengaktifkan fitur-fitur pada SAPA YANFASKES"*.
     - Surat Digital Simulasi No-Reply Official (`no-reply@sapa-yanfaskes.bpjs-kesehatan.go.id`): Berisi link verifikasi ber-token serta tombol *"VERIFIKASI SEKARANG"* dan tautan langsung untuk membuka webmail pengguna.
  2. 🏥 **Tab Integrasi Data FKTP**:
     - Ruang kerja persiapan integrasi data fasilitas kesehatan tingkat pertama (Puskesmas, Klinik Pratama, DPP) berdesain Glassmorphism BPJS rapi.
  3. 🏢 **Tab Integrasi Data FKRTL**:
     - Tombol-tombol integrasi live untuk setiap modul: Pemanfaatan Antrol, Tab 01 Nakes, Tab 02 Pengaduan, Tab 03 Umabl, Tab 04 Display TT, dan Tombol Master Sinkronisasi Semua Modul.
     - Perekaman stempel waktu riil (*real-time timestamp*) pada saat tombol diklik melalui store persist `syncStore.ts`.
     - Stempel waktu otomatis disebarkan dan ditampilkan sebagai informasi *Last Update : ...* pada menu Pemanfaatan Antrol dan banner header Laporan Kepatuhan FKRTL.
  4. 👥 **Tab User Setting (Manajemen Pengguna)**:
     - Tabel komprehensif daftar pengguna: Username, Nama Lengkap, Email Akun, Kata Sandi dengan tombol toggle Show/Hide (👁️), Peran/Role (Super Administrator, Administrator KC, Verifikator Yanfaskes, Viewer Direksi), Status Akun, dan Terakhir Masuk.
     - Fitur *Live Search* instan dan *Filter Role* interaktif.
     - Operasi Tambah Pengguna Baru (+) dengan form modal Glassmorphism validasi lengkap.
     - Operasi Edit Pengguna (✏️) untuk memperbarui hak akses, email, dan password.
     - Operasi Hapus Pengguna (🗑️) dengan dialog konfirmasi aman dan proteksi penghapusan akun Super Administrator.

---

## 6. Modul Analitik Kinerja & Distribusi Geografis (SAPA Yanfaskes Dashboard — PROFI UI Fidelity Engine) [STATUS: AKTIF / VERIFIED 96.85%]
- **Dasar Implementasi Otoritatif**: Dribbble Reference Shot `#21916256` ("Dashboard - Performance Tracker & Geographical Statistics" karya Octet Design Studio) di bawah protokol ketat `STRICT_REFERENCE`.
- **Karakteristik Desain & Token Warna Terverifikasi**:
  - Dark Nav Sidebar: `#1E1F31` (Dark Indigo/Slate), aktif `#2E2F45`, teks redup `#8E8FA3`.
  - Main Canvas: `#F1F1F4`, kartu putih `#FFFFFF` dengan garis batas halus `#E8E8EE`.
  - Warna Aksen Merek: Royal Indigo `#6C5DD3`, Vivid Blue `#3F8CFF`, dan Soft Green Badge `#E4F8DD` (teks `#27AE60`).
- **Elemen-Elemen Terverifikasi**:
  1. 🧭 **Sidebar Navigasi Gelap (w: 302px)**: Memuat logo brand SAPA Yanfaskes dengan badge "LIVE" hijau, serta 4 kelompok menu hierarkis: ACTION CENTRE (Home), DASHBOARD (Capaian Kepatuhan FKRTL, Capaian Kepatuhan FKTP), ENGAGEMENTS (Activity, Touchpoints, Installs & Uninstalls, Agency, Fraud, Logs), dan MANAGE (User [Manajemen Pengguna 3 Role RBAC: Super Admin, Admin, User], Smart Banners, Events, Validation Rules, Integration). Dilengkapi fitur auto-hide/collapse (icon-only rail) saat kursor menjauh dan expand saat kursor mendekat.
  2. 📅 **Header Terpadu (h: 88px)**: Judul reaktif ("Capaian Kepatuhan FKRTL") tebal dan tombol pemilih rentang waktu interaktif berikon kalender ("Jan 2023 - Feb 2023").
  3. 📈 **Kartu Metrik KPI Perbandingan (Grid 2 Kolom)**:
     - **Touchpoints**: Clicks (23.4k, +14%), Impressions (6.4k, +16%), Organic (43.2k, +11%), Non-Organic (83k, +18%), dengan footer "Compared To Last 30 Days".
     - **Installs**: Organic (45.2k, 0%), Non-Organic (36.4k, +12%), Organic 0% (13%), Fraudulent (14.6k, +16%), dengan footer "Compared To Last 30 Days".
  4. 🗺️ **Distribusi Geografis (Geographical Distribution)**:
     - Tombol tab switcher interaktif: `Clicks`, `Organic Installs`, `Non-Organic Installs`.
     - SVG World Map dengan hotspot animasi dan penanda 5 negara terdata: India (14,230 / 50.61%), United States (8,210 / 26.21%), United Kingdom (3,540 / 12.44%), Greenland (1,782 / 6.61%), Australia (1,054 / 4.61%).
     - Tiga ringkasan metrik analitik di bawah peta: **25,344 Viewed**, **21,887 Dropouts**, dan **12,834 Responses**.
  5. 📋 **Breakdown By Media Source Data Table**:
     - Judul tabel dengan tombol "Compared To Last 30 Days".
     - Matriks kolom terstruktur: `Media Source`, `Clicks`, `Installs`, `Impressions`, `Click To Install`, dan `Rejected Installs`.
     - Menampilkan partner media berkinerja tinggi (Demo Partner: 5.41k Clicks, 1.24k Installs, 18.2k Impressions, 22.9% C2I, 0% Rejected).
- **Pengujian & Verifikasi Visual**:
  - Mesin komparasi otomatis `pixelmatch` di `frontend/scripts/visual-diff.mjs`.
  - Tingkat fidelitas empiris terukur: **96.85% kesesuaian piksel** terhadap referensi raster murni.

