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

---

## 7. Parameter Resmi & Metadata Tab 01. Jadwal Praktek Nakes

- **Nama Indikator**: Kesesuaian Jadwal Praktik Dokter atau Tenaga Kesehatan
- **Definisi Resmi**: Kesesuaian antara jadwal praktik dokter/nakes pada Aplikasi HFIS dengan data pelayanan pasien pada aplikasi atau sistem informasi yang menyimpan data pelayanan pasien di FKRTL - Bobot 25%
- **Target Nasional**: 100%

### A. Metadata Sumber Data Google Spreadsheet
1. **Dataset Realisasi Jadwal Nakes FKRTL**:
   - **URL Spreadsheet**: `https://docs.google.com/spreadsheets/d/1ZAER9fLUrqz-4qs970gog1ZSb1AZn00MAqspzU7HLZU/edit?usp=sharing`
   - **Spreadsheet ID**: `1ZAER9fLUrqz-4qs970gog1ZSb1AZn00MAqspzU7HLZU`
   - **Jumlah Baris Data**: 228 baris data live.
   - **Struktur Kolom**: `kode_ppk`, `nama_ppk`, `Tipe Faskes`, `Capaian Nilai`, `Total Kunjungan`, `Tidak Sesuai`, `Sesuai`, `Persen Sesuai`, `Capaian`, `bulan`.
   - **Rentang Periode**: Januari 2026 s.d. September 2026 (9 bulan).
2. **Dataset Referensi Fasilitas Kesehatan (Master FKRTL)**:
   - **URL Spreadsheet**: `https://docs.google.com/spreadsheets/d/17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs/edit?usp=sharing`
   - **Spreadsheet ID**: `17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs`
   - **Jumlah Faskes**: 26 Rumah Sakit & Klinik Rujukan.
   - **Struktur Kolom**: `No`, `kode_ppk`, `kabupaten`, `nama_ppk`, `kelas_ppk`, `kepemilikan`, `vendor`, `keterangan`.
   - **Cakupan Wilayah**: Kabupaten Bondowoso, Kabupaten Jember, dan Kabupaten Lumajang.
   - **Kecocokan Relasional (*Join Match*)**: 100% (228 dari 228 baris nakes terhubung sempurna via `kode_ppk`).

### B. Algoritma Perhitungan Indikator & Nilai Capaian
1. **Deduplikasi & Agregasi Faskes Unik**:
   - Tabel matriks kepatuhan tidak menampilkan duplikasi baris faskes (dikelompokkan berbasis `kode_ppk` unik).
   - Metrik kunjungan dihitung melalui akumulasi penjumlahan:
     - $\text{Total Kunjungan} = \sum(\text{Total Kunjungan})$
     - $\text{Tidak Sesuai} = \sum(\text{Tidak Sesuai})$
     - $\text{Sesuai} = \sum(\text{Sesuai})$
2. **Formula Persen Sesuai**:
   $$\text{Persen Sesuai (\%)} = \left(\frac{\sum\text{Sesuai}}{\sum\text{Total Kunjungan}}\right) \times 100\%$$
   *(Jika Faskes tidak memiliki kunjungan / $\sum\text{Total Kunjungan} = 0$, maka $\text{Persen Sesuai} = 100\%$)*.
3. **Logika Resmi Perhitungan Capaian Poin**:
   - **Faskes tidak ada kunjungan ($\text{Total Kunjungan} = 0$)** $\rightarrow$ $\text{Capaian} = 100$
   - **Jadwal praktik $100\%$ sesuai ($\text{Persen Sesuai} = 100\%$)** $\rightarrow$ $\text{Capaian} = 100$
   - **Jadwal praktik $> 60\% - < 100\%$ sesuai** $\rightarrow$ $\text{Capaian} = 75$
   - **Jadwal praktik $> 40\% - 60\%$ sesuai** $\rightarrow$ $\text{Capaian} = 50$
   - **Jadwal praktik $> 20\% - 40\%$ sesuai** $\rightarrow$ $\text{Capaian} = 25$
   - **Jadwal praktik $\le 20\%$ sesuai** $\rightarrow$ $\text{Capaian} = 0$
4. **Bobot Indikator**:
   - Bobot resmi indikator Jadwal Praktek Nakes adalah **25%** dari total evaluasi kepatuhan mutu FKRTL.
5. **Logika & Standar Status Kepatuhan**:
   - **Tercapai**: jika nilai Capaian mencapai **100** ($\text{Capaian} = 100$).
   - **Belum Tercapai**: jika nilai Capaian **di bawah 100** ($\text{Capaian} < 100$).

