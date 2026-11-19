import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mock, test } from 'node:test';
import { muat } from './muat-modul.mjs';

// Login satu halaman (mode bff) dan mode lama. Semua nilai di sini palsu dan hanya untuk tes.
globalThis.__VITE_ENV__ = { VITE_TURNSTILE_SITE_KEY: 'kunci-situs-uji', VITE_API_URL: 'https://api-lain.example' };
const lokasi = { origin: 'https://sapa.example', pathname: '/login', search: '', hash: '', dialihkan: [], replace(url) { this.dialihkan.push(url); } };
// replaceState meniru browser: alamat bilah ikut berubah, dan setiap perubahan dicatat.
const riwayat = {
  log: [],
  replaceState(_s, _j, url) {
    this.log.push(url);
    const u = new URL(url, lokasi.origin);
    Object.assign(lokasi, { pathname: u.pathname, search: u.search, hash: u.hash });
  },
};
globalThis.window = { location: lokasi, history: riwayat, innerWidth: 1024 };

const { renderToString } = await import('react-dom/server');
const { createElement: h } = await import('react');
const { LayarKeluar, LoginPage } = await muat('components/LoginPage.tsx');
const { FormMasuk, PanelLupaSandi } = await muat('components/FormMasuk.tsx');
const { buatKendaliForm, buatPengirimMasuk, kirimMasuk, PESAN_SESI_BELUM_TERBUKA } = await muat('auth/alurMasuk.ts');
const { Context } = await muat('auth/useSession.ts');
const bff = await muat('auth/bff.ts');
const sesi = await muat('auth/session.ts');
const { pasangWidget, TENGGAT_MUAT_MS } = await muat('lib/turnstile.ts');
const { apiClient } = await muat('lib/apiClient.ts');

const SANDI_PALSU = 'sandi-palsu-uji';
const sumber = jalur => readFile(new URL(`../src/${jalur}`, import.meta.url), 'utf8');

function nilaiSesi(ubah = {}) {
  return { ready: true, authenticated: false, configured: true, error: null, login: async () => {}, mode: 'bff', muatUlang: async () => false, profil: null, ...ubah };
}
function render(elemen, ubah) {
  return renderToString(h(Context.Provider, { value: nilaiSesi(ubah) }, elemen))
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}
const tag = (html, nama) => [...html.matchAll(new RegExp(`<${nama}\\b[^>]*>`, 'g'))].map(m => m[0]);
const teksTombol = html => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());

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

test('mode bff: satu kartu tanpa Auth0, tepat lima elemen ditambah tombol Masuk', () => {
  const html = render(h(LoginPage));
  assert.doesNotMatch(html, /auth0/i);
  assert.equal(tag(html, 'a').length, 0, 'tanpa tautan');
  assert.equal(tag(html, 'form').length, 1);
  assert.match(tag(html, 'form')[0], /method="post"/);

  const input = tag(html, 'input');
  assert.equal(input.length, 3, 'username, password, dan ingat saya');
  assert.match(input[0], /name="username"/);
  assert.match(input[0], /autoComplete="username"/);
  assert.match(input[1], /name="password"/);
  assert.match(input[1], /type="password"/);
  assert.match(input[1], /autoComplete="current-password"/);
  assert.match(input[2], /type="checkbox"/);
  assert.match(input[2], /name="ingat"/);
  assert.doesNotMatch(input[2], /checked/, '"Ingat saya" tidak tercentang bawaan');
  assert.match(html, />Ingat saya</);

  assert.deepEqual(teksTombol(html), ['', 'Lupa password?', 'Masuk'], 'tombol lihat password, Lupa password?, Masuk');
  const [lihat, lupa, masuk] = tag(html, 'button');
  assert.match(lihat, /aria-label="Tampilkan password"/);
  assert.match(lupa, /type="button"/);
  assert.match(masuk, /type="submit"/);
  assert.match(masuk, /disabled=""/, 'Masuk ditahan sampai username, password, dan token Turnstile ada');

  const widget = tag(html, 'div').filter(t => t.includes('data-turnstile-aksi'));
  assert.equal(widget.length, 1, 'tepat satu widget Turnstile');
  assert.match(widget[0], /data-turnstile-aksi="login"/);
  assert.doesNotMatch(html, /<textarea|<select/);
});

