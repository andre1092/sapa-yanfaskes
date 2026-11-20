import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Halaman masuk SAPA (/login): teks dan warna harus serasi dengan halaman masuk Auth0 dan
// /verifikasi (desain Kim, agents/kim/desain/login-auth0/).
const kode = await readFile(new URL('../src/components/LoginPage.tsx', import.meta.url), 'utf8');
const gaya = await readFile(new URL('../src/components/gayaMasuk.ts', import.meta.url), 'utf8');
const form = await readFile(new URL('../src/components/FormMasuk.tsx', import.meta.url), 'utf8');

test('teks halaman masuk memakai nama resmi dan bahasa pengguna', () => {
  assert.match(kode, />Saluran Analisa Performa Pelayanan Fasilitas Kesehatan</);
  assert.doesNotMatch(kode, /Sistem Analisis Pelayanan/);
  assert.match(kode, /: 'Masuk'\}/);
  assert.doesNotMatch(kode, /Masuk dengan SSO/);
  assert.doesNotMatch(kode, /halaman masuk Auth0\./, 'nama penyedia tidak perlu dilihat pengguna');
  assert.match(kode, /Lupa kata sandi\? Pilih “Lupa kata sandi\?” di halaman masuk/);
});

test('warna terang eksplisit, sama dengan tema Auth0, juga saat tema gelap', () => {
  for (const warna of ["latar: '#eef3f8'", "judul: '#0f2a4d'", "redup: '#5b6b7f'", "hijau: '#007a43'", "biru: '#0060a0'"]) {
    assert.ok(gaya.includes(warna), warna);
  }
  for (const berkas of [kode, form]) assert.doesNotMatch(berkas, /color="(secondary|text\.secondary)"/, 'jangan bergantung pada palet tema');
  assert.match(gaya, /bgcolor: WARNA\.hijau, color: '#fff'/);
});
