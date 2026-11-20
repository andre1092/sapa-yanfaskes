import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { muat } from './muat-modul.mjs';

// Akun lokal (mode bff): halaman Siapkan akun, Ubah password, dan menu yang bergantung mode.
// Semua nilai di sini palsu dan hanya untuk tes.
globalThis.__VITE_ENV__ = { VITE_TURNSTILE_SITE_KEY: 'kunci-situs-uji' };
const lokasi = { origin: 'https://sapa.example', pathname: '/siapkan-akun', search: '', hash: '' };
globalThis.window = {
  location: lokasi,
  history: { state: null, replaceState() {}, pushState() {} },
  innerWidth: 1280,
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
};

const { renderToString } = await import('react-dom/server');
const { createElement: h } = await import('react');
const akun = await muat('auth/akunLokal.ts');
const { FormSiapkanAkun, TampilanSiapkanAkun } = await muat('components/HalamanSiapkanAkun.tsx');
const { PengaturanAkun } = await muat('components/PengaturanAkun.tsx');
const { Context } = await muat('auth/useSession.ts');
const fitur = await muat('lib/fiturMode.ts');
const { diHalamanSiapkanAkun } = await muat('lib/halamanAwal.ts');

const KODE_PALSU = 'kode-penyiapan-palsu';
const SANDI_LAMA_PALSU = 'sandi-lama-palsu-uji';
const SANDI_BARU_PALSU = 'frasa-sandi-baru-palsu-uji';
const sumber = jalur => readFile(new URL(`../src/${jalur}`, import.meta.url), 'utf8');

