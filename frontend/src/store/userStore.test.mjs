import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const baca = (nama) => readFile(new URL(nama, import.meta.url), 'utf8');
const sumber = await baca('./userStorePrivacy.ts');
const { outputText } = ts.transpileModule(sumber, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { buangKataSandi } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('data pengguna tersimpan dibersihkan dari kolom kata sandi', () => {
  const lama = {
    profile: { name: 'Contoh', username: 'contoh', password: 'nilai-lama' },
    users: [
      { id: 'usr-1', username: 'satu', role: 'Admin', password: 'nilai-lama' },
      { id: 'usr-2', username: 'dua', role: 'User' },
    ],
  };
  const baru = buangKataSandi(lama);
  assert.deepEqual(baru, {
    profile: { name: 'Contoh', username: 'contoh' },
    users: [
      { id: 'usr-1', username: 'satu', role: 'Admin' },
      { id: 'usr-2', username: 'dua', role: 'User' },
    ],
  });
  assert.equal(lama.profile.password, 'nilai-lama', 'masukan tidak diubah di tempat');
  assert.deepEqual(buangKataSandi(baru), baru, 'aman dijalankan berulang');
});

test('bentuk data yang tidak dikenal dikembalikan apa adanya', () => {
  for (const nilai of [null, undefined, 'teks', 7]) assert.equal(buangKataSandi(nilai), nilai);
  assert.deepEqual(buangKataSandi({ users: 'rusak' }), { users: 'rusak', profile: undefined });
});

test('toko pengguna dan halaman pengaturan tidak lagi mengenal kolom kata sandi', async () => {
  for (const berkas of ['./userStore.ts', '../components/AdminSettings.tsx']) {
    assert.doesNotMatch(await baca(berkas), /password/i, berkas);
  }
});
