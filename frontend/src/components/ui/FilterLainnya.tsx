import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Hukum Hick dan Miller (prinsip video, PR 4 dari 4): filter yang jarang dipakai disimpan di
 * balik satu tombol supaya pilihan yang tampil lebih sedikit. Isinya tetap terpasang (hanya
 * disembunyikan), jadi nilainya tidak hilang. Tombol menyebut berapa filter di dalamnya yang
 * sedang aktif, supaya saringan tersembunyi tidak membingungkan.
 */
export function FilterLainnya({ children }: { children: ReactNode }) {
  const [buka, setBuka] = useState(false);
  const [aktif, setAktif] = useState(0);
  const wadah = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const el = wadah.current;
    if (!el) return undefined;
    const hitung = () => setAktif(el.querySelectorAll('[data-filter-aktif="true"]').length);
    const pengamat = new MutationObserver(hitung);
    pengamat.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-filter-aktif'] });
    queueMicrotask(hitung);
    return () => pengamat.disconnect();
  }, []);

  return <>
    <button type="button" className="sapa-filter-lainnya" aria-expanded={buka} aria-controls={id} onClick={() => setBuka(v => !v)}>
      <span>{buka ? 'Sembunyikan filter' : 'Filter lainnya'}</span>
      {aktif > 0 && <span className="sapa-filter-lainnya__jumlah">{aktif} aktif</span>}
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <div id={id} ref={wadah} className={buka ? 'sapa-filter-lainnya__isi' : 'sapa-filter-lainnya__isi sapa-filter-lainnya__isi--tutup'} role="group" aria-label="Filter lainnya">
      {children}
    </div>
  </>;
}
