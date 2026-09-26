import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  email: string;
  password: string;
  role: 'Super Admin' | 'Admin KC Jember' | 'Verifikator Yanfaskes' | 'Viewer Eksekutif';
  status: 'Aktif' | 'Nonaktif';
  createdAt: string;
}

export interface AdminProfile {
  name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  isVerified: boolean;
  unverifiedEmail?: string | null;
}

interface UserStoreState {
  profile: AdminProfile;
  users: UserAccount[];
  updateProfile: (updated: Partial<AdminProfile>) => void;
  confirmEmailVerification: () => void;
  addUser: (user: Omit<UserAccount, 'id' | 'createdAt'>) => void;
  editUser: (id: string, user: Partial<UserAccount>) => void;
  deleteUser: (id: string) => boolean;
}

const DEFAULT_USERS: UserAccount[] = [
  {
    id: 'usr-1',
    username: 'superadmin',
    name: 'Super Administrator BPJS',
    email: 'superadmin@bpjs-kesehatan.go.id',
    password: 'SuperAdminSAPA2026#',
    role: 'Super Admin',
    status: 'Aktif',
    createdAt: '2026-01-15 08:00:00',
  },
  {
    id: 'usr-2',
    username: 'admin_jember',
    name: 'Andreas Dwi Rizko Nugroho',
    email: 'andreas.dwi@bpjs-kesehatan.go.id',
    password: 'JemberYanfaskes2026!',
    role: 'Super Admin',
    status: 'Aktif',
    createdAt: '2026-01-20 09:30:00',
  },
  {
    id: 'usr-3',
    username: 'verifikator_bpjs',
    name: 'Tim Verifikator Mutu FKRTL',
    email: 'verifikator@bpjs-kesehatan.go.id',
    password: 'VerifMutu2026*',
    role: 'Verifikator Yanfaskes',
    status: 'Aktif',
    createdAt: '2026-02-01 10:15:00',
  },
  {
    id: 'usr-4',
    username: 'direksi_view',
    name: 'Eksekutif Monitoring KC Jember',
    email: 'direksi@bpjs-kesehatan.go.id',
    password: 'Eksekutif2026$',
    role: 'Viewer Eksekutif',
    status: 'Aktif',
    createdAt: '2026-02-10 14:00:00',
  },
];

export const useUserStore = create<UserStoreState>()(
  persist(
    (set, get) => ({
      profile: {
        name: 'Andreas Dwi Rizko Nugroho',
        username: 'admin_jember',
        email: 'andreas.dwi@bpjs-kesehatan.go.id',
        password: 'JemberYanfaskes2026!',
        role: 'Super Admin',
        isVerified: true,
        unverifiedEmail: null,
      },
      users: DEFAULT_USERS,

      updateProfile: (updated) => {
        set((state) => {
          const newProfile = {
            ...state.profile,
            ...updated,
          };
          const currentUsername = state.profile.username;

          // Sinkronisasi otomatis ke daftar tabel pengguna (users)
          const updatedUsers = state.users.map((u) => {
            if (u.username === currentUsername || (updated.username && u.username === updated.username)) {
              return {
                ...u,
                name: updated.name ?? u.name,
                username: updated.username ?? u.username,
                email: (updated.unverifiedEmail || updated.email) ?? u.email,
                role: (updated.role as any) ?? u.role,
                ...(updated.password ? { password: updated.password } : {}),
              };
            }
            return u;
          });

          // Jika akun profil belum ada di users, tambahkan langsung
          const exists = updatedUsers.some((u) => u.username === newProfile.username);
          if (!exists) {
            updatedUsers.unshift({
              id: `usr-${Date.now()}`,
              username: newProfile.username,
              name: newProfile.name,
              email: newProfile.email,
              password: newProfile.password || 'JemberYanfaskes2026!',
              role: (newProfile.role as any) || 'Super Admin',
              status: 'Aktif',
              createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
            });
          }

          return {
            profile: newProfile,
            users: updatedUsers,
          };
        });
      },

      confirmEmailVerification: () => {
        set((state) => {
          const newEmail = state.profile.unverifiedEmail || state.profile.email;
          const currentUsername = state.profile.username;
          const updatedUsers = state.users.map((u) => {
            if (u.username === currentUsername) {
              return {
                ...u,
                email: newEmail,
              };
            }
            return u;
          });
          return {
            profile: {
              ...state.profile,
              email: newEmail,
              isVerified: true,
              unverifiedEmail: null,
            },
            users: updatedUsers,
          };
        });
      },

      addUser: (userData) => {
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const newUser: UserAccount = {
          id: `usr-${Date.now()}`,
          createdAt: now,
          ...userData,
        };
        set((state) => ({
          users: [newUser, ...state.users],
        }));
      },

      editUser: (id, userData) => {
        set((state) => {
          const updatedUsers = state.users.map((u) => (u.id === id ? { ...u, ...userData } : u));
          // Jika user yang diedit adalah user yang sedang login di profil, sinkronkan ke profil
          const editedUser = updatedUsers.find((u) => u.id === id);
          let newProfile = state.profile;
          if (editedUser && editedUser.username === state.profile.username) {
            newProfile = {
              ...state.profile,
              name: editedUser.name,
              email: editedUser.email,
              role: editedUser.role,
              ...(editedUser.password ? { password: editedUser.password } : {}),
            };
          }
          return {
            users: updatedUsers,
            profile: newProfile,
          };
        });
      },

      deleteUser: (id) => {
        const user = get().users.find((u) => u.id === id);
        // Proteksi akun superadmin & akun yang sedang login agar tidak terhapus
        if (user && (user.username === 'superadmin' || user.username === get().profile.username)) {
          return false;
        }
        set((state) => ({
          users: state.users.filter((u) => u.id !== id),
        }));
        return true;
      },
    }),
    {
      name: 'sapa-user-settings-storage',
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2 && persistedState) {
          persistedState.profile = {
            ...persistedState.profile,
            name: 'Andreas Dwi Rizko Nugroho',
            username: 'admin_jember',
            email: 'andreas.dwi@bpjs-kesehatan.go.id',
            role: 'Super Admin',
          };
          if (Array.isArray(persistedState.users)) {
            persistedState.users = persistedState.users.map((u: any) => {
              if (u.username === 'admin_jember') {
                return {
                  ...u,
                  name: 'Andreas Dwi Rizko Nugroho',
                  email: 'andreas.dwi@bpjs-kesehatan.go.id',
                  role: 'Super Admin',
                };
              }
              return u;
            });
          }
        }
        return persistedState;
      },
    }
  )
);