### C. Standar Tampilan Dashboard & Tabel Matriks
1. **Dua Line Chart Berdampingan**:
   - **Line Chart Kiri**: Tren bulanan Persen Sesuai (%) dengan kurva `#2b4390` dan garis target 100%.
   - **Line Chart Kanan**: Tren bulanan Capaian (Poin) dengan kurva `#44853b` dan garis target 100 poin.
2. **Struktur Kolom Tabel Standar**:
   - `No`, `Nama Faskes`, `Tipe Faskes`, `Total Kunjungan`, `Tidak Sesuai`, `Sesuai`, `Persen Sesuai`, `Capaian`, `Status`.
3. **Standar Cascading Dependent Filters**:
   - Pilihan dropdown `Nama Faskes (FKRTL)` dan `Tipe Faskes` wajib terikat secara dependen (*cascading*) terhadap `Kabupaten`:
     - **Jember**: 14 Faskes, 7 Tipe Faskes.
     - **Bondowoso**: 3 Faskes (`RS BHAYANGKARA BONDOWOSO`, `RS MITRA MEDIKA`, `RSU dr. H. KOESNADI BONDOWOSO`), 3 Tipe Faskes (`RS Kelas B`, `RS Swasta Setara Type C`, `RS TNI Polri Kelas III`).
     - **Lumajang**: 9 Faskes, 6 Tipe Faskes.
   - Pilihan `Tipe Faskes` menyaring lebih lanjut faskes yang bertipe tersebut.
   - Perubahan kabupaten wajib memicu auto-reset pilihan faskes dan tipe faskes ke "Semua" guna mengeliminasi error filter faskes luar daerah ataupun data kosong.

---

## 8. Parameter Resmi & Metadata Tab 02. Penyelesaian Pengaduan

- **Nama Indikator**: Tindak Lanjut dan Penyelesaian Pengaduan
- **Definisi Resmi**: Waktu penyelesaian pengaduan atau SLA 1 sampai 3 hari kerja sejak diterimanya pengaduan pada Aplikasi SIPP - bobot 20%
- **Target Kepatuhan**: 100% (Poin Capaian = 100)

### A. Metadata Sumber Data Google Spreadsheet
1. **Dataset Realisasi Penyelesaian Pengaduan**:
   - **URL Spreadsheet**: `https://docs.google.com/spreadsheets/d/1iOsYZmtLLcLbKiqgbt8NJqEFoEeHorL7qE6PQwswvbk/edit?usp=sharing`
   - **Spreadsheet ID**: `1iOsYZmtLLcLbKiqgbt8NJqEFoEeHorL7qE6PQwswvbk`
   - **Jumlah Baris Data**: 228 baris data live.
   - **Struktur Kolom Asli**: `Kode FKRTL`, `Nama FKRTL`, `pengaduan 3 bulan terakhir (termasuk bulan N)`, `Jml Pengaduan Bln penilaian`, `Jml Pengaduan Ditindaklanjuti sesuai SLA`, `Jml Pengaduan Top 10 Tahun lalu`, `Jml Pengaduan Tidak Ditindaklanjuti`, `Capaian`, `bulan`.
   - **Rentang Periode**: Januari 2026 s.d. September 2026 (9 bulan).
2. **Dataset Referensi Fasilitas Kesehatan (Master FKRTL)**:
   - **URL Spreadsheet**: `https://docs.google.com/spreadsheets/d/17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs/edit?usp=sharing`
   - **Spreadsheet ID**: `17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs`
   - **Kecocokan Relasional**: 100% terhubung via `Kode FKRTL` $\leftrightarrow$ `kode_ppk` master faskes.

### B. Algoritma Perhitungan Indikator & Nilai Capaian
1. **Standar SLA Penyelesaian**:
   - Batas toleransi penanganan pengaduan adalah **1 sampai 3 hari kerja** terhitung sejak pengaduan terdaftar pada Aplikasi Saluran Informasi dan Penanganan Pengaduan (SIPP).
