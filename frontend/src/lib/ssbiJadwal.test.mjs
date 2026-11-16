import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./ssbiJadwal.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const s = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const INFO = { ada_data: true, rs: null, bulan: ['2026-04', '2026-05', '2026-10'], data_per: '2026-11-16T14:32:05+07:00' };

test('nilai filter bulan menjadi YYYY-MM; Semua Bulan tidak', () => {
  assert.equal(s.kodeBulan('September 2026'), '2026-09');
  assert.equal(s.kodeBulan('Oktober 2026'), '2026-10');
  assert.equal(s.kodeBulan('Semua Bulan'), null);
  assert.equal(s.kodeBulan(''), null);
});

test('rentang bulan untuk kartu data aktif', () => {
  assert.equal(s.rentangBulan(['2026-10', '2026-04', '2026-05']), 'April–Oktober 2026');
  assert.equal(s.rentangBulan(['2026-12', '2027-01']), 'Desember 2026–Januari 2027');
  assert.equal(s.rentangBulan(['2026-04']), 'April 2026');
  assert.equal(s.rentangBulan([]), '');
});

test('bulan lama yang hilang setelah diganti', () => {
  assert.deepEqual(s.bulanHilang(['2026-04', '2026-05'], ['2026-05', '2026-06']), ['2026-04']);
});

test('tanggal data integrasi', () => {
  assert.equal(s.tanggalData('2026-11-16T14:32:05+07:00'), '16 Nov 2026');
  assert.equal(s.tanggalData('2026-11-16T14:32:05+07:00', true), '16 Nov 2026 14.32 WIB');
  assert.equal(s.tanggalData(''), '');
});

test('berkas dicek sebelum dikirim', () => {
  assert.match(s.cekBerkas('FKRTL.xlsx', 10), /harus CSV/);
  assert.match(s.cekBerkas('FKRTL.csv', 31 * 1024 * 1024), /melebihi batas 30 MB/);
  assert.equal(s.cekBerkas('FKRTL.CSV', 12 * 1024 * 1024), null);
  assert.match(s.cekHasilKompres(5 * 1024 * 1024), /batas 4 MB/);
  assert.equal(s.cekHasilKompres(2 * 1024 * 1024), null);
});

test('keadaan tombol Download Detail', () => {
  assert.deepEqual(s.keadaanUnduh('Semua Bulan', INFO), {
    aktif: true, teks: 'Detail per dokter, semua bulan (April–Oktober 2026) · data SSBI per 16 Nov 2026',
  });
  assert.equal(s.keadaanUnduh('Pilih', INFO).aktif, false);
  assert.equal(s.keadaanUnduh('October 2026', { ...INFO, ada_data: false, bulan: [] }).aktif, false);
  assert.deepEqual(s.keadaanUnduh('October 2026', INFO), { aktif: true, teks: 'Detail per dokter, Oktober 2026 · data SSBI per 16 Nov 2026' });
  assert.deepEqual(s.keadaanUnduh('September 2026', INFO), {
    aktif: false, teks: 'Belum ada detail untuk September 2026. Data SSBI yang terpasang mencakup April–Oktober 2026.',
  });
  const petugas = { ...INFO, rs: 'RSD Melati', bulan: ['2026-10'] };
  assert.equal(s.keadaanUnduh('October 2026', petugas).teks, 'Detail per dokter RSD Melati, Oktober 2026 · data SSBI per 16 Nov 2026');
  assert.deepEqual(s.keadaanUnduh('May 2026', petugas), { aktif: false, teks: 'Belum ada detail RSD Melati untuk Mei 2026.' });
  assert.equal(s.keadaanUnduh('Semua Bulan', petugas).teks, 'Detail per dokter RSD Melati, semua bulan (Oktober 2026) · data SSBI per 16 Nov 2026');
  assert.deepEqual(s.keadaanUnduh('Semua Bulan', { ...petugas, bulan: [] }), { aktif: false, teks: 'Belum ada detail RSD Melati.' });
  assert.equal(s.keadaanUnduh('October 2026', undefined).aktif, false);
});

test('nama berkas hanya diambil dari header yang aman', () => {
  assert.equal(s.namaDariHeader('attachment; filename="Detail_Jadwal_Dokter_FKRTL_Mei_2026.xlsx"', 'x.xlsx'), 'Detail_Jadwal_Dokter_FKRTL_Mei_2026.xlsx');
  assert.equal(s.namaDariHeader('attachment; filename="../evil.exe"', 'x.xlsx'), 'x.xlsx');
  assert.equal(s.namaDariHeader(undefined, 'x.xlsx'), 'x.xlsx');
});

test('parameter bulan untuk server', () => {
  assert.equal(s.parameterBulan('Semua Bulan'), 'semua');
  assert.equal(s.parameterBulan('October 2026'), '2026-10');
  assert.equal(s.parameterBulan('Pilih'), null);
});

test('nama berkas cadangan memuat rentang bulan', () => {
  assert.equal(s.namaBerkasCadangan('semua', ['2026-04', '2026-10']), 'Detail_Jadwal_Dokter_FKRTL_April-Oktober_2026.xlsx');
  assert.equal(s.namaBerkasCadangan('semua', ['2026-12', '2027-01']), 'Detail_Jadwal_Dokter_FKRTL_Desember_2026-Januari_2027.xlsx');
  assert.equal(s.namaBerkasCadangan('2026-05', []), 'Detail_Jadwal_Dokter_FKRTL_Mei_2026.xlsx');
});

test('admin tanpa detail mendapat teks lengkap', () => {
  assert.equal(s.keadaanUnduh('Semua Bulan', { ...INFO, bulan: [] }).teks, 'Belum ada detail di data SSBI yang terpasang.');
});
