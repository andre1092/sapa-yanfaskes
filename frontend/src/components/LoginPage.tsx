import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material';
import { useSession } from '../auth/useSession';
import { FormMasuk } from './FormMasuk';
import { ALERT_GALAT, TOMBOL, WARNA } from './gayaMasuk';

// Adapted from Berry Free React's authentication/Login and AuthLogin layout.
// Satu kartu untuk semua mode: mode bff memakai form login satu halaman (FormMasuk), mode lama
// (SPA Auth0) tetap memakai tombol yang membuka layanan masuk seperti sebelumnya.
function Kartu({ children, kaki = false }: { children: ReactNode; kaki?: boolean }) {
  return (
    <Box component="main" className="berry-login" sx={{ minHeight: '100dvh', bgcolor: WARNA.latar, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: { xs: 2, sm: 3 } }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 480, p: { xs: 3, sm: 5 }, borderRadius: 3, border: 1, borderColor: WARNA.garis, bgcolor: WARNA.kartu, color: WARNA.teks }}>
        <Stack spacing={3} alignItems="center">
          <Stack spacing={1.5} alignItems="center" sx={{ textAlign: 'center' }}><span className="sapa-logo-halo" aria-hidden="true"><img className="sapa-logo sapa-logo--masuk" src="/logo-sapa-yanfaskes-v2-256.png" alt="" width={88} height={88} /></span><Box><Typography variant="h4" component="p" sx={{ color: WARNA.judul }}>SAPA Yanfaskes</Typography><Typography variant="caption" component="p" sx={{ color: WARNA.redup }}>Saluran Analisa Performa Pelayanan Fasilitas Kesehatan</Typography><Typography variant="caption" component="p" sx={{ color: WARNA.redup }}>BPJS Kesehatan</Typography></Box></Stack>
          {children}
        </Stack>
      </Paper>
      {kaki && <Typography variant="caption" sx={{ mt: 3, textAlign: 'center', color: WARNA.redup }}>Saluran Analisa Performa Pelayanan Fasilitas Kesehatan</Typography>}
    </Box>
  );
}

export function LoginPage() {
  const session = useSession();
  if (session.mode === 'bff') return <Kartu><FormMasuk /></Kartu>;
  if (session.mode === 'memeriksa') return <Kartu><Stack spacing={1.5} alignItems="center" role="status" aria-busy="true"><CircularProgress size={28} sx={{ color: WARNA.hijau }} aria-hidden="true" /><Typography sx={{ color: WARNA.redup }}>Memeriksa sesi…</Typography></Stack></Kartu>;
  if (session.mode === 'galat') return <Kartu><GalatMode /></Kartu>;
  return <HalamanMasukLama />;
}

function GalatMode() {
  const session = useSession();
  return <Stack spacing={2.5} sx={{ width: '100%' }}>
    <Typography component="h1" variant="h2" sx={{ color: WARNA.judul, textAlign: 'center' }}>Selamat datang kembali</Typography>
    <Box role="alert"><Alert role="presentation" severity="error" sx={ALERT_GALAT}>{session.error}</Alert></Box>
    <Button fullWidth size="large" variant="contained" onClick={() => void session.login()} sx={TOMBOL}>Coba lagi</Button>
  </Stack>;
}

/** Mode lama: tombol Masuk membuka layanan masuk; teks dan perilaku sama seperti sebelum mode bff. */
function HalamanMasukLama() {
  const session = useSession();
  const [redirecting, setRedirecting] = useState(false);
  const isLoading = !session.ready || redirecting;
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setRedirecting(true);
    try { await session.login(); } finally { setRedirecting(false); }
  };
  return (
    <Kartu kaki>
      <Box sx={{ textAlign: 'center' }}><Typography id="login-title" component="h1" variant="h2" sx={{ mb: 1, color: WARNA.judul }}>Selamat datang kembali</Typography><Typography sx={{ color: WARNA.redup }}>Masuk untuk melanjutkan pemantauan pelayanan fasilitas kesehatan.</Typography></Box>
      <Box component="form" onSubmit={handleSubmit} aria-labelledby="login-title" aria-busy={isLoading} sx={{ width: '100%' }}>
        <Stack spacing={2.5}>
          {session.error && <Alert id="login-error" severity="error" sx={ALERT_GALAT}>{session.error}</Alert>}
          <Typography variant="body2" textAlign="center" sx={{ color: WARNA.redup }}>Masuk dengan nama pengguna dan kata sandi akun SAPA Anda.</Typography>
          <Button fullWidth size="large" variant="contained" type="submit" disabled={isLoading || !session.configured} startIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : undefined} sx={TOMBOL}>{!session.ready ? 'Memeriksa sesi…' : redirecting ? 'Membuka layanan masuk…' : session.error && session.configured ? 'Coba masuk kembali' : 'Masuk'}</Button>
          <Typography role="status" variant="caption" textAlign="center" sx={{ color: WARNA.redup }}>{isLoading ? 'Mohon tunggu sebentar.' : 'Anda akan diarahkan ke halaman masuk yang aman.'}</Typography>
        </Stack>
      </Box>
      <Divider flexItem sx={{ borderColor: WARNA.garis }} />
      <Typography variant="body2" textAlign="center" sx={{ color: WARNA.redup }}>Lupa kata sandi? Pilih “Lupa kata sandi?” di halaman masuk, lalu buka tautan yang dikirim ke email akun Anda. Akun belum aktif atau terkunci? Hubungi administrator SAPA.</Typography>
    </Kartu>
  );
}
