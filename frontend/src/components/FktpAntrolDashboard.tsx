import React, { useState, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useFktpAntrolData } from '../hooks/useDashboardData';
import type { FktpFilterParams, FktpTableRow } from '../hooks/useDashboardData';
import { apiClient } from '../lib/apiClient';
import { useSyncStore } from '../store/syncStore';

const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE || '';

export const FktpAntrolDashboard: React.FC = () => {
  const { getAccessTokenSilently } = useAuth0();

  // 1. Filter State (Bulan, Kabupaten, Jenis FKTP, Sumber Antrean)
  const [filters, setFilters] = useState<FktpFilterParams>({
    bulan: 'September 2026',
    kabupaten: '(All)',
    jenis_fktp: '(All)',
    sumber_antrean: 'Mobile JKN',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [sortDesc, setSortDesc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  // Active floating tooltip state for table row
  const [hoveredRowData, setHoveredRowData] = useState<{
    row: FktpTableRow;
    x: number;
    y: number;
  } | null>(null);

  const liveSyncAntrol = useSyncStore((s) => s.lastUpdateAntrol);
  const { data, isLoading, refetch } = useFktpAntrolData(filters, true);

  // Sync Trigger Handler
  const handleForceSync = async () => {
    setIsSyncing(true);
    setSyncSuccessMsg(null);
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: AUTH0_AUDIENCE },
      });
      const res = await apiClient.post(
        '/api/v1/fktp-antrol-sync',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.status === 'success') {
        setSyncSuccessMsg(`Data berhasil disinkronkan (${res.data.total_records} baris)`);
        await refetch();
        setTimeout(() => setSyncSuccessMsg(null), 4000);
      }
    } catch (err) {
      console.error('Gagal sinkronisasi data FKTP:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Helper formatting
  const formatPercentID = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '0,00%';
    return `${val.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  };

  const formatNumberID = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '0';
    return val.toLocaleString('id-ID');
  };

  // Filter & Search Table Data
  const filteredTableData = useMemo(() => {
    const list = Array.isArray(data?.table_data) ? data.table_data : [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (r) =>
        r.nama_fktp.toLowerCase().includes(q) ||
        r.kode_fktp.toLowerCase().includes(q) ||
        r.kabupaten.toLowerCase().includes(q) ||
        r.jenis_fktp.toLowerCase().includes(q)
    );
  }, [data?.table_data, searchQuery]);

  // Sorted Table Data
  const sortedTableData = useMemo(() => {
    return [...filteredTableData].sort((a, b) =>
      sortDesc
        ? b.persentase_capaian - a.persentase_capaian
        : a.persentase_capaian - b.persentase_capaian
    );
  }, [filteredTableData, sortDesc]);

  // Paginated Data
  const totalPages = Math.ceil(sortedTableData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTableData.slice(start, start + pageSize);
  }, [sortedTableData, currentPage, pageSize]);

  // Display Timestamp
  const lastUpdateText = data?.last_update || liveSyncAntrol || '09/28/2026 03:13:14';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto min-h-screen text-slate-800 dark:text-slate-100">
      {/* 1. Header & Live Timestamp Banner */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-[#afbade]/40 dark:border-emerald-500/20 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#2b4390] via-[#83a67e] to-[#44853b]" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#44853b] dark:text-emerald-400 bg-[#d4ecd1]/60 dark:bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-[#83a67e]/30">
                Layanan Primer
              </span>
              <span className="text-xs text-[#6573a1] dark:text-slate-400 font-medium">
                • Fasilitas Kesehatan Tingkat Pertama (FKTP)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#2b4390] dark:text-white tracking-tight">
              Pemanfaatan Antrean Online FKTP
            </h1>
            <p className="text-xs sm:text-sm text-[#6573a1] dark:text-slate-300 mt-1">
              Pemantauan Rasio Realisasi Pendaftaran Antrean Online (Mobile JKN & Bridging Sistem) KC Jember, Lumajang, dan Bondowoso
            </p>
          </div>

          {/* Last Update & Sync Button Card */}
          <div className="flex items-center gap-3">
            <div className="bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-slate-700/80 px-4 py-2.5 rounded-xl shadow-sm">
              <div className="text-[10px] uppercase font-bold text-[#6573a1] dark:text-slate-400 tracking-wider">
                Status Pembaruan Data
              </div>
              <div className="text-xs font-mono font-bold text-[#2b4390] dark:text-emerald-300 flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-[#44853b] animate-pulse" />
                <span>Last Update : {lastUpdateText}</span>
              </div>
            </div>

            <button
              onClick={handleForceSync}
              disabled={isSyncing}
              title="Sinkronisasikan data terbaru langsung dari Google Spreadsheet"
              className="px-3.5 py-2.5 rounded-xl bpjs-gradient-btn text-white text-xs font-bold flex items-center gap-2 shadow-md hover:shadow-emerald-700/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span className="hidden sm:inline">{isSyncing ? 'Menyinkronkan...' : 'Sinkronisasi'}</span>
            </button>
          </div>
        </div>

        {syncSuccessMsg && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn">
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{syncSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* 2. Filter Bar 4-Dimensi */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-[#afbade]/30 dark:border-slate-800 shadow-md">
        <div className="text-xs font-bold text-[#2b4390] dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-[#44853b] dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filter Parameter Pemanfaatan Antrol FKTP
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Filter 1: Bulan */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6573a1] dark:text-slate-400 mb-1">
              Bulan (Snapshot Timestamp)
            </label>
            <select
              value={filters.bulan || '(All)'}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, bulan: e.target.value }));
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/50 dark:border-slate-700 rounded-xl px-3 py-2 text-[#2b4390] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#44853b]"
            >
              {(data?.filter_options?.bulan ?? ['(All)', 'September 2026']).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 2: Kabupaten */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6573a1] dark:text-slate-400 mb-1">
              Kabupaten / Wilayah
            </label>
            <select
              value={filters.kabupaten || '(All)'}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, kabupaten: e.target.value }));
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/50 dark:border-slate-700 rounded-xl px-3 py-2 text-[#2b4390] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#44853b]"
            >
              {(data?.filter_options?.kabupaten ?? ['(All)', 'KAB. JEMBER', 'KAB. LUMAJANG', 'KAB. BONDOWOSO']).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 3: Jenis FKTP */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6573a1] dark:text-slate-400 mb-1">
              Jenis FKTP
            </label>
            <select
              value={filters.jenis_fktp || '(All)'}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, jenis_fktp: e.target.value }));
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/50 dark:border-slate-700 rounded-xl px-3 py-2 text-[#2b4390] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#44853b]"
            >
              {(data?.filter_options?.jenis_fktp ?? ['(All)', 'PUSKESMAS', 'KLINIK PRATAMA', 'DOKTER KELUARGA']).map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 4: Sumber Antrean */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6573a1] dark:text-slate-400 mb-1">
              Sumber Antrean
            </label>
            <select
              value={filters.sumber_antrean || 'Mobile JKN'}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, sumber_antrean: e.target.value }));
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/50 dark:border-slate-700 rounded-xl px-3 py-2 text-[#2b4390] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#44853b]"
            >
              {(data?.filter_options?.sumber_antrean ?? ['Mobile JKN', 'All Sumber', '(All)']).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3. 4 Kartu KPI Eksekutif */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Capaian Pemanfaatan Antrol */}
        <div className="glass-card p-5 rounded-2xl border border-[#83a67e]/30 dark:border-emerald-500/20 shadow-md relative overflow-hidden group">
          <div className="absolute -right-3 -top-3 w-16 h-16 bg-[#44853b]/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between text-[#6573a1] dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Rata-Rata Capaian Antrol</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/30">
              {filters.sumber_antrean === 'All Sumber' ? 'Target ≥95%' : 'Target ≥80%'}
            </span>
          </div>
          <div className="text-3xl font-black text-[#2b4390] dark:text-white font-mono mt-2 tracking-tight">
            {formatPercentID(data?.kpi?.avg_capaian)}
          </div>
          <div className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#44853b]" />
            <span>Kanal: <strong className="text-[#2b4390] dark:text-emerald-300">{filters.sumber_antrean || 'Mobile JKN'}</strong></span>
          </div>
        </div>

        {/* KPI 2: Total Antrean Online (CF) */}
        <div className="glass-card p-5 rounded-2xl border border-[#afbade]/30 dark:border-slate-800 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between text-[#6573a1] dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Total Antrean CF</span>
            <svg className="w-4 h-4 text-[#2b4390] dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="text-3xl font-black text-[#2b4390] dark:text-white font-mono mt-2 tracking-tight">
            {formatNumberID(data?.kpi?.total_cf)}
          </div>
          <div className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-1">
            Transaksi terbit dari kanal antrol
          </div>
        </div>

        {/* KPI 3: Total Transaksi Seluruh Sumber */}
        <div className="glass-card p-5 rounded-2xl border border-[#afbade]/30 dark:border-slate-800 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between text-[#6573a1] dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Total Transaksi Kanal</span>
            <svg className="w-4 h-4 text-[#6573a1] dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="text-3xl font-black text-[#2b4390] dark:text-white font-mono mt-2 tracking-tight">
            {formatNumberID(data?.kpi?.total_transaksi_sumber)}
          </div>
          <div className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-1">
            Penyebut (Denominator) pemanfaatan
          </div>
        </div>

        {/* KPI 4: Total FKTP Aktif */}
        <div className="glass-card p-5 rounded-2xl border border-[#83a67e]/30 dark:border-emerald-500/20 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between text-[#6573a1] dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>FKTP Terdata</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#afbade]/30 text-[#2b4390] dark:text-cyan-300">
              Primer
            </span>
          </div>
          <div className="text-3xl font-black text-[#44853b] dark:text-emerald-400 font-mono mt-2 tracking-tight">
            {formatNumberID(data?.kpi?.total_fktp)}
          </div>
          <div className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-1">
            Fasilitas kesehatan tersaring aktif
          </div>
        </div>
      </div>

      {/* 4. Grafik Bulanan Tren Capaian (SVG Line Chart with Zero Layout Shift Container) */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-[#afbade]/30 dark:border-slate-800 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#2b4390] dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#44853b]" />
              Tren Pemanfaatan Antrol FKTP Bulanan (Januari – September 2026)
            </h2>
            <p className="text-xs text-[#6573a1] dark:text-slate-400 mt-0.5">
              Rata-rata persentase realisasi penutupan bulan berdasarkan stempel waktu snapshot resmi
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-[#2b4390] dark:text-slate-300">
              <span className="w-3 h-0.5 bg-[#44853b] inline-block" />
              Realisasi Antrol FKTP
            </span>
            <span className="flex items-center gap-1.5 font-medium text-sky-600 dark:text-sky-400">
              <span className="w-3 h-0.5 bg-sky-500 border-b border-dashed inline-block" />
              Target 80% (MJKN)
            </span>
            <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
              <span className="w-3 h-0.5 bg-amber-500 border-b border-dashed inline-block" />
              Target 95% (All)
            </span>
          </div>
        </div>

        {/* Zero Layout Shift Container for Hover Banner */}
        <div className="mb-4 sm:h-[62px] min-h-[62px] flex items-center">
          {hoveredMonthIndex !== null && data?.trend_per_bulan?.[hoveredMonthIndex] ? (() => {
            const activeItem = data.trend_per_bulan[hoveredMonthIndex];
            const targetThreshold = filters.sumber_antrean === 'All Sumber' ? 95 : 80;
            const met = (activeItem?.avg_capaian ?? 0) >= targetThreshold;
            return (
              <div className="w-full p-2.5 sm:p-3 rounded-xl bg-white/95 dark:bg-slate-900/90 border border-[#83a67e]/40 dark:border-emerald-500/40 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      met
                        ? 'bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : 'bg-[#afbade]/30 text-[#2b4390] border border-[#afbade]/50 dark:bg-blue-500/20 dark:text-blue-300'
                    }`}
                  >
                    {activeItem.month}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#2b4390] dark:text-white flex items-center gap-2">
                      <span>{activeItem.month_full || activeItem.month}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          met
                            ? 'bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300'
                        }`}
                      >
                        {met ? `★ Memenuhi Target (≥${targetThreshold}%)` : `⚠️ Di Bawah Target (<${targetThreshold}%)`}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6573a1] dark:text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
                      <span>Snapshot: <strong className="text-[#44853b] dark:text-emerald-300">{activeItem.latest_timestamp}</strong></span>
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <span>CF: <strong>{formatNumberID(activeItem.total_cf)}</strong> / Transaksi: <strong>{formatNumberID(activeItem.total_transaksi_sumber)}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="text-right sm:border-l sm:border-[#afbade]/30 dark:sm:border-slate-800 sm:pl-4 shrink-0">
                  <div className="text-[10px] uppercase tracking-wider text-[#6573a1] dark:text-slate-400 font-bold">
                    Capaian FKTP
                  </div>
                  <div className={`text-base font-extrabold font-mono ${met ? 'text-[#44853b] dark:text-emerald-400' : 'text-[#2b4390] dark:text-cyan-400'}`}>
                    {formatPercentID(activeItem.avg_capaian)}
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="w-full p-2.5 sm:p-3 rounded-xl bg-[#afbade]/10 dark:bg-slate-800/30 border border-dashed border-[#afbade]/40 dark:border-slate-700/60 flex items-center justify-between gap-3 text-xs text-[#6573a1] dark:text-slate-400">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/70 dark:bg-slate-800/60 text-[#2b4390] dark:text-blue-300 border border-[#afbade]/30 dark:border-slate-700 shrink-0">
                  <svg className="w-4 h-4 text-[#44853b] dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-[#2b4390] dark:text-slate-200">Eksplorasi Snapshot Bulanan FKTP</span>
                  <span className="hidden sm:inline text-[11px] text-[#6573a1] dark:text-slate-400 ml-1.5">
                    — Arahkan kursor pada kurva grafik atau kartu bulan di bawah untuk mengunci data.
                  </span>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/60 dark:bg-slate-800/40 border border-[#afbade]/30 dark:border-slate-700 text-[#44853b] dark:text-emerald-400 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#44853b] animate-ping" />
                <span>Interactive Chart</span>
              </div>
            </div>
          )}
        </div>

        {/* SVG Viewport */}
        {(() => {
          const ptsList = Array.isArray(data?.trend_per_bulan) ? data.trend_per_bulan : [];
          const padL = 50;
          const padR = 40;
          const padT = 30;
          const padB = 40;
          const viewW = 1000;
          const viewH = 260;
          const chartW = viewW - padL - padR;
          const chartH = viewH - padT - padB;

          const maxVal = Math.max(105, ...ptsList.map((p) => p.avg_capaian || 0));
          const yDomainMax = Math.ceil(maxVal / 10) * 10;

          const getY = (val: number) => {
            const clamped = Math.max(0, Math.min(val, yDomainMax));
            return padT + chartH - (clamped / yDomainMax) * chartH;
          };

          const coords = ptsList.map((item, idx) => {
            const x = ptsList.length > 1 ? padL + (idx / (ptsList.length - 1)) * chartW : padL + chartW / 2;
            const y = getY(item.avg_capaian || 0);
            return { x, y, item, idx };
          });

          let pathD = '';
          if (coords.length > 1) {
            pathD = `M ${coords[0].x} ${coords[0].y}`;
            for (let i = 0; i < coords.length - 1; i++) {
              const p0 = i > 0 ? coords[i - 1] : coords[i];
              const p1 = coords[i];
              const p2 = coords[i + 1];
              const p3 = i != coords.length - 2 ? coords[i + 2] : p2;
              const cp1x = p1.x + (p2.x - p0.x) / 6;
              const cp1y = p1.y + (p2.y - p0.y) / 6;
              const cp2x = p2.x - (p3.x - p1.x) / 6;
              const cp2y = p2.y - (p3.y - p1.y) / 6;
              pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
            }
          }

          const areaD = pathD
            ? `${pathD} L ${coords[coords.length - 1].x} ${padT + chartH} L ${coords[0].x} ${padT + chartH} Z`
            : '';

          const y80 = getY(80);
          const y95 = getY(95);

          return (
            <div className="w-full overflow-x-auto">
              <div className="min-w-[700px]">
                <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full h-auto overflow-visible select-none">
                  <defs>
                    <linearGradient id="fktpAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#44853b" stopOpacity="0.35" />
                      <stop offset="50%" stopColor="#2b4390" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#2b4390" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {[0, 25, 50, 75, 100].map((tick) => {
                    const y = getY(tick);
                    return (
                      <g key={tick}>
                        <line
                          x1={padL}
                          y1={y}
                          x2={padL + chartW}
                          y2={y}
                          stroke="currentColor"
                          strokeDasharray="3 3"
                          className="text-[#afbade]/30 dark:text-slate-700/60"
                        />
                        <text
                          x={padL - 8}
                          y={y + 3}
                          textAnchor="end"
                          className="text-[10px] font-mono font-medium fill-[#6573a1] dark:fill-slate-400"
                        >
                          {tick}%
                        </text>
                      </g>
                    );
                  })}

                  {/* Target 80% line */}
                  <line
                    x1={padL}
                    y1={y80}
                    x2={padL + chartW}
                    y2={y80}
                    stroke="#0284c7"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    className="opacity-75"
                  />
                  <text x={padL + 6} y={y80 - 4} className="text-[9.5px] font-bold fill-sky-600 dark:fill-sky-400">
                    Target Mobile JKN (80%)
                  </text>

                  {/* Target 95% line */}
                  <line
                    x1={padL}
                    y1={y95}
                    x2={padL + chartW}
                    y2={y95}
                    stroke="#d97706"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    className="opacity-75"
                  />
                  <text x={padL + chartW - 6} y={y95 - 4} textAnchor="end" className="text-[9.5px] font-bold fill-amber-600 dark:fill-amber-400">
                    Target All Sumber (95%)
                  </text>

                  {/* Filled Area */}
                  {areaD && <path d={areaD} fill="url(#fktpAreaGrad)" />}

                  {/* Stroke Path */}
                  {pathD && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#44853b"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Points & Hitboxes */}
                  {coords.map((pt) => {
                    const isHovered = hoveredMonthIndex === pt.idx;
                    const isTargetMet = (pt.item.avg_capaian || 0) >= 80;

                    return (
                      <g key={pt.idx}>
                        {/* Vertical Highlight bar */}
                        {isHovered && (
                          <line
                            x1={pt.x}
                            y1={padT}
                            x2={pt.x}
                            y2={padT + chartH}
                            stroke="#44853b"
                            strokeWidth="1.5"
                            strokeDasharray="4 2"
                            className="opacity-60"
                          />
                        )}

                        {/* Outer Ring */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 8.5 : 5.5}
                          fill="#ffffff"
                          stroke={isTargetMet ? '#44853b' : '#2b4390'}
                          strokeWidth={isHovered ? 3 : 2}
                          className="cursor-pointer transition-all duration-200"
                        />

                        {/* Inner Dot */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 4 : 2.5}
                          fill={isTargetMet ? '#44853b' : '#2b4390'}
                          className="pointer-events-none"
                        />

                        {/* Value pill */}
                        <g transform={`translate(${pt.x}, ${pt.y - 14})`}>
                          <rect
                            x="-22"
                            y="-11"
                            width="44"
                            height="14"
                            rx="4"
                            fill={isHovered ? '#2b4390' : isTargetMet ? '#44853b' : '#6573a1'}
                            stroke="#ffffff"
                            strokeWidth="1"
                            className="transition-colors shadow-sm"
                          />
                          <text
                            textAnchor="middle"
                            y="-1"
                            className="text-[9px] font-extrabold font-mono fill-white"
                          >
                            {formatPercentID(pt.item.avg_capaian)}
                          </text>
                        </g>

                        {/* Month Label */}
                        <text
                          x={pt.x}
                          y={padT + chartH + 20}
                          textAnchor="middle"
                          className={`text-[11px] font-bold transition-colors cursor-pointer ${
                            isHovered
                              ? 'fill-[#44853b] dark:fill-emerald-300 font-extrabold'
                              : 'fill-[#2b4390] dark:fill-slate-300'
                          }`}
                        >
                          {pt.item.month}
                        </text>

                        {/* Invisible Hitbox */}
                        <rect
                          x={pt.x - chartW / (coords.length * 2)}
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

        {/* Strip Snapshot Timestamp Bulan */}
        <div className="mt-5 pt-4 border-t border-[#afbade]/30 dark:border-emerald-500/20">
          <div className="text-[11px] font-bold text-[#2b4390] dark:text-slate-300 uppercase tracking-wider mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[#44853b] dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Snapshot Timestamp Resmi per Bulan
            </span>
            <span className="text-[10px] text-[#6573a1] dark:text-slate-400 font-normal">
              Arahkan mouse untuk menyorot kurva
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
            {(data?.trend_per_bulan ?? []).map((item, idx) => {
              const isHovered = hoveredMonthIndex === idx;
              const met = (item?.avg_capaian ?? 0) >= 80;
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredMonthIndex(idx)}
                  onMouseLeave={() => setHoveredMonthIndex(null)}
                  className={`p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                    isHovered
                      ? 'border-[#44853b] bg-emerald-50/90 dark:bg-emerald-950/40 shadow-md scale-[1.03]'
                      : 'border-[#afbade]/30 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 hover:border-[#83a67e]/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2b4390] dark:text-white">{item.month}</span>
                    <span className={`text-[10px] font-mono font-bold ${met ? 'text-[#44853b] dark:text-emerald-400' : 'text-[#6573a1] dark:text-slate-400'}`}>
                      {formatPercentID(item.avg_capaian)}
                    </span>
                  </div>
                  <div className="text-[9.5px] font-mono text-[#6573a1] dark:text-slate-400 mt-1 truncate">
                    {item.latest_timestamp}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. Tabel Pemanfaatan Antrol FKTP */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-[#afbade]/30 dark:border-slate-800 shadow-lg relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#2b4390] dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#2b4390]" />
              Daftar Capaian Pemanfaatan Antrol per FKTP
            </h2>
            <p className="text-xs text-[#6573a1] dark:text-slate-400 mt-0.5">
              Menampilkan {sortedTableData.length} fasilitas kesehatan • Arahkan kursor pada angka persentase untuk rincian data floating
            </p>
          </div>

          {/* Search Box & Sort Toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari nama atau kode FKTP..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/40 dark:border-slate-700 text-[#2b4390] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#44853b]"
              />
              <svg
                className="w-4 h-4 text-[#6573a1] absolute left-3 top-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            <button
              onClick={() => setSortDesc(!sortDesc)}
              className="px-3 py-2 rounded-xl border border-[#afbade]/40 dark:border-slate-700 bg-white/80 dark:bg-slate-800 text-xs font-semibold text-[#2b4390] dark:text-slate-200 hover:bg-[#afbade]/20 flex items-center gap-1.5 transition-colors"
            >
              <span>Urutan Capaian</span>
              <span>{sortDesc ? '↓ Tertinggi' : '↑ Terendah'}</span>
            </button>
          </div>
        </div>

        {/* Table Viewport */}
        <div className="overflow-x-auto rounded-xl border border-[#afbade]/30 dark:border-slate-800 relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#afbade]/20 dark:bg-slate-800/60 text-[#2b4390] dark:text-slate-200 border-b border-[#afbade]/30 dark:border-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3 text-center w-12">No</th>
                <th className="py-3 px-4">Nama FKTP</th>
                <th className="py-3 px-4">Wilayah & Jenis FKTP</th>
                <th className="py-3 px-6 text-right">Persentase Capaian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#afbade]/20 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-[#6573a1] dark:text-slate-400">
                    <div className="inline-block w-6 h-6 border-2 border-[#44853b] border-t-transparent rounded-full animate-spin mb-2" />
                    <div>Memuat data live Google Spreadsheet FKTP...</div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-[#6573a1] dark:text-slate-400">
                    Tidak ada fasilitas kesehatan yang cocok dengan kriteria filter saat ini.
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, idx) => {
                  const absoluteNo = (currentPage - 1) * pageSize + idx + 1;
                  const isMet = row.persentase_capaian >= 80;

                  return (
                    <tr
                      key={row.kode_fktp}
                      className="hover:bg-[#d4ecd1]/20 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-3 text-center font-mono text-[#6573a1] dark:text-slate-400 font-bold">
                        {absoluteNo}
                      </td>

                      {/* Kolom Nama FKTP */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#2b4390] dark:text-white text-xs">
                          {row.nama_fktp}
                        </div>
                        <div className="text-[10px] font-mono text-[#6573a1] dark:text-slate-400 mt-0.5">
                          Kode FKTP: <span className="font-semibold text-[#2b4390] dark:text-emerald-300">{row.kode_fktp}</span>
                        </div>
                      </td>

                      {/* Kolom Wilayah & Jenis FKTP */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#afbade]/25 text-[#2b4390] dark:bg-blue-500/20 dark:text-blue-300 border border-[#afbade]/40">
                            {row.jenis_fktp}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {row.kabupaten}
                          </span>
                        </div>
                      </td>

                      {/* Kolom Persentase Capaian dengan Floating Tooltip saat di-hover */}
                      <td className="py-3 px-6 text-right">
                        <div
                          className="inline-block relative cursor-pointer"
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredRowData({
                              row,
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                            });
                          }}
                          onMouseLeave={() => setHoveredRowData(null)}
                        >
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-extrabold text-xs transition-all duration-200 border ${
                              isMet
                                ? 'bg-[#d4ecd1] text-[#44853b] border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 shadow-sm'
                                : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300'
                            } hover:scale-105 hover:shadow-md`}
                          >
                            <span>{row.persentase_capaian_str || formatPercentID(row.persentase_capaian)}</span>
                            <span className="text-[9px] opacity-75">{isMet ? '★' : '⚠️'}</span>
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {sortedTableData.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#afbade]/30 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 text-[#6573a1] dark:text-slate-400">
              <span>
                Menampilkan {Math.min((currentPage - 1) * pageSize + 1, sortedTableData.length)} –{' '}
                {Math.min(currentPage * pageSize, sortedTableData.length)} dari {sortedTableData.length} FKTP
              </span>
              <div className="flex items-center gap-1.5 ml-2">
                <span>Baris:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white/90 dark:bg-slate-800 border border-[#afbade]/40 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-xs text-[#2b4390] dark:text-white"
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-[#afbade]/40 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#2b4390] dark:text-slate-200 disabled:opacity-40 hover:bg-[#afbade]/20"
              >
                ← Sebelumnya
              </button>
              <span className="font-semibold text-[#2b4390] dark:text-white px-2">
                Halaman {currentPage} dari {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-[#afbade]/40 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#2b4390] dark:text-slate-200 disabled:opacity-40 hover:bg-[#afbade]/20"
              >
                Selanjutnya →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. FLOATING TOOLTIP PORTAL SAAT MOUSE DILETAKKAN DI ATAS ANGKA PERSENTASE CAPAIAN */}
      {hoveredRowData && (
        <div
          className="fixed pointer-events-none z-50 transition-all duration-150 animate-fadeIn"
          style={{
            left: `${hoveredRowData.x}px`,
            top: `${hoveredRowData.y - 12}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="w-72 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-[#83a67e]/60 dark:border-emerald-500/60 rounded-2xl p-4 shadow-2xl text-slate-800 dark:text-slate-100 relative">
            {/* Header Tooltip */}
            <div className="flex items-center justify-between border-b border-[#afbade]/30 dark:border-slate-800 pb-2 mb-2.5">
              <div className="text-[11px] font-bold text-[#2b4390] dark:text-white truncate max-w-[160px]">
                {hoveredRowData.row.nama_fktp}
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2b4390] text-white">
                {hoveredRowData.row.sumber_antrean}
              </span>
            </div>

            {/* 5 Variabel Floating Resmi sesuai instruksi user:
                1. sumber_antrean_cf
                2. sumber_antrean_total_transaksi
                3. total_transaksi
                4. persentase_capaian
                5. sumber_antrean */}
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400 font-sans">sumber_antrean_cf:</span>
                <span className="font-bold text-[#44853b] dark:text-emerald-400">
                  {formatNumberID(hoveredRowData.row.sumber_antrean_cf)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400 font-sans">sumber_antrean_total_transaksi:</span>
                <span className="font-bold text-[#2b4390] dark:text-blue-300">
                  {formatNumberID(hoveredRowData.row.sumber_antrean_total_transaksi)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400 font-sans">total_transaksi:</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {formatNumberID(hoveredRowData.row.total_transaksi)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[#afbade]/20 dark:border-slate-800">
                <span className="text-[11px] font-bold text-[#2b4390] dark:text-slate-200 font-sans">persentase_capaian:</span>
                <span className="font-extrabold text-[#44853b] dark:text-emerald-300 text-sm">
                  {hoveredRowData.row.persentase_capaian_str || formatPercentID(hoveredRowData.row.persentase_capaian)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400 font-sans">sumber_antrean:</span>
                <span className="font-semibold text-[#2b4390] dark:text-cyan-400">
                  {hoveredRowData.row.sumber_antrean}
                </span>
              </div>
            </div>

            {/* Bottom Tail Arrow pointing down */}
            <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-4 h-4 bg-white dark:bg-slate-900 border-r border-b border-[#83a67e]/60 dark:border-emerald-500/60 rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
};
