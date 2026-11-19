import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuthStore, type AuthUser } from '../store/authStore';
import { HALAMAN_MASUK } from '../lib/halamanAwal';
import { bacaSesi, keluarSesi, type HasilSesi } from './bff';
import { mapSesiBff, registerCookieSession } from './session';
import { Context } from './useSession';

// Mode bff: sesi ada di server, browser hanya memegang cookie HttpOnly. Tidak ada SDK Auth0 di sini.

const KANAL = 'sapa-sesi';

function umumkanKeluar() {
  if (typeof BroadcastChannel === 'undefined') return;
  const kanal = new BroadcastChannel(KANAL);
  kanal.postMessage('keluar');
  kanal.close();
}

type Keadaan = { ready: boolean; user: AuthUser | null; error: string | null };

export function SesiCookie({ children }: { children: ReactNode }) {
  const [keadaan, setKeadaan] = useState<Keadaan>({ ready: false, user: null, error: null });

  const terapkan = useCallback((hasil: HasilSesi) => {
    const user = hasil.status === 'masuk' ? mapSesiBff(hasil.isi) : null;
    useAuthStore.getState().syncSession(user);
    setKeadaan({ ready: true, user, error: hasil.status === 'galat' ? hasil.pesan : null });
    return Boolean(user);
  }, []);
  const muatUlang = useCallback(async () => terapkan(await bacaSesi()), [terapkan]);

  useEffect(() => {
    let batal = false;
    void bacaSesi().then(hasil => { if (!batal) terapkan(hasil); });
    return () => { batal = true; };
  }, [terapkan]);

  useEffect(() => {
    if (!keadaan.user) return;
    return registerCookieSession(() => {
      void keluarSesi().then(hasil => {
        if (hasil.ok) {
          umumkanKeluar();
          // Muat ulang penuh: data halaman dan cache kueri tidak tersisa setelah keluar.
          window.location.replace(HALAMAN_MASUK);
          return;
        }
        setKeadaan(k => ({ ...k, user: null, error: hasil.pesan }));
      });
    });
  }, [keadaan.user]);

  // Keluar di tab lain: tab ini ikut ke halaman masuk.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const kanal = new BroadcastChannel(KANAL);
    kanal.onmessage = event => {
      if (event.data === 'keluar' && useAuthStore.getState().isAuthenticated) window.location.replace(HALAMAN_MASUK);
    };
    return () => kanal.close();
  }, []);

  const { ready, user, error } = keadaan;
  return <Context.Provider value={{
    ready, authenticated: Boolean(user), configured: true, error, login: async () => {},
    mode: 'bff', muatUlang, profil: user ? { nama: user.name } : null,
  }}>{children}</Context.Provider>;
}
