import { createContext, useContext } from 'react';

/** 'memeriksa': mode login belum diketahui; 'galat': mode tidak dapat dibaca dari server. */
export type ModeHalaman = 'memeriksa' | 'auth0' | 'bff' | 'galat';
/** Profil untuk tampilan saja (nama, email, foto); bukan sumber hak akses. */
export type ProfilSesi = { nama?: string; email?: string; foto?: string };
type SessionContext = {
  ready: boolean; authenticated: boolean; configured: boolean; error: string | null; login: () => Promise<void>;
  mode: ModeHalaman;
  /** Baca ulang sesi dari server; true bila sudah masuk. */
  muatUlang: () => Promise<boolean>;
  profil: ProfilSesi | null;
};
export const Context = createContext<SessionContext>({
  ready: false, authenticated: false, configured: false, error: null, login: async () => {},
  mode: 'memeriksa', muatUlang: async () => false, profil: null,
});
export const useSession = () => useContext(Context);