test('label terhubung dan wadah galat diumumkan', () => {
  const html = render(h(LoginPage));
  for (const nama of ['username', 'password']) {
    const id = html.match(new RegExp(`<input[^>]*id="([^"]+)"[^>]*name="${nama}"`))[1];
    assert.match(html, new RegExp(`<label[^>]*for="${id}"`), nama);
  }
  assert.match(html, /role="alert"/);
  const galat = render(h(LoginPage), { error: 'Layanan masuk sedang tidak tersedia.' });
  assert.match(galat, /role="alert"[^>]*>[\s\S]*Layanan masuk sedang tidak tersedia\./);
  const idGalat = galat.match(/<div\b[^>]*\bid="([^"]+)"[^>]*role="alert"/)[1];
  assert.ok(tag(galat, 'input').some(t => t.includes(`aria-describedby="${idGalat}"`)), 'kolom merujuk pesan galat');
});

test('mode bff: form dan widget Turnstile baru tampil setelah sesi selesai dibaca', () => {
  const html = render(h(LoginPage), { ready: false });
  assert.match(html, /role="status"[^>]*aria-busy="true"[\s\S]*Memeriksa sesi…/);
  assert.equal(tag(html, 'input').length, 0, 'tanpa kolom isian');
  assert.doesNotMatch(html, /data-turnstile-aksi/, 'widget belum dipasang');
});

test('keluar gagal: layar keluar menjelaskan sesi masih aktif dan menyediakan tombol ulang', () => {
  const keluar = { menunggu: false, galat: 'Sesi belum dapat diakhiri. Coba lagi.', ulangi: () => {}, batal: () => {} };
  const html = render(h(LayarKeluar), { authenticated: true, keluar });
  assert.match(html, /<h1[^>]*>Keluar belum berhasil<\/h1>/);
  assert.match(html, /role="alert"[^>]*>[\s\S]*Sesi masih aktif di perangkat ini\.[\s\S]*Sesi belum dapat diakhiri\. Coba lagi\./);
  assert.deepEqual(teksTombol(html), ['Coba keluar lagi', 'Kembali ke dasbor']);
  assert.equal(tag(html, 'input').length, 0, 'bukan form masuk');
  assert.doesNotMatch(html, /data-turnstile-aksi/);

  const menunggu = render(h(LayarKeluar), { authenticated: true, keluar: { ...keluar, menunggu: true, galat: null } });
  assert.match(menunggu, /role="status"[^>]*aria-busy="true"[\s\S]*Mengakhiri sesi…/);
  assert.deepEqual(teksTombol(menunggu), []);
});

test('mode lama tetap: tombol Masuk ke layanan masuk, tanpa form isian', () => {
  const html = render(h(LoginPage), { mode: 'auth0' });
  assert.equal(tag(html, 'input').length, 0);
  assert.deepEqual(teksTombol(html), ['Masuk']);
  assert.match(html, /Anda akan diarahkan ke halaman masuk yang aman\./);
  assert.doesNotMatch(html, /data-turnstile-aksi/);
});

test('masuk: POST JSON ke /api/v1/auth/masuk dengan X-SAPA dan cookie same-origin', async () => {
  const panggilan = fetchPalsu({ status: 200, isi: { masuk: true, peran: 'admin' } });
  const widget = widgetPalsu();
  const hasil = await bff.ajukanMasuk({ username: 'petugas.uji', password: SANDI_PALSU, ingat: true, token: 'token-turnstile-palsu' }, widget);
  assert.equal(hasil.ok, true);
  assert.equal(panggilan.length, 1);
  const [p] = panggilan;
  assert.equal(p.url, '/api/v1/auth/masuk');
  assert.equal(p.method, 'POST');
  assert.equal(p.credentials, 'same-origin');
  assert.equal(p.headers['X-SAPA'], '1');
  assert.equal(p.headers['Content-Type'], 'application/json');
  assert.equal(p.headers.Authorization, undefined);
  assert.deepEqual(p.body, { username: 'petugas.uji', password: SANDI_PALSU, ingat: true, turnstile_token: 'token-turnstile-palsu' });
  assert.equal(widget.jumlahReset, 0);
});

test('masuk gagal: pesan server ditampilkan dan widget Turnstile disetel ulang', async () => {
  for (const [status, isi, pesan] of [
    [401, { kode: 'sandi_salah', detail: 'Nama pengguna atau kata sandi salah.' }, 'Nama pengguna atau kata sandi salah.'],
    [403, { kode: 'turnstile_kedaluwarsa', pesan: 'Verifikasi keamanan sudah kedaluwarsa. Ulangi centang.' }, 'Verifikasi keamanan sudah kedaluwarsa. Ulangi centang.'],
    [404, { detail: 'Not Found' }, 'Layanan ini belum tersedia. Hubungi administrator SAPA.'],
    [200, { masuk: false }, 'Permintaan belum berhasil. Coba lagi beberapa saat lagi.'],
  ]) {
    fetchPalsu({ status, isi });
    const widget = widgetPalsu();
    const hasil = await bff.ajukanMasuk({ username: 'petugas.uji', password: SANDI_PALSU, ingat: false, token: 'token-palsu' }, widget);
    assert.equal(hasil.ok, false, String(status));
    assert.equal(hasil.pesan, pesan);
    assert.equal(widget.jumlahReset, 1, `reset setelah ${status}`);
    assert.doesNotMatch(hasil.pesan, new RegExp(SANDI_PALSU));
  }
  fetchPalsu(new TypeError('jaringan'));
  const widget = widgetPalsu();
  const hasil = await bff.ajukanMasuk({ username: 'u', password: SANDI_PALSU, ingat: false, token: 't' }, widget);
  assert.equal(hasil.status, 0);
  assert.equal(widget.jumlahReset, 1);
});

