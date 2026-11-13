import { useId, useState } from 'react';
import { Alert, Box, Button, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material';
import { IconCheck, IconCircle, IconEye, IconEyeOff } from '@tabler/icons-react';
import { apiClient } from '../lib/apiClient';
import { periksaSandi } from '../lib/syaratSandi';

interface GantiSandiWajibProps {
  nama: string;
  onSelesai: () => void;
  onKeluar: () => void;
}

/** Halaman penuh untuk petugas RS yang masih memakai sandi awal; menu SAPA belum tampil. */
export function GantiSandiWajib({ nama, onSelesai, onKeluar }: GantiSandiWajibProps) {
  const [sandi, setSandi] = useState('');
  const [ulang, setUlang] = useState('');
  const [lihat, setLihat] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState('');
  const idSyarat = useId();
  const { syarat, siap } = periksaSandi(sandi, ulang);

  const kirim = async () => {
    if (!siap) return;
    setMengirim(true);
    setGalat('');
    try {
      await apiClient.post('/api/v1/akun/ganti-sandi', { sandi_baru: sandi });
      setSandi('');
      setUlang('');
      onSelesai();
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setGalat(typeof detail === 'string' ? detail : 'Kata sandi gagal diganti. Coba lagi.');
    } finally {
      setMengirim(false);
    }
  };

  const tombolLihat = <InputAdornment position="end"><IconButton aria-label={lihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setLihat(v => !v)} edge="end">{lihat ? <IconEyeOff size={18} /> : <IconEye size={18} />}</IconButton></InputAdornment>;

  return <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2 }}>
    <Paper elevation={0} sx={{ width: 'min(440px, 100%)', p: { xs: 3, sm: 4 }, borderRadius: 3, border: 1, borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
        <Box component="img" src="/logo-sapa-yanfaskes-128.png" alt="" sx={{ width: 40, height: 40 }} />
        <Typography variant="h4" component="p">SAPA Yanfaskes</Typography>
      </Stack>
      <Typography variant="h2" component="h1" sx={{ mb: 1 }}>Ganti kata sandi awal</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Halo {nama}. Akun Anda masih memakai sandi awal dari Super Admin. Buat kata sandi baru sebelum membuka SAPA.</Typography>
      <Box component="form" noValidate onSubmit={event => { event.preventDefault(); void kirim(); }} sx={{ display: 'grid', gap: 2 }}>
        <TextField label="Kata sandi baru" type={lihat ? 'text' : 'password'} value={sandi} onChange={event => setSandi(event.target.value)} autoComplete="new-password" required autoFocus slotProps={{ input: { endAdornment: tombolLihat }, htmlInput: { 'aria-describedby': idSyarat, maxLength: 128 } }} />
        <TextField label="Ketik ulang kata sandi baru" type={lihat ? 'text' : 'password'} value={ulang} onChange={event => setUlang(event.target.value)} autoComplete="new-password" required slotProps={{ htmlInput: { 'aria-describedby': idSyarat, maxLength: 128 } }} />
        <Box component="ul" id={idSyarat} aria-label="Syarat kata sandi" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.75 }}>
          {syarat.map(s => <Box component="li" key={s.kunci} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: s.terpenuhi ? 'success.main' : 'text.secondary', fontSize: 14 }}>
            {s.terpenuhi ? <IconCheck size={16} aria-hidden="true" /> : <IconCircle size={16} aria-hidden="true" />}
            <span>{s.label}<Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{s.terpenuhi ? ', terpenuhi' : ', belum'}</Box></span>
          </Box>)}
        </Box>
        {galat && <Alert severity="error">{galat}</Alert>}
        <Button type="submit" variant="contained" size="large" disabled={!siap || mengirim}>{mengirim ? 'Menyimpan…' : 'Simpan dan masuk'}</Button>
        <Button onClick={onKeluar} disabled={mengirim}>Keluar</Button>
      </Box>
    </Paper>
  </Box>;
}
