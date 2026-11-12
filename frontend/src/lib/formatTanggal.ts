/**
 * Format tanggal untuk tampilan saja (audit UI/UX 2026-11-12, temuan 12). Nilai data, filter,
 * dan parameter API tidak diubah. Teks yang tidak dikenali dikembalikan apa adanya.
 */

/**
 * Sumber Google Sheets antrean memakai format Amerika "MM/DD/YYYY hh:mm:ss".
 * Ditampilkan sebagai "DD/MM/YYYY hh:mm". Kalau angka pertama di atas 12, teks sudah
 * berformat hari/bulan, jadi hanya detiknya yang dibuang.
 */
export function tanggalDariFormatAS(teks: string | null | undefined): string {
  if (!teks) return teks ?? '';
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(teks.trim());
  if (!m) return teks;
  const [, a, b, tahun, jam, menit] = m;
  const [hari, bulan] = Number(a) > 12 ? [a, b] : [b, a];
  if (Number(bulan) < 1 || Number(bulan) > 12 || Number(hari) < 1 || Number(hari) > 31) return teks;
  const tgl = `${hari.padStart(2, '0')}/${bulan.padStart(2, '0')}/${tahun}`;
  return jam ? `${tgl} ${jam.padStart(2, '0')}:${menit}` : tgl;
}

/** "YYYY-MM-DD[ hh:mm][ WIB]" ditampilkan sebagai "DD/MM/YYYY[ hh:mm][ WIB]". */
export function tanggalIso(teks: string | null | undefined): string {
  if (!teks) return teks ?? '';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(\s*[A-Za-z]{2,4})?$/.exec(teks.trim());
  if (!m) return teks;
  const [, tahun, bulan, hari, jam, menit, zona] = m;
  return `${hari}/${bulan}/${tahun}${jam ? ` ${jam}:${menit}` : ''}${zona ?? ''}`;
}

const BULAN: Record<string, string> = {
  january: 'Januari', february: 'Februari', march: 'Maret', april: 'April', may: 'Mei', june: 'Juni',
  july: 'Juli', august: 'Agustus', september: 'September', october: 'Oktober', november: 'November', december: 'Desember',
};

/** Nama bulan Inggris di teks (misalnya "October 2026") diganti nama bulan Indonesia. */
export function bulanIndonesia(teks: string | null | undefined): string {
  if (!teks) return teks ?? '';
  return teks.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g, b => BULAN[b.toLowerCase()]);
}