function nilaiSesi(ubah = {}) {
  return { ready: true, authenticated: true, configured: true, error: null, login: async () => {}, mode: 'bff', muatUlang: async () => true, profil: null, ...ubah };
}
function render(elemen, ubah) {
  return renderToString(h(Context.Provider, { value: nilaiSesi(ubah) }, elemen))
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}
const tag = (html, nama) => [...html.matchAll(new RegExp(`<${nama}\\b[^>]*>`, 'g'))].map(m => m[0]);
const teksTombol = html => [...html.matchAll(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());

function fetchPalsu(jawaban) {
  const panggilan = [];
  globalThis.fetch = async (url, opsi = {}) => {
    panggilan.push({ url, ...opsi, body: opsi.body === undefined ? undefined : JSON.parse(opsi.body) });
    if (jawaban instanceof Error) throw jawaban;
    const { status = 200, isi = {} } = typeof jawaban === 'function' ? jawaban(url) : jawaban;
    return new Response(JSON.stringify(isi), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return panggilan;
}
function widgetPalsu() {
  const w = { jumlahReset: 0, reset() { w.jumlahReset += 1; } };
  return w;
}
function kendaliSiapkanPalsu() {
  const log = [];
  return {
    log,
    kosongkanRahasia: () => log.push('kosongkan'),
    sembunyikanKode: () => log.push('sembunyikan'),
    buangToken: () => log.push('buang-token'),
    tampilkanGalat: pesan => log.push(['galat', pesan]),
    fokusKode: () => log.push('fokus-kode'),
    berhasil: () => log.push('berhasil'),
  };
}
function kendaliUbahPalsu() {
  const log = [];
  return {
    log,
    kosongkanSandi: () => log.push('kosongkan'),
    tampilkanGalat: pesan => log.push(['galat', pesan]),
    tampilkanBerhasil: pesan => log.push(['berhasil', pesan]),
    fokusSandiLama: () => log.push('fokus-lama'),
  };
}
const isianSiapkan = { username: 'admin@contoh.invalid', kode: KODE_PALSU, passwordBaru: SANDI_BARU_PALSU, token: 'token-turnstile-palsu' };

// ---------------------------------------------------------------- Siapkan akun: ketersediaan

test('siapkan akun: 404 dari server berarti halaman tidak ada, tanpa form', async () => {
  const p = fetchPalsu({ status: 404, isi: { detail: 'Not Found' } });
  const keadaan = await akun.bacaSiapkanAkun();
  assert.deepEqual(keadaan, { status: 'tidak_ada' });
  assert.equal(p.length, 1);
  assert.equal(p[0].url, '/api/v1/auth/siapkan-akun');
  assert.equal(p[0].method ?? 'GET', 'GET');
  assert.equal(p[0].credentials, 'same-origin');

  const html = render(h(TampilanSiapkanAkun, { keadaan, cobaLagi() {} }), { authenticated: false });
  assert.equal(tag(html, 'form').length, 0, 'tidak ada form');
  assert.equal(tag(html, 'input').length, 0, 'tidak ada isian');
  assert.match(html, />Halaman tidak ditemukan</);
  assert.doesNotMatch(html, /data-turnstile-aksi/);
  const tautan = tag(html, 'a');
  assert.equal(tautan.length, 1);
  assert.match(tautan[0], /href="\/login"/);
});

test('siapkan akun: selain 200 dengan tersedia=true, halaman tetap tidak ada', async () => {
  for (const jawaban of [{ status: 500, isi: {} }, { status: 503, isi: { kode: 'belum_siap', pesan: 'x' } }, { status: 200, isi: { tersedia: false } }, { status: 200, isi: [] }]) {
    fetchPalsu(jawaban);
    assert.deepEqual(await akun.bacaSiapkanAkun(), { status: 'tidak_ada' }, JSON.stringify(jawaban));
  }
  // Server tak terjangkau: pesan jaringan dan tombol coba lagi, bukan form.
  fetchPalsu(new TypeError('gagal'));
  const keadaan = await akun.bacaSiapkanAkun();
  assert.equal(keadaan.status, 'galat');
  const html = render(h(TampilanSiapkanAkun, { keadaan, cobaLagi() {} }));
  assert.equal(tag(html, 'form').length, 0);
  assert.deepEqual(teksTombol(html), ['Coba lagi']);
});

test('siapkan akun: 200 menampilkan satu form lengkap dengan Turnstile action sapa_siapkan_akun', async () => {
  fetchPalsu({ status: 200, isi: { tersedia: true, jenis: 'penyiapan' } });
  const keadaan = await akun.bacaSiapkanAkun();
  assert.deepEqual(keadaan, { status: 'tersedia', jenis: 'penyiapan' });

  const html = render(h(TampilanSiapkanAkun, { keadaan, cobaLagi() {} }), { authenticated: false });
  assert.match(html, />Siapkan akun</);
  const form = tag(html, 'form');
  assert.equal(form.length, 1);
  assert.match(form[0], /method="post"/);

  const input = tag(html, 'input');
  assert.equal(input.length, 4, 'username, kode, sandi baru, ulangi sandi baru');
  assert.match(input[0], /name="username"/);
  assert.match(input[0], /autoComplete="username"/);
  assert.match(input[1], /name="kode"/);
  assert.match(input[1], /type="password"/, 'kode tersamar secara bawaan');
  assert.match(input[2], /name="password_baru"/);
  assert.match(input[2], /type="password"/);
  assert.match(input[2], /autoComplete="new-password"/);
  assert.match(input[3], /name="ulangi_password_baru"/);
  assert.match(input[3], /type="password"/);
  assert.match(html, />Kode penyiapan</);
  assert.match(html, />Sandi baru</);
  assert.match(html, />Ulangi sandi baru</);
  assert.match(html, /Minimal 15 karakter/);

  const widget = tag(html, 'div').filter(t => t.includes('data-turnstile-aksi'));
  assert.equal(widget.length, 1);
  assert.match(widget[0], /data-turnstile-aksi="sapa_siapkan_akun"/);
  assert.equal(akun.AKSI_SIAPKAN_AKUN, 'sapa_siapkan_akun');

  const tombol = teksTombol(html);
  assert.ok(tombol.includes('Simpan'));
  const [lihat] = tag(html, 'button');
  assert.match(lihat, /aria-label="Tampilkan kode"/);
  const simpan = tag(html, 'button').find(t => /type="submit"/.test(t));
  assert.match(simpan, /disabled/, 'Simpan nonaktif sebelum isian lengkap dan Turnstile lulus');
});

test('siapkan akun: jenis pemulihan memakai judul dan label kode pemulihan', async () => {
  fetchPalsu({ status: 200, isi: { tersedia: true, jenis: 'pemulihan' } });
  const keadaan = await akun.bacaSiapkanAkun();
  assert.deepEqual(keadaan, { status: 'tersedia', jenis: 'pemulihan' });
  const html = render(h(FormSiapkanAkun, { jenis: 'pemulihan' }));
  assert.match(html, />Pulihkan akun</);
  assert.match(html, />Kode pemulihan</);
});

// ---------------------------------------------------------------- Siapkan akun: kirim

test('siapkan akun: POST JSON persis ke /api/v1/auth/siapkan-akun dengan X-SAPA; berhasil tanpa reset widget', async () => {
  const p = fetchPalsu({ status: 201, isi: { siap: true } });
  const widget = widgetPalsu();
  const kendali = kendaliSiapkanPalsu();
  assert.equal(await akun.kirimSiapkanAkun(isianSiapkan, widget, kendali), true);

  assert.equal(p.length, 1);
  assert.equal(p[0].url, '/api/v1/auth/siapkan-akun');
  assert.equal(p[0].method, 'POST');
  assert.equal(p[0].credentials, 'same-origin');
  assert.equal(p[0].headers['X-SAPA'], '1');
  assert.equal(p[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(p[0].body, { username: 'admin@contoh.invalid', kode: KODE_PALSU, password_baru: SANDI_BARU_PALSU, turnstile_token: 'token-turnstile-palsu' });
  assert.deepEqual(Object.keys(p[0].body).sort(), ['kode', 'password_baru', 'turnstile_token', 'username']);

  assert.equal(widget.jumlahReset, 0);
  assert.deepEqual(kendali.log, ['kosongkan', 'sembunyikan', 'berhasil']);
});

test('siapkan akun: gagal menampilkan pesan server, mengosongkan kode dan sandi, dan menyetel ulang widget', async () => {
  for (const [status, isi] of [
    [403, { kode: 'kode_salah', pesan: 'Pesan kode dari server.' }],
    [400, { kode: 'sandi_bocor', pesan: 'Pesan sandi bocor dari server.' }],
    [429, { kode: 'terlalu_banyak', pesan: 'Pesan batas dari server.' }],
    [503, { kode: 'hibp_tidak_tersedia', pesan: 'Pesan pemeriksaan dari server.' }],
  ]) {
    fetchPalsu({ status, isi });
    const widget = widgetPalsu();
    const kendali = kendaliSiapkanPalsu();
    assert.equal(await akun.kirimSiapkanAkun(isianSiapkan, widget, kendali), false);
    assert.equal(widget.jumlahReset, 1, `reset widget untuk ${status}`);
    assert.deepEqual(kendali.log, ['kosongkan', 'sembunyikan', 'buang-token', ['galat', isi.pesan], 'fokus-kode']);
  }
});

test('siapkan akun: tanpa teks server, kode galat memakai pesan cadangan yang jelas', async () => {
  fetchPalsu({ status: 503, isi: { kode: 'hibp_tidak_tersedia' } });
  let hasil = await akun.ajukanSiapkanAkun(isianSiapkan, widgetPalsu());
  assert.equal(hasil.pesan, 'Pemeriksaan keamanan sandi sedang tidak tersedia. Coba lagi beberapa saat lagi.');

  fetchPalsu({ status: 404, isi: {} });
  hasil = await akun.ajukanSiapkanAkun(isianSiapkan, widgetPalsu());
  assert.equal(hasil.ok, false);

  // 2xx tanpa siap=true tidak dianggap berhasil.
  const widget = widgetPalsu();
  fetchPalsu({ status: 200, isi: {} });
  hasil = await akun.ajukanSiapkanAkun(isianSiapkan, widget);
  assert.equal(hasil.ok, false);
  assert.equal(widget.jumlahReset, 1);

  fetchPalsu(new TypeError('gagal'));
  hasil = await akun.ajukanSiapkanAkun(isianSiapkan, widgetPalsu());
  assert.equal(hasil.status, 0);
  assert.match(hasil.pesan, /Tidak dapat terhubung/);
});

test('siapkan akun: kiriman ganda selama kiriman pertama berjalan diabaikan', async () => {
  let lepas;
  const p = [];
  globalThis.fetch = (url, opsi) => { p.push(url); return new Promise(r => { lepas = () => r(new Response(JSON.stringify({ siap: true }), { status: 201 })); }); };
  const pengirim = akun.buatPengirimTunggal(akun.kirimSiapkanAkun);
  const pertama = pengirim.kirim(isianSiapkan, widgetPalsu(), kendaliSiapkanPalsu());
  assert.equal(await pengirim.kirim(isianSiapkan, widgetPalsu(), kendaliSiapkanPalsu()), null);
  await new Promise(r => setImmediate(r));
  lepas();
  assert.equal(await pertama, true);
  assert.equal(p.length, 1);
});

// ---------------------------------------------------------------- syarat sandi baru (klien)

test('syarat sandi: minimal 15 karakter, ulangan sama persis, dan berbeda dari pembanding', () => {
  const pembanding = { nilai: SANDI_LAMA_PALSU, label: 'sandi lama' };
  const cek = (baru, ulang) => akun.periksaSandiBaru(baru, ulang, pembanding);

  assert.equal(cek('a'.repeat(14), 'a'.repeat(14)).siap, false, '14 karakter ditolak');
  assert.equal(cek('a'.repeat(15), 'a'.repeat(15)).siap, true, '15 karakter diterima');
  assert.equal(cek('é'.repeat(15), 'é'.repeat(15)).siap, true, 'dihitung per karakter, bukan byte');
  assert.equal(cek(SANDI_BARU_PALSU, SANDI_BARU_PALSU + 'x').siap, false, 'ulangan berbeda');
  assert.equal(cek(SANDI_LAMA_PALSU, SANDI_LAMA_PALSU).siap, false, 'sama dengan sandi lama');
  assert.equal(cek('', '').siap, false);

  const { syarat } = cek('pendek', '');
  assert.deepEqual(syarat.map(s => [s.kunci, s.terpenuhi]), [['panjang', false], ['beda', true], ['sama', false]]);
  assert.equal(syarat[0].label, 'Minimal 15 karakter');

  const terlalu = cek('a'.repeat(akun.MAKS_SANDI_BYTE + 1), 'a'.repeat(akun.MAKS_SANDI_BYTE + 1));
  assert.equal(terlalu.siap, false);
  assert.ok(terlalu.syarat.some(s => s.kunci === 'maks' && !s.terpenuhi));
  assert.match(akun.KETERANGAN_SANDI, /Minimal 15 karakter/);
});

// ---------------------------------------------------------------- Ubah password

test('ubah password: POST JSON persis ke /api/v1/akun/ubah-sandi dengan X-SAPA; berhasil memuat ulang sesi', async () => {
  const p = fetchPalsu({ status: 200, isi: { diubah: true } });
  const kendali = kendaliUbahPalsu();
  let muatUlang = 0;
  const hasil = await akun.kirimUbahSandi({ passwordLama: SANDI_LAMA_PALSU, passwordBaru: SANDI_BARU_PALSU }, async () => { muatUlang += 1; return true; }, kendali);
  assert.equal(hasil, true);

  assert.equal(p.length, 1);
  assert.equal(p[0].url, '/api/v1/akun/ubah-sandi');
  assert.equal(p[0].method, 'POST');
  assert.equal(p[0].credentials, 'same-origin');
  assert.equal(p[0].headers['X-SAPA'], '1');
  assert.equal(p[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(p[0].body, { password_lama: SANDI_LAMA_PALSU, password_baru: SANDI_BARU_PALSU });

  assert.deepEqual(kendali.log, ['kosongkan', ['berhasil', 'Password berhasil diubah. Perangkat lain sudah dikeluarkan.']]);
  assert.equal(muatUlang, 1, 'sesi dibaca ulang (cookie baru dari server)');
});

test('ubah password: gagal menampilkan pesan server dan mengosongkan isian sandi', async () => {
  for (const [status, isi] of [
    [401, { kode: 'sandi_lama_salah', pesan: 'Pesan sandi lama dari server.' }],
    [400, { kode: 'sandi_lemah', pesan: 'Pesan sandi lemah dari server.' }],
    [400, { kode: 'sandi_bocor', pesan: 'Pesan sandi bocor dari server.' }],
    [400, { kode: 'sandi_sama', pesan: 'Pesan sandi sama dari server.' }],
    [503, { kode: 'belum_siap', pesan: 'Pesan layanan dari server.' }],
  ]) {
    fetchPalsu({ status, isi });
    const kendali = kendaliUbahPalsu();
    let muatUlang = 0;
    assert.equal(await akun.kirimUbahSandi({ passwordLama: SANDI_LAMA_PALSU, passwordBaru: SANDI_BARU_PALSU }, async () => { muatUlang += 1; return true; }, kendali), false);
    assert.deepEqual(kendali.log, ['kosongkan', ['galat', isi.pesan], 'fokus-lama'], `${status} ${isi.kode}`);
    assert.equal(muatUlang, 0);
  }
});

test('ubah password: 401 karena sesi berakhir membaca ulang sesi supaya kembali ke halaman masuk', async () => {
  fetchPalsu({ status: 401, isi: { kode: 'sesi_berakhir', pesan: 'Sesi berakhir.' } });
  const kendali = kendaliUbahPalsu();
  let muatUlang = 0;
  assert.equal(await akun.kirimUbahSandi({ passwordLama: SANDI_LAMA_PALSU, passwordBaru: SANDI_BARU_PALSU }, async () => { muatUlang += 1; return false; }, kendali), false);
  assert.equal(muatUlang, 1);
  assert.deepEqual(kendali.log, ['kosongkan', ['galat', 'Sesi berakhir.']]);
});

test('ubah password: tanpa teks server, kode galat memakai pesan cadangan', async () => {
  fetchPalsu({ status: 400, isi: { kode: 'sandi_sama' } });
  assert.equal((await akun.ajukanUbahSandi({ passwordLama: 'a', passwordBaru: 'b' })).pesan, 'Sandi baru harus berbeda dari sandi lama.');
  fetchPalsu({ status: 503, isi: { kode: 'hibp_tidak_tersedia' } });
  assert.equal((await akun.ajukanUbahSandi({ passwordLama: 'a', passwordBaru: 'b' })).pesan, 'Pemeriksaan keamanan sandi sedang tidak tersedia. Coba lagi beberapa saat lagi.');
  fetchPalsu({ status: 200, isi: {} });
  assert.equal((await akun.ajukanUbahSandi({ passwordLama: 'a', passwordBaru: 'b' })).ok, false, '2xx tanpa diubah=true bukan berhasil');
});

test('pengaturan akun: bagian Ubah password berisi tiga isian sandi dan tombol nonaktif sebelum syarat terpenuhi', () => {
  const html = render(h(PengaturanAkun));
  assert.match(html, />Pengaturan akun</);
  assert.match(html, />Ubah password</);
  const input = tag(html, 'input');
  assert.equal(input.length, 3);
  assert.match(input[0], /name="password_lama"/);
  assert.match(input[0], /autoComplete="current-password"/);
  assert.match(input[1], /name="password_baru"/);
  assert.match(input[1], /autoComplete="new-password"/);
  assert.match(input[2], /name="ulangi_password_baru"/);
  for (const i of input) assert.match(i, /type="password"/);
  assert.match(html, /Minimal 15 karakter/);
  const kirim = tag(html, 'button').find(t => /type="submit"/.test(t));
  assert.match(kirim, /disabled/);
  assert.doesNotMatch(html, /data-turnstile-aksi/);
});

test('isian sandi dan kode hanya di state komponen: tidak di penyimpanan browser atau URL', async () => {
  for (const jalur of ['auth/akunLokal.ts', 'components/HalamanSiapkanAkun.tsx', 'components/PengaturanAkun.tsx']) {
    const kode = await sumber(jalur);
    assert.doesNotMatch(kode, /localStorage|sessionStorage|indexedDB|document\.cookie/, jalur);
    assert.doesNotMatch(kode, /URLSearchParams|searchParams|\?kode=|\?password/, jalur);
  }
});

test('rute /siapkan-akun dikenali (garis miring akhir diabaikan) dan dibuka tanpa sesi', async () => {
  assert.equal(diHalamanSiapkanAkun('/siapkan-akun'), true);
  assert.equal(diHalamanSiapkanAkun('/siapkan-akun/'), true);
  assert.equal(diHalamanSiapkanAkun('/siapkan-akun-lain'), false);
  assert.equal(diHalamanSiapkanAkun('/login'), false);
  const main = await sumber('main.tsx');
  assert.match(main, /diHalamanSiapkanAkun\(window\.location\.pathname\) \? <HalamanSiapkanAkun \/>/);
});

// ---------------------------------------------------------------- menu menurut mode

test('menu: mode bff menyembunyikan Pengguna FKRTL dan menampilkan Pengaturan akun; mode lama sebaliknya', () => {
  assert.equal(fitur.menuTersedia('Pengguna FKRTL', 'bff'), false);
  assert.equal(fitur.menuTersedia('Pengaturan akun', 'bff'), true);
  assert.equal(fitur.menuTersedia('Logs', 'bff'), true);
  assert.equal(fitur.menuTersedia('Pengguna FKRTL', 'auth0'), true);
  assert.equal(fitur.menuTersedia('Pengaturan akun', 'auth0'), false);
  assert.equal(fitur.pesanMenuTidakTersedia('Pengguna FKRTL', 'bff'), 'Fitur ini belum tersedia di sistem akun baru.');
});

test('dasbor: menu Pengguna FKRTL tersembunyi di mode bff dan tetap ada di mode lama', async () => {
  const { InsightTracerDashboard } = await muat('components/InsightTracerDashboard.tsx');
  const bagian = [
    { label: 'Administrasi', items: [['Logs', 'Log aktivitas'], ['Pengguna FKRTL', 'Pengguna FKRTL']] },
    { label: 'Akun', items: [['Pengaturan akun', 'Pengaturan akun']] },
  ];
  const menu = (mode, peran = 'Super Admin') => fitur.saringBagianMenu(bagian, peran, mode).flatMap(b => b.items.map(([key]) => key));
  assert.deepEqual(fitur.saringBagianMenu(bagian, 'Super Admin', 'auth0').map(b => b.label), ['Administrasi'], 'bagian kosong dibuang');
  assert.deepEqual(menu('bff', 'viewer'), ['Pengaturan akun'], 'izin peran tetap berlaku');
  assert.ok(!menu('bff').includes('Pengguna FKRTL'));
  assert.ok(menu('bff').includes('Pengaturan akun'));
  assert.ok(menu('bff').includes('Logs'), 'menu lain tetap ada');
  assert.ok(menu('auth0').includes('Pengguna FKRTL'));
  assert.ok(!menu('auth0').includes('Pengaturan akun'));

  // Render navigasi dasbor mode bff: tautan Pengaturan akun ada, Pengguna FKRTL tidak.
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { createTheme, ThemeProvider } = await import('@mui/material/styles');
  // Render server tidak menjalankan media query; lebar desktop dipaksa supaya rail navigasi ikut dirender.
  const tema = createTheme({ components: { MuiUseMediaQuery: { defaultProps: { defaultMatches: true } } } });
  // gcTime tak terbatas: tidak ada pewaktu cache yang menahan proses tes tetap hidup.
  const klien = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  lokasi.pathname = '/home';
  const html = render(h(ThemeProvider, { theme: tema }, h(QueryClientProvider, { client: klien }, h(InsightTracerDashboard))), { mode: 'bff' });
  klien.clear();
  const nav = html.match(/<nav\b[^>]*aria-label="Menu utama"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(nav, 'navigasi utama dirender');
  assert.doesNotMatch(nav[1], /Pengguna FKRTL/);
  assert.match(nav[1], /href="\/pengaturan-akun"/);
});
