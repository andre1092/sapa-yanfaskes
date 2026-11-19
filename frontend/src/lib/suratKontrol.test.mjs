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
  assert.equal(s.tanggalSampai('2026-11-12'), '12 Nov 2026');
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

test('jumlah status mengikuti jenis: RJ dua, RI dan Semua tiga', () => {
  assert.deepEqual(s.statusJenis('RJ'), ['lt', 'eq']);
  assert.deepEqual(s.statusJenis('RI'), ['lt', 'eq', 'gt']);
  assert.deepEqual(s.statusJenis('semua'), ['lt', 'eq', 'gt']);
});

test('label total cabang hanya saat satu faskes dipilih atau untuk Petugas RS', () => {
  assert.equal(s.labelTotalCabang(false), '');
  assert.equal(s.labelTotalCabang(true), 'Total cabang (semua faskes)');
});

test('urutan bar faskes mengikuti jumlah status yang tampil', () => {
  const faskes = [{ kode: 'A', nama: 'A', ...j(100, 1, 0) }, { kode: 'B', nama: 'B', ...j(10, 50, 0) }, { kode: 'C', nama: 'C', ...j(0, 0, 0) }];
  assert.deepEqual(s.urutFaskes(faskes, 'semua').map(f => f.kode), ['A', 'B']);
  assert.deepEqual(s.urutFaskes(faskes, 'eq').map(f => [f.kode, f.lt, f.eq]), [['B', 0, 50], ['A', 0, 1]]);
});

test('poli diurutkan menurun dan mengikuti filter status, semua poli tetap ada', () => {
  const poli = Array.from({ length: 12 }, (_, i) => ({ nama: `POLI ${i + 1}`, ...j(100 - i * 5, i, 0) }));
  const semua = s.urutPoli(poli, 'semua');
  assert.equal(semua.length, 12);
  assert.deepEqual(semua.slice(0, 2).map(p => p.nama), ['POLI 1', 'POLI 2']);
  const eq = s.urutPoli(poli, 'eq');
  assert.deepEqual(eq.slice(0, 2).map(p => [p.nama, p.lt]), [['POLI 12', 0], ['POLI 11', 0]]);
  assert.equal(eq.length, 11);
});

test('data belum lengkap bila tanggal sampai sebelum akhir bulan', () => {
  assert.equal(s.dataBelumLengkap('2026-11-12'), true);
  assert.equal(s.dataBelumLengkap('2026-11-30'), false);
  assert.equal(s.dataBelumLengkap(''), false);
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
  assert.equal(s.namaBerkasJpeg('2026-11', 'RJ', ''), 'Monitoring_Surat_Kontrol_Tabel_November_2026_RJ');
  assert.equal(s.namaBerkasJpeg('2026-11', 'semua', 'MELATI LUMAJANG, RSUD'), 'Monitoring_Surat_Kontrol_Tabel_November_2026_Semua_MELATI_LUMAJANG_RSUD');
});

// Tata letak meniru Crosstab asli (baris pertama), nama samaran.
const TEKS = {
  'Faskes Surkon': '\tStatus\tStatus\r\n\tSurkon = SEP\tSurkon < SEP\r\n0101R001 - RS A\t1\t2\r\n',
  'Header Surkon': '\tStatus\tStatus\r\n\tSurkon < SEP\tSurkon = SEP\r\n% of Total Jumlah SEP along Status\t1%\t99%\r\nJumlah SEP\t1\t99\r\n',
  Keterangan: '\tStatus Surat Kontrol\tStatus Surat Kontrol\r\n\ta\tb\r\n',
  Poli: '\tPoli Tuju SEP\tPoli Tuju SEP\r\n\tANAK\tSARAF\r\nSurkon < SEP\t1\t2\r\n',
  Tren: 'Status\t1\t2\r\nSurkon < SEP\t1\t2\r\n',
};

test('sheet dikenali dari baris judul seperti di server', () => {
  for (const [nama, teks] of Object.entries(TEKS)) assert.equal(s.kenaliSheet(teks), nama);
  assert.equal(s.kenaliSheet('﻿Status\t1\t2\r\nSurkon < SEP\t1\t2\r\n'), 'Tren');
  assert.equal(s.kenaliSheet('Kabupaten,Nama Faskes\r\n'), null);
  assert.equal(s.kenaliSheet(''), null);
});

test('daftar periksa area: ditemukan, belum ada, dua kali; berkas asing tidak menghalangi tetapi tidak dikirim', () => {
  const area = s.periksaArea(['Tren', 'Poli', 'Poli', null, 'Header Surkon']);
  assert.equal(area.sheet.Tren, 'ada');
  assert.equal(area.sheet.Poli, 'ganda');
  assert.equal(area.sheet['Faskes Surkon'], 'belum');
  assert.equal(area.sheet.Keterangan, 'belum');
  assert.equal(area.asing, 1);
  assert.equal(area.lengkap, false);
  assert.equal(s.periksaArea(['Tren', 'Poli', 'Header Surkon', 'Faskes Surkon']).lengkap, true);
  // Sheet Data Detail (berisi Nomor SEP) tidak dikenali: daftar tetap lengkap, berkasnya tidak ikut dikirim.
  assert.equal(s.periksaArea(['Tren', 'Poli', 'Header Surkon', 'Faskes Surkon', null]).lengkap, true);
  assert.deepEqual(s.berkasDikirim([{ sheet: 'Tren', n: 1 }, { sheet: null, n: 2 }, { sheet: 'Poli', n: 3 }]).map(b => b.n), [1, 3]);
});

