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
    name: 'Administrator Yanfaskes KC Jember',
    email: 'admin.jember@bpjs-kesehatan.go.id',
    password: 'JemberYanfaskes2026!',
    role: 'Admin KC Jember',
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
        name: 'Administrator Yanfaskes KC Jember',
        username: 'admin_jember',
        email: 'admin.jember@bpjs-kesehatan.go.id',
        password: 'JemberYanfaskes2026!',
        role: 'Super Admin',
        isVerified: true,
        unverifiedEmail: null,
      },
      users: DEFAULT_USERS,

      updateProfile: (updated) => {
        set((state) => ({
          profile: {
            ...state.profile,
            ...updated,
          },
        }));
      },

      confirmEmailVerification: () => {
        set((state) => {
          const newEmail = state.profile.unverifiedEmail || state.profile.email;
          return {
            profile: {
              ...state.profile,
              email: newEmail,
              isVerified: true,
              unverifiedEmail: null,
            },
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
        set((state) => ({
          users: state.users.map((u) => (u.id === id ? { ...u, ...userData } : u)),
        }));
      },

      deleteUser: (id) => {
        const user = get().users.find((u) => u.id === id);
        // Proteksi akun superadmin agar tidak terhapus
        if (user && user.username === 'superadmin') {
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
    }
  )
);
