import { createContext, useContext } from 'react';

/** 'memeriksa': mode login belum diketahui; 'galat': mode tidak dapat dibaca dari server. */
export type ModeHalaman = 'memeriksa' | 'auth0' | 'bff' | 'galat';
/** Profil untuk tampilan saja (nama, email, foto); bukan sumber hak akses. */
export type ProfilSesi = { nama?: string; email?: string; foto?: string };
/** Keluar mode bff: menunggu jawaban server, atau gagal dengan sesi yang masih berlaku. */
export type KeadaanKeluar = { menunggu: boolean; galat: string | null };
export type SessionContext = {
  ready: boolean; authenticated: boolean; configured: boolean; error: string | null; login: () => Promise<void>;
  mode: ModeHalaman;
  /** Baca ulang sesi dari server; true bila sudah masuk. */
  muatUlang: () => Promise<boolean>;
  profil: ProfilSesi | null;
  /** Hanya mode bff: keadaan keluar, ulangi keluar, dan tutup pesan keluar gagal. */
  keluar?: KeadaanKeluar & { ulangi: () => void; batal: () => void };
};
export const Context = createContext<SessionContext>({
  ready: false, authenticated: false, configured: false, error: null, login: async () => {},
  mode: 'memeriksa', muatUlang: async () => false, profil: null,
});
export const useSession = () => useContext(Context);
