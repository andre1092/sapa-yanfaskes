import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { buatPembacaMode } from './pembacaMode';
import { SesiCookie } from './SesiCookie';
import { Context } from './useSession';

const PESAN_MODE = 'Layanan masuk belum dapat dihubungi. Periksa koneksi internet lalu coba lagi.';

function SesiGagalDimuat({ children }: { children: ReactNode }) {
  return <Context.Provider value={{
    ready: true, authenticated: false, configured: false, error: PESAN_MODE,
    login: async () => { window.location.reload(); }, mode: 'galat', muatUlang: async () => false, profil: null,
  }}>{children}</Context.Provider>;
}

// SDK Auth0 hanya untuk mode lama dan dimuat terpisah; mode bff tidak pernah mengunduhnya.
const SesiAuth0 = lazy(() => import('./SesiAuth0').catch(() => ({ default: SesiGagalDimuat })));

const MEMERIKSA = {
  ready: false, authenticated: false, configured: true, error: null, login: async () => {},
  mode: 'memeriksa' as const, muatUlang: async () => false, profil: null,
};

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [pembaca] = useState(() => buatPembacaMode());
  const mode = useSyncExternalStore(pembaca.langganan, pembaca.ambil);
  useEffect(() => {
    try { localStorage.removeItem('auth-session'); } catch { /* Storage may be disabled; legacy state is never restored. */ }
  }, []);
  // Mode dibaca dari server setiap kali halaman dimuat (bukan dari variabel build), dan tidak ditebak bila gagal.
  useEffect(() => pembaca.muat(), [pembaca]);

  if (mode === 'bff') return <SesiCookie>{children}</SesiCookie>;
  if (mode === 'auth0') return <Suspense fallback={<Context.Provider value={MEMERIKSA}>{children}</Context.Provider>}><SesiAuth0>{children}</SesiAuth0></Suspense>;
  if (mode === 'galat') return <Context.Provider value={{
    ...MEMERIKSA, ready: true, configured: false, error: PESAN_MODE, mode: 'galat',
    login: async () => { pembaca.muat(); },
  }}>{children}</Context.Provider>;
  return <Context.Provider value={MEMERIKSA}>{children}</Context.Provider>;
}
