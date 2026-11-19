import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { kirimMasuk } from '../auth/alurMasuk';
import { ajukanLupaSandi } from '../auth/bff';
import { useSession } from '../auth/useSession';
import type { KendaliWidget } from '../lib/turnstile';
import { ALERT_GALAT, ALERT_SUKSES, FOKUS, TOMBOL, WARNA } from './gayaMasuk';
import { WidgetTurnstile } from './WidgetTurnstile';

// Login satu halaman (mode bff): Username, Password, Ingat saya, Lupa password, dan Turnstile dalam satu
// kartu. Lupa password dibuka di kartu yang sama tanpa berpindah alamat. Isian hanya ada di memori komponen.

export const AKSI_MASUK = 'login';
export const AKSI_LUPA_SANDI = 'sapa_lupa_sandi';

const KOLOM = {
  '& .MuiOutlinedInput-root': { bgcolor: WARNA.kartu, color: WARNA.teks },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#c3ccd8' },
  '& .MuiInputLabel-root': { color: WARNA.redup },
  '& .MuiInputLabel-root.Mui-focused': { color: WARNA.biru },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: WARNA.biru, borderWidth: 2 },
} as const;
const TOMBOL_TEKS = { color: WARNA.biru, textTransform: 'none', fontWeight: 600, px: 1, minHeight: 44, ...FOKUS } as const;
const JUDUL = { mb: 1, color: WARNA.judul, outline: 'none', textAlign: 'center' } as const;

function Galat({ id, pesan }: { id: string; pesan: string | null }) {
  // Wadah role=alert selalu ada supaya pesan baru diumumkan pembaca layar; kosong saat tidak ada galat.
  return <Box id={id} role="alert">
    {pesan && <Alert role="presentation" severity="error" sx={ALERT_GALAT}>{pesan}</Alert>}
  </Box>;
}

type Panel = 'masuk' | 'lupa';

export function FormMasuk({ panelAwal = 'masuk' }: { panelAwal?: Panel }) {
  const [panel, setPanel] = useState<Panel>(panelAwal);
  const [username, setUsername] = useState('');
  const tombolLupa = useRef<HTMLButtonElement>(null);
  const judulLupa = useRef<HTMLHeadingElement>(null);
  const pindahPanel = useRef(false);

  useEffect(() => {
    // Fokus dipindah hanya setelah pengguna berganti panel, tidak saat halaman pertama dibuka.
    if (!pindahPanel.current) return;
    if (panel === 'lupa') judulLupa.current?.focus();
    else tombolLupa.current?.focus();
  }, [panel]);

  const ganti = (tujuan: Panel) => { pindahPanel.current = true; setPanel(tujuan); };
  return panel === 'masuk'
    ? <PanelMasuk username={username} onUsername={setUsername} onLupa={() => ganti('lupa')} tombolLupa={tombolLupa} />
    : <PanelLupaSandi identitasAwal={username} onKembali={() => ganti('masuk')} judul={judulLupa} />;
}

type PropsMasuk = { username: string; onUsername: (nilai: string) => void; onLupa: () => void; tombolLupa: RefObject<HTMLButtonElement | null> };

