// Bulan paling akhir dari daftar opsi filter ("November 2026", "October 2026", ...).
const URUTAN_BULAN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function bulanTerbaru(opsi: readonly string[] | undefined | null): string {
  let terbaik = '';
  let kunciTerbaik = -1;
  for (const teks of opsi || []) {
    const cocok = /^([A-Za-z]+)\s+(\d{4})$/.exec(String(teks).replace(/ /g, ' ').trim());
    if (!cocok) continue;
    const indeks = URUTAN_BULAN.indexOf(cocok[1]);
    if (indeks < 0) continue;
    const kunci = Number(cocok[2]) * 12 + indeks;
    if (kunci > kunciTerbaik) {
      kunciTerbaik = kunci;
      terbaik = teks;
    }
  }
  return terbaik;
}
