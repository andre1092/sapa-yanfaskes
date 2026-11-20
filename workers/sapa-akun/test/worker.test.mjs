// Tes Worker sapa-akun: node --test (tanpa dependensi npm). D1 tiruan memakai node:sqlite dan migrasi asli.
// Tanda tangan di tes dibuat dengan node:crypto (createHmac), terpisah dari WebCrypto yang dipakai Worker.
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import worker, { kanonik, tangani } from '../src/index.js';
import { D1Tiruan } from './d1-tiruan.mjs';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const MIGRASI = `${DIR}migrations/0001_akun.sql`;
const VEKTOR = JSON.parse(readFileSync(`${DIR}test/vektor-tanda.json`, 'utf8'));
const KUNCI = Buffer.from('kunci-uji-worker-bukan-rahasia-32').subarray(0, 32).toString('base64');
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2E$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g';
const ID = '00000000-0000-4000-8000-000000000001';
const MAC = 'a'.repeat(64);
const KODE = 'c'.repeat(64);

function baru() {
  return { DB: new D1Tiruan(MIGRASI), SAPA_AKUN_HMAC: KUNCI };
}

function detikSekarang() {
  return Math.floor(Date.now() / 1000);
}

function tandai({ path, body = {}, nonce, waktu = String(detikSekarang()), kunci = KUNCI, metode = 'POST' }) {
  const mentah = typeof body === 'string' ? body : JSON.stringify(body);
  const sidik = createHash('sha256').update(mentah).digest('hex');
  const teks = ['sapa-akun-v1', metode, path, waktu, nonce ?? '', sidik].join('\n');
  const tanda = createHmac('sha256', Buffer.from(kunci, 'base64')).update(teks).digest('hex');
  const headers = { 'content-type': 'application/json', 'x-sapa-waktu': waktu, 'x-sapa-tanda': tanda };
  if (nonce) headers['x-sapa-nonce'] = nonce;
  return { headers, mentah };
}

function permintaan(path, { body = {}, nonce, waktu, kunci, metode = 'POST', ubahBody, url } = {}) {
  const { headers, mentah } = tandai({ path, body, nonce, waktu, kunci, metode });
  const init = { method: metode, headers };
  if (metode !== 'GET') init.body = ubahBody ?? mentah;
  return new Request(url ?? `https://sapa-akun.contoh.invalid${path}`, init);
}

async function kirim(env, path, opsi = {}) {
  const res = await worker.fetch(permintaan(path, opsi), env);
  return { status: res.status, isi: await res.json() };
}

const nonceBaru = () => randomBytes(16).toString('hex');
const akun = (ubah = {}) => ({ id: ID, username: 'admin@contoh.invalid', hash: HASH, versi_sandi: 1,
  peran: 'super_admin', aktif: 1, mac: MAC, ...ubah });

