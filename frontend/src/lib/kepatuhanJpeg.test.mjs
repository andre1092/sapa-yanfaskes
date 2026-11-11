import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./kepatuhanJpeg.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { warnaCapaian, urutkanUntukUnduh, statusNilaiAkhir } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('capaian 0 merah, di antara 0 dan 100 kuning, 100 hijau', () => {
  assert.equal(warnaCapaian(0), 'merah');
  assert.equal(warnaCapaian(0.5), 'kuning');
  assert.equal(warnaCapaian(50), 'kuning');
  assert.equal(warnaCapaian(99.9), 'kuning');
  assert.equal(warnaCapaian(100), 'hijau');
});

test('warna mengikuti angka yang tercetak dua desimal, dan sel tanpa data tidak diwarnai', () => {
  assert.equal(warnaCapaian(99.996), 'hijau');
  assert.equal(warnaCapaian(0.004), 'merah');
  assert.equal(warnaCapaian(120), 'hijau');
  assert.equal(warnaCapaian('75.5'), 'kuning');
  assert.equal(warnaCapaian(null), 'kosong');
  assert.equal(warnaCapaian(undefined), 'kosong');
  assert.equal(warnaCapaian(''), 'kosong');
  assert.equal(warnaCapaian('abc'), 'kosong');
});

test('baris diurutkan per kabupaten, lalu capaian tertinggi, lalu nilai tertinggi bila capaian sama', () => {
  const rows = [
    { nama_ppk: 'RS A', kabupaten: 'LUMAJANG', capaian: 100, nilai: 20 },
    { nama_ppk: 'RS B', kabupaten: 'JEMBER', capaian: 80, nilai: 99 },
    { nama_ppk: 'RS C', kabupaten: 'JEMBER', capaian: 100, nilai: 10 },
    { nama_ppk: 'RS D', kabupaten: 'JEMBER', capaian: 100, nilai: 25 },
    { nama_ppk: 'RS E', kabupaten: 'JEMBER', capaian: null, nilai: null },
    { nama_ppk: 'RS F', kabupaten: 'JEMBER', capaian: 0, nilai: 0 },
  ];
  const salinan = structuredClone(rows);
  const hasil = urutkanUntukUnduh(rows, ['capaian', 'nilai']);
  assert.deepEqual(hasil.map(r => r.nama_ppk), ['RS D', 'RS C', 'RS B', 'RS F', 'RS E', 'RS A']);
  assert.deepEqual(rows, salinan);
});

test('capaian dan nilai yang sama diurutkan menurut nama rumah sakit', () => {
  const rows = [
    { nama_ppk: 'RS Z', kabupaten: 'JEMBER', capaian: 100 },
    { nama_ppk: 'RS M', kabupaten: 'JEMBER', capaian: 100 },
  ];
  assert.deepEqual(urutkanUntukUnduh(rows, ['capaian']).map(r => r.nama_ppk), ['RS M', 'RS Z']);
});

test('nilai akhir patuh mulai 70', () => {
  assert.equal(statusNilaiAkhir(70), 'Patuh');
  assert.equal(statusNilaiAkhir(69.99), 'Belum Patuh');
  assert.equal(statusNilaiAkhir(85), 'Patuh');
  assert.equal(statusNilaiAkhir(0), 'Belum Patuh');
  assert.equal(statusNilaiAkhir(null), 'Belum Patuh');
});
