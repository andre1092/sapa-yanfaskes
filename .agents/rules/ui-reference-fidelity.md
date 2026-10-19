---
trigger: always_on
description: Kebijakan fidelitas antarmuka visual berbasis referensi otoritatif (STRICT_REFERENCE vs ORIGINAL_DESIGN) dan anti-halusinasi elemen UI.
---

# PROFI UI FIDELITY POLICY

Aturan wajib untuk implementasi antarmuka pengguna (UI/UX) berbasis bukti di Google Antigravity:

## 1. Dua Mode Desain
- **STRICT_REFERENCE (Default saat ada referensi)**: Aktif otomatis saat terdapat tangkapan layar, Figma, URL, atau mockup. Agen bertindak sebagai *implementation engineer* dan dilarang mendesain ulang (*no arbitrary redesign*).
- **ORIGINAL_DESIGN**: Hanya aktif jika tidak ada referensi visual atau pengguna secara eksplisit meminta desain kreatif baru, berlandaskan pedoman merek dan token desain yang ada.

## 2. Kebijakan Anti-Halusinasi Elemen Visual
Dilarang keras menambahkan elemen visual tanpa bukti eksplisit dari referensi:
- Dilarang menambah seksi, kartu, tombol, navigasi, atau ikon yang tidak ada di referensi.
- Dilarang menyisipkan ilustrasi placeholder, animasi dekoratif, gradien tambahan, atau efek glow jika tidak didukung referensi.
- Dilarang mengarang teks pemasaran atau metrik statistik palsu.
- Pertahankan hierarki tipografi, warna, spasi, border radius, dan tata letak asli.

## 3. Otoritas Sumber Desain
Keputusan visual wajib bersumber dari:
1. Kebutuhan eksplisit pengguna.
2. Tangkapan layar/mockup atau node Figma yang disetujui.
3. Token desain resmi yang ada (`index.css` / Tailwind).
4. Komponen yang sudah ada di basis kode (`frontend/src/components`).

## 4. Manifest Bukti & Pengujian Visual
- Setiap elemen antarmuka yang direncanakan harus tercatat dalam manifest bukti (`design-reference/evidence-manifest.json`).
- Validasi visual wajib dilakukan melalui perbandingan piksel (Pixelmatch) atau pengujian fungsional komponen sebelum status implementasi dinyatakan selesai (`VERIFIED_COMPLETE`).
