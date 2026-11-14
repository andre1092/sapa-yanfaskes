/**
 * Auth0 post-login Action: verifikasi Cloudflare Turnstile setelah sandi benar (SAPA Yanfaskes).
 *
 * Dipasang di Auth0 > Actions > Library, lalu Flow "Login". Kode ini disalin persis dari repo
 * supaya bisa di-review; perubahan selalu lewat PR yang disetujui CEO.
 *
 * Secrets Action (diisi CEO, Widi tidak melihatnya). Staging dan produksi memakai secret
 * TERPISAH: secret produksi hanya ada di Vercel Production, supaya kode staging yang belum
 * di-review tidak bisa memalsukan balasan untuk login produksi (syarat Clara).
 * - CLIENT_DIWAJIBKAN        client_id yang diwajibkan, dipisah koma; "*" = semua aplikasi.
 *                            Selama uji hanya SPA staging (temuan W1 Clara: Action berlaku se-tenant).
 * - STAGING_CLIENT_ID        client_id SPA staging.
 * - SAPA_SECRET_STAGING      = SAPA_VERIFIKASI_SECRET Vercel cabang staging (acak, minimal 32 byte).
 * - VERIFIKASI_URL_STAGING   alamat /verifikasi staging.
 * - PRODUKSI_CLIENT_ID, SAPA_SECRET_PRODUKSI, VERIFIKASI_URL_PRODUKSI   sama, untuk produksi.
 * Aplikasi yang diwajibkan tetapi tanpa konfigurasi ditolak (gagal tertutup).
 *
 * Silent auth (prompt=none) tidak boleh dialihkan. Sesi yang belum lulus ditolak, bukan dilewati:
 * sesi Auth0 sudah terbentuk walau Turnstile gagal, jadi melewatinya akan memberi token.
 */
const KUNCI_SESI = 'turnstile_sesi';
const MAKS_SESI = 10;
const LINGKUNGAN = ['STAGING', 'PRODUKSI'];

function diwajibkan(event) {
  const daftar = String(event.secrets.CLIENT_DIWAJIBKAN || '').split(',').map((s) => s.trim()).filter(Boolean);
  return daftar.includes('*') || daftar.includes(event.client && event.client.client_id);
}

function konfigurasi(event) {
  const id = event.client && event.client.client_id;
  const nama = LINGKUNGAN.find((n) => id && event.secrets[`${n}_CLIENT_ID`] === id);
  if (!nama) return null;
  const secret = event.secrets[`SAPA_SECRET_${nama}`];
  const url = event.secrets[`VERIFIKASI_URL_${nama}`];
  return secret && url ? { nama, secret, url } : null;
}

// Penanda per lingkungan: staging dan produksi berbagi sesi Auth0 (SSO) di tenant yang sama, jadi
// lulus di staging (yang kodenya bisa belum di-review) tidak boleh melewati produksi (temuan Clara).
function penanda(nama, event) {
  const id = event.session && event.session.id;
  return id ? `${nama}:${id}` : null;
}

function sesiLulus(event, nama) {
  const tanda = penanda(nama, event);
  const daftar = (event.user.app_metadata || {})[KUNCI_SESI];
  return Boolean(tanda && Array.isArray(daftar) && daftar.includes(tanda));
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
  const cfg = konfigurasi(event);
  if (!cfg) {
    api.access.deny('Verifikasi keamanan belum siap. Hubungi administrator SAPA.');
    return;
  }
  if (sesiLulus(event, cfg.nama)) return;
  if (tanpaInteraksi(event)) {
    api.access.deny('Verifikasi keamanan diperlukan. Silakan masuk kembali.');
    return;
  }
  const token = api.redirect.encodeToken({ secret: cfg.secret, expiresInSeconds: 300, payload: { tujuan: 'sapa-verifikasi' } });
  api.redirect.sendUserTo(cfg.url, { query: { session_token: token } });
};

exports.onContinuePostLogin = async (event, api) => {
  const cfg = konfigurasi(event);
  let payload;
  try {
    if (!cfg) throw new Error('konfigurasi');
    // Memeriksa tanda tangan HS256, masa berlaku, dan klaim state yang sama dengan transaksi ini.
    payload = api.redirect.validateToken({ secret: cfg.secret, tokenParameterName: 'sapa_token' });
  } catch (e) {
    api.access.deny('Verifikasi keamanan tidak berhasil. Silakan masuk kembali.');
    return;
  }
  if (!payload || payload.turnstile !== true || payload.sub !== event.user.user_id) {
    api.access.deny('Verifikasi keamanan tidak berhasil. Silakan masuk kembali.');
    return;
  }
  const tanda = penanda(cfg.nama, event);
  if (tanda) {
    const lama = ((event.user.app_metadata || {})[KUNCI_SESI] || []).filter((s) => s !== tanda);
    api.user.setAppMetadata(KUNCI_SESI, [...lama, tanda].slice(-MAKS_SESI));
  }
};
