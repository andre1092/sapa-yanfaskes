import { flushSync } from 'react-dom';

type Transisi = { finished: Promise<unknown>; ready: Promise<unknown> };
type DokumenTransisi = Document & { startViewTransition?: (perbarui: () => void) => Transisi };
export type JenisTransisi = 'tema' | 'halaman';

/** Jari-jari lingkaran dari titik (x, y) sampai sudut layar terjauh, untuk mask ganti tema. */
export function jariJariSampaiSudut(x: number, y: number, lebar: number, tinggi: number): number {
  return Math.ceil(Math.hypot(Math.max(x, lebar - x), Math.max(y, tinggi - y)));
}

/** Titik tengah elemen yang diklik (juga saat diaktifkan dengan keyboard), sebagai pusat mask. */
export function titikDari(event?: { currentTarget: EventTarget | null }): { x: number; y: number } | undefined {
  const el = event?.currentTarget as { getBoundingClientRect?: () => DOMRect } | null | undefined;
  if (!el || typeof el.getBoundingClientRect !== 'function') return undefined;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}

/**
 * Menjalankan perubahan tampilan lewat View Transitions API bawaan browser, tanpa pustaka gerak.
 * Gerak di index.css dipilih lewat atribut data-transisi pada <html>. Bila browser belum mendukung
 * atau pengguna meminta gerak dikurangi, perubahan langsung diterapkan tanpa transisi.
 */
export function jalankanTransisi(perbarui: () => void, opsi: { jenis: JenisTransisi; asal?: { x: number; y: number } }): void {
  const dok = document as DokumenTransisi;
  const kurangiGerak = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (typeof dok.startViewTransition !== 'function' || kurangiGerak) {
    perbarui();
    return;
  }
  const akar = document.documentElement;
  if (opsi.asal) {
    akar.style.setProperty('--transisi-x', `${opsi.asal.x}px`);
    akar.style.setProperty('--transisi-y', `${opsi.asal.y}px`);
    akar.style.setProperty('--transisi-r', `${jariJariSampaiSudut(opsi.asal.x, opsi.asal.y, window.innerWidth, window.innerHeight)}px`);
  }
  akar.dataset.transisi = opsi.jenis;
  const bersihkan = () => { if (akar.dataset.transisi === opsi.jenis) delete akar.dataset.transisi; };
  try {
    const transisi = dok.startViewTransition(() => flushSync(perbarui));
    transisi.ready.catch(() => undefined);
    transisi.finished.then(bersihkan, bersihkan);
  } catch {
    bersihkan();
    perbarui();
  }
}
