import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./larasJpeg.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { warnaLaras, formatDurasiLaras, urutkanTerlama, barisTabelLaras } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('hijau di bawah 55 menit, kuning 55 menit sampai di bawah 1 jam, merah 1 jam ke atas', () => {
  assert.equal(warnaLaras(0), 'hijau');
  assert.equal(warnaLaras(3299), 'hijau');
  assert.equal(warnaLaras(3300), 'kuning');
  assert.equal(warnaLaras(3599), 'kuning');
  assert.equal(warnaLaras(3600), 'merah');
  assert.equal(warnaLaras(90000), 'merah');
});

test('warna dinilai dari detik yang tercetak', () => {
  assert.equal(warnaLaras(3299.4), 'hijau');
  assert.equal(warnaLaras(3299.5), 'kuning');
  assert.equal(warnaLaras(3599.6), 'merah');
});

test('tanpa angka tidak diberi warna', () => {
  assert.equal(warnaLaras(null), 'kosong');
  assert.equal(warnaLaras(undefined), 'kosong');
  assert.equal(warnaLaras(Number.NaN), 'kosong');
});

test('durasi dicetak sebagai hari jam:menit:detik', () => {
  assert.equal(formatDurasiLaras(3300), '00 hari 00:55:00');
  assert.equal(formatDurasiLaras(3600), '00 hari 01:00:00');
  assert.equal(formatDurasiLaras(90061), '01 hari 01:01:01');
  assert.equal(formatDurasiLaras(null), 'N/A');
});

test('urut waktu terlama dulu, nama A-Z bila sama', () => {
  const rows = [
    { label: 'B', avg_seconds: 1200 },
    { label: 'C', avg_seconds: 4000 },
    { label: 'A', avg_seconds: 1200 },
    { label: 'D', avg_seconds: 3400 },
  ];
  assert.deepEqual(urutkanTerlama(rows).map(r => r.label), ['C', 'D', 'A', 'B']);
  assert.equal(rows[0].label, 'B', 'urutan asli tidak berubah');
});

test('baris tabel Excel: urut terlama, detik tercetak, waktu sebagai pecahan hari, warna sama dengan JPEG', () => {
  const rows = barisTabelLaras(
    [{ label: 'A', avg_seconds: 1200.4 }, { label: 'B', avg_seconds: 3599.6 }, { label: 'C', avg_seconds: 3300 }],
    label => `RS ${label}`,
  );
  assert.deepEqual(rows, [
    { no: 1, label: 'RS B', detik: 3600, hariExcel: 1 / 24, teks: '00 hari 01:00:00', warna: 'merah' },
    { no: 2, label: 'RS C', detik: 3300, hariExcel: 55 / 1440, teks: '00 hari 00:55:00', warna: 'kuning' },
    { no: 3, label: 'RS A', detik: 1200, hariExcel: 1 / 72, teks: '00 hari 00:20:00', warna: 'hijau' },
  ]);
});
