/**
 * Pencarian toleran (hukum Postel: longgar pada masukan pengguna). Huruf besar-kecil, aksen,
 * tanda baca, dan spasi ganda tidak menghalangi. Setiap kata yang diketik cukup muncul di salah
 * satu kolom, dalam urutan apa pun, jadi "soebandi jember" menemukan "RSD dr. Soebandi" di
 * Kabupaten Jember dan "sitifatimah" menemukan "Siti Fatimah".
 */
export function normalisasiCari(teks: unknown): string {
  return String(teks ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('id')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Membuat pencocok sekali per kueri, lalu dipakai untuk tiap baris. Kueri kosong cocok dengan semua. */
export function pencocokCari(kueri: string): (...kolom: unknown[]) => boolean {
  const kata = normalisasiCari(kueri).split(' ').filter(Boolean);
  if (kata.length === 0) return () => true;
  return (...kolom) => {
    const isi = kolom.map(normalisasiCari).join(' ');
    const rapat = isi.replace(/ /g, '');
    return kata.every(k => isi.includes(k) || rapat.includes(k));
  };
}

export function cocokCari(kueri: string, ...kolom: unknown[]): boolean {
  return pencocokCari(kueri)(...kolom);
}
