import { create } from 'zustand';
import { logoutSession, modeSesi } from '../auth/session';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  sub?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  syncSession: (user: AuthUser | null) => void;
  logoutUser: () => void;
  clearAuth: () => void;
}

// UI projection only. Session authority stays with the provider: Auth0 (legacy, tokens in memory) or the server cookie session (bff).
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  syncSession: (user) => set({ user, isAuthenticated: Boolean(user) }),
  logoutUser: () => {
    // Mode bff: proyeksi baru dikosongkan setelah server mengakhiri sesi (halaman dimuat ulang).
    // Bila keluar gagal, cookie masih berlaku, jadi halaman masuk tidak boleh tampil seolah sudah keluar.
    if (modeSesi() !== 'bff') set({ user: null, isAuthenticated: false });
    logoutSession();
  },
  clearAuth: () => set({ user: null, isAuthenticated: false }),
}));
