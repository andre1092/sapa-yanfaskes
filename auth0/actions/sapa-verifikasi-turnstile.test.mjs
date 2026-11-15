// Tes Action Auth0 dengan event dan api tiruan. Jalankan: node --test auth0/actions/sapa-verifikasi-turnstile.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const action = createRequire(import.meta.url)('./sapa-verifikasi-turnstile.js');

const SECRETS = {
  CLIENT_DIWAJIBKAN: 'spa-staging',
  STAGING_CLIENT_ID: 'spa-staging',
  SAPA_SECRET_STAGING: 'rahasia-staging',
  VERIFIKASI_URL_STAGING: 'https://staging.example/verifikasi',
  PRODUKSI_CLIENT_ID: 'spa-produksi',
  SAPA_SECRET_PRODUKSI: 'rahasia-produksi',
  VERIFIKASI_URL_PRODUKSI: 'https://sapa-yanfaskes.vercel.app/verifikasi',
};

function buatEvent(ubah = {}) {
  return {
    secrets: SECRETS,
    client: { client_id: 'spa-staging' },
    session: { id: 'sesi-1' },
    transaction: { protocol: 'oidc-basic-profile', prompt: [] },
    request: { query: {} },
    user: { user_id: 'auth0|petugas1', app_metadata: {} },
    ...ubah,
  };
}

function buatApi(payload) {
  const catat = { ditolak: null, dialihkan: null, encode: null, metadata: {} };
  return {
    catat,
    access: { deny: (alasan) => { catat.ditolak = alasan; } },
    redirect: {
      encodeToken: (opsi) => { catat.encode = opsi; return 'token-keluar'; },
      sendUserTo: (url, opsi) => { catat.dialihkan = { url, opsi }; },
      validateToken: (opsi) => { catat.validate = opsi; if (payload instanceof Error) throw payload; return payload; },
    },
    user: { setAppMetadata: (kunci, nilai) => { catat.metadata[kunci] = nilai; } },
  };
}

test('login interaktif staging dialihkan ke /verifikasi staging dengan secret staging', async () => {
  const api = buatApi();
  await action.onExecutePostLogin(buatEvent(), api);
  assert.equal(api.catat.ditolak, null);
  assert.equal(api.catat.dialihkan.url, SECRETS.VERIFIKASI_URL_STAGING);
  assert.deepEqual(api.catat.dialihkan.opsi, { query: { session_token: 'token-keluar' } });
  assert.equal(api.catat.encode.secret, 'rahasia-staging');
  assert.equal(api.catat.encode.payload.tujuan, 'sapa-verifikasi');
  assert.ok(api.catat.encode.expiresInSeconds <= 300);
});

test('secret dan alamat produksi terpisah dari staging (syarat Clara sebelum "*")', async () => {
  const api = buatApi();
  await action.onExecutePostLogin(buatEvent({ secrets: { ...SECRETS, CLIENT_DIWAJIBKAN: '*' }, client: { client_id: 'spa-produksi' } }), api);
  assert.equal(api.catat.dialihkan.url, SECRETS.VERIFIKASI_URL_PRODUKSI);
  assert.equal(api.catat.encode.secret, 'rahasia-produksi');
});

test('aplikasi di luar daftar tidak disentuh selama uji staging (W1)', async () => {
  const api = buatApi();
  await action.onExecutePostLogin(buatEvent({ client: { client_id: 'spa-produksi' } }), api);
  assert.equal(api.catat.dialihkan, null);
  assert.equal(api.catat.ditolak, null);
});

test('dengan "*", aplikasi tanpa konfigurasi verifikasi ditolak (gagal tertutup)', async () => {
  const api = buatApi();
  await action.onExecutePostLogin(buatEvent({ secrets: { ...SECRETS, CLIENT_DIWAJIBKAN: '*' }, client: { client_id: 'aplikasi-lain' } }), api);
  assert.ok(api.catat.ditolak);
  assert.equal(api.catat.dialihkan, null);
});

