// Aturan warna gambar JPEG halaman Monitoring LARAS (keputusan CEO 2026-11-13).
export type WarnaLaras = 'merah' | 'kuning' | 'hijau' | 'kosong';

/** Kuning mulai 00 hari 00:55:00. */
export const BATAS_KUNING_DETIK = 55 * 60;
/** Merah mulai 00 hari 01:00:00. */
export const BATAS_MERAH_DETIK = 60 * 60;

const detikTercetak = (detik: number | null | undefined): number | null =>
  detik == null || !Number.isFinite(detik) ? null : Math.max(0, Math.round(detik));

/** Format yang sama dengan grafik di halaman: "DD hari HH:MM:SS". */
export const formatDurasiLaras = (detik: number | null | undefined): string => {
  const total = detikTercetak(detik);
  if (total === null) return 'N/A';
  const hari = String(Math.floor(total / 86400)).padStart(2, '0');
  const jam = [Math.floor((total % 86400) / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map(nilai => String(nilai).padStart(2, '0')).join(':');
  return `${hari} hari ${jam}`;
};

/** Hijau di bawah 55 menit, kuning 55 menit sampai di bawah 1 jam, merah 1 jam ke atas. */
export const warnaLaras = (detik: number | null | undefined): WarnaLaras => {
  const total = detikTercetak(detik);
  if (total === null) return 'kosong';
  if (total >= BATAS_MERAH_DETIK) return 'merah';
  if (total >= BATAS_KUNING_DETIK) return 'kuning';
  return 'hijau';
};

/** Waktu terlama dulu, lalu label A-Z. */
export const urutkanTerlama = <T extends { label: string; avg_seconds: number }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => b.avg_seconds - a.avg_seconds || a.label.localeCompare(b.label, 'id'));
