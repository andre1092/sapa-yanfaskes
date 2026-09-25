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

    setAuthReady(true);
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

  const { data, isLoading, isError, error, refetch } = useFkrtlAntrolData(filters, authReady);

  const sortedFaskes = data?.top_faskes ? [...data.top_faskes].sort((a, b) => sortFaskesDesc ? b.avg_capaian - a.avg_capaian : a.avg_capaian - b.avg_capaian) : [];
  const sortedPoli = data?.top_poli ? [...data.top_poli].sort((a, b) => sortPoliDesc ? b.avg_capaian - a.avg_capaian : a.avg_capaian - b.avg_capaian) : [];

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

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-300">Memuat Live Data Google Spreadsheet FKRTL...</p>
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
    kabupaten: ['(All)', 'Bondowoso', 'Jember', 'Lumajang'],
    nama_rs: ['(All)'],
    bulan: ['(All)', 'September 2026', 'Agustus 2026'],
    tahun: ['(All)', '2026'],
    sumber: ['All Sumber', 'Mobile JKN'],
  };

  const lastUpdate = data?.last_update || '09/24/2026 03:14:56';
  const selectedPeriod = data?.selected_period || (filters.bulan !== '(All)' ? filters.bulan : 'September 2026');
  const kpiValue = data?.kpi_capaian ?? 0.0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* 1. KOTAK KETERANGAN: "Last Update : ...." & Header Utama */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 shadow-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-slate-900/60 to-blue-950/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-8 rounded-full bpjs-gradient shadow-md shadow-emerald-500/40" />
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Pemanfaatan Sistem Antrean Online FKRTL
              </h2>
              {/* Kotak Keterangan Last Update sesuai instruksi spesifik pengguna */}
              <div className="mt-1 flex items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-xs sm:text-sm tracking-wide shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Last Update : {lastUpdate}</span>
                </div>
                <span className="text-[11px] text-slate-300 hidden sm:inline">
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
              className="bpjs-gradient-btn flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md shadow-emerald-950/40 border border-emerald-400/30 transition-all active:scale-95 cursor-pointer"
            >
              <span>{downloadingType === 'faskes' ? '⏳ Mengunduh...' : '💾 Unduh Data RS'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openDropdown === 'faskes' && (
              <div className="absolute right-0 mt-2 w-56 glass-panel border border-emerald-500/30 rounded-xl shadow-2xl z-50 overflow-hidden">
                <button onClick={() => handleDownload('faskes', 'xlsx')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors border-b border-emerald-500/15 cursor-pointer">
                  Format Excel (.xlsx)
                </button>
                <button onClick={() => handleDownload('faskes', 'jpeg')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors border-b border-emerald-500/15 cursor-pointer">
                  Format Gambar (.JPEG)
                </button>
                <button onClick={() => handleDownload('faskes', 'csv')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors cursor-pointer">
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
                  Format Excel (.xlsx)
                </button>
                <button onClick={() => handleDownload('poli', 'jpeg')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors border-b border-emerald-500/15 cursor-pointer">
                  Format Gambar (.JPEG)
                </button>
                <button onClick={() => handleDownload('poli', 'csv')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-emerald-900/30 text-left text-xs font-semibold text-slate-200 transition-colors cursor-pointer">
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

          {/* Panel Kontrol Filter (Urutan: Kabupaten, Nama Faskes, Bulan, Tahun, Sumber) */}
          <div className="glass-card rounded-2xl p-5 space-y-4 shadow-lg border border-emerald-500/20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filter Analitik
              </span>
              <button
                onClick={handleResetFilter}
                className="text-[11px] font-semibold text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer"
              >
                Reset
              </button>
            </div>

            {/* Filter 1: Kabupaten */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">1. Kabupaten</label>
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

            {/* Filter 2: Nama Faskes */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">2. Nama Faskes</label>
              <select
                value={filters.nama_rs || '(All)'}
                onChange={(e) => handleFilterChange('nama_rs', e.target.value)}
                className="glass-input w-full rounded-xl px-3.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-emerald-400 transition-colors cursor-pointer"
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">3. Bulan</label>
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

            {/* Filter 4: Tahun */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">4. Tahun</label>
              <select
                value={filters.tahun || '2026'}
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

            {/* Filter 5: Sumber */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">5. Sumber</label>
              <select
                value={filters.sumber || 'All Sumber'}
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

          {/* Kotak Keterangan Analisis & Kebijakan */}
          <div className="glass-card rounded-2xl p-4.5 text-slate-300 text-xs leading-relaxed space-y-1.5 border border-white/10">
            <span className="font-bold text-emerald-300 block flex items-center gap-1.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              {/* 1. GRAFIK BATANG HORISONTAL BULANAN (MENGAMBIL TIMESTAMP TERBARU) */}
              <div className="glass-card rounded-2xl p-6 shadow-xl border border-emerald-500/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-5 border-b border-emerald-500/20 gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                      Grafik Batang Horisontal Bulanan
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      Data agregasi mengambil <span className="font-semibold text-emerald-400">Timestamp Terbaru</span> per bulan (Format: MM/DD/YYYY HH:MM:SS)
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                      Target BPJS: &ge;85%
                    </span>
                  </div>
                </div>

                <div className="space-y-3.5">
                  {data.trend_per_bulan.map((item, idx) => {
                    const isTargetMet = item.avg_capaian >= 85;
                    return (
                      <div key={idx} className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        {/* Label Bulan & Keterangan Timestamp Terbaru */}
                        <div className="w-full sm:w-52 shrink-0 flex sm:flex-col justify-between items-baseline sm:items-start">
                          <span className="text-xs font-bold text-slate-200 group-hover:text-emerald-300 transition-colors">
                            {item.month_full || item.month}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                            <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {item.latest_timestamp || 'MM/DD/YYYY HH:MM:SS'}
                          </span>
                        </div>

                        {/* Horizontal Bar Track & Fill */}
                        <div className="flex-1 bg-slate-950/80 rounded-xl h-8 relative p-1 flex items-center border border-white/10 group-hover:border-emerald-500/40 transition-colors overflow-hidden">
                          {/* 85% Target Indicator line */}
                          <div 
                            style={{ left: '85%' }} 
                            className="absolute top-0 bottom-0 w-0.5 border-r border-dashed border-amber-400/70 z-10 pointer-events-none"
                            title="Target 85%"
                          />

                          {/* Filled Horizontal Bar */}
                          <div
                            style={{ width: `${Math.min(Math.max(item.avg_capaian, 0), 100)}%` }}
                            className={`h-full rounded-lg transition-all duration-700 relative overflow-hidden ${
                              isTargetMet 
                                ? 'bg-gradient-to-r from-[#00529C] via-[#009B4D] to-[#10B981]' 
                                : 'bg-gradient-to-r from-[#00529C] via-[#0A5EB5] to-[#0284c7]'
                            }`}
                          >
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-white/20 pointer-events-none" />
                          </div>

                          {/* Percentage Display */}
                          <span className="absolute right-3 text-xs font-extrabold text-white drop-shadow-md z-20 flex items-center gap-1.5">
                            {formatPercentID(item.avg_capaian)}
                            {isTargetMet && (
                              <span className="text-emerald-300 text-[10px]">★</span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. GRAFIK BATANG VERTIKAL FASKES */}
              <div className="glass-card rounded-2xl p-6 shadow-xl border border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-6 border-b border-slate-800 gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50" />
                      Grafik Batang Vertikal Faskes
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Capaian pemanfaatan antrol per Rumah Sakit FKRTL di wilayah yang dipilih
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSortFaskesDesc(!sortFaskesDesc)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>{sortFaskesDesc ? 'Tertinggi ↓' : 'Terendah ↑'}</span>
                    </button>
                    <span className="text-[11px] font-semibold text-slate-400">Target &ge;85%</span>
                  </div>
                </div>

                {/* Vertical Bars Container with Horizontal Scroll */}
                <div className="overflow-x-auto pb-4 pt-2">
                  <div className="h-72 min-w-[700px] flex items-end gap-3 px-2 border-b border-slate-700/80 relative">
                    {/* 85% Target Line */}
                    <div 
                      style={{ bottom: '85%' }} 
                      className="absolute left-0 right-0 border-b border-dashed border-amber-400/70 z-10 pointer-events-none flex justify-end pr-2"
                    >
                      <span className="text-[10px] text-amber-300 font-bold -mt-4 bg-slate-900/90 px-1.5 rounded">Target 85%</span>
                    </div>

                    {sortedFaskes.length === 0 ? (
                      <div className="w-full py-16 text-center text-slate-400 text-xs italic">
                        Tidak ada data Faskes
                      </div>
                    ) : (
                      sortedFaskes.map((f, idx) => {
                        const heightPercent = Math.min(Math.max(f.avg_capaian, 4), 100);
                        const isTarget = f.avg_capaian >= 85;
                        return (
                          <div key={idx} className="flex-1 min-w-[50px] max-w-[75px] flex flex-col items-center h-full justify-end group relative">
                            {/* Hover Tooltip */}
                            <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 bg-slate-900/95 border border-emerald-500/40 text-white rounded-lg p-2 text-center whitespace-nowrap shadow-xl">
                              <p className="text-[10px] font-bold">{f.faskes}</p>
                              <p className="text-xs font-extrabold text-emerald-400">{formatPercentID(f.avg_capaian)}</p>
                            </div>

                            {/* Percentage above bar */}
                            <span className="text-[10px] font-bold text-slate-200 mb-1 group-hover:text-cyan-300 transition-colors">
                              {formatPercentID(f.avg_capaian)}
                            </span>

                            {/* Vertical Bar */}
                            <div
                              style={{ height: `${heightPercent}%` }}
                              className={`w-full rounded-t-lg transition-all duration-500 relative cursor-pointer group-hover:brightness-110 shadow-md ${
                                isTarget 
                                  ? 'bg-gradient-to-t from-[#00529C] to-[#009B4D] border-t-2 border-emerald-300' 
                                  : 'bg-gradient-to-t from-[#00529C] via-[#0A5EB5] to-[#38bdf8] border-t-2 border-sky-300'
                              }`}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none" />
                            </div>

                            {/* X-axis Label */}
                            <div className="w-full mt-2 h-14 overflow-hidden text-center">
                              <span className="text-[10px] font-semibold text-slate-400 group-hover:text-white line-clamp-2 leading-tight block" title={f.faskes}>
                                {f.faskes.replace(/\(.*?\)/g, '').trim()}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* 3. GRAFIK BATANG VERTIKAL NAMA POLI */}
              <div className="glass-card rounded-2xl p-6 shadow-xl border border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-6 border-b border-slate-800 gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                      Grafik Batang Vertikal Nama Poli
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Capaian pemanfaatan antrol berdasarkan Nama Poli tujuan resmi BPJS Kesehatan
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSortPoliDesc(!sortPoliDesc)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>{sortPoliDesc ? 'Tertinggi ↓' : 'Terendah ↑'}</span>
                    </button>
                  </div>
                </div>

                {/* Vertical Bars Container with Horizontal Scroll */}
                <div className="overflow-x-auto pb-4 pt-2">
                  <div className="h-72 min-w-[700px] flex items-end gap-3 px-2 border-b border-slate-700/80 relative">
                    {sortedPoli.length === 0 ? (
                      <div className="w-full py-16 text-center text-slate-400 text-xs italic">
                        Tidak ada data Poli
                      </div>
                    ) : (
                      sortedPoli.map((p, idx) => {
                        const heightPercent = Math.min(Math.max(p.avg_capaian, 4), 100);
                        return (
                          <div key={idx} className="flex-1 min-w-[50px] max-w-[75px] flex flex-col items-center h-full justify-end group relative">
                            {/* Hover Tooltip */}
                            <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 bg-slate-900/95 border border-emerald-500/40 text-white rounded-lg p-2 text-center whitespace-nowrap shadow-xl">
                              <p className="text-[10px] font-bold">{p.poli}</p>
                              <p className="text-xs font-extrabold text-emerald-400">{formatPercentID(p.avg_capaian)}</p>
                            </div>

                            {/* Percentage above bar */}
                            <span className="text-[10px] font-bold text-slate-200 mb-1 group-hover:text-emerald-300 transition-colors">
                              {formatPercentID(p.avg_capaian)}
                            </span>

                            {/* Vertical Bar */}
                            <div
                              style={{ height: `${heightPercent}%` }}
                              className="w-full rounded-t-lg bg-gradient-to-t from-[#00529C] via-[#009B4D] to-[#10B981] border-t-2 border-emerald-300 transition-all duration-500 relative cursor-pointer group-hover:brightness-110 shadow-md"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none" />
                            </div>

                            {/* X-axis Label */}
                            <div className="w-full mt-2 h-14 overflow-hidden text-center">
                              <span className="text-[10px] font-semibold text-slate-400 group-hover:text-white line-clamp-2 leading-tight block" title={p.poli}>
                                {p.poli}
                              </span>
                            </div>
                          </div>
                        );
                      })
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