test('vektor bersama: kanonik dan tanda tangan sama dengan Python', async () => {
  const kunci = await crypto.subtle.importKey('raw', Buffer.from(VEKTOR.kunci_base64, 'base64'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  assert.ok(VEKTOR.vektor.length >= 4);
  for (const v of VEKTOR.vektor) {
    const teks = await kanonik(v.metode, v.path, v.waktu, v.nonce, new TextEncoder().encode(v.body));
    assert.equal(teks, v.kanonik);
    const tanda = Buffer.from(await crypto.subtle.sign('HMAC', kunci, new TextEncoder().encode(teks))).toString('hex');
    assert.equal(tanda, v.tanda);
  }
});

test('path atau metode tak dikenal, dan query string, 404 tanpa menyentuh D1', async () => {
  const env = baru();
  for (const [path, opsi] of [['/akun/hapus', {}], ['/sql', { body: { sql: 'DROP TABLE akun_sapa' } }],
    ['/akun/jumlah', { metode: 'GET' }], ['/akun/jumlah', { metode: 'PUT' }],
    ['/akun/jumlah', { url: 'https://sapa-akun.contoh.invalid/akun/jumlah?x=1' }]]) {
    const { status, isi } = await kirim(env, path, opsi);
    assert.equal(status, 404, path);
    assert.deepEqual(isi, { galat: 'tidak_ada' });
  }
  assert.equal(env.DB.dipakai, 0);
});

test('tanpa tanda tangan, tanda salah, kunci lain, atau body diubah: 401 tanpa rincian dan tanpa D1', async () => {
  const env = baru();
  const tanpa = await worker.fetch(new Request('https://sapa-akun.contoh.invalid/akun/jumlah', { method: 'POST', body: '{}' }), env);
  assert.equal(tanpa.status, 401);
  const lain = Buffer.alloc(32, 7).toString('base64');
  for (const opsi of [{ kunci: lain }, { ubahBody: '{"username":"x"}' }, { waktu: '17636000ab' }]) {
    const { status, isi } = await kirim(env, '/akun/jumlah', opsi);
    assert.equal(status, 401);
    assert.deepEqual(isi, { galat: 'tidak_sah' });
  }
  assert.equal(env.DB.dipakai, 0);
});

test('HMAC diverifikasi sebelum D1 disentuh (D1 yang meledak tidak pernah dipanggil)', async () => {
  const env = { SAPA_AKUN_HMAC: KUNCI, DB: new Proxy({}, { get() { throw new Error('D1 disentuh'); } }) };
  const { status } = await kirim(env, '/akun/ambil-username', { body: { username: 'x' }, kunci: Buffer.alloc(32, 1).toString('base64') });
  assert.equal(status, 401);
});

test('jendela waktu: tulis 60 detik, baca 15 detik', async () => {
  const env = baru();
  const lalu = (d) => String(detikSekarang() - d);
  assert.equal((await kirim(env, '/akun/jumlah', { waktu: lalu(10) })).status, 200);
  assert.equal((await kirim(env, '/akun/jumlah', { waktu: lalu(20) })).status, 401);
  assert.equal((await kirim(env, '/akun/jumlah', { waktu: String(detikSekarang() + 20) })).status, 401);
  const tulis = (d) => kirim(env, '/akun/ganti-hash', { nonce: nonceBaru(), waktu: lalu(d),
    body: { id: ID, versi_lama: 1, versi_baru: 2, hash: HASH, mac: MAC, hash_kode: null, jenis: null } });
  assert.equal((await tulis(50)).status, 200);
  assert.equal((await tulis(70)).status, 401);
});

test('operasi tulis wajib nonce; baca menolak nonce', async () => {
  const env = baru();
  const body = { akun: akun(), hash_kode: KODE };
  assert.equal((await kirim(env, '/akun/sisip-pertama', { body })).status, 401);
  assert.equal((await kirim(env, '/akun/jumlah', { nonce: nonceBaru() })).status, 401);
  assert.equal(env.DB.baris('SELECT * FROM akun_sapa').length, 0);
});

test('nonce ganda pada operasi tulis ditolak dan operasinya tidak dijalankan', async () => {
  const env = baru();
  const nonce = nonceBaru();
  const pertama = await kirim(env, '/akun/sisip-pertama', { nonce, body: { akun: akun(), hash_kode: KODE } });
  assert.deepEqual(pertama, { status: 200, isi: { ok: true } });
  env.DB.sqlite.exec('DELETE FROM akun_sapa; DELETE FROM kode_terpakai');
  const ulang = await kirim(env, '/akun/sisip-pertama', { nonce, body: { akun: akun(), hash_kode: 'd'.repeat(64) } });
  assert.equal(ulang.status, 401);
  assert.equal(env.DB.baris('SELECT * FROM akun_sapa').length, 0);
});

test('nonce kedaluwarsa dibersihkan di batch tulis yang sama', async () => {
  const env = baru();
  env.DB.sqlite.exec(`INSERT INTO nonce_terpakai (nonce, kedaluwarsa) VALUES ('${'e'.repeat(32)}', 1)`);
  await kirim(env, '/akun/ganti-hash', { nonce: nonceBaru(),
    body: { id: ID, versi_lama: 1, versi_baru: 2, hash: HASH, mac: MAC, hash_kode: null, jenis: null } });
  const sisa = env.DB.baris('SELECT nonce, kedaluwarsa FROM nonce_terpakai');
  assert.equal(sisa.length, 1);
  assert.ok(sisa[0].kedaluwarsa > detikSekarang() + 100);
});

test('sisip-pertama hanya bila tabel kosong, sekaligus menandai kode penyiapan', async () => {
  const env = baru();
  const satu = await kirim(env, '/akun/sisip-pertama', { nonce: nonceBaru(), body: { akun: akun(), hash_kode: KODE } });
  assert.deepEqual(satu.isi, { ok: true });
  const dua = await kirim(env, '/akun/sisip-pertama', { nonce: nonceBaru(),
    body: { akun: akun({ id: '00000000-0000-4000-8000-000000000002', username: 'kedua@contoh.invalid' }), hash_kode: 'f'.repeat(64) } });
  assert.deepEqual(dua.isi, { ok: false });
  assert.equal(env.DB.baris('SELECT * FROM akun_sapa').length, 1);
  // Kode kedua tidak ditandai karena tidak ada akun yang dibuat.
  assert.deepEqual(env.DB.baris('SELECT hash_kode, jenis FROM kode_terpakai').map((b) => ({ ...b })),
    [{ hash_kode: KODE, jenis: 'penyiapan' }]);
  // Kode yang sudah terpakai tidak bisa dipakai lagi walau tabel dikosongkan.
  env.DB.sqlite.exec('DELETE FROM akun_sapa');
  const ulang = await kirim(env, '/akun/sisip-pertama', { nonce: nonceBaru(), body: { akun: akun(), hash_kode: KODE } });
  assert.equal(ulang.status, 409);
  assert.equal(env.DB.baris('SELECT * FROM akun_sapa').length, 0);
});

test('dua sisip-pertama serentak: hanya satu yang berhasil', async () => {
  const env = baru();
  const hasil = await Promise.all([1, 2].map((i) => kirim(env, '/akun/sisip-pertama', { nonce: nonceBaru(),
    body: { akun: akun({ id: `00000000-0000-4000-8000-00000000000${i}`, username: `u${i}@contoh.invalid` }),
      hash_kode: String(i).repeat(64) } })));
  assert.deepEqual(hasil.map((h) => h.isi.ok).sort(), [false, true]);
  assert.equal(env.DB.baris('SELECT * FROM akun_sapa').length, 1);
});

test('ganti-hash bersyarat versi lama; pemulihan menandai kode sekali pakai', async () => {
  const env = baru();
  await kirim(env, '/akun/sisip-pertama', { nonce: nonceBaru(), body: { akun: akun(), hash_kode: KODE } });
  const ganti = (body) => kirim(env, '/akun/ganti-hash', { nonce: nonceBaru(), body });
  const dasar = { id: ID, hash: HASH.replace('aGFz', 'Z2Fu'), mac: 'b'.repeat(64) };
  assert.deepEqual((await ganti({ ...dasar, versi_lama: 5, versi_baru: 6, hash_kode: null, jenis: null })).isi, { ok: false });
  assert.equal((await ganti({ ...dasar, versi_lama: 1, versi_baru: 3, hash_kode: null, jenis: null })).status, 400);
  const pulih = { ...dasar, versi_lama: 1, versi_baru: 2, hash_kode: '9'.repeat(64), jenis: 'pemulihan' };
  assert.deepEqual((await ganti(pulih)).isi, { ok: true });
  const [baris] = env.DB.baris('SELECT versi_sandi, mac FROM akun_sapa');
  assert.deepEqual({ ...baris }, { versi_sandi: 2, mac: 'b'.repeat(64) });
  // Kode pemulihan yang sama ditolak walau versi cocok.
  assert.equal((await ganti({ ...pulih, versi_lama: 2, versi_baru: 3 })).status, 409);
  // Kode untuk akun/versi yang tidak ada tidak ditandai terpakai.
  assert.deepEqual((await ganti({ ...pulih, hash_kode: '8'.repeat(64), versi_lama: 7, versi_baru: 8 })).isi, { ok: false });
  assert.equal(env.DB.baris("SELECT * FROM kode_terpakai WHERE hash_kode = ?", '8'.repeat(64)).length, 0);
});

test('baca: ambil memuat hash hanya untuk verifikasi, jumlah dan kode tanpa hash', async () => {
  const env = baru();
  await kirim(env, '/akun/sisip-pertama', { nonce: nonceBaru(), body: { akun: akun(), hash_kode: KODE } });
  const ambil = await kirim(env, '/akun/ambil-username', { body: { username: 'admin@contoh.invalid' } });
  assert.deepEqual(ambil.isi, { akun: akun() });
  assert.deepEqual((await kirim(env, '/akun/ambil-id', { body: { id: ID } })).isi, { akun: akun() });
  assert.deepEqual((await kirim(env, '/akun/ambil-username', { body: { username: 'tidak.ada' } })).isi, { akun: null });
  const jumlah = await kirim(env, '/akun/jumlah');
  assert.deepEqual(jumlah.isi, { jumlah: 1 });
  assert.deepEqual((await kirim(env, '/kode/terpakai', { body: { hash_kode: KODE } })).isi, { terpakai: true });
  assert.deepEqual((await kirim(env, '/kode/terpakai', { body: { hash_kode: '0'.repeat(64) } })).isi, { terpakai: false });
});

test('isian tidak sah 400 (field asing, peran asing, hash bukan argon2id)', async () => {
  const env = baru();
  for (const [path, body, nonce] of [
    ['/akun/jumlah', { lain: 1 }],
    ['/akun/ambil-username', { username: 'x', sql: '1' }],
    ['/akun/sisip-pertama', { akun: akun({ peran: 'pemilik' }), hash_kode: KODE }, nonceBaru()],
    ['/akun/sisip-pertama', { akun: akun({ hash: 'md5$abc' }), hash_kode: KODE }, nonceBaru()],
    ['/akun/sisip-pertama', { akun: akun({ username: 'Besar@Contoh' }), hash_kode: KODE }, nonceBaru()],
    ['/akun/jumlah', '[]'],
  ]) {
    assert.equal((await kirim(env, path, { body, nonce })).status, 400, path);
  }
});

test('secret Worker belum dipasang: 503, gagal tertutup', async () => {
  const env = { DB: new D1Tiruan(MIGRASI) };
  assert.equal((await kirim(env, '/akun/jumlah')).status, 503);
});

test('log hanya metadata: tanpa body, hash, username, kode, atau tanda tangan', async (t) => {
  const tercatat = [];
  t.mock.method(console, 'log', (...a) => tercatat.push(a.join(' ')));
  t.mock.method(console, 'error', (...a) => tercatat.push(a.join(' ')));
  const env = baru();
  const { headers } = tandai({ path: '/akun/sisip-pertama', body: { akun: akun(), hash_kode: KODE }, nonce: '1'.repeat(32) });
  await kirim(env, '/akun/sisip-pertama', { nonce: '1'.repeat(32), body: { akun: akun(), hash_kode: KODE } });
  await kirim(env, '/akun/ambil-username', { body: { username: 'admin@contoh.invalid' } });
  await kirim(env, '/rahasia/admin@contoh.invalid', {});
  assert.equal(tercatat.length, 3);
  for (const baris of tercatat) {
    const isi = JSON.parse(baris);
    assert.deepEqual(Object.keys(isi).sort(), ['durasi_ms', 'path', 'status']);
    for (const terlarang of ['admin@contoh', HASH, KODE, MAC, headers['x-sapa-tanda'], '1'.repeat(32)]) {
      assert.ok(!baris.includes(terlarang), terlarang);
    }
  }
  assert.equal(JSON.parse(tercatat[2]).path, 'lain');
});

test('tangani() dengan jam yang disuntikkan', async () => {
  const env = baru();
  const waktu = '1763600000';
  const res = await tangani(permintaan('/akun/jumlah', { waktu }), env, () => 1763600005);
  assert.equal(res.status, 200);
  await assert.rejects(tangani(permintaan('/akun/jumlah', { waktu }), env, () => 1763600020), { status: 401 });
});
