import React from 'react';
import type { NavTab } from './Sidebar';

interface BlankContentAreaProps {
  activeTab: NavTab;
}

const tabDescriptions: Record<NavTab, { name: string; subtitle: string; icon: React.ReactNode }> = {
  home: {
    name: 'Home',
    subtitle: 'Halaman Utama Portal SAPA YANFASKES',
    icon: (
      <svg className="w-10 h-10 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  fktp: {
    name: 'FKTP Dashboard',
    subtitle: 'Modul Analitik Fasilitas Kesehatan Tingkat Pertama',
    icon: (
      <svg className="w-10 h-10 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  fkrtl: {
    name: 'FKRTL Dashboard',
    subtitle: 'Modul Analitik Fasilitas Kesehatan Rujukan Tingkat Lanjutan',
    icon: (
      <svg className="w-10 h-10 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  'fkrtl-antrol': {
    name: 'Pemanfaatan Antrol',
    subtitle: 'Monitoring & Analisis Pemanfaatan Antrean Online FKRTL',
    icon: (
      <svg className="w-10 h-10 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  admin: {
    name: 'Admin Settings',
    subtitle: 'Modul Pengaturan Administrasi dan Konfigurasi',
    icon: (
      <svg className="w-10 h-10 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
};

export const BlankContentArea: React.FC<BlankContentAreaProps> = ({ activeTab }) => {
  const current = tabDescriptions[activeTab];

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full">
      {/* Blank Content Area Container */}
      <div className="relative min-h-[60vh] rounded-3xl border border-dashed border-slate-800 bg-slate-900/20 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center overflow-hidden">
        {/* Subtle decorative background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-tr from-cyan-500/5 to-teal-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-5 shadow-xl shadow-cyan-950/20">
            {current.icon}
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {current.name}
          </h2>
          <p className="text-sm text-slate-400 mt-1.5">
            {current.subtitle}
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-medium text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>Area Konten Siap Dikonfigurasi</span>
          </div>
        </div>
      </div>
    </div>
  );
};
