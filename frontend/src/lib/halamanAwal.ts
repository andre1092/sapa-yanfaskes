/** Halaman pertama setelah masuk dan untuk alamat akar "/" (keputusan CEO 2026-11-13). */
export const HALAMAN_AWAL = '/home';

/** Alamat halaman masuk SAPA (keputusan CEO 2026-11-16). */
export const HALAMAN_MASUK = '/login';

/** Halaman penyiapan dan pemulihan akun lokal; dibuka tanpa sesi. */
export const HALAMAN_SIAPKAN_AKUN = '/siapkan-akun';

/** Apakah jalur (tanpa query) adalah halaman Siapkan akun; garis miring di akhir diabaikan. */
export function diHalamanSiapkanAkun(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === HALAMAN_SIAPKAN_AKUN;
}

const PARAM_KEMBALI = 'kembali';

function jalurDari(alamat: string): string {
  return alamat.split(/[?#]/)[0].replace(/\/+$/, '');
}

function diHalamanMasuk(alamat: string): boolean {
  return jalurDari(alamat) === HALAMAN_MASUK;
}

/**
 * Alamat tujuan setelah kembali dari layanan masuk. Tautan langsung yang sah (misalnya
 * "/kepatuhanfkrtl?x=1") dipertahankan; alamat akar "/" dan "/login" diarahkan ke Beranda.
 * Masukan diharapkan sudah dibersihkan dengan safeReturnTo.
 */
export function alamatSetelahMasuk(alamat: string): string {
  const jalur = jalurDari(alamat);
  return jalur === '' || jalur === HALAMAN_MASUK ? HALAMAN_AWAL : alamat;
}

/**
 * Alamat bilah browser untuk pengunjung yang belum masuk: selalu /login. Tujuan semula selain
 * akar dan Beranda disimpan di parameter "kembali" supaya bisa dibuka lagi setelah masuk.
 */
export function alamatHalamanMasuk(alamat: string): string {
  if (diHalamanMasuk(alamat)) return alamat;
  const jalur = jalurDari(alamat);
  if (jalur === '' || jalur === HALAMAN_AWAL) return HALAMAN_MASUK;
  return `${HALAMAN_MASUK}?${PARAM_KEMBALI}=${encodeURIComponent(alamat)}`;
}

/**
 * Tujuan yang dikirim ke layanan masuk (appState.returnTo). Dari /login diambil parameter
 * "kembali"; hasilnya tetap harus dibersihkan dengan safeReturnTo oleh pemanggil.
 */
export function tujuanSetelahMasuk(alamat: string): string {
  if (!diHalamanMasuk(alamat)) return alamat;
  const query = alamat.includes('?') ? alamat.slice(alamat.indexOf('?') + 1).split('#')[0] : '';
  const kembali = new URLSearchParams(query).get(PARAM_KEMBALI);
  return kembali && !diHalamanMasuk(kembali) ? kembali : '/';
}
