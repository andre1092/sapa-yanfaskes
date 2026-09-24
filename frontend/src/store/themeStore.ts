import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

export const getSystemTheme = (): EffectiveTheme => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark'; // Fallback default
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
        const currentTheme = get().theme;
        const effectiveTheme = currentTheme === 'system' ? getSystemTheme() : currentTheme;
        applyThemeToDocument(effectiveTheme);
        set({ effectiveTheme });

        // Listen for OS color scheme changes in real-time
        if (typeof window !== 'undefined' && window.matchMedia) {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
          const handleChange = (e: MediaQueryListEvent) => {
            if (get().theme === 'system') {
              const newEffective = e.matches ? 'dark' : 'light';
              applyThemeToDocument(newEffective);
              set({ effectiveTheme: newEffective });
            }
          };
          mediaQuery.addEventListener('change', handleChange);
        }
      },
    }),
    {
      name: 'sapa-theme-storage',
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
