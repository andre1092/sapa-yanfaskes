import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ThemeToggle } from './ThemeToggle';

export const AdminSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const handleResync = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate frontend cache to force a live fetch from the backend
      await queryClient.invalidateQueries({ queryKey: ['fkrtl-antrol-stats'] });
      setLastRefreshed(new Date());
    } finally {
      // Small artificial delay for UI feedback
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full space-y-8 animate-fade-in">
      {/* Header with BPJS Theme */}
      <div className="flex items-center gap-3">
        <span className="w-2.5 h-8 rounded-full bpjs-gradient shadow-md shadow-emerald-500/40" />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Admin Settings</h1>
          <p className="text-sm text-slate-400 mt-0.5">Konfigurasi Sistem dan Manajemen Data SAPA YANFASKES</p>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="grid grid-cols-1 gap-6">
        {/* Dashboard FKRTL Section */}
        <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center shadow-md shadow-emerald-950/30">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Dashboard FKRTL</h2>
              <p className="text-xs text-slate-400">Pengaturan data dashboard Fasilitas Kesehatan Rujukan Tingkat Lanjutan</p>
            </div>
          </div>

          {/* Sub-sections */}
          <div className="space-y-4">
            {/* Pemanfaatan Antrol Item */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl glass-card border border-emerald-500/20 hover:border-emerald-500/35 transition-all">
              <div>
                <h3 className="text-sm font-bold text-emerald-300">Pemanfaatan Antrol</h3>
                <p className="text-xs text-slate-300 mt-1 max-w-lg leading-relaxed">
                  Sinkronisasi ulang data spreadsheet secara langsung. Ini akan menghapus cache sementara dan mengambil data terbaru dari Google Sheets.
                </p>
                {lastRefreshed && (
                  <p className="text-[11px] font-semibold text-emerald-400 mt-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Terakhir disinkronisasi: {lastRefreshed.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                )}
              </div>

              <button
                onClick={handleResync}
                disabled={isRefreshing}
                className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 bpjs-gradient-btn disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-950/40 border border-emerald-400/30 active:scale-95 cursor-pointer"
              >
                <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
                {isRefreshing ? 'Menyinkronkan...' : 'Sinkronisasi Data'}
              </button>
            </div>
          </div>
        </div>

        {/* Theme & Display Preferences Section */}
        <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-950/60 border border-blue-500/30 flex items-center justify-center shadow-md shadow-blue-950/30">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Preferensi Tampilan & Tema</h2>
              <p className="text-xs text-slate-400">Atur mode visual antarmuka: Mode Terang (Light), Mode Gelap (Dark), atau Mengikuti Sistem OS</p>
            </div>
          </div>

          <ThemeToggle variant="expanded" />
        </div>
      </div>
    </div>
  );
};
