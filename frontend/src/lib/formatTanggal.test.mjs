import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./formatTanggal.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { tanggalDariFormatAS, tanggalIso, bulanIndonesia } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('format Amerika menjadi hari/bulan/tahun tanpa detik', () => {
  assert.equal(tanggalDariFormatAS('09/28/2026 03:13:14'), '28/09/2026 03:13');
  assert.equal(tanggalDariFormatAS('01/31/2026 23:59:59'), '31/01/2026 23:59');
  assert.equal(tanggalDariFormatAS('11/09/2026 00:12:47'), '09/11/2026 00:12');
  assert.equal(tanggalDariFormatAS('2/3/2026'), '03/02/2026');
});

test('teks yang sudah hari/bulan atau tidak dikenali tidak dibalik', () => {
  assert.equal(tanggalDariFormatAS('19/10/2026 21:00:00'), '19/10/2026 21:00');
  assert.equal(tanggalDariFormatAS('Belum tersedia'), 'Belum tersedia');
  assert.equal(tanggalDariFormatAS('13/13/2026'), '13/13/2026');
  assert.equal(tanggalDariFormatAS(''), '');
  assert.equal(tanggalDariFormatAS(undefined), '');
});

test('tanggal ISO menjadi hari/bulan/tahun', () => {
  assert.equal(tanggalIso('2026-10-01'), '01/10/2026');
  assert.equal(tanggalIso('2026-10-27 16:15 WIB'), '27/10/2026 16:15 WIB');
  assert.equal(tanggalIso('2026-10'), '2026-10');
  assert.equal(tanggalIso('Belum tersedia'), 'Belum tersedia');
});

test('nama bulan Inggris menjadi bahasa Indonesia', () => {
  assert.equal(bulanIndonesia('October 2026'), 'Oktober 2026');
  assert.equal(bulanIndonesia('Semua Bulan'), 'Semua Bulan');
  assert.equal(bulanIndonesia('May 2026'), 'Mei 2026');
});
