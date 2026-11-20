import type { SessionContext } from './useSession';

// Pilihan layar utama dan alamat bilah browser dari keadaan sesi. Dipisah dari App.tsx supaya bisa diuji.

export type Tampilan = 'masuk' | 'keluar' | 'dasbor';
type KeadaanTampilan = Pick<SessionContext, 'ready' | 'authenticated' | 'mode' | 'keluar'>;

export function pilihTampilan(sesi: KeadaanTampilan, storeMasuk: boolean): Tampilan {
  if (!sesi.ready || !sesi.authenticated || !storeMasuk) return 'masuk';
  // Keluar mode bff yang belum selesai atau gagal: dasbor disembunyikan, sesi tetap ada sampai server mengakhirinya.
  if (sesi.keluar && (sesi.keluar.menunggu || sesi.keluar.galat)) return 'keluar';
  return 'dasbor';
}

/**
 * Apakah alamat bilah browser perlu dibawa ke /login. Saat mode login tidak dapat dibaca ('galat'),
 * alamat dibiarkan apa adanya: parameter kembalian layanan masuk lama (?code=…&state=…) harus tetap
 * ada sampai "Coba lagi" berhasil.
 */
export function perluAlamatMasuk(sesi: KeadaanTampilan, storeMasuk: boolean): boolean {
  return sesi.ready && sesi.mode !== 'galat' && pilihTampilan(sesi, storeMasuk) === 'masuk';
}
