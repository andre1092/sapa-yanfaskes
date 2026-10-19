import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  sub?: string;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  loginUser: (user: AuthUser, token?: string) => void;
  logoutUser: () => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        accessToken: null,
        user: null,
        isAuthenticated: false,
        setAuth: (accessToken, user) =>
          set({ accessToken, user, isAuthenticated: true }),
        loginUser: (user, token) =>
          set({
            accessToken: token || `token_${Date.now()}`,
            user,
            isAuthenticated: true,
          }),
        logoutUser: () =>
          set({ accessToken: null, user: null, isAuthenticated: false }),
        clearAuth: () =>
          set({ accessToken: null, user: null, isAuthenticated: false }),
      }),
      {
        name: 'auth-session',
        partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      }
    )
  )
);

