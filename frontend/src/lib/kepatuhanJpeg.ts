// Aturan gambar JPEG tabel kepatuhan FKRTL: warna sel capaian dan urutan baris.

export type WarnaCapaian = 'merah' | 'kuning' | 'hijau' | 'kosong';

const keAngka = (nilai: unknown): number | null => {
  if (nilai === null || nilai === undefined || nilai === '') return null;
  const n = typeof nilai === 'number' ? nilai : parseFloat(String(nilai));
  return Number.isFinite(n) ? n : null;
};

/** Angka seperti yang tercetak di gambar: dua desimal, '-' bila tidak ada data. */
export const formatCapaian = (nilai: unknown): string => {
  const n = keAngka(nilai);
  return n === null ? '-' : n.toFixed(2);
};

/** Merah bila capaian 0, kuning bila di antara 0 dan 100, hijau bila 100 (atau lebih). */
export const warnaCapaian = (nilai: unknown): WarnaCapaian => {
  const n = keAngka(nilai);
  if (n === null) return 'kosong';
  // Dibulatkan dulu supaya warna selalu cocok dengan angka yang tercetak.
  const tercetak = Math.round(n * 100) / 100;
  if (tercetak <= 0) return 'merah';
  if (tercetak >= 100) return 'hijau';
  return 'kuning';
};

/** Batas Patuh untuk Nilai Akhir kepatuhan yang ditampilkan di layar. */
export const AMBANG_PATUH_NILAI_AKHIR = 70;

type BarisUnduh = { kabupaten?: unknown; nama_ppk?: unknown };

/**
 * Urutan baris di gambar: kabupaten A-Z, lalu tiap kolom di `kunciNilai` dari tertinggi ke
 * terendah (kolom berikutnya dipakai bila kolom sebelumnya sama), lalu nama rumah sakit A-Z.
 * Baris tanpa data ditaruh paling bawah di kabupatennya. Tidak mengubah array asal.
 */
export const urutkanUntukUnduh = <T extends BarisUnduh>(rows: readonly T[], kunciNilai: readonly (keyof T)[]): T[] =>
  [...rows].sort((a, b) => {
    const kab = String(a.kabupaten ?? '').localeCompare(String(b.kabupaten ?? ''), 'id');
    if (kab !== 0) return kab;
    for (const kunci of kunciNilai) {
      const selisih = (keAngka(b[kunci]) ?? -Infinity) - (keAngka(a[kunci]) ?? -Infinity);
      // NaN muncul bila kedua baris tanpa data; lanjut ke kolom berikutnya.
      if (selisih !== 0 && !Number.isNaN(selisih)) return selisih;
    }
    return String(a.nama_ppk ?? '').localeCompare(String(b.nama_ppk ?? ''), 'id');
  });
