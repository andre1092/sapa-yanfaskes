import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./halamanAwal.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { HALAMAN_AWAL, HALAMAN_MASUK, alamatSetelahMasuk, alamatHalamanMasuk, tujuanSetelahMasuk } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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

test('halaman masuk SAPA beralamat /login', () => {
  assert.equal(HALAMAN_MASUK, '/login');
});

test('pengunjung yang belum masuk dibawa ke /login dengan tujuan semula', () => {
  assert.equal(alamatHalamanMasuk('/'), '/login');
  assert.equal(alamatHalamanMasuk('/home'), '/login');
  assert.equal(alamatHalamanMasuk('/?error=access_denied'), '/login');
  assert.equal(alamatHalamanMasuk('/kepatuhanfkrtl?x=1'), '/login?kembali=%2Fkepatuhanfkrtl%3Fx%3D1');
});

test('alamat /login yang sudah benar tidak diubah', () => {
  assert.equal(alamatHalamanMasuk('/login'), '/login');
  assert.equal(alamatHalamanMasuk('/login/'), '/login/');
  assert.equal(alamatHalamanMasuk('/login?kembali=%2Fantrolfkrtl'), '/login?kembali=%2Fantrolfkrtl');
});

test('tujuan login dari /login diambil dari parameter kembali', () => {
  assert.equal(tujuanSetelahMasuk('/login?kembali=%2Fkepatuhanfkrtl%3Fx%3D1'), '/kepatuhanfkrtl?x=1');
  assert.equal(tujuanSetelahMasuk('/login'), '/');
  assert.equal(tujuanSetelahMasuk('/login/'), '/');
  assert.equal(tujuanSetelahMasuk('/antrolfkrtl#tabel'), '/antrolfkrtl#tabel');
});

test('kembali tidak boleh membawa ke /login lagi', () => {
  assert.equal(tujuanSetelahMasuk('/login?kembali=%2Flogin'), '/');
});

test('setelah masuk, /login diarahkan ke Beranda', () => {
  assert.equal(alamatSetelahMasuk('/login'), '/home');
  assert.equal(alamatSetelahMasuk('/login/'), '/home');
});