export function PanelMasuk({ username, onUsername, onLupa, tombolLupa }: PropsMasuk) {
  const session = useSession();
  const [password, setPassword] = useState('');
  const [lihat, setLihat] = useState(false);
  const [ingat, setIngat] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  // Galat dari penyedia sesi (misalnya layanan sesi bermasalah) tampil sampai pengguna mencoba masuk.
  const [sudahMencoba, setSudahMencoba] = useState(false);
  const widget = useRef<KendaliWidget | null>(null);
  const kolomPassword = useRef<HTMLInputElement>(null);
  const idGalat = useId();
  const idIngat = useId();
  const siap = Boolean(username.trim() && password && token) && !mengirim;
  const pesanGalat = galat || (sudahMencoba ? null : session.error);
  const terimaToken = useCallback((nilai: string | null) => setToken(nilai), []);

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (!siap || !token) return;
    setMengirim(true);
    setGalat(null);
    setSudahMencoba(true);
    const masuk = await kirimMasuk({ username, password, ingat, token }, widget.current, session.muatUlang, {
      kosongkanPassword: () => setPassword(''),
      buangToken: () => setToken(null),
      tampilkanGalat: setGalat,
      fokusPassword: () => kolomPassword.current?.focus(),
    });
    if (!masuk) setMengirim(false);
  };

  const tombolLihat = <InputAdornment position="end">
    <IconButton aria-label={lihat ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={lihat} onClick={() => setLihat(v => !v)} edge="end" sx={{ color: WARNA.redup, ...FOKUS }}>
      {lihat ? <IconEyeOff size={20} aria-hidden="true" /> : <IconEye size={20} aria-hidden="true" />}
    </IconButton>
  </InputAdornment>;
  const terkait = pesanGalat ? idGalat : undefined;

  return <Stack spacing={2.5} sx={{ width: '100%' }}>
    <Typography id="login-title" component="h1" variant="h2" sx={JUDUL}>Selamat datang kembali</Typography>
    <Box component="form" method="post" noValidate onSubmit={kirim} aria-labelledby="login-title" aria-busy={mengirim} sx={{ width: '100%' }}>
      <Stack spacing={2}>
        <Galat id={idGalat} pesan={pesanGalat} />
        <TextField label="Username" name="username" value={username} onChange={event => onUsername(event.target.value)}
          autoComplete="username" required fullWidth sx={KOLOM}
          slotProps={{ htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, maxLength: 254, 'aria-describedby': terkait } }} />
        <TextField label="Password" name="password" type={lihat ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)}
          autoComplete="current-password" required fullWidth inputRef={kolomPassword} sx={KOLOM}
          slotProps={{ input: { endAdornment: tombolLihat }, htmlInput: { 'aria-describedby': terkait } }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 1 }}>
          <Box>
            <FormControlLabel label="Ingat saya" sx={{ mr: 0, color: WARNA.teks }}
              control={<Checkbox name="ingat" checked={ingat} onChange={event => setIngat(event.target.checked)}
                slotProps={{ input: { 'aria-describedby': idIngat } }}
                sx={{ color: WARNA.redup, '&.Mui-checked': { color: WARNA.hijau }, '&.Mui-focusVisible': { outline: `3px solid ${WARNA.biru}`, outlineOffset: '-4px' } }} />} />
            <Typography id={idIngat} variant="caption" component="p" sx={{ color: WARNA.redup, mt: -0.5, ml: 4 }}>Jangan centang di komputer bersama.</Typography>
          </Box>
          <Button ref={tombolLupa} type="button" variant="text" onClick={onLupa} sx={TOMBOL_TEKS}>Lupa password?</Button>
        </Box>
        <WidgetTurnstile ref={widget} aksi={AKSI_MASUK} onToken={terimaToken} />
        <Button fullWidth size="large" variant="contained" type="submit" disabled={!siap}
          startIcon={mengirim ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined} sx={TOMBOL}>
          {mengirim ? 'Memproses…' : 'Masuk'}
        </Button>
      </Stack>
    </Box>
  </Stack>;
}

type PropsLupa = { identitasAwal: string; onKembali: () => void; judul: RefObject<HTMLHeadingElement | null> };

export function PanelLupaSandi({ identitasAwal, onKembali, judul }: PropsLupa) {
  const [identitas, setIdentitas] = useState(identitasAwal);
  const [token, setToken] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [diterima, setDiterima] = useState<string | null>(null);
  const widget = useRef<KendaliWidget | null>(null);
  const kotakDiterima = useRef<HTMLDivElement>(null);
  const idGalat = useId();
  const siap = Boolean(identitas.trim() && token) && !mengirim;
  const terimaToken = useCallback((nilai: string | null) => setToken(nilai), []);

  useEffect(() => { if (diterima) kotakDiterima.current?.focus(); }, [diterima]);

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (!siap || !token) return;
    setMengirim(true);
    setGalat(null);
    const hasil = await ajukanLupaSandi({ identitas: identitas.trim(), token }, widget.current);
    setMengirim(false);
    setToken(null);
    if (!hasil.ok) { setGalat(hasil.pesan); return; }
    setIdentitas('');
    setDiterima(hasil.pesan);
  };

  const kembali = <Button type="button" variant="text" fullWidth onClick={onKembali} sx={TOMBOL_TEKS}>Kembali ke halaman masuk</Button>;
  return <Stack spacing={2.5} sx={{ width: '100%' }}>
    <Box sx={{ textAlign: 'center' }}>
      <Typography ref={judul} tabIndex={-1} id="lupa-title" component="h1" variant="h2" sx={JUDUL}>Lupa password</Typography>
      <Typography sx={{ color: WARNA.redup }}>Tautan atur ulang password dikirim ke email akun Anda.</Typography>
    </Box>
    {diterima
      ? <Stack spacing={2}>
          <Alert ref={kotakDiterima} tabIndex={-1} role="status" severity="success" sx={{ ...ALERT_SUKSES, outline: 'none' }}>{diterima}</Alert>
          {kembali}
        </Stack>
      : <Box component="form" method="post" noValidate onSubmit={kirim} aria-labelledby="lupa-title" aria-busy={mengirim} sx={{ width: '100%' }}>
          <Stack spacing={2}>
            <Galat id={idGalat} pesan={galat} />
            <TextField label="Username atau email" name="identitas" value={identitas} onChange={event => setIdentitas(event.target.value)}
              autoComplete="username" required fullWidth sx={KOLOM}
              slotProps={{ htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, maxLength: 254, 'aria-describedby': galat ? idGalat : undefined } }} />
            <WidgetTurnstile ref={widget} aksi={AKSI_LUPA_SANDI} onToken={terimaToken} />
            <Button fullWidth size="large" variant="contained" type="submit" disabled={!siap}
              startIcon={mengirim ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined} sx={TOMBOL}>
              {mengirim ? 'Mengirim…' : 'Kirim tautan'}
            </Button>
            {kembali}
          </Stack>
        </Box>}
  </Stack>;
}