test('sesi yang sudah lulus tidak ditanya lagi, termasuk silent auth', async () => {
  for (const transaction of [{ prompt: [] }, { prompt: ['none'] }]) {
    const api = buatApi();
    await action.onExecutePostLogin(buatEvent({ transaction, user: { user_id: 'auth0|petugas1', app_metadata: { turnstile_sesi: ['STAGING:sesi-1'] } } }), api);
    assert.equal(api.catat.dialihkan, null);
    assert.equal(api.catat.ditolak, null);
  }
});

test('silent auth dari sesi yang belum lulus ditolak, bukan dilewati', async () => {
  // Sesi Auth0 sudah terbentuk walau Turnstile gagal; tanpa penolakan ini prompt=none memberi token.
  for (const ubah of [{ transaction: { prompt: ['none'] } }, { transaction: { prompt: 'none' } }, { transaction: {}, request: { query: { prompt: 'none' } } }]) {
    const api = buatApi();
    await action.onExecutePostLogin(buatEvent(ubah), api);
    assert.equal(api.catat.dialihkan, null);
    assert.ok(api.catat.ditolak);
  }
});

test('konfigurasi tidak lengkap gagal tertutup', async () => {
  const api = buatApi();
  await action.onExecutePostLogin(buatEvent({ secrets: { CLIENT_DIWAJIBKAN: 'spa-staging', STAGING_CLIENT_ID: 'spa-staging' } }), api);
  assert.ok(api.catat.ditolak);
  assert.equal(api.catat.dialihkan, null);
});

test('token balasan sah menandai sesi sebagai lulus, diperiksa dengan secret aplikasinya', async () => {
  const api = buatApi({ sub: 'auth0|petugas1', turnstile: true, state: 's' });
  await action.onContinuePostLogin(buatEvent({ user: { user_id: 'auth0|petugas1', app_metadata: { turnstile_sesi: ['lama'] } } }), api);
  assert.equal(api.catat.ditolak, null);
  assert.equal(api.catat.validate.tokenParameterName, 'sapa_token');
  assert.equal(api.catat.validate.secret, 'rahasia-staging');
  assert.deepEqual(api.catat.metadata.turnstile_sesi, ['lama', 'STAGING:sesi-1']);
});

test('daftar sesi lulus dibatasi 10 terakhir', async () => {
  const lama = Array.from({ length: 12 }, (_, i) => `s${i}`);
  const api = buatApi({ sub: 'auth0|petugas1', turnstile: true });
  await action.onContinuePostLogin(buatEvent({ user: { user_id: 'auth0|petugas1', app_metadata: { turnstile_sesi: lama } } }), api);
  assert.equal(api.catat.metadata.turnstile_sesi.length, 10);
  assert.equal(api.catat.metadata.turnstile_sesi.at(-1), 'STAGING:sesi-1');
});

test('token balasan tidak sah, milik pengguna lain, atau tanpa tanda Turnstile ditolak', async () => {
  for (const payload of [new Error('tanda tangan salah'), { sub: 'auth0|lain', turnstile: true }, { sub: 'auth0|petugas1' }]) {
    const api = buatApi(payload);
    await action.onContinuePostLogin(buatEvent(), api);
    assert.ok(api.catat.ditolak);
    assert.deepEqual(api.catat.metadata, {});
  }
});

test('lulus di staging tidak melewati produksi pada sesi SSO yang sama (temuan Clara)', async () => {
  const user = { user_id: 'auth0|petugas1', app_metadata: { turnstile_sesi: ['STAGING:sesi-1', 'sesi-1'] } };
  for (const transaction of [{ prompt: [] }, { prompt: ['none'] }]) {
    const api = buatApi();
    await action.onExecutePostLogin(buatEvent({ secrets: { ...SECRETS, CLIENT_DIWAJIBKAN: '*' }, client: { client_id: 'spa-produksi' }, transaction, user }), api);
    assert.ok(api.catat.dialihkan || api.catat.ditolak, 'produksi harus menantang ulang');
  }
});
