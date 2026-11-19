import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./suratKontrol.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const s = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

// Nama RS dan poli samaran.
const j = (lt, eq, gt = 0) => ({ lt, eq, gt });
const DATA = {
  sampai: '2026-11-12',
  RJ: {
    total: j(3600, 12),
    faskes: [{ kode: '0101R001', nama: 'RSD MAWAR', ...j(3513, 9) }, { kode: '0202R002', nama: 'RSUD MELATI', ...j(87, 3) }],
    poli: [{ nama: 'ANAK', ...j(1200, 4) }, { nama: 'SARAF', ...j(2400, 8) }],
    tren: [{ hari: 1, ...j(1800, 6) }, { hari: 2, ...j(1800, 6) }],
  },
  RI: {
    total: j(2, 1500, 271),
    faskes: [{ kode: '0202R002', nama: 'RSUD MELATI', ...j(0, 627, 112) }, { kode: '0101R001', nama: 'RSD MAWAR', ...j(2, 858, 159) },
      { kode: '0303S003', nama: 'KLINIK KENANGA', ...j(0, 15, 0) }],
    poli: [{ nama: 'SARAF', ...j(1, 700, 71) }, { nama: 'BEDAH', ...j(1, 800, 200) }],
    tren: [{ hari: 2, ...j(2, 1500, 271) }],
  },
};

test('angka dan persen berformat Indonesia', () => {
  assert.equal(s.angka(32972), '32.972');
  assert.equal(s.angka(0), '0');
  assert.equal(s.persen(0.9972), '99,72%');
  assert.equal(s.persen(0), '0,00%');
});

test('label bulan dan tanggal data', () => {
  assert.equal(s.labelBulan('2026-11'), 'November 2026');
  assert.equal(s.tanggalSampai('2026-11-12'), '12 November 2026');
  assert.equal(s.tanggalSampai(''), '');
});

test('jenis Rawat Jalan dan Rawat Inap diambil apa adanya', () => {
  assert.deepEqual(s.gabungJenis(DATA, 'RJ'), DATA.RJ);
  assert.equal(s.gabungJenis(DATA, 'RI').total.gt, 271);
});

test('jenis semua menjumlahkan RJ dan RI per RS, poli, dan tanggal', () => {
  const g = s.gabungJenis(DATA, 'semua');
  assert.deepEqual(g.total, j(3602, 1512, 271));
  assert.deepEqual(g.faskes.map(f => [f.kode, f.lt + f.eq + f.gt]), [['0101R001', 4541], ['0202R002', 829], ['0303S003', 15]]);
  assert.deepEqual(g.poli.map(p => p.nama), ['SARAF', 'ANAK', 'BEDAH']);
  assert.deepEqual(g.tren.map(t => [t.hari, t.lt, t.eq, t.gt]), [[1, 1800, 6, 0], [2, 1802, 1506, 271]]);
});

test('kartu status semua RS memakai total; persen dari semua status', () => {
  const r = s.ringkasStatus(s.gabungJenis(DATA, 'RI'), '');
  assert.deepEqual(r.jumlah, j(2, 1500, 271));
  assert.equal(r.total, 1773);
  assert.equal(s.persen(r.persen.gt), '15,28%');
});

test('kartu status satu RS memakai baris RS itu; RS tanpa SEP bernilai 0', () => {
  const g = s.gabungJenis(DATA, 'RJ');
  assert.deepEqual(s.ringkasStatus(g, '0202R002').jumlah, j(87, 3, 0));
  const kosong = s.ringkasStatus(g, '0303S003');
  assert.equal(kosong.total, 0);
  assert.deepEqual(kosong.persen, j(0, 0, 0));
});

test('filter status mengosongkan status lain untuk grafik', () => {
  assert.deepEqual(s.saringStatus(j(5, 6, 7), 'eq'), j(0, 6, 0));
  assert.deepEqual(s.saringStatus(j(5, 6, 7), 'semua'), j(5, 6, 7));
});

test('status yang ada hanya yang punya nilai, kecuali < dan = selalu tampil', () => {
  assert.deepEqual(s.statusTampil(j(5, 0, 0)), ['lt', 'eq']);
  assert.deepEqual(s.statusTampil(j(5, 0, 2)), ['lt', 'eq', 'gt']);
});

