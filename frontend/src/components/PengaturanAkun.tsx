import { useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { buatPengirimTunggal, KETERANGAN_SANDI, kirimUbahSandi, periksaSandiBaru } from '../auth/akunLokal';
import { useSession } from '../auth/useSession';
import { DaftarSyarat } from './DaftarSyaratSandi';

// Pengaturan akun (akun lokal, mode bff): bagian Ubah password. Isian sandi hanya ada di state komponen dan
// dikosongkan setelah setiap jawaban server.

export function PengaturanAkun() {
  return <Box className="sapa-page">
    <Box sx={{ mb: 3 }}>
      <Typography component="h1" variant="h2">Pengaturan akun</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.75 }}>Kelola keamanan akun SAPA Anda.</Typography>
    </Box>
    <UbahPassword />
  </Box>;
}

export function UbahPassword() {
  const { muatUlang } = useSession();
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [berhasil, setBerhasil] = useState<string | null>(null);
  const [pengirim] = useState(() => buatPengirimTunggal(kirimUbahSandi));
  const kolomLama = useRef<HTMLInputElement>(null);
  const idSyarat = useId();
  const idGalat = useId();
  const { syarat, siap: sandiSiap } = periksaSandiBaru(baru, ulang, { nilai: lama, label: 'sandi lama' });
  const siap = Boolean(lama) && sandiSiap && !mengirim;

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (!siap || pengirim.sibuk()) return;
    setMengirim(true);
    setGalat(null);
    setBerhasil(null);
    await pengirim.kirim({ passwordLama: lama, passwordBaru: baru }, muatUlang, {
      kosongkanSandi: () => { setLama(''); setBaru(''); setUlang(''); },
      tampilkanGalat: setGalat,
      tampilkanBerhasil: setBerhasil,
      fokusSandiLama: () => kolomLama.current?.focus(),
    });
    setMengirim(false);
  };

  const terkait = galat ? idGalat : undefined;
  const dijelaskan = [idSyarat, terkait].filter(Boolean).join(' ');
  return <Paper component="section" elevation={0} aria-labelledby="ubah-password-title" sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3, maxWidth: 560 }}>
    <Typography id="ubah-password-title" component="h2" variant="h3" sx={{ mb: 1 }}>Ubah password</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>Setelah password diubah, semua perangkat lain yang sedang masuk akan dikeluarkan.</Typography>
    <Box component="form" method="post" noValidate onSubmit={kirim} aria-labelledby="ubah-password-title" aria-busy={mengirim}>
      <Stack spacing={2}>
        <Box id={idGalat} role="alert">{galat && <Alert role="presentation" severity="error">{galat}</Alert>}</Box>
        <Box role="status">{berhasil && <Alert severity="success">{berhasil}</Alert>}</Box>
        <TextField label="Sandi lama" name="password_lama" type="password" value={lama} onChange={event => setLama(event.target.value)}
          autoComplete="current-password" required fullWidth inputRef={kolomLama}
          slotProps={{ htmlInput: { 'aria-describedby': terkait } }} />
        <TextField label="Sandi baru" name="password_baru" type="password" value={baru} onChange={event => setBaru(event.target.value)}
          autoComplete="new-password" required fullWidth slotProps={{ htmlInput: { 'aria-describedby': dijelaskan } }} />
        <TextField label="Ulangi sandi baru" name="ulangi_password_baru" type="password" value={ulang} onChange={event => setUlang(event.target.value)}
          autoComplete="new-password" required fullWidth slotProps={{ htmlInput: { 'aria-describedby': dijelaskan } }} />
        <Typography variant="body2" color="text.secondary">{KETERANGAN_SANDI}</Typography>
        <DaftarSyarat id={idSyarat} syarat={syarat} warnaRedup="text.secondary" warnaTerpenuhi="success.main" />
        <Box>
          <Button type="submit" variant="contained" size="large" disabled={!siap}
            startIcon={mengirim ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined}>
            {mengirim ? 'Menyimpan…' : 'Ubah password'}
          </Button>
        </Box>
      </Stack>
    </Box>
  </Paper>;
}
