import { Typography } from '@mui/material';
import MainCard from '../berry/MainCard';
import { KerangkaMemuat } from './ui/KerangkaMemuat';
import { Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import '../berry/berry-dashboards.css';
import { FilterSelect, FilterOption } from './ui/FilterSelect';
import { AnimatedButton } from './ui/AnimatedButton';
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
    if (val === null || val === undefined || isNaN(val)) return '-';
    return `${val.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  };

  const formatNumberID = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '-';
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
  const lastUpdateText = data?.last_update || liveSyncAntrol || 'Belum tersedia';

  if (!data) {
    if (isLoading) return <KerangkaMemuat label="Memuat data antrean online FKTP" varian="halaman" />;
    return <section className="sapa-page p-4 sm:p-6" aria-busy={isLoading} aria-live="polite"><MainCard content={false} className="berry-dashboard-card p-5 sm:p-6"><p className="sapa-eyebrow">Antrean online FKTP</p><Typography component="h1" variant="h3" className="sapa-title mt-2">{isLoading ? 'Memuat data FKTP' : 'Data belum tersedia'}</Typography><p className="text-sm text-[var(--text-muted)] mt-2">{isLoading ? 'Mengambil data antrean sesuai filter.' : 'Sumber data belum dapat dihubungi.'}</p>{!isLoading && <button type="button" onClick={() => refetch()} className="sapa-button sapa-button-primary mt-4">Coba lagi</button>}</MainCard></section>;
  }

  return (
    <div className="berry-dashboard sapa-page min-w-0 w-full p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto min-h-screen text-slate-800">
      {/* 1. Header & Live Timestamp Banner */}
      <div className="berry-dashboard-heading min-w-0">


        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--bpjs-green)] bg-[var(--surface-accent)]/60 px-2.5 py-0.5 rounded-full border border-[var(--border-color)]">
                Layanan Primer
              </span>
              <span className="text-xs text-[var(--text-muted)] font-medium">
                • Fasilitas Kesehatan Tingkat Pertama (FKTP)
              </span>
            </div>
            <Typography component="h1" variant="h3" className="sapa-title text-xl sm:text-2xl font-semibold text-[var(--text-main)] tracking-tight">
              Pemanfaatan Antrean Online FKTP
            </Typography>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
              Pemantauan Rasio Realisasi Pendaftaran Antrean Online (Mobile JKN & Bridging Sistem) KC Jember, Lumajang, dan Bondowoso
            </p>
          </div>

          {/* Last Update & Sync Button Card */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-[var(--surface)] border border-[var(--border-color)] px-4 py-2.5 rounded-xl">
              <div className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                Status Pembaruan Data
              </div>
              <div className="text-xs font-mono font-bold text-[var(--text-main)] flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-[var(--bpjs-green)]" />
                <span>Last Update : {lastUpdateText}</span>
              </div>
            </div>

            <AnimatedButton
              onClick={handleForceSync}
              aria-label={isSyncing ? 'Menyinkronkan data' : 'Sinkronkan data terbaru'}
              aria-busy={isSyncing}
              disabled={isSyncing}
              title="Sinkronisasikan data terbaru langsung dari Google Spreadsheet"
              className="px-3.5 py-2.5 rounded-xl sapa-button sapa-button-primary text-[var(--text-main)] text-xs font-bold flex items-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
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
            </AnimatedButton>
          </div>
        </div>

        {syncSuccessMsg && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{syncSuccessMsg}</span>
          </div>
        )}
      </div>

      <p className="sapa-filter-summary sapa-status text-xs text-[var(--text-muted)]" aria-live="polite"><span>Filter aktif: {Object.entries(filters).filter(([, value]) => value && value !== '(All)').map(([key, value]) => `${({ bulan: 'Periode', kabupaten: 'Wilayah', jenis_fktp: 'Jenis FKTP', sumber_antrean: 'Kanal' } as Record<string, string>)[key]}: ${value}`).join(' · ') || 'Semua data'}</span>
        {searchQuery && <span>Pencarian: {searchQuery}</span>}
        <button type="button" className="sapa-button sapa-button-secondary" onClick={() => {
          setFilters({ bulan: 'September 2026', kabupaten: '(All)', jenis_fktp: '(All)', sumber_antrean: 'Mobile JKN' });
          setSearchQuery('');
          setCurrentPage(1);
        }}>Reset filter</button></p>
      {/* 2. Filter Bar 4-Dimensi */}
      <MainCard content={false} className="min-w-0 berry-dashboard-card p-4 sm:p-5 rounded-lg border border-[var(--border-color)] min-w-0">
        <div className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--bpjs-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filter Parameter Pemanfaatan Antrol FKTP
        </div>

        <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Filter 1: Bulan */}
          <div>
            <label htmlFor="FktpAntrolDashboard-filter-1" className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Bulan (Snapshot Timestamp)
            </label>
            <FilterSelect aria-label="Bulan" id="FktpAntrolDashboard-filter-1"
              value={filters.bulan || '(All)'}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, bulan: e.target.value }));
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-[var(--surface)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--bpjs-green)]"
            >
              {(data?.filter_options?.bulan ?? ['(All)', 'September 2026']).map((b) => (
                <FilterOption key={b} value={b}>
                  {b}
                </FilterOption>
              ))}
            </FilterSelect>
          </div>

          {/* Filter 2: Kabupaten */}
          <div>
            <label htmlFor="FktpAntrolDashboard-filter-2" className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Kabupaten / Wilayah
            </label>
            <FilterSelect aria-label="Kabupaten" id="FktpAntrolDashboard-filter-2"
              value={filters.kabupaten || '(All)'}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, kabupaten: e.target.value }));
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-[var(--surface)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--bpjs-green)]"
            >
              {(data?.filter_options?.kabupaten ?? ['(All)', 'KAB. JEMBER', 'KAB. LUMAJANG', 'KAB. BONDOWOSO']).map((k) => (
                <FilterOption key={k} value={k}>
                  {k}
                </FilterOption>
              ))}
            </FilterSelect>
          </div>

          {/* Filter 3: Jenis FKTP */}
          <div>
            <label htmlFor="FktpAntrolDashboard-filter-3" className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Jenis FKTP
            </label>
            <FilterSelect aria-label="Jenis fasilitas kesehatan tingkat pertama" id="FktpAntrolDashboard-filter-3"
              value={filters.jenis_fktp || '(All)'}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, jenis_fktp: e.target.value }));
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-[var(--surface)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--bpjs-green)]"
            >
              {(data?.filter_options?.jenis_fktp ?? ['(All)', 'PUSKESMAS', 'KLINIK PRATAMA', 'DOKTER KELUARGA']).map((j) => (
                <FilterOption key={j} value={j}>
                  {j}
                </FilterOption>
              ))}
            </FilterSelect>
          </div>

          {/* Filter 4: Sumber Antrean */}
          <div>
            <label htmlFor="FktpAntrolDashboard-filter-4" className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Sumber Antrean
            </label>
            <FilterSelect aria-label="Sumber antrean" id="FktpAntrolDashboard-filter-4"
              value={filters.sumber_antrean || 'Mobile JKN'}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, sumber_antrean: e.target.value }));
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-[var(--surface)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--bpjs-green)]"
            >
              {(data?.filter_options?.sumber_antrean ?? ['Mobile JKN', 'All Sumber', '(All)']).map((s) => (
                <FilterOption key={s} value={s}>
                  {s}
                </FilterOption>
              ))}
            </FilterSelect>
          </div>
        </div>
      </MainCard>

      {/* 3. 4 Kartu KPI Eksekutif */}
      <div className="sapa-kpi-grid grid min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Capaian Pemanfaatan Antrol */}
        <MainCard content={false} className="sapa-kpi-lead min-w-0 berry-dashboard-card p-5 rounded-lg border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="absolute -right-3 -top-3 w-16 h-16 bg-[var(--bpjs-green)]/10 rounded-full pointer-events-none" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--text-muted)] text-xs font-bold uppercase tracking-wider">
            <span>Rata-Rata Capaian Antrol</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[var(--surface-accent)] text-[var(--bpjs-green)] border border-[var(--border-color)]">
              {filters.sumber_antrean === 'All Sumber' ? 'Target ≥95%' : 'Target ≥80%'}
            </span>
          </div>
          <div className="text-3xl font-semibold text-[var(--text-main)] font-mono mt-2 tracking-tight">
            {formatPercentID(data?.kpi?.avg_capaian)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--bpjs-green)]" />
            <span>Kanal: <strong className="text-[var(--text-main)]">{filters.sumber_antrean || 'Mobile JKN'}</strong></span>
          </div>
        </MainCard>

        {/* KPI 2: Total Antrean Online (CF) */}
        <MainCard content={false} className="min-w-0 berry-dashboard-card p-5 rounded-lg border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--text-muted)] text-xs font-bold uppercase tracking-wider">
            <span>Total Antrean CF</span>
            <svg className="w-4 h-4 text-[var(--text-main)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="text-3xl font-semibold text-[var(--text-main)] font-mono mt-2 tracking-tight">
            {formatNumberID(data?.kpi?.total_cf)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            Transaksi terbit dari kanal antrol
          </div>
        </MainCard>

        {/* KPI 3: Total Transaksi Seluruh Sumber */}
        <MainCard content={false} className="min-w-0 berry-dashboard-card p-5 rounded-lg border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--text-muted)] text-xs font-bold uppercase tracking-wider">
            <span>Total Transaksi Kanal</span>
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="text-3xl font-semibold text-[var(--text-main)] font-mono mt-2 tracking-tight">
            {formatNumberID(data?.kpi?.total_transaksi_sumber)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            Penyebut (Denominator) pemanfaatan
          </div>
        </MainCard>

        {/* KPI 4: Total FKTP Aktif */}
        <MainCard content={false} className="min-w-0 berry-dashboard-card p-5 rounded-lg border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--text-muted)] text-xs font-bold uppercase tracking-wider">
            <span>FKTP Terdata</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[var(--border-color)]/30 text-[var(--text-main)]">
              Primer
            </span>
          </div>
          <div className="text-3xl font-semibold text-[var(--bpjs-green)] font-mono mt-2 tracking-tight">
            {formatNumberID(data?.kpi?.total_fktp)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            Fasilitas kesehatan tersaring aktif
          </div>
        </MainCard>
      </div>

      {/* 4. Grafik Bulanan Tren Capaian (SVG Line Chart with Zero Layout Shift Container) */}
      <MainCard content={false} className="min-w-0 berry-dashboard-card p-5 sm:p-6 rounded-lg border border-[var(--border-color)] min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <Typography component="h2" variant="h4" className="sapa-section-heading text-base sm:text-lg font-bold text-[var(--text-main)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--bpjs-green)]" />
              Tren Pemanfaatan Antrol FKTP Bulanan (Januari - September 2026)
            </Typography>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Rata-rata persentase realisasi penutupan bulan berdasarkan stempel waktu snapshot resmi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-[var(--text-main)]">
              <span className="w-3 h-0.5 bg-[var(--bpjs-green)] inline-block" />
              Realisasi Antrol FKTP
            </span>
            <span className="flex items-center gap-1.5 font-medium text-[var(--info)]">
              <span className="w-3 h-0.5 bg-sky-500 border-b border-dashed inline-block" />
              Target 80% (MJKN)
            </span>
            <span className="flex items-center gap-1.5 font-medium text-[var(--warning-text)]">
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
              <div className="w-full p-2.5 sm:p-3 rounded-xl bg-[var(--surface)] border border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      met
                        ? 'bg-[var(--surface-accent)] text-[var(--bpjs-green)] border border-[var(--border-color)]/40  '
                        : 'bg-[var(--border-color)]/30 text-[var(--bpjs-navy)] border border-[var(--border-color)]/50  '
                    }`}
                  >
                    {activeItem.month}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-2">
                      <span>{activeItem.month_full || activeItem.month}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          met
                            ? 'bg-[var(--surface-accent)] text-[var(--bpjs-green)] border border-[var(--border-color)]/40  '
                            : 'bg-amber-100 text-amber-800 border border-amber-300  '
                        }`}
                      >
                        {met ? ` Memenuhi Target (≥${targetThreshold}%)` : ` Di Bawah Target (<${targetThreshold}%)`}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-1.5 mt-0.5 font-mono">
                      <span>Snapshot: <strong className="text-[var(--bpjs-green)]">{activeItem.latest_timestamp}</strong></span>
                      <span className="text-[var(--text-muted)]">•</span>
                      <span>CF: <strong>{formatNumberID(activeItem.total_cf)}</strong> / Transaksi: <strong>{formatNumberID(activeItem.total_transaksi_sumber)}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="text-right sm:border-l sm:border-[var(--border-color)] sm:pl-4 shrink-0">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
                    Capaian FKTP
                  </div>
                  <div className={`text-base font-extrabold font-mono ${met ? 'text-[var(--bpjs-green)] ' : 'text-[var(--bpjs-navy)] '}`}>
                    {formatPercentID(activeItem.avg_capaian)}
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="w-full p-2.5 sm:p-3 rounded-xl bg-[var(--border-color)]/10 border border-dashed border-[var(--border-color)] flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--surface)] text-[var(--text-main)] border border-[var(--border-color)] shrink-0">
                  <svg className="w-4 h-4 text-[var(--bpjs-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-[var(--text-main)]">Eksplorasi Snapshot Bulanan FKTP</span>
                  <span className="hidden sm:inline text-[11px] text-[var(--text-muted)] ml-1.5">
                    - Arahkan kursor pada kurva grafik atau kartu bulan di bawah untuk mengunci data.
                  </span>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--border-color)] text-[var(--bpjs-green)] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--bpjs-green)]" />
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
            <div aria-label="Area data yang dapat digulir" role="region" tabIndex={0} className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
              <div className="min-w-[700px]">
                <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full h-auto overflow-visible select-none">
                  <defs>
                    <linearGradient id="fktpAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--bpjs-green)" stopOpacity="0.35" />
                      <stop offset="50%" stopColor="var(--bpjs-navy)" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="var(--bpjs-navy)" stopOpacity="0.0" />
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
                          className="text-[var(--border-color)]/30"
                        />
                        <text
                          x={padL - 8}
                          y={y + 3}
                          textAnchor="end"
                          className="text-[10px] font-mono font-medium fill-[var(--text-muted)]"
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
                    stroke="var(--info)"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    className="opacity-75"
                  />
                  <text x={padL + 6} y={y80 - 4} className="text-[9.5px] font-bold fill-sky-600">
                    Target Mobile JKN (80%)
                  </text>

                  {/* Target 95% line */}
                  <line
                    x1={padL}
                    y1={y95}
                    x2={padL + chartW}
                    y2={y95}
                    stroke="var(--warning)"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    className="opacity-75"
                  />
                  <text x={padL + chartW - 6} y={y95 - 4} textAnchor="end" className="text-[9.5px] font-bold fill-amber-600">
                    Target All Sumber (95%)
                  </text>

                  {/* Filled Area */}
                  {areaD && <path d={areaD} fill="url(#fktpAreaGrad)" />}

                  {/* Stroke Path */}
                  {pathD && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="var(--bpjs-green)"
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
                            stroke="var(--bpjs-green)"
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
                          fill="var(--surface)"
                          stroke={isTargetMet ? 'var(--bpjs-green)' : 'var(--bpjs-navy)'}
                          strokeWidth={isHovered ? 3 : 2}
                          className="cursor-pointer transition-all duration-200"
                        />

                        {/* Inner Dot */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 4 : 2.5}
                          fill={isTargetMet ? 'var(--bpjs-green)' : 'var(--bpjs-navy)'}
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
                            fill={isHovered ? 'var(--bpjs-navy)' : isTargetMet ? 'var(--bpjs-green)' : 'var(--text-muted)'}
                            stroke="var(--surface)"
                            strokeWidth="1"
                            className="transition-colors"
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
                              ? 'fill-[var(--bpjs-green)]  font-extrabold'
                              : 'fill-[var(--bpjs-navy)] '
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
        <div className="mt-5 pt-4 border-t border-[var(--border-color)]">
          <div className="text-[11px] font-bold text-[var(--text-main)] uppercase tracking-wider mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[var(--bpjs-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Snapshot Timestamp Resmi per Bulan
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-normal">
              Arahkan mouse untuk menyorot kurva
            </span>
          </div>

          <div className="grid min-w-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
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
                      ? 'border-[var(--bpjs-green)] bg-emerald-50/90  shadow-md scale-[1.03]'
                      : 'border-[var(--border-color)]/30  bg-[var(--surface)]  hover:border-[var(--border-color)]/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-main)]">{item.month}</span>
                    <span className={`text-[10px] font-mono font-bold ${met ? 'text-[var(--bpjs-green)] ' : 'text-[var(--text-muted)] '}`}>
                      {formatPercentID(item.avg_capaian)}
                    </span>
                  </div>
                  <div className="text-[9.5px] font-mono text-[var(--text-muted)] mt-1">
                    {item.latest_timestamp}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </MainCard>

      {/* 5. Tabel Pemanfaatan Antrol FKTP */}
      <MainCard content={false} className="min-w-0 berry-dashboard-card p-5 sm:p-6 rounded-lg border border-[var(--border-color)] relative min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <Typography component="h2" variant="h4" className="sapa-section-heading text-base sm:text-lg font-bold text-[var(--text-main)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--bpjs-navy)]" />
              Daftar Capaian Pemanfaatan Antrol per FKTP
            </Typography>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Menampilkan {sortedTableData.length} fasilitas kesehatan • Arahkan kursor pada angka persentase untuk rincian data floating
            </p>
          </div>

          {/* Search Box & Sort Toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px]">
              <input aria-label="Cari nama atau kode FKTP..."
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari nama atau kode FKTP..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--bpjs-green)]"
              />
              <svg
                className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5"
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

            <AnimatedButton
              onClick={() => setSortDesc(!sortDesc)}
              className="px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--border-color)]/20 flex items-center gap-1.5 transition-colors"
            >
              <span>Urutan Capaian</span>
              <span>{sortDesc ? '↓ Tertinggi' : '↑ Terendah'}</span>
            </AnimatedButton>
          </div>
        </div>

        {/* Table Viewport */}
        <div aria-label="Area data yang dapat digulir" role="region" tabIndex={0} className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--border-color)] relative">
          <Table size="small" className="sapa-data-table sapa-table w-full min-w-[760px] text-left text-xs border-collapse">
            <TableHead>
              <TableRow className="bg-[var(--border-color)]/20 text-[var(--text-main)] border-b border-[var(--border-color)] font-bold uppercase tracking-wider text-[11px]">
                <TableCell className="py-3 px-3 text-center w-12">No</TableCell>
                <TableCell className="py-3 px-4">Nama FKTP</TableCell>
                <TableCell className="py-3 px-4">Wilayah & Jenis FKTP</TableCell>
                <TableCell className="py-3 px-6 text-right">Persentase Capaian</TableCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-[var(--border-color)]/20">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-[var(--text-muted)]">
                    <div className="inline-block w-6 h-6 border-2 border-[var(--border-color)] border-t-transparent rounded-full animate-spin mb-2" />
                    <div>Memuat data live Google Spreadsheet FKTP...</div>
                  </TableCell>
                </TableRow>
              ) : paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-[var(--text-muted)]">
                    Tidak ada fasilitas kesehatan yang cocok dengan kriteria filter saat ini.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((row, idx) => {
                  const absoluteNo = (currentPage - 1) * pageSize + idx + 1;
                  const isMet = row.persentase_capaian >= 80;

                  return (
                    <TableRow
                      key={row.kode_fktp}
                      className="hover:bg-[var(--surface-accent)]/20 transition-colors"
                    >
                      <TableCell className="py-3 px-3 text-center font-mono text-[var(--text-muted)] font-bold">
                        {absoluteNo}
                      </TableCell>

                      {/* Kolom Nama FKTP */}
                      <TableCell className="py-3 px-4">
                        <div className="font-bold text-[var(--text-main)] text-xs">
                          {row.nama_fktp}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                          Kode FKTP: <span className="font-semibold text-[var(--text-main)]">{row.kode_fktp}</span>
                        </div>
                      </TableCell>

                      {/* Kolom Wilayah & Jenis FKTP */}
                      <TableCell className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[var(--border-color)]/25 text-[var(--text-main)] border border-[var(--border-color)]">
                            {row.jenis_fktp}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[var(--surface-subtle)] text-[var(--text-main)]">
                            {row.kabupaten}
                          </span>
                        </div>
                      </TableCell>

                      {/* Kolom Persentase Capaian dengan Floating Tooltip saat di-hover */}
                      <TableCell className="py-3 px-6 text-right">
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
                                ? 'bg-[var(--surface-accent)] text-[var(--bpjs-green)] border-[var(--border-color)]/40   shadow-sm'
                                : 'bg-amber-100 text-amber-800 border-amber-300  '
                            } hover:scale-105 hover:shadow-md`}
                          >
                            <span>{row.persentase_capaian_str || formatPercentID(row.persentase_capaian)}</span>
                            <span className="text-[9px] opacity-75">{isMet ? '' : ''}</span>
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        {sortedTableData.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[var(--border-color)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 text-[var(--text-muted)]">
              <span>
                Menampilkan {Math.min((currentPage - 1) * pageSize + 1, sortedTableData.length)} -{' '}
                {Math.min(currentPage * pageSize, sortedTableData.length)} dari {sortedTableData.length} FKTP
              </span>
              <div className="flex items-center gap-1.5 ml-2">
                <span>Baris:</span>
                <FilterSelect aria-label="Jumlah baris per halaman"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-[var(--surface)] border border-[var(--border-color)] rounded-md px-1.5 py-0.5 text-xs text-[var(--text-main)]"
                >
                  <FilterOption value={15}>15</FilterOption>
                  <FilterOption value={30}>30</FilterOption>
                  <FilterOption value={50}>50</FilterOption>
                </FilterSelect>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <AnimatedButton
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-main)] disabled:opacity-40 hover:bg-[var(--border-color)]/20"
              >
                ← Sebelumnya
              </AnimatedButton>
              <span className="font-semibold text-[var(--text-main)] px-2">
                Halaman {currentPage} dari {totalPages}
              </span>
              <AnimatedButton
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-main)] disabled:opacity-40 hover:bg-[var(--border-color)]/20"
              >
                Selanjutnya →
              </AnimatedButton>
            </div>
          </div>
        )}
      </MainCard>

      {/* 6. FLOATING TOOLTIP PORTAL SAAT MOUSE DILETAKKAN DI ATAS ANGKA PERSENTASE CAPAIAN */}
      {hoveredRowData && (
        <div
          className="fixed pointer-events-none z-50 transition-all duration-150"
          style={{
            left: `${hoveredRowData.x}px`,
            top: `${hoveredRowData.y - 12}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="w-72 bg-[var(--surface)] border border-[var(--border-color)] rounded-lg p-4 text-slate-800 relative">
            {/* Header Tooltip */}
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2 mb-2.5">
              <div className="text-[11px] font-bold text-[var(--text-main)] truncate max-w-[160px]">
                {hoveredRowData.row.nama_fktp}
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bpjs-navy)] text-[var(--on-primary)]">
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
                <span className="text-[11px] text-[var(--text-muted)] font-sans">sumber_antrean_cf:</span>
                <span className="font-bold text-[var(--bpjs-green)]">
                  {formatNumberID(hoveredRowData.row.sumber_antrean_cf)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)] font-sans">sumber_antrean_total_transaksi:</span>
                <span className="font-bold text-[var(--text-main)]">
                  {formatNumberID(hoveredRowData.row.sumber_antrean_total_transaksi)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)] font-sans">total_transaksi:</span>
                <span className="font-bold text-[var(--text-main)]">
                  {formatNumberID(hoveredRowData.row.total_transaksi)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)]">
                <span className="text-[11px] font-bold text-[var(--text-main)] font-sans">persentase_capaian:</span>
                <span className="font-extrabold text-[var(--bpjs-green)] text-sm">
                  {hoveredRowData.row.persentase_capaian_str || formatPercentID(hoveredRowData.row.persentase_capaian)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)] font-sans">sumber_antrean:</span>
                <span className="font-semibold text-[var(--text-main)]">
                  {hoveredRowData.row.sumber_antrean}
                </span>
              </div>
            </div>

            {/* Bottom Tail Arrow pointing down */}
            <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-4 h-4 bg-[var(--surface)] border-r border-b border-[var(--border-color)] rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
};
