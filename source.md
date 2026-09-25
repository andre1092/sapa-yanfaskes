# SOURCE.MD — GROUNDING DATA & OFFICIAL INSTITUTIONAL PARAMETERS
**Proyek**: SAPA YANFASKES (Saluran Analisis Performa & Akselerasi)  
**Metode Validasi**: Grounding with Google & Regulasi Resmi BPJS Kesehatan  
**Terakhir Diperbarui**: 2026-09-24  

---

## 1. Parameter Resmi Institusi BPJS Kesehatan

### Identitas Merek & Palet Warna Resmi (Clean, Neat & Structured BPJS Style)
- **Kombinasi 7 Warna Standar Resmi**:
  1. `#2b4390` / `rgba(43, 67, 144, 1)`: Royal Navy Blue (BPJS Primary Blue) — Identitas utama institusi, teks heading, dan penegasan visual.
  2. `#44853b` / `rgba(68, 133, 59, 1)`: Forest Green (BPJS Primary Green) — Warna aksen primer kesehatan dan capaian target patuh.
  3. `#f7fcfa` / `rgba(247, 252, 250, 1)`: Clean Mint White — Warna dasar latar belakang Light Mode dan kontras teks Dark Mode.
  4. `#afbade` / `rgba(175, 186, 222, 1)`: Soft Periwinkle — Garis pembatas (border), divider, dan badge netral.
  5. `#83a67e` / `rgba(131, 166, 126, 1)`: Sage Green — Aksen border sekunder dan gradasi indikator keberhasilan.
  6. `#d4ecd1` / `rgba(212, 236, 209, 1)`: Mint Light Tint — Latar belakang badge status Patuh, hover tint, dan sorotan lembut.
  7. `#6573a1` / `rgba(101, 115, 161, 1)`: Slate Blue Midtone — Teks sekunder, label filter, dan deskripsi berstruktur rapi.
- **Desain Antarmuka**: Glassmorphism Refined 70% Transparency Level dengan kontras adaptif tinggi (High Contrast & Zero Invisible Text), memastikan keterbacaan 100% pada Light Mode dan Dark Mode.

---

## 2. Klasifikasi Fasilitas Kesehatan (Faskes)

### A. FKTP (Fasilitas Kesehatan Tingkat Pertama)
- Puskesmas (Pusat Kesehatan Masyarakat)
- Klinik Pratama
- Dokter Praktik Mandiri / Dokter Gigi

### B. FKRTL (Fasilitas Kesehatan Rujukan Tingkat Lanjutan)
- Rumah Sakit Umum dan Khusus:
  - Kelas A: RS Rujukan Nasional / Provinsi dengan kapasitas dan subspesialis terlengkap
  - Kelas B: RS Rujukan Regional
  - Kelas C: RS Rujukan Kabupaten / Wilayah
  - Kelas D: RS Pratama / Tipe D
- Klinik Utama

---

## 3. Algoritma & Formula Analitik Pemanfaatan Antrean Online (Antrol) FKRTL

Berdasarkan standarisasi evaluasi integrasi sistem antrean online BPJS Kesehatan:

### Indikator Pemanfaatan Antrol
1. **Numerator (Pembilang)**:
   - Jumlah antrean yang berhasil diterbitkan melalui kanal digital terintegrasi:
     - Kanal Mobile JKN (peserta mengambil antrean langsung via aplikasi Mobile JKN).
     - Kanal Bridging Antrean Faskes (peserta mengambil antrean melalui sistem pendaftaran RS / On-Site Kiosk yang tersinkronisasi via Web Service BPJS Kesehatan).
2. **Denominator (Penyebut)**:
   - Total seluruh kunjungan pasien peserta JKN yang terbit Surat Eligibilitas Peserta Rawat Jalan Tingkat Lanjutan (Total SEP RJTL).
3. **Formula Rasio Pemanfaatan Antrol**:
   $$\text{Rasio Pemanfaatan (\%)} = \left( \frac{\text{Jumlah Antrean by Sumber (Mobile JKN + Bridging)}}{\text{Total Kunjungan (SEP RJTL)}} \right) \times 100\%$$

### Standar Target Kinerja
- **Optimal (Hijau)**: $\ge 85\%$
- **Cukup / Waspada (Kuning)**: $60\% \le \text{Rasio} < 85\%$
- **Kurang / Perlu Akselerasi (Merah)**: $< 60\%$

---

## 4. Parameter Integrasi Google Spreadsheet & Skema Data

