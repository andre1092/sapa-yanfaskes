import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { HALAMAN_MASUK } from '../lib/halamanAwal';
import { buatSesiCookie, KANAL_SESI, type KanalSesi } from './intiSesiCookie';
import { Context } from './useSession';

// Mode bff: sesi ada di server, browser hanya memegang cookie HttpOnly. Tidak ada SDK Auth0 di sini.
// Alurnya ada di intiSesiCookie.ts; komponen ini hanya menyambungkannya ke React, authStore, dan cache kueri.

function bukaKanal(terima: (pesan: unknown) => void): KanalSesi | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const kanal = new BroadcastChannel(KANAL_SESI);
  kanal.onmessage = event => terima(event.data);
  return { kirim: pesan => kanal.postMessage(pesan), tutup: () => kanal.close() };
}

export function SesiCookie({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [inti] = useState(() => buatSesiCookie({
    sinkronkan: user => useAuthStore.getState().syncSession(user),
    bersihkanCache: () => queryClient.clear(),
    // Muat ulang penuh: data halaman dan cache kueri tidak tersisa setelah keluar.
    keHalamanMasuk: () => window.location.replace(HALAMAN_MASUK),
    bukaKanal,
  }));
  const { ready, user, error, keluar } = useSyncExternalStore(inti.langganan, inti.ambil);
  useEffect(() => inti.mulai(), [inti]);

  return <Context.Provider value={{
    ready, authenticated: Boolean(user), configured: true, error, login: async () => {},
    mode: 'bff', muatUlang: inti.muatUlang, profil: user ? { nama: user.name } : null,
    keluar: { ...keluar, ulangi: () => { void inti.keluar(); }, batal: inti.tutupGalatKeluar },
  }}>{children}</Context.Provider>;
}
