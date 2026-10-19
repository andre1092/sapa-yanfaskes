import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserRole } from './userStore';

export type ActionType = 'LOGIN' | 'LOGOUT' | 'VIEW' | 'ADD' | 'UPDATE' | 'DELETE';
export type LogStatus = 'SUCCESS' | 'FAILED';
export type LogRole = UserRole | 'Tamu / Anonim';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: LogRole;
  action: ActionType;
  module: string;
  status: LogStatus;
  details: string;
  ipAddress: string;
  device: string;
}

interface LogState {
  logs: AuditLogEntry[];
  addLog: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  exportLogsToCsv: () => void;
}

// Fungsi bantu format timestamp Indonesia
export function formatLogTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = pad(now.getDate());
  const m = pad(now.getMonth() + 1);
  const y = now.getFullYear();
  const h = pad(now.getHours());
  const min = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  return `${d}/${m}/${y} ${h}:${min}:${s}`;
}

// Data seed awal realistis sistem SAPA Yanfaskes
const initialSeedLogs: AuditLogEntry[] = [
  {
    id: 'log_001',
    timestamp: '19/10/2026 21:12:45',
    userId: 'usr_001',
    userName: 'Andreas Dwi Rizko Nugroho',
    userRole: 'Super Admin',
    action: 'LOGIN',
    module: 'Otentikasi Akun',
    status: 'SUCCESS',
    details: 'Berhasil masuk ke sistem SAPA Yanfaskes melalui verifikasi Cloudflare Turnstile.',
    ipAddress: '10.14.88.21 (Intranet BPJS)',
    device: 'Chrome / macOS Sonoma',
  },
  {
    id: 'log_002',
    timestamp: '19/10/2026 21:14:10',
    userId: 'usr_001',
    userName: 'Andreas Dwi Rizko Nugroho',
    userRole: 'Super Admin',
    action: 'VIEW',
    module: 'Capaian Kepatuhan FKRTL',
    status: 'SUCCESS',
    details: 'Membuka modul Capaian Kepatuhan FKRTL (Konsolidasi 9 Tab Google Drive).',
    ipAddress: '10.14.88.21 (Intranet BPJS)',
    device: 'Chrome / macOS Sonoma',
  },
  {
    id: 'log_003',
    timestamp: '19/10/2026 20:55:02',
    userId: 'usr_guest',
    userName: 'dr_faskes_klinik',
    userRole: 'Tamu / Anonim',
    action: 'LOGIN',
    module: 'Otentikasi Akun',
    status: 'FAILED',
    details: 'Percobaan login gagal: Kata sandi yang dimasukkan tidak cocok dengan database akun.',
    ipAddress: '180.252.164.78 (Public ISP)',
    device: 'Firefox / Windows 11',
  },
  {
    id: 'log_004',
    timestamp: '19/10/2026 20:42:19',
    userId: 'usr_002',
    userName: 'dr. Siti Aminah, Sp.A',
    userRole: 'Admin',
    action: 'VIEW',
    module: 'Capaian Kepatuhan FKTP',
    status: 'SUCCESS',
    details: 'Meninjau grafik tren bulanan pemanfaatan antrol FKTP dan data detail antrean online.',
    ipAddress: '10.14.88.35 (Intranet BPJS)',
    device: 'Edge / Windows 10',
  },
  {
    id: 'log_005',
    timestamp: '19/10/2026 20:30:15',
    userId: 'usr_001',
    userName: 'Andreas Dwi Rizko Nugroho',
    userRole: 'Super Admin',
    action: 'ADD',
    module: 'Manajemen Pengguna',
    status: 'SUCCESS',
    details: 'Menambahkan akun pengguna baru: Ahmad Fauzi, S.Kom (@afauzi_kc - Role: Admin).',
    ipAddress: '10.14.88.21 (Intranet BPJS)',
    device: 'Chrome / macOS Sonoma',
  },
  {
    id: 'log_006',
    timestamp: '19/10/2026 20:22:40',
    userId: 'usr_002',
    userName: 'dr. Siti Aminah, Sp.A',
    userRole: 'Admin',
    action: 'DELETE',
    module: 'Manajemen Pengguna',
    status: 'FAILED',
    details: 'Gagal menghapus pengguna: Peran Admin tidak memiliki hak izin penghapusan (RBAC Restriction).',
    ipAddress: '10.14.88.35 (Intranet BPJS)',
    device: 'Edge / Windows 10',
  },
  {
    id: 'log_007',
    timestamp: '19/10/2026 20:10:08',
    userId: 'usr_003',
    userName: 'Budi Santoso, S.Kep',
    userRole: 'User',
    action: 'UPDATE',
    module: 'Integrasi Data FKRTL',
    status: 'FAILED',
    details: 'Gagal sinkronisasi data: Akses dibatasi hanya untuk Super Administrator.',
    ipAddress: '10.14.88.42 (Intranet BPJS)',
    device: 'Chrome / Windows 10',
  },
  {
    id: 'log_008',
    timestamp: '19/10/2026 19:48:33',
    userId: 'usr_guest',
    userName: 'anonymous_bot',
    userRole: 'Tamu / Anonim',
    action: 'LOGIN',
    module: 'Otentikasi Akun',
    status: 'FAILED',
    details: 'Percobaan login ditolak: Tantangan keamanan Cloudflare Turnstile belum terverifikasi.',
    ipAddress: '45.134.20.12 (External Cloud)',
    device: 'Python-Requests / Automated Bot',
  },
  {
    id: 'log_009',
    timestamp: '19/10/2026 19:35:12',
    userId: 'usr_001',
    userName: 'Andreas Dwi Rizko Nugroho',
    userRole: 'Super Admin',
    action: 'UPDATE',
    module: 'Manajemen Pengguna',
    status: 'SUCCESS',
    details: 'Memperbarui informasi status akun pengguna @budi_yanfaskes menjadi Aktif.',
    ipAddress: '10.14.88.21 (Intranet BPJS)',
    device: 'Chrome / macOS Sonoma',
  },
  {
    id: 'log_010',
    timestamp: '19/10/2026 19:15:00',
    userId: 'usr_001',
    userName: 'Andreas Dwi Rizko Nugroho',
    userRole: 'Super Admin',
    action: 'DELETE',
    module: 'Manajemen Pengguna',
    status: 'FAILED',
    details: 'Gagal menghapus akun: Akun Super Administrator utama terproteksi sistem dari penghapusan.',
    ipAddress: '10.14.88.21 (Intranet BPJS)',
    device: 'Chrome / macOS Sonoma',
  },
];

