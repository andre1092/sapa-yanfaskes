// Logika murni Unduh JPEG Monitoring Kessan FKRTL (agents/kim/desain/monitoring-kessan/SPEK-jpeg.md).
// Baris datang dari API apa adanya (27 FKRTL dibentuk server); modul ini hanya mengurutkan, mengelompokkan,
// dan menjumlahkan. Tidak ada baris yang ditambahkan di sini.
import { KABUPATEN_URUT, labelBulan, ringkas } from './kessan';
import type { BarisKessan } from './kessan';
import { aman } from './suratKontrol';

export type BarisJpeg = {
  kode: string;
  nama: string;
  /** Nama kabupaten, atau "-" bila kosong. */
  kabupaten: string;
  target: number | null;
  kunjungan: number;
  /** null bila target belum ada. */
  persen: number | null;
  skor: number;
  /** Target ada dan % < 100: latar kuning, ⚠, garis kiri, kunjungan tebal. */
  kuning: boolean;
  tanpaTarget: boolean;
  /** "100*" untuk target belum ada. */
  labelSkor: string;
};

export type RingkasJpeg = {
  label: string;
  jumlahFaskes: number;
  target: number;
  kunjungan: number;
  persen: number | null;
  rataSkor: number | null;
};

export type KelompokJpeg = { kabupaten: string; baris: BarisJpeg[] };

export type TabelJpeg = { kelompok: KelompokJpeg[]; total: RingkasJpeg | null; jumlahBaris: number; adaTanpaTarget: boolean };

export type WarnaSkor = { latar: string; teks: string };

const WARNA_SKOR: [number, WarnaSkor][] = [
  [100, { latar: '#C6EFCE', teks: '#006100' }],
  [75, { latar: '#E2EFDA', teks: '#375623' }],
  [50, { latar: '#FFD966', teks: '#5C4400' }],
  [25, { latar: '#F4B183', teks: '#6B2600' }],
  [0, { latar: '#FFC7CE', teks: '#9C0006' }],
];

/** Warna skor disetujui CEO 2026-11-20: 100 hijau, 75 hijau muda, 50 kuning, 25 jingga, 0 merah. */
export function warnaSkor(skor: number): WarnaSkor {
  return (WARNA_SKOR.find(([batas]) => skor >= batas) ?? WARNA_SKOR[WARNA_SKOR.length - 1])[1];
}

export const JENJANG_SKOR: [number, string][] = [[100, '≥ 100% target'], [75, '75% – < 100%'], [50, '50% – < 75%'], [25, '25% – < 50%'], [0, '< 25%']];

export const judulJpeg = (bulan: string) => `Monitoring Kessan FKRTL — ${labelBulan(bulan)}`;

export function lingkupJpeg({ kabupaten, petugas, namaRs }: { kabupaten: string; petugas: boolean; namaRs: string }): string {
  if (petugas) return namaRs;
  return kabupaten ? `Kabupaten ${kabupaten}` : 'Semua kabupaten';
}

export const keteranganJpeg = (lingkup: string) => `Capaian kunjungan Kessan per FKRTL terhadap target bulanan · ${lingkup}`;

/** Last Update BI apa adanya, cadangan "Last Update : –" sama dengan halaman. */
export const teksLastUpdate = (lastUpdate: string | null | undefined) => `${lastUpdate?.trim() || 'Last Update : –'} · sumber BI BPJS Kesehatan`;

export const teksSementara = (bulan: string) => `Data ${labelBulan(bulan)} diambil sebelum bulan selesai; angkanya masih bisa bertambah.`;

const fTanggal = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });
const fJam = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** "Diunduh dari SAPA Yanfaskes, 20 Nov 2026 19.05 WIB." */
export const teksDiunduh = (d: Date) => `Diunduh dari SAPA Yanfaskes, ${fTanggal.format(d)} ${fJam.format(d)} WIB.`;

export function barisJpeg(b: BarisKessan): BarisJpeg {
  const tanpaTarget = !(b.target != null && b.target > 0);
  const persen = tanpaTarget ? null : b.persen ?? (b.jumlah_kessan / (b.target as number)) * 100;
  return {
    kode: b.kode_ppk,
    nama: b.nama_faskes,
    kabupaten: b.kabupaten?.trim() || '-',
    target: tanpaTarget ? null : b.target,
    kunjungan: b.jumlah_kessan,
    persen,
    skor: b.skor,
    kuning: persen != null && persen < 100,
    tanpaTarget,
    labelSkor: tanpaTarget ? `${b.skor}*` : String(b.skor),
  };
}

/** Indeks kelompok: Jember, Lumajang, Bondowoso, lalu satu kelompok untuk kabupaten lain atau kosong. */
const indeksKab = (kab: string) => {
  const i = KABUPATEN_URUT.indexOf(kab?.trim());
  return i < 0 ? KABUPATEN_URUT.length : i;
};

/** Urutan tetap JPEG: kabupaten, lalu Jumlah Kunjungan menurun, lalu nama A–Z. Urutan klik di halaman tidak dipakai. */
export function urutJpeg(baris: BarisKessan[]): BarisKessan[] {
  return baris.slice().sort((a, b) => indeksKab(a.kabupaten) - indeksKab(b.kabupaten)
    || b.jumlah_kessan - a.jumlah_kessan || a.nama_faskes.localeCompare(b.nama_faskes, 'id'));
}

function ringkasJpeg(label: string, baris: BarisKessan[]): RingkasJpeg {
  const r = ringkas(baris);
  return { label: `${label} (${r.jumlahFaskes} faskes)`, jumlahFaskes: r.jumlahFaskes, target: r.target, kunjungan: r.kunjungan, persen: r.persen, rataSkor: r.rataSkor };
}

/**
 * Susun isi tabel JPEG dari baris halaman yang sudah disaring Periode dan Kabupaten.
 * Baris dikelompokkan dan diurut per kabupaten tanpa subtotal (keputusan CEO 20 Nov); Total tidak ada untuk Petugas RS.
 */
export function susunTabelJpeg(baris: BarisKessan[], { kabupaten, petugas }: { kabupaten: string; petugas: boolean }): TabelJpeg {
  const urut = urutJpeg(baris);
  const grup: BarisKessan[][] = [];
  if (petugas || kabupaten) {
    if (urut.length) grup.push(urut);
  } else {
    for (const b of urut) {
      const akhir = grup[grup.length - 1];
      if (akhir && indeksKab(akhir[0].kabupaten) === indeksKab(b.kabupaten)) akhir.push(b);
      else grup.push([b]);
    }
  }
  const kelompok = grup.map(g => {
    const lain = indeksKab(g[0].kabupaten) === KABUPATEN_URUT.length;
    return { kabupaten: lain ? '' : g[0].kabupaten.trim(), baris: g.map(barisJpeg) };
  });
  const total = !petugas && urut.length > 1 ? ringkasJpeg(kabupaten ? `Total Kabupaten ${kabupaten}` : 'Total cabang', urut) : null;
  return { kelompok, total, jumlahBaris: urut.length, adaTanpaTarget: kelompok.some(g => g.baris.some(b => b.tanpaTarget)) };
}

export function namaBerkasJpegKessan({ bulan, kabupaten, namaRs, sementara }: { bulan: string; kabupaten: string; namaRs: string; sementara: boolean }): string {
  return `${['Monitoring_Kessan_FKRTL', aman(labelBulan(bulan)), kabupaten ? aman(kabupaten) : '', namaRs ? aman(namaRs) : '', sementara ? 'sementara' : '']
    .filter(Boolean).join('_')}.jpg`;
}
