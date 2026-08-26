import React, { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useFkrtlAntrolData } from '../hooks/useDashboardData';
import type { FkrtlFilterParams } from '../hooks/useDashboardData';
import { apiClient } from '../lib/apiClient';
import { exportToCSV, exportToExcel, exportToJPEG } from '../utils/exportUtils';

const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE || '';

export const PemanfaatanAntrolDashboard: React.FC = () => {
  const { getAccessTokenSilently } = useAuth0();
  const [authReady, setAuthReady] = useState(false);
  const [downloadingType, setDownloadingType] = useState<'faskes'|'poli'|null>(null);
  const [openDropdown, setOpenDropdown] = useState<'faskes'|'poli'|null>(null);
  const [jpegData, setJpegData] = useState<{data: any[], type: 'faskes'|'poli'}|null>(null);

  useEffect(() => {
    if (jpegData) {
      setTimeout(() => {
        exportToJPEG(`jpeg-export-${jpegData.type}`, `Export_${jpegData.type.toUpperCase()}_${new Date().getTime()}`)
          .finally(() => {
            setJpegData(null);
            setDownloadingType(null);
          });
      }, 500);
    }
  }, [jpegData]);

  const handleDownload = async (type: 'faskes' | 'poli', format: 'csv' | 'xlsx' | 'jpeg') => {
    setDownloadingType(type);
    setOpenDropdown(null);
    try {
      const token = await getAccessTokenSilently({ authorizationParams: { audience: AUTH0_AUDIENCE } });
      const params = new URLSearchParams();
      params.append('type', type);
      if (filters.tahun && filters.tahun !== '(All)') params.append('tahun', filters.tahun);
      if (filters.bulan && filters.bulan !== '(All)') params.append('bulan', filters.bulan);
      if (filters.kabupaten && filters.kabupaten !== '(All)') params.append('kabupaten', filters.kabupaten);
      if (filters.kelas_rs && filters.kelas_rs !== '(All)') params.append('kelas_rs', filters.kelas_rs);
      if (filters.nama_rs && filters.nama_rs !== '(All)') params.append('nama_rs', filters.nama_rs);

      const res = await apiClient.get(`/fkrtl-export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const exportData = res.data.data || [];

      if (format === 'csv') {
        exportToCSV(exportData, type);
        setDownloadingType(null);
      } else if (format === 'xlsx') {
        await exportToExcel(exportData, type);
        setDownloadingType(null);
      } else if (format === 'jpeg') {
        setJpegData({ data: exportData, type });
      }
    } catch (err) {
      console.error(err);
      alert('Gagal mendownload data');
      setDownloadingType(null);
    }
  };

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
    nama_rs: '(All)',
    kelas_rs: '(All)',
    sumber: 'Semua Sumber',
  });
  const [sortFaskesDesc, setSortFaskesDesc] = useState(true);
  const [sortPoliDesc, setSortPoliDesc] = useState(true);

  const { data, isLoading, isError, error, refetch } = useFkrtlAntrolData(filters, authReady);

  const sortedFaskes = data?.top_faskes ? [...data.top_faskes].sort((a, b) => sortFaskesDesc ? b.avg_capaian - a.avg_capaian : a.avg_capaian - b.avg_capaian) : [];
  const sortedPoli = data?.top_poli ? [...data.top_poli].sort((a, b) => sortPoliDesc ? b.avg_capaian - a.avg_capaian : a.avg_capaian - b.avg_capaian) : [];

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
    nama_rs: ['(All)'],
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
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl py-4 px-6 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
          Pemanfaatan Sistem Antrean Online FKRTL
        </h2>
        <div className="flex gap-3">
          {/* Download Faskes */}
          <div className="relative">
            <button 
              onClick={() => setOpenDropdown(openDropdown === 'faskes' ? null : 'faskes')}
              disabled={downloadingType === 'faskes'}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm font-semibold text-white transition-colors"
            >
              <span>{downloadingType === 'faskes' ? '⏳ Downloading...' : '💾 Download by Nama RS'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openDropdown === 'faskes' && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
                <button onClick={() => handleDownload('faskes', 'xlsx')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-700 text-left text-sm text-slate-200 transition-colors border-b border-slate-700">
                  <img src="https://icons8.com/icon/13654/microsoft-excel" alt="Excel" className="w-5 h-5 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2322c55e"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'}}/>
                  Download as .xlsx
                </button>
                <button onClick={() => handleDownload('faskes', 'jpeg')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-700 text-left text-sm text-slate-200 transition-colors border-b border-slate-700">
                  <img src="https://icons8.com/icon/12275/jpg" alt="JPEG" className="w-5 h-5 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%233b82f6"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'}}/>
                  Download as .JPEG
                </button>
                <button onClick={() => handleDownload('faskes', 'csv')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-700 text-left text-sm text-slate-200 transition-colors">
                  <img src="https://icons8.com/icon/rRfRwtbb6gFt/csv" alt="CSV" className="w-5 h-5 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23eab308"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'}}/>
                  Download as .csv
                </button>
              </div>
            )}
          </div>

          {/* Download Poli */}
          <div className="relative">
            <button 
              onClick={() => setOpenDropdown(openDropdown === 'poli' ? null : 'poli')}
              disabled={downloadingType === 'poli'}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm font-semibold text-white transition-colors"
            >
              <span>{downloadingType === 'poli' ? '⏳ Downloading...' : '💾 Download by Nama Poli'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openDropdown === 'poli' && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
                <button onClick={() => handleDownload('poli', 'xlsx')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-700 text-left text-sm text-slate-200 transition-colors border-b border-slate-700">
                  <img src="https://icons8.com/icon/13654/microsoft-excel" alt="Excel" className="w-5 h-5 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2322c55e"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'}}/>
                  Download as .xlsx
                </button>
                <button onClick={() => handleDownload('poli', 'jpeg')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-700 text-left text-sm text-slate-200 transition-colors border-b border-slate-700">
                  <img src="https://icons8.com/icon/12275/jpg" alt="JPEG" className="w-5 h-5 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%233b82f6"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'}}/>
                  Download as .JPEG
                </button>
                <button onClick={() => handleDownload('poli', 'csv')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-700 text-left text-sm text-slate-200 transition-colors">
                  <img src="https://icons8.com/icon/rRfRwtbb6gFt/csv" alt="CSV" className="w-5 h-5 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23eab308"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'}}/>
                  Download as .csv
                </button>
              </div>
            )}
          </div>
        </div>
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

            {/* Nama RS Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Nama RS</label>
              <select
                value={filters.nama_rs || '(All)'}
                onChange={(e) => handleFilterChange('nama_rs', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-cyan-400 transition-colors"
              >
                {filterOptions.nama_rs?.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                )) || <option value="(All)">(All)</option>}
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
            <p>- Validasi Jumlah Kunjungan berdasarkan Nomor Kartu, Tanggal Pelayanan, Faskes Layan dan Poli sama dengan SEP Terbit</p>
            <p>- Poli Exclude adalah HIV, HDL, INF, IGD, ICU, 043, 060, KDN, 168, RDT, NUK, KEM, RAT, UGD</p>
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
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Faskes</h4>
                      <button 
                        onClick={() => setSortFaskesDesc(!sortFaskesDesc)}
                        className="text-slate-400 hover:text-cyan-400 focus:outline-none transition-colors px-1"
                        title="Sort"
                      >
                        ↓☰↑
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400">Pemanfaatan</span>
                  </div>

                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {sortedFaskes.map((f, idx) => (
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
                      <button 
                        onClick={() => setSortPoliDesc(!sortPoliDesc)}
                        className="text-slate-400 hover:text-cyan-400 focus:outline-none transition-colors px-1"
                        title="Sort"
                      >
                        ↓☰↑
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400">Pemanfaatan</span>
                  </div>

                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {sortedPoli.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs italic">
                        Tidak ada data tersedia
                      </div>
                    ) : (
                      sortedPoli.map((p, idx) => (
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
      
      {/* Hidden Tables for JPEG Export */}
      {jpegData && jpegData.type === 'faskes' && (
        <div id="jpeg-export-faskes" className="hidden" style={{ width: '800px', backgroundColor: 'white', padding: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid black', padding: '8px' }}>Nama FKRTL</th>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid black', padding: '8px' }}>All Sumber<br/>(Target 95%)</th>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid black', padding: '8px' }}>Mobile JKN<br/>(Target 80%)</th>
              </tr>
            </thead>
            <tbody>
              {jpegData.data.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid black', padding: '6px' }}>{row.Faskes}</td>
                  <td style={{ 
                    border: '1px solid black', padding: '6px', textAlign: 'right',
                    backgroundColor: row.all_sumber_pct >= 95 ? '#C6EFCE' : '#FFC7CE',
                    color: row.all_sumber_pct >= 95 ? '#006100' : '#9C0006'
                  }}>
                    {row.all_sumber_pct.toFixed(2)}%
                  </td>
                  <td style={{ 
                    border: '1px solid black', padding: '6px', textAlign: 'right',
                    backgroundColor: row.mjkn_pct >= 80 ? '#C6EFCE' : '#FFC7CE',
                    color: row.mjkn_pct >= 80 ? '#006100' : '#9C0006'
                  }}>
                    {row.mjkn_pct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {jpegData && jpegData.type === 'poli' && (
        <div id="jpeg-export-poli" className="hidden" style={{ width: '1200px', backgroundColor: 'white', padding: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid #4D94FF', padding: '8px' }}>Kabupaten</th>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid #4D94FF', padding: '8px' }}>Nmppk</th>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid #4D94FF', padding: '8px' }}>Nama Poli</th>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid #4D94FF', padding: '8px' }}>Flag Bridging Antrean</th>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid #4D94FF', padding: '8px' }}>% Antrol All Sumber</th>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid #4D94FF', padding: '8px' }}>Flag Mobile JKN</th>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid #4D94FF', padding: '8px' }}>% Antrol MJKN</th>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid #4D94FF', padding: '8px' }}>Flag Tidak Antrol</th>
                <th style={{ backgroundColor: '#4D94FF', color: 'white', border: '1px solid #4D94FF', padding: '8px' }}>Total SEP</th>
              </tr>
            </thead>
            <tbody>
              {jpegData.data.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #4D94FF', padding: '6px' }}>{row.Kabupaten}</td>
                  <td style={{ border: '1px solid #4D94FF', padding: '6px' }}>{row.Nama_RS}</td>
                  <td style={{ border: '1px solid #4D94FF', padding: '6px' }}>{row.Nama_Poli}</td>
                  <td style={{ border: '1px solid #4D94FF', padding: '6px', textAlign: 'right' }}>{row.flag_bridging}</td>
                  <td style={{ border: '1px solid #4D94FF', padding: '6px', textAlign: 'right' }}>{row.all_sumber_pct.toFixed(2)}%</td>
                  <td style={{ border: '1px solid #4D94FF', padding: '6px', textAlign: 'right' }}>{row.flag_mjkn}</td>
                  <td style={{ border: '1px solid #4D94FF', padding: '6px', textAlign: 'right' }}>{row.mjkn_pct.toFixed(2)}%</td>
                  <td style={{ border: '1px solid #4D94FF', padding: '6px', textAlign: 'right' }}>{row.flag_tidak_antrol}</td>
                  <td style={{ border: '1px solid #4D94FF', padding: '6px', textAlign: 'right' }}>{row.total_sep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
