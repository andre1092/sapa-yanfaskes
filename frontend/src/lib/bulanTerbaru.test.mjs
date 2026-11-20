import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./bulanTerbaru.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { bulanTerbaru } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('memilih bulan paling akhir, apa pun urutan opsinya', () => {
  assert.equal(bulanTerbaru(['Semua Bulan', 'November 2026', 'October 2026', 'September 2026']), 'November 2026');
  assert.equal(bulanTerbaru(['September 2026', 'November 2026', 'October 2026']), 'November 2026');
});

test('pergantian tahun: Januari tahun berikutnya lebih baru dari Desember', () => {
  assert.equal(bulanTerbaru(['December 2026', 'January 2027', 'November 2026']), 'January 2027');
});

test('opsi kosong, tidak ada, atau tanpa bulan sah menghasilkan string kosong', () => {
  assert.equal(bulanTerbaru([]), '');
  assert.equal(bulanTerbaru(undefined), '');
  assert.equal(bulanTerbaru(null), '');
  assert.equal(bulanTerbaru(['Semua Bulan', 'Bulan Ini', '2026-11', 'Movember 2026']), '');
});

test('mengembalikan teks opsi apa adanya supaya cocok dengan nilai filter', () => {
  assert.equal(bulanTerbaru(['  October 2026  ', 'September 2026']), '  October 2026  ');
});
