import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface User {
  sub: string;
  role: string;
}

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => void;
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
        clearAuth: () =>
          set({ accessToken: null, user: null, isAuthenticated: false }),
      }),
      {
        name: 'auth-session',
        // ONLY persist user info and auth status. Access token MUST NOT be stored in localStorage.
        partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      }
    )
  )
);
