---
name: visual-diff-diagnosis
description: "Diagnosis anomali visual, pelacakan komponen penyebab deviasi piksel dari gambar diff, dan koreksi terarah dalam siklus iterasi terbatas."
---

# Visual Diff Diagnosis Skill

Keahlian ini memandu proses investigasi dan perbaikan terarah ketika terjadi perbedaan visual (*visual mismatch*) antara hasil render aktual dan referensi desain.

## Kapan Diaktifkan
- Hasil pengujian visual (Pixelmatch) menunjukkan deviasi yang melebihi ambang batas toleransi.
- Muncul artefak visual yang ditandai warna kontras pada `diff.png`.
- Terdapat elemen UI yang bergeser atau salah ukuran.

## Langkah Operasional
1. **Lokalisasi Wilayah Deviasi**:
   - Buka dan periksa peta koordinat deviasi pada `diff.png`.
   - Identifikasi apakah deviasi berasal dari: pergeseran posisi (margin/padding), perbedaan warna/kontras, ukuran font, atau ketiadaan elemen.
2. **Pemetaan ke Komponen Kode**:
   - Telusuri berkas komponen terkait di `frontend/src/components/`.
   - Hindari merombak file lain yang tidak berkontribusi pada deviasi tersebut (*surgical fix*).
3. **Penyelarasan Bukti Referensi**:
   - Periksa kembali nilai CSS/Tailwind pada `evidence-manifest.json` untuk elemen tersebut.
   - Perbaiki properti spesifik (misal: penyesuaian `gap`, `h-[...]`, atau kode warna hex).
4. **Siklus Koreksi Terbatas (*Bounded Loop*)**:
   - Render ulang dan jalankan komparasi visual kembali.
   - Batasi siklus koreksi maksimal 3 iterasi. Jika deviasi persisten akibat keterbatasan data referensi, laporkan secara transparan.

## Kriteria Penerimaan
- Perbaikan dilakukan secara terisolasi tanpa merusak komponen lain.
- Rasio deviasi visual berkurang mendekati target toleransi.
