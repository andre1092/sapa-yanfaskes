import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import {
  AKSI_SIAPKAN_AKUN, bacaSiapkanAkun, buatPengirimTunggal, KETERANGAN_SANDI, kirimSiapkanAkun, periksaIsianSiapkan,
  type JenisSiapkan, type KetersediaanSiapkan,
} from '../auth/akunLokal';
import { HALAMAN_MASUK } from '../lib/halamanAwal';
import type { KendaliWidget } from '../lib/turnstile';
import { DaftarSyarat } from './DaftarSyaratSandi';
import { Galat } from './FormMasuk';
import { Kartu, Menunggu } from './LoginPage';
import { ALERT_GALAT, FOKUS, KOLOM, TOMBOL, TOMBOL_TEKS, WARNA } from './gayaMasuk';
import { WidgetTurnstile } from './WidgetTurnstile';

// Halaman /siapkan-akun (akun lokal, mode bff), dibuka tanpa sesi. Form hanya tampil bila server menyatakan
// penyiapan atau pemulihan tersedia; selain itu halaman ini tidak ada. Isian hanya ada di state komponen.

const JUDUL = { color: WARNA.judul, textAlign: 'center', outline: 'none' } as const;

export function HalamanSiapkanAkun() {
  const [keadaan, setKeadaan] = useState<KetersediaanSiapkan | null>(null);
  const [percobaan, setPercobaan] = useState(0);
  useEffect(() => {
    let aktif = true;
    void bacaSiapkanAkun().then(hasil => { if (aktif) setKeadaan(hasil); });
    return () => { aktif = false; };
  }, [percobaan]);
  return <TampilanSiapkanAkun keadaan={keadaan} cobaLagi={() => { setKeadaan(null); setPercobaan(n => n + 1); }} />;
}

/** Isi halaman menurut jawaban server: memeriksa, galat (jaringan atau layanan, dengan Coba lagi), tidak ada (404), atau form. */
export function TampilanSiapkanAkun({ keadaan, cobaLagi }: { keadaan: KetersediaanSiapkan | null; cobaLagi: () => void }) {
  if (!keadaan) return <Kartu><Menunggu teks="Memeriksa halaman…" /></Kartu>;
  if (keadaan.status === 'galat') return <Kartu>
    <Stack spacing={2.5} sx={{ width: '100%' }}>
      <Typography component="h1" variant="h2" sx={JUDUL}>Siapkan akun</Typography>
      <Box role="alert"><Alert role="presentation" severity="error" sx={ALERT_GALAT}>{keadaan.pesan}</Alert></Box>
      <Button fullWidth size="large" variant="contained" onClick={cobaLagi} sx={TOMBOL}>Coba lagi</Button>
    </Stack>
  </Kartu>;
  if (keadaan.status === 'tidak_ada') return <Kartu><TidakDitemukan /></Kartu>;
  return <Kartu><FormSiapkanAkun jenis={keadaan.jenis} /></Kartu>;
}

export function TidakDitemukan() {
  return <Stack spacing={2.5} sx={{ width: '100%' }}>
    <Box sx={{ textAlign: 'center' }}>
      <Typography component="h1" variant="h2" sx={{ ...JUDUL, mb: 1 }}>Halaman tidak ditemukan</Typography>
      <Typography sx={{ color: WARNA.redup }}>Alamat ini tidak tersedia.</Typography>
    </Box>
    <Button fullWidth size="large" variant="contained" href={HALAMAN_MASUK} sx={TOMBOL}>Ke halaman masuk</Button>
  </Stack>;
}

const TEKS: Record<JenisSiapkan, { judul: string; pengantar: string; labelKode: string; pembanding: string; berhasil: string }> = {
  penyiapan: {
    judul: 'Siapkan akun',
    pengantar: 'Buat sandi untuk akun SAPA. Kode penyiapan hanya diketahui pemilik layanan.',
    labelKode: 'Kode penyiapan',
    pembanding: 'kode penyiapan',
    berhasil: 'Akun berhasil disiapkan. Silakan masuk dengan username dan sandi baru.',
  },
  pemulihan: {
    judul: 'Pulihkan akun',
    pengantar: 'Ganti sandi akun SAPA yang sudah ada. Semua sesi akun ini akan dikeluarkan.',
    labelKode: 'Kode pemulihan',
    pembanding: 'kode pemulihan',
    berhasil: 'Sandi berhasil diganti dan semua sesi lama sudah dikeluarkan. Silakan masuk dengan sandi baru.',
  },
};

