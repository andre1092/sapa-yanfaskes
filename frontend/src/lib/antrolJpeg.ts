// Aturan warna gambar JPEG halaman Pemanfaatan Antrean Online FKRTL (keputusan CEO 2026-11-13).
import type { WarnaCapaian } from './kepatuhanJpeg';

export const TARGET_MOBILE_JKN = 80;
export const TARGET_SEMUA_SUMBER = 95;

/** Mobile JKN memakai target 80%; Semua Sumber (juga nama lamanya "All Sumber") 95%. */
export const targetSumber = (sumber: unknown): number =>
  String(sumber ?? '').trim().toLowerCase() === 'mobile jkn' ? TARGET_MOBILE_JKN : TARGET_SEMUA_SUMBER;

const keAngka = (nilai: unknown): number | null => {
  if (nilai === null || nilai === undefined || nilai === '') return null;
  const n = typeof nilai === 'number' ? nilai : Number(nilai);
  return Number.isFinite(n) ? n : null;
};

/** Merah bila 0, hijau bila mencapai target, kuning di antaranya; dinilai dari angka dua desimal. */
export const warnaAntrol = (nilai: unknown, target: number): WarnaCapaian => {
  const n = keAngka(nilai);
  if (n === null) return 'kosong';
  const tercetak = Math.round(n * 100) / 100;
  if (tercetak <= 0) return 'merah';
  if (tercetak >= target) return 'hijau';
  return 'kuning';
};

/** Warna latar dan teks sel, sama dengan gambar JPEG Kepatuhan FKRTL. */
export const WARNA_SEL: Record<WarnaCapaian, { latar: string; teks: string }> = {
  merah: { latar: '#FFC7CE', teks: '#9C0006' },
  kuning: { latar: '#FFEB9C', teks: '#7A4B00' },
  hijau: { latar: '#C6EFCE', teks: '#006100' },
  kosong: { latar: '#FFFFFF', teks: '#111827' },
};

type BarisRs = { Faskes?: unknown; Kabupaten?: unknown; all_sumber_pct?: unknown; mjkn_pct?: unknown };

/** Urut kabupaten A-Z, lalu Semua Sumber tertinggi, lalu Mobile JKN tertinggi, lalu nama A-Z. */
export const urutkanRsAntrol = <T extends BarisRs>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => {
    const kab = String(a.Kabupaten ?? '').localeCompare(String(b.Kabupaten ?? ''), 'id');
    if (kab !== 0) return kab;
    for (const kunci of ['all_sumber_pct', 'mjkn_pct'] as const) {
      const selisih = (keAngka(b[kunci]) ?? -Infinity) - (keAngka(a[kunci]) ?? -Infinity);
      if (selisih !== 0 && !Number.isNaN(selisih)) return selisih;
    }
    return String(a.Faskes ?? '').localeCompare(String(b.Faskes ?? ''), 'id');
  });
