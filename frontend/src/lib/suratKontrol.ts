// Logika tampilan menu Monitoring Penerbitan Surat Kontrol (Crosstab BI agregat, keputusan CEO 2026-11-19).
// Server sudah memeriksa dan membatasi data per peran; berkas ini hanya menghitung filter dan teks.

export type Kunci = 'lt' | 'eq' | 'gt';
export type Jumlah = Record<Kunci, number>;
export type BarisFaskes = { kode: string; nama: string } & Jumlah;
export type BarisPoli = { nama: string } & Jumlah;
export type BarisTren = { hari: number } & Jumlah;
export type DataJenis = { total: Jumlah; faskes: BarisFaskes[]; poli: BarisPoli[]; tren: BarisTren[] };
export type DataBulan = { RJ: DataJenis; RI: DataJenis; sampai: string };
export type PilihanJenis = 'RJ' | 'RI' | 'semua';
export type PilihanStatus = Kunci | 'semua';

export const KUNCI: Kunci[] = ['lt', 'eq', 'gt'];
export const STATUS: Record<Kunci, { label: string; definisi: string }> = {
  lt: { label: 'Surkon < SEP', definisi: 'Tanggal terbit surat kontrol lebih awal dari tanggal SEP.' },
  eq: { label: 'Surkon = SEP', definisi: 'Tanggal terbit surat kontrol sama dengan tanggal SEP.' },
  gt: { label: 'Surkon > SEP', definisi: 'Surat kontrol terbit setelah tanggal SEP.' },
};
export const JENIS: Record<PilihanJenis, string> = { RJ: 'Rawat jalan', RI: 'Rawat inap', semua: 'Semua (RJ + RI)' };
export type Sheet = 'Header Surkon' | 'Faskes Surkon' | 'Tren' | 'Poli' | 'Keterangan';
export const SHEET: Sheet[] = ['Header Surkon', 'Faskes Surkon', 'Tren', 'Poli', 'Keterangan'];
const SHEET_WAJIB: Sheet[] = ['Header Surkon', 'Faskes Surkon', 'Tren', 'Poli'];

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const BATAS_BERKAS_KB = 200;