export function FormSiapkanAkun({ jenis }: { jenis: JenisSiapkan }) {
  const teks = TEKS[jenis];
  const [username, setUsername] = useState('');
  const [kode, setKode] = useState('');
  const [lihatKode, setLihatKode] = useState(false);
  const [sandi, setSandi] = useState('');
  const [ulang, setUlang] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [selesai, setSelesai] = useState(false);
  const widget = useRef<KendaliWidget | null>(null);
  const kolomKode = useRef<HTMLInputElement>(null);
  const judulSelesai = useRef<HTMLHeadingElement>(null);
  const [pengirim] = useState(() => buatPengirimTunggal(kirimSiapkanAkun));
  const idGalat = useId();
  const idSyarat = useId();
  const { syarat, siap: isianSiap } = periksaIsianSiapkan({ username, kode, sandi, ulang, token }, teks.pembanding);
  const siap = isianSiap && !mengirim;
  const terimaToken = useCallback((nilai: string | null) => setToken(nilai), []);
  useEffect(() => { if (selesai) judulSelesai.current?.focus(); }, [selesai]);

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (!siap || !token || pengirim.sibuk()) return;
    setMengirim(true);
    setGalat(null);
    await pengirim.kirim({ username: username.trim(), kode, passwordBaru: sandi, token }, widget.current, {
      kosongkanRahasia: () => { setKode(''); setSandi(''); setUlang(''); },
      sembunyikanKode: () => setLihatKode(false),
      buangToken: () => setToken(null),
      tampilkanGalat: setGalat,
      fokusKode: () => kolomKode.current?.focus(),
      berhasil: () => setSelesai(true),
    });
    setMengirim(false);
  };

  if (selesai) return <Stack spacing={2.5} sx={{ width: '100%' }}>
    <Typography ref={judulSelesai} tabIndex={-1} component="h1" variant="h2" sx={JUDUL}>{teks.judul}</Typography>
    <Box role="status"><Alert severity="success">{teks.berhasil}</Alert></Box>
    <Button fullWidth size="large" variant="contained" href={HALAMAN_MASUK} sx={TOMBOL}>Ke halaman masuk</Button>
  </Stack>;

  const terkait = galat ? idGalat : undefined;
  const tombolLihat = <InputAdornment position="end">
    <IconButton aria-label={lihatKode ? 'Sembunyikan kode' : 'Tampilkan kode'} aria-pressed={lihatKode} onClick={() => setLihatKode(v => !v)} edge="end" sx={{ color: WARNA.redup, ...FOKUS }}>
      {lihatKode ? <IconEyeOff size={20} aria-hidden="true" /> : <IconEye size={20} aria-hidden="true" />}
    </IconButton>
  </InputAdornment>;

  return <Stack spacing={2.5} sx={{ width: '100%' }}>
    <Box sx={{ textAlign: 'center' }}>
      <Typography id="siapkan-title" component="h1" variant="h2" sx={{ ...JUDUL, mb: 1 }}>{teks.judul}</Typography>
      <Typography sx={{ color: WARNA.redup }}>{teks.pengantar}</Typography>
    </Box>
    <Box component="form" method="post" noValidate onSubmit={kirim} aria-labelledby="siapkan-title" aria-busy={mengirim} sx={{ width: '100%' }}>
      <Stack spacing={2}>
        <Galat id={idGalat} pesan={galat} />
        <TextField label="Username" name="username" value={username} onChange={event => setUsername(event.target.value)}
          autoComplete="username" required fullWidth sx={KOLOM}
          slotProps={{ htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, maxLength: 254, 'aria-describedby': terkait } }} />
        <TextField label={teks.labelKode} name="kode" type={lihatKode ? 'text' : 'password'} value={kode} onChange={event => setKode(event.target.value)}
          autoComplete="off" required fullWidth inputRef={kolomKode} sx={KOLOM}
          slotProps={{ input: { endAdornment: tombolLihat }, htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, maxLength: 256, 'aria-describedby': terkait } }} />
        <TextField label="Sandi baru" name="password_baru" type="password" value={sandi} onChange={event => setSandi(event.target.value)}
          autoComplete="new-password" required fullWidth sx={KOLOM}
          slotProps={{ htmlInput: { 'aria-describedby': [idSyarat, terkait].filter(Boolean).join(' ') } }} />
        <TextField label="Ulangi sandi baru" name="ulangi_password_baru" type="password" value={ulang} onChange={event => setUlang(event.target.value)}
          autoComplete="new-password" required fullWidth sx={KOLOM}
          slotProps={{ htmlInput: { 'aria-describedby': [idSyarat, terkait].filter(Boolean).join(' ') } }} />
        <Typography variant="body2" sx={{ color: WARNA.redup }}>{KETERANGAN_SANDI}</Typography>
        <DaftarSyarat id={idSyarat} syarat={syarat} />
        <WidgetTurnstile ref={widget} aksi={AKSI_SIAPKAN_AKUN} onToken={terimaToken} />
        <Button fullWidth size="large" variant="contained" type="submit" disabled={!siap}
          startIcon={mengirim ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined} sx={TOMBOL}>
          {mengirim ? 'Menyimpan…' : 'Simpan'}
        </Button>
        <Button href={HALAMAN_MASUK} variant="text" fullWidth sx={TOMBOL_TEKS}>Kembali ke halaman masuk</Button>
      </Stack>
    </Box>
  </Stack>;
}
