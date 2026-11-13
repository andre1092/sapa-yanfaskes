import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toJpeg } from 'html-to-image';
import { WARNA_SEL } from '../lib/antrolJpeg';
import { formatDurasiLaras, urutkanTerlama, warnaLaras } from '../lib/larasJpeg';
import type { WarnaLaras } from '../lib/larasJpeg';
import type { LarasPoint } from '../hooks/useLarasData';

interface UnduhJpegLarasProps {
  /** Judul grafik, misalnya "Rata-Rata Waktu Per Poli". */
  judul: string;
  /** Judul kolom label, misalnya "Nama Poli". */
  kolom: string;
  points: readonly LarasPoint[];
  formatLabel: (label: string) => string;
  /** Baris keterangan di bawah judul: filter aktif, periode, tanggal data. */
  keterangan: readonly string[];
  namaBerkas: string;
}

const KETERANGAN: { warna: WarnaLaras; label: string }[] = [
  { warna: 'merah', label: 'Merah: 00 hari 01:00:00 atau lebih' },
  { warna: 'kuning', label: 'Kuning: 00 hari 00:55:00 sampai di bawah 00 hari 01:00:00' },
  { warna: 'hijau', label: 'Hijau: di bawah 00 hari 00:55:00' },
];

const GARIS = '1px solid #1F2937';
const SEL: React.CSSProperties = { border: GARIS, padding: '6px 8px', whiteSpace: 'nowrap' };
const SEL_JUDUL: React.CSSProperties = { ...SEL, backgroundColor: '#00529C', color: '#FFFFFF', fontWeight: 700, textAlign: 'center' };

export const UnduhJpegLaras = ({ judul, kolom, points, formatLabel, keterangan, namaBerkas }: UnduhJpegLarasProps) => {
  const [keadaan, setKeadaan] = useState<'diam' | 'menyiapkan' | 'gagal'>('diam');
  const kanvasRef = useRef<HTMLDivElement>(null);
  const barisUrut = useMemo(() => (keadaan === 'menyiapkan' ? urutkanTerlama(points) : []), [keadaan, points]);

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
        console.error('Gagal membuat JPEG LARAS', error);
        if (!batal) setKeadaan('gagal');
      }
    }, 100);
    return () => {
      batal = true;
      window.clearTimeout(tunggu);
    };
  }, [keadaan, barisUrut.length, namaBerkas]);

  return (
    <span className="laras-unduh">
      <button
        type="button"
        className="sapa-button sapa-button-secondary"
        onClick={() => setKeadaan('menyiapkan')}
        disabled={points.length === 0 || keadaan === 'menyiapkan'}
        aria-busy={keadaan === 'menyiapkan'}
        aria-label={`Unduh JPEG ${judul}`}
        title={points.length === 0 ? 'Tidak ada baris untuk diunduh' : 'Unduh tabel sebagai gambar JPEG'}
      >
        {keadaan === 'menyiapkan' ? 'Menyiapkan gambar…' : 'Unduh JPEG'}
      </button>
      {keadaan === 'gagal' && <span role="alert" className="laras-unduh-gagal">Gambar gagal dibuat. Coba lagi.</span>}
      {keadaan === 'menyiapkan' && createPortal(
        <div aria-hidden="true" style={{ position: 'fixed', left: -100000, top: 0, pointerEvents: 'none' }}>
          <div
            ref={kanvasRef}
            style={{ width: 'max-content', minWidth: 700, padding: 24, backgroundColor: '#FFFFFF', color: '#111827', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, lineHeight: 1.35 }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>Monitoring LARAS — {judul}</div>
            <div style={{ marginTop: 2, color: '#374151' }}>Optimalisasi Waktu Tunggu Rawat Jalan Di Rumah Sakit</div>
            <div style={{ marginTop: 4, marginBottom: 12, color: '#374151' }}>
              {[...keterangan, `${barisUrut.length} baris`, `Diunduh ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`].join(' · ')}
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={SEL_JUDUL}>No</th>
                  <th style={SEL_JUDUL}>{kolom}</th>
                  <th style={SEL_JUDUL}>Rata-Rata Waktu 3-4 dan 2-4<br />(hari jam:menit:detik)</th>
                </tr>
              </thead>
              <tbody>
                {barisUrut.map((point, indeks) => {
                  const warna = WARNA_SEL[warnaLaras(point.avg_seconds)];
                  return (
                    <tr key={`${point.label}-${indeks}`}>
                      <td style={{ ...SEL, textAlign: 'center' }}>{indeks + 1}</td>
                      <td style={SEL}>{formatLabel(point.label)}</td>
                      <td style={{ ...SEL, textAlign: 'center', fontWeight: 700, backgroundColor: warna.latar, color: warna.teks, fontVariantNumeric: 'tabular-nums' }}>
                        {formatDurasiLaras(point.avg_seconds)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
              <span style={{ fontWeight: 700 }}>Keterangan:</span>
              {KETERANGAN.map(item => (
                <span key={item.warna} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 28, height: 14, border: GARIS, backgroundColor: WARNA_SEL[item.warna].latar }} />
                  {item.label}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 6, color: '#374151' }}>Rata-rata agregat sumber tanpa pembobotan jumlah pasien. Urut dari waktu terlama.</div>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
};
