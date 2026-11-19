import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Box, Typography } from '@mui/material';
import { pasangWidget, type JenisGalatWidget, type KendaliWidget } from '../lib/turnstile';
import { WARNA } from './gayaMasuk';

const PESAN: Record<JenisGalatWidget | 'kunci', string> = {
  muat: 'Verifikasi keamanan tidak dapat dimuat. Periksa koneksi internet. Bila jaringan kantor memblokir challenges.cloudflare.com, hubungi administrator SAPA.',
  widget: 'Verifikasi keamanan belum berhasil. Tunggu sebentar atau muat ulang halaman.',
  kunci: 'Verifikasi keamanan belum dikonfigurasi. Hubungi administrator SAPA.',
};

type Props = {
  aksi: string;
  onToken: (token: string | null) => void;
  ref?: Ref<KendaliWidget | null>;
};

/** Satu widget Turnstile (render eksplisit). Dilepas saat komponen dilepas, jadi tidak pernah ada dua widget. */
export function WidgetTurnstile({ aksi, onToken, ref }: Props) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || '';
  const wadah = useRef<HTMLDivElement>(null);
  const kendali = useRef<KendaliWidget | null>(null);
  const tokenTerbaru = useRef(onToken);
  const [galat, setGalat] = useState<JenisGalatWidget | null>(null);
  useEffect(() => { tokenTerbaru.current = onToken; }, [onToken]);
  useImperativeHandle(ref, () => ({
    reset: () => { kendali.current?.reset(); },
    hapus: () => { kendali.current?.hapus(); },
  }), []);

  useEffect(() => {
    const el = wadah.current;
    if (!siteKey || !el) return;
    const k = pasangWidget(el, {
      siteKey, aksi,
      onToken: token => { if (token) setGalat(null); tokenTerbaru.current(token); },
      onGalat: setGalat,
    });
    kendali.current = k;
    return () => {
      k.hapus();
      if (kendali.current === k) kendali.current = null;
    };
  }, [siteKey, aksi]);

  const jenis = siteKey ? galat : 'kunci';
  return <Box>
    <Box ref={wadah} data-turnstile-aksi={aksi} sx={{ minHeight: 65, display: 'flex', justifyContent: 'center', maxWidth: '100%', '&[data-ukuran="flexible"] > *': { width: '100%' } }} />
    {jenis && <Typography role="alert" variant="body2" sx={{ mt: 1, color: WARNA.merah, textAlign: 'center' }}>{PESAN[jenis]}</Typography>}
  </Box>;
}
