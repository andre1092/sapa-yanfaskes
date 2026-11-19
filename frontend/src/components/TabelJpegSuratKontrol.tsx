import type React from 'react';
import { JENIS, angka, labelBulan, persen, tanggalSampai } from '../lib/suratKontrol';
import type { BarisTabel, PilihanJenis } from '../lib/suratKontrol';

// Tabel Unduh JPEG Monitoring Surat Kontrol (perintah CEO 2026-11-19, keputusan "RI tanpa skor").
// Pola gaya mengikuti UnduhJpegKepatuhan: latar putih, garis gelap, judul kolom biru BPJS.
const GARIS = '1px solid #1F2937';
const SEL: React.CSSProperties = { border: GARIS, padding: '6px 8px', whiteSpace: 'nowrap' };
const ANGKA: React.CSSProperties = { ...SEL, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const JUDUL: React.CSSProperties = { ...SEL, backgroundColor: '#00529C', color: '#FFFFFF', fontWeight: 700, textAlign: 'center', whiteSpace: 'normal' };
export const KUNING = '#FFF3B0';

type Props = { baris: BarisTabel[]; bulan: string; jenis: PilihanJenis; sampai: string; namaRs: string };

export function TabelJpegSuratKontrol({ baris, bulan, jenis, sampai, namaRs }: Props) {
  const skor = jenis === 'RJ';
  const labelTidak = jenis === 'RJ' ? '(= SEP)' : '(= SEP dan > SEP)';
  return <div style={{ width: 'max-content', minWidth: 960, padding: 24, backgroundColor: '#FFFFFF', color: '#111827', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, lineHeight: 1.35 }}>
    <div style={{ fontSize: 16, fontWeight: 700 }}>Monitoring Penerbitan Surat Kontrol</div>
    <div style={{ marginTop: 4 }}>{[labelBulan(bulan), JENIS[jenis], namaRs || 'Semua faskes', `data SEP sampai ${tanggalSampai(sampai)}`].join(' · ')}</div>
    <div style={{ marginTop: 2, color: '#4B5563' }}>Sumber: BI BPJS Kesehatan (Crosstab Monitoring Penerbitan Surat Kontrol)</div>
    <table style={{ borderCollapse: 'collapse', marginTop: 12 }}>
      <thead><tr>
        <th style={JUDUL}>No</th><th style={JUDUL}>Nama Faskes</th><th style={JUDUL}>Kabupaten</th>
        <th style={JUDUL}>Jumlah SRK Sesuai<br />(&lt; SEP)</th><th style={JUDUL}>% SRK Sesuai</th>
        <th style={JUDUL}>Jumlah SRK Tidak Sesuai<br />{labelTidak}</th><th style={JUDUL}>% SRK Tidak Sesuai</th>
        <th style={JUDUL}>Total SEP</th>
        {skor && <th style={JUDUL}>Capaian Skor Kepatuhan<br />(Target ≥ 90%)</th>}
      </tr></thead>
      <tbody>{baris.map((b, i) => {
        const latar: React.CSSProperties = b.kuning ? { backgroundColor: KUNING } : {};
        return <tr key={b.kode}>
          <td style={{ ...ANGKA, ...latar }}>{i + 1}</td>
          <td style={{ ...SEL, ...latar }}>{b.nama}</td>
          <td style={{ ...SEL, ...latar }}>{b.kabupaten}</td>
          <td style={{ ...ANGKA, ...latar }}>{angka(b.sesuai)}</td>
          <td style={{ ...ANGKA, ...latar }}>{persen(b.pctSesuai)}</td>
          <td style={{ ...ANGKA, ...latar, fontWeight: b.kuning ? 700 : 400 }}>{angka(b.tidak)}</td>
          <td style={{ ...ANGKA, ...latar }}>{persen(b.pctTidak)}</td>
          <td style={{ ...ANGKA, ...latar }}>{angka(b.total)}</td>
          {skor && <td style={{ ...ANGKA, ...latar, fontWeight: 700 }}>{b.capaian}</td>}
        </tr>;
      })}</tbody>
    </table>
    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-block', width: 28, height: 14, border: GARIS, backgroundColor: KUNING }} />
      <span>Kuning: ada SRK tidak sesuai (surat kontrol terbit pada atau setelah tanggal SEP).</span>
    </div>
    {skor
      ? <div style={{ marginTop: 6 }}>Capaian Skor Kepatuhan dari % SRK Sesuai: ≥ 90% = 100; &gt; 80% = 75; ≥ 60% = 50; &gt; 50% = 25; ≤ 50% = 0.</div>
      : <div style={{ marginTop: 6 }}>Capaian Skor Kepatuhan hanya dihitung untuk Rawat Jalan.</div>}
  </div>;
}
