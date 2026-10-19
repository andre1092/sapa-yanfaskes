---
name: ui-implementation
description: "Implementasi antarmuka pengguna presisi tinggi berbasis referensi visual otoritatif, penggunaan token desain resmi, dan pencegahan dekorasi generik AI."
---

# UI Implementation Skill

Keahlian ini mengatur proses penerjemahan referensi visual menjadi kode komponen frontend yang modular, semantik, dan setia 1:1 terhadap referensi.

## Kapan Diaktifkan
- Menulis komponen React / TypeScript baru berdasarkan referensi visual yang diaudit.
- Merefaktor komponen antarmuka yang mengalami penyimpangan (*visual drift*).
- Menghubungkan token CSS/Tailwind resmi ke elemen tampilan.

## Langkah Operasional
1. **Pemeriksaan Komponen yang Ada (*Reuse First*)**:
   - Cari komponen serupa di `frontend/src/components/` sebelum membuat berkas baru.
   - Gunakan komponen dasar yang sudah ada (Header, Sidebar, ErrorBoundary, Cards).
2. **Penerapan Token Desain Resmi**:
   - Gunakan token palet warna resmi BPJS (`--bpjs-navy`, `--bpjs-green`, `--bpjs-slate-blue`, dll).
   - Pertahankan variabel Glassmorphism (`glass-panel`, `glass-card`) sesuai tema aktif.
3. **Konstruksi Tata Letak & Tipografi**:
   - Gunakan tata letak Flexbox/Grid dengan spasi proporsional terhadap referensi.
   - Terapkan font `Plus Jakarta Sans` dan ukuran hierarki teks yang presisi.
   - Jangan menyisipkan elemen dekoratif tanpa mandat referensi.
4. **Aksesibilitas & Semantik**:
   - Gunakan tag semantik (`<nav>`, `<header>`, `<main>`, `<section>`, `<button>`).
   - Sediakan atribut `aria-label` dan kontras warna yang memenuhi WCAG 2.2 AA.

## Kriteria Penerimaan
- Kode komponen lolos linter (`oxlint` / `eslint`) dan kompilasi TypeScript (`tsc -b`).
- Tampilan antarmuka merefleksikan 100% elemen dari manifest bukti.
