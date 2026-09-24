import React from 'react';
import type { NavTab } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  activeTab: NavTab;
  onOpenMobileMenu: () => void;
}

const tabTitles: Record<NavTab, { title: string; subtitle: string; breadcrumb: string }> = {
  home: {
    title: 'Portal Overview',
    subtitle: 'Selamat datang di Saluran Analisis Performa & Akselerasi Fasilitas Kesehatan',
    breadcrumb: 'Beranda / Overview',
  },
  fktp: {
    title: 'FKTP Dashboard',
    subtitle: 'Monitoring Kinerja & Pemanfaatan Fasilitas Kesehatan Tingkat Pertama',
    breadcrumb: 'Faskes Primer / FKTP',
  },
  fkrtl: {
    title: 'FKRTL Dashboard',
    subtitle: 'Monitoring Kinerja & Rujukan Fasilitas Kesehatan Rujukan Tingkat Lanjutan',
    breadcrumb: 'Faskes Rujukan / FKRTL',
  },
  'fkrtl-antrol': {
    title: 'Pemanfaatan Antrean Online FKRTL',
    subtitle: 'Monitoring & Analisis Pemanfaatan Antrol Terintegrasi Mobile JKN & Bridging RS',
    breadcrumb: 'FKRTL / Pemanfaatan Antrol',
  },
  admin: {
    title: 'Admin Settings',
    subtitle: 'Manajemen Keamanan IAM, Database Context & Konfigurasi Sistem',
    breadcrumb: 'Sistem / Pengaturan Admin',
  },
};

export const Header: React.FC<HeaderProps> = ({ activeTab, onOpenMobileMenu }) => {
  const currentTab = tabTitles[activeTab];

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-slate-200/80 dark:border-emerald-500/20 h-20 px-6 lg:px-8 flex items-center justify-between shadow-sm relative overflow-hidden">
      {/* Top 2px BPJS Brand Gradient Stripe */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#009B4D] via-[#0A50A1] to-[#00529C]" />

      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-[#00529C] dark:hover:text-white bg-slate-100 dark:bg-emerald-950/40 border border-slate-200 dark:border-emerald-500/20 transition-all duration-200 cursor-pointer"
          aria-label="Buka menu sidebar"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[#009B4D] dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#009B4D] shadow-sm shadow-[#009B4D]/50" />
              SAPA YANFASKES
            </span>
            <span className="text-slate-400 dark:text-slate-600">•</span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {currentTab.breadcrumb}
            </span>
          </div>
          <h1 className="text-lg lg:text-xl font-extrabold tracking-tight text-[#00529C] dark:text-white mt-0.5">
            {currentTab.title}
          </h1>
        </div>
      </div>

      {/* Right: Theme Toggle & Executive BPJS Badges */}
      <div className="flex items-center gap-3">
        <ThemeToggle variant="compact" />

        {/* SSO Badge */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-500/30 text-xs font-bold text-[#007A3D] dark:text-emerald-300 shadow-sm">
          <div className="w-2 h-2 rounded-full bg-[#009B4D] animate-pulse" />
          <span>SSO BPJS Aktif</span>
        </div>

        {/* IAM Zero-Trust Badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-300 dark:border-blue-500/30 text-xs font-bold text-[#00529C] dark:text-blue-300 shadow-sm">
          <svg className="w-3.5 h-3.5 text-[#00529C] dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>Zero-Trust IAM</span>
        </div>
      </div>
    </header>
  );
};
