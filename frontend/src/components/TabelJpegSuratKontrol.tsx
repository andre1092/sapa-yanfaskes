import type React from 'react';
import { JENIS, angka, labelBulan, labelKabupaten, persen, tanggalSampai, totalTabel } from '../lib/suratKontrol';
import type { BarisTabel, PilihanJenis } from '../lib/suratKontrol';

// Tabel Unduh JPEG Monitoring Surat Kontrol: perintah CEO 2026-11-19 ("RI tanpa skor"),
// tata letak agents/kim/desain/monitoring-surkon/SPEK-jpeg-tabel.md (pola UnduhJpegKepatuhan).
const TEKS = '#111827';
const GARIS = '1px solid #1F2937';
const SEL: React.CSSProperties = { border: GARIS, padding: '6px 8px', whiteSpace: 'nowrap', verticalAlign: 'middle' };
const ANGKA: React.CSSProperties = { ...SEL, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const JUDUL: React.CSSProperties = { ...SEL, backgroundColor: '#00529C', color: '#FFFFFF', fontWeight: 700, textAlign: 'center', whiteSpace: 'normal' };
export const KUNING = '#FFEB9C';
const WARNA_SKOR = (skor: number): React.CSSProperties =>
  skor >= 100 ? { backgroundColor: '#C6EFCE', color: '#006100' } : skor <= 25 ? { backgroundColor: '#FFC7CE', color: '#9C0006' } : { backgroundColor: '#FFFFFF', color: TEKS };
const JENJANG: [number, string][] = [[100, '≥ 90%'], [75, '> 80% – < 90%'], [50, '60% – 80%'], [25, '> 50% – < 60%'], [0, '≤ 50%']];

type Props = { baris: BarisTabel[]; bulan: string; jenis: PilihanJenis; sampai: string; namaRs: string; kodeTerpilih: string; petugas: boolean };

export function TabelJpegSuratKontrol({ baris, bulan, jenis, sampai, namaRs, kodeTerpilih, petugas }: Props) {
  const skor = jenis === 'RJ';
  const labelTidak = jenis === 'RJ' ? '(= SEP)' : '(= SEP dan > SEP)';
  const total = totalTabel(baris, jenis);
  const diunduh = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
  return <div style={{ width: 'max-content', minWidth: 900, padding: 24, backgroundColor: '#FFFFFF', color: TEKS, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, lineHeight: 1.35 }}>
    <div style={{ fontSize: 18, fontWeight: 700 }}>Monitoring Surat Kontrol — Kesesuaian Tanggal Terbit Surat Kontrol per Faskes</div>
    <div style={{ marginTop: 4, color: '#374151' }}>
      {[labelBulan(bulan), JENIS[jenis], namaRs || 'Semua faskes', `data SEP sampai ${tanggalSampai(sampai)}`, 'sumber BI BPJS Kesehatan'].join(' · ')}
    </div>
    {petugas && <div style={{ marginTop: 2, color: '#374151' }}>Akun rumah sakit: hanya data faskes sendiri.</div>}
    <table style={{ borderCollapse: 'collapse', marginTop: 12 }}>
      <thead>
        <tr>
          <th style={JUDUL} rowSpan={2}>No</th><th style={{ ...JUDUL, minWidth: 240 }} rowSpan={2}>Nama faskes</th>
          <th style={JUDUL} rowSpan={2}>Kabupaten</th>
          <th style={JUDUL} colSpan={2}>SRK Sesuai<br />(&lt; SEP)</th><th style={JUDUL} colSpan={2}>SRK Tidak Sesuai<br />{labelTidak}</th>
          <th style={JUDUL} rowSpan={2}>Total SEP</th>
          {skor && <th style={{ ...JUDUL, minWidth: 120 }} rowSpan={2}>Capaian skor kepatuhan<br />(target ≥ 90%)</th>}
        </tr>
        <tr><th style={JUDUL}>Jumlah</th><th style={JUDUL}>%</th><th style={JUDUL}>Jumlah</th><th style={JUDUL}>%</th></tr>
      </thead>
      <tbody>
        {baris.map((b, i) => {
          const latar: React.CSSProperties = b.kuning ? { backgroundColor: KUNING } : {};
          const pilih = b.kode === kodeTerpilih && !petugas;
          const tanda = pilih ? '4px solid #00529C' : b.kuning ? '4px solid #a85200' : GARIS;
          return <tr key={b.kode} style={pilih ? { fontWeight: 700 } : undefined}>
            <td style={{ ...ANGKA, ...latar, borderLeft: tanda }}>{i + 1}</td>
            <td style={{ ...SEL, ...latar, whiteSpace: 'normal', maxWidth: 240 }}>{b.kuning ? '⚠ ' : ''}{b.nama}</td>
            <td style={{ ...SEL, ...latar }}>{labelKabupaten(b.kabupaten)}</td>
            <td style={{ ...ANGKA, ...latar }}>{angka(b.sesuai)}</td>
            <td style={{ ...ANGKA, ...latar }}>{persen(b.pctSesuai)}</td>
            <td style={{ ...ANGKA, ...latar, fontWeight: b.kuning ? 700 : undefined }}>{angka(b.tidak)}</td>
            <td style={{ ...ANGKA, ...latar }}>{persen(b.pctTidak)}</td>
            <td style={{ ...ANGKA, ...latar }}>{angka(b.total)}</td>
            {skor && b.capaian !== null && <td style={{ ...SEL, ...WARNA_SKOR(b.capaian), textAlign: 'center', fontWeight: 700 }}>{b.capaian}</td>}
          </tr>;
        })}
        {!petugas && baris.length > 1 && <tr style={{ fontWeight: 700, backgroundColor: '#F3F4F6' }}>
          <td style={SEL} colSpan={3}>Total cabang</td>
          <td style={ANGKA}>{angka(total.sesuai)}</td><td style={ANGKA}>{persen(total.pctSesuai)}</td>
          <td style={ANGKA}>{angka(total.tidak)}</td><td style={ANGKA}>{persen(total.pctTidak)}</td>
          <td style={ANGKA}>{angka(total.total)}</td>
          {skor && total.capaian !== null && <td style={{ ...SEL, ...WARNA_SKOR(total.capaian), textAlign: 'center' }}>{total.capaian}</td>}
        </tr>}
      </tbody>
    </table>
    <div style={{ marginTop: 12, fontWeight: 700 }}>Keterangan:</div>
    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 14, border: GARIS, backgroundColor: KUNING, fontSize: 10 }}>⚠</span>
      <span>Ada SRK tidak sesuai (tanggal terbit surat kontrol sama dengan tanggal SEP{jenis === 'RJ' ? '' : ', atau setelah tanggal SEP'}).</span>
    </div>
    {skor
      ? <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span>Capaian skor kepatuhan, target ≥ 90%:</span>
        {JENJANG.map(([n, rentang]) => <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ ...WARNA_SKOR(n), border: GARIS, padding: '0 6px', fontWeight: 700 }}>{n}</span>{`% sesuai ${rentang}`}</span>)}
      </div>
      : <div style={{ marginTop: 6 }}>Capaian skor kepatuhan hanya dihitung untuk Rawat Jalan.</div>}
    <div style={{ marginTop: 10, fontSize: 11, color: '#374151' }}>Diunduh dari SAPA Yanfaskes, {diunduh} WIB.</div>
  </div>;
}
