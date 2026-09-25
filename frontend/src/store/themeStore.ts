import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

export const getSystemTheme = (): EffectiveTheme => {
  if (typeof window === 'undefined') return 'dark';

  // 1. Periksa waktu lokal komputer (Waktu Malam: 18:00 s.d. 05:59)
  const hour = new Date().getHours();
  const isNightByTime = hour < 6 || hour >= 18;

  // 2. Periksa preferensi skema warna OS (prefers-color-scheme)
  const prefersDarkOS = Boolean(
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Mode Sistem otomatis menjadi Dark jika malam hari ATAU jika OS secara eksplisit disetel ke Dark mode
  return (isNightByTime || prefersDarkOS) ? 'dark' : 'light';
};

export const applyThemeToDocument = (effectiveTheme: EffectiveTheme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(effectiveTheme);
  root.style.colorScheme = effectiveTheme;
};

interface ThemeState {
  theme: ThemeMode;
  effectiveTheme: EffectiveTheme;
  setTheme: (theme: ThemeMode) => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      effectiveTheme: 'dark',

      setTheme: (theme: ThemeMode) => {
        const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;
        applyThemeToDocument(effectiveTheme);
        set({ theme, effectiveTheme });
      },

      initTheme: () => {
        const syncSystemTheme = () => {
          if (get().theme === 'system') {
            const newEffective = getSystemTheme();
            if (get().effectiveTheme !== newEffective) {
              applyThemeToDocument(newEffective);
              set({ effectiveTheme: newEffective });
            }
          }
        };

        const currentTheme = get().theme;
        const effectiveTheme = currentTheme === 'system' ? getSystemTheme() : currentTheme;
        applyThemeToDocument(effectiveTheme);
        set({ effectiveTheme });

        if (typeof window !== 'undefined') {
          // 1. Pantau perubahan skema warna OS secara real-time
          if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', syncSystemTheme);
          }

          // 2. Pantau saat jendela aktif kembali atau tab dibuka (misal setelah sleep / perpindahan tab)
          window.addEventListener('focus', syncSystemTheme);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              syncSystemTheme();
            }
          });

          // 3. Pengecekan berkala setiap 60 detik untuk transisi pergantian jam 18:00 (malam) & 06:00 (pagi)
          window.setInterval(syncSystemTheme, 60000);
        }
      },
    }),
    {
      name: 'sapa-theme-storage',
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