export const angka = (n: number) => n.toLocaleString('id-ID');
export const persen = (p: number) => `${(p * 100).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function labelBulan(bulan: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(bulan || '');
  return m ? `${BULAN_ID[Number(m[2]) - 1]} ${m[1]}` : bulan || '';
}

export function tanggalSampai(tanggal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal || '');
  return m ? `${Number(m[3])} ${BULAN_ID[Number(m[2]) - 1].slice(0, 3)} ${m[1]}` : '';
}

const nol = (): Jumlah => ({ lt: 0, eq: 0, gt: 0 });
const tambah = (a: Jumlah, b: Jumlah): Jumlah => ({ lt: a.lt + b.lt, eq: a.eq + b.eq, gt: a.gt + b.gt });
export const totalOf = (j: Jumlah) => j.lt + j.eq + j.gt;
const urutTotal = <T extends Jumlah>(a: T, b: T) => totalOf(b) - totalOf(a);

function gabung<T extends Jumlah>(a: T[], b: T[], kunci: (x: T) => string | number): T[] {
  const peta = new Map<string | number, T>();
  for (const x of [...a, ...b]) {
    const k = kunci(x);
    const ada = peta.get(k);
    peta.set(k, ada ? { ...ada, ...tambah(ada, x) } : { ...x });
  }
  return [...peta.values()];
}

/** Data satu jenis pelayanan; "semua" = Rawat Jalan + Rawat Inap. */
export function gabungJenis(data: DataBulan, jenis: PilihanJenis): DataJenis {
  if (jenis !== 'semua') return data[jenis];
  const { RJ, RI } = data;
  return {
    total: tambah(RJ.total, RI.total),
    faskes: gabung(RJ.faskes, RI.faskes, f => f.kode).sort(urutTotal),
    poli: gabung(RJ.poli, RI.poli, p => p.nama).sort(urutTotal),
    tren: gabung(RJ.tren, RI.tren, t => t.hari).sort((a, b) => a.hari - b.hari),
  };
}

/** Angka kartu status: semua RS dari total, satu RS dari barisnya; persen dari semua status. */
export function ringkasStatus(d: DataJenis, kodeRs: string) {
  const baris = kodeRs ? d.faskes.find(f => f.kode === kodeRs) : null;
  const jumlah: Jumlah = kodeRs ? (baris ? { lt: baris.lt, eq: baris.eq, gt: baris.gt } : nol()) : { ...d.total };
  const total = totalOf(jumlah);
  const bagi = (n: number) => (total ? n / total : 0);
  return { jumlah, total, persen: { lt: bagi(jumlah.lt), eq: bagi(jumlah.eq), gt: bagi(jumlah.gt) } };
}

export function saringStatus(j: Jumlah, status: PilihanStatus): Jumlah {
  if (status === 'semua') return { lt: j.lt, eq: j.eq, gt: j.gt };
  return { ...nol(), [status]: j[status] };
}

/** Ubin dan pilihan Status: RJ dua status, RI dan Semua tiga (BI menampilkan RI dalam 3 kolom). */
export function statusJenis(jenis: PilihanJenis): Kunci[] {
  return jenis === 'RJ' ? ['lt', 'eq'] : ['lt', 'eq', 'gt'];
}

/** Revisi v1.1 #1: Tren dan Poli mengikuti Status dan Jenis; label hanya bila faskes dipilih atau Petugas RS. */
export function labelTotalCabang(cakupanFaskes: boolean): string {
  return cakupanFaskes ? 'Total cabang (semua faskes)' : '';
}

/** Revisi v1.1 #4: bar faskes menurun menurut jumlah status yang tampil; faskes tanpa nilai dibuang. */
export function urutFaskes(faskes: BarisFaskes[], status: PilihanStatus): BarisFaskes[] {
  return faskes.map((f, i) => [{ ...f, ...saringStatus(f, status) }, i] as const).filter(([f]) => totalOf(f) > 0)
    .sort((a, b) => urutTotal(a[0], b[0]) || a[1] - b[1]).map(([f]) => f);
}

/** Revisi v1.1 #7: semua poli (tanpa "Poli lain"), menurun, mengikuti filter status. */
export function urutPoli(poli: BarisPoli[], status: PilihanStatus): BarisPoli[] {
  return poli.map((p, i) => [{ nama: p.nama, ...saringStatus(p, status) }, i] as const).filter(([p]) => totalOf(p) > 0)
    .sort((a, b) => urutTotal(a[0], b[0]) || a[1] - b[1]).map(([p]) => p);
}

/** Revisi v1.1 #5: "Data SEP sampai" sebelum hari terakhir bulan, jadi Surkon > SEP masih bisa bertambah. */
export function dataBelumLengkap(sampai: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sampai || '');
  if (!m) return false;
  return Number(m[3]) < new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
}

export type Kotak = { id: string; nilai: number; x: number; y: number; w: number; h: number };

/** Treemap squarified: kotak berurutan menurun, luas sebanding nilai, mengisi w × h. */
export function treemap(items: { id: string; nilai: number }[], w: number, h: number): Kotak[] {
  const isi = items.filter(i => i.nilai > 0).sort((a, b) => b.nilai - a.nilai);
  const jumlah = isi.reduce((s, i) => s + i.nilai, 0);
  if (!jumlah || w <= 0 || h <= 0) return [];
  const skala = (w * h) / jumlah;
  const hasil: Kotak[] = [];
  let x = 0, y = 0, lebar = w, tinggi = h;
  let baris: { id: string; nilai: number; luas: number }[] = [];
  const terburuk = (row: typeof baris, sisi: number) => {
    const s = row.reduce((a, r) => a + r.luas, 0);
    const maks = Math.max(...row.map(r => r.luas)), min = Math.min(...row.map(r => r.luas));
    return Math.max((sisi * sisi * maks) / (s * s), (s * s) / (sisi * sisi * min));
  };
  const letakkan = () => {
    const s = baris.reduce((a, r) => a + r.luas, 0);
    if (lebar >= tinggi) {
      const tebal = s / tinggi;
      let yy = y;
      for (const r of baris) { const hh = r.luas / tebal; hasil.push({ id: r.id, nilai: r.nilai, x, y: yy, w: tebal, h: hh }); yy += hh; }
      x += tebal; lebar -= tebal;
    } else {
      const tebal = s / lebar;
      let xx = x;
      for (const r of baris) { const ww = r.luas / tebal; hasil.push({ id: r.id, nilai: r.nilai, x: xx, y, w: ww, h: tebal }); xx += ww; }
      y += tebal; tinggi -= tebal;
    }
    baris = [];
  };
  for (const item of isi) {
    const calon = { ...item, luas: item.nilai * skala };
    const sisi = Math.min(lebar, tinggi);
    if (baris.length && terburuk([...baris, calon], sisi) > terburuk(baris, sisi)) letakkan();
    baris.push(calon);
  }
  if (baris.length) letakkan();
  return hasil;
}

const aman = (teks: string) => teks.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function namaBerkasJpeg(bulan: string, jenis: PilihanJenis, rs: string): string {
  return ['Monitoring_Surat_Kontrol', aman(labelBulan(bulan)), jenis === 'semua' ? 'Semua' : jenis, rs ? aman(rs) : '']
    .filter(Boolean).join('_');
}

/** Sama dengan kenali_sheet di server: nama sheet Crosstab dari baris judul, atau null. */
export function kenaliSheet(teks: string): Sheet | null {
  const baris = teks.replace(/^\ufeff/, '').split(/\r?\n/).filter(b => b.trim()).map(b => b.split('\t').map(c => c.trim()));
  if (baris.length < 2 || baris[0].length < 2) return null;
  const [kepala, ...isi] = baris;
  const sisa = kepala.slice(1);
  if (kepala[0] === 'Status' && sisa.every(c => /^\d+$/.test(c))) return 'Tren';
  if (kepala[0]) return null;
  if (sisa.every(c => c === 'Poli Tuju SEP')) return 'Poli';
  if (sisa.every(c => c === 'Status Surat Kontrol')) return 'Keterangan';
  if (sisa.every(c => c === 'Status')) return isi.slice(1).some(r => r[0] === 'Jumlah SEP') ? 'Header Surkon' : 'Faskes Surkon';
  return null;
}

export type KeadaanSheet = 'ada' | 'belum' | 'ganda';

/** Daftar periksa satu area unggah (5 sheet); server tetap memeriksa ulang. */
export function periksaArea(sheet: (Sheet | null)[]) {
  const hitung = new Map<Sheet, number>();
  for (const s of sheet) if (s) hitung.set(s, (hitung.get(s) ?? 0) + 1);
  const keadaan = Object.fromEntries(SHEET.map(s => [s, (hitung.get(s) ?? 0) === 0 ? 'belum' : hitung.get(s) === 1 ? 'ada' : 'ganda'])) as Record<Sheet, KeadaanSheet>;
  const asing = sheet.filter(s => !s).length;
  // Berkas tidak dikenali (mis. Data Detail berisi Nomor SEP) tidak menghalangi, tetapi tidak dikirim (v1.1 #17).
  const lengkap = SHEET_WAJIB.every(s => keadaan[s] === 'ada') && keadaan.Keterangan !== 'ganda';
  return { sheet: keadaan, asing, lengkap };
}

/** Hanya berkas yang dikenali sebagai sheet Surat Kontrol yang dikirim ke server (v1.1 #17). */
export function berkasDikirim<T extends { sheet: Sheet | null }>(daftar: T[]): T[] {
  return daftar.filter(b => b.sheet !== null);
}

/** Bulan yang boleh diunggah: Nov 2026 (awal riwayat) sampai bulan berjalan, terbaru di atas. */
export function bulanUnggah(sekarang: Date): string[] {
  const hasil: string[] = [];
  for (let t = sekarang.getFullYear(), b = sekarang.getMonth() + 1; t > 2026 || (t === 2026 && b >= 11); b === 1 ? (t--, b = 12) : b--) {
    hasil.push(`${t}-${String(b).padStart(2, '0')}`);
  }
  return hasil;
}

// --- Tabel Unduh JPEG (perintah CEO 2026-11-19, keputusan "RI tanpa skor") ---

/**
 * Capaian Skor Kepatuhan Surkon (0/25/50/75/100) dari persen SRK sesuai (rasio 0–1).
 * Jenjang dibaca dari data Capaian sheet Kris 07_surkon_terbit (1.459 baris, Jan–Okt 2026); batas 60% dan 90%
 * (tidak terlihat di data) dikonfirmasi CEO 2026-11-19 ("Setuju semua usulan").
 */
export function skorKepatuhan(rasio: number): number {
  const p = rasio * 100;
  if (p >= 90) return 100;
  if (p > 80) return 75;
  if (p >= 60) return 50;
  if (p > 50) return 25;
  return 0;
}

export type BarisTabel = {
  kode: string; nama: string; kabupaten: string; sesuai: number; tidak: number; total: number;
  pctSesuai: number; pctTidak: number; capaian: number | null; kuning: boolean;
};

/** Sesuai = < SEP; Tidak sesuai = (= SEP) + (> SEP); skor hanya untuk Rawat Jalan; urut persen sesuai menurun. */
export function barisTabel(d: DataJenis, kabupaten: Record<string, string>, jenis: PilihanJenis): BarisTabel[] {
  return d.faskes.map(f => {
    const total = totalOf(f);
    const tidak = f.eq + f.gt;
    return {
      kode: f.kode, nama: f.nama, kabupaten: kabupaten[f.kode] || '-', sesuai: f.lt, tidak, total,
      pctSesuai: total ? f.lt / total : 0, pctTidak: total ? tidak / total : 0,
      capaian: jenis === 'RJ' && total ? skorKepatuhan(f.lt / total) : null, kuning: tidak > 0,
    };
  }).filter(b => b.total > 0).sort((a, b) => b.pctSesuai - a.pctSesuai || b.total - a.total);
}
