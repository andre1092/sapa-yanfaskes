import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./halamanAwal.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { HALAMAN_AWAL, alamatSetelahMasuk } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('alamat akar diarahkan ke Beranda', () => {
  assert.equal(HALAMAN_AWAL, '/home');
  assert.equal(alamatSetelahMasuk('/'), '/home');
  assert.equal(alamatSetelahMasuk('/?code=abc&state=xyz'), '/home');
  assert.equal(alamatSetelahMasuk('/#atas'), '/home');
});

test('tautan langsung yang sah dipertahankan', () => {
  assert.equal(alamatSetelahMasuk('/kepatuhanfkrtl'), '/kepatuhanfkrtl');
  assert.equal(alamatSetelahMasuk('/antrolfkrtl?tab=poli#tabel'), '/antrolfkrtl?tab=poli#tabel');
  assert.equal(alamatSetelahMasuk('/home'), '/home');
});