2. **Logika Resmi Perhitungan Capaian (0 s.d. 100)**:
   - **Skor 100**: Tidak ada pengaduan secara konsisten pada 3 (tiga) bulan terakhir secara berturut-turut (`pengaduan_3bln == 0` dan `pengaduan_bln == 0`).
   - **Skor 75**: Tidak ada pengaduan pada bulan penilaian (`pengaduan_bln == 0`, meskipun `pengaduan_3bln > 0`).
   - **Skor 50**: Pengaduan ditindaklanjuti sesuai SLA dan bukan merupakan Top 10 Pengaduan Nasional tahun sebelumnya (`pengaduan_bln > 0`, `tidak_ditindaklanjuti == 0`, `ditindaklanjuti_sla > 0`, dan `top10_thnlalu == 0`).
   - **Skor 25**: Pengaduan ditindaklanjuti sesuai SLA dan pengaduan merupakan Top 10 Pengaduan Nasional tahun sebelumnya (`pengaduan_bln > 0`, `tidak_ditindaklanjuti == 0`, `ditindaklanjuti_sla > 0`, dan `top10_thnlalu > 0`).
   - **Skor 0**: Pengaduan tidak ditindaklanjuti atau tindak lanjut melebihi SLA (`tidak_ditindaklanjuti > 0` atau terdapat pengaduan bulan penilaian namun `ditindaklanjuti_sla == 0`).
3. **Deduplikasi Baris Faskes & Penjumlahan Metrik (Sum)**:
   - Setiap faskes unik (`kode_ppk`) hanya dimunculkan 1 baris pada tabel matriks kepatuhan.
   - Kolom `pengaduan 3 bulan terakhir (termasuk bulan N)` = `sum(pengaduan_3bln)`.
   - Kolom `Jml Pengaduan Bln penilaian` = `sum(pengaduan_bln)`.
   - Kolom `Jml Pengaduan Ditindaklanjuti sesuai SLA` = `sum(ditindaklanjuti_sla)`.
   - Kolom `Jml Pengaduan Top 10 Tahun lalu` = `sum(top10_thnlalu)`.
   - Kolom `Jml Pengaduan Tidak Ditindaklanjuti` = `sum(tidak_ditindaklanjuti)`.
4. **Bobot Indikator**:
   - Bobot resmi indikator Penyelesaian Pengaduan adalah **20%** dari total evaluasi kepatuhan mutu FKRTL.
   - Kontribusi riil dihitung dengan formula: $\text{Kontribusi Capaian} = \text{Rata-rata Capaian} \times 20\%$.
5. **Logika & Standar Status Kepatuhan**:
   - **Tercapai**: jika nilai Capaian mencapai **100** ($\text{Capaian} \ge 100$).
   - **Belum Tercapai**: jika nilai Capaian **di bawah 100** ($\text{Capaian} < 100$).

### C. Standar Tampilan Dashboard & Tabel Matriks
1. **Dinamisasi Header Banner**:
   - Saat tab aktif adalah `02-pengaduan`:
     - Judul Utama: **Tindak Lanjut dan Penyelesaian Pengaduan**
     - Sub Judul: **Waktu penyelesaian pengaduan atau SLA 1 sampai 3 hari kerja sejak diterimanya pengaduan pada Aplikasi SIPP - bobot 20%**
2. **Grafik Bulanan (Line Chart Capaian)**:
   - Menampilkan rata-rata capaian poin bulanan (Januari - September 2026).
   - Dilengkapi garis target putus-putus pada level 100 Poin (Warna Hijau BPJS `#44853b`).
   - Tooltip interaktif memuat rata-rata capaian, total pengaduan bulan berjalan, dan jumlah pengaduan sesuai SLA.
3. **Struktur Kolom Tabel Standar**:
   - `No`
   - `Nama Faskes`
   - `Tipe Faskes`
   - `pengaduan 3 bulan terakhir (termasuk bulan N)`
   - `Jml Pengaduan Bln penilaian`
   - `Jml Pengaduan Ditindaklanjuti sesuai SLA`
   - `Jml Pengaduan Top 10 Tahun lalu`
   - `Jml Pengaduan Tidak Ditindaklanjuti`
   - `Capaian`
   - `Status` ("Tercapai" jika nilai 100, "Belum Tercapai" jika nilai di bawah 100).
4. **Cascading Dependent Filters**:
   - Dropdown `Kabupaten`, `Nama Faskes`, `Bulan`, dan `Tipe Faskes` saling sinkron secara hierarkis seperti pada Tab 01.

---

## 9. INDIKATOR 03: PELAKSANAAN UMPAN BALIK PESERTA (CUSTOMER FEEDBACK / KESSAN) - BOBOT 10%

- **Definisi Resmi**: Pengukuran dinilai berdasarkan jumlah responden yang memberikan umpan balik/customer feedback (KESSAN) terhadap mutu pelayanan rawat inap dan rawat jalan di FKRTL.
- **Bobot Indikator**: **10%** dari total evaluasi kepatuhan mutu FKRTL.
- **Target Nasional**: **$\ge 100\%$ dari target** responden yang ditentukan.

