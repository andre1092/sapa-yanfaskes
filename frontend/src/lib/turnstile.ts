// Cloudflare Turnstile dengan render eksplisit. Skrip dari challenges.cloudflare.com (sudah ada di CSP),
// tanpa skrip inline. Dipakai /verifikasi dan halaman login satu halaman.

export type Turnstile = {
  render: (el: HTMLElement, opsi: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

export const SKRIP_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let muatSkrip: Promise<Turnstile> | null = null;
export function skripTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  muatSkrip ??= new Promise((ok, gagal) => {
    const s = document.createElement('script');
    s.src = SKRIP_TURNSTILE;
    s.async = true;
    s.onload = () => (window.turnstile ? ok(window.turnstile) : gagal(new Error('turnstile')));
    s.onerror = () => { muatSkrip = null; gagal(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return muatSkrip;
}

/** Lebar minimum widget ukuran normal/flexible; di bawahnya dipakai ukuran compact. */
export const LEBAR_MIN_WIDGET = 300;

export type JenisGalatWidget = 'muat' | 'widget';
export type OpsiWidget = {
  siteKey: string;
  aksi: string;
  onToken: (token: string | null) => void;
  onGalat: (jenis: JenisGalatWidget) => void;
};
export type KendaliWidget = { reset: () => void; hapus: () => void };

/**
 * Pasang tepat satu widget di wadah. hapus() boleh dipanggil kapan saja, juga sebelum skrip selesai
 * dimuat (StrictMode memasang, melepas, lalu memasang lagi): widget yang batal tidak pernah dirender.
 */
export function pasangWidget(wadah: HTMLElement, opsi: OpsiWidget): KendaliWidget {
  let id: string | null = null;
  let dihapus = false;
  skripTurnstile().then(ts => {
    if (dihapus) return;
    const size = wadah.clientWidth > 0 && wadah.clientWidth < LEBAR_MIN_WIDGET ? 'compact' : 'flexible';
    // Penanda ukuran untuk CSS wadah: ukuran flexible mengisi lebar kartu, compact di tengah.
    wadah.dataset.ukuran = size;
    id = ts.render(wadah, {
      sitekey: opsi.siteKey, action: opsi.aksi,
      theme: 'light', language: 'id', appearance: 'always', size,
      // Token dikirim lewat body JSON oleh halaman; tanpa input tersembunyi di dalam form.
      'response-field': false,
      callback: (token: string) => opsi.onToken(token),
      'expired-callback': () => opsi.onToken(null),
      'timeout-callback': () => opsi.onToken(null),
      'error-callback': () => { opsi.onToken(null); opsi.onGalat('widget'); return true; },
    });
  }).catch(() => { if (!dihapus) opsi.onGalat('muat'); });
  return {
    reset: () => {
      opsi.onToken(null);
      if (id && window.turnstile) window.turnstile.reset(id);
    },
    hapus: () => {
      dihapus = true;
      if (id) window.turnstile?.remove(id);
      id = null;
    },
  };
}
