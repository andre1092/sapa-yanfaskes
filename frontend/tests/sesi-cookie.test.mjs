import assert from 'node:assert/strict';
import { test } from 'node:test';
import { muat } from './muat-modul.mjs';

// Penyedia sesi cookie (mode bff), pembaca mode login, dan pilihan layar. Semua jawaban server di sini palsu.
globalThis.window = { location: { origin: 'https://sapa.example', pathname: '/login', search: '', hash: '' } };

const { buatSesiCookie } = await muat('auth/intiSesiCookie.ts');
const { buatPembacaMode } = await muat('auth/pembacaMode.ts');
const { perluAlamatMasuk, pilihTampilan } = await muat('auth/tampilanSesi.ts');
const { alamatHalamanMasuk } = await muat('lib/halamanAwal.ts');
const sesi = await muat('auth/session.ts');
const { useAuthStore } = await muat('store/authStore.ts');

const tunggu = async () => { for (let i = 0; i < 5; i += 1) await new Promise(r => setImmediate(r)); };

/** fetch palsu yang menahan setiap permintaan sampai tes menjawabnya. */
function fetchAntre() {
  const antre = [];
  globalThis.fetch = (url, opsi = {}) => new Promise((ok, gagal) => {
    antre.push({
      url, method: opsi.method || 'GET',
      jawab: (status, isi) => ok(new Response(JSON.stringify(isi), { status, headers: { 'Content-Type': 'application/json' } })),
      putus: () => gagal(new TypeError('jaringan')),
    });
  });
  return antre;
}
const ambilBerikut = (antre, url) => {
  const i = antre.findIndex(p => p.url === url);
  assert.notEqual(i, -1, `ada permintaan ke ${url}`);
  return antre.splice(i, 1)[0];
};

function lingkunganPalsu() {
  const catatan = { sinkron: [], bersih: 0, keMasuk: 0, dikirim: [], ditutup: 0, terima: null };
  return {
    catatan,
    ling: {
      sinkronkan: user => { catatan.sinkron.push(user); useAuthStore.getState().syncSession(user); },
      bersihkanCache: () => { catatan.bersih += 1; },
      keHalamanMasuk: () => { catatan.keMasuk += 1; },
      bukaKanal: terima => { catatan.terima = terima; return { kirim: p => catatan.dikirim.push(p), tutup: () => { catatan.ditutup += 1; } }; },
    },
  };
}

const MASUK = { masuk: true, peran: 'petugas_rs', nama: 'Petugas Uji' };
const GAGAL_KELUAR = { kode: 'belum_siap', pesan: 'Sesi belum dapat diakhiri. Coba lagi.' };

/** Konteks yang dibaca App dari keadaan inti, seperti SesiCookie menyusunnya. */
const konteks = k => ({ ready: k.ready, authenticated: Boolean(k.user), mode: 'bff', keluar: k.keluar });

async function sesiMasuk() {
  sesi.aturModeSesi('bff');
  const antre = fetchAntre();
  const { ling, catatan } = lingkunganPalsu();
  const inti = buatSesiCookie(ling);
  const berhenti = inti.mulai();
  ambilBerikut(antre, '/api/v1/auth/sesi').jawab(200, MASUK);
  await tunggu();
  assert.equal(inti.ambil().user?.role, 'Petugas RS');
  return { antre, catatan, inti, berhenti };
}

test('keluar gagal (503): sesi, pengendali keluar, dan proyeksi tetap ada; form masuk tidak tampil', async () => {
  const { antre, catatan, inti, berhenti } = await sesiMasuk();
  useAuthStore.getState().logoutUser();
  // Selama menunggu server: dasbor disembunyikan, tetapi halaman masuk belum tampil.
  assert.equal(inti.ambil().keluar.menunggu, true);
  assert.equal(useAuthStore.getState().isAuthenticated, true);
  assert.equal(pilihTampilan(konteks(inti.ambil()), true), 'keluar');

  const p = ambilBerikut(antre, '/api/v1/auth/keluar');
  assert.equal(p.method, 'POST');
  p.jawab(503, GAGAL_KELUAR);
  await tunggu();
  const k = inti.ambil();
  assert.deepEqual(k.keluar, { menunggu: false, galat: 'Sesi belum dapat diakhiri. Coba lagi.' });
  assert.ok(k.user, 'pengguna tidak dikosongkan');
  assert.equal(useAuthStore.getState().isAuthenticated, true);
  assert.equal(pilihTampilan(konteks(k), useAuthStore.getState().isAuthenticated), 'keluar', 'bukan form masuk');
  assert.equal(catatan.keMasuk, 0);
  assert.deepEqual(catatan.dikirim, [], 'tab lain tidak diberi tahu');
  await sesi.pastikanSesi();

  // Coba keluar lagi: pengendali masih terdaftar dan memanggil /keluar sekali lagi.
  sesi.logoutSession();
  assert.equal(inti.ambil().keluar.menunggu, true);
  ambilBerikut(antre, '/api/v1/auth/keluar').jawab(200, { keluar: true });
  await tunggu();
  assert.equal(catatan.keMasuk, 1, 'berhasil: muat ulang penuh ke /login');
  assert.deepEqual(catatan.dikirim, ['keluar']);
  assert.ok(catatan.bersih >= 2, 'cache kueri dikosongkan setelah keluar');
  berhenti();
});

