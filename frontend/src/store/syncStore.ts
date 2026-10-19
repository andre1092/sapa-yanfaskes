import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SyncState {
  // Stempel waktu masing-masing modul capaian
  lastUpdateRingkasan: string;
  lastUpdateNakes: string;
  lastUpdatePengaduan: string;
  lastUpdateUmabl: string;
  lastUpdateDisplayTt: string;
  lastUpdateTmo: string;
  lastUpdateAntreanWtl: string;
  lastUpdateSurkon: string;
  lastUpdateRme: string;
  lastUpdateAntrol: string;
  lastUpdateFktp: string;
  lastUpdateAll: string;

  // Setter individual
  setSyncRingkasan: (customTime?: string) => void;
  setSyncNakes: (customTime?: string) => void;
  setSyncPengaduan: (customTime?: string) => void;
  setSyncUmabl: (customTime?: string) => void;
  setSyncDisplayTt: (customTime?: string) => void;
  setSyncTmo: (customTime?: string) => void;
  setSyncAntreanWtl: (customTime?: string) => void;
  setSyncSurkon: (customTime?: string) => void;
  setSyncRme: (customTime?: string) => void;
  setSyncAntrol: (customTime?: string) => void;
  setSyncFktp: (customTime?: string) => void;

  // Setter generik per modul
  setSyncModule: (moduleId: string, customTime?: string) => void;

  // Master sync
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
      lastUpdateRingkasan: '19/10/2026 21:00:00',
      lastUpdateNakes: '19/10/2026 21:00:00',
      lastUpdatePengaduan: '19/10/2026 21:00:00',
      lastUpdateUmabl: '19/10/2026 21:00:00',
      lastUpdateDisplayTt: '19/10/2026 21:00:00',
      lastUpdateTmo: '19/10/2026 21:00:00',
      lastUpdateAntreanWtl: '19/10/2026 21:00:00',
      lastUpdateSurkon: '19/10/2026 21:00:00',
      lastUpdateRme: '19/10/2026 21:00:00',
      lastUpdateAntrol: '19/10/2026 21:00:00',
      lastUpdateFktp: '19/10/2026 21:00:00',
      lastUpdateAll: '19/10/2026 21:00:00',

      setSyncRingkasan: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateRingkasan: time, lastUpdateAll: time });
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

      setSyncTmo: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateTmo: time, lastUpdateAll: time });
      },

      setSyncAntreanWtl: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateAntreanWtl: time, lastUpdateAll: time });
      },

      setSyncSurkon: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateSurkon: time, lastUpdateAll: time });
      },

      setSyncRme: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateRme: time, lastUpdateAll: time });
      },

      setSyncAntrol: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateAntrol: time, lastUpdateAll: time });
      },

      setSyncFktp: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({ lastUpdateFktp: time, lastUpdateAll: time });
      },

      setSyncModule: (moduleId, customTime) => {
        const time = customTime || formatCurrentTimestamp();
        switch (moduleId) {
          case 'ringkasan':
            set({ lastUpdateRingkasan: time, lastUpdateAll: time });
            break;
          case 'nakes':
            set({ lastUpdateNakes: time, lastUpdateAll: time });
            break;
          case 'pengaduan':
            set({ lastUpdatePengaduan: time, lastUpdateAll: time });
            break;
          case 'umabl':
            set({ lastUpdateUmabl: time, lastUpdateAll: time });
            break;
          case 'display-tt':
            set({ lastUpdateDisplayTt: time, lastUpdateAll: time });
            break;
          case 'tmo':
            set({ lastUpdateTmo: time, lastUpdateAll: time });
            break;
          case 'antrean-wtl':
            set({ lastUpdateAntreanWtl: time, lastUpdateAll: time });
            break;
          case 'surkon':
            set({ lastUpdateSurkon: time, lastUpdateAll: time });
            break;
          case 'rme':
            set({ lastUpdateRme: time, lastUpdateAll: time });
            break;
          case 'antrol':
            set({ lastUpdateAntrol: time, lastUpdateAll: time });
            break;
          case 'fktp':
            set({ lastUpdateFktp: time, lastUpdateAll: time });
            break;
          default:
            set({ lastUpdateAll: time });
            break;
        }
      },

      setSyncAll: (customTime) => {
        const time = customTime || formatCurrentTimestamp();
        set({
          lastUpdateRingkasan: time,
          lastUpdateNakes: time,
          lastUpdatePengaduan: time,
          lastUpdateUmabl: time,
          lastUpdateDisplayTt: time,
          lastUpdateTmo: time,
          lastUpdateAntreanWtl: time,
          lastUpdateSurkon: time,
          lastUpdateRme: time,
          lastUpdateAntrol: time,
          lastUpdateFktp: time,
          lastUpdateAll: time,
        });
      },
    }),
    {
      name: 'sapa-sync-storage',
    }
  )
);