function formPalsu() {
  const log = [];
  return {
    log,
    kosongkanPassword: () => log.push('kosongkan-password'),
    sembunyikanPassword: () => log.push('sembunyikan-password'),
    buangToken: () => log.push('buang-token'),
    tampilkanGalat: pesan => log.push(['galat', pesan]),
    fokusPassword: () => log.push('fokus-password'),
  };
}
const isianUji = { username: 'petugas.uji', password: SANDI_PALSU, ingat: false, token: 'token-palsu' };

test('kirim masuk gagal: password dikosongkan dan disembunyikan, token dibuang, galat tampil, fokus ke password', async () => {
  fetchPalsu({ status: 401, isi: { kode: 'sandi_salah', pesan: 'Nama pengguna atau kata sandi salah.' } });
  Object.assign(lokasi, { pathname: '/login', search: '?kembali=%2Fkepatuhanfkrtl', hash: '' });
  riwayat.log = [];
  const widget = widgetPalsu();
  const form = formPalsu();
  let dimuat = 0;
  const masuk = await kirimMasuk(isianUji, widget, async () => { dimuat += 1; return true; }, form);
  assert.equal(masuk, false);
  assert.deepEqual(form.log, ['kosongkan-password', 'sembunyikan-password', 'buang-token', ['galat', 'Nama pengguna atau kata sandi salah.'], 'fokus-password']);
  assert.equal(widget.jumlahReset, 1, 'widget disetel ulang, token lama tidak dipakai lagi');
  assert.equal(dimuat, 0, 'sesi tidak dibaca');
  assert.deepEqual(riwayat.log, [], 'alamat tidak berubah');
});

test('kirim masuk berhasil: alamat tujuan dipasang sebelum sesi dibaca', async () => {
  fetchPalsu({ status: 200, isi: { masuk: true, peran: 'petugas_rs' } });
  Object.assign(lokasi, { pathname: '/login', search: '?kembali=%2Fkepatuhanfkrtl%3Fx%3D1', hash: '' });
  riwayat.log = [];
  const form = formPalsu();
  let alamatSaatDimuat = null;
  const masuk = await kirimMasuk(isianUji, widgetPalsu(), async () => { alamatSaatDimuat = `${lokasi.pathname}${lokasi.search}`; return true; }, form);
  assert.equal(masuk, true);
  assert.equal(alamatSaatDimuat, '/kepatuhanfkrtl?x=1');
  assert.deepEqual(form.log, ['kosongkan-password', 'sembunyikan-password'], 'password tetap dikosongkan setelah berhasil');

  Object.assign(lokasi, { pathname: '/login', search: '?kembali=%2F%2Fevil.example', hash: '' });
  await kirimMasuk(isianUji, widgetPalsu(), async () => true, formPalsu());
  assert.equal(riwayat.log.at(-1), '/home', 'tujuan berbahaya jatuh ke Beranda');
});

test('kirim masuk: sesi belum terbuka setelah /masuk mengembalikan alamat /login dan meminta token baru', async () => {
  fetchPalsu({ status: 200, isi: { masuk: true, peran: 'admin' } });
  Object.assign(lokasi, { pathname: '/login', search: '?kembali=%2Fkepatuhanfkrtl', hash: '' });
  riwayat.log = [];
  const widget = widgetPalsu();
  const form = formPalsu();
  assert.equal(await kirimMasuk(isianUji, widget, async () => false, form), false);
  assert.deepEqual(riwayat.log, ['/kepatuhanfkrtl', '/login?kembali=%2Fkepatuhanfkrtl']);
  assert.equal(widget.jumlahReset, 1);
  assert.deepEqual(form.log, ['kosongkan-password', 'sembunyikan-password', 'buang-token', ['galat', PESAN_SESI_BELUM_TERBUKA]]);
  Object.assign(lokasi, { pathname: '/login', search: '' });
});

