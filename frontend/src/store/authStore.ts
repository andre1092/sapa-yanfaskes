import { create } from 'zustand';
import { logoutSession } from '../auth/session';

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

// UI projection only. Auth0 owns session authority and keeps tokens in memory.
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  syncSession: (user) => set({ user, isAuthenticated: Boolean(user) }),
  logoutUser: () => {
    set({ user: null, isAuthenticated: false });
    logoutSession();
  },
  clearAuth: () => set({ user: null, isAuthenticated: false }),
}));
