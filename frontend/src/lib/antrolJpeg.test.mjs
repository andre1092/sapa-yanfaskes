import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./antrolJpeg.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { targetSumber, warnaAntrol, urutkanRsAntrol } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('target Mobile JKN 80%, Semua Sumber 95%', () => {
  assert.equal(targetSumber('Mobile JKN'), 80);
  assert.equal(targetSumber(' mobile jkn '), 80);
  assert.equal(targetSumber('Semua Sumber'), 95);
  assert.equal(targetSumber('All Sumber'), 95);
});

test('Mobile JKN: merah 0, kuning di atas 0 sampai di bawah 80, hijau 80 ke atas', () => {
  assert.equal(warnaAntrol(0, 80), 'merah');
  assert.equal(warnaAntrol(0.5, 80), 'kuning');
  assert.equal(warnaAntrol(79.99, 80), 'kuning');
  assert.equal(warnaAntrol(80, 80), 'hijau');
  assert.equal(warnaAntrol(100, 80), 'hijau');
});

test('Semua Sumber: kuning sampai di bawah 95, hijau 95 ke atas', () => {
  assert.equal(warnaAntrol(94.99, 95), 'kuning');
  assert.equal(warnaAntrol(95, 95), 'hijau');
  assert.equal(warnaAntrol(120, 95), 'hijau');
});

test('warna mengikuti angka dua desimal yang tercetak; sel tanpa data tidak diwarnai', () => {
  assert.equal(warnaAntrol(79.996, 80), 'hijau');
  assert.equal(warnaAntrol(0.004, 80), 'merah');
  assert.equal(warnaAntrol('85.5', 95), 'kuning');
  for (const kosong of [null, undefined, '', 'abc']) assert.equal(warnaAntrol(kosong, 95), 'kosong');
});

test('data RS urut kabupaten, lalu Semua Sumber tertinggi, lalu Mobile JKN, lalu nama', () => {
  const rows = [
    { Faskes: 'RS B', Kabupaten: 'Lumajang', all_sumber_pct: 99, mjkn_pct: 70 },
    { Faskes: 'RS C', Kabupaten: 'Jember', all_sumber_pct: 90, mjkn_pct: 85 },
    { Faskes: 'RS A', Kabupaten: 'Jember', all_sumber_pct: 97, mjkn_pct: 60 },
    { Faskes: 'RS E', Kabupaten: 'Jember', all_sumber_pct: 90, mjkn_pct: 90 },
    { Faskes: 'RS D', Kabupaten: 'Jember', all_sumber_pct: 90, mjkn_pct: 90 },
  ];
  const urut = urutkanRsAntrol(rows);
  assert.deepEqual(urut.map(r => r.Faskes), ['RS A', 'RS D', 'RS E', 'RS C', 'RS B']);
  assert.equal(rows[0].Faskes, 'RS B', 'masukan tidak diubah');
});
