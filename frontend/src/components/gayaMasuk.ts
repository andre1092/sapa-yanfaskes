// Token warna halaman masuk, sama dengan tema-auth0.json (kontras AA).
// Warna terang ditulis eksplisit supaya halaman masuk tetap terang juga bila pengguna menyimpan tema gelap.
export const WARNA = { latar: '#eef3f8', kartu: '#ffffff', garis: '#e3e8ef', judul: '#0f2a4d', teks: '#1f2937', redup: '#5b6b7f', hijau: '#007a43', hijauSorot: '#00663a', biru: '#0060a0', merah: '#b42318', merahLatar: '#fdecea', hijauLatar: '#e8f3ec', hijauTua: '#14532d' } as const;

// '&&' menaikkan spesifisitas supaya aturan fokus global di index.css tidak menimpa.
export const FOKUS = { '&&:focus-visible': { outline: `3px solid ${WARNA.biru}`, outlineOffset: '2px' } } as const;

export const TOMBOL = {
  bgcolor: WARNA.hijau, color: '#fff',
  '&:hover': { bgcolor: WARNA.hijauSorot, color: '#fff' },
  '&.Mui-disabled': { bgcolor: WARNA.hijau, color: '#fff', opacity: 0.65 },
  ...FOKUS,
} as const;

export const ALERT_GALAT = { bgcolor: WARNA.merahLatar, color: WARNA.merah, '& .MuiAlert-icon': { color: WARNA.merah } } as const;

// Kolom isian dan tombol teks kartu masuk (dipakai juga halaman Siapkan akun).
export const KOLOM = {
  '& .MuiOutlinedInput-root': { bgcolor: WARNA.kartu, color: WARNA.teks },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#c3ccd8' },
  '& .MuiInputLabel-root': { color: WARNA.redup },
  '& .MuiInputLabel-root.Mui-focused': { color: WARNA.biru },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: WARNA.biru, borderWidth: 2 },
} as const;
export const TOMBOL_TEKS = { color: WARNA.biru, textTransform: 'none', fontWeight: 600, px: 1, minHeight: 44, ...FOKUS } as const;