### A. Metadata Sumber Data Google Spreadsheet
1. **Dataset Realisasi KESSAN**:
   - **URL Spreadsheet**: `https://docs.google.com/spreadsheets/d/148m1t4Z-jaagUFRuJ-ClCUdVvHQyLdSVjQ3fsxoRzj8/edit?usp=sharing`
   - **Spreadsheet ID**: `148m1t4Z-jaagUFRuJ-ClCUdVvHQyLdSVjQ3fsxoRzj8`
   - **Jumlah Baris Data**: 228 baris data live.
   - **Struktur Kolom Asli**: `Kode FKRTL`, `Nama FKRTL`, `Tipe Faskes`, `Capaian`, `Jlh Kunjungan`, `Jlh Responden`, `Target`, `% Jlh Responden Target`, `Capaian`, `bulan`.
   - **Rentang Periode**: Januari 2026 s.d. September 2026 (9 bulan).
2. **Dataset Referensi Fasilitas Kesehatan (Master FKRTL)**:
   - **URL Spreadsheet**: `https://docs.google.com/spreadsheets/d/17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs/edit?usp=sharing`
   - **Spreadsheet ID**: `17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs`
   - **Kecocokan Relasional**: 100% terhubung via `Kode FKRTL` $\leftrightarrow$ `kode_ppk` master faskes (26 faskes unik KC Jember).

### B. Standar Penentuan Target Responden KESSAN Berdasarkan Populasi Kunjungan
Sesuai dengan pedoman BPJS Kesehatan:
| Jumlah Kunjungan (Populasi) | Jumlah Responden (Target) |
| :--- | :--- |
| 30 – 100 | 30 |
| 101 – 200 | 80 |
| 201 – 500 | 132 |
| 501 – 1.000 | 217 |
| 1.001 – 5.000 | 278 |
| 5.001 – 10.000 | 357 |
| 10.001 – 50.000 | 370 |
| 50.001 – 100.000 | 381 |
| > 100.000 | 384 |

### C. Algoritma Perhitungan Capaian Poin (0 s.d. 100)
1. **Formula Persentase Target**:
   $$\% \text{ Jlh Responden Target} = \left(\frac{\text{Jlh Responden}}{\text{Target}}\right) \times 100\%$$
2. **Logika Skala Capaian Poin**:
   - $\% \text{ Jlh Responden Target} \ge 100\% \rightarrow \text{Capaian} = 100$
   - $75\% \le \% \text{ Jlh Responden Target} < 100\% \rightarrow \text{Capaian} = 75$
   - $50\% \le \% \text{ Jlh Responden Target} < 75\% \rightarrow \text{Capaian} = 50$
   - $25\% \le \% \text{ Jlh Responden Target} < 50\% \rightarrow \text{Capaian} = 25$
   - $\% \text{ Jlh Responden Target} < 25\% \rightarrow \text{Capaian} = 0$
   - Faskes tanpa kunjungan atau $\text{Target} = 0 \rightarrow \text{Capaian} = 100$
3. **Status Kepatuhan**:
   - **Tercapai**: jika $\text{Capaian} \ge 100$.
   - **Belum Tercapai**: jika $\text{Capaian} < 100$.
4. **Deduplikasi Baris Faskes & Penjumlahan Metrik (Sum)**:
   - Faskes unik (`kode_ppk`) hanya muncul 1 baris pada tabel matriks kepatuhan.
   - Jlh Kunjungan = $\sum(\text{kunjungan})$
   - Jlh Responden = $\sum(\text{responden})$
   - Target = $\sum(\text{target})$
   - $\% \text{ Jlh Responden Target}$ = $(\sum\text{responden} / \sum\text{target}) \times 100\%$

### D. Standar Tampilan Antarmuka (Dashboard & Matriks)
1. **Header Banner**:
   - Judul: **Pelaksanaan**
   - Judul Gradien: **Umpan Balik Peserta (Customer Feedback)**
   - Sub Judul: **Pengukuran dinilai berdasarkan jumlah responden yang memberikan umpan balik/customer feedback - bobot 10%**
   - Target Nasional Badge: **Target Nasional Umabl Peserta $\ge$ 100% dari target**
2. **Dua Line Chart Berdampingan (Terpisah Kanan & Kiri)**:
   - **Kiri (Biru BPJS `#2b4390`)**: `% Jlh Responden Target` dengan garis target $\ge 100\%$.
   - **Kanan (Hijau BPJS `#44853b`)**: `Capaian` (Poin) dengan garis target 100 Poin.
