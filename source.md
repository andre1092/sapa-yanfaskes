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

### Metadata Spreadsheet
- **Metode Akses**: Google Sheets API v4 via Service Account Credentials (`https://www.googleapis.com/auth/spreadsheets.readonly`)
- **Struktur Sheet Utama**:
  1. `DB_LAP_ANTROL_FKRTL`: Berisi histori transaksi antrean harian/bulanan faskes (kolom: Kdppk, Timestamp/Waktu, Jumlah Antrean by Sumber, Jumlah SEP RJTL, Jumlah Peserta JKN, Sumber).
  2. `DB_FASKES`: Berisi master data fasilitas kesehatan (kolom: Kdppk, Nama_RS / Faskes, Kabupaten/Kota, Kelas_RS, Alamat, Status Kerjasama).
  3. `DB_POLI`: Berisi data agregat antrean per poliklinik spesialis (kolom: Kdppk, Nama_Poli, Flag Mobile JKN, Flag Bridging Antrean, Total SEP).

### Strategi Optimasi Data Engine (Sub-2-Second)
- **Polars Lazy Evaluation**: Pemuatan data mentah ke memori, filtering, grouping, dan perhitungan agregat dilakukan dengan `pl.LazyFrame` untuk memastikan pemrosesan cepat dalam hitungan milidetik.
- **Client Cache**: Pemanfaatan TanStack React Query pada sisi frontend dengan `staleTime: 5 menit` guna mencegah pemanggilan API berulang yang tidak diperlukan.

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
