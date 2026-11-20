// Logika murni menu Monitoring Kessan FKRTL (SPEK Kim agents/kim/desain/monitoring-kessan/SPEK.md).
// Kontrak data: GET /api/v1/kessan/data. Penyaringan peran Petugas RS dilakukan server.

export type BarisKessan = {
  kode_ppk: string;
  nama_faskes: string;
  kabupaten: string;
  bulan: string; // "2026-11"
  jumlah_kessan: number;
  target: number | null;
  persen: number | null;
  skor: number;
};

export type ResponsKessan = {
  status: string;
  last_update_bi: string | null;
  last_update_tanggal: string | null;
  bulan_tersedia: string[];
  bulan_sementara: string[];
  kabupaten: string[];
  rs: { kode: string; nama: string } | null;
  terkunci: boolean;
  baris: BarisKessan[];
};

export const KABUPATEN_URUT = ['Jember', 'Lumajang', 'Bondowoso'];

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const fAngka = new Intl.NumberFormat('id-ID');
const fPersen = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fSkor = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

export const angka = (n: number) => fAngka.format(n);
/** Dua desimal berkoma, tanpa tanda persen: 208,06. */
export const persen = (n: number | null) => (n == null ? '–' : fPersen.format(n));
/** Rata-rata skor, paling banyak satu desimal: 96,9. */
export const skorRata = (n: number | null) => (n == null ? '–' : fSkor.format(n));

const pecahBulan = (b: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(b || '');
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? { tahun: m[1], indeks: Number(m[2]) - 1 } : null;
};

/** "2026-11" menjadi "November 2026". */
export function labelBulan(b: string): string {
  const p = pecahBulan(b);
  return p ? `${BULAN_ID[p.indeks]} ${p.tahun}` : b || '';
}

/** "2026-08" menjadi "Agu" untuk sumbu grafik. */
export function bulanPendek(b: string): string {
  const p = pecahBulan(b);
  return p ? BULAN_PENDEK[p.indeks] : b;
}

/** Rentang bulan untuk subjudul tren: "Januari–November 2026". */
export function rentangBulan(daftar: string[]): string {
  if (!daftar.length) return '';
  const awal = pecahBulan(daftar[0]), akhir = pecahBulan(daftar[daftar.length - 1]);
  if (daftar.length === 1 || !awal || !akhir) return labelBulan(daftar[daftar.length - 1]);
  return awal.tahun === akhir.tahun
    ? `${BULAN_ID[awal.indeks]}–${labelBulan(daftar[daftar.length - 1])}`
    : `${labelBulan(daftar[0])}–${labelBulan(daftar[daftar.length - 1])}`;
}

const bertarget = (b: BarisKessan) => b.target != null && b.target > 0;
const jumlah = (daftar: BarisKessan[], f: (b: BarisKessan) => number) => daftar.reduce((s, b) => s + f(b), 0);

export type Ringkasan = {
  jumlahFaskes: number;
  kunjungan: number;
  target: number;
  /** Σ kunjungan faskes bertarget ÷ Σ target × 100; null bila tidak ada target. */
  persen: number | null;
  /** Rata-rata skor faskes bertarget saja; null bila tidak ada yang bertarget. */
  rataSkor: number | null;
  belum100: number;
};

export function ringkas(baris: BarisKessan[]): Ringkasan {
  const t = baris.filter(bertarget);
  const target = jumlah(t, b => b.target as number);
  return {
    jumlahFaskes: baris.length,
    kunjungan: jumlah(baris, b => b.jumlah_kessan),
    target,
    persen: target > 0 ? (jumlah(t, b => b.jumlah_kessan) / target) * 100 : null,
    // Keputusan CEO 20 Nov: faskes tanpa target ("target belum ada") tidak ikut rata-rata skor.
    rataSkor: t.length ? jumlah(t, b => b.skor) / t.length : null,
    belum100: baris.filter(b => b.skor < 100).length,
  };
}

export type PerKabupaten = { kabupaten: string; jumlahFaskes: number; kunjungan: number; target: number; persen: number | null };

/** Agregat per kabupaten dalam urutan tetap; kabupaten tanpa faskes tetap muncul dengan nol. */
export function perKabupaten(baris: BarisKessan[], kabupaten: string[]): PerKabupaten[] {
  return kabupaten.map(kab => {
    const r = ringkas(baris.filter(b => b.kabupaten === kab));
    return { kabupaten: kab, jumlahFaskes: r.jumlahFaskes, kunjungan: r.kunjungan, target: r.target, persen: r.persen };
  });
}

export function saring(baris: BarisKessan[], bulan: string, kabupaten: string): BarisKessan[] {
  return baris.filter(b => b.bulan === bulan && (!kabupaten || b.kabupaten === kabupaten));
}

export type Seri = { nama: string; nilai: number[] };

export function seriKabupaten(baris: BarisKessan[], bulan: string[], kabupaten: string[]): Seri[] {
  return kabupaten.map(kab => ({
    nama: kab,
    nilai: bulan.map(m => jumlah(baris.filter(b => b.bulan === m && b.kabupaten === kab), b => b.jumlah_kessan)),
  }));
}

/** Satu garis untuk akun rumah sakit: jumlah kunjungan per bulan. */
export function seriFaskes(baris: BarisKessan[], bulan: string[]): number[] {
  return bulan.map(m => jumlah(baris.filter(b => b.bulan === m), b => b.jumlah_kessan));
}