test('keluar gagal karena jaringan juga mempertahankan sesi; tombol tutup kembali ke dasbor', async () => {
  const { antre, inti, berhenti } = await sesiMasuk();
  sesi.logoutSession();
  sesi.logoutSession();
  ambilBerikut(antre, '/api/v1/auth/keluar').putus();
  assert.equal(antre.filter(p => p.url === '/api/v1/auth/keluar').length, 0, 'klik ganda tidak mengirim dua kali');
  await tunggu();
  assert.match(inti.ambil().keluar.galat, /Tidak dapat terhubung ke server SAPA/);
  inti.tutupGalatKeluar();
  assert.equal(pilihTampilan(konteks(inti.ambil()), true), 'dasbor');
  await sesi.pastikanSesi();
  berhenti();
  await assert.rejects(sesi.pastikanSesi(), 'pengendali dilepas saat penyedia dilepas');
});

test('jawaban /sesi awal yang lambat tidak menimpa sesi baru setelah login', async () => {
  sesi.aturModeSesi('bff');
  const antre = fetchAntre();
  const { ling } = lingkunganPalsu();
  const inti = buatSesiCookie(ling);
  const berhenti = inti.mulai();
  const awal = ambilBerikut(antre, '/api/v1/auth/sesi');
  // Pengguna masuk lewat form sementara pembacaan awal belum dijawab.
  const dimuat = inti.muatUlang();
  ambilBerikut(antre, '/api/v1/auth/sesi').jawab(200, MASUK);
  assert.equal(await dimuat, true);
  awal.jawab(200, { masuk: false });
  await tunggu();
  assert.ok(inti.ambil().user, 'sesi tetap masuk');
  assert.equal(useAuthStore.getState().isAuthenticated, true);
  berhenti();
});

test('cache kueri dikosongkan setiap kali pengguna sesi berganti', async () => {
  sesi.aturModeSesi('bff');
  const antre = fetchAntre();
  const { ling, catatan } = lingkunganPalsu();
  const inti = buatSesiCookie(ling);
  const berhenti = inti.mulai();
  ambilBerikut(antre, '/api/v1/auth/sesi').jawab(200, { masuk: false });
  await tunggu();
  assert.equal(catatan.bersih, 0, 'belum masuk lalu tetap belum masuk');
  for (const [isi, bersih] of [[MASUK, 1], [MASUK, 1], [{ ...MASUK, peran: 'admin' }, 2], [{ masuk: false }, 3]]) {
    const dimuat = inti.muatUlang();
    ambilBerikut(antre, '/api/v1/auth/sesi').jawab(200, isi);
    await dimuat;
    assert.equal(catatan.bersih, bersih, JSON.stringify(isi));
  }
  berhenti();
});

test('/sesi 503: belum masuk dengan pesan galat, tanpa pengendali keluar', async () => {
  sesi.aturModeSesi('bff');
  const antre = fetchAntre();
  const { ling } = lingkunganPalsu();
  const inti = buatSesiCookie(ling);
  const berhenti = inti.mulai();
  assert.equal(inti.ambil().ready, false);
  ambilBerikut(antre, '/api/v1/auth/sesi').jawab(503, { kode: 'belum_siap', detail: 'Layanan masuk sedang tidak tersedia.' });
  await tunggu();
  const k = inti.ambil();
  assert.equal(k.ready, true);
  assert.equal(k.user, null);
  assert.equal(k.error, 'Layanan masuk sedang tidak tersedia.');
  await assert.rejects(sesi.pastikanSesi());
  berhenti();
});

