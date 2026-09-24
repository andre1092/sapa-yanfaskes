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
      {/* Top Main Title Header with Glassmorphism */}
      <div className="glass-panel rounded-2xl py-4 px-6 sm:px-8 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 border border-emerald-500/20">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <span className="w-2.5 h-8 rounded-full bpjs-gradient shadow-md shadow-emerald-500/40" />
          Pemanfaatan Sistem Antrean Online FKRTL
        </h2>
        <div className="flex gap-3">
          {/* Download Faskes */}
          <div className="relative">
            <button 
              onClick={() => setOpenDropdown(openDropdown === 'faskes' ? null : 'faskes')}
              disabled={downloadingType === 'faskes'}
              className="bpjs-gradient-btn flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md shadow-emerald-950/40 border border-emerald-400/30 transition-all active:scale-95 cursor-pointer"
            >
              <span>{downloadingType === 'faskes' ? '⏳ Mengunduh...' : '💾 Unduh Data RS'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openDropdown === 'faskes' && (
              <div className="absolute right-0 mt-2 w-56 glass-panel border border-emerald-500/30 rounded-xl shadow-2xl z-50 overflow-hidden">
                <button onClick={() => handleDownload('faskes', 'xlsx')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors border-b border-emerald-500/15 cursor-pointer">
                  <img src="https://icons8.com/icon/13654/microsoft-excel" alt="Excel" className="w-4 h-4 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2322c55e"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'}}/>
                  Format Excel (.xlsx)
                </button>
                <button onClick={() => handleDownload('faskes', 'jpeg')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors border-b border-emerald-500/15 cursor-pointer">
                  <img src="https://icons8.com/icon/12275/jpg" alt="JPEG" className="w-4 h-4 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%233b82f6"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'}}/>
                  Format Gambar (.JPEG)
                </button>
                <button onClick={() => handleDownload('faskes', 'csv')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors cursor-pointer">
                  <img src="https://icons8.com/icon/rRfRwtbb6gFt/csv" alt="CSV" className="w-4 h-4 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23eab308"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'}}/>
                  Format CSV (.csv)
                </button>
              </div>
            )}
          </div>

          {/* Download Poli */}
          <div className="relative">
            <button 
              onClick={() => setOpenDropdown(openDropdown === 'poli' ? null : 'poli')}
              disabled={downloadingType === 'poli'}
              className="bpjs-gradient-btn flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md shadow-emerald-950/40 border border-emerald-400/30 transition-all active:scale-95 cursor-pointer"
            >
              <span>{downloadingType === 'poli' ? '⏳ Mengunduh...' : '💾 Unduh Data Poli'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openDropdown === 'poli' && (
              <div className="absolute right-0 mt-2 w-56 glass-panel border border-emerald-500/30 rounded-xl shadow-2xl z-50 overflow-hidden">
                <button onClick={() => handleDownload('poli', 'xlsx')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors border-b border-emerald-500/15 cursor-pointer">
                  <img src="https://icons8.com/icon/13654/microsoft-excel" alt="Excel" className="w-4 h-4 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2322c55e"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'}}/>
                  Format Excel (.xlsx)
                </button>
                <button onClick={() => handleDownload('poli', 'jpeg')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors border-b border-emerald-500/15 cursor-pointer">
                  <img src="https://icons8.com/icon/12275/jpg" alt="JPEG" className="w-4 h-4 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%233b82f6"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'}}/>
                  Format Gambar (.JPEG)
                </button>
                <button onClick={() => handleDownload('poli', 'csv')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors cursor-pointer">
                  <img src="https://icons8.com/icon/rRfRwtbb6gFt/csv" alt="CSV" className="w-4 h-4 object-contain" onError={(e) => {e.currentTarget.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23eab308"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'}}/>
                  Format CSV (.csv)
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
          {/* 1. Last Update Header (BPJS Glassmorphism Badge) */}
          <div className="glass-card rounded-xl px-4 py-2.5 shadow-sm border border-emerald-500/20 flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 tracking-wide flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Update Terakhir: {lastUpdate}
            </span>
          </div>

          {/* 2. Pemanfaatan KPI Card with BPJS Gradient Header */}
          <div className="glass-card rounded-2xl overflow-hidden border border-emerald-500/30 shadow-xl shadow-emerald-950/20">
            <div className="bpjs-gradient px-4 py-3.5 text-center border-b border-emerald-400/30 shadow-sm">
              <h3 className="text-base font-bold text-white tracking-wide flex items-center justify-center gap-2">
                <svg className="w-5 h-5 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Pemanfaatan Antrol
              </h3>
              <p className="text-xs font-medium text-emerald-100 mt-0.5">Periode {selectedPeriod}</p>
            </div>
            <div className="bg-slate-900/80 backdrop-blur-md py-6 text-center">
              <span className="text-4xl font-extrabold text-white tracking-tight drop-shadow-md">
                {formatPercentID(kpiValue)}
              </span>
              <div className="mt-2.5 flex items-center justify-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
                  Target BPJS: &ge;85%
                </span>
              </div>
            </div>
          </div>

          {/* 3. Filter Controls Box with Glassmorphism Inputs */}
          <div className="glass-card rounded-2xl p-5 space-y-4 shadow-lg border border-white/10">
            <div className="border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                Filter Analitik
              </span>
            </div>

            {/* Tahun Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Tahun</label>
              <select
                value={filters.tahun || (filterOptions.tahun[0] || '2026')}
                onChange={(e) => handleFilterChange('tahun', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-emerald-400 transition-colors cursor-pointer"
              >
                {filterOptions.tahun.map((y) => (
                  <option key={y} value={y} className="bg-slate-900 text-white">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Bulan Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Bulan</label>
              <select
                value={filters.bulan || '(All)'}
                onChange={(e) => handleFilterChange('bulan', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-emerald-400 transition-colors cursor-pointer"
              >
                {filterOptions.bulan.map((b) => (
                  <option key={b} value={b} className="bg-slate-900 text-white">
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Kabupaten Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Kabupaten / Kota</label>
              <select
                value={filters.kabupaten || '(All)'}
                onChange={(e) => handleFilterChange('kabupaten', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-emerald-400 transition-colors cursor-pointer"
              >
                {filterOptions.kabupaten.map((k) => (
                  <option key={k} value={k} className="bg-slate-900 text-white">
                    {k}
                  </option>
                ))}
              </select>
            </div>

            {/* Nama RS Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Rumah Sakit</label>
              <select
                value={filters.nama_rs || '(All)'}
                onChange={(e) => handleFilterChange('nama_rs', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-emerald-400 transition-colors cursor-pointer"
              >
                {filterOptions.nama_rs?.map((n) => (
                  <option key={n} value={n} className="bg-slate-900 text-white">
                    {n}
                  </option>
                )) || <option value="(All)" className="bg-slate-900 text-white">(All)</option>}
              </select>
            </div>

            {/* Kelas_RS Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Kelas RS</label>
              <select
                value={filters.kelas_rs || '(All)'}
                onChange={(e) => handleFilterChange('kelas_rs', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-emerald-400 transition-colors cursor-pointer"
              >
                {filterOptions.kelas_rs.map((c) => (
                  <option key={c} value={c} className="bg-slate-900 text-white">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Sumber Antrean Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Sumber Antrean</label>
              <select
                value={filters.sumber || 'Semua Sumber'}
                onChange={(e) => handleFilterChange('sumber', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-emerald-400 transition-colors cursor-pointer"
              >
                {filterOptions.sumber.map((s) => (
                  <option key={s} value={s} className="bg-slate-900 text-white">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Keterangan Box */}
          <div className="glass-card rounded-2xl p-4.5 text-slate-300 text-xs leading-relaxed space-y-1.5 border border-white/10">
            <span className="font-bold text-emerald-300 block flex items-center gap-1.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Keterangan Analisis:
            </span>
            <p>- Validasi Jumlah Kunjungan berdasarkan Nomor Kartu, Tanggal Pelayanan, Faskes Layan dan Poli sama dengan SEP Terbit.</p>
            <p>- Poli Exclude adalah HIV, HDL, INF, IGD, ICU, 043, 060, KDN, 168, RDT, NUK, KEM, RAT, UGD.</p>
          </div>
        </div>

        {/* Right Content Area: Tren Perbulan + (Faskes & Poli Tujuan) (Col span 8.5 / 12) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          {isNoData ? (
            /* No Data State */
            <div className="glass-card border border-dashed border-emerald-500/30 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[450px]">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-emerald-500/30 flex items-center justify-center mb-4 text-emerald-400 shadow-lg shadow-emerald-950/30">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">{data?.message || 'Data Tidak Ditemukan.'}</h3>
              <p className="text-xs text-slate-300 mt-2 max-w-sm">
                Tidak ada catatan yang cocok untuk kombinasi parameter filter dan rentang waktu yang dipilih.
              </p>
              <button
                onClick={() => setFilters({ tahun: '2026', bulan: '(All)', kabupaten: '(All)', kelas_rs: '(All)', sumber: 'Semua Sumber' })}
                className="mt-5 bpjs-gradient-btn px-5 py-2.5 rounded-xl text-white text-xs font-bold transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <>
              {/* Top: Tren Perbulan Bar Chart with BPJS Colors & Glassmorphism */}
              <div className="glass-card rounded-2xl p-6 shadow-xl border border-white/10 relative overflow-hidden">
                <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-800/80">
                  <h3 className="text-sm font-bold text-emerald-200 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                    Tren Pemanfaatan Per Bulan
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-400">Target BPJS: &ge;85%</span>
                </div>

                <div className="h-64 flex items-end justify-between gap-2 sm:gap-4 px-2 sm:px-6 pt-8 pb-2 border-b border-emerald-500/20">
                  {data.trend_per_bulan.map((item, idx) => {
                    const heightPercent = Math.min(Math.max((item.avg_capaian / maxTrend) * 100, 10), 100);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                        {/* Percentage Label Above Bar */}
                        <span className="text-[11px] font-bold text-emerald-300 mb-1.5 whitespace-nowrap transition-transform group-hover:scale-110">
                          {formatPercentID(item.avg_capaian)}
                        </span>

                        {/* Bar with BPJS Blue-to-Green Gradient */}
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full max-w-[54px] rounded-t-lg bg-gradient-to-t from-[#00529C] to-[#009B4D] hover:from-[#0A5EB5] hover:to-[#00B85C] border-t-2 border-emerald-300 transition-all duration-300 shadow-md shadow-emerald-950/40 relative cursor-pointer"
                        >
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-white/15 rounded-t-lg pointer-events-none" />
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

              {/* Bottom: Two-Column Ranking (Faskes & Poli Tujuan) with Glassmorphism */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Left Sub-Column: Faskes Ranking */}
                <div className="glass-card rounded-2xl p-6 shadow-xl border border-white/10">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Peringkat Faskes
                      </h4>
                      <button 
                        onClick={() => setSortFaskesDesc(!sortFaskesDesc)}
                        className="text-slate-400 hover:text-emerald-400 focus:outline-none transition-colors px-1"
                        title="Urutkan"
                      >
                        ↓☰↑
                      </button>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">Pemanfaatan</span>
                  </div>

                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {sortedFaskes.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-slate-200 truncate flex-1" title={f.faskes}>
                          {f.faskes}
                        </span>

                        {/* Horizontal Percentage Bar with BPJS Gradient */}
                        <div className="w-36 sm:w-44 bg-slate-950/80 rounded-lg overflow-hidden h-6.5 flex items-center relative border border-emerald-500/20 shrink-0">
                          <div
                            style={{ width: `${Math.min(f.avg_capaian, 100)}%` }}
                            className="h-full bg-gradient-to-r from-[#00529C] via-[#0A5EB5] to-[#009B4D] transition-all duration-500"
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
                <div className="glass-card rounded-2xl p-6 shadow-xl border border-white/10">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Poli Tujuan
                      </h4>
                      <button 
                        onClick={() => setSortPoliDesc(!sortPoliDesc)}
                        className="text-slate-400 hover:text-emerald-400 focus:outline-none transition-colors px-1"
                        title="Urutkan"
                      >
                        ↓☰↑
                      </button>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">Pemanfaatan</span>
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

                          {/* Horizontal Percentage Bar with BPJS Gradient */}
                          <div className="w-36 sm:w-44 bg-slate-950/80 rounded-lg overflow-hidden h-6.5 flex items-center relative border border-emerald-500/20 shrink-0">
                            <div
                              style={{ width: `${Math.min(p.avg_capaian, 100)}%` }}
                              className="h-full bg-gradient-to-r from-[#00529C] via-[#0A5EB5] to-[#009B4D] transition-all duration-500"
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
        <div id="jpeg-export-faskes" style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '800px', backgroundColor: 'white', padding: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid black', padding: '8px' }}>Nama FKRTL</th>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid black', padding: '8px' }}>All Sumber<br/>(Target 95%)</th>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid black', padding: '8px' }}>Mobile JKN<br/>(Target 80%)</th>
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
        <div id="jpeg-export-poli" style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '1200px', backgroundColor: 'white', padding: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid #00529C', padding: '8px' }}>Kabupaten</th>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid #00529C', padding: '8px' }}>Nmppk</th>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid #00529C', padding: '8px' }}>Nama Poli</th>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid #00529C', padding: '8px' }}>Flag Bridging Antrean</th>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid #00529C', padding: '8px' }}>% Antrol All Sumber</th>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid #00529C', padding: '8px' }}>Flag Mobile JKN</th>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid #00529C', padding: '8px' }}>% Antrol MJKN</th>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid #00529C', padding: '8px' }}>Flag Tidak Antrol</th>
                <th style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid #00529C', padding: '8px' }}>Total SEP</th>
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
