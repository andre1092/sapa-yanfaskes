import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buangKataSandi } from './userStorePrivacy';

export interface AdminProfile {
  name: string;
  username: string;
  email: string;
  role: string;
  isVerified: boolean;
  unverifiedEmail?: string | null;
}

interface UserStoreState {
  profile: AdminProfile;
  updateProfile: (updated: Partial<AdminProfile>) => void;
  confirmEmailVerification: () => void;
}

export const useUserStore = create<UserStoreState>()(
  persist(
    (set) => ({
      profile: {
        name: 'Andreas Dwi Rizko Nugroho',
        username: 'admin_jember',
        email: 'andreas.dwi@bpjs-kesehatan.go.id',
        role: 'Super Admin',
        isVerified: true,
        unverifiedEmail: null,
      },

      updateProfile: (updated) => {
        set((state) => ({ profile: { ...state.profile, ...updated } }));
      },

      confirmEmailVerification: () => {
        set((state) => ({
          profile: {
            ...state.profile,
            email: state.profile.unverifiedEmail || state.profile.email,
            isVerified: true,
            unverifiedEmail: null,
          },
        }));
      },
    }),
    {
      name: 'sapa-user-settings-storage',
      version: 4,
      // Hanya profil yang disimpan di browser.
      partialize: (state) => ({ profile: state.profile }),
      migrate: (persistedState: any, version: number) => {
        if (!persistedState) return persistedState;
        if (version < 2) {
          persistedState.profile = {
            ...persistedState.profile,
            name: 'Andreas Dwi Rizko Nugroho',
            username: 'admin_jember',
            email: 'andreas.dwi@bpjs-kesehatan.go.id',
            role: 'Super Admin',
          };
        }
        // Kata sandi dan daftar akun contoh dari versi lama dibuang dari penyimpanan browser.
        const bersih = buangKataSandi(persistedState);
        delete bersih.users;
        return bersih;
      },
    },
  ),
);
