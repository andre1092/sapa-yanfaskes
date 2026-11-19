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
  lt: { label: 'Surkon < SEP', definisi: 'Tanggal terbit kontrol lebih kecil dari tanggal SEP' },
  eq: { label: 'Surkon = SEP', definisi: 'Tanggal terbit kontrol sama dengan tanggal SEP' },
  gt: { label: 'Surkon > SEP', definisi: 'Surat kontrol terbit setelah tanggal SEP' },
};
export const JENIS: Record<PilihanJenis, string> = { RJ: 'Rawat jalan', RI: 'Rawat inap', semua: 'Semua' };

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const SHEET_WAJIB = ['Faskes Surkon', 'Header Surkon', 'Poli', 'Tren'];
const RE_NAMA = /^(\d{4}-\d{2})_(RJ|RI)_(Faskes Surkon|Header Surkon|Keterangan|Poli|Tren)\.csv$/;
export const BATAS_BERKAS_KB = 200;
export const BATAS_JUMLAH_BERKAS = 10;

export const angka = (n: number) => n.toLocaleString('id-ID');
export const persen = (p: number) => `${(p * 100).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function labelBulan(bulan: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(bulan || '');
  return m ? `${BULAN_ID[Number(m[2]) - 1]} ${m[1]}` : bulan || '';
}

export function tanggalSampai(tanggal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal || '');
  return m ? `${Number(m[3])} ${BULAN_ID[Number(m[2]) - 1]} ${m[1]}` : '';
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

/** < dan = selalu tampil seperti BI; > hanya bila ada nilainya. */
export function statusTampil(j: Jumlah): Kunci[] {
  return j.gt > 0 ? ['lt', 'eq', 'gt'] : ['lt', 'eq'];
}

export function poliTeratas(poli: BarisPoli[], status: PilihanStatus, n = 10): BarisPoli[] {
  const disaring = poli.map(p => ({ nama: p.nama, ...saringStatus(p, status) })).filter(p => totalOf(p) > 0);
  const urut = disaring.map((p, i) => [p, i] as const).sort((a, b) => urutTotal(a[0], b[0]) || a[1] - b[1]).map(([p]) => p);
  if (urut.length <= n) return urut;
  const lain = urut.slice(n).reduce<Jumlah>((acc, p) => tambah(acc, p), nol());
  return [...urut.slice(0, n), { nama: 'Poli lain', ...lain }];
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
  const bagian = ['Monitoring_Surat_Kontrol', aman(labelBulan(bulan)), jenis === 'semua' ? 'Semua_Jenis' : aman(JENIS[jenis]), rs ? aman(rs) : ''];
  return bagian.filter(Boolean).join('_').replace('Rawat_jalan', 'Rawat_Jalan').replace('Rawat_inap', 'Rawat_Inap');
}

/** Bulan YYYY-MM dari awalan nama berkas bila semua berkas sepakat; selain itu null. */
export function bulanDariBerkas(nama: string[]): string | null {
  const bulan = new Set(nama.map(n => RE_NAMA.exec(n)?.[1] ?? '?'));
  const [satu] = [...bulan];
  return bulan.size === 1 && satu !== '?' ? satu : null;
}

/** Pemeriksaan cepat sebelum dikirim; server tetap memeriksa isi. null = siap dikirim. */
export function cekBerkasUnggah(berkas: { name: string; size: number }[], bulan: string): string | null {
  if (!berkas.length) return 'Pilih 10 berkas CSV Crosstab untuk satu bulan.';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan || '')) return 'Pilih bulan data terlebih dahulu.';
  if (berkas.length > BATAS_JUMLAH_BERKAS) return `Pilih paling banyak ${BATAS_JUMLAH_BERKAS} berkas untuk satu bulan.`;
  if (berkas.some(b => b.size > BATAS_BERKAS_KB * 1024)) return `Ada berkas lebih dari ${BATAS_BERKAS_KB} KB. Berkas Crosstab biasanya di bawah 5 KB.`;
  const kenal = new Set<string>();
  for (const b of berkas) {
    const m = RE_NAMA.exec(b.name);
    if (!m) return 'Nama berkas harus berpola YYYY-MM_RJ_<Sheet>.csv atau YYYY-MM_RI_<Sheet>.csv.';
    if (m[1] !== bulan) return `Ada berkas yang bukan untuk ${labelBulan(bulan)}. Periksa awalan tanggal di nama berkas.`;
    const k = `${m[2]} ${m[3]}`;
    if (kenal.has(k)) return `Berkas ${k} dipilih lebih dari sekali.`;
    kenal.add(k);
  }
  const hilang = ['RJ', 'RI'].flatMap(jj => SHEET_WAJIB.map(sh => `${jj} ${sh}`)).filter(k => !kenal.has(k));
  return hilang.length ? `Berkas ini belum ada: ${hilang.join(', ')}.` : null;
}
