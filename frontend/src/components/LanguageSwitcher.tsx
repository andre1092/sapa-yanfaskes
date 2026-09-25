import React, { useState, useRef, useEffect } from 'react';
import { useLanguageStore, type Language } from '../store/languageStore';

interface LanguageSwitcherProps {
  className?: string;
}

const languages: { code: Language; label: string; flag: string; badge: string }[] = [
  { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩', badge: 'ID' },
  { code: 'en', label: 'English', flag: '🇬🇧', badge: 'EN' },
];

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className = '' }) => {
  const { language, setLanguage, t } = useLanguageStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find((l) => l.code === language) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md hover:border-[#009B4D]/50 dark:hover:border-emerald-500/40 text-slate-700 dark:text-slate-200 hover:text-[#00529C] dark:hover:text-white transition-all duration-200 shadow-xs cursor-pointer select-none"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={t('lang_select')}
        title={t('lang_select')}
      >
        <span className="text-base leading-none" role="img" aria-label={currentLang.label}>
          {currentLang.flag}
        </span>
        <span className="text-xs font-bold tracking-wide uppercase text-slate-800 dark:text-slate-200">
          {currentLang.badge}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#009B4D]' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Floating Glassmorphism Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-48 rounded-2xl glass-card border border-slate-200/90 dark:border-emerald-500/25 p-1.5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 overflow-hidden"
        >
          {/* Header Label */}
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/80 mb-1 flex items-center justify-between">
            <span>{t('lang_select')}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#009B4D]" />
          </div>

          {/* Options */}
          <div className="space-y-0.5">
            {languages.map((item) => {
              const isSelected = item.code === language;
              return (
                <button
                  key={item.code}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setLanguage(item.code);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-[#009B4D]/15 to-[#00529C]/15 dark:from-emerald-950/60 dark:to-blue-950/60 text-[#007A3D] dark:text-emerald-300 font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base leading-none">{item.flag}</span>
                    <span>{item.label}</span>
                  </div>
                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-[#009B4D] dark:text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
