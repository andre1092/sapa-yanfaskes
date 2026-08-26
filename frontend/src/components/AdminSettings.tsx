import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Admin Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Konfigurasi Sistem dan Manajemen Data</p>
      </div>

      {/* Settings Sections */}
      <div className="grid grid-cols-1 gap-6">
        {/* Dashboard FKRTL Section */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-5">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-200">Dashboard FKRTL</h2>
              <p className="text-xs text-slate-400">Pengaturan data dashboard Fasilitas Kesehatan Rujukan Tingkat Lanjut</p>
            </div>
          </div>

          {/* Sub-sections */}
          <div className="space-y-4">
            
            {/* Pemanfaatan Antrol Item */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 transition-colors">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Pemanfaatan Antrol</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-lg">
                  Sinkronisasi ulang data spreadsheet secara langsung. Ini akan menghapus cache sementara dan mengambil data terbaru dari Google Sheets.
                </p>
                {lastRefreshed && (
                  <p className="text-[10px] font-medium text-emerald-400 mt-2">
                    Terakhir disinkronisasi: {lastRefreshed.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </p>
                )}
              </div>

              <button
                onClick={handleResync}
                disabled={isRefreshing}
                className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-cyan-900/20 active:scale-95 cursor-pointer"
              >
                <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
                {isRefreshing ? 'Memproses...' : 'Resync Data'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