3. **Tabel Standar KESSAN**:
   - Tabel pedoman 9 baris tier populasi kunjungan vs target responden.
   - Mockup visual representasi ulasan KESSAN ala aplikasi BPJS Kesehatan.
4. **Kolom Tabel Matriks Kepatuhan**:
   - `No`, `Nama Faskes`, `Tipe Faskes`, `Jlh Kunjungan`, `Jlh Responden`, `Target`, `% Jlh Responden Target`, `Capaian`, `Status`.
5. **Default Tampilan Bulan**:
   - Diinisialisasi langsung ke bulan terakhir (**September 2026**).

---

## 10. Integrasi Pembaruan (Update) Data Ketersediaan Tempat Tidur (Tab 04 - Bobot 10%)

### A. Sumber Data Google Spreadsheet
1. **Data Display TT**:
   - **URL**: `https://docs.google.com/spreadsheets/d/10JV-1frRvBbUg3bgakoUiDnu-FaUT72-oE8i2THTSOk/edit?usp=sharing`
   - **ID**: `10JV-1frRvBbUg3bgakoUiDnu-FaUT72-oE8i2THTSOk`
   - **Format Kolom**: `Kode FKTP`, `Nama FKTP`, `Nmtypeppk`, `Capaian`, `Jumlah Update`, `bulan`.
   - **Cakupan Waktu**: Januari 2026 s.d. September 2026 (9 bulan, 228 baris data live).
2. **Master Referensi Faskes**:
   - **URL**: `https://docs.google.com/spreadsheets/d/17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs/edit?usp=sharing`
   - **ID**: `17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs`
   - **Relasi Join**: `Kode FKTP` $\leftrightarrow$ `kode_ppk` (26 Fasilitas Kesehatan Rujukan Tingkat Lanjutan / FKRTL di KC Jember & Lumajang).

### B. Definisi & Nomenklatur Resmi
1. **Judul Banner**: **Pembaruan (Update) Data Ketersediaan Tempat Tidur**
2. **Sub Judul Banner**: **Memperhitungkan jumlah hari Faskes melakukan pembaruan informasi data ketersediaan tempat tidur secara harian dalam 1 (satu) bulan - bobot 10%**
3. **Target Nasional**: **Target Nasional Update Display TT $\ge$ 25 hari**
4. **Bobot Indikator**: **10%**

### C. Algoritma Perhitungan Capaian Poin (0 s.d. 100)
- $\text{Jumlah Update} \ge 25\text{ hari} \rightarrow \text{Capaian} = 100$
- $15\text{ hari} \le \text{Jumlah Update} < 25\text{ hari} \rightarrow \text{Capaian} = 50$
- $10\text{ hari} \le \text{Jumlah Update} < 15\text{ hari} \rightarrow \text{Capaian} = 25$
- $\text{Jumlah Update} < 10\text{ hari} \rightarrow \text{Capaian} = 0$
- Status Kepatuhan:
  - **Tercapai (Patuh)**: jika $\text{Capaian} \ge 100$ (atau $\text{Jumlah Update} \ge 25\text{ hari}$).
  - **Belum Tercapai (Belum Patuh)**: jika $\text{Capaian} < 100$ (atau $\text{Jumlah Update} < 25\text{ hari}$).

### D. Standar Tampilan Antarmuka (Dashboard & Matriks)
1. **4 Kartu KPI Metrik**:
   - Rata-rata Hari Pembaruan (Target $\ge 25\text{ hari}$)
   - Rata-rata Capaian Poin (Skala 0-100 poin, Bobot 10%)
   - Total Faskes Terdata (FKRTL Aktif)
   - Status Kepatuhan RS (Jumlah & persentase RS Patuh $\ge 25\text{ hari}$)
2. **Dua Grafik Bulanan Terpisah Berdampingan**:
   - **Kiri (Biru BPJS `#2b4390`)**: Tren Bulanan **"Jumlah Update"** (hari) dengan garis target horizontal putus-putus pada $\ge 25\text{ hari}$.
   - **Kanan (Hijau BPJS `#44853b`)**: Tren Bulanan **"Capaian"** (Poin 0-100) dengan garis target horizontal pada 100 Poin.
3. **Tabel Matriks Kepatuhan (Deduplikasi Tanpa Duplikat)**:
   - Kolom: `No`, `Nama Faskes (FKRTL)`, `Kabupaten`, `Tipe Faskes`, `Jumlah Update (Hari)`, `Capaian (Poin)`, `Status`.
4. **Sistem Filter 4-Dimensi**:
   - Kabupaten, Nama Faskes (cascading), Bulan (default: **September 2026**), dan Tipe Faskes.