test('poli teratas menggabungkan sisanya menjadi Poli lain dan mengikuti filter status', () => {
  const poli = Array.from({ length: 12 }, (_, i) => ({ nama: `POLI ${i + 1}`, ...j(100 - i, i, 0) }));
  const atas = s.poliTeratas(poli, 'semua', 10);
  assert.equal(atas.length, 11);
  assert.equal(atas[10].nama, 'Poli lain');
  assert.equal(atas[10].lt + atas[10].eq, 90 + 10 + 89 + 11);
  const eq = s.poliTeratas(poli, 'eq', 3);
  assert.deepEqual(eq.slice(0, 3).map(p => p.nama), ['POLI 12', 'POLI 11', 'POLI 10']);
  assert.equal(s.poliTeratas(poli.slice(0, 3), 'semua', 10).length, 3);
});

test('treemap mengisi kotak penuh dengan luas sebanding nilai', () => {
  const kotak = s.treemap([{ id: 'a', nilai: 6 }, { id: 'b', nilai: 3 }, { id: 'c', nilai: 1 }], 100, 50);
  assert.equal(kotak.length, 3);
  const luas = Object.fromEntries(kotak.map(k => [k.id, k.w * k.h]));
  assert.ok(Math.abs(luas.a - 3000) < 1 && Math.abs(luas.b - 1500) < 1 && Math.abs(luas.c - 500) < 1);
  for (const k of kotak) assert.ok(k.x >= 0 && k.y >= 0 && k.x + k.w <= 100.001 && k.y + k.h <= 50.001);
  assert.deepEqual(s.treemap([{ id: 'nol', nilai: 0 }], 10, 10), []);
});

test('nama berkas JPEG mengikuti filter tanpa karakter aneh', () => {
  assert.equal(s.namaBerkasJpeg('2026-11', 'RJ', ''), 'Monitoring_Surat_Kontrol_November_2026_Rawat_Jalan');
  assert.equal(s.namaBerkasJpeg('2026-11', 'semua', 'MELATI LUMAJANG, RSUD'),
    'Monitoring_Surat_Kontrol_November_2026_Semua_Jenis_MELATI_LUMAJANG_RSUD');
});

const NAMA = ['Faskes Surkon', 'Header Surkon', 'Keterangan', 'Poli', 'Tren'];
const sepuluh = (bulan = '2026-11') => ['RJ', 'RI'].flatMap(jj => NAMA.map(n => ({ name: `${bulan}_${jj}_${n}.csv`, size: 2000 })));

test('bulan diusulkan dari awalan nama berkas', () => {
  assert.equal(s.bulanDariBerkas(sepuluh().map(b => b.name)), '2026-11');
  assert.equal(s.bulanDariBerkas(['2026-11_RJ_Poli.csv', '2026-12_RI_Poli.csv']), null);
  assert.equal(s.bulanDariBerkas(['Poli.csv']), null);
});

test('pemeriksaan awal di browser: lengkap lolos, sisanya diberi pesan', () => {
  assert.equal(s.cekBerkasUnggah(sepuluh(), '2026-11'), null);
  assert.equal(s.cekBerkasUnggah(sepuluh().filter(b => !b.name.includes('Keterangan')), '2026-11'), null);
  assert.match(s.cekBerkasUnggah(sepuluh().filter(b => !b.name.includes('RI_Tren')), '2026-11'), /RI Tren/);
  assert.match(s.cekBerkasUnggah([...sepuluh(), { name: 'x.csv', size: 1 }], '2026-11'), /10 berkas/);
  assert.match(s.cekBerkasUnggah([...sepuluh().slice(1), { name: 'Poli.csv', size: 1 }], '2026-11'), /Nama berkas/);
  assert.match(s.cekBerkasUnggah(sepuluh(), '2026-10'), /Oktober 2026/);
  assert.match(s.cekBerkasUnggah(sepuluh().map(b => ({ ...b, size: 300 * 1024 })), '2026-11'), /200 KB/);
  assert.match(s.cekBerkasUnggah([], '2026-11'), /Pilih/);
  assert.match(s.cekBerkasUnggah(sepuluh(), ''), /bulan/);
});
