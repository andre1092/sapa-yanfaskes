import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { alamatLanjutSah, bacaParameter, keadaanDariStatus, ringkasState, type Keadaan } from '../lib/verifikasi';

// Halaman /verifikasi: Cloudflare Turnstile setelah sandi benar di Auth0 (desain Kim,
// agents/kim/desain/login-auth0/verifikasi-turnstile.md). Tampil tanpa sesi SAPA.

type Turnstile = {
  render: (el: HTMLElement, opsi: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

const SKRIP = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const HIJAU = '#007a43';
const BIRU = '#0060a0';

let muatSkrip: Promise<Turnstile> | null = null;
function skripTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  muatSkrip ??= new Promise((ok, gagal) => {
    const s = document.createElement('script');
    s.src = SKRIP;
    s.async = true;
    s.onload = () => (window.turnstile ? ok(window.turnstile) : gagal(new Error('turnstile')));
    s.onerror = () => { muatSkrip = null; gagal(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return muatSkrip;
}

function kirimKeAuth0(alamat: string, state: string, token: string) {
  // POST ke /continue sesuai anjuran Auth0 (token tidak masuk riwayat atau log URL).
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = alamat;
  for (const [name, value] of [['state', state], ['sapa_token', token]]) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

const JUDUL: Partial<Record<Keadaan, string>> = { kedaluwarsa: 'Waktu verifikasi habis', tautan: 'Halaman tidak dapat dibuka' };
const PESAN: Partial<Record<Keadaan, string>> = {
  memuat: 'Menyiapkan verifikasi…',
  berhasil: 'Verifikasi berhasil. Melanjutkan masuk…',
  gagal: 'Verifikasi belum berhasil. Periksa koneksi internet, lalu coba lagi.',
  kedaluwarsa: 'Demi keamanan, verifikasi hanya berlaku sebentar. Silakan masuk lagi.',
  tautan: 'Halaman ini hanya bisa dibuka dari proses masuk SAPA Yanfaskes.',
  layanan: 'Layanan verifikasi sedang bermasalah. Coba lagi beberapa saat lagi.',
};

// Dibaca sekali saat modul dimuat; query lalu dihapus dari alamat supaya session_token dan state
// tidak tertinggal di riwayat browser (saran Clara).
const PARAM_AWAL = window.location.pathname === '/verifikasi' ? bacaParameter(window.location.search) : null;

export function VerifikasiManusia() {
  const [param] = useState(PARAM_AWAL);
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || '';
  const domainAuth0 = import.meta.env.VITE_AUTH0_DOMAIN?.trim() || '';
  const [keadaan, setKeadaan] = useState<Keadaan>(param ? (siteKey ? 'memuat' : 'layanan') : 'tautan');
  const [lanjut, setLanjut] = useState<{ alamat: string; token: string } | null>(null);
  const [tombolLanjut, setTombolLanjut] = useState(false);
  const wadah = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const judul = useRef<HTMLHeadingElement>(null);

  const kirim = useCallback(async (jawaban: string) => {
    if (!param) return;
    setKeadaan('memeriksa');
    try {
      const res = await fetch('/api/v1/verifikasi-manusia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ state: param.state, session_token: param.sessionToken, turnstile_token: jawaban }),
      });
      if (!res.ok) { setKeadaan(keadaanDariStatus(res.status)); return; }
      const data = await res.json();
      if (!alamatLanjutSah(data.continue_url, domainAuth0) || data.state !== param.state || typeof data.sapa_token !== 'string') {
        setKeadaan('layanan');
        return;
      }
      setKeadaan('berhasil');
      setLanjut({ alamat: data.continue_url, token: data.sapa_token });
      kirimKeAuth0(data.continue_url, param.state, data.sapa_token);
    } catch {
      setKeadaan('layanan');
    }
  }, [param, domainAuth0]);

  const judulBerganti = keadaan === 'tautan' || keadaan === 'kedaluwarsa';
  useEffect(() => { judul.current?.focus(); }, [judulBerganti]);

  useEffect(() => {
    if (!param || !siteKey) return;
    let batal = false;
    (async () => {
      try {
        const [ts, cData] = await Promise.all([skripTurnstile(), ringkasState(param.state)]);
        if (batal || !wadah.current) return;
        widget.current = ts.render(wadah.current, {
          sitekey: siteKey, action: 'sapa_login', cData,
          theme: 'light', language: 'id', appearance: 'always',
          size: window.innerWidth < 360 ? 'compact' : 'flexible',
          callback: (jawaban: string) => { void kirim(jawaban); },
          'error-callback': () => { setKeadaan('gagal'); return true; },
          'expired-callback': () => setKeadaan('kedaluwarsa'),
          'timeout-callback': () => setKeadaan('kedaluwarsa'),
        });
        setKeadaan(k => (k === 'memuat' ? 'siap' : k));
      } catch {
        if (!batal) setKeadaan('layanan');
      }
    })();
    return () => { batal = true; if (widget.current) window.turnstile?.remove(widget.current); widget.current = null; };
  }, [param, siteKey, kirim]);

  useEffect(() => {
    if (keadaan !== 'berhasil') return;
    const t = window.setTimeout(() => setTombolLanjut(true), 3000);
    return () => window.clearTimeout(t);
  }, [keadaan]);

  const cobaLagi = () => {
    if (widget.current && window.turnstile) { setKeadaan('siap'); window.turnstile.reset(widget.current); }
    else window.location.reload();
  };
  const keMasuk = () => window.location.assign('/');
  const tampilWidget = Boolean(param && siteKey) && keadaan !== 'tautan' && keadaan !== 'kedaluwarsa';
  const pesan = PESAN[keadaan];
  const galat = keadaan === 'gagal' || keadaan === 'layanan' || keadaan === 'tautan';
  const fokus = { '&:focus-visible': { outline: '3px solid #0060a0', outlineOffset: '2px' } };
  const tombol = { minHeight: 44, width: '100%', textTransform: 'none', fontWeight: 600, ...fokus } as const;
  // Teks putih dikunci: halaman ini ada di dalam BerryThemeProvider, dan tema gelap akan menggelapkannya.
  const hijau = { ...tombol, bgcolor: HIJAU, color: '#fff', '&:hover': { bgcolor: '#00663a', color: '#fff' } } as const;

  return (
    <Box component="main" sx={{ minHeight: '100dvh', bgcolor: '#eef3f8', display: 'flex', alignItems: 'center', justifyContent: 'center', px: { xs: 2, sm: 3 }, py: 3 }}>
      <Box sx={{ width: '100%', maxWidth: 400, bgcolor: '#fff', borderRadius: '16px', boxShadow: '0 12px 40px rgba(15, 35, 60, 0.12)', pt: 5, pb: 4, px: '14px', '@media (min-width: 381px)': { px: 4 }, textAlign: 'center' }}>
        <img src="/logo-sapa-yanfaskes-v2-256.png" alt="" width={64} height={64} style={{ display: 'block', margin: '0 auto 24px' }} />
        <Typography ref={judul} tabIndex={-1} component="h1" sx={{ fontSize: 24, fontWeight: 700, color: '#0f2a4d', outline: 'none', mb: 1 }}>
          {JUDUL[keadaan] ?? 'Verifikasi keamanan'}
        </Typography>
        {!JUDUL[keadaan] && (
          <Typography sx={{ fontSize: 14, color: '#5b6b7f', mb: 2.5 }}>
            Satu langkah lagi sebelum masuk ke SAPA Yanfaskes. Pemeriksaan ini biasanya selesai otomatis dalam beberapa detik.
          </Typography>
        )}
        {tampilWidget && <Box ref={wadah} sx={{ minHeight: 65, display: 'flex', justifyContent: 'center', mb: 2 }} />}
        {/* Wadah status selalu ada supaya pembaca layar mengumumkan setiap perubahan teksnya. */}
        <Box role="status" aria-live="polite" sx={{
          fontSize: 14, borderRadius: '8px', minHeight: 24, mb: 2,
          p: keadaan === 'berhasil' ? 1.5 : 0,
          color: keadaan === 'berhasil' ? '#14532d' : '#5b6b7f',
          bgcolor: keadaan === 'berhasil' ? '#e8f3ec' : 'transparent',
        }}>
          {!galat && pesan}
        </Box>
        {galat && pesan && (
          <Box role="alert" sx={{ fontSize: 14, borderRadius: '8px', p: 1.5, mb: 2, color: '#b42318', bgcolor: '#fdecea' }}>
            {pesan}
          </Box>
        )}
        {(keadaan === 'gagal' || keadaan === 'layanan') && param && siteKey && (
          <Button variant="contained" onClick={cobaLagi} sx={{ ...hijau, mb: 1.5 }}>Coba lagi</Button>
        )}
        {keadaan === 'berhasil' && tombolLanjut && lanjut && param && (
          <Button variant="contained" onClick={() => kirimKeAuth0(lanjut.alamat, param.state, lanjut.token)} sx={hijau}>Lanjutkan</Button>
        )}
        {(keadaan === 'tautan' || keadaan === 'kedaluwarsa') && (
          <Button variant="contained" onClick={keMasuk} sx={hijau}>
            {keadaan === 'tautan' ? 'Ke halaman masuk' : 'Kembali ke halaman masuk'}
          </Button>
        )}
        {(keadaan === 'gagal' || keadaan === 'layanan') && (
          <Button variant="text" onClick={keMasuk} sx={{ ...tombol, color: BIRU }}>Kembali ke halaman masuk</Button>
        )}
      </Box>
    </Box>
  );
}
