import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./kessan.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const k = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

// Data tiruan: kode dan nama faskes samaran. Angkanya disusun supaya agregatnya sama dengan angka acuan
// November 2026 di SPEK (25 faskes, 16.191 dari target 7.782, rata-rata skor 97, 2 faskes belum skor 100).
const NOV = [
  ['Bondowoso', 1622, 357, 100], ['Lumajang', 1598, 357, 100], ['Jember', 1202, 278, 100], ['Lumajang', 1184, 357, 100],
  ['Jember', 1085, 370, 100], ['Jember', 915, 278, 100], ['Jember', 842, 278, 100], ['Jember', 757, 357, 100],
  ['Jember', 745, 370, 100], ['Lumajang', 629, 357, 100], ['Bondowoso', 589, 357, 100], ['Jember', 525, 357, 100],
  ['Jember', 519, 370, 100], ['Bondowoso', 492, 370, 100], ['Jember', 479, 357, 100], ['Lumajang', 455, 278, 100],
  ['Lumajang', 422, 278, 100], ['Jember', 402, 357, 100], ['Jember', 357, 357, 100], ['Jember', 334, 217, 100],
  ['Lumajang', 323, 278, 100], ['Lumajang', 312, 357, 75], ['Jember', 171, 132, 100], ['Jember', 146, 278, 50],
  ['Lumajang', 86, 80, 100],
].map(([kabupaten, jumlah_kessan, target, skor], i) => {
  const no = String(i + 1).padStart(2, '0');
  return { kode_ppk: `9999R0${no}`, nama_faskes: `RS CONTOH ${no}`, kabupaten, bulan: '2026-11', jumlah_kessan, target,
    persen: Math.round((jumlah_kessan / target) * 10000) / 100, skor };
});
const OKT = NOV.map(b => ({ ...b, bulan: '2026-10', jumlah_kessan: b.jumlah_kessan + 10 }));

test('angka, persen, dan skor berformat Indonesia', () => {
  assert.equal(k.angka(16191), '16.191');
  assert.equal(k.angka(0), '0');
  assert.equal(k.persen(208.0634), '208,06');
  assert.equal(k.persen(591.37), '591,37');
  assert.equal(k.persen(50), '50,00');
  assert.equal(k.skorRata(96.94), '96,9');
  assert.equal(k.skorRata(97), '97');
});

test('nama bulan Indonesia dari kunci YYYY-MM', () => {
  assert.equal(k.labelBulan('2026-11'), 'November 2026');
  assert.equal(k.labelBulan('2026-01'), 'Januari 2026');
  assert.equal(k.labelBulan(''), '');
  assert.equal(k.labelBulan('ngawur'), 'ngawur');
  assert.equal(k.bulanPendek('2026-08'), 'Agu');
  assert.equal(k.bulanPendek('2026-05'), 'Mei');
  assert.equal(k.rentangBulan(['2026-01', '2026-02', '2026-11']), 'Januari–November 2026');
  assert.equal(k.rentangBulan(['2025-12', '2026-01']), 'Desember 2025–Januari 2026');
  assert.equal(k.rentangBulan(['2026-03']), 'Maret 2026');
  assert.equal(k.rentangBulan([]), '');
});

test('ringkasan kartu sesuai angka acuan November 2026', () => {
  const r = k.ringkas(NOV);
  assert.equal(r.jumlahFaskes, 25);
  assert.equal(r.kunjungan, 16191);
  assert.equal(r.target, 7782);
  assert.equal(k.persen(r.persen), '208,06');
  assert.equal(k.skorRata(r.rataSkor), '97');
  assert.equal(r.belum100, 2);
});

test('ringkasan: persen hanya dari faskes bertarget, tanpa baris jadi kosong', () => {
  const r = k.ringkas([
    { ...NOV[0], jumlah_kessan: 100, target: 200, skor: 50 },
    { ...NOV[1], jumlah_kessan: 999, target: null, persen: null, skor: 100 },
  ]);
  assert.equal(r.kunjungan, 1099);
  assert.equal(r.target, 200);
  assert.equal(r.persen, 50);
  // Keputusan CEO: faskes tanpa target (target belum ada) tidak ikut rata-rata skor.
  assert.equal(r.rataSkor, 50);
  assert.equal(r.belum100, 1);
  const kosong = k.ringkas([]);
  assert.equal(kosong.jumlahFaskes, 0);
  assert.equal(kosong.persen, null);
  assert.equal(kosong.rataSkor, null);
  assert.equal(k.ringkas([{ ...NOV[0], target: null, persen: null }]).persen, null);
  assert.equal(k.ringkas([{ ...NOV[0], target: null, persen: null, skor: 100 }]).rataSkor, null);
});

