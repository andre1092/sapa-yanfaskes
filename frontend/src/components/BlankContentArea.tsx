import React from 'react';
import type { NavTab } from './Sidebar';

interface BlankContentAreaProps {
  activeTab: NavTab;
  onNavigate?: (tab: NavTab) => void;
}

export const BlankContentArea: React.FC<BlankContentAreaProps> = ({ activeTab, onNavigate }) => {
  // If activeTab is 'home', render the Rich Executive BPJS Healthcare Portal
  if (activeTab === 'home') {
    return (
      <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full space-y-8 animate-fade-in">
        {/* Executive Hero Banner with BPJS Glassmorphism */}
        <div className="relative rounded-3xl glass-card p-8 lg:p-10 border border-blue-200/80 dark:border-emerald-500/20 shadow-xl overflow-hidden">
          {/* Decorative Luminous BPJS Gradients */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#00529C]/15 dark:bg-[#00529C]/25 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-[#009B4D]/15 dark:bg-[#009B4D]/25 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 text-xs font-bold text-[#007A3D] dark:text-emerald-300 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-[#009B4D] animate-pulse" />
                <span>Portal Analitik Resmi BPJS Kesehatan</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-[#0A3C74] dark:text-white leading-tight">
                Saluran Analisis Performa & Akselerasi{' '}
                <span className="bpjs-gradient-text block sm:inline">SAPA YANFASKES</span>
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                Sistem terpadu monitoring dan evaluasi performa fasilitas kesehatan (FKTP & FKRTL) secara real-time. Terhubung langsung dengan basis data nasional BPJS Kesehatan dengan waktu respons berkecepatan tinggi sub-2-detik.
              </p>
            </div>

            {/* Quick Action Button to Main FKRTL Dashboard */}
            <div className="shrink-0 flex flex-col sm:flex-row lg:flex-col gap-3">
              <button
                onClick={() => onNavigate?.('fkrtl-antrol')}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bpjs-gradient-btn text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#009B4D]/30 border border-emerald-300/40 active:scale-95 cursor-pointer"
              >
                <span>Buka Dashboard Antrol FKRTL</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
              <div className="text-center lg:text-right">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Target Nasional Antrol: <span className="text-[#009B4D] dark:text-emerald-400 font-bold">&ge; 85%</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3 Main Executive Gateway Cards */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2.5 h-6 rounded-full bpjs-gradient shadow-sm" />
            <h2 className="text-lg font-bold text-[#00529C] dark:text-white tracking-tight">
              Modul Layanan Fasilitas Kesehatan
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: FKRTL Pemanfaatan Antrol */}
            <div className="glass-card rounded-2xl p-6 border border-blue-200/80 dark:border-emerald-500/20 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-500/30 flex items-center justify-center text-[#00529C] dark:text-blue-400 shadow-sm group-hover:scale-105 transition-transform">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-100 dark:bg-blue-950/70 text-[#00529C] dark:text-blue-300 border border-blue-300 dark:border-blue-700/50 uppercase tracking-wider">
                    FKRTL Rujukan
                  </span>
                </div>

                <h3 className="text-base font-bold text-[#0A3C74] dark:text-white group-hover:text-[#00529C] dark:group-hover:text-emerald-300 transition-colors">
                  Pemanfaatan Antrol Online
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                  Analisis rasio antrean online terbit via Mobile JKN dan Bridging RS terhadap total kunjungan SEP Rawat Jalan (RJTL).
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Live Data Ready
                </span>
                <button
                  onClick={() => onNavigate?.('fkrtl-antrol')}
                  className="text-xs font-bold text-[#00529C] dark:text-blue-400 hover:text-[#009B4D] dark:hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>Analisis Data</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>

            {/* Card 2: FKTP Dashboard */}
            <div className="glass-card rounded-2xl p-6 border border-emerald-200/80 dark:border-emerald-500/20 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center text-[#007A3D] dark:text-emerald-400 shadow-sm group-hover:scale-105 transition-transform">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950/70 text-[#007A3D] dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50 uppercase tracking-wider">
                    FKTP Primer
                  </span>
                </div>

                <h3 className="text-base font-bold text-[#0A3C74] dark:text-white group-hover:text-[#009B4D] dark:group-hover:text-emerald-300 transition-colors">
                  Monitoring Mutu FKTP
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                  Pemantauan kinerja Puskesmas, Klinik Pratama, dan Dokter Praktik Mandiri dalam penerapan kontak pertama dan skrining kesehatan.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Puskesmas &amp; Klinik
                </span>
                <button
                  onClick={() => onNavigate?.('fktp')}
                  className="text-xs font-bold text-[#007A3D] dark:text-emerald-400 hover:text-[#00529C] dark:hover:text-blue-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>Buka Modul</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>

            {/* Card 3: Admin Settings & IAM */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/90 dark:border-slate-700/60 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-[#0A3C74] dark:text-slate-300 shadow-sm group-hover:scale-105 transition-transform">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 uppercase tracking-wider">
                    Sistem &amp; IAM
                  </span>
                </div>

                <h3 className="text-base font-bold text-[#0A3C74] dark:text-white group-hover:text-[#00529C] dark:group-hover:text-emerald-300 transition-colors">
                  Konfigurasi &amp; Pengaturan
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                  Sinkronisasi cache spreadsheet secara instan, pengelolaan tenant context, dan personalisasi tema visual sistem.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Zero-Trust Enabled
                </span>
                <button
                  onClick={() => onNavigate?.('admin')}
                  className="text-xs font-bold text-[#00529C] dark:text-blue-400 hover:text-[#009B4D] dark:hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>Kelola Sistem</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Official BPJS Parameters & Institutional Indicators */}
        <div className="rounded-2xl glass-card p-6 border border-emerald-200/80 dark:border-emerald-500/20 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 pb-3 mb-4">
            <h3 className="text-xs font-bold text-[#00529C] dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#009B4D]" />
              Standar Evaluasi Integrasi Antrean Online BPJS Kesehatan
            </h3>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Parameter Resmi Yanfaskes</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/20">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#009B4D]" />
                <span className="text-xs font-bold text-[#007A3D] dark:text-emerald-300">Target Kinerja Optimal</span>
              </div>
              <p className="text-xl font-extrabold text-[#009B4D] dark:text-emerald-400 mt-2">&ge; 85%</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                Kepatuhan tinggi pemanfaatan antrean online oleh peserta JKN.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/20">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Kategori Cukup / Waspada</span>
              </div>
              <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-2">60% - 84.9%</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                Memerlukan monitoring dan edukasi kanal pendaftaran Mobile JKN.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/20">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00529C]" />
                <span className="text-xs font-bold text-[#00529C] dark:text-blue-300">Kanal Integrasi Resmi</span>
              </div>
              <p className="text-xl font-extrabold text-[#00529C] dark:text-blue-400 mt-2">Mobile JKN + Bridging</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                Kombinasi antrean terbit via aplikasi peserta dan sistem pendaftaran RS.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Placeholder for other tabs (e.g. FKTP when not yet populated)
  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full">
      <div className="relative min-h-[50vh] rounded-3xl border border-blue-200 dark:border-emerald-500/20 glass-card flex flex-col items-center justify-center p-8 text-center overflow-hidden shadow-md">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center mb-4 text-[#009B4D] dark:text-emerald-400 shadow-md">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#00529C] dark:text-white tracking-tight">
          Modul {activeTab.toUpperCase()}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
          Modul ini telah siap terhubung ke Web Service BPJS Kesehatan dan Google Spreadsheet.
        </p>
        <button
          onClick={() => onNavigate?.('fkrtl-antrol')}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bpjs-gradient-btn text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
        >
          <span>Buka Dashboard Aktif (FKRTL Antrol)</span>
          <span>&rarr;</span>
        </button>
      </div>
    </div>
  );
};
