import React, { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useFkrtlAntrolData } from '../hooks/useDashboardData';
import type { FkrtlFilterParams } from '../hooks/useDashboardData';
import { apiClient } from '../lib/apiClient';

const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE || '';

export const PemanfaatanAntrolDashboard: React.FC = () => {
  const { getAccessTokenSilently } = useAuth0();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const interceptor = apiClient.interceptors.request.use(async (config) => {
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: AUTH0_AUDIENCE,
          },
        });
        config.headers.Authorization = `Bearer ${token}`;
      } catch (e) {
        console.error('Auth0 Token Error', e);
      }
      return config;
    });

    setAuthReady(true);
    return () => apiClient.interceptors.request.eject(interceptor);
  }, [getAccessTokenSilently]);

  // Filters State
  const [filters, setFilters] = useState<FkrtlFilterParams>({
    tahun: '2026',
    bulan: '(All)',
    kabupaten: '(All)',
    kelas_rs: '(All)',
    sumber: 'Semua Sumber',
  });

  const { data, isLoading, isError, error, refetch } = useFkrtlAntrolData(filters, authReady);

  const handleFilterChange = (key: keyof FkrtlFilterParams, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const formatPercentID = (num: number | undefined): string => {
    if (num === undefined || isNaN(num)) return '0,00%';
    return num.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-300">Memuat Data Pemanfaatan Antrol FKRTL...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 lg:p-8">
        <div className="bg-rose-500/10 border border-rose-500/30 p-6 rounded-2xl text-center max-w-xl mx-auto">
          <svg className="w-10 h-10 text-rose-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-bold text-white">Gagal Mengambil Data Google Sheets</h3>
          <p className="text-xs text-slate-400 mt-2">{(error as any)?.response?.data?.detail || error?.message || 'Terjadi kesalahan sistem.'}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Coba Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  const isNoData = !data || data.status === 'no_data' || (data.trend_per_bulan.length === 0 && data.top_faskes.length === 0);

  const filterOptions = data?.filter_options || {
    tahun: ['2026'],
    bulan: ['(All)', 'Agustus 2026', 'Juli 2026'],
    kabupaten: ['(All)'],
    kelas_rs: ['(All)'],
    sumber: ['Semua Sumber', 'Mobile JKN'],
  };

  const lastUpdate = data?.last_update || 'No data available.';
  const selectedPeriod = data?.selected_period || (filters.bulan !== '(All)' ? filters.bulan : (filterOptions.bulan[1] || 'Agustus 2026'));
  const kpiValue = data?.kpi_capaian ?? 0.0;

  // Max value for bar scaling
  const maxTrend = Math.max(...(data?.trend_per_bulan.map((t) => t.avg_capaian) || [100]), 100);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Top Main Title Header */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl py-4 px-6 text-center shadow-lg">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
          Pemanfaatan Sistem Antrean Online FKRTL
        </h2>
      </div>

      {/* Main Grid Layout: Left Panel + Right Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Last Update, KPI, Filters & Keterangan (Col span 3.5 / 12) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          {/* 1. Last Update Header (Sourced from the final row of spreadsheet) */}
          <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl px-4 py-2.5 shadow-sm">
            <span className="text-xs font-semibold italic text-rose-400 block tracking-wide">
              Last Update : {lastUpdate}
            </span>
          </div>

          {/* 2. Pemanfaatan KPI Card */}
          <div className="rounded-xl overflow-hidden border border-slate-700 shadow-md">
            <div className="bg-gradient-to-r from-[#2f557f] to-[#3e6b99] px-4 py-3 text-center border-b border-[#4d7cae]/50">
              <h3 className="text-base font-bold text-white tracking-wide">Pemanfaatan</h3>
              <p className="text-xs italic text-cyan-200 mt-0.5">Periode {selectedPeriod}</p>
            </div>
            <div className="bg-slate-900/90 py-5 text-center">
              <span className="text-4xl font-extrabold text-white tracking-tight">
                {formatPercentID(kpiValue)}
              </span>
            </div>
          </div>

          {/* 3. Filter Controls Box */}
          <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-4 space-y-3.5 shadow-sm">
            {/* Tahun Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Tahun</label>
              <select
                value={filters.tahun || (filterOptions.tahun[0] || '2026')}
                onChange={(e) => handleFilterChange('tahun', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-cyan-400 transition-colors"
              >
                {filterOptions.tahun.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Bulan Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Bulan</label>
              <select
                value={filters.bulan || '(All)'}
                onChange={(e) => handleFilterChange('bulan', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-cyan-400 transition-colors"
              >
                {filterOptions.bulan.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Kabupaten Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Kabupaten</label>
              <select
                value={filters.kabupaten || '(All)'}
                onChange={(e) => handleFilterChange('kabupaten', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-cyan-400 transition-colors"
              >
                {filterOptions.kabupaten.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            {/* Kelas_RS Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Kelas_RS</label>
              <select
                value={filters.kelas_rs || '(All)'}
                onChange={(e) => handleFilterChange('kelas_rs', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-cyan-400 transition-colors"
              >
                {filterOptions.kelas_rs.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Sumber Antrean Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Sumber Antrean</label>
              <select
                value={filters.sumber || 'Semua Sumber'}
                onChange={(e) => handleFilterChange('sumber', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-cyan-400 transition-colors"
              >
                {filterOptions.sumber.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Keterangan Box */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-slate-400 text-xs leading-relaxed space-y-1">
            <span className="font-bold text-slate-200 block">Keterangan :</span>
            <p>- Validasi Jumlah Kunjungan berdasarkan Nomor Kartu, Tanggal Pelayanan, Faskes Layan dan Poli sama</p>
          </div>
        </div>

        {/* Right Content Area: Tren Perbulan + (Faskes & Poli Tujuan) (Col span 8.5 / 12) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          {isNoData ? (
            /* No Data State */
            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[450px]">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4 text-slate-400">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">{data?.message || 'No data available.'}</h3>
              <p className="text-xs text-slate-400 mt-2 max-w-sm">
                No matching records found for the selected filter parameters and Timestamp range in the spreadsheet dataset.
              </p>
              <button
                onClick={() => setFilters({ tahun: '2026', bulan: '(All)', kabupaten: '(All)', kelas_rs: '(All)', sumber: 'Semua Sumber' })}
                className="mt-5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <>
              {/* Top: Tren Perbulan Bar Chart */}
              <div className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-center text-slate-200 mb-6 uppercase tracking-wider">
                  Tren Perbulan
                </h3>

                <div className="h-64 flex items-end justify-between gap-2 sm:gap-4 px-2 sm:px-6 pt-8 pb-2 border-b border-slate-700/60">
                  {data.trend_per_bulan.map((item, idx) => {
                    const heightPercent = Math.min(Math.max((item.avg_capaian / maxTrend) * 100, 10), 100);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                        {/* Percentage Label Above Bar */}
                        <span className="text-[11px] font-bold text-cyan-300 mb-1.5 whitespace-nowrap transition-transform group-hover:scale-110">
                          {formatPercentID(item.avg_capaian)}
                        </span>

                        {/* Bar */}
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full max-w-[54px] rounded-t-md bg-[#4c76a3] hover:bg-[#5b8cbe] border-t-2 border-[#81aedb] transition-all duration-300 shadow-md shadow-slate-950/40 relative"
                        >
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-white/10 rounded-t-md pointer-events-none" />
                        </div>

                        {/* Month X-Axis Label */}
                        <span className="text-[11px] font-medium text-slate-400 mt-2 whitespace-nowrap">
                          {item.month}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom: Two-Column Ranking (Faskes & Poli Tujuan) */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Left Sub-Column: Faskes Ranking */}
                <div className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Faskes</h4>
                    <span className="text-[10px] text-slate-400">Pemanfaatan</span>
                  </div>

                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {data.top_faskes.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-slate-200 truncate flex-1" title={f.faskes}>
                          {f.faskes}
                        </span>

                        {/* Horizontal Percentage Bar */}
                        <div className="w-36 sm:w-44 bg-slate-950 rounded-md overflow-hidden h-6 flex items-center relative border border-slate-800 shrink-0">
                          <div
                            style={{ width: `${Math.min(f.avg_capaian, 100)}%` }}
                            className="h-full bg-[#4c76a3] transition-all duration-500"
                          />
                          <span className="absolute right-2 text-[10.5px] font-bold text-white drop-shadow">
                            {formatPercentID(f.avg_capaian)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Sub-Column: Poli Tujuan Ranking */}
                <div className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Poli Tujuan</h4>
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                      </svg>
                    </div>
                    <span className="text-[10px] text-slate-400">Pemanfaatan</span>
                  </div>

                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {data.top_poli.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs italic">
                        Tidak ada data tersedia
                      </div>
                    ) : (
                      data.top_poli.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-semibold text-slate-200 truncate flex-1" title={p.poli}>
                            {p.poli}
                          </span>

                          {/* Horizontal Percentage Bar */}
                          <div className="w-36 sm:w-44 bg-slate-950 rounded-md overflow-hidden h-6 flex items-center relative border border-slate-800 shrink-0">
                            <div
                              style={{ width: `${Math.min(p.avg_capaian, 100)}%` }}
                              className="h-full bg-[#4c76a3] transition-all duration-500"
                            />
                            <span className="absolute right-2 text-[10.5px] font-bold text-white drop-shadow">
                              {formatPercentID(p.avg_capaian)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
