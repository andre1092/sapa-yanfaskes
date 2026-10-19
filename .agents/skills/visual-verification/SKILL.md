---
name: visual-verification
description: "Verifikasi visual otomatis, penangkapan tangkapan layar deterministik, dan perbandingan piksel (Pixelmatch) terhadap referensi gambar resmi."
---

# Visual Verification Skill

Keahlian ini memandu eksekusi verifikasi regresi visual otomatis untuk mengukur tingkat kesesuaian piksel (*pixel fidelity*) antara implementasi aktual dan gambar referensi otoritatif.

## Kapan Diaktifkan
- Setelah implementasi atau modifikasi antarmuka pengguna selesai.
- Dalam pipeline validasi otomatis sebelum pull request atau deployment.
- Memeriksa dampak perubahan CSS/Tailwind terhadap tata letak visual.

## Langkah Operasional
1. **Penetapan Lingkungan Deterministik**:
   - Tentukan viewport standar (misal: Desktop 1280x800 atau 1440x900).
   - Pastikan font, aset gambar, dan status data telah termuat sempurna.
2. **Penangkapan Layar & Komparasi Piksel**:
   - Jalankan pembanding piksel menggunakan `pixelmatch` atau modul komparasi gambar.
   - Bandingkan `reference.png` terhadap `actual.png`.
   - Hasilkan `diff.png` untuk menyorot area piksel yang menyimpang.
3. **Kalkulasi Metrik Ketidakcocokan (*Mismatch Ratio*)**:
   - Hitung persentase perbedaan: `(mismatched_pixels / total_pixels) * 100%`.
   - Simpan laporan ke dalam `visual-report.json`.
4. **Evaluasi Ambang Batas (*Threshold*)**:
   - Periksa apakah ketidakcocokan visual berada dalam batas toleransi proyek (< 1–2%).
   - Jika ada perbedaan terkonsentrasi yang mengindikasikan elemen liar/hilang, tandai sebagai kegagalan verifikasi.

## Kriteria Penerimaan
- Berkas `actual.png`, `diff.png`, dan `visual-report.json` berhasil dihasilkan.
- Rasio ketidakcocokan visual terukur secara empiris tanpa estimasi fiktif.
