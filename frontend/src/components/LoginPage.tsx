import { useState, type FormEvent } from 'react';
import { Alert, Box, Button, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material';
import { useSession } from '../auth/useSession';

export function LoginPage() {
  const session = useSession();
  const [redirecting, setRedirecting] = useState(false);
  const isLoading = !session.ready || redirecting;
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setRedirecting(true);
    try { await session.login(); } finally { setRedirecting(false); }
  };
  // Adapted from Berry Free React's authentication/Login and AuthLogin layout.
  return (
    <Box component="main" className="berry-login" sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: { xs: 2, sm: 3 } }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 480, p: { xs: 3, sm: 5 }, borderRadius: 3, border: 1, borderColor: 'divider' }}>
        <Stack spacing={3} alignItems="center">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Box component="img" src="/logo-sapa-yanfaskes.png" alt="" sx={{ width: 48, height: 48 }} /><Box><Typography variant="h4" component="p">SAPA Yanfaskes</Typography><Typography variant="caption" color="text.secondary">BPJS Kesehatan</Typography></Box></Box>
          <Box sx={{ textAlign: 'center' }}><Typography id="login-title" component="h1" variant="h2" color="secondary.main" sx={{ mb: 1 }}>Selamat datang kembali</Typography><Typography color="text.secondary">Masuk untuk melanjutkan pemantauan pelayanan fasilitas kesehatan.</Typography></Box>
          <Box component="form" onSubmit={handleSubmit} aria-labelledby="login-title" aria-busy={isLoading} sx={{ width: '100%' }}>
            <Stack spacing={2.5}>
              {session.error && <Alert id="login-error" severity="error">{session.error}</Alert>}
              <Typography variant="body2" color="text.secondary" textAlign="center">Gunakan akun organisasi Anda melalui layanan masuk yang aman.</Typography>
              <Button fullWidth size="large" variant="contained" color="secondary" type="submit" disabled={isLoading || !session.configured} startIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : undefined}>{!session.ready ? 'Memeriksa sesi…' : redirecting ? 'Membuka layanan masuk…' : session.error && session.configured ? 'Coba masuk kembali' : 'Masuk dengan SSO'}</Button>
              <Typography role="status" variant="caption" color="text.secondary" textAlign="center">{isLoading ? 'Mohon tunggu sebentar.' : 'Anda akan diarahkan ke halaman masuk Auth0.'}</Typography>
            </Stack>
          </Box>
          <Divider flexItem />
          <Typography variant="body2" color="text.secondary" textAlign="center">Lupa kata sandi atau akun belum aktif? Hubungi administrator untuk mendapatkan bantuan akses.</Typography>
        </Stack>
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>Sistem Analisis Pelayanan &amp; Antrean Fasilitas Kesehatan</Typography>
    </Box>
  );
}