test('pilihan bulan unggah dari Nov 2026 sampai bulan berjalan, terbaru di atas', () => {
  assert.deepEqual(s.bulanUnggah(new Date(2027, 1, 3)), ['2027-02', '2027-01', '2026-12', '2026-11']);
  assert.deepEqual(s.bulanUnggah(new Date(2026, 10, 19)), ['2026-11']);
});

// --- tabel JPEG (perintah CEO 2026-11-19) ----------------------------------

test('skor kepatuhan berjenjang cocok dengan titik data asli sheet Kris', () => {
  // Titik nyata dari 1.459 baris 07_surkon_terbit (persentase → capaian).
  for (const [pct, skor] of [[0, 0], [50, 0], [51.35, 25], [56.27, 25], [62.03, 50], [80, 50], [80.06, 75], [88.59, 75], [95.58, 100], [100, 100]]) {
    assert.equal(s.skorKepatuhan(pct / 100), skor, `${pct}%`);
  }
  // Batas yang dikonfirmasi CEO 2026-11-19: 90% → 100, 60% → 50.
  assert.equal(s.skorKepatuhan(0.9), 100);
  assert.equal(s.skorKepatuhan(0.8999), 75);
  assert.equal(s.skorKepatuhan(0.6), 50);
  assert.equal(s.skorKepatuhan(0.5999), 25);
});

test('baris tabel: sesuai = <, tidak sesuai = = dan >, skor hanya RJ, kuning bila ada tidak sesuai', () => {
  const kab = { '0101R001': 'KAB. JEMBER' };
  const rj = s.barisTabel(DATA.RJ, kab, 'RJ');
  assert.deepEqual(rj.map(b => b.kode), ['0101R001', '0202R002']);
  assert.deepEqual(rj[0], { kode: '0101R001', nama: 'RSD MAWAR', kabupaten: 'KAB. JEMBER', sesuai: 3513, tidak: 9, total: 3522,
    pctSesuai: 3513 / 3522, pctTidak: 9 / 3522, capaian: 100, kuning: true });
  assert.equal(rj[1].kabupaten, '-');
  const ri = s.barisTabel(DATA.RI, kab, 'RI');
  const mawar = ri.find(b => b.kode === '0101R001');
  assert.deepEqual([mawar.sesuai, mawar.tidak, mawar.total, mawar.capaian], [2, 858 + 159, 1019, null]);
  assert.equal(s.barisTabel(s.gabungJenis(DATA, 'semua'), kab, 'semua')[0].capaian, null);
  const tanpa = s.barisTabel({ ...DATA.RJ, faskes: [{ kode: 'X', nama: 'X', ...j(10, 0, 0) }, { kode: 'Y', nama: 'Y', ...j(0, 0, 0) }] }, {}, 'RJ');
  assert.deepEqual(tanpa.map(b => [b.kode, b.kuning]), [['X', false]]);
});

test('baris tabel urut menurut persen sesuai menurun', () => {
  const d = { ...DATA.RJ, faskes: [{ kode: 'A', nama: 'A', ...j(50, 50, 0) }, { kode: 'B', nama: 'B', ...j(99, 1, 0) }, { kode: 'C', nama: 'C', ...j(10, 0, 0) }] };
  assert.deepEqual(s.barisTabel(d, {}, 'RJ').map(b => b.kode), ['C', 'B', 'A']);
});

test('label kabupaten tanpa awalan KAB., huruf kapital awal; kosong jadi tanda hubung', () => {
  assert.equal(s.labelKabupaten('KAB. JEMBER'), 'Jember');
  assert.equal(s.labelKabupaten('Kab Lumajang'), 'Lumajang');
  assert.equal(s.labelKabupaten('BONDOWOSO'), 'Bondowoso');
  assert.equal(s.labelKabupaten('-'), '-');
  assert.equal(s.labelKabupaten(''), '-');
});

test('baris Total cabang menjumlahkan semua faskes dan memakai rumus skor yang sama', () => {
  const rj = s.totalTabel(s.barisTabel(DATA.RJ, {}, 'RJ'), 'RJ');
  assert.deepEqual([rj.sesuai, rj.tidak, rj.total, rj.capaian], [3600, 12, 3612, 100]);
  assert.equal(rj.pctSesuai, 3600 / 3612);
  assert.equal(s.totalTabel(s.barisTabel(DATA.RI, {}, 'RI'), 'RI').capaian, null);
  assert.equal(s.totalTabel([], 'RJ').total, 0);
});
