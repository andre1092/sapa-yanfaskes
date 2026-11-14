/**
 * Auth0 post-login Action: verifikasi Cloudflare Turnstile setelah sandi benar (SAPA Yanfaskes).
 *
 * Dipasang di Auth0 > Actions > Library, lalu Flow "Login". Kode ini disalin persis dari repo
 * supaya bisa di-review; perubahan selalu lewat PR yang disetujui CEO.
 *
 * Secrets Action (diisi CEO, Widi tidak melihatnya):
 * - SAPA_SECRET         kunci HS256 bersama, sama dengan SAPA_VERIFIKASI_SECRET di Vercel.
 * - VERIFIKASI_URL      alamat halaman /verifikasi (staging atau produksi).
 * - CLIENT_DIWAJIBKAN   daftar client_id yang diwajibkan, dipisah koma; "*" = semua aplikasi.
 *                       Selama uji hanya SPA staging (temuan W1 Clara: Action berlaku se-tenant).
 *
 * Silent auth (prompt=none) tidak boleh dialihkan. Sesi yang belum lulus ditolak, bukan dilewati:
 * sesi Auth0 sudah terbentuk walau Turnstile gagal, jadi melewatinya akan memberi token.
 */
const KUNCI_SESI = 'turnstile_sesi';
const MAKS_SESI = 10;

function diwajibkan(event) {
  const daftar = String(event.secrets.CLIENT_DIWAJIBKAN || '').split(',').map((s) => s.trim()).filter(Boolean);
  return daftar.includes('*') || daftar.includes(event.client && event.client.client_id);
}

function sesiLulus(event) {
  const id = event.session && event.session.id;
  const daftar = (event.user.app_metadata || {})[KUNCI_SESI];
  return Boolean(id && Array.isArray(daftar) && daftar.includes(id));
}

function tanpaInteraksi(event) {
  const prompt = event.transaction && event.transaction.prompt;
  const daftar = Array.isArray(prompt) ? prompt : String(prompt || '').split(' ');
  return daftar.includes('none') || (event.request && event.request.query && event.request.query.prompt) === 'none';
}

exports.onExecutePostLogin = async (event, api) => {
  if (!diwajibkan(event)) return;
  // Refresh token hanya terbit dari login yang sudah melewati Action ini; redirect tidak didukung di sana.
  if (event.transaction && event.transaction.protocol === 'oauth2-refresh-token') return;
  if (sesiLulus(event)) return;
  if (tanpaInteraksi(event)) {
    api.access.deny('Verifikasi keamanan diperlukan. Silakan masuk kembali.');
    return;
  }
  if (!event.secrets.SAPA_SECRET || !event.secrets.VERIFIKASI_URL) {
    api.access.deny('Verifikasi keamanan belum siap. Hubungi administrator SAPA.');
    return;
  }
  const token = api.redirect.encodeToken({
    secret: event.secrets.SAPA_SECRET,
    expiresInSeconds: 300,
    payload: { tujuan: 'sapa-verifikasi' },
  });
  api.redirect.sendUserTo(event.secrets.VERIFIKASI_URL, { query: { session_token: token } });
};

exports.onContinuePostLogin = async (event, api) => {
  let payload;
  try {
    // Memeriksa tanda tangan HS256, masa berlaku, dan klaim state yang sama dengan transaksi ini.
    payload = api.redirect.validateToken({ secret: event.secrets.SAPA_SECRET, tokenParameterName: 'sapa_token' });
  } catch (e) {
    api.access.deny('Verifikasi keamanan tidak berhasil. Silakan masuk kembali.');
    return;
  }
  if (!payload || payload.turnstile !== true || payload.sub !== event.user.user_id) {
    api.access.deny('Verifikasi keamanan tidak berhasil. Silakan masuk kembali.');
    return;
  }
  const id = event.session && event.session.id;
  if (id) {
    const lama = ((event.user.app_metadata || {})[KUNCI_SESI] || []).filter((s) => s !== id);
    api.user.setAppMetadata(KUNCI_SESI, [...lama, id].slice(-MAKS_SESI));
  }
};
