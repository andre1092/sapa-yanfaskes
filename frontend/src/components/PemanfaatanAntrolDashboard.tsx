import React, { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useFkrtlAntrolData } from '../hooks/useDashboardData';
import type { FkrtlFilterParams } from '../hooks/useDashboardData';
import { apiClient } from '../lib/apiClient';
import { exportToCSV, exportToExcel, exportToJPEG } from '../utils/exportUtils';
import { useSyncStore } from '../store/syncStore';

const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE || '';

export const PemanfaatanAntrolDashboard: React.FC = () => {
  const { getAccessTokenSilently } = useAuth0();
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
      if (filters.kabupaten && filters.kabupaten !== '(All)') params.append('kabupaten', filters.kabupaten);
      if (filters.nama_rs && filters.nama_rs !== '(All)') params.append('nama_rs', filters.nama_rs);
      if (filters.bulan && filters.bulan !== '(All)') params.append('bulan', filters.bulan);
      if (filters.tahun && filters.tahun !== '(All)') params.append('tahun', filters.tahun);
      if (filters.sumber && filters.sumber !== 'All Sumber' && filters.sumber !== 'Semua Sumber') params.append('sumber', filters.sumber);

      const res = await apiClient.get(`/api/v1/fkrtl-export?${params.toString()}`, {
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

    return () => apiClient.interceptors.request.eject(interceptor);
  }, [getAccessTokenSilently]);

  // Filters State: urutan sesuai permintaan (Kabupaten, Nama Faskes, Bulan, Tahun, Sumber)
  const [filters, setFilters] = useState<FkrtlFilterParams>({
    kabupaten: '(All)',
    nama_rs: '(All)',
    bulan: '(All)',
    tahun: '2026',
    sumber: 'All Sumber',
  });
  const [sortFaskesDesc, setSortFaskesDesc] = useState(true);
  const [sortPoliDesc, setSortPoliDesc] = useState(true);
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);

  const { data, isLoading, isError, error, refetch } = useFkrtlAntrolData(filters, true);

  const sortedFaskes = Array.isArray(data?.top_faskes)
    ? [...data.top_faskes].sort((a, b) => (sortFaskesDesc ? (b.avg_capaian ?? 0) - (a.avg_capaian ?? 0) : (a.avg_capaian ?? 0) - (b.avg_capaian ?? 0)))
    : [];
  const sortedPoli = Array.isArray(data?.top_poli)
    ? [...data.top_poli].sort((a, b) => (sortPoliDesc ? (b.avg_capaian ?? 0) - (a.avg_capaian ?? 0) : (a.avg_capaian ?? 0) - (b.avg_capaian ?? 0)))
    : [];

  // Logika Target Dinamis berdasarkan Filter Sumber
  const isMobileJKN = filters.sumber === 'Mobile JKN';
  const isAllSumber = filters.sumber === 'All Sumber' || !filters.sumber || filters.sumber === '(All)';
  const showTarget80 = isMobileJKN;
  const showTarget95 = isAllSumber;

  const handleFilterChange = (key: keyof FkrtlFilterParams, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // Jika kabupaten berubah, reset pilihan faskes agar tidak terjadi inkonsistensi
      if (key === 'kabupaten' && value !== prev.kabupaten) {
        next.nama_rs = '(All)';
      }
      return next;
    });
  };

  const handleResetFilter = () => {
    setFilters({
      kabupaten: '(All)',
      nama_rs: '(All)',
      bulan: '(All)',
      tahun: '2026',
      sumber: 'All Sumber',
    });
  };

  const formatPercentID = (num: number | undefined): string => {
    if (num === undefined || isNaN(num)) return '0,00%';
    return num.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  };

  if (isLoading && !data) {
    return (
      <div className="p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-300">Memuat Live Data Google Spreadsheet FKRTL...</p>
      </div>
    );
  }

  if (isError && !data) {
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

  const isNoData =
    !data ||
    data.status === 'no_data' ||
    ((data.trend_per_bulan?.length ?? 0) === 0 && (data.top_faskes?.length ?? 0) === 0);

  const filterOptions = {
    kabupaten: data?.filter_options?.kabupaten || ['(All)', 'Bondowoso', 'Jember', 'Lumajang'],
    nama_rs: data?.filter_options?.nama_rs || ['(All)'],
    bulan: data?.filter_options?.bulan || ['(All)', 'September 2026', 'Agustus 2026'],
    tahun: data?.filter_options?.tahun || ['(All)', '2026'],
    sumber: data?.filter_options?.sumber || ['All Sumber', 'Mobile JKN'],
  };

  const liveSyncAntrol = useSyncStore((s) => s.lastUpdateAntrol);
  const lastUpdate = liveSyncAntrol || data?.last_update || '09/24/2026 03:14:56';
  const selectedPeriod = data?.selected_period || (filters.bulan !== '(All)' ? filters.bulan : 'September 2026');
  const kpiValue = data?.kpi_capaian ?? 0.0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* 1. KOTAK KETERANGAN: "Last Update : ...." & Header Utama */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 shadow-xl border border-[#83a67e]/30 dark:border-emerald-500/30 bg-gradient-to-r from-[#d4ecd1]/30 via-white/50 to-[#afbade]/20 dark:from-emerald-950/40 dark:via-slate-900/60 dark:to-blue-950/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-8 rounded-full bpjs-gradient shadow-md shadow-[#44853b]/40" />
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#2b4390] dark:text-white tracking-tight">
                Pemanfaatan Sistem Antrean Online FKRTL
              </h2>
              {/* Kotak Keterangan Last Update sesuai instruksi spesifik pengguna */}
              <div className="mt-1 flex items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#d4ecd1] border border-[#83a67e]/40 text-[#44853b] dark:bg-emerald-500/20 dark:border-emerald-400/40 dark:text-emerald-300 font-bold text-xs sm:text-sm tracking-wide shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-[#44853b] dark:bg-emerald-400 animate-pulse" />
                  <span>Last Update : {lastUpdate}</span>
                </div>
                <span className="text-[11px] text-[#6573a1] dark:text-slate-300 hidden sm:inline">
                  (Live Data Google Sheets)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button: Download RS & Poli */}
        <div className="flex flex-wrap gap-3 self-end md:self-center">
          {/* Download Faskes */}
          <div className="relative">
            <button 
              onClick={() => setOpenDropdown(openDropdown === 'faskes' ? null : 'faskes')}
              disabled={downloadingType === 'faskes'}
              className="bpjs-gradient-btn flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md shadow-[#2b4390]/25 border border-[#83a67e]/40 transition-all active:scale-95 cursor-pointer"
            >
              <span>{downloadingType === 'faskes' ? '⏳ Mengunduh...' : '💾 Unduh Data RS'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openDropdown === 'faskes' && (
              <div className="absolute right-0 mt-2 w-56 glass-panel border border-[#afbade]/40 dark:border-emerald-500/30 rounded-xl shadow-2xl z-50 overflow-hidden bg-white/95 dark:bg-slate-900/95">
                <button onClick={() => handleDownload('faskes', 'xlsx')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#d4ecd1]/40 dark:hover:bg-emerald-900/30 text-left text-xs font-semibold text-[#2b4390] dark:text-slate-200 transition-colors border-b border-[#afbade]/20 dark:border-emerald-500/15 cursor-pointer">
                  Format Excel (.xlsx)
                </button>
                <button onClick={() => handleDownload('faskes', 'jpeg')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#d4ecd1]/40 dark:hover:bg-emerald-900/30 text-left text-xs font-semibold text-[#2b4390] dark:text-slate-200 transition-colors border-b border-[#afbade]/20 dark:border-emerald-500/15 cursor-pointer">
                  Format Gambar (.JPEG)
                </button>
                <button onClick={() => handleDownload('faskes', 'csv')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#d4ecd1]/40 dark:hover:bg-emerald-900/30 text-left text-xs font-semibold text-[#2b4390] dark:text-slate-200 transition-colors cursor-pointer">
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
              className="bpjs-gradient-btn flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md shadow-[#2b4390]/25 border border-[#83a67e]/40 transition-all active:scale-95 cursor-pointer"
            >
              <span>{downloadingType === 'poli' ? '⏳ Mengunduh...' : '💾 Unduh Data Poli'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openDropdown === 'poli' && (
              <div className="absolute right-0 mt-2 w-56 glass-panel border border-[#afbade]/40 dark:border-emerald-500/30 rounded-xl shadow-2xl z-50 overflow-hidden bg-white/95 dark:bg-slate-900/95">
                <button onClick={() => handleDownload('poli', 'xlsx')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#d4ecd1]/40 dark:hover:bg-emerald-900/30 text-left text-xs font-semibold text-[#2b4390] dark:text-slate-200 transition-colors border-b border-[#afbade]/20 dark:border-emerald-500/15 cursor-pointer">
                  Format Excel (.xlsx)
                </button>
                <button onClick={() => handleDownload('poli', 'jpeg')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#d4ecd1]/40 dark:hover:bg-emerald-900/30 text-left text-xs font-semibold text-[#2b4390] dark:text-slate-200 transition-colors border-b border-[#afbade]/20 dark:border-emerald-500/15 cursor-pointer">
                  Format Gambar (.JPEG)
                </button>
                <button onClick={() => handleDownload('poli', 'csv')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#d4ecd1]/40 dark:hover:bg-emerald-900/30 text-left text-xs font-semibold text-[#2b4390] dark:text-slate-200 transition-colors cursor-pointer">
                  Format CSV (.csv)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. MAIN LAYOUT: Panel Filter Kiri + Area Visualisasi Kanan */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Kolom Kiri: KPI Card & Kontrol Filtering (Col span 3.5 / 12) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-5">
          {/* KPI Pemanfaatan Antrol Card */}
          <div className="glass-card rounded-2xl overflow-hidden border border-[#83a67e]/30 dark:border-emerald-500/30 shadow-xl shadow-[#2b4390]/10">
            <div className="bpjs-gradient px-4 py-3.5 text-center border-b border-[#83a67e]/30 shadow-sm">
              <h3 className="text-base font-bold text-white tracking-wide flex items-center justify-center gap-2">
                <svg className="w-5 h-5 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Pemanfaatan Antrol
              </h3>
              <p className="text-xs font-medium text-emerald-100 mt-0.5">Periode {selectedPeriod}</p>
            </div>
            <div className="bg-[#f0f7f4] dark:bg-slate-900/80 backdrop-blur-md py-6 text-center">
              <span className="text-4xl font-extrabold text-[#2b4390] dark:text-white tracking-tight drop-shadow-md">
                {formatPercentID(kpiValue)}
              </span>
              <div className="mt-2.5 flex items-center justify-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 shadow-sm">
                  Target BPJS: &ge;85%
                </span>
              </div>
            </div>
          </div>

          {/* Panel Kontrol Filter (Urutan: Kabupaten, Nama Faskes, Bulan, Tahun, Sumber) */}
          <div className="glass-card rounded-2xl p-5 space-y-4 shadow-lg border border-[#afbade]/30 dark:border-emerald-500/20">
            <div className="flex items-center justify-between border-b border-[#afbade]/30 dark:border-slate-800 pb-2.5">
              <span className="text-xs font-bold text-[#2b4390] dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-4 h-4 text-[#44853b] dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filter Analitik
              </span>
              <button
                onClick={handleResetFilter}
                className="text-[11px] font-semibold text-[#6573a1] hover:text-[#44853b] dark:text-slate-400 dark:hover:text-emerald-300 transition-colors cursor-pointer"
              >
                Reset
              </button>
            </div>

            {/* Filter 1: Kabupaten */}
            <div>
              <label className="block text-xs font-bold text-[#2b4390] dark:text-slate-300 mb-1">1. Kabupaten</label>
              <select
                value={filters.kabupaten || '(All)'}
                onChange={(e) => handleFilterChange('kabupaten', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] transition-colors cursor-pointer"
              >
                {filterOptions.kabupaten.map((k) => (
                  <option key={k} value={k} className="bg-slate-900 text-white">
                    {k}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 2: Nama Faskes */}
            <div>
              <label className="block text-xs font-bold text-[#2b4390] dark:text-slate-300 mb-1">2. Nama Faskes</label>
              <select
                value={filters.nama_rs || '(All)'}
                onChange={(e) => handleFilterChange('nama_rs', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] transition-colors cursor-pointer"
              >
                {filterOptions.nama_rs?.map((n) => (
                  <option key={n} value={n} className="bg-slate-900 text-white truncate">
                    {n}
                  </option>
                )) || <option value="(All)" className="bg-slate-900 text-white">(All)</option>}
              </select>
            </div>

            {/* Filter 3: Bulan */}
            <div>
              <label className="block text-xs font-bold text-[#2b4390] dark:text-slate-300 mb-1">3. Bulan</label>
              <select
                value={filters.bulan || '(All)'}
                onChange={(e) => handleFilterChange('bulan', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] transition-colors cursor-pointer"
              >
                {filterOptions.bulan.map((b) => (
                  <option key={b} value={b} className="bg-slate-900 text-white">
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 4: Tahun */}
            <div>
              <label className="block text-xs font-bold text-[#2b4390] dark:text-slate-300 mb-1">4. Tahun</label>
              <select
                value={filters.tahun || '2026'}
                onChange={(e) => handleFilterChange('tahun', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] transition-colors cursor-pointer"
              >
                {filterOptions.tahun.map((y) => (
                  <option key={y} value={y} className="bg-slate-900 text-white">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 5: Sumber */}
            <div>
              <label className="block text-xs font-bold text-[#2b4390] dark:text-slate-300 mb-1">5. Sumber</label>
              <select
                value={filters.sumber || 'All Sumber'}
                onChange={(e) => handleFilterChange('sumber', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] transition-colors cursor-pointer"
              >
                {filterOptions.sumber.map((s) => (
                  <option key={s} value={s} className="bg-slate-900 text-white">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Kotak Keterangan Analisis & Kebijakan */}
          <div className="glass-card rounded-2xl p-4.5 text-[#6573a1] dark:text-slate-300 text-xs leading-relaxed space-y-1.5 border border-[#afbade]/30 dark:border-white/10">
            <span className="font-bold text-[#44853b] dark:text-emerald-300 block flex items-center gap-1.5">
              <svg className="w-4 h-4 text-[#44853b] dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Keterangan Analisis:
            </span>
            <p>- Validasi Jumlah Kunjungan berdasarkan Nomor Kartu, Tanggal Pelayanan, Faskes Layan dan Poli sama dengan SEP Terbit.</p>
            <p>- Poli Exclude adalah HIV, HDL, INF, IGD, ICU, 043, 060, KDN, 168, RDT, NUK, KEM, RAT, UGD.</p>
          </div>
        </div>

        {/* Kolom Kanan: 3 Visualisasi Grafik (Bulanan Horisontal, Faskes Vertikal, Poli Vertikal) */}
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
                Tidak ada catatan yang cocok untuk kombinasi parameter filter yang dipilih.
              </p>
              <button
                onClick={handleResetFilter}
                className="mt-5 bpjs-gradient-btn px-5 py-2.5 rounded-xl text-white text-xs font-bold transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <>
              {/* 1. LINE CHART BULANAN (MENGAMBIL TIMESTAMP TERBARU) */}
              <div className="glass-card rounded-2xl p-6 shadow-xl border border-[#afbade]/30 dark:border-emerald-500/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-5 border-b border-[#afbade]/30 dark:border-emerald-500/20 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#44853b] shadow-sm shadow-[#44853b]/50" />
                      Line Chart Bulanan — Tren Capaian Antrol
                    </h3>
                    <p className="text-xs text-[#6573a1] dark:text-slate-300 mt-1">
                      Grafik garis tren capaian bulanan berbasis <span className="font-semibold text-[#44853b] dark:text-emerald-400">Timestamp Terbaru</span> per bulan (Format: MM/DD/YYYY HH:MM:SS)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    {showTarget80 && (
                      <span className="flex items-center gap-1.5 text-xs text-[#2b4390] bg-[#afbade]/20 px-2.5 py-1 rounded-lg border border-[#afbade]/40 dark:text-sky-300 dark:bg-sky-500/10 dark:border-sky-500/30">
                        <span className="w-3 h-0.5 border-t-2 border-dashed border-[#2b4390] dark:border-sky-400 inline-block" />
                        <span className="text-[11px] font-semibold">Target MJKN: 80%</span>
                      </span>
                    )}
                    {showTarget95 && (
                      <span className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30">
                        <span className="w-3 h-0.5 border-t-2 border-dashed border-amber-600 dark:border-amber-400 inline-block" />
                        <span className="text-[11px] font-semibold">Target All Sumber: 95%</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-xs text-[#44853b] bg-[#d4ecd1] px-2.5 py-1 rounded-lg border border-[#83a67e]/40 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30">
                      <span className="w-2 h-2 rounded-full bg-[#44853b] dark:bg-emerald-400 inline-block shadow-sm shadow-[#44853b]/60" />
                      <span className="text-[11px] font-semibold">Realisasi</span>
                    </span>
                  </div>
                </div>

                {/* Interactive Tooltip Banner saat Bulan di-hover */}
                {hoveredMonthIndex !== null && data?.trend_per_bulan?.[hoveredMonthIndex] && (() => {
                  const activeItem = data.trend_per_bulan[hoveredMonthIndex];
                  const met = (activeItem?.avg_capaian ?? 0) >= 85;
                  return (
                    <div className="mb-4 p-3 rounded-xl bg-white/95 dark:bg-slate-900/90 border border-[#83a67e]/40 dark:border-emerald-500/40 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-fadeIn">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${met ? 'bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40' : 'bg-[#afbade]/30 text-[#2b4390] border border-[#afbade]/50 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40'}`}>
                          {activeItem.month}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#2b4390] dark:text-white flex items-center gap-2">
                            <span>{activeItem.month_full || activeItem.month}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${met ? 'bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30'}`}>
                              {met ? '★ Memenuhi Target (≥85%)' : '⚠️ Di Bawah Target (<85%)'}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#6573a1] dark:text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
                            <svg className="w-3.5 h-3.5 text-[#44853b] dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Snapshot Timestamp: <strong className="text-[#44853b] dark:text-emerald-300">{activeItem.latest_timestamp || 'MM/DD/YYYY HH:MM:SS'}</strong></span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right sm:border-l sm:border-[#afbade]/30 dark:sm:border-slate-800 sm:pl-4">
                        <div className="text-[10px] uppercase tracking-wider text-[#6573a1] dark:text-slate-400 font-bold">Capaian Antrol</div>
                        <div className={`text-base font-extrabold font-mono ${met ? 'text-[#44853b] dark:text-emerald-400' : 'text-[#2b4390] dark:text-cyan-400'}`}>
                          {formatPercentID(activeItem.avg_capaian)}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* SVG Line Chart Viewport */}
                {(() => {
                  const ptsList = Array.isArray(data?.trend_per_bulan) ? data.trend_per_bulan : [];
                  const padL = 50;
                  const padR = 40;
                  const padT = 35;
                  const padB = 45;
                  const svgW = 920;
                  const svgH = 260;
                  const chartW = svgW - padL - padR;
                  const chartH = svgH - padT - padB;

                  const calcY = (val: number | undefined) => {
                    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
                    const clamped = Math.min(Math.max(num, 0), 100);
                    return padT + chartH - (clamped / 100) * chartH;
                  };

                  const coords = ptsList.map((item, idx) => {
                    const x = padL + (ptsList.length > 1 ? (idx / (ptsList.length - 1)) * chartW : chartW / 2);
                    const y = calcY(item?.avg_capaian);
                    return { x, y, item, idx };
                  });

                  // Cubic bezier spline for smooth curve
                  let lineD = '';
                  if (coords.length === 1) {
                    lineD = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
                  } else if (coords.length > 1) {
                    lineD = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
                    for (let i = 0; i < coords.length - 1; i++) {
                      const p0 = coords[i === 0 ? 0 : i - 1];
                      const p1 = coords[i];
                      const p2 = coords[i + 1];
                      const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];

                      const cp1x = p1.x + (p2.x - p0.x) / 6;
                      const cp1y = p1.y + (p2.y - p0.y) / 6;
                      const cp2x = p2.x - (p3.x - p1.x) / 6;
                      const cp2y = p2.y - (p3.y - p1.y) / 6;

                      lineD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
                    }
                  }

                  const areaD = coords.length > 0 && lineD
                    ? `${lineD} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + chartH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + chartH).toFixed(1)} Z`
                    : '';

                  const target80Y = calcY(80);
                  const target95Y = calcY(95);

                  return (
                    <div className="w-full overflow-x-auto select-none">
                      <div className="min-w-[680px]">
                        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto overflow-visible">
                          <defs>
                            <linearGradient id="lineGradBPJS" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#2b4390" />
                              <stop offset="35%" stopColor="#6573a1" />
                              <stop offset="70%" stopColor="#44853b" />
                              <stop offset="100%" stopColor="#83a67e" />
                            </linearGradient>
                            <linearGradient id="areaGradBPJS" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#44853b" stopOpacity="0.25" />
                              <stop offset="60%" stopColor="#2b4390" stopOpacity="0.08" />
                              <stop offset="100%" stopColor="#2b4390" stopOpacity="0.0" />
                            </linearGradient>
                            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#44853b" floodOpacity="0.30" />
                            </filter>
                          </defs>

                          {/* Grid Lines & Y Axis Labels (0, 25, 50, 75, 100) */}
                          {[0, 25, 50, 75, 100].map((level) => {
                            const y = calcY(level);
                            return (
                              <g key={level}>
                                <line 
                                  x1={padL} 
                                  x2={padL + chartW} 
                                  y1={y} 
                                  y2={y} 
                                  stroke="currentColor" 
                                  className="text-slate-300 dark:text-slate-800"
                                  strokeDasharray="4 4" 
                                />
                                <text 
                                  x={padL - 10} 
                                  y={y + 3.5} 
                                  textAnchor="end" 
                                  className="text-[10px] fill-[#6573a1] dark:fill-slate-400 font-mono"
                                >
                                  {level}%
                                </text>
                              </g>
                            );
                          })}

                          {/* 80% Target Benchmark Line (Mobile JKN) */}
                          {showTarget80 && (
                            <g>
                              <line 
                                x1={padL} 
                                x2={padL + chartW} 
                                y1={target80Y} 
                                y2={target80Y} 
                                stroke="#2b4390" 
                                strokeDasharray="5 3" 
                                strokeWidth="1.2" 
                              />
                              <rect 
                                x={padL + chartW - 96} 
                                y={target80Y - 9} 
                                width="96" 
                                height="16" 
                                rx="3" 
                                fill="rgba(43, 67, 144, 0.9)" 
                                stroke="rgba(175, 186, 222, 0.6)" 
                                strokeWidth="1" 
                              />
                              <text 
                                x={padL + chartW - 48} 
                                y={target80Y + 2.5} 
                                textAnchor="middle" 
                                className="text-[8.5px] fill-white font-bold tracking-wider"
                              >
                                TARGET MJKN 80%
                              </text>
                            </g>
                          )}

                          {/* 95% Target Benchmark Line (All Sumber) */}
                          {showTarget95 && (
                            <g>
                              <line 
                                x1={padL} 
                                x2={padL + chartW} 
                                y1={target95Y} 
                                y2={target95Y} 
                                stroke="#F59E0B" 
                                strokeDasharray="6 4" 
                                strokeWidth="1.5" 
                              />
                              <rect 
                                x={padL + chartW - 124} 
                                y={target95Y - 9} 
                                width="124" 
                                height="16" 
                                rx="3" 
                                fill="rgba(245, 158, 11, 0.95)" 
                                stroke="rgba(245, 158, 11, 0.5)" 
                                strokeWidth="1" 
                              />
                              <text 
                                x={padL + chartW - 62} 
                                y={target95Y + 2.5} 
                                textAnchor="middle" 
                                className="text-[8.5px] fill-white font-bold tracking-wider"
                              >
                                TARGET ALL SUMBER 95%
                              </text>
                            </g>
                          )}

                          {/* Area Gradient Under Curve */}
                          {areaD && (
                            <path d={areaD} fill="url(#areaGradBPJS)" className="transition-all duration-700" />
                          )}

                          {/* The Glowing Curved Line */}
                          {lineD && (
                            <path 
                              d={lineD} 
                              fill="none" 
                              stroke="url(#lineGradBPJS)" 
                              strokeWidth="3.5" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              filter="url(#lineGlow)"
                              className="transition-all duration-700"
                            />
                          )}

                          {/* Interactive Vertical Hover Guides & Data Points */}
                          {coords.map((pt) => {
                            const isHovered = hoveredMonthIndex === pt.idx;
                            const isTargetMet = pt.item.avg_capaian >= 85;

                            return (
                              <g key={pt.idx} className="transition-all">
                                {/* Vertical dotted guide on hover */}
                                {isHovered && (
                                  <line 
                                    x1={pt.x} 
                                    y1={padT} 
                                    x2={pt.x} 
                                    y2={padT + chartH} 
                                    stroke="rgba(68, 133, 59, 0.6)" 
                                    strokeDasharray="3 3" 
                                    strokeWidth="1.5" 
                                  />
                                )}

                                {/* Outer Ring with Pulse */}
                                <circle 
                                  cx={pt.x} 
                                  cy={pt.y} 
                                  r={isHovered ? 9 : 6} 
                                  fill="#ffffff" 
                                  stroke={isTargetMet ? "#44853b" : "#2b4390"} 
                                  strokeWidth={isHovered ? 3 : 2} 
                                  className="cursor-pointer transition-all duration-200"
                                />

                                {/* Inner Dot */}
                                <circle 
                                  cx={pt.x} 
                                  cy={pt.y} 
                                  r={isHovered ? 4.5 : 2.5} 
                                  fill={isTargetMet ? "#44853b" : "#2b4390"} 
                                  className="pointer-events-none"
                                />

                                {/* Value pill above point */}
                                <g transform={`translate(${pt.x}, ${pt.y - 14})`}>
                                  <rect 
                                    x="-24" 
                                    y="-12" 
                                    width="48" 
                                    height="15" 
                                    rx="4" 
                                    fill={isHovered ? "#2b4390" : isTargetMet ? "#44853b" : "#6573a1"} 
                                    stroke="#ffffff" 
                                    strokeWidth="1" 
                                    className="transition-colors shadow-sm"
                                  />
                                  <text 
                                    textAnchor="middle" 
                                    y="-1" 
                                    className="text-[9.5px] font-extrabold font-mono fill-white"
                                  >
                                    {formatPercentID(pt.item.avg_capaian)}
                                  </text>
                                </g>

                                {/* Month Name label on X Axis */}
                                <text 
                                  x={pt.x} 
                                  y={padT + chartH + 20} 
                                  textAnchor="middle" 
                                  className={`text-[11px] font-bold transition-colors cursor-pointer ${
                                    isHovered ? 'fill-[#44853b] dark:fill-emerald-300 font-extrabold' : 'fill-[#2b4390] dark:fill-slate-300'
                                  }`}
                                >
                                  {pt.item.month}
                                </text>

                                {/* Transparent Hit Box to easily trigger hover */}
                                <rect 
                                  x={pt.x - (chartW / (coords.length * 2))} 
                                  y={padT} 
                                  width={chartW / coords.length} 
                                  height={chartH + padB} 
                                  fill="transparent" 
                                  className="cursor-pointer"
                                  onMouseEnter={() => setHoveredMonthIndex(pt.idx)}
                                  onMouseLeave={() => setHoveredMonthIndex(null)}
                                />
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>
                  );
                })()}

                {/* Strip Detail Snapshot Timestamp Terbaru per Bulan */}
                <div className="mt-5 pt-4 border-t border-[#afbade]/30 dark:border-emerald-500/20">
                  <div className="text-[11px] font-bold text-[#2b4390] dark:text-slate-300 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-[#44853b] dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Daftar Snapshot Timestamp Terbaru per Bulan
                    </span>
                    <span className="text-[10px] text-[#6573a1] dark:text-slate-400 font-normal">
                      Klik/Arahkan kursor pada kartu untuk menyorot titik kurva
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
                    {(data?.trend_per_bulan ?? []).map((item, idx) => {
                      const isHovered = hoveredMonthIndex === idx;
                      const met = (item?.avg_capaian ?? 0) >= 85;
                      return (
                        <div
                          key={idx}
                          onMouseEnter={() => setHoveredMonthIndex(idx)}
                          onMouseLeave={() => setHoveredMonthIndex(null)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isHovered
                              ? 'bg-[#d4ecd1]/50 border-[#44853b] shadow-md shadow-[#44853b]/20 -translate-y-0.5 dark:bg-emerald-500/20 dark:border-emerald-400'
                              : 'bg-white/70 dark:bg-slate-950/60 border-[#afbade]/30 dark:border-white/10 hover:border-[#44853b]/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold text-[#2b4390] dark:text-white truncate">{item.month}</span>
                            <span className={`text-[9px] font-extrabold ${met ? 'text-[#44853b] dark:text-emerald-400' : 'text-[#6573a1] dark:text-cyan-400'}`}>
                              {formatPercentID(item.avg_capaian)}
                            </span>
                          </div>
                          <div className="text-[9.5px] font-mono text-[#6573a1] dark:text-slate-400 truncate flex items-center gap-1" title={item.latest_timestamp}>
                            <svg className="w-2.5 h-2.5 text-[#44853b] dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="truncate">{item.latest_timestamp || 'N/A'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* GRID 2 KOLOM BERDAMPINGAN: GRAFIK FASKES (KIRI) & GRAFIK NAMA POLI (KANAN) */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* 2. GRAFIK BATANG HORISONTAL FASKES (KIRI) */}
                <div className="glass-card rounded-2xl p-5 sm:p-6 shadow-xl border border-[#afbade]/30 dark:border-white/10 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-5 border-b border-[#afbade]/30 dark:border-slate-800 gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#2b4390] shadow-sm shadow-[#2b4390]/50" />
                          Grafik Batang Horisontal Faskes
                        </h3>
                        <p className="text-xs text-[#6573a1] dark:text-slate-400 mt-0.5">
                          Capaian pemanfaatan antrol per Rumah Sakit FKRTL
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setSortFaskesDesc(!sortFaskesDesc)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#afbade]/20 hover:bg-[#afbade]/30 text-[#2b4390] border border-[#afbade]/40 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>{sortFaskesDesc ? 'Tertinggi ↓' : 'Terendah ↑'}</span>
                        </button>
                        {showTarget80 && (
                          <span className="flex items-center gap-1.5 text-xs text-[#2b4390] bg-[#afbade]/20 px-2 py-0.5 rounded-lg border border-[#afbade]/40 dark:text-sky-300 dark:bg-sky-500/10 dark:border-sky-500/30">
                            <span className="w-2.5 h-0.5 border-t-2 border-dashed border-[#2b4390] dark:border-sky-400 inline-block" />
                            <span className="text-[10.5px] font-semibold">Target MJKN: 80%</span>
                          </span>
                        )}
                        {showTarget95 && (
                          <span className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30">
                            <span className="w-2.5 h-0.5 border-t-2 border-dashed border-amber-600 dark:border-amber-400 inline-block" />
                            <span className="text-[10.5px] font-semibold">Target All Sumber: 95%</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Horizontal Scale Ruler Header */}
                    <div className="flex items-center gap-2.5 sm:gap-3 mb-2 text-[10px] text-[#6573a1] dark:text-slate-400 font-mono">
                      <div className="w-32 sm:w-44 shrink-0 text-right pr-2 font-bold uppercase tracking-wider text-[#6573a1] dark:text-slate-500">
                        Nama FKRTL
                      </div>
                      <div className="flex-1 relative h-5">
                        <span className="absolute left-0 bottom-0">0%</span>
                        <span className="absolute left-1/4 -translate-x-1/2 bottom-0 hidden md:inline">25%</span>
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-0">50%</span>
                        <span className="absolute left-3/4 -translate-x-1/2 bottom-0 hidden md:inline">75%</span>
                        {showTarget80 && (
                          <span className="absolute left-[80%] -translate-x-1/2 bottom-0 text-[#2b4390] dark:text-sky-400 font-bold bg-[#afbade]/30 dark:bg-slate-900/90 px-1 rounded border border-[#afbade]/50 dark:border-sky-500/30">
                            80%
                          </span>
                        )}
                        {showTarget95 && (
                          <span className="absolute left-[95%] -translate-x-1/2 bottom-0 text-amber-700 dark:text-amber-400 font-bold bg-amber-100 dark:bg-slate-900/90 px-1 rounded border border-amber-300 dark:border-amber-500/30">
                            95%
                          </span>
                        )}
                        <span className="absolute right-0 bottom-0">100%</span>
                      </div>
                    </div>

                    {/* Horizontal Bars List */}
                    <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1 custom-scrollbar">
                      {sortedFaskes.length === 0 ? (
                        <div className="w-full py-16 text-center text-[#6573a1] dark:text-slate-400 text-xs italic">
                          Tidak ada data Faskes
                        </div>
                      ) : (
                        sortedFaskes.map((f, idx) => {
                          const val = f.avg_capaian ?? 0;
                          const widthPercent = Math.min(Math.max(val, 0), 100);
                          const isTarget95 = val >= 95;
                          const isTarget80 = val >= 80;

                          const isMet = showTarget95 ? isTarget95 : isTarget80;

                          return (
                            <div key={idx} className="group flex items-center gap-2.5 sm:gap-3 hover:bg-[#d4ecd1]/20 dark:hover:bg-slate-900/40 p-1 rounded-xl transition-colors">
                              {/* Nama Faskes (Sumbu Y) */}
                              <div className="w-32 sm:w-44 shrink-0 text-right">
                                <span 
                                  className="text-xs font-bold text-[#2b4390] dark:text-slate-300 group-hover:text-[#44853b] dark:group-hover:text-cyan-300 transition-colors line-clamp-1 block"
                                  title={f.faskes}
                                >
                                  {f.faskes.replace(/\(.*?\)/g, '').trim()}
                                </span>
                              </div>

                              {/* Horizontal Bar Track & Fill */}
                              <div className="flex-1 bg-slate-200/80 dark:bg-slate-950/80 rounded-xl h-8 relative p-1 flex items-center border border-[#afbade]/30 dark:border-white/10 group-hover:border-[#2b4390]/40 dark:group-hover:border-blue-500/40 transition-colors overflow-hidden">
                                {/* Garis Target Vertikal 80% (Hanya muncul jika filter sumber Mobile JKN) */}
                                {showTarget80 && (
                                  <div 
                                    style={{ left: '80%' }} 
                                    className="absolute top-0 bottom-0 w-0.5 border-r border-dashed border-[#2b4390] dark:border-sky-400/90 z-20 pointer-events-none"
                                    title="Garis Target Mobile JKN (80%)"
                                  />
                                )}

                                {/* Garis Target Vertikal 95% (Hanya muncul jika filter sumber All Sumber) */}
                                {showTarget95 && (
                                  <div 
                                    style={{ left: '95%' }} 
                                    className="absolute top-0 bottom-0 w-0.5 border-r border-dashed border-amber-600 dark:border-amber-400/90 z-20 pointer-events-none"
                                    title="Garis Target All Sumber (95%)"
                                  />
                                )}

                                {/* Filled Horizontal Bar */}
                                <div
                                  style={{ width: `${widthPercent}%` }}
                                  className={`h-full rounded-lg transition-all duration-700 relative overflow-hidden ${
                                    isMet 
                                      ? 'bg-gradient-to-r from-[#2b4390] via-[#44853b] to-[#83a67e]' 
                                      : 'bg-gradient-to-r from-[#2b4390] via-[#6573a1] to-[#afbade]'
                                  }`}
                                >
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-white/20 pointer-events-none" />
                                </div>

                                {/* Percentage Display & Target Badges */}
                                <div className="absolute right-3 z-30 flex items-center gap-1.5 drop-shadow-md">
                                  {showTarget95 && isTarget95 && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30 font-bold">
                                      ★ &ge;95%
                                    </span>
                                  )}
                                  {showTarget80 && isTarget80 && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#afbade]/30 text-[#2b4390] border border-[#afbade]/40 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/30 font-bold">
                                      ✓ &ge;80%
                                    </span>
                                  )}
                                  <span className="text-xs font-mono font-black text-white drop-shadow-sm">
                                    {formatPercentID(f.avg_capaian)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. GRAFIK BATANG HORISONTAL NAMA POLI (KANAN) */}
                <div className="glass-card rounded-2xl p-5 sm:p-6 shadow-xl border border-[#afbade]/30 dark:border-white/10 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-5 border-b border-[#afbade]/30 dark:border-slate-800 gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#44853b] shadow-sm shadow-[#44853b]/50" />
                          Grafik Batang Horisontal Nama Poli
                        </h3>
                        <p className="text-xs text-[#6573a1] dark:text-slate-400 mt-0.5">
                          Capaian pemanfaatan antrol berdasarkan Poliklinik BPJS
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setSortPoliDesc(!sortPoliDesc)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#afbade]/20 hover:bg-[#afbade]/30 text-[#2b4390] border border-[#afbade]/40 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>{sortPoliDesc ? 'Tertinggi ↓' : 'Terendah ↑'}</span>
                        </button>
                        {showTarget80 && (
                          <span className="flex items-center gap-1.5 text-xs text-[#2b4390] bg-[#afbade]/20 px-2 py-0.5 rounded-lg border border-[#afbade]/40 dark:text-sky-300 dark:bg-sky-500/10 dark:border-sky-500/30">
                            <span className="w-2.5 h-0.5 border-t-2 border-dashed border-[#2b4390] dark:border-sky-400 inline-block" />
                            <span className="text-[10.5px] font-semibold">Target MJKN: 80%</span>
                          </span>
                        )}
                        {showTarget95 && (
                          <span className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30">
                            <span className="w-2.5 h-0.5 border-t-2 border-dashed border-amber-600 dark:border-amber-400 inline-block" />
                            <span className="text-[10.5px] font-semibold">Target All Sumber: 95%</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Horizontal Scale Ruler Header */}
                    <div className="flex items-center gap-2.5 sm:gap-3 mb-2 text-[10px] text-[#6573a1] dark:text-slate-400 font-mono">
                      <div className="w-32 sm:w-44 shrink-0 text-right pr-2 font-bold uppercase tracking-wider text-[#6573a1] dark:text-slate-500">
                        Nama Poli Spesialis
                      </div>
                      <div className="flex-1 relative h-5">
                        <span className="absolute left-0 bottom-0">0%</span>
                        <span className="absolute left-1/4 -translate-x-1/2 bottom-0 hidden md:inline">25%</span>
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-0">50%</span>
                        <span className="absolute left-3/4 -translate-x-1/2 bottom-0 hidden md:inline">75%</span>
                        {showTarget80 && (
                          <span className="absolute left-[80%] -translate-x-1/2 bottom-0 text-[#2b4390] dark:text-sky-400 font-bold bg-[#afbade]/30 dark:bg-slate-900/90 px-1 rounded border border-[#afbade]/50 dark:border-sky-500/30">
                            80%
                          </span>
                        )}
                        {showTarget95 && (
                          <span className="absolute left-[95%] -translate-x-1/2 bottom-0 text-amber-700 dark:text-amber-400 font-bold bg-amber-100 dark:bg-slate-900/90 px-1 rounded border border-amber-300 dark:border-amber-500/30">
                            95%
                          </span>
                        )}
                        <span className="absolute right-0 bottom-0">100%</span>
                      </div>
                    </div>

                    {/* Horizontal Bars List */}
                    <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1 custom-scrollbar">
                      {sortedPoli.length === 0 ? (
                        <div className="w-full py-16 text-center text-[#6573a1] dark:text-slate-400 text-xs italic">
                          Tidak ada data Poli
                        </div>
                      ) : (
                        sortedPoli.map((p, idx) => {
                          const val = p.avg_capaian ?? 0;
                          const widthPercent = Math.min(Math.max(val, 0), 100);
                          const isTarget95 = val >= 95;
                          const isTarget80 = val >= 80;

                          const isMet = showTarget95 ? isTarget95 : isTarget80;

                          return (
                            <div key={idx} className="group flex items-center gap-2.5 sm:gap-3 hover:bg-[#d4ecd1]/20 dark:hover:bg-slate-900/40 p-1 rounded-xl transition-colors">
                              {/* Nama Poli (Sumbu Y) */}
                              <div className="w-32 sm:w-44 shrink-0 text-right">
                                <span 
                                  className="text-xs font-bold text-[#2b4390] dark:text-slate-300 group-hover:text-[#44853b] dark:group-hover:text-emerald-300 transition-colors line-clamp-1 block"
                                  title={p.poli}
                                >
                                  {p.poli}
                                </span>
                              </div>

                              {/* Horizontal Bar Track & Fill */}
                              <div className="flex-1 bg-slate-200/80 dark:bg-slate-950/80 rounded-xl h-8 relative p-1 flex items-center border border-[#afbade]/30 dark:border-white/10 group-hover:border-[#44853b]/40 dark:group-hover:border-emerald-500/40 transition-colors overflow-hidden">
                                {/* Garis Target Vertikal 80% (Hanya muncul jika filter sumber Mobile JKN) */}
                                {showTarget80 && (
                                  <div 
                                    style={{ left: '80%' }} 
                                    className="absolute top-0 bottom-0 w-0.5 border-r border-dashed border-[#2b4390] dark:border-sky-400/90 z-20 pointer-events-none"
                                    title="Garis Target Mobile JKN (80%)"
                                  />
                                )}

                                {/* Garis Target Vertikal 95% (Hanya muncul jika filter sumber All Sumber) */}
                                {showTarget95 && (
                                  <div 
                                    style={{ left: '95%' }} 
                                    className="absolute top-0 bottom-0 w-0.5 border-r border-dashed border-amber-600 dark:border-amber-400/90 z-20 pointer-events-none"
                                    title="Garis Target All Sumber (95%)"
                                  />
                                )}

                                {/* Filled Horizontal Bar */}
                                <div
                                  style={{ width: `${widthPercent}%` }}
                                  className={`h-full rounded-lg transition-all duration-700 relative overflow-hidden ${
                                    isMet 
                                      ? 'bg-gradient-to-r from-[#2b4390] via-[#44853b] to-[#83a67e]' 
                                      : 'bg-gradient-to-r from-[#2b4390] via-[#6573a1] to-[#afbade]'
                                  }`}
                                >
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-white/20 pointer-events-none" />
                                </div>

                                {/* Percentage Display & Target Badges */}
                                <div className="absolute right-3 z-30 flex items-center gap-1.5 drop-shadow-md">
                                  {showTarget95 && isTarget95 && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30 font-bold">
                                      ★ &ge;95%
                                    </span>
                                  )}
                                  {showTarget80 && isTarget80 && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#afbade]/30 text-[#2b4390] border border-[#afbade]/40 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/30 font-bold">
                                      ✓ &ge;80%
                                    </span>
                                  )}
                                  <span className="text-xs font-mono font-black text-white drop-shadow-sm">
                                    {formatPercentID(p.avg_capaian)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
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
