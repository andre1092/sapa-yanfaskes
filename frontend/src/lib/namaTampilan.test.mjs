import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./namaTampilan.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { namaTampilan, peranTampilan } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('nama asli dipakai apa adanya', () => {
  assert.equal(namaTampilan({ name: 'Siti Aminah', username: 'siti' }), 'Siti Aminah');
  assert.equal(namaTampilan({ name: '', username: 'admin_jember' }), 'admin_jember');
});

test('alamat email diganti nama dari bagian sebelum @', () => {
  assert.equal(namaTampilan({ name: 'budi.santoso@contoh.go.id' }), 'Budi Santoso');
  assert.equal(namaTampilan({ name: 'rina_w-putri@contoh.go.id' }), 'Rina W Putri');
  assert.equal(namaTampilan({ username: 'x@contoh.go.id' }), 'X');
  assert.ok(!namaTampilan({ name: 'budi.santoso@contoh.go.id' }).includes('@'));
});

test('tanpa nama memakai kata Pengguna', () => {
  assert.equal(namaTampilan(null), 'Pengguna');
  assert.equal(namaTampilan({}), 'Pengguna');
  assert.equal(namaTampilan({ name: '@contoh.go.id' }), 'Pengguna');
});

test('peran ditampilkan dalam bahasa Indonesia', () => {
  assert.equal(peranTampilan('viewer'), 'Pengguna');
  assert.equal(peranTampilan('Admin'), 'Admin');
  assert.equal(peranTampilan('Super Admin'), 'Super Admin');
  assert.equal(peranTampilan(undefined), 'Pengguna');
});