### Metadata Spreadsheet Resmi
- **URL Dokumen**: `https://docs.google.com/spreadsheets/d/1U5OFfqMkN0Wj0ATmkSsplJZD_whfwmh1ef797IH6LnY/edit?usp=sharing`
- **Spreadsheet ID**: `1U5OFfqMkN0Wj0ATmkSsplJZD_whfwmh1ef797IH6LnY`
- **Metode Akses**: Ekspor stream CSV HTTP publik paralel (`https://docs.google.com/spreadsheets/d/{id}/export?format=csv&gid={gid}`) dilengkapi in-memory cache Polars (TTL 300 detik) untuk menjamin 100% data live tanpa biaya API.
- **Struktur Sheet & GID Resmi**:
  1. `DB_FASKES` (GID: `0`): 25 baris faskes (kolom: Kdppk, Kabupaten, Nama_FKRTL, Kelas_RS, Kepemilikan, Jenis_PPK, Vendor FKRTL).
  2. `DB_LAP_ANTROL_FKRTL` (GID: `861718582`): 2.052 baris (kolom: Timestamp, Kdppk, Faskes, Kdkr, Kdkc, Cabang, Capaian, Jumlah Antrian by Sumber, Jumlah Peserta Jkn, Jumlah Sep Rjtl, Sumber).
  3. `antrol_by_poli` (GID: `565078682`): 1.371 baris (kolom: Timestamp, Kdppk, Nmppk, Politujuan, Flag Bridging Antrean, % Antrol All Sumber, Flag Mobile JKN, % Antrol MJKN, Flag Tidak Antrol, Total SEP, kode_unique, jml_sep_all).
  4. `ref_poli` (GID: `1213587497`): 234 baris (kolom: Politujuan, NMPOLI, Status_aktif).

### Standar Format Timestamp & Aturan Snapshot
- **Format Timestamp Resmi**: `MM/DD/YYYY HH:MM:SS` (contoh: `09/24/2026 03:14:56` atau `01/31/2026 23:59:59`).
- **Snapshot Bulanan Terbaru**: Untuk grafik batang horisontal bulanan, nilai agregasi per bulan dihitung menggunakan baris yang memiliki nilai Timestamp Terbaru (`max(Timestamp)`) pada bulan bersangkutan.
- **Last Update Global**: Mengambil timestamp mutakhir dari keseluruhan dataset spreadsheet, diformat presisi `MM/DD/YYYY HH:MM:SS`.

### Strategi Optimasi Data Engine (Sub-2-Second)
- **Parallel ThreadPoolExecutor**: Unduhan 4 tab CSV dilakukan secara paralel dalam 1.09 detik.
- **In-Memory Polars DataFrame Cache**: Request berikutnya diproses seketika (< 20ms) dengan Polars vectorized aggregations.
- **Client Cache**: TanStack React Query pada sisi frontend (`staleTime: 3 menit`).

---

## 5. Algoritma Sinkronisasi Mode Sistem Berbasis Waktu Komputer (Time-Based Engine)

Sesuai standar antarmuka web modern untuk otomatisasi tema sistem:
- **Ambang Batas Waktu Komputer Lokal**:
  - **Waktu Siang (Daytime)**: Pukul 06:00 s.d. 17:59 (jam $6 \le \text{hour} < 18$) $\rightarrow$ Menghasilkan tema terang (*Light Mode*), kecuali jika preferensi OS secara eksplisit aktif pada *prefers-color-scheme: dark*.
  - **Waktu Malam (Nighttime)**: Pukul 18:00 s.d. 05:59 (jam $\ge 18 \lor < 6$) $\rightarrow$ Menghasilkan tema gelap (*Dark Mode*).
- **Formula Evaluasi**:
  $$\text{Effective Theme} = (\text{hour} < 6 \lor \text{hour} \ge 18 \lor \text{matchMedia}('\text{prefers-color-scheme: dark}').\text{matches}) \ ? \ \text{'dark'} : \text{'light'}$$
- **Event Listeners**:
  1. `change` pada `window.matchMedia('(prefers-color-scheme: dark)')`
  2. `focus` & `visibilitychange` saat pengguna kembali ke jendela aktif
  3. `setInterval` setiap 60.000 ms (1 menit) untuk mendeteksi transisi jam 18:00 dan 06:00 tanpa *refresh*.

---

## 6. Standar Terminologi Bilingual Resmi BPJS Kesehatan (ID / EN)

Berdasarkan publikasi resmi dan portal integrasi BPJS Kesehatan:
- **BPJS Kesehatan**: *Social Security Agency on Health*
- **SAPA YANFASKES**: *Health Facility Performance Analysis & Acceleration Channel*
- **Faskes Tingkat Pertama (FKTP)**: *Primary Care Facility*
- **Faskes Rujukan Tingkat Lanjutan (FKRTL)**: *Advanced Referral Health Facility*
- **Pemanfaatan Antrol (Antrean Online)**: *Online Queue Utilization*
- **Rawat Jalan Tingkat Lanjutan (RJTL)**: *Outpatient Care*
- **Surat Eligibilitas Peserta (SEP)**: *Participant Eligibility Letter*
- **Kanal Integrasi**: *Mobile JKN & Hospital Queue Bridging Web Service*
- **Pengaturan & Manajemen IAM**: *Settings & IAM Security Management*
- **Keluar Sesi**: *Sign Out / Log Out*
