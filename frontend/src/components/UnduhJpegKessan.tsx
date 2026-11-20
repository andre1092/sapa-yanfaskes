import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BarisKessan } from '../lib/kessan';
import { namaBerkasJpegKessan } from '../lib/kessanJpeg';
import { TabelJpegKessan } from './TabelJpegKessan';

// Tombol Unduh JPEG Monitoring Kessan (SPEK-jpeg.md). Alur ekspor disalin dari MonitoringSuratKontrolDashboard (PR #82):
// simpul di luar layar, jeda 200 ms, dua frame, lalu toJpeg.

type Props = {
  /** Baris halaman yang sudah disaring Periode dan Kabupaten; JPEG tidak menambah baris sendiri. */
  baris: BarisKessan[];
  bulan: string;
  kabupaten: string;
  petugas: boolean;
  namaRs: string;
  sementara: boolean;
  lastUpdate: string | null | undefined;
  /** Memuat atau galat: tombol nonaktif tanpa teks tambahan, panel sudah menjelaskan keadaannya. */
  nonaktif: boolean;
};

export function UnduhJpegKessan({ baris, bulan, kabupaten, petugas, namaRs, sementara, lastUpdate, nonaktif }: Props) {
  const [keadaan, setKeadaan] = useState<'diam' | 'menyiapkan' | 'gagal'>('diam');
  const eksporRef = useRef<HTMLDivElement>(null);
  const mati = nonaktif || !baris.length;
  const menyiapkan = keadaan === 'menyiapkan' && !mati;
  const namaBerkas = namaBerkasJpegKessan({ bulan, kabupaten: petugas ? '' : kabupaten, namaRs: petugas ? namaRs : '', sementara });

  useEffect(() => {
    if (keadaan !== 'menyiapkan') return;
    let batal = false;
    const t = window.setTimeout(async () => {
      const node = eksporRef.current;
      if (batal) return;
      // Simpul tidak terpasang (data dimuat ulang atau bulan tanpa baris): kembali diam, jangan tertahan menyiapkan.
      if (!node) { setKeadaan('diam'); return; }
      // Dua frame supaya tata letak dan gaya tabel selesai sebelum ditangkap.
      await new Promise(selesai => requestAnimationFrame(() => requestAnimationFrame(() => selesai(null))));
      if (batal) return;
      try {
        const { toJpeg } = await import('html-to-image');
        // Gambar sangat tinggi dipotret 1x supaya tidak melewati batas ukuran kanvas browser.
        const url = await toJpeg(node, { quality: 0.95, backgroundColor: '#ffffff', pixelRatio: node.scrollHeight > 3000 ? 1 : 2, skipFonts: true });
        if (batal) return;
        const a = document.createElement('a');
        a.download = namaBerkas;
        a.href = url;
        a.click();
        setKeadaan('diam');
      } catch (error) {
        console.error('Gagal membuat JPEG Monitoring Kessan', error);
        if (!batal) setKeadaan('gagal');
      }
    }, 200);
    return () => { batal = true; window.clearTimeout(t); };
  }, [keadaan, namaBerkas]);

  return <div className="ks-jpeg">
    {/* Menyiapkan: aria-disabled, bukan disabled, supaya fokus keyboard tetap di tombol (sama dengan "Coba lagi"). */}
    <button type="button" className="sapa-button sapa-button-secondary ks-jpeg-tombol" disabled={mati}
      aria-disabled={menyiapkan || undefined} aria-busy={menyiapkan || undefined}
      onClick={() => { if (!menyiapkan && !mati) setKeadaan('menyiapkan'); }}>
      {menyiapkan ? 'Menyiapkan JPEG…' : 'Unduh JPEG'}
    </button>
    {keadaan === 'gagal' && !mati && <p role="alert" className="ks-jpeg-galat">JPEG belum bisa dibuat. Coba lagi.</p>}
    {/* Simpul ekspor dipasang di body: .ks-page memakai container query (containment), sehingga posisi fixed di
        dalamnya tidak lagi terhadap layar. Awalan id jpeg-export- mengecualikannya dari animasi baris global. */}
    {menyiapkan && createPortal(
      <div id="jpeg-export-kessan" className="ks-ekspor-wadah" aria-hidden="true">
        <div ref={eksporRef}>
          <TabelJpegKessan baris={baris} bulan={bulan} kabupaten={petugas ? '' : kabupaten} petugas={petugas} namaRs={namaRs}
            sementara={sementara} lastUpdate={lastUpdate} />
        </div>
      </div>,
      document.body,
    )}
  </div>;
}
