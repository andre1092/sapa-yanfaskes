import React from 'react';
import type { NavTab } from './Sidebar';

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
    <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 h-20 px-6 lg:px-8 flex items-center justify-between">
      {/* Left: Mobile hamburger & Page Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800 transition-colors"
          aria-label="Open sidebar"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
              Portal SAPA YANFASKES
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

      {/* Right: Security & Status Indicators */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-medium text-slate-300">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>SSO Active</span>
        </div>
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-800/50 text-xs font-medium text-cyan-300">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>Zero-Trust IAM</span>
        </div>
      </div>
    </header>
  );
};