test('keluar di tab lain membawa tab ini ke /login hanya bila tab ini sedang masuk', async () => {
  const { catatan, berhenti } = await sesiMasuk();
  catatan.terima('lain');
  assert.equal(catatan.keMasuk, 0);
  catatan.terima('keluar');
  assert.equal(catatan.keMasuk, 1);
  berhenti();
  assert.equal(catatan.ditutup, 1, 'kanal ditutup saat penyedia dilepas');

  const sepi = lingkunganPalsu();
  fetchAntre();
  const lain = buatSesiCookie(sepi.ling);
  const stop = lain.mulai();
  sepi.catatan.terima('keluar');
  assert.equal(sepi.catatan.keMasuk, 0, 'tab yang belum masuk tidak dimuat ulang');
  stop();
});

test('mode lama: logoutUser tetap langsung mengosongkan proyeksi', () => {
  sesi.aturModeSesi('auth0');
  let keluar = 0;
  const lepas = sesi.registerAuthSession(async () => 'token-palsu', () => { keluar += 1; });
  useAuthStore.getState().syncSession({ id: 'u', sub: 'u', username: 'u', name: 'U', email: '', role: 'viewer' });
  useAuthStore.getState().logoutUser();
  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.equal(keluar, 1);
  lepas();
  sesi.aturModeSesi(null);
});

test('mode login: gagal dibaca menjadi galat, Coba lagi membaca ulang, jawaban lama dibuang', async () => {
  const jawaban = [];
  const baca = () => new Promise((ok, gagal) => jawaban.push({ ok, gagal }));
  const pembaca = buatPembacaMode(baca);
  let perubahan = 0;
  pembaca.langganan(() => { perubahan += 1; });
  assert.equal(pembaca.ambil(), 'memeriksa');
  pembaca.muat();
  jawaban.shift().gagal(new Error('mode'));
  await tunggu();
  assert.equal(pembaca.ambil(), 'galat');
  assert.equal(sesi.modeSesi(), null, 'mode tidak ditebak');

  pembaca.muat();
  assert.equal(pembaca.ambil(), 'memeriksa');
  const lama = jawaban.shift();
  pembaca.muat();
  jawaban.shift().ok('bff');
  await tunggu();
  lama.ok('auth0');
  await tunggu();
  assert.equal(pembaca.ambil(), 'bff');
  assert.equal(sesi.modeSesi(), 'bff');
  assert.ok(perubahan >= 3);

  // Pembacaan yang dibatalkan (penyedia dilepas) tidak mengubah mode.
  const lain = buatPembacaMode(baca);
  const batal = lain.muat();
  batal();
  jawaban.shift().gagal(new Error('mode'));
  await tunggu();
  assert.equal(lain.ambil(), 'memeriksa');
  sesi.aturModeSesi(null);
});

test('mode login gagal dibaca di kembalian layanan masuk lama: ?code&state tidak dibuang', () => {
  const galat = { ready: true, authenticated: false, mode: 'galat' };
  assert.equal(perluAlamatMasuk(galat, false), false, '/?code=x&state=y dibiarkan');
  assert.equal(pilihTampilan(galat, false), 'masuk', 'layar Coba lagi tetap tampil');
  // Sesudah mode terbaca dan SDK selesai memproses kembalian, alamat baru dibawa ke /login.
  const lama = { ready: true, authenticated: false, mode: 'auth0' };
  assert.equal(perluAlamatMasuk(lama, false), true);
  assert.equal(alamatHalamanMasuk('/?code=x&state=y'), '/login');
  assert.equal(perluAlamatMasuk({ ready: false, authenticated: false, mode: 'memeriksa' }, false), false);
  assert.equal(perluAlamatMasuk({ ready: false, authenticated: false, mode: 'bff' }, false), false);
});

test('pilihan layar: keluar yang belum selesai tidak menampilkan dasbor maupun form masuk', () => {
  const masuk = { ready: true, authenticated: true, mode: 'bff' };
  assert.equal(pilihTampilan(masuk, true), 'dasbor');
  assert.equal(pilihTampilan({ ...masuk, keluar: { menunggu: false, galat: null } }, true), 'dasbor');
  assert.equal(pilihTampilan({ ...masuk, keluar: { menunggu: true, galat: null } }, true), 'keluar');
  assert.equal(pilihTampilan({ ...masuk, keluar: { menunggu: false, galat: 'gagal' } }, true), 'keluar');
  assert.equal(perluAlamatMasuk({ ...masuk, keluar: { menunggu: false, galat: 'gagal' } }, true), false, 'alamat tidak diubah ke /login');
  assert.equal(pilihTampilan(masuk, false), 'masuk');
  assert.equal(pilihTampilan({ ...masuk, ready: false }, true), 'masuk');
});
