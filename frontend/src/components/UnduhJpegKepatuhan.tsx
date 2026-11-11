import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toJpeg } from 'html-to-image';
import { urutkanUntukUnduh, warnaCapaian } from '../lib/kepatuhanJpeg';
import type { WarnaCapaian } from '../lib/kepatuhanJpeg';
import { KONFIG_UNDUH_JPEG } from './kepatuhanJpegKolom';
import type { BarisPerTab, KonfigUnduhJpeg, TabUnduhJpeg } from './kepatuhanJpegKolom';

interface UnduhJpegKepatuhanProps<K extends TabUnduhJpeg> {
  tab: K;
  /** Semua baris yang lolos filter aktif, bukan hanya halaman yang sedang tampil. */
  rows: readonly BarisPerTab[K][];
  periode: string;
  /** Filter aktif yang dicetak di bawah judul, misalnya kabupaten dan tipe faskes. */
  filter?: readonly string[];
  pencarian?: string;
  statusFilter?: 'ALL' | 'TERCAPAI' | 'BELUM_TERCAPAI';
}

// Warna sel mengikuti gambar JPEG yang sudah ada di halaman antrol, ditambah kuning.
const WARNA: Record<WarnaCapaian, { latar: string; teks: string }> = {
  merah: { latar: '#FFC7CE', teks: '#9C0006' },
  kuning: { latar: '#FFEB9C', teks: '#7A4B00' },
  hijau: { latar: '#C6EFCE', teks: '#006100' },
  kosong: { latar: '#FFFFFF', teks: '#111827' },
};

const KETERANGAN: { warna: WarnaCapaian; label: string }[] = [
  { warna: 'merah', label: 'Merah: capaian 0' },
  { warna: 'kuning', label: 'Kuning: capaian di atas 0 dan di bawah 100' },
  { warna: 'hijau', label: 'Hijau: capaian 100' },
];

const GARIS = '1px solid #1F2937';
const SEL: React.CSSProperties = { border: GARIS, padding: '6px 8px', whiteSpace: 'nowrap' };
const SEL_JUDUL: React.CSSProperties = { ...SEL, backgroundColor: '#00529C', color: '#FFFFFF', fontWeight: 700, textAlign: 'center' };

export const UnduhJpegKepatuhan = <K extends TabUnduhJpeg>({ tab, rows, periode, filter = [], pencarian = '', statusFilter = 'ALL' }: UnduhJpegKepatuhanProps<K>) => {
  const konfig = KONFIG_UNDUH_JPEG[tab] as unknown as KonfigUnduhJpeg<BarisPerTab[K]>;
  const [keadaan, setKeadaan] = useState<'diam' | 'menyiapkan' | 'gagal'>('diam');
  const kanvasRef = useRef<HTMLDivElement>(null);

  const barisUrut = useMemo(
    () => (keadaan === 'menyiapkan' ? urutkanUntukUnduh(rows, konfig.kunciUrut) : []),
    [keadaan, rows, konfig],
  );
  const tampilBulan = periode === 'Semua Bulan';
  const keteranganFilter = [
    ...filter,
    ...(statusFilter === 'ALL' ? [] : [statusFilter === 'TERCAPAI' ? 'Status: target tercapai' : 'Status: belum mencapai target']),
    ...(pencarian.trim() ? [`Pencarian: ${pencarian.trim()}`] : []),
  ];
  const namaBerkas = `Kepatuhan_FKRTL_${konfig.namaBerkas}_${periode.trim().replace(/\s+/g, '_')}`;

  useEffect(() => {
    if (keadaan !== 'menyiapkan') return;
    let batal = false;
    // Jeda singkat supaya tabel di luar layar selesai digambar sebelum dipotret.
    const tunggu = window.setTimeout(async () => {
      const node = kanvasRef.current;
      if (!node || batal) return;
      try {
        const dataUrl = await toJpeg(node, {
          quality: 0.95,
          backgroundColor: '#ffffff',
          // Tabel sangat panjang dipotret 1x supaya tidak melewati batas ukuran kanvas browser.
          pixelRatio: barisUrut.length > 150 ? 1 : 2,
          skipFonts: true,
        });
        if (batal) return;
        const link = document.createElement('a');
        link.download = `${namaBerkas}.jpeg`;
        link.href = dataUrl;
        link.click();
        setKeadaan('diam');
      } catch (error) {
        console.error('Gagal membuat JPEG kepatuhan', error);
        if (!batal) setKeadaan('gagal');
      }
    }, 100);
    return () => {
      batal = true;
      window.clearTimeout(tunggu);
    };
  }, [keadaan, barisUrut.length, namaBerkas]);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="sapa-button sapa-button-secondary"
        onClick={() => setKeadaan('menyiapkan')}
        disabled={rows.length === 0 || keadaan === 'menyiapkan'}
        aria-busy={keadaan === 'menyiapkan'}
        title={rows.length === 0 ? 'Tidak ada baris untuk diunduh' : 'Unduh tabel sebagai gambar JPEG'}
      >
        {keadaan === 'menyiapkan' ? 'Menyiapkan gambar…' : 'Unduh JPEG'}
      </button>
      {keadaan === 'gagal' && (
        <span role="alert" className="text-xs text-[var(--danger)]">Gambar gagal dibuat. Coba lagi.</span>
      )}
      {keadaan === 'menyiapkan' && createPortal(
        <div aria-hidden="true" style={{ position: 'fixed', left: -100000, top: 0, pointerEvents: 'none' }}>
          <div
            ref={kanvasRef}
            style={{ width: 'max-content', minWidth: 900, padding: 24, backgroundColor: '#FFFFFF', color: '#111827', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, lineHeight: 1.35 }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>Kepatuhan FKRTL — {konfig.judul}</div>
            <div style={{ marginTop: 4, marginBottom: 12, color: '#374151' }}>
              Periode: {periode}
              {keteranganFilter.length > 0 && ` · ${keteranganFilter.join(' · ')}`}
              {` · ${barisUrut.length} baris · Diunduh ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`}
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={SEL_JUDUL}>No</th>
                  {tampilBulan && <th style={SEL_JUDUL}>Bulan</th>}
                  {konfig.kolom.map(kolom => <th key={kolom.label} style={SEL_JUDUL}>{kolom.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {barisUrut.map((row, indeks) => (
                  <tr key={indeks}>
                    <td style={{ ...SEL, textAlign: 'center' }}>{indeks + 1}</td>
                    {tampilBulan && <td style={SEL}>{row.bulan}</td>}
                    {konfig.kolom.map(kolom => {
                      const warna = kolom.capaian ? WARNA[warnaCapaian(kolom.capaian(row))] : WARNA.kosong;
                      return (
                        <td
                          key={kolom.label}
                          style={{ ...SEL, textAlign: kolom.rata ?? 'left', backgroundColor: warna.latar, color: warna.teks, fontWeight: kolom.capaian ? 700 : 400 }}
                        >
                          {kolom.teks(row)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
              <span style={{ fontWeight: 700 }}>Keterangan:</span>
              {KETERANGAN.map(item => (
                <span key={item.warna} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 28, height: 14, border: GARIS, backgroundColor: WARNA[item.warna].latar }} />
                  {item.label}
                </span>
              ))}
            </div>
            {konfig.catatan && <div style={{ marginTop: 6, color: '#374151' }}>{konfig.catatan}</div>}
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
};
