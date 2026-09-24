import React, { useEffect } from 'react';
import { useThemeStore, type ThemeMode } from '../store/themeStore';

interface ThemeToggleProps {
  variant?: 'compact' | 'expanded';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'compact', className = '' }) => {
  const { theme, effectiveTheme, setTheme, initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const options: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
    {
      mode: 'light',
      label: 'Terang',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      mode: 'dark',
      label: 'Gelap',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
    },
    {
      mode: 'system',
      label: 'Sistem',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  if (variant === 'expanded') {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${className}`}>
        {options.map((opt) => {
          const isActive = theme === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => setTheme(opt.mode)}
              className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left cursor-pointer ${
                isActive
                  ? 'border-emerald-500/60 bg-emerald-500/10 shadow-md shadow-emerald-950/20'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/60'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bpjs-gradient text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {opt.icon}
              </div>
              <div>
                <p className={`text-sm font-bold ${isActive ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {opt.label}
                </p>
                <p className="text-[11px] text-slate-400">
                  {opt.mode === 'system'
                    ? `Otomatis (${effectiveTheme === 'dark' ? 'Mode Gelap' : 'Mode Terang'})`
                    : `Tema ${opt.label.toLowerCase()} konsisten`}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center p-1 rounded-xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md shadow-inner ${className}`}
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
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isActive
                ? 'bpjs-gradient text-white shadow-sm shadow-emerald-900/40 scale-[1.02]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
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
