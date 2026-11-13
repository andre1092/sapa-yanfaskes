/** Halaman pertama setelah masuk dan untuk alamat akar "/" (keputusan CEO 2026-11-13). */
export const HALAMAN_AWAL = '/home';

/**
 * Alamat tujuan setelah kembali dari layanan masuk. Tautan langsung yang sah (misalnya
 * "/kepatuhanfkrtl?x=1") dipertahankan; alamat akar "/" diarahkan ke Beranda.
 * Masukan diharapkan sudah dibersihkan dengan safeReturnTo.
 */
export function alamatSetelahMasuk(alamat: string): string {
  const jalur = alamat.split(/[?#]/)[0].replace(/\/+$/, '');
  return jalur === '' ? HALAMAN_AWAL : alamat;
}
