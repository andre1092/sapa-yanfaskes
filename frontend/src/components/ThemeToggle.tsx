import React, { useEffect } from 'react';
import { useThemeStore, type ThemeMode } from '../store/themeStore';
import { useLanguageStore } from '../store/languageStore';

interface ThemeToggleProps {
  variant?: 'compact' | 'expanded';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'compact', className = '' }) => {
  const { theme, effectiveTheme, setTheme, initTheme } = useThemeStore();
  const { t } = useLanguageStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const options: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
    {
      mode: 'light',
      label: t('theme_light'),
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      mode: 'dark',
      label: t('theme_dark'),
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
    },
    {
      mode: 'system',
      label: t('theme_system'),
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  if (variant === 'expanded') {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3.5 ${className}`}>
        {options.map((opt) => {
          const isActive = theme === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => setTheme(opt.mode)}
              className={`flex items-start justify-between gap-3 p-4 rounded-2xl border transition-all text-left cursor-pointer ${
                isActive
                  ? 'border-[#44853b] bg-[#d4ecd1]/35 dark:bg-emerald-500/15 shadow-md shadow-[#44853b]/15 ring-1 ring-[#44853b]/30'
                  : 'border-[#afbade]/30 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 hover:border-[#83a67e]/50 hover:bg-[#d4ecd1]/15 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isActive
                      ? 'bpjs-gradient text-white shadow-sm shadow-[#2b4390]/30'
                      : 'bg-[#afbade]/20 text-[#2b4390] dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {opt.icon}
                </div>
                <div>
                  <p className={`text-sm font-bold ${isActive ? 'text-[#2b4390] dark:text-emerald-300' : 'text-[#2b4390] dark:text-[#f7fcfa]'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-[#6573a1] dark:text-[#afbade] mt-0.5 leading-relaxed">
                    {opt.mode === 'system'
                      ? `Otomatis (${effectiveTheme === 'dark' ? 'Mode Gelap' : 'Mode Terang'})`
                      : `Tema ${opt.label.toLowerCase()} konsisten`}
                  </p>
                </div>
              </div>

              {isActive && (
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300">
                  ✓ Aktif
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center p-1 rounded-xl bg-slate-100/90 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800/80 backdrop-blur-md shadow-inner ${className}`}
      role="group"
      aria-label="Pemilih Tema"
    >
      {options.map((opt) => {
        const isActive = theme === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            onClick={() => setTheme(opt.mode)}
            title={`Mode ${opt.label}${opt.mode === 'system' ? ` (Aktif: ${effectiveTheme})` : ''}`}
            aria-pressed={isActive}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              isActive
                ? 'bpjs-gradient text-white shadow-md shadow-[#009B4D]/30 scale-[1.02]'
                : 'text-slate-600 dark:text-slate-400 hover:text-[#00529C] dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
            }`}
          >
            {opt.icon}
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};
