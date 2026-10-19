---
name: reference-audit
description: "Audit referensi visual, ekstraksi hierarki tata letak, dan pencatatan bukti elemen antarmuka ke dalam evidence manifest sebelum implementasi UI."
---

# Reference Audit Skill

Keahlian ini memandu pemeriksaan mendalam terhadap materi referensi visual (screenshot, Figma, URL, atau mockup) untuk memastikan semua keputusan UI berlandaskan bukti nyata.

## Kapan Diaktifkan
- Sebelum menulis atau mengubah kode komponen antarmuka pengguna (UI).
- Saat menerima materi referensi visual baru dari pengguna.
- Saat melakukan audit kesesuaian antara desain sumber dan manifest elemen.

## Langkah Operasional
1. **Identifikasi Materi Referensi**:
   - Catat format referensi (gambar PNG/JPG, tautan Figma, tangkapan situs).
   - Simpan metadata sumber (dimensi viewport, resolusi, nama file).
2. **Dekonstruksi Hierarki Visual**:
   - Identifikasi kontainer utama, grid layout, dan hierarki navigasi.
   - Ekstrak teks statis persis sesuai tampilan referensi tanpa mengubah kata.
   - Petakan palet warna, tipografi, padding, dan corner radius.
3. **Penyusunan Evidence Manifest**:
   - Catat setiap elemen ke dalam `design-reference/evidence-manifest.json`.
   - Klasifikasikan status: `VERIFIED`, `PARTIALLY_VERIFIED`, `MISSING_EVIDENCE`, atau `CONFLICTING_EVIDENCE`.
4. **Validasi Kesiapan**:
   - Jika terdapat bukti kritis yang hilang, tandai `BLOCKED_MISSING_EVIDENCE` dan minta klarifikasi.
   - Jika ada pertentangan antara dua referensi, laporkan konflik tanpa memilih secara sepihak.

## Kriteria Penerimaan
- Seluruh elemen visual memiliki tautan ke sumber referensi nyata.
- Berkas `design-reference/evidence-manifest.json` terisi dan valid.
