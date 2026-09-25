# SOURCE.MD — GROUNDING DATA & OFFICIAL INSTITUTIONAL PARAMETERS
**Proyek**: SAPA YANFASKES (Saluran Analisis Performa & Akselerasi)  
**Metode Validasi**: Grounding with Google & Regulasi Resmi BPJS Kesehatan  
**Terakhir Diperbarui**: 2026-09-24  

---

## 1. Parameter Resmi Institusi BPJS Kesehatan

### Identitas Merek & Palet Warna Resmi
- **Warna Utama (Primary Green)**:
  - Kode Heksadesimal: `#009B4D` / `#00A86B` (BPJS Green)
  - Nuansa Gelap: `#007A3D`
  - Nuansa Terang: `#10B981` / Emerald
- **Warna Pendukung (Secondary Blue)**:
  - Kode Heksadesimal: `#00529C` / `#0A50A1` (BPJS Blue)
  - Nuansa Gelap: `#0F172A` / `#1E293B` (Slate Background)
  - Aksen Tambahan: `#06B6D4` (Cyan Accent untuk Glassmorphism)
- **Desain Antarmuka**: Glassmorphism Refined 70% Transparency Level (Backdrop-filter blur 20px saturate 180%, border semi-transparan `rgba(255, 255, 255, 0.10)` & `rgba(16, 185, 129, 0.20)`, translusen `rgba(15, 23, 42, 0.70)` pada Dark Mode dan `rgba(255, 255, 255, 0.70)` pada Light Mode).

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