export const useLogStore = create<LogState>()(
  persist(
    (set, get) => ({
      logs: initialSeedLogs,

      addLog: (entry) => {
        const newLog: AuditLogEntry = {
          ...entry,
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp: formatLogTimestamp(),
        };
        set((state) => ({
          logs: [newLog, ...state.logs],
        }));
      },

      clearLogs: () => {
        set({ logs: [] });
      },

      exportLogsToCsv: () => {
        const { logs } = get();
        if (logs.length === 0) return;

        const headers = [
          'No',
          'Waktu',
          'User ID',
          'Nama Pengguna',
          'Peran / Role',
          'Aksi',
          'Modul',
          'Status',
          'Keterangan Detail',
          'Alamat IP',
          'Perangkat',
        ];

        const rows = logs.map((l, index) => [
          index + 1,
          `"${l.timestamp}"`,
          `"${l.userId}"`,
          `"${l.userName}"`,
          `"${l.userRole}"`,
          `"${l.action}"`,
          `"${l.module}"`,
          `"${l.status}"`,
          `"${l.details.replace(/"/g, '""')}"`,
          `"${l.ipAddress}"`,
          `"${l.device}"`,
        ]);

        const csvContent =
          '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute(
          'download',
          `SAPA_YANFASKES_AUDIT_LOGS_${new Date().toISOString().split('T')[0]}.csv`
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      },
    }),
    {
      name: 'sapa-audit-logs',
    }
  )
);
