import React from 'react';
import type { NavTab } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  activeTab: NavTab;
  onOpenMobileMenu: () => void;
}

const tabTitles: Record<NavTab, { title: string; subtitle: string; breadcrumb: string }> = {
  home: {
    title: 'Home',
    subtitle: 'Selamat datang di Portal Layanan dan Analitik Fasilitas Kesehatan',
    breadcrumb: 'Home',
  },
  fktp: {
    title: 'FKTP Dashboard',
    subtitle: 'Monitoring Kinerja & Pemanfaatan Fasilitas Kesehatan Tingkat Pertama',
    breadcrumb: 'FKTP Dashboard',
  },
  fkrtl: {
    title: 'FKRTL Dashboard',
    subtitle: 'Monitoring Kinerja & Rujukan Fasilitas Kesehatan Rujukan Tingkat Lanjutan',
    breadcrumb: 'FKRTL Dashboard',
  },
  'fkrtl-antrol': {
    title: 'Pemanfaatan Antrol',
    subtitle: 'Monitoring & Analisis Pemanfaatan Antrean Online FKRTL',
    breadcrumb: 'FKRTL Dashboard / Pemanfaatan Antrol',
  },
  admin: {
    title: 'Admin Settings',
    subtitle: 'Manajemen Keamanan IAM, Database Context & Konfigurasi Sistem',
    breadcrumb: 'Admin Settings',
  },
};

export const Header: React.FC<HeaderProps> = ({ activeTab, onOpenMobileMenu }) => {
  const currentTab = tabTitles[activeTab];

  return (
    <header className="sticky top-0 z-30 bg-slate-950/65 backdrop-blur-xl border-b border-emerald-500/15 h-20 px-6 lg:px-8 flex items-center justify-between shadow-lg shadow-black/20">
      {/* Left: Mobile hamburger & Page Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-emerald-950/40 border border-emerald-500/20 transition-all duration-200"
          aria-label="Open sidebar"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
              SAPA YANFASKES
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-xs font-medium text-slate-400">
              {currentTab.breadcrumb}
            </span>
          </div>
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-white mt-0.5">
            {currentTab.title}
          </h1>
        </div>
      </div>

      {/* Right: Theme Toggle & Security Indicators with BPJS Theme */}
      <div className="flex items-center gap-3">
        <ThemeToggle variant="compact" />
        <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs font-semibold text-emerald-300 shadow-sm shadow-emerald-950/30">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>SSO Aktif</span>
        </div>
        <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs font-semibold text-blue-300 shadow-sm shadow-blue-950/30">
          <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>Zero-Trust IAM</span>
        </div>
      </div>
    </header>
  );
};
