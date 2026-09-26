import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SyncState {
  lastUpdateAntrol: string;
  lastUpdateNakes: string;
  lastUpdatePengaduan: string;
  lastUpdateUmabl: string;
  lastUpdateDisplayTt: string;
  lastUpdateAll: string;
  setSyncAntrol: (customTime?: string) => void;
  setSyncNakes: (customTime?: string) => void;
  setSyncPengaduan: (customTime?: string) => void;
  setSyncUmabl: (customTime?: string) => void;
  setSyncDisplayTt: (customTime?: string) => void;
  setSyncAll: (customTime?: string) => void;
}

export const formatCurrentTimestamp = (): string => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = pad(now.getDate());
  const m = pad(now.getMonth() + 1);
  const y = now.getFullYear();
  const h = pad(now.getHours());
  const min = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  return `${d}/${m}/${y} ${h}:${min}:${s}`;
};

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      lastUpdateAntrol: '26/09/2026 14:15:00',
      lastUpdateNakes: '26/09/2026 14:20:00',
      lastUpdatePengaduan: '26/09/2026 14:25:00',
      lastUpdateUmabl: '26/09/2026 14:30:00',
      lastUpdateDisplayTt: '26/09/2026 14:35:00',
      lastUpdateAll: '26/09/2026 14:35:00',

      setSyncAntrol: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateAntrol: time, lastUpdateAll: time });
      },

      setSyncNakes: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateNakes: time, lastUpdateAll: time });
      },

      setSyncPengaduan: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdatePengaduan: time, lastUpdateAll: time });
      },

      setSyncUmabl: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateUmabl: time, lastUpdateAll: time });
      },

      setSyncDisplayTt: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateDisplayTt: time, lastUpdateAll: time });
      },

      setSyncAll: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({
          lastUpdateAntrol: time,
          lastUpdateNakes: time,
          lastUpdatePengaduan: time,
          lastUpdateUmabl: time,
          lastUpdateDisplayTt: time,
          lastUpdateAll: time,
        });
      },
    }),
    {
      name: 'sapa-sync-storage',
    }
  )
);
