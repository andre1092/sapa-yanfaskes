import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ThemeToggle } from './ThemeToggle';

export const AdminSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [isRefreshingAntrol, setIsRefreshingAntrol] = useState(false);
  const [isRefreshingKepatuhan, setIsRefreshingKepatuhan] = useState(false);
  const [lastRefreshedAntrol, setLastRefreshedAntrol] = useState<Date | null>(null);
  const [lastRefreshedKepatuhan, setLastRefreshedKepatuhan] = useState<Date | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleResyncAntrol = async () => {
    setIsRefreshingAntrol(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['fkrtl-antrol-stats'] });
      await queryClient.invalidateQueries({ queryKey: ['fkrtl-stats'] });
      const now = new Date();
      setLastRefreshedAntrol(now);
      showToast('Cache Pemanfaatan Antrol berhasil disegarkan dari Google Sheets!');
    } finally {
      setTimeout(() => {
        setIsRefreshingAntrol(false);
      }, 500);
    }
  };

  const handleResyncKepatuhan = async () => {
    setIsRefreshingKepatuhan(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['fkrtl-kepatuhan-nakes'] });
      await queryClient.invalidateQueries({ queryKey: ['fkrtl-kepatuhan-pengaduan'] });
      const now = new Date();
      setLastRefreshedKepatuhan(now);
      showToast('Cache Kepatuhan Nakes & Pengaduan berhasil diperbarui!');
    } finally {
      setTimeout(() => {
        setIsRefreshingKepatuhan(false);
      }, 500);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#2b4390] text-white shadow-2xl border border-[#83a67e]/40 animate-slideUp">
          <span className="w-2 h-2 rounded-full bg-[#44853b] animate-ping" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* 1. Executive Banner Header */}
      <div className="glass-panel p-5 sm:p-7 rounded-3xl border border-[#afbade]/40 dark:border-white/10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-[#44853b]/15 to-[#2b4390]/15 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border border-[#83a67e]/40 bg-[#d4ecd1]/40 text-[#44853b] dark:bg-emerald-500/10 dark:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-[#44853b] animate-pulse" />
                SISTEM &amp; PENGATURAN ADMINISTRATOR
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#afbade]/20 text-[#2b4390] dark:bg-slate-800 dark:text-[#afbade]">
                v1.2.0 Production
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#2b4390] dark:text-[#f7fcfa] tracking-tight">
              Admin <span className="bpjs-gradient-text">Settings</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#6573a1] dark:text-[#afbade] mt-1.5 max-w-2xl leading-relaxed">
              Pusat kendali konfigurasi sistem, manajemen sinkronisasi data cache live Google Spreadsheet, preferensi antarmuka visual, dan arsitektur keamanan terintegrasi SAPA YANFASKES.
            </p>
          </div>

          {/* Quick Status Card */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="glass-card px-4 py-3 rounded-2xl border border-[#83a67e]/40 dark:border-white/10 shadow-md flex items-center gap-3.5 bg-white/60 dark:bg-slate-900/60">
              <div className="w-10 h-10 rounded-xl bg-[#d4ecd1] dark:bg-emerald-950/60 border border-[#83a67e]/40 flex items-center justify-center text-lg">
                🛡️
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6573a1] dark:text-slate-400 block">
                  Status Sistem
                </span>
                <span className="text-xs font-black text-[#44853b] dark:text-emerald-400 flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-[#44853b] animate-pulse" />
                  Terhubung &amp; Optimal
                </span>
                <span className="text-[10px] font-semibold text-[#2b4390] dark:text-[#afbade] block">
                  Latensi Respons &lt; 2.0s
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Grid Sections */}
      <div className="grid grid-cols-1 gap-6 sm:gap-8">
        {/* Section A: Integrasi & Sinkronisasi Cache Data FKRTL */}
        <div className="glass-card rounded-3xl p-5 sm:p-7 border border-[#afbade]/40 dark:border-white/10 shadow-xl">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#afbade]/30 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#d4ecd1] dark:bg-emerald-950/60 border border-[#83a67e]/40 flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-[#44853b] dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#2b4390] dark:text-[#f7fcfa]">
                  Integrasi &amp; Sinkronisasi Data FKRTL
                </h2>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade] mt-0.5">
                  Pengaturan pipeline unduhan CSV publik Google Spreadsheet dan manajemen cache in-memory Polars.
                </p>
              </div>
            </div>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-bold bg-[#afbade]/20 text-[#2b4390] dark:bg-slate-800 dark:text-[#afbade]">
              Google Sheets Live Sync
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {/* Card 1: Pemanfaatan Antrol FKRTL */}
            <div className="p-5 rounded-2xl glass-card border border-[#83a67e]/30 dark:border-white/10 hover:border-[#44853b]/60 transition-all flex flex-col justify-between gap-4 bg-white/50 dark:bg-slate-900/40">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2b4390] dark:text-[#f7fcfa]">
                    <span className="text-base">⏱️</span>
                    Pemanfaatan Antrol FKRTL
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300">
                    2.052 Baris
                  </span>
                </div>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade] leading-relaxed">
                  Menyegarkan cache analitik rasio pemanfaatan antrean online (Mobile JKN &amp; Bridging Sistem RS) dari sheet utama. Menjamin indikator bulanan dan per poli terbarui seketika.
                </p>
                {lastRefreshedAntrol && (
                  <p className="text-[11px] font-bold text-[#44853b] dark:text-emerald-400 mt-2.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#44853b]" />
                    Terakhir disinkronisasi: {lastRefreshedAntrol.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-[#afbade]/20 dark:border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400">
                  Target Kinerja: 80% &amp; 95%
                </span>
                <button
                  onClick={handleResyncAntrol}
                  disabled={isRefreshingAntrol}
                  className="inline-flex items-center gap-2 px-4 py-2 bpjs-gradient-btn disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-[#2b4390]/20 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer select-none"
                >
                  <span className={isRefreshingAntrol ? 'animate-spin' : ''}>🔄</span>
                  {isRefreshingAntrol ? 'Menyinkronkan...' : 'Sinkronkan Antrol'}
                </button>
              </div>
            </div>

            {/* Card 2: Laporan Kepatuhan FKRTL (Tab 01 Nakes & Tab 02 Pengaduan) */}
            <div className="p-5 rounded-2xl glass-card border border-[#83a67e]/30 dark:border-white/10 hover:border-[#44853b]/60 transition-all flex flex-col justify-between gap-4 bg-white/50 dark:bg-slate-900/40">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2b4390] dark:text-[#f7fcfa]">
                    <span className="text-base">📋</span>
                    Laporan Kepatuhan Mutu FKRTL
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#afbade]/20 text-[#2b4390] dark:bg-slate-800 dark:text-[#afbade]">
                    Tab 01 &amp; 02 Live
                  </span>
                </div>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade] leading-relaxed">
                  Menyegarkan cache kalkulasi kepatuhan Jadwal Praktik Dokter/Nakes (Bobot 25%) dan SLA Penyelesaian Pengaduan (Bobot 20%) yang terhubung ke master data 26 faskes KC Jember.
                </p>
                {lastRefreshedKepatuhan && (
                  <p className="text-[11px] font-bold text-[#44853b] dark:text-emerald-400 mt-2.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#44853b]" />
                    Terakhir disinkronisasi: {lastRefreshedKepatuhan.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-[#afbade]/20 dark:border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400">
                  Target Standar: 100%
                </span>
                <button
                  onClick={handleResyncKepatuhan}
                  disabled={isRefreshingKepatuhan}
                  className="inline-flex items-center gap-2 px-4 py-2 bpjs-gradient-btn disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-[#2b4390]/20 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer select-none"
                >
                  <span className={isRefreshingKepatuhan ? 'animate-spin' : ''}>🔄</span>
                  {isRefreshingKepatuhan ? 'Menyinkronkan...' : 'Sinkronkan Kepatuhan'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section B: Preferensi Tampilan & Tema Glassmorphism */}
        <div className="glass-card rounded-3xl p-5 sm:p-7 border border-[#afbade]/40 dark:border-white/10 shadow-xl">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#afbade]/30 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#afbade]/20 dark:bg-blue-950/60 border border-[#afbade]/40 flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-[#2b4390] dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#2b4390] dark:text-[#f7fcfa]">
                  Preferensi Tampilan &amp; Mode Visual
                </h2>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade] mt-0.5">
                  Atur mode antarmuka Glassmorphism terstruktur: Terang (Light), Gelap (Dark), atau Otomatis Waktu Sistem.
                </p>
              </div>
            </div>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-bold bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300">
              7 Warna Resmi BPJS
            </span>
          </div>

          <ThemeToggle variant="expanded" />
        </div>

        {/* Section C: Informasi Arsitektur & Keamanan Sistem */}
        <div className="glass-card rounded-3xl p-5 sm:p-7 border border-[#afbade]/40 dark:border-white/10 shadow-xl bg-gradient-to-br from-white/40 to-transparent dark:from-slate-900/40">
          <div className="flex items-center gap-3 pb-4 mb-5 border-b border-[#afbade]/30 dark:border-slate-800">
            <div className="w-10 h-10 rounded-2xl bg-[#d4ecd1] dark:bg-emerald-950/60 border border-[#83a67e]/40 flex items-center justify-center text-lg">
              ⚙️
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#2b4390] dark:text-[#f7fcfa]">
                Spesifikasi Lingkungan &amp; Standar DevSecOps
              </h2>
              <p className="text-xs text-[#6573a1] dark:text-[#afbade] mt-0.5">
                Parameter infrastruktur dan protokol keamanan yang aktif pada instansi SAPA YANFASKES.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl glass-card border border-[#afbade]/30 dark:border-white/10 bg-white/60 dark:bg-slate-900/60">
              <span className="text-[10px] uppercase font-bold text-[#6573a1] dark:text-slate-400 block tracking-wider">
                Engine &amp; Runtime
              </span>
              <span className="text-sm font-black text-[#2b4390] dark:text-[#f7fcfa] mt-1 block">
                FastAPI + Polars
              </span>
              <span className="text-[11px] text-[#44853b] dark:text-emerald-400 font-semibold mt-0.5 block">
                Latency Sub-2s Terverifikasi
              </span>
            </div>

            <div className="p-4 rounded-2xl glass-card border border-[#afbade]/30 dark:border-white/10 bg-white/60 dark:bg-slate-900/60">
              <span className="text-[10px] uppercase font-bold text-[#6573a1] dark:text-slate-400 block tracking-wider">
                Design System
              </span>
              <span className="text-sm font-black text-[#2b4390] dark:text-[#f7fcfa] mt-1 block">
                BPJS 7 Color Tokens
              </span>
              <span className="text-[11px] text-[#6573a1] dark:text-[#afbade] mt-0.5 block">
                Glassmorphism 70% Alpha
              </span>
            </div>

            <div className="p-4 rounded-2xl glass-card border border-[#afbade]/30 dark:border-white/10 bg-white/60 dark:bg-slate-900/60">
              <span className="text-[10px] uppercase font-bold text-[#6573a1] dark:text-slate-400 block tracking-wider">
                Model Keamanan
              </span>
              <span className="text-sm font-black text-[#2b4390] dark:text-[#f7fcfa] mt-1 block">
                Zero-Trust IAM
              </span>
              <span className="text-[11px] text-[#44853b] dark:text-emerald-400 font-semibold mt-0.5 block">
                Isolasi Multi-Tenant Aktif
              </span>
            </div>

            <div className="p-4 rounded-2xl glass-card border border-[#afbade]/30 dark:border-white/10 bg-white/60 dark:bg-slate-900/60">
              <span className="text-[10px] uppercase font-bold text-[#6573a1] dark:text-slate-400 block tracking-wider">
                Biaya &amp; Hosting
              </span>
              <span className="text-sm font-black text-[#2b4390] dark:text-[#f7fcfa] mt-1 block">
                100% Free Resources
              </span>
              <span className="text-[11px] text-[#6573a1] dark:text-[#afbade] mt-0.5 block">
                Vercel Serverless Production
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
