import { bacaMode } from './bff';
import { aturModeSesi, type ModeSesi } from './session';
import type { ModeHalaman } from './useSession';

// Pembaca GET /api/v1/auth/mode tanpa React. Mode tidak ditebak bila gagal ('galat'), dan hanya
// jawaban dari pembacaan terakhir yang dipakai.

export function buatPembacaMode(baca: () => Promise<ModeSesi> = bacaMode) {
  let mode: ModeHalaman = 'memeriksa';
  let nomor = 0;
  const pendengar = new Set<() => void>();
  const ubah = (baru: ModeHalaman) => {
    if (baru === mode) return;
    mode = baru;
    for (const f of pendengar) f();
  };

  /** Baca mode; juga dipakai tombol "Coba lagi". Mengembalikan fungsi untuk membatalkan pembacaan ini. */
  function muat(): () => void {
    const ini = ++nomor;
    ubah('memeriksa');
    baca().then(
      hasil => { if (ini === nomor) { aturModeSesi(hasil); ubah(hasil); } },
      () => { if (ini === nomor) { aturModeSesi(null); ubah('galat'); } },
    );
    return () => { if (ini === nomor) nomor += 1; };
  }

  return {
    ambil: () => mode,
    langganan: (f: () => void) => { pendengar.add(f); return () => { pendengar.delete(f); }; },
    muat,
  };
}
