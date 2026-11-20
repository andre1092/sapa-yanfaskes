import type React from 'react';
import { angka, persen, skorRata } from '../lib/kessan';
import type { BarisKessan } from '../lib/kessan';
import {
  JENJANG_SKOR, judulJpeg, keteranganJpeg, lingkupJpeg, susunTabelJpeg, teksDiunduh, teksLastUpdate, teksSementara, warnaSkor,
} from '../lib/kessanJpeg';
import type { BarisJpeg, RingkasJpeg } from '../lib/kessanJpeg';

// Tabel Unduh JPEG Monitoring Kessan FKRTL: keputusan CEO 2026-11-20, tata letak agents/kim/desain/monitoring-kessan/SPEK-jpeg.md
// (pola TabelJpegSuratKontrol). Gambar selalu bertema terang; semua warna ditulis langsung, bukan token tema.
const TEKS = '#111827';
const REDUP = '#374151';
const GARIS = '1px solid #1F2937';
const KUNING = '#FFEB9C';
const PENANDA = '4px solid #a85200';
const SEL: React.CSSProperties = { border: GARIS, padding: '6px 8px', whiteSpace: 'nowrap', verticalAlign: 'middle' };
const ANGKA: React.CSSProperties = { ...SEL, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const JUDUL: React.CSSProperties = { ...SEL, backgroundColor: '#00529C', color: '#FFFFFF', fontWeight: 700, textAlign: 'center', whiteSpace: 'normal' };
const warna = (skor: number): React.CSSProperties => { const w = warnaSkor(skor); return { backgroundColor: w.latar, color: w.teks }; };

type Props = {
  /** Baris halaman yang sudah disaring Periode dan Kabupaten (Petugas RS: disaring server). */
  baris: BarisKessan[];
  bulan: string;
  kabupaten: string;
  petugas: boolean;
  namaRs: string;
  sementara: boolean;
  lastUpdate: string | null | undefined;
};

function BarisRingkas({ r, latar }: { r: RingkasJpeg; latar: string }) {
  return <tr style={{ fontWeight: 700, backgroundColor: latar }}>
    <td style={SEL} colSpan={2}>{r.label}</td>
    <td style={ANGKA}>{angka(r.target)}</td>
    <td style={ANGKA}>{angka(r.kunjungan)}</td>
    <td style={ANGKA}>{r.persen != null ? `${persen(r.persen)}%` : '–'}</td>
    <td style={{ ...SEL, textAlign: 'center', fontWeight: 400 }}>rata-rata {skorRata(r.rataSkor)}</td>
  </tr>;
}

export function TabelJpegKessan({ baris, bulan, kabupaten, petugas, namaRs, sementara, lastUpdate }: Props) {
  const t = susunTabelJpeg(baris, { kabupaten, petugas });
  const lingkup = lingkupJpeg({ kabupaten, petugas, namaRs });
  return <div style={{ width: 'max-content', minWidth: 640, padding: 24, backgroundColor: '#FFFFFF', color: TEKS, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, lineHeight: 1.35 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{judulJpeg(bulan)}</div>
      {sementara && <span style={{ border: '1px solid #A85200', backgroundColor: '#FFF4E5', color: '#A85200', fontWeight: 700, fontSize: 11, padding: '1px 8px', letterSpacing: '.04em' }}>DATA SEMENTARA</span>}
    </div>
    <div style={{ marginTop: 4, color: REDUP }}>{keteranganJpeg(lingkup)}</div>
    <div style={{ marginTop: 2, color: REDUP }}>{teksLastUpdate(lastUpdate)}</div>
    {sementara && <div style={{ marginTop: 2, color: '#A85200', fontWeight: 700 }}>{teksSementara(bulan)}</div>}
    {petugas && <div style={{ marginTop: 2, color: REDUP }}>Akun rumah sakit: hanya data faskes sendiri.</div>}
    <table style={{ borderCollapse: 'collapse', marginTop: 12 }}>
      <thead>
        <tr>
          <th style={{ ...JUDUL, minWidth: 84 }}>Kabupaten</th>
          <th style={{ ...JUDUL, minWidth: 240 }}>Nama FKRTL</th>
          <th style={{ ...JUDUL, minWidth: 84 }}>Target<br />Kessan</th>
          <th style={{ ...JUDUL, minWidth: 84 }}>Jumlah<br />Kunjungan</th>
          <th style={{ ...JUDUL, minWidth: 84 }}>%<br />Capaian</th>
          <th style={{ ...JUDUL, minWidth: 96 }}>Skor<br />Kepatuhan</th>
        </tr>
      </thead>
      <tbody>
        {t.kelompok.map(g => <ElemenKelompok key={g.kabupaten || '-'} baris={g.baris} />)}
        {t.total && <BarisRingkas r={t.total} latar="#E5E7EB" />}
      </tbody>
    </table>
    <div style={{ marginTop: 12, fontWeight: 700 }}>Keterangan:</div>
    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 14, border: GARIS, borderLeft: PENANDA, backgroundColor: KUNING, fontSize: 10 }}>⚠</span>
      <span>Kunjungan di bawah target (% Capaian &lt; 100%).</span>
    </div>
    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <span>Skor kepatuhan:</span>
      {JENJANG_SKOR.map(([n, rentang]) => <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ ...warna(n), border: GARIS, padding: '0 6px', fontWeight: 700 }}>{n}</span>{rentang}</span>)}
    </div>
    {t.adaTanpaTarget && <div style={{ marginTop: 6 }}>
      * Target belum ada (kosong atau 0): skor 100; tidak ikut dalam % Capaian, % Total, serta rata-rata skor.
    </div>}
    <div style={{ marginTop: 10, fontSize: 11, color: REDUP }}>{teksDiunduh(new Date())}</div>
  </div>;
}

function ElemenKelompok({ baris }: { baris: BarisJpeg[] }) {
  return <>
    {baris.map(b => {
      const latar: React.CSSProperties = b.kuning ? { backgroundColor: KUNING } : {};
      return <tr key={b.kode}>
        <td style={{ ...SEL, ...latar, borderLeft: b.kuning ? PENANDA : GARIS }}>{b.kabupaten}</td>
        <td style={{ ...SEL, ...latar, whiteSpace: 'normal', maxWidth: 240 }}>{b.kuning ? '⚠ ' : ''}{b.nama}</td>
        <td style={{ ...ANGKA, ...latar }}>{b.tanpaTarget ? <span style={{ fontStyle: 'italic', color: '#4B5563' }}>target belum ada</span> : angka(b.target as number)}</td>
        <td style={{ ...ANGKA, ...latar, fontWeight: b.kuning ? 700 : undefined }}>{angka(b.kunjungan)}</td>
        <td style={{ ...ANGKA, ...latar }}>{b.persen != null ? `${persen(b.persen)}%` : '–'}</td>
        <td style={{ ...SEL, ...warna(b.skor), textAlign: 'center', fontWeight: 700 }}>{b.labelSkor}</td>
      </tr>;
    })}
  </>;
}