export type KolomUrut = 'nama' | 'kabupaten' | 'target' | 'kunjungan' | 'persen' | 'skor';
export type Urutan = { kolom: KolomUrut; arah: 'asc' | 'desc' };
export const URUT_BAWAAN: Urutan = { kolom: 'kunjungan', arah: 'desc' };

const KOLOM_TEKS: KolomUrut[] = ['nama', 'kabupaten'];

function nilaiKolom(b: BarisKessan, k: KolomUrut): string | number | null {
  switch (k) {
    case 'nama': return b.nama_faskes;
    case 'kabupaten': return b.kabupaten;
    case 'target': return bertarget(b) ? (b.target as number) : null;
    case 'kunjungan': return b.jumlah_kessan;
    case 'persen': return bertarget(b) ? b.persen : null;
    case 'skor': return b.skor;
  }
}

/** Urutkan baris tabel; nilai "–" selalu di bawah, nama A–Z sebagai pemecah seri. */
export function urutkan(baris: BarisKessan[], u: Urutan): BarisKessan[] {
  const arah = u.arah === 'asc' ? 1 : -1;
  return baris.slice().sort((a, b) => {
    const va = nilaiKolom(a, u.kolom), vb = nilaiKolom(b, u.kolom);
    if (va == null && vb != null) return 1;
    if (vb == null && va != null) return -1;
    let c = 0;
    if (va != null && vb != null) c = typeof va === 'string' ? va.localeCompare(String(vb), 'id') : va - (vb as number);
    return c ? c * arah : a.nama_faskes.localeCompare(b.nama_faskes, 'id');
  });
}

/** Klik pertama kolom teks mengurutkan naik, kolom angka turun; klik ulang membalik arah. */
export function urutBerikut(sekarang: Urutan, kolom: KolomUrut): Urutan {
  if (sekarang.kolom === kolom) return { kolom, arah: sekarang.arah === 'asc' ? 'desc' : 'asc' };
  return { kolom, arah: KOLOM_TEKS.includes(kolom) ? 'asc' : 'desc' };
}

export function teksStatusFilter({ jumlah: n, bulan, kabupaten, sementara }: { jumlah: number; bulan: string; kabupaten: string; sementara: boolean }): string {
  return `Menampilkan ${angka(n)} faskes, ${labelBulan(bulan)}${kabupaten ? `, Kabupaten ${kabupaten}` : ''}${sementara ? ', data sementara' : ''}.`;
}

/** Chip skor: 100 hijau, 75 dan 50 netral, 25 dan 0 merah. */
export function kelasSkor(skor: number): 'ok' | 'mid' | 'bad' {
  return skor >= 100 ? 'ok' : skor >= 50 ? 'mid' : 'bad';
}

export type FilterKessan = { periode: string; kabupaten: string };

/** Baca filter dari query alamat; nilai yang tidak tersedia kembali ke bawaan (bulan terbaru, semua kabupaten). */
export function bacaFilter(search: string, bulanTersedia: string[], kabupaten: string[]): FilterKessan {
  const q = new URLSearchParams(search);
  const terbaru = bulanTersedia[bulanTersedia.length - 1] || '';
  const periode = q.get('periode') || '';
  const kab = q.get('kab') || '';
  return {
    periode: bulanTersedia.includes(periode) ? periode : terbaru,
    kabupaten: kabupaten.includes(kab) ? kab : '',
  };
}

/** Tulis filter ke query alamat; nilai bawaan tidak ditulis supaya alamat tetap pendek. */
export function tulisFilter(search: string, f: FilterKessan, periodeBawaan: string): string {
  const q = new URLSearchParams(search);
  q.delete('periode');
  q.delete('kab');
  if (f.periode && f.periode !== periodeBawaan) q.set('periode', f.periode);
  if (f.kabupaten) q.set('kab', f.kabupaten);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Langkah garis bantu yang rapi (1, 2, 2,5, 5 × 10ⁿ) untuk 4 garis, minimal 1. */
export function skalaSumbu(maks: number): { langkah: number; puncak: number } {
  const v = Math.max(maks, 1) / 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const langkah = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p);
  return { langkah, puncak: Math.ceil(Math.max(maks, 1) / langkah) * langkah };
}

/** Posisi y label di ujung garis: jarak minimal `jarak` px dan tidak melewati `dasar`. Urutan masukan dipertahankan. */
export function aturLabel(ys: number[], jarak: number, dasar: number): number[] {
  const urut = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let j = 1; j < urut.length; j++) if (urut[j].y - urut[j - 1].y < jarak) urut[j].y = urut[j - 1].y + jarak;
  const lebih = urut.length ? urut[urut.length - 1].y - dasar : 0;
  if (lebih > 0) urut.forEach(l => { l.y -= lebih; });
  const hasil = new Array<number>(ys.length);
  urut.forEach(l => { hasil[l.i] = l.y; });
  return hasil;
}

/** Label bulan berselang bila jarak antarbulan < 26 px; bulan terpilih selalu tampil dan tetangga langsungnya disembunyikan. */
export function tampilLabelBulan(i: number, jarakPx: number, terpilih: number): boolean {
  if (jarakPx >= 26 || i === terpilih) return true;
  return i % 2 === 0 && Math.abs(i - terpilih) > 1;
}