test('kartu skor Petugas RS: skor RS itu sendiri, bukan rata-rata', () => {
  // RS tanpa target: skor 100 dari aturan, nilai tetap tampil, subteks "Target belum ada".
  assert.deepEqual(k.kartuSkorPetugas([{ ...NOV[0], target: null, persen: null, jumlah_kessan: 0, skor: 100 }]),
    { nilai: '100', sub: 'Target belum ada' });
  assert.deepEqual(k.kartuSkorPetugas([{ ...NOV[0], target: 0, persen: null, skor: 100 }]),
    { nilai: '100', sub: 'Target belum ada' });
  assert.deepEqual(k.kartuSkorPetugas([{ ...NOV[0], skor: 75 }]), { nilai: '75', sub: 'Belum skor 100' });
  assert.deepEqual(k.kartuSkorPetugas([{ ...NOV[0], skor: 100 }]), { nilai: '100', sub: 'Target tercapai' });
  assert.deepEqual(k.kartuSkorPetugas([]), { nilai: '–', sub: '\u00a0' });
});

test('agregasi per kabupaten: urutan tetap dan angka acuan', () => {
  const p = k.perKabupaten(NOV, ['Jember', 'Lumajang', 'Bondowoso']);
  assert.deepEqual(p.map(x => [x.kabupaten, x.jumlahFaskes, x.kunjungan]), [
    ['Jember', 14, 8479], ['Lumajang', 8, 5009], ['Bondowoso', 3, 2703],
  ]);
  assert.equal(k.persen(p[0].persen), '194,65');
  assert.equal(k.persen(p[2].persen), '249,35');
  // Kabupaten tanpa faskes tetap muncul dengan nol, supaya urutan dan warna tidak bergeser.
  const q = k.perKabupaten(NOV.filter(b => b.kabupaten !== 'Lumajang'), ['Jember', 'Lumajang', 'Bondowoso']);
  assert.deepEqual(q[1], { kabupaten: 'Lumajang', jumlahFaskes: 0, kunjungan: 0, target: 0, persen: null });
});

test('saring baris menurut periode dan kabupaten', () => {
  const semua = [...OKT, ...NOV];
  assert.equal(k.saring(semua, '2026-11', '').length, 25);
  assert.equal(k.saring(semua, '2026-11', 'Bondowoso').length, 3);
  assert.equal(k.saring(semua, '2026-12', '').length, 0);
});