const PESAN_429 = 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.';
const PESAN_503 = 'Layanan SAPA sedang tidak tersedia. Coba beberapa saat lagi.';

test('masuk 429 dan 503: pesan sesuai dengan atau tanpa kode/pesan/detail, widget disetel ulang', async () => {
  for (const [status, isi, pesan] of [
    [429, { kode: 'terlalu_banyak', detail: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.' }, PESAN_429],
    [429, { kode: 'terlalu_banyak', pesan: 'Tunggu sebentar lalu coba lagi.' }, 'Tunggu sebentar lalu coba lagi.'],
    [429, { kode: 'terlalu_banyak' }, PESAN_429],
    [429, { detail: 'Too Many Requests' }, PESAN_429],
    [429, '<html>Too Many Requests</html>', PESAN_429],
    [429, '', PESAN_429],
    [503, { kode: 'belum_siap', detail: 'Layanan masuk sedang tidak tersedia. Coba beberapa saat lagi.' }, 'Layanan masuk sedang tidak tersedia. Coba beberapa saat lagi.'],
    [503, { pesan: 'Pemeliharaan terjadwal.' }, 'Pemeliharaan terjadwal.'],
    [503, { kode: 'belum_siap' }, PESAN_503],
    [503, { detail: 'Layanan masuk belum dikonfigurasi' }, PESAN_503],
    [503, '<html>Service Unavailable</html>', PESAN_503],
    [503, '', PESAN_503],
  ]) {
    const label = `${status} ${JSON.stringify(isi)}`;
    globalThis.fetch = async () => new Response(typeof isi === 'string' ? isi : JSON.stringify(isi), {
      status, headers: { 'Content-Type': typeof isi === 'string' ? 'text/html' : 'application/json' },
    });
    const widget = widgetPalsu();
    const form = formPalsu();
    assert.equal(await kirimMasuk(isianUji, widget, async () => true, form), false, label);
    assert.deepEqual(form.log, ['kosongkan-password', 'sembunyikan-password', 'buang-token', ['galat', pesan], 'fokus-password'], label);
    assert.equal(widget.jumlahReset, 1, label);
  }
});

test('kirim dua kali cepat (klik ganda atau Enter berulang) hanya mengirim satu permintaan', async () => {
  const antre = [];
  globalThis.fetch = (url, opsi = {}) => new Promise((ok, gagal) => antre.push({
    url,
    jawab: (status, isi) => ok(new Response(JSON.stringify(isi), { status, headers: { 'Content-Type': 'application/json' } })),
    putus: () => gagal(new TypeError('jaringan')),
  }));
  const pengirim = buatPengirimMasuk();
  const widget = widgetPalsu();
  assert.equal(pengirim.sibuk(), false);
  const pertama = pengirim.kirim(isianUji, widget, async () => true, formPalsu());
  assert.equal(pengirim.sibuk(), true);
  const formKedua = formPalsu();
  assert.equal(await pengirim.kirim(isianUji, widget, async () => true, formKedua), null, 'kiriman kedua diabaikan');
  assert.deepEqual(formKedua.log, [], 'form tidak disentuh kiriman kedua');
  assert.equal(antre.length, 1, 'hanya satu POST /masuk');
  antre[0].jawab(401, { kode: 'sandi_salah', detail: 'Nama pengguna atau kata sandi salah.' });
  assert.equal(await pertama, false);
  assert.equal(pengirim.sibuk(), false, 'setelah jawaban, form boleh dikirim lagi');

  // Sesi gagal dibaca dengan pengecualian pun tidak mengunci form selamanya.
  const ketiga = pengirim.kirim(isianUji, widget, async () => { throw new Error('muat'); }, formPalsu());
  assert.equal(antre.length, 2);
  antre[1].jawab(200, { masuk: true, peran: 'admin' });
  await assert.rejects(ketiga);
  assert.equal(pengirim.sibuk(), false);
  Object.assign(lokasi, { pathname: '/login', search: '', hash: '' });

  const form = await sumber('components/FormMasuk.tsx');
  assert.match(form, /buatPengirimMasuk\(\)/, 'komponen memakai pengirim tunggal');
  // Penjaga di handler komponen hanya diperiksa lewat sumber (tanpa DOM); kunci pengirimnya diuji di atas.
  assert.match(form, /pengirim\.sibuk\(\)/, 'kirim kedua ditolak sebelum keadaan form diubah');
});

test('ingat dikirim sebagai boolean di body JSON', async () => {
  for (const [ingat, diharapkan] of [[true, true], [false, false], ['on', false], [1, false], [undefined, false]]) {
    const mentah = [];
    globalThis.fetch = async (_url, opsi = {}) => {
      mentah.push(opsi.body);
      return new Response(JSON.stringify({ kode: 'sandi_salah', detail: 'x' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    };
    await kirimMasuk({ ...isianUji, ingat }, widgetPalsu(), async () => true, formPalsu());
    const body = JSON.parse(mentah[0]);
    assert.equal(body.ingat, diharapkan, String(ingat));
    assert.equal(typeof body.ingat, 'boolean', String(ingat));
  }
});

// Setter palsu meniru useState: menerima nilai atau fungsi pembaru, dan mencatat setiap panggilan.
function keadaanPalsu(awal) {
  const log = [];
  const k = { nilai: { ...awal }, log };
  const setter = nama => v => { k.nilai[nama] = typeof v === 'function' ? v(k.nilai[nama]) : v; log.push([nama, k.nilai[nama]]); };
  k.setel = { setPassword: setter('password'), setLihat: setter('lihat'), setToken: setter('token'), setGalat: setter('galat') };
  return k;
}

test('buatKendaliForm memetakan kendali alur kirim ke state komponen', () => {
  const k = keadaanPalsu({ password: SANDI_PALSU, lihat: true, token: 'token-palsu', galat: null });
  let fokus = 0;
  const form = buatKendaliForm({ ...k.setel, fokus: () => { fokus += 1; } });
  form.kosongkanPassword();
  form.sembunyikanPassword();
  form.buangToken();
  form.tampilkanGalat('pesan uji');
  form.fokusPassword();
  assert.deepEqual(k.log, [['password', ''], ['lihat', false], ['token', null], ['galat', 'pesan uji']], 'tiap kendali memanggil setter sekali');
  assert.deepEqual(k.nilai, { password: '', lihat: false, token: null, galat: 'pesan uji' });
  assert.equal(fokus, 1);
});

test('tombol lihat password kembali tersembunyi setelah setiap jawaban /masuk', async () => {
  for (const [status, isi, muatUlang] of [
    [401, { kode: 'sandi_salah', detail: 'Nama pengguna atau kata sandi salah.' }, async () => true],
    [200, { masuk: true, peran: 'admin' }, async () => true],
    [200, { masuk: true, peran: 'admin' }, async () => false],
  ]) {
    fetchPalsu({ status, isi });
    const k = keadaanPalsu({ password: SANDI_PALSU, lihat: true, token: 'token-palsu', galat: null });
    await kirimMasuk(isianUji, widgetPalsu(), muatUlang, buatKendaliForm({ ...k.setel, fokus: () => {} }));
    assert.equal(k.nilai.lihat, false, `${status} ${muatUlang}`);
    assert.equal(k.nilai.password, '', `${status} ${muatUlang}`);
    Object.assign(lokasi, { pathname: '/login', search: '', hash: '' });
  }
  // Sambungan ke React: komponen membuat kendali dari setter useState-nya. Tanpa DOM, bagian ini diperiksa lewat sumber.
  const form = await sumber('components/FormMasuk.tsx');
  assert.match(form, /buatKendaliForm\(\{[^}]*\bsetLihat\b[^}]*\}\)/);
});

test('form masuk tidak menyimpan isian di browser', async () => {
  for (const jalur of ['components/FormMasuk.tsx', 'auth/alurMasuk.ts']) {
    assert.doesNotMatch(await sumber(jalur), /localStorage|sessionStorage|indexedDB|document\.cookie|URLSearchParams|pushState|location\.(assign|href)/, jalur);
  }
});

test('widget Turnstile: render eksplisit, aman di StrictMode, reset dan hapus memakai id widget', async () => {
  const log = [];
  let nomor = 0;
  window.turnstile = {
    render: (el, opsi) => { const id = `w${++nomor}`; log.push(['render', id, opsi]); return id; },
    reset: id => log.push(['reset', id]),
    remove: id => log.push(['remove', id]),
  };
  const wadah = { clientWidth: 280, dataset: {} };
  const token = [];
  const opsi = { siteKey: 'kunci-situs-uji', aksi: 'login', onToken: t => token.push(t), onGalat: () => {} };
  // StrictMode: pasang, lepas sebelum skrip siap, pasang lagi.
  pasangWidget(wadah, opsi).hapus();
  const kendali = pasangWidget(wadah, opsi);
  await new Promise(r => setTimeout(r, 0));
  const render = log.filter(([jenis]) => jenis === 'render');
  assert.equal(render.length, 1, 'hanya satu widget');
  const [, id, o] = render[0];
  assert.equal(o.sitekey, 'kunci-situs-uji');
  assert.equal(o.action, 'login');
  assert.equal(o['response-field'], false);
  assert.equal(o.size, 'compact', 'wadah sempit (layar 360 px) memakai ukuran compact');
  o.callback('token-baru');
  assert.deepEqual(token, ['token-baru']);
  kendali.reset();
  assert.deepEqual(log.at(-1), ['reset', id]);
  assert.equal(token.at(-1), null, 'token lama dibuang saat reset');
  kendali.hapus();
  assert.deepEqual(log.at(-1), ['remove', id]);
  delete window.turnstile;
});

function dokumenPalsu() {
  const skrip = [];
  globalThis.document = {
    createElement: () => { const s = { dilepas: false, remove() { s.dilepas = true; } }; skrip.push(s); return s; },
    head: { appendChild() {} },
  };
  return skrip;
}
const opsiWidget = galat => ({ siteKey: 'kunci-situs-uji', aksi: 'login', onToken: () => {}, onGalat: jenis => galat.push(jenis) });
const tunggu = () => new Promise(r => setImmediate(r));

test('widget Turnstile: skrip yang tidak menjawab menampilkan galat muat setelah tenggat, lalu bisa dicoba lagi', async () => {
  const skrip = dokumenPalsu();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const galat = [];
    pasangWidget({ clientWidth: 400, dataset: {} }, opsiWidget(galat));
    mock.timers.tick(TENGGAT_MUAT_MS - 1);
    await tunggu();
    assert.deepEqual(galat, [], 'belum lewat tenggat');
    mock.timers.tick(1);
    await tunggu();
    assert.deepEqual(galat, ['muat']);
    assert.equal(skrip[0].dilepas, true, 'elemen skrip yang macet dilepas');
    pasangWidget({ clientWidth: 400, dataset: {} }, opsiWidget([]));
    assert.equal(skrip.length, 2, 'percobaan berikutnya memuat skrip lagi');
    skrip[1].onerror();
  } finally {
    mock.timers.reset();
  }
  await tunggu();
});

test('widget Turnstile: skrip termuat tanpa window.turnstile tidak disimpan sebagai gagal permanen', async () => {
  const skrip = dokumenPalsu();
  const galat = [];
  pasangWidget({ clientWidth: 400, dataset: {} }, opsiWidget(galat));
  skrip[0].onload();
  await tunggu();
  assert.deepEqual(galat, ['muat']);
  const log = [];
  pasangWidget({ clientWidth: 400, dataset: {} }, opsiWidget(galat));
  assert.equal(skrip.length, 2, 'skrip dimuat ulang');
  window.turnstile = { render: () => { log.push('render'); return 'w1'; }, reset() {}, remove() {} };
  skrip[1].onload();
  await tunggu();
  assert.deepEqual(log, ['render']);
  assert.deepEqual(galat, ['muat'], 'tanpa galat baru');
  delete window.turnstile;
  delete globalThis.document;
});

test('lupa password: panel di halaman yang sama hanya berisi petunjuk menghubungi Admin', async () => {
  const html = render(h(PanelLupaSandi, { onKembali: () => {}, judul: { current: null } }));
  assert.match(html, />Hubungi Admin KC Jember untuk atur ulang sandi\.</);
  assert.doesNotMatch(html, /auth0/i);
  assert.doesNotMatch(html, /email|tautan/i, 'tidak menjanjikan email selama reset lewat Admin');
  assert.equal(tag(html, 'a').length, 0);
  assert.equal(tag(html, 'form').length, 0);
  assert.equal(tag(html, 'input').length, 0);
  assert.equal(tag(html, 'div').filter(t => t.includes('data-turnstile-aksi')).length, 0);
  assert.deepEqual(teksTombol(html), ['Kembali ke halaman masuk']);

  // Satu panel tampil pada satu waktu; hanya panel masuk yang memasang widget.
  const masuk = render(h(FormMasuk, { panelAwal: 'masuk' }));
  const w = tag(masuk, 'div').filter(t => t.includes('data-turnstile-aksi'));
  assert.equal(w.length, 1);
  assert.match(w[0], /data-turnstile-aksi="login"/);
  const lupa = render(h(FormMasuk, { panelAwal: 'lupa' }));
  assert.equal(tag(lupa, 'div').filter(t => t.includes('data-turnstile-aksi')).length, 0);
  assert.equal(tag(lupa, 'input').length, 0);
});

test('lupa password tidak memanggil server', async () => {
  assert.equal(bff.ajukanLupaSandi, undefined);
  assert.equal(Object.values(bff.ALAMAT_AUTH).some(a => a.includes('lupa')), false);
  for (const berkas of ['../src/components/FormMasuk.tsx', '../src/auth/bff.ts']) {
    const isi = await readFile(new URL(berkas, import.meta.url), 'utf8');
    assert.doesNotMatch(isi, /lupa-sandi/, berkas);
  }
});

test('mode dan sesi dibaca dari server; keluar memakai POST dengan X-SAPA', async () => {
  fetchPalsu({ status: 200, isi: { bff: true } });
  assert.equal(await bff.bacaMode(), 'bff');
  fetchPalsu({ status: 200, isi: { bff: false } });
  assert.equal(await bff.bacaMode(), 'auth0');
  fetchPalsu({ status: 200, isi: {} });
  await assert.rejects(bff.bacaMode(), 'bentuk salah tidak ditebak');

  const p = fetchPalsu({ status: 200, isi: { masuk: true, peran: 'petugas_rs', nama: 'Petugas Uji' } });
  const masuk = await bff.bacaSesi();
  assert.equal(masuk.status, 'masuk');
  assert.equal(p[0].url, '/api/v1/auth/sesi');
  assert.equal(p[0].credentials, 'same-origin');
  assert.equal(p[0].cache, 'no-store');
  fetchPalsu({ status: 200, isi: { masuk: false, kode: 'sesi_berakhir' } });
  assert.deepEqual(await bff.bacaSesi(), { status: 'keluar', kode: 'sesi_berakhir' });
  fetchPalsu({ status: 503, isi: { kode: 'belum_siap', detail: 'Layanan masuk sedang tidak tersedia.' } });
  assert.deepEqual(await bff.bacaSesi(), { status: 'galat', pesan: 'Layanan masuk sedang tidak tersedia.' });

  const k = fetchPalsu({ status: 200, isi: { keluar: true } });
  assert.equal((await bff.keluarSesi()).ok, true);
  assert.equal(k[0].url, '/api/v1/auth/keluar');
  assert.equal(k[0].method, 'POST');
  assert.equal(k[0].headers['X-SAPA'], '1');
});

const tungguGiliran = async () => { for (let i = 0; i < 5; i += 1) await new Promise(r => setImmediate(r)); };

test('mode: GET /auth/mode yang tidak pernah selesai menjadi galat dalam batas waktu', async () => {
  assert.equal(bff.BATAS_MODE_MS, 10_000, 'batas bawaan sekitar 10 detik');
  let sinyal;
  globalThis.fetch = (_url, opsi = {}) => { sinyal = opsi.signal; return new Promise(() => {}); };
  const mulai = Date.now();
  await assert.rejects(bff.bacaMode(30));
  assert.ok(Date.now() - mulai < 2000, 'tidak menunggu tanpa akhir');
  assert.ok(sinyal instanceof AbortSignal, 'fetch menerima sinyal pembatalan');
  assert.equal(sinyal.aborted, true, 'permintaan dibatalkan');

  // Badan jawaban yang macet juga dibatasi.
  globalThis.fetch = async () => ({ ok: true, json: () => new Promise(() => {}) });
  await assert.rejects(bff.bacaMode(30));
});

test('mode: tanpa AbortSignal.timeout, batas memakai AbortController dan setTimeout', async () => {
  const asli = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let sinyal;
    globalThis.fetch = (_url, opsi = {}) => { sinyal = opsi.signal; return new Promise(() => {}); };
    let galat = null;
    const dibaca = bff.bacaMode().catch(e => { galat = e; });
    await tungguGiliran();
    mock.timers.tick(bff.BATAS_MODE_MS - 1);
    await tungguGiliran();
    assert.equal(galat, null, 'belum lewat batas');
    mock.timers.tick(1);
    await dibaca;
    assert.ok(galat instanceof Error, 'lewat batas menjadi galat');
    assert.equal(sinyal.aborted, true);

    fetchPalsu({ status: 200, isi: { bff: true } });
    assert.equal(await bff.bacaMode(), 'bff', 'jawaban tepat waktu tetap dipakai');
  } finally {
    mock.timers.reset();
    AbortSignal.timeout = asli;
  }
});

function adapterPalsu(status = 200) {
  const diterima = [];
  apiClient.defaults.adapter = async config => {
    diterima.push(config);
    const res = { data: {}, status, statusText: '', headers: {}, config };
    if (status >= 400) throw Object.assign(new Error(`status ${status}`), { response: res, config, isAxiosError: true });
    return res;
  };
  return diterima;
}

test('apiClient mode bff: tanpa Authorization, dengan X-SAPA, hanya ke asal sendiri', async () => {
  sesi.aturModeSesi('bff');
  // Pengambil token yang tertinggal pun tidak dipakai di mode bff.
  const lepas = sesi.registerAuthSession(async () => 'token-palsu', () => {});
  const diterima = adapterPalsu();
  await apiClient.get('/api/v1/akun/status');
  const [config] = diterima;
  assert.equal(config.headers.get('Authorization'), undefined);
  assert.equal(config.headers.get('X-SAPA'), '1');
  assert.equal(config.baseURL, '', 'VITE_API_URL tidak dipakai saat cookie sesi berlaku');
  lepas();
});

test('apiClient mode bff: 401 di /login tidak mengalihkan lagi (tanpa loop)', async () => {
  sesi.aturModeSesi('bff');
  for (const [pathname, search, hash] of [['/login', '', ''], ['/login', '?kembali=%2Fkepatuhanfkrtl', ''], ['/login/', '', ''], ['/login', '', '#x']]) {
    Object.assign(lokasi, { pathname, search, hash, dialihkan: [] });
    adapterPalsu(401);
    for (let i = 0; i < 3; i += 1) await assert.rejects(apiClient.get('/api/v1/akun/status'));
    assert.deepEqual(lokasi.dialihkan, [], `${pathname}${search}${hash}`);
  }
  Object.assign(lokasi, { pathname: '/login', search: '', hash: '' });
});

test('apiClient mode bff: 401 membawa ke /login dengan tujuan semula yang aman', async () => {
  sesi.aturModeSesi('bff');
  Object.assign(lokasi, { pathname: '/kepatuhanfkrtl', search: '?x=1', hash: '', dialihkan: [] });
  adapterPalsu(401);
  await assert.rejects(apiClient.get('/api/v1/data'));
  assert.deepEqual(lokasi.dialihkan, ['/login?kembali=%2Fkepatuhanfkrtl%3Fx%3D1']);
  await assert.rejects(apiClient.get('/api/v1/data'));
  assert.equal(lokasi.dialihkan.length, 1, 'hanya sekali');
  Object.assign(lokasi, { pathname: '/login', search: '' });
});

test('apiClient mode lama tetap: Bearer dari penyedia sesi, tanpa X-SAPA, gagal tertutup tanpa sesi', async () => {
  sesi.aturModeSesi('auth0');
  const lepas = sesi.registerAuthSession(async () => 'token-palsu', () => {});
  const diterima = adapterPalsu();
  await apiClient.get('/api/v1/akun/status');
  assert.equal(diterima[0].headers.get('Authorization'), 'Bearer token-palsu');
  assert.equal(diterima[0].headers.get('X-SAPA'), undefined);
  assert.equal(diterima[0].baseURL, 'https://api-lain.example');
  lepas();
  await assert.rejects(apiClient.get('/api/v1/akun/status'));
  sesi.aturModeSesi(null);
});

/** Impor statis (bukan `import type`) dari src/main.tsx ke bawah. */
async function imporStatis() {
  const hasil = new Map();
  const antrean = ['main.tsx'];
  while (antrean.length) {
    const jalur = antrean.shift();
    if (hasil.has(jalur)) continue;
    const kode = await sumber(jalur);
    const impor = [...kode.matchAll(/^import\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"]/gm)].map(m => m[1] || m[2]);
    hasil.set(jalur, impor);
    for (const spes of impor.filter(s => s.startsWith('.'))) {
      const dasar = new URL(spes, `file:///src/${jalur}`).pathname.slice('/src/'.length);
      for (const kandidat of [dasar, `${dasar}.ts`, `${dasar}.tsx`]) {
        if (/\.(ts|tsx)$/.test(kandidat) && await sumber(kandidat).then(() => true, () => false)) { antrean.push(kandidat); break; }
      }
    }
  }
  return hasil;
}

test('SDK Auth0 hanya dimuat untuk mode lama (import dinamis)', async () => {
  const graf = await imporStatis();
  const pengimpor = [...graf].filter(([, impor]) => impor.some(s => s.startsWith('@auth0/'))).map(([jalur]) => jalur);
  assert.deepEqual(pengimpor, [], 'tidak ada impor statis SDK Auth0 dari main.tsx');
  assert.ok(graf.has('components/LoginPage.tsx') && graf.has('auth/SesiCookie.tsx'));
  assert.ok(!graf.has('auth/SesiAuth0.tsx'));
  const penyedia = await sumber('auth/AuthSessionProvider.tsx');
  assert.match(penyedia, /lazy\(\(\) => import\('\.\/SesiAuth0'\)/);
  const vite = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(vite, /if \(id\.includes\('\/@auth0\/'\)\) return;\s*\n\s*if \(id\.includes\('react'\)/, 'SDK Auth0 tidak masuk vendor-core');
  for (const jalur of ['components/Sidebar.tsx', 'components/HeroUIAssistant.tsx']) {
    assert.doesNotMatch(await sumber(jalur), /@auth0\/auth0-react|useAuth0/, jalur);
  }
});
