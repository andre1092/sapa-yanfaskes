import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./syaratSandi.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { periksaSandi } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const status = (sandi, ulang) => Object.fromEntries(periksaSandi(sandi, ulang).syarat.map(s => [s.kunci, s.terpenuhi]));

test('syarat sama dengan server: 12 karakter, huruf besar, huruf kecil, angka, dan ketik ulang sama', () => {
  assert.deepEqual(status('', ''), { panjang: false, besar: false, kecil: false, angka: false, sama: false });
  assert.deepEqual(status('SandiBaruKuat2026', 'SandiBaruKuat2026'), { panjang: true, besar: true, kecil: true, angka: true, sama: true });
  assert.deepEqual(status('sandibarukuat', 'beda'), { panjang: true, besar: false, kecil: true, angka: false, sama: false });
});

test('siap hanya bila semua syarat terpenuhi', () => {
  assert.equal(periksaSandi('SandiBaruKuat2026', 'SandiBaruKuat2026').siap, true);
  assert.equal(periksaSandi('Pendek1A', 'Pendek1A').siap, false);
  assert.equal(periksaSandi('SandiBaruKuat2026', 'SandiBaruKuat2025').siap, false);
  assert.equal(periksaSandi('X'.repeat(129) + 'a1', 'X'.repeat(129) + 'a1').siap, false);
});