test('seri tren per kabupaten dan satu garis untuk akun rumah sakit', () => {
  const semua = [...OKT, ...NOV];
  const s = k.seriKabupaten(semua, ['2026-10', '2026-11'], ['Jember', 'Lumajang', 'Bondowoso']);
  assert.deepEqual(s.map(x => x.nama), ['Jember', 'Lumajang', 'Bondowoso']);
  assert.deepEqual(s[0].nilai, [8479 + 140, 8479]);
  assert.deepEqual(s[2].nilai, [2703 + 30, 2703]);
  const rs = k.seriFaskes(semua.filter(b => b.kode_ppk === '9999R001'), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(rs, [0, 1632, 1622]);
});

test('urutan tabel: bawaan capaian menurun dengan nama sebagai pemecah seri', () => {
  const baris = [
    { ...NOV[0], nama_faskes: 'RS B', jumlah_kessan: 10 },
    { ...NOV[1], nama_faskes: 'RS A', jumlah_kessan: 10 },
    { ...NOV[2], nama_faskes: 'RS C', jumlah_kessan: 30 },
  ];
  assert.deepEqual(k.urutkan(baris, k.URUT_BAWAAN).map(b => b.nama_faskes), ['RS C', 'RS A', 'RS B']);
  assert.deepEqual(k.urutkan(baris, { kolom: 'nama', arah: 'asc' }).map(b => b.nama_faskes), ['RS A', 'RS B', 'RS C']);
  assert.deepEqual(k.URUT_BAWAAN, { kolom: 'kunjungan', arah: 'desc' });
});

test('urutan tabel: nilai "–" (target atau persen kosong) selalu di bawah', () => {
  const baris = [
    { ...NOV[0], nama_faskes: 'RS TANPA', target: null, persen: null },
    { ...NOV[1], nama_faskes: 'RS RENDAH', target: 100, persen: 10 },
    { ...NOV[2], nama_faskes: 'RS TINGGI', target: 100, persen: 300 },
  ];
  for (const arah of ['asc', 'desc']) {
    assert.equal(k.urutkan(baris, { kolom: 'persen', arah }).at(-1).nama_faskes, 'RS TANPA');
    assert.equal(k.urutkan(baris, { kolom: 'target', arah }).at(-1).nama_faskes, 'RS TANPA');
  }
  assert.deepEqual(k.urutkan(baris, { kolom: 'persen', arah: 'asc' }).map(b => b.nama_faskes), ['RS RENDAH', 'RS TINGGI', 'RS TANPA']);
  // Target 0 sama dengan kosong.
  const nol = [{ ...baris[0], target: 0 }, baris[1]];
  assert.equal(k.urutkan(nol, { kolom: 'target', arah: 'asc' }).at(-1).nama_faskes, 'RS TANPA');
});

test('klik kepala kolom: teks mulai naik, angka mulai turun, klik ulang membalik', () => {
  assert.deepEqual(k.urutBerikut(k.URUT_BAWAAN, 'nama'), { kolom: 'nama', arah: 'asc' });
  assert.deepEqual(k.urutBerikut(k.URUT_BAWAAN, 'kabupaten'), { kolom: 'kabupaten', arah: 'asc' });
  assert.deepEqual(k.urutBerikut(k.URUT_BAWAAN, 'persen'), { kolom: 'persen', arah: 'desc' });
  assert.deepEqual(k.urutBerikut(k.URUT_BAWAAN, 'kunjungan'), { kolom: 'kunjungan', arah: 'asc' });
  assert.deepEqual(k.urutBerikut({ kolom: 'nama', arah: 'asc' }, 'nama'), { kolom: 'nama', arah: 'desc' });
});

test('teks status filter', () => {
  assert.equal(k.teksStatusFilter({ jumlah: 25, bulan: '2026-11', kabupaten: '', sementara: true }),
    'Menampilkan 25 faskes, November 2026, data sementara.');
  assert.equal(k.teksStatusFilter({ jumlah: 3, bulan: '2026-10', kabupaten: 'Bondowoso', sementara: false }),
    'Menampilkan 3 faskes, Oktober 2026, Kabupaten Bondowoso.');
  assert.equal(k.teksStatusFilter({ jumlah: 14, bulan: '2026-11', kabupaten: 'Jember', sementara: true }),
    'Menampilkan 14 faskes, November 2026, Kabupaten Jember, data sementara.');
});

test('kelas chip skor', () => {
  assert.equal(k.kelasSkor(100), 'ok');
  assert.equal(k.kelasSkor(75), 'mid');
  assert.equal(k.kelasSkor(50), 'mid');
  assert.equal(k.kelasSkor(25), 'bad');
  assert.equal(k.kelasSkor(0), 'bad');
});

test('filter dari dan ke alamat: nilai tidak dikenal kembali ke bawaan', () => {
  const tersedia = ['2026-10', '2026-11'];
  const kab = ['Jember', 'Lumajang', 'Bondowoso'];
  assert.deepEqual(k.bacaFilter('?periode=2026-10&kab=Lumajang', tersedia, kab), { periode: '2026-10', kabupaten: 'Lumajang' });
  assert.deepEqual(k.bacaFilter('', tersedia, kab), { periode: '2026-11', kabupaten: '' });
  assert.deepEqual(k.bacaFilter('?periode=2025-01&kab=Surabaya', tersedia, kab), { periode: '2026-11', kabupaten: '' });
  assert.deepEqual(k.bacaFilter('?periode=2026-10', [], kab), { periode: '', kabupaten: '' });
  assert.equal(k.tulisFilter('?x=1', { periode: '2026-10', kabupaten: 'Jember' }, '2026-11'), '?x=1&periode=2026-10&kab=Jember');
  assert.equal(k.tulisFilter('?periode=2026-10&kab=Jember', { periode: '2026-11', kabupaten: '' }, '2026-11'), '');
});

test('skala sumbu y: langkah rapi dan puncak bulat', () => {
  assert.deepEqual(k.skalaSumbu(8619), { langkah: 2500, puncak: 10000 });
  assert.deepEqual(k.skalaSumbu(0), { langkah: 1, puncak: 1 });
  assert.deepEqual(k.skalaSumbu(1622), { langkah: 500, puncak: 2000 });
});

test('label ujung garis dijaga minimal 16 px dan tidak melewati dasar plot', () => {
  assert.deepEqual(k.aturLabel([100, 105, 200], 16, 300), [100, 116, 200]);
  assert.deepEqual(k.aturLabel([290, 295, 298], 16, 300), [268, 284, 300]);
});

test('label bulan berselang saat rapat, bulan terpilih selalu tampil dan tetangganya disembunyikan', () => {
  const tampil = Array.from({ length: 11 }, (_, i) => k.tampilLabelBulan(i, 20, 5)).map(Boolean);
  assert.deepEqual(tampil, [true, false, true, false, false, true, false, false, true, false, true]);
  // n = 12, Desember terpilih: November tidak tampil supaya tidak bertabrakan.
  assert.equal(k.tampilLabelBulan(10, 15, 11), false);
  assert.equal(k.tampilLabelBulan(11, 15, 11), true);
  assert.ok(Array.from({ length: 11 }, (_, i) => k.tampilLabelBulan(i, 30, 5)).every(Boolean));
});
