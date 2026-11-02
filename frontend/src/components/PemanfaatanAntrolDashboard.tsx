import { Typography } from '@mui/material';
import MainCard from '../berry/MainCard';
import { Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import '../berry/berry-dashboards.css';
import { FilterSelect, FilterOption } from './ui/FilterSelect';
import { AnimatedButton } from './ui/AnimatedButton';
import React, { useEffect, useState } from 'react';
import { useFkrtlAntrolData } from '../hooks/useDashboardData';
import type { FkrtlFilterParams } from '../hooks/useDashboardData';
import { apiClient } from '../lib/apiClient';
import { exportToCSV, exportToExcel, exportToJPEG, POLI_EXPORT_COLUMNS } from '../utils/exportUtils';
import { useSyncStore } from '../store/syncStore';


export const PemanfaatanAntrolDashboard: React.FC = () => {
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
      const params = new URLSearchParams();
      params.append('type', type);
      if (filters.kabupaten && filters.kabupaten !== '(All)') params.append('kabupaten', filters.kabupaten);
      if (filters.nama_rs && filters.nama_rs !== '(All)') params.append('nama_rs', filters.nama_rs);
      if (filters.bulan && filters.bulan !== '(All)') params.append('bulan', filters.bulan);
      if (filters.tahun && filters.tahun !== '(All)') params.append('tahun', filters.tahun);
      if (filters.sumber) params.append('sumber', filters.sumber);
      if (filters.kelas_rs && filters.kelas_rs !== '(All)') params.append('kelas_rs', filters.kelas_rs);

      // Use the shared client so export follows the same session and refresh flow as dashboard data.
      const res = await apiClient.get(`/api/v1/fkrtl-export?${params.toString()}`);
      const exportData = res.data.data || [];
      if (exportData.length === 0) {
        alert(res.data.message || 'Tidak ada data untuk filter yang dipilih.');
        setDownloadingType(null);
        return;
      }

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
  const liveSyncAntrol = useSyncStore((s) => s.lastUpdateAntrol);

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
    if (num === undefined || isNaN(num)) return '-';
    return num.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  };

  if (isLoading && !data) {
    return (
      <div className="p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-[var(--text-muted)]">Memuat Live Data Google Spreadsheet FKRTL...</p>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="p-6 lg:p-8">
        <div className="bg-rose-500/10 border border-rose-500/30 p-6 rounded-lg text-center max-w-xl mx-auto">
          <svg className="w-10 h-10 text-rose-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <Typography component="h3" variant="h5" className="text-lg font-bold text-[var(--text-main)]">Gagal Mengambil Data Google Sheets</Typography>
          <p className="text-xs text-[var(--text-muted)] mt-2">{(error as any)?.response?.data?.detail || error?.message || 'Terjadi kesalahan sistem.'}</p>
          <AnimatedButton
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-[var(--text-main)] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Coba Muat Ulang
          </AnimatedButton>
        </div>
      </div>
    );
  }

  if (data?.status === 'unavailable') {
    return (
      <section className="sapa-page p-4 sm:p-6" aria-labelledby="antrol-unavailable-title">
        <MainCard content={false} className="berry-dashboard-card p-5 sm:p-6" role="alert">
          <p className="sapa-eyebrow">Antrean online FKRTL</p>
          <Typography component="h1" variant="h3" id="antrol-unavailable-title" className="sapa-title mt-2">Data belum tersedia</Typography>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Sumber data tidak dapat dihubungi. Capaian terkini belum dapat ditampilkan.</p>
          <AnimatedButton onClick={() => refetch()} disabled={isLoading} className="sapa-button sapa-button-primary mt-4">{isLoading ? 'Memuat...' : 'Coba lagi'}</AnimatedButton>
        </MainCard>
      </section>
    );
  }

  const isNoData =
    !data ||
    ((data.trend_per_bulan?.length ?? 0) === 0 &&
      (data.top_faskes?.length ?? 0) === 0 &&
      (data.top_poli?.length ?? 0) === 0);

  const filterOptions = {
    kabupaten: data?.filter_options?.kabupaten || ['(All)', 'Bondowoso', 'Jember', 'Lumajang'],
    nama_rs: data?.filter_options?.nama_rs || ['(All)'],
    bulan: data?.filter_options?.bulan || ['(All)', 'September 2026', 'Agustus 2026'],
    tahun: data?.filter_options?.tahun || ['(All)', '2026'],
    sumber: data?.filter_options?.sumber || ['All Sumber', 'Mobile JKN'],
  };

  const lastUpdate = data?.last_update || liveSyncAntrol || 'Belum tersedia';
  const selectedPeriod = data?.selected_period || (filters.bulan !== '(All)' ? filters.bulan : (filters.tahun !== '(All)' ? `Tahun ${filters.tahun} (Semua Bulan)` : 'Tahun 2026 (Semua Bulan)'));
  const kpiValue = data?.kpi_capaian ?? 0.0;

  return (
    <div className="berry-dashboard sapa-page min-w-0 w-full p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      <p className="sapa-filter-summary sapa-status text-xs text-[var(--text-muted)]" aria-live="polite"><span>Filter aktif: {Object.entries(filters).filter(([, value]) => value && value !== '(All)' && value !== 'All Sumber').map(([key, value]) => `${({ kabupaten: 'Wilayah', nama_rs: 'Faskes', bulan: 'Bulan', tahun: 'Tahun', sumber: 'Kanal', kelas_rs: 'Kelas RS' } as Record<string, string>)[key]}: ${value}`).join(' · ') || 'Semua data'}</span><AnimatedButton className="sapa-button sapa-button-secondary" onClick={handleResetFilter}>Reset filter</AnimatedButton></p>
      {/* 1. KOTAK KETERANGAN: "Last Update : ...." & Header Utama */}
      <div className="berry-dashboard-heading min-w-0">
        <div>
          <div className="flex items-center gap-3">

            <div>
              <Typography component="h1" variant="h3" className="sapa-title text-xl sm:text-2xl font-extrabold text-[var(--text-main)] tracking-tight">
                Pemanfaatan Antrol FKRTL
              </Typography>
              {/* Kotak Keterangan Last Update sesuai instruksi spesifik pengguna */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex max-w-full flex-wrap items-center gap-2 px-3 py-1 rounded-lg bg-[var(--surface-accent)] border border-[var(--border-color)] text-[var(--bpjs-green)] font-bold text-xs sm:text-sm tracking-wide">
                  <span className="w-2 h-2 rounded-full bg-[var(--bpjs-green)]" />
                  <span>Last Update : {lastUpdate}</span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
                  (Live Data Google Sheets)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button: Download RS & Poli */}
        <div className="flex w-full flex-wrap gap-2 xl:w-auto xl:shrink-0">
          {/* Download Faskes */}
          <div className="relative">
            <AnimatedButton
              onClick={() => setOpenDropdown(openDropdown === 'faskes' ? null : 'faskes')}
              disabled={downloadingType === 'faskes'}
              className="sapa-button sapa-button-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--text-main)] border border-[var(--border-color)] transition-all active:scale-95 cursor-pointer"
            >
              <span>{downloadingType === 'faskes' ? 'Mengunduh...' : ' Unduh Data RS'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </AnimatedButton>
            {openDropdown === 'faskes' && (
              <div className="absolute right-0 mt-2 w-56 berry-dashboard-card border border-[var(--border-color)] rounded-xl z-50 overflow-hidden min-w-0">
                <AnimatedButton onClick={() => handleDownload('faskes', 'xlsx')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[var(--surface-accent)]/40 text-left text-xs font-semibold text-[var(--text-main)] transition-colors border-b border-[var(--border-color)] cursor-pointer">
                  Format Excel (.xlsx)
                </AnimatedButton>
                <AnimatedButton onClick={() => handleDownload('faskes', 'jpeg')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[var(--surface-accent)]/40 text-left text-xs font-semibold text-[var(--text-main)] transition-colors border-b border-[var(--border-color)] cursor-pointer">
                  Format Gambar (.JPEG)
                </AnimatedButton>
                <AnimatedButton onClick={() => handleDownload('faskes', 'csv')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[var(--surface-accent)]/40 text-left text-xs font-semibold text-[var(--text-main)] transition-colors cursor-pointer">
                  Format CSV (.csv)
                </AnimatedButton>
              </div>
            )}
          </div>

          {/* Download Poli */}
          <div className="relative">
            <AnimatedButton
              onClick={() => setOpenDropdown(openDropdown === 'poli' ? null : 'poli')}
              disabled={downloadingType === 'poli'}
              className="sapa-button sapa-button-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--text-main)] border border-[var(--border-color)] transition-all active:scale-95 cursor-pointer"
            >
              <span>{downloadingType === 'poli' ? 'Mengunduh...' : ' Unduh Data Poli'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </AnimatedButton>
            {openDropdown === 'poli' && (
              <div className="absolute right-0 mt-2 w-56 berry-dashboard-card border border-[var(--border-color)] rounded-xl z-50 overflow-hidden min-w-0">
                <AnimatedButton onClick={() => handleDownload('poli', 'xlsx')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[var(--surface-accent)]/40 text-left text-xs font-semibold text-[var(--text-main)] transition-colors border-b border-[var(--border-color)] cursor-pointer">
                  Format Excel (.xlsx)
                </AnimatedButton>
                <AnimatedButton onClick={() => handleDownload('poli', 'jpeg')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[var(--surface-accent)]/40 text-left text-xs font-semibold text-[var(--text-main)] transition-colors border-b border-[var(--border-color)] cursor-pointer">
                  Format Gambar (.JPEG)
                </AnimatedButton>
                <AnimatedButton onClick={() => handleDownload('poli', 'csv')} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[var(--surface-accent)]/40 text-left text-xs font-semibold text-[var(--text-main)] transition-colors cursor-pointer">
                  Format CSV (.csv)
                </AnimatedButton>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. MAIN LAYOUT: Panel Filter Kiri + Area Visualisasi Kanan */}
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Kolom Kiri: KPI Card & Kontrol Filtering (Col span 3.5 / 12) */}
        <div className="min-w-0 lg:col-span-4 xl:col-span-3 space-y-5">
          {/* KPI Pemanfaatan Antrol Card */}
          <MainCard content={false} className="min-w-0 berry-dashboard-card rounded-lg overflow-hidden border border-[var(--border-color)] min-w-0">
            <div className="bg-[var(--bpjs-navy)] px-4 py-3.5 text-center border-b border-[var(--border-color)]">
              <Typography component="h3" variant="h5" className="text-base font-bold text-[var(--on-primary)] tracking-wide flex items-center justify-center gap-2">
                <svg className="w-5 h-5 text-[var(--on-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Pemanfaatan Antrol
              </Typography>
              <p className="text-xs font-medium text-[var(--on-primary)] mt-0.5">
                {filters.bulan === '(All)' ? `Akumulasi ${selectedPeriod}` : `Periode ${selectedPeriod}`}
              </p>
            </div>
            <div className="bg-[var(--surface-subtle)] py-6 text-center">
              <span className="sapa-lead-value text-4xl font-extrabold text-[var(--text-main)] tracking-tight drop-">
                {formatPercentID(kpiValue)}
              </span>
              <div className="mt-2.5 flex items-center justify-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[var(--surface-accent)] text-[var(--bpjs-green)] border border-[var(--border-color)]">
                  Target BPJS: &ge;85%
                </span>
              </div>
            </div>
          </MainCard>

          {/* Panel Kontrol Filter (Urutan: Kabupaten, Nama Faskes, Bulan, Tahun, Sumber) */}
          <MainCard content={false} className="min-w-0 berry-dashboard-card rounded-lg p-5 space-y-4 border border-[var(--border-color)] min-w-0">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2.5">
              <span className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-4 h-4 text-[var(--bpjs-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filter Analitik
              </span>
              <AnimatedButton
                onClick={handleResetFilter}
                className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--bpjs-green)] transition-colors cursor-pointer"
              >
                Reset
              </AnimatedButton>
            </div>

            {/* Filter 1: Kabupaten */}
            <div>
              <label htmlFor="PemanfaatanAntrolDashboard-filter-1" className="block text-xs font-bold text-[var(--text-main)] mb-1">1. Kabupaten</label>
              <FilterSelect aria-label="Kabupaten" id="PemanfaatanAntrolDashboard-filter-1"
                value={filters.kabupaten || '(All)'}
                onChange={(e) => handleFilterChange('kabupaten', e.target.value)}
                className="sapa-control min-w-0 w-full rounded-xl px-3.5 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] transition-colors cursor-pointer"
              >
                {filterOptions.kabupaten.map((k) => (
                  <FilterOption key={k} value={k} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                    {k}
                  </FilterOption>
                ))}
              </FilterSelect>
            </div>

            {/* Filter 2: Nama Faskes */}
            <div>
              <label htmlFor="PemanfaatanAntrolDashboard-filter-2" className="block text-xs font-bold text-[var(--text-main)] mb-1">2. Nama Faskes</label>
              <FilterSelect aria-label="Fasilitas kesehatan" id="PemanfaatanAntrolDashboard-filter-2"
                value={filters.nama_rs || '(All)'}
                onChange={(e) => handleFilterChange('nama_rs', e.target.value)}
                className="sapa-control min-w-0 w-full rounded-xl px-3.5 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] transition-colors cursor-pointer"
              >
                {filterOptions.nama_rs?.map((n) => (
                  <FilterOption key={n} value={n} className="bg-[var(--surface-subtle)] text-[var(--text-main)] truncate">
                    {n}
                  </FilterOption>
                )) || <FilterOption value="(All)" className="bg-[var(--surface-subtle)] text-[var(--text-main)]">(All)</FilterOption>}
              </FilterSelect>
            </div>

            {/* Filter 3: Bulan */}
            <div>
              <label htmlFor="PemanfaatanAntrolDashboard-filter-3" className="block text-xs font-bold text-[var(--text-main)] mb-1">3. Bulan</label>
              <FilterSelect aria-label="Bulan" id="PemanfaatanAntrolDashboard-filter-3"
                value={filters.bulan || '(All)'}
                onChange={(e) => handleFilterChange('bulan', e.target.value)}
                className="sapa-control min-w-0 w-full rounded-xl px-3.5 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] transition-colors cursor-pointer"
              >
                {filterOptions.bulan.map((b) => (
                  <FilterOption key={b} value={b} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                    {b}
                  </FilterOption>
                ))}
              </FilterSelect>
            </div>

            {/* Filter 4: Tahun */}
            <div>
              <label htmlFor="PemanfaatanAntrolDashboard-filter-4" className="block text-xs font-bold text-[var(--text-main)] mb-1">4. Tahun</label>
              <FilterSelect aria-label="Tahun" id="PemanfaatanAntrolDashboard-filter-4"
                value={filters.tahun || '2026'}
                onChange={(e) => handleFilterChange('tahun', e.target.value)}
                className="sapa-control min-w-0 w-full rounded-xl px-3.5 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] transition-colors cursor-pointer"
              >
                {filterOptions.tahun.map((y) => (
                  <FilterOption key={y} value={y} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                    {y}
                  </FilterOption>
                ))}
              </FilterSelect>
            </div>

            {/* Filter 5: Sumber */}
            <div>
              <label htmlFor="PemanfaatanAntrolDashboard-filter-5" className="block text-xs font-bold text-[var(--text-main)] mb-1">5. Sumber</label>
              <FilterSelect aria-label="Sumber antrean" id="PemanfaatanAntrolDashboard-filter-5"
                value={filters.sumber || 'All Sumber'}
                onChange={(e) => handleFilterChange('sumber', e.target.value)}
                className="sapa-control min-w-0 w-full rounded-xl px-3.5 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] transition-colors cursor-pointer"
              >
                {filterOptions.sumber.map((s) => (
                  <FilterOption key={s} value={s} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                    {s}
                  </FilterOption>
                ))}
              </FilterSelect>
            </div>
          </MainCard>

          {/* Kotak Keterangan Analisis & Kebijakan */}
          <MainCard content={false} className="min-w-0 berry-dashboard-card rounded-lg p-4.5 text-[var(--text-muted)] text-xs leading-relaxed space-y-1.5 border border-[var(--border-color)] min-w-0">
            <span className="font-bold text-[var(--bpjs-green)] block flex items-center gap-1.5">
              <svg className="w-4 h-4 text-[var(--bpjs-green)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Keterangan Analisis:
            </span>
            <p>- Validasi Jumlah Kunjungan berdasarkan Nomor Kartu, Tanggal Pelayanan, Faskes Layan dan Poli sama dengan SEP Terbit.</p>
            <p>- Poli Exclude adalah HIV, HDL, INF, IGD, ICU, 043, 060, KDN, 168, RDT, NUK, KEM, RAT, UGD.</p>
          </MainCard>
        </div>

        {/* Kolom Kanan: 3 Visualisasi Grafik (Bulanan Horisontal, Faskes Vertikal, Poli Vertikal) */}
        <div className="min-w-0 lg:col-span-8 xl:col-span-9 space-y-6">
          {isNoData ? (
            /* No Data State */
            <MainCard content={false} className="min-w-0 berry-dashboard-card border border-dashed border-emerald-500/30 rounded-lg p-6 sm:p-12 text-center flex flex-col items-center justify-center min-h-[450px] min-w-0">
              <div className="w-16 h-16 rounded-lg bg-[var(--surface-subtle)] border border-emerald-500/30 flex items-center justify-center mb-4 text-emerald-400">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <Typography component="h3" variant="h5" className="text-xl font-bold text-[var(--text-main)]">{data?.message || 'Data Tidak Ditemukan.'}</Typography>
              <p className="text-xs text-[var(--text-muted)] mt-2 max-w-sm">
                Tidak ada catatan yang cocok untuk kombinasi parameter filter yang dipilih.
              </p>
              <AnimatedButton
                onClick={handleResetFilter}
                className="mt-5 sapa-button sapa-button-primary px-5 py-2.5 rounded-xl text-[var(--text-main)] text-xs font-bold transition-all cursor-pointer"
              >
                Reset Filter
              </AnimatedButton>
            </MainCard>
          ) : (
            <>
              {/* 1. LINE CHART BULANAN (MENGAMBIL TIMESTAMP TERBARU) */}
              <MainCard content={false} className="min-w-0 berry-dashboard-card rounded-lg p-4 sm:p-6 border border-[var(--border-color)] min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-5 border-b border-[var(--border-color)] gap-3">
                  <div>
                    <Typography component="h3" variant="h5" className="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-green)]" />
                      Line Chart Bulanan - Tren Capaian Antrol
                    </Typography>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Grafik garis tren capaian bulanan berbasis <span className="font-semibold text-[var(--bpjs-green)]">Timestamp Terbaru</span> per bulan (Format: MM/DD/YYYY HH:MM:SS)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    {showTarget80 && (
                      <span className="flex items-center gap-1.5 text-xs text-[var(--text-main)] bg-[var(--border-color)]/20 px-2.5 py-1 rounded-lg border border-[var(--border-color)]">
                        <span className="w-3 h-0.5 border-t-2 border-dashed border-[var(--border-color)] inline-block" />
                        <span className="text-[11px] font-semibold">Target MJKN: 80%</span>
                      </span>
                    )}
                    {showTarget95 && (
                      <span className="flex items-center gap-1.5 text-xs text-[var(--warning-text)] bg-[var(--warning-soft)] px-2.5 py-1 rounded-lg border border-[var(--border-color)]">
                        <span className="w-3 h-0.5 border-t-2 border-dashed border-amber-600 inline-block" />
                        <span className="text-[11px] font-semibold">Target All Sumber: 95%</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-xs text-[var(--bpjs-green)] bg-[var(--surface-accent)] px-2.5 py-1 rounded-lg border border-[var(--border-color)]">
                      <span className="w-2 h-2 rounded-full bg-[var(--bpjs-green)] inline-block" />
                      <span className="text-[11px] font-semibold">Realisasi</span>
                    </span>
                  </div>
                </div>

                {/* Interactive Tooltip Banner saat Bulan di-hover (Zero Layout Shift Container) */}
                <div className="mb-4 sm:h-[62px] min-h-[62px] flex items-center">
                  {hoveredMonthIndex !== null && data?.trend_per_bulan?.[hoveredMonthIndex] ? (() => {
                    const activeItem = data.trend_per_bulan[hoveredMonthIndex];
                    const met = (activeItem?.avg_capaian ?? 0) >= 85;
                    return (
                      <div className="w-full p-2.5 sm:p-3 rounded-xl bg-[var(--surface)] border border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${met ? 'bg-[var(--surface-accent)] text-[var(--bpjs-green)] border border-[var(--border-color)]/40   ' : 'bg-[var(--border-color)]/30 text-[var(--bpjs-navy)] border border-[var(--border-color)]/50   '}`}>
                            {activeItem.month}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-2">
                              <span>{activeItem.month_full || activeItem.month}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${met ? 'bg-[var(--surface-accent)] text-[var(--bpjs-green)] border border-[var(--border-color)]/40   ' : 'bg-[var(--warning-soft)] text-[var(--warning-text)] border border-[var(--border-color)]   '}`}>
                                {met ? ' Memenuhi Target (≥85%)' : ' Di Bawah Target (<85%)'}
                              </span>
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-1.5 mt-0.5 font-mono">
                              <svg className="w-3.5 h-3.5 text-[var(--bpjs-green)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>Snapshot Timestamp: <strong className="text-[var(--bpjs-green)]">{activeItem.latest_timestamp || 'MM/DD/YYYY HH:MM:SS'}</strong></span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right sm:border-l sm:border-[var(--border-color)] sm:pl-4 shrink-0">
                          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Capaian Antrol</div>
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
                          <span className="font-semibold text-[var(--text-main)]">Eksplorasi Snapshot Bulanan</span>
                          <span className="hidden sm:inline text-[11px] text-[var(--text-muted)] ml-1.5">- Arahkan kursor pada kurva grafik atau kartu bulan di bawah untuk rincian data.</span>
                        </div>
                      </div>
                      <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--border-color)] text-[var(--bpjs-green)] shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--bpjs-green)]" />
                        <span>Interactive Chart</span>
                      </div>
                    </div>
                  )}
                </div>

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

                  // Calculate dynamic max domain for Y-axis (handles >100% like Jan 26: 102.44%)
                  const maxVal = ptsList.reduce((acc, item) => {
                    const v = typeof item?.avg_capaian === 'number' && !isNaN(item.avg_capaian) ? item.avg_capaian : 0;
                    return Math.max(acc, v);
                  }, 100);

                  const yDomainMax = maxVal > 100 ? (maxVal > 110 ? 120 : 115) : 100;

                  const calcY = (val: number | undefined) => {
                    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
                    const clamped = Math.min(Math.max(num, 0), yDomainMax);
                    return padT + chartH - (clamped / yDomainMax) * chartH;
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
                    <div aria-label="Area data yang dapat digulir" role="region" tabIndex={0} className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain select-none">
                      <div className="min-w-[680px]">
                        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto overflow-visible">
                          <defs>
                            <linearGradient id="lineGradBPJS" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="var(--bpjs-navy)" />
                              <stop offset="35%" stopColor="var(--text-muted)" />
                              <stop offset="70%" stopColor="var(--bpjs-green)" />
                              <stop offset="100%" stopColor="var(--border-color)" />
                            </linearGradient>
                            <linearGradient id="areaGradBPJS" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="var(--bpjs-green)" stopOpacity="0.25" />
                              <stop offset="60%" stopColor="var(--bpjs-navy)" stopOpacity="0.08" />
                              <stop offset="100%" stopColor="var(--bpjs-navy)" stopOpacity="0.0" />
                            </linearGradient>
                            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="var(--bpjs-green)" floodOpacity="0.30" />
                            </filter>
                          </defs>

                          {/* Grid Lines & Y Axis Labels (Dynamic domain support) */}
                          {(yDomainMax > 100 ? [0, 25, 50, 75, 100, yDomainMax] : [0, 25, 50, 75, 100]).map((level) => {
                            const y = calcY(level);
                            const is100 = level === 100 && yDomainMax > 100;
                            return (
                              <g key={level}>
                                <line
                                  x1={padL}
                                  x2={padL + chartW}
                                  y1={y}
                                  y2={y}
                                  stroke="currentColor"
                                  className={is100 ? "text-[var(--bpjs-green)]/40 " : "text-[var(--text-muted)] "}
                                  strokeDasharray={is100 ? "3 3" : "4 4"}
                                />
                                <text
                                  x={padL - 10}
                                  y={y + 3.5}
                                  textAnchor="end"
                                  className={`text-[10px] font-mono ${is100 ? "fill-[var(--bpjs-green)]  font-bold" : "fill-[var(--text-muted)] "}`}
                                >
                                  {level}%
                                </text>
                              </g>
                            );
                          })}

                          {/* 80% Target Benchmark Line (Mobile JKN) - Posisi kiri anti-collision */}
                          {showTarget80 && (
                            <g>
                              <line
                                x1={padL}
                                x2={padL + chartW}
                                y1={target80Y}
                                y2={target80Y}
                                stroke="var(--bpjs-navy)"
                                strokeDasharray="5 3"
                                strokeWidth="1.2"
                              />
                              <rect
                                x={padL + 6}
                                y={target80Y - 16}
                                width="82"
                                height="14"
                                rx="3"
                                fill="rgba(43, 67, 144, 0.92)"
                                stroke="rgba(175, 186, 222, 0.6)"
                                strokeWidth="1"
                              />
                              <text
                                x={padL + 47}
                                y={target80Y - 5.5}
                                textAnchor="middle"
                                className="text-[8px] fill-white font-bold tracking-wider"
                              >
                                TARGET 80%
                              </text>
                            </g>
                          )}

                          {/* 95% Target Benchmark Line (All Sumber) - Posisi kiri anti-collision */}
                          {showTarget95 && (
                            <g>
                              <line
                                x1={padL}
                                x2={padL + chartW}
                                y1={target95Y}
                                y2={target95Y}
                                stroke="var(--warning)"
                                strokeDasharray="6 4"
                                strokeWidth="1.5"
                              />
                              <rect
                                x={padL + 6}
                                y={target95Y - 16}
                                width="82"
                                height="14"
                                rx="3"
                                fill="rgba(245, 158, 11, 0.95)"
                                stroke="rgba(245, 158, 11, 0.5)"
                                strokeWidth="1"
                              />
                              <text
                                x={padL + 47}
                                y={target95Y - 5.5}
                                textAnchor="middle"
                                className="text-[8px] fill-white font-bold tracking-wider"
                              >
                                TARGET 95%
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
                                  fill="var(--surface)"
                                  stroke={isTargetMet ? "var(--bpjs-green)" : "var(--bpjs-navy)"}
                                  strokeWidth={isHovered ? 3 : 2}
                                  className="cursor-pointer transition-all duration-200"
                                />

                                {/* Inner Dot */}
                                <circle
                                  cx={pt.x}
                                  cy={pt.y}
                                  r={isHovered ? 4.5 : 2.5}
                                  fill={isTargetMet ? "var(--bpjs-green)" : "var(--bpjs-navy)"}
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
                                    fill={isHovered ? "var(--bpjs-navy)" : isTargetMet ? "var(--bpjs-green)" : "var(--text-muted)"}
                                    stroke="var(--surface)"
                                    strokeWidth="1"
                                    className="transition-colors"
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
                                    isHovered ? 'fill-[var(--bpjs-green)]  font-extrabold' : 'fill-[var(--bpjs-navy)] '
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
                <div className="mt-5 pt-4 border-t border-[var(--border-color)]">
                  <div className="text-[11px] font-bold text-[var(--text-main)] uppercase tracking-wider mb-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-[var(--bpjs-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Daftar Snapshot Timestamp Terbaru per Bulan
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] font-normal">
                      Klik/Arahkan kursor pada kartu untuk menyorot titik kurva
                    </span>
                  </div>

                  <div className="grid min-w-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
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
                              ? 'bg-[var(--surface-accent)]/50 border-[var(--bpjs-green)] shadow-md shadow-[var(--bpjs-green)]/20 -translate-y-0.5  '
                              : 'bg-[var(--surface)]  border-[var(--border-color)]/30  hover:border-[var(--bpjs-green)]/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold text-[var(--text-main)] truncate">{item.month}</span>
                            <span className={`text-[9px] font-extrabold ${met ? 'text-[var(--bpjs-green)] ' : 'text-[var(--text-muted)] '}`}>
                              {formatPercentID(item.avg_capaian)}
                            </span>
                          </div>
                          <div className="text-[9.5px] font-mono text-[var(--text-muted)] truncate flex items-center gap-1" title={item.latest_timestamp}>
                            <svg className="w-2.5 h-2.5 text-[var(--bpjs-green)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="truncate">{item.latest_timestamp || 'N/A'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </MainCard>

              {/* GRID 2 KOLOM BERDAMPINGAN: GRAFIK FASKES (KIRI) & GRAFIK NAMA POLI (KANAN) */}
              <div className="grid min-w-0 grid-cols-1 xl:grid-cols-2 gap-6">
                {/* 2. GRAFIK BATANG HORISONTAL FASKES (KIRI) */}
                <MainCard content={false} className="min-w-0 berry-dashboard-card rounded-lg p-5 sm:p-6 border border-[var(--border-color)] flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-5 border-b border-[var(--border-color)] gap-3">
                      <div>
                        <Typography component="h3" variant="h5" className="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-navy)]" />
                          Grafik Batang Horisontal Faskes
                        </Typography>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          Capaian pemanfaatan antrol per Rumah Sakit FKRTL
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <AnimatedButton
                          onClick={() => setSortFaskesDesc(!sortFaskesDesc)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--border-color)]/20 hover:bg-[var(--border-color)]/30 text-[var(--text-main)] border border-[var(--border-color)] flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>{sortFaskesDesc ? 'Tertinggi ↓' : 'Terendah ↑'}</span>
                        </AnimatedButton>
                        {showTarget80 && (
                          <span className="flex items-center gap-1.5 text-xs text-[var(--text-main)] bg-[var(--border-color)]/20 px-2 py-0.5 rounded-lg border border-[var(--border-color)]">
                            <span className="w-2.5 h-0.5 border-t-2 border-dashed border-[var(--border-color)] inline-block" />
                            <span className="text-[10.5px] font-semibold">Target MJKN: 80%</span>
                          </span>
                        )}
                        {showTarget95 && (
                          <span className="flex items-center gap-1.5 text-xs text-[var(--warning-text)] bg-[var(--warning-soft)] px-2 py-0.5 rounded-lg border border-[var(--border-color)]">
                            <span className="w-2.5 h-0.5 border-t-2 border-dashed border-amber-600 inline-block" />
                            <span className="text-[10.5px] font-semibold">Target All Sumber: 95%</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Horizontal Scale Ruler Header */}
                    <div className="flex items-center gap-2.5 sm:gap-3 mb-2 text-[10px] text-[var(--text-muted)] font-mono">
                      <div className="w-24 sm:w-44 shrink-0 text-right pr-2 font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        Nama FKRTL
                      </div>
                      <div className="min-w-0 flex-1 relative h-5">
                        <span className="absolute left-0 bottom-0">0%</span>
                        <span className="absolute left-1/4 -translate-x-1/2 bottom-0 hidden md:inline">25%</span>
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-0">50%</span>
                        <span className="absolute left-3/4 -translate-x-1/2 bottom-0 hidden md:inline">75%</span>
                        {showTarget80 && (
                          <span className="absolute left-[80%] -translate-x-1/2 bottom-0 text-[var(--text-main)] font-bold bg-[var(--border-color)]/30 px-1 rounded border border-[var(--border-color)]">
                            80%
                          </span>
                        )}
                        {showTarget95 && (
                          <span className="absolute left-[95%] -translate-x-1/2 bottom-0 text-[var(--warning-text)] font-bold bg-[var(--warning-soft)] px-1 rounded border border-[var(--border-color)]">
                            95%
                          </span>
                        )}
                        <span className="absolute right-0 bottom-0">100%</span>
                      </div>
                    </div>

                    {/* Horizontal Bars List */}
                    <div tabIndex={0} role="region" aria-label="Grafik per fasilitas, gulir untuk melihat data lainnya" className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1 custom-scrollbar">
                      {sortedFaskes.length === 0 ? (
                        <div className="w-full py-16 text-center text-[var(--text-muted)] text-xs italic">
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
                            <div key={idx} className="group flex items-center gap-2.5 sm:gap-3 hover:bg-[var(--surface-accent)]/20 p-1 rounded-xl transition-colors">
                              {/* Nama Faskes (Sumbu Y) */}
                              <div className="w-24 sm:w-44 shrink-0 text-right">
                                <span
                                  className="text-xs font-bold text-[var(--text-main)] group-hover:text-[var(--bpjs-green)] transition-colors line-clamp-1 block"
                                  title={f.faskes}
                                >
                                  {f.faskes.replace(/\(.*?\)/g, '').trim()}
                                </span>
                              </div>

                              {/* Horizontal Bar Track & Fill */}
                              <div className="min-w-0 flex-1 bg-[var(--surface-subtle)] rounded-xl h-8 relative p-1 flex items-center border border-[var(--border-color)] group-hover:border-[var(--border-color)] transition-colors overflow-hidden">
                                {/* Garis Target Vertikal 80% (Hanya muncul jika filter sumber Mobile JKN) */}
                                {showTarget80 && (
                                  <div
                                    style={{ left: '80%' }}
                                    className="absolute top-0 bottom-0 w-0.5 border-r border-dashed border-[var(--border-color)] z-20 pointer-events-none"
                                    title="Garis Target Mobile JKN (80%)"
                                  />
                                )}

                                {/* Garis Target Vertikal 95% (Hanya muncul jika filter sumber All Sumber) */}
                                {showTarget95 && (
                                  <div
                                    style={{ left: '95%' }}
                                    className="absolute top-0 bottom-0 w-0.5 border-r border-dashed border-amber-600 z-20 pointer-events-none"
                                    title="Garis Target All Sumber (95%)"
                                  />
                                )}

                                {/* Filled Horizontal Bar */}
                                <div
                                  style={{ width: `${widthPercent}%` }}
                                  className={`h-full rounded-lg transition-all duration-700 relative overflow-hidden ${
                                    isMet
                                      ? 'bg-[var(--bpjs-green)]'
                                      : 'bg-[var(--bpjs-navy)]'
                                  }`}
                                >

                                </div>

                                {/* Percentage Display & Target Badges */}
                                <div className="absolute right-3 z-30 flex items-center gap-1.5 bg-[var(--panel-bg)] px-1 rounded">
                                  {showTarget95 && isTarget95 && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--surface-accent)] text-[var(--bpjs-green)] border border-[var(--border-color)] font-bold">
                                       &ge;95%
                                    </span>
                                  )}
                                  {showTarget80 && isTarget80 && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--border-color)]/30 text-[var(--text-main)] border border-[var(--border-color)] font-bold">
                                       &ge;80%
                                    </span>
                                  )}
                                  <span className="text-xs font-mono font-semibold text-[var(--text-main)] drop-">
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
                </MainCard>

                {/* 3. GRAFIK BATANG HORISONTAL NAMA POLI (KANAN) */}
                <MainCard content={false} className="min-w-0 berry-dashboard-card rounded-lg p-5 sm:p-6 border border-[var(--border-color)] flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-5 border-b border-[var(--border-color)] gap-3">
                      <div>
                        <Typography component="h3" variant="h5" className="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-green)]" />
                          Grafik Batang Horisontal Nama Poli
                        </Typography>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          Capaian pemanfaatan antrol berdasarkan Poliklinik BPJS{sortedPoli.length > 0 ? ` • ${sortedPoli.length} poli` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <AnimatedButton
                          onClick={() => setSortPoliDesc(!sortPoliDesc)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--border-color)]/20 hover:bg-[var(--border-color)]/30 text-[var(--text-main)] border border-[var(--border-color)] flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>{sortPoliDesc ? 'Tertinggi ↓' : 'Terendah ↑'}</span>
                        </AnimatedButton>
                        {showTarget80 && (
                          <span className="flex items-center gap-1.5 text-xs text-[var(--text-main)] bg-[var(--border-color)]/20 px-2 py-0.5 rounded-lg border border-[var(--border-color)]">
                            <span className="w-2.5 h-0.5 border-t-2 border-dashed border-[var(--border-color)] inline-block" />
                            <span className="text-[10.5px] font-semibold">Target MJKN: 80%</span>
                          </span>
                        )}
                        {showTarget95 && (
                          <span className="flex items-center gap-1.5 text-xs text-[var(--warning-text)] bg-[var(--warning-soft)] px-2 py-0.5 rounded-lg border border-[var(--border-color)]">
                            <span className="w-2.5 h-0.5 border-t-2 border-dashed border-amber-600 inline-block" />
                            <span className="text-[10.5px] font-semibold">Target All Sumber: 95%</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Horizontal Scale Ruler Header */}
                    <div className="flex items-center gap-2.5 sm:gap-3 mb-2 text-[10px] text-[var(--text-muted)] font-mono">
                      <div className="w-24 sm:w-44 shrink-0 text-right pr-2 font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        Nama Poli Spesialis
                      </div>
                      <div className="min-w-0 flex-1 relative h-5">
                        <span className="absolute left-0 bottom-0">0%</span>
                        <span className="absolute left-1/4 -translate-x-1/2 bottom-0 hidden md:inline">25%</span>
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-0">50%</span>
                        <span className="absolute left-3/4 -translate-x-1/2 bottom-0 hidden md:inline">75%</span>
                        {showTarget80 && (
                          <span className="absolute left-[80%] -translate-x-1/2 bottom-0 text-[var(--text-main)] font-bold bg-[var(--border-color)]/30 px-1 rounded border border-[var(--border-color)]">
                            80%
                          </span>
                        )}
                        {showTarget95 && (
                          <span className="absolute left-[95%] -translate-x-1/2 bottom-0 text-[var(--warning-text)] font-bold bg-[var(--warning-soft)] px-1 rounded border border-[var(--border-color)]">
                            95%
                          </span>
                        )}
                        <span className="absolute right-0 bottom-0">100%</span>
                      </div>
                    </div>

                    {/* Horizontal Bars List */}
                    <div tabIndex={0} role="region" aria-label="Grafik per fasilitas, gulir untuk melihat data lainnya" className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1 custom-scrollbar">
                      {sortedPoli.length === 0 ? (
                        <div className="w-full py-16 text-center text-[var(--text-muted)] text-xs italic">
                          {data?.poli_message || 'Tidak ada data poli untuk filter yang dipilih.'}
                        </div>
                      ) : (
                        sortedPoli.map((p) => {
                          const val = p.avg_capaian ?? 0;
                          const widthPercent = Math.min(Math.max(val, 0), 100);
                          const isTarget95 = val >= 95;
                          const isTarget80 = val >= 80;

                          const isMet = showTarget95 ? isTarget95 : isTarget80;

                          return (
                            <div key={p.kode_poli || p.poli} className="group flex items-center gap-2.5 sm:gap-3 hover:bg-[var(--surface-accent)]/20 p-1 rounded-xl transition-colors">
                              {/* Nama Poli (Sumbu Y) */}
                              <div className="w-24 sm:w-44 shrink-0 text-right">
                                <span
                                  className="text-xs font-bold text-[var(--text-main)] group-hover:text-[var(--bpjs-green)] transition-colors line-clamp-1 block"
                                  title={p.kode_poli ? `${p.poli} (${p.kode_poli})` : p.poli}
                                >
                                  {p.poli}
                                </span>
                              </div>

                              {/* Horizontal Bar Track & Fill */}
                              <div className="min-w-0 flex-1 bg-[var(--surface-subtle)] rounded-xl h-8 relative p-1 flex items-center border border-[var(--border-color)] group-hover:border-[var(--border-color)] transition-colors overflow-hidden">
                                {/* Garis Target Vertikal 80% (Hanya muncul jika filter sumber Mobile JKN) */}
                                {showTarget80 && (
                                  <div
                                    style={{ left: '80%' }}
                                    className="absolute top-0 bottom-0 w-0.5 border-r border-dashed border-[var(--border-color)] z-20 pointer-events-none"
                                    title="Garis Target Mobile JKN (80%)"
                                  />
                                )}

                                {/* Garis Target Vertikal 95% (Hanya muncul jika filter sumber All Sumber) */}
                                {showTarget95 && (
                                  <div
                                    style={{ left: '95%' }}
                                    className="absolute top-0 bottom-0 w-0.5 border-r border-dashed border-amber-600 z-20 pointer-events-none"
                                    title="Garis Target All Sumber (95%)"
                                  />
                                )}

                                {/* Filled Horizontal Bar */}
                                <div
                                  style={{ width: `${widthPercent}%` }}
                                  className={`h-full rounded-lg transition-all duration-700 relative overflow-hidden ${
                                    isMet
                                      ? 'bg-[var(--bpjs-green)]'
                                      : 'bg-[var(--bpjs-navy)]'
                                  }`}
                                >

                                </div>

                                {/* Percentage Display & Target Badges */}
                                <div className="absolute right-3 z-30 flex items-center gap-1.5 bg-[var(--panel-bg)] px-1 rounded">
                                  {showTarget95 && isTarget95 && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--surface-accent)] text-[var(--bpjs-green)] border border-[var(--border-color)] font-bold">
                                       &ge;95%
                                    </span>
                                  )}
                                  {showTarget80 && isTarget80 && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--border-color)]/30 text-[var(--text-main)] border border-[var(--border-color)] font-bold">
                                       &ge;80%
                                    </span>
                                  )}
                                  <span className="text-xs font-mono font-semibold text-[var(--text-main)] drop-">
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
                </MainCard>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hidden Tables for JPEG Export */}
      {jpegData && jpegData.type === 'faskes' && (
        <div id="jpeg-export-faskes" style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '800px', backgroundColor: 'white', padding: '20px' }}>
          <Table size="small" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '12px' }}>
            <TableHead>
              <TableRow>
                <TableCell style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid black', padding: '8px' }}>Nama FKRTL</TableCell>
                <TableCell style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid black', padding: '8px' }}>All Sumber<br/>(Target 95%)</TableCell>
                <TableCell style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid black', padding: '8px' }}>Mobile JKN<br/>(Target 80%)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jpegData.data.map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell style={{ border: '1px solid black', padding: '6px' }}>{row.Faskes}</TableCell>
                  <TableCell style={{
                    border: '1px solid black', padding: '6px', textAlign: 'right',
                    backgroundColor: row.all_sumber_pct >= 95 ? '#C6EFCE' : '#FFC7CE',
                    color: row.all_sumber_pct >= 95 ? '#006100' : '#9C0006'
                  }}>
                    {row.all_sumber_pct.toFixed(2)}%
                  </TableCell>
                  <TableCell style={{
                    border: '1px solid black', padding: '6px', textAlign: 'right',
                    backgroundColor: row.mjkn_pct >= 80 ? '#C6EFCE' : '#FFC7CE',
                    color: row.mjkn_pct >= 80 ? '#006100' : '#9C0006'
                  }}>
                    {row.mjkn_pct.toFixed(2)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {jpegData && jpegData.type === 'poli' && (
        <div id="jpeg-export-poli" style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '1200px', backgroundColor: 'white', padding: '20px' }}>
          <Table size="small" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '11px' }}>
            <TableHead>
              <TableRow>
                {POLI_EXPORT_COLUMNS.map(column => (
                  <TableCell key={column.key} style={{ backgroundColor: '#00529C', color: 'white', border: '1px solid #00529C', padding: '8px' }}>{column.header}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {jpegData.data.map((row, idx) => (
                <TableRow key={idx}>
                  {POLI_EXPORT_COLUMNS.map(column => (
                    <TableCell key={column.key} style={{ border: '1px solid #4D94FF', padding: '6px' }}>
                      {column.key === 'capaian_pct' ? formatPercentID(row[column.key]) : row[column.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
