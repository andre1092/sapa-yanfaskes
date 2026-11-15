import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./verifikasi.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { bacaParameter, ringkasState, keadaanDariStatus, alamatLanjutSah } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('parameter dari Action Auth0 dibaca; tanpa state atau token dianggap tautan tidak sah', () => {
  assert.deepEqual(bacaParameter('?state=abc&session_token=t.o.k'), { state: 'abc', sessionToken: 't.o.k' });
  assert.equal(bacaParameter('?state=abc'), null);
  assert.equal(bacaParameter('?session_token=t'), null);
  assert.equal(bacaParameter(''), null);
  assert.equal(bacaParameter(`?state=${'a'.repeat(3000)}&session_token=t`), null);
});

test('ringkasan state sama persis dengan server (sha256 hex, 32 karakter pertama)', async () => {
  const state = 'state-dari-auth0-abc123';
  const server = createHash('sha256').update(state, 'utf8').digest('hex').slice(0, 32);
  assert.equal(await ringkasState(state), server);
});

test('status jawaban API dipetakan ke keadaan halaman', () => {
  assert.equal(keadaanDariStatus(400), 'tautan');
  assert.equal(keadaanDariStatus(403), 'gagal');
  assert.equal(keadaanDariStatus(503), 'layanan');
  assert.equal(keadaanDariStatus(500), 'layanan');
  assert.equal(keadaanDariStatus(0), 'layanan');
});

test('lanjut hanya ke /continue di domain Auth0 milik SAPA', () => {
  const domain = 'sapa-yanfaskes.us.auth0.com';
  assert.equal(alamatLanjutSah('https://sapa-yanfaskes.us.auth0.com/continue', domain), true);
  assert.equal(alamatLanjutSah('https://evil.example/continue', domain), false);
  assert.equal(alamatLanjutSah('http://sapa-yanfaskes.us.auth0.com/continue', domain), false);
  assert.equal(alamatLanjutSah('https://sapa-yanfaskes.us.auth0.com/authorize', domain), false);
  assert.equal(alamatLanjutSah('https://sapa-yanfaskes.us.auth0.com.evil.example/continue', domain), false);
  assert.equal(alamatLanjutSah('bukan url', domain), false);
  assert.equal(alamatLanjutSah('https://sapa-yanfaskes.us.auth0.com/continue', ''), false);
});
