import { Typography } from '@mui/material';
import MainCard from '../berry/MainCard';
import { Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import '../berry/berry-dashboards.css';
import { FilterSelect, FilterOption } from './ui/FilterSelect';
import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/apiClient';
import { UnduhJpegKepatuhan } from './UnduhJpegKepatuhan';

export interface PengaduanKpiData {
  avg_capaian: number;
  bobot_persen: number;
  kontribusi_capaian: number;
  target_persen: number;
  total_faskes: number;
  total_pengaduan_3bln: number;
  total_pengaduan_bln: number;
  total_ditindaklanjuti_sla: number;
  total_top10_thnlalu: number;
  total_tidak_ditindaklanjuti: number;
  total_tercapai: number;
  total_belum_tercapai: number;
  total_records: number;
}

export interface PengaduanMonthlyChartItem {
  bulan: string;
  bulan_indo: string;
  short_name: string;
  avg_capaian: number;
  total_pengaduan_bln: number;
  total_ditindaklanjuti_sla: number;
  faskes_count: number;
  met_count: number;
  is_selected?: boolean;
}

export interface PengaduanTableRow {
  no: number;
  kode_ppk: string;
  nama_ppk: string;
  tipe_faskes: string;
  kabupaten: string;
  kelas_ppk: string;
  bulan: string;
  bulan_indo: string;
  pengaduan_3bln: number;
  pengaduan_bln: number;
  ditindaklanjuti_sla: number;
  top10_thnlalu: number;
  tidak_ditindaklanjuti: number;
  capaian: number;
  is_met: boolean;
  status?: string;
}

export interface PengaduanFilterOptions {
  kabupaten: string[];
  nama_ppk: string[];
  bulan: string[];
  tipe_faskes: string[];
}

export interface PengaduanApiResponse {
  status: string;
  kpi: PengaduanKpiData;
  monthly_chart: PengaduanMonthlyChartItem[];
  table_data: PengaduanTableRow[];
  filter_options: PengaduanFilterOptions;
  active_filters: {
    kabupaten: string;
    nama_ppk: string;
    bulan: string;
    tipe_faskes: string;
  };
}

export const PengaduanComplianceTab: React.FC = () => {
  // Filter states
  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('Semua Kabupaten');
  const [selectedNamaPpk, setSelectedNamaPpk] = useState<string>('Semua Faskes');
  const [selectedBulan, setSelectedBulan] = useState<string>('September 2026');
  const [selectedTipeFaskes, setSelectedTipeFaskes] = useState<string>('Semua Tipe Faskes');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'TERCAPAI' | 'BELUM_TERCAPAI'>('ALL');

  // Hover state for Line Chart
  const [hoveredMonth, setHoveredMonth] = useState<PengaduanMonthlyChartItem | null>(null);

  // Pagination & Sorting state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  const [sortField, setSortField] = useState<keyof PengaduanTableRow>('capaian');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Data fetching state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [apiData, setApiData] = useState<PengaduanApiResponse | null>(null);

  // Fetch data from backend API
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedKabupaten && selectedKabupaten !== 'Semua Kabupaten') {
        params.append('kabupaten', selectedKabupaten);
      }
      if (selectedNamaPpk && selectedNamaPpk !== 'Semua Faskes') {
        params.append('nama_ppk', selectedNamaPpk);
      }
      if (selectedBulan && selectedBulan !== 'Semua Bulan') {
        params.append('bulan', selectedBulan);
      }
      if (selectedTipeFaskes && selectedTipeFaskes !== 'Semua Tipe Faskes') {
        params.append('tipe_faskes', selectedTipeFaskes);
      }

      const res = await apiClient.get<PengaduanApiResponse>(`/api/v1/fkrtl-kepatuhan/pengaduan?${params.toString()}`);
      if (res.data && res.data.status === 'success') {
        setApiData(res.data);
      } else {
        throw new Error('Format data pengaduan tidak sesuai');
      }
    } catch (err: any) {
      console.warn('Gagal memuat live data pengaduan dari backend:', err);
      setError('Gagal menghubungkan ke server, memuat data lokal...');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedKabupaten, selectedNamaPpk, selectedBulan, selectedTipeFaskes]);

  // Handlers for Cascading Dependent Filters
  const handleKabupatenChange = (newKab: string) => {
    setSelectedKabupaten(newKab);
    setSelectedNamaPpk('Semua Faskes');
    setSelectedTipeFaskes('Semua Tipe Faskes');
  };

  const handleTipeFaskesChange = (newTipe: string) => {
    setSelectedTipeFaskes(newTipe);
    setSelectedNamaPpk('Semua Faskes');
  };

  // Auto-sync jika pilihan tidak ada dalam opsi baru API
  useEffect(() => {
    if (apiData?.filter_options) {
      if (selectedNamaPpk !== 'Semua Faskes' && !apiData.filter_options.nama_ppk.includes(selectedNamaPpk)) {
        setSelectedNamaPpk('Semua Faskes');
      }
      if (selectedTipeFaskes !== 'Semua Tipe Faskes' && !apiData.filter_options.tipe_faskes.includes(selectedTipeFaskes)) {
        setSelectedTipeFaskes('Semua Tipe Faskes');
      }
    }
  }, [apiData]);

  // Reset pagination when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedKabupaten, selectedNamaPpk, selectedBulan, selectedTipeFaskes, searchQuery, statusFilter]);

  // Filtered & Sorted Table Rows
  const processedTableRows = useMemo(() => {
    if (!apiData || !apiData.table_data) return [];
    let rows = [...apiData.table_data];

    // Status filter: Tercapai (nilai 100) vs Belum Tercapai (nilai < 100)
    if (statusFilter === 'TERCAPAI') {
      rows = rows.filter((r) => r.capaian >= 100 || r.status === 'Tercapai');
    } else if (statusFilter === 'BELUM_TERCAPAI') {
      rows = rows.filter((r) => r.capaian < 100);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.nama_ppk.toLowerCase().includes(q) ||
          r.tipe_faskes.toLowerCase().includes(q) ||
          r.kabupaten.toLowerCase().includes(q)
      );
    }

    // Sorting
    rows.sort((a, b) => {
      const valA = a[sortField] ?? '';
      const valB = b[sortField] ?? '';

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      const numA = typeof valA === 'number' ? valA : 0;
      const numB = typeof valB === 'number' ? valB : 0;
      if (numA < numB) return sortDirection === 'asc' ? -1 : 1;
      if (numA > numB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  }, [apiData, statusFilter, searchQuery, sortField, sortDirection]);

  // Paginated Rows
  const totalPages = Math.ceil(processedTableRows.length / itemsPerPage) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedTableRows.slice(start, start + itemsPerPage);
  }, [processedTableRows, currentPage, itemsPerPage]);

  const handleSort = (field: keyof PengaduanTableRow) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleResetFilters = () => {
    setSelectedKabupaten('Semua Kabupaten');
    setSelectedNamaPpk('Semua Faskes');
    setSelectedBulan('Semua Bulan');
    setSelectedTipeFaskes('Semua Tipe Faskes');
    setSearchQuery('');
    setStatusFilter('ALL');
  };

  const formatNumberID = (val: number): string => {
    return val.toLocaleString('id-ID');
  };

  const kpi = apiData?.kpi || {
    avg_capaian: 0,
    bobot_persen: 20,
    kontribusi_capaian: 0,
    target_persen: 100,
    total_faskes: 0,
    total_pengaduan_3bln: 0,
    total_pengaduan_bln: 0,
    total_ditindaklanjuti_sla: 0,
    total_top10_thnlalu: 0,
    total_tidak_ditindaklanjuti: 0,
    total_tercapai: 0,
    total_belum_tercapai: 0,
    total_records: 0,
  };

  const monthlyChart = apiData?.monthly_chart || [];
  const filterOptions = apiData?.filter_options || {
    kabupaten: ['Semua Kabupaten'],
    nama_ppk: ['Semua Faskes'],
    bulan: ['Semua Bulan'],
    tipe_faskes: ['Semua Tipe Faskes'],
  };

  const totalTercapai = kpi.total_tercapai ?? 0;
  const totalBelumTercapai = kpi.total_belum_tercapai ?? kpi.total_records;

  if (!apiData) {
    return (
      <MainCard content={false} className="berry-dashboard-card p-5 sm:p-6" aria-busy={loading} aria-live="polite">
        <p className="sapa-eyebrow">Data kepatuhan FKRTL</p>
        <Typography component="h2" variant="h4" className="sapa-section-heading text-lg font-semibold text-[var(--text-main)] mt-2">{loading ? 'Memuat data kepatuhan' : 'Data belum tersedia'}</Typography>
        <p className="text-sm text-[var(--text-muted)] mt-2">{loading ? 'Mengambil data sesuai filter yang dipilih.' : error || 'Belum ada data untuk ditampilkan.'}</p>
        {!loading && <button type="button" onClick={fetchData} className="sapa-button sapa-button-primary mt-4">Coba lagi</button>}
      </MainCard>
    );
  }

  return (
    <div className="sapa-dashboard-body space-y-6">
      <p className="sapa-filter-summary sapa-status flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]" aria-live="polite">
        <span>Filter aktif:</span><span>{selectedKabupaten}</span><span>{selectedNamaPpk}</span><span>{selectedBulan}</span><span>{selectedTipeFaskes}</span>
        <span>{statusFilter === 'ALL' ? 'Semua status' : statusFilter === 'TERCAPAI' ? 'Target tercapai' : 'Belum mencapai target'}</span>
        {searchQuery && <span>Pencarian: {searchQuery}</span>}
      </p>
      {/* Alert Error State if any */}
      {error && (
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-4 border border-amber-500/40 bg-amber-500/10 text-amber-800 flex items-center justify-between gap-3 text-xs min-w-0">
          <div className="flex items-center gap-2">
            <span></span>
            <span>{error}</span>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 font-bold transition-colors cursor-pointer"
          >
            Coba Lagi
          </button>
        </MainCard>
      )}

      {/* 1. FILTER BAR 4-DIMENSI CASCADING */}
      <MainCard content={false} className="berry-dashboard-card rounded-lg p-4 sm:p-5 border border-[var(--border-color)] relative overflow-hidden min-w-0">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[var(--bpjs-navy)]/10 flex items-center justify-center text-[var(--text-main)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
              <div>
                <Typography component="h4" variant="h5" className="text-xs sm:text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">
                  Filter Analisis Penyelesaian Pengaduan
                </Typography>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Pilih parameter Kabupaten, Nama Faskes, Bulan, dan Tipe Faskes untuk memfilter data real-time
                </p>
              </div>
            </div>

            <button
              onClick={handleResetFilters}
              className="self-start sm:self-center px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--text-main)] hover:bg-[var(--surface-accent)]/40 border border-[var(--border-color)] transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Reset Semua Filter"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Reset Filter</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Filter Kabupaten */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="PengaduanComplianceTab-filter-1" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Kabupaten</span>
              </label>
              <FilterSelect aria-label="Kabupaten" id="PengaduanComplianceTab-filter-1"
                value={selectedKabupaten}
                onChange={(e) => handleKabupatenChange(e.target.value)}
                className="sapa-control rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer"
              >
                {filterOptions.kabupaten.map((kab) => (
                  <FilterOption key={kab} value={kab} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                    {kab}
                  </FilterOption>
                ))}
              </FilterSelect>
            </div>

            {/* Filter Nama Faskes (Dependen) */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="PengaduanComplianceTab-filter-2" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Nama Faskes (FKRTL)</span>
              </label>
              <FilterSelect aria-label="Fasilitas kesehatan" id="PengaduanComplianceTab-filter-2"
                value={selectedNamaPpk}
                onChange={(e) => setSelectedNamaPpk(e.target.value)}
                className="sapa-control rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer truncate"
              >
                {filterOptions.nama_ppk.map((faskes) => (
                  <FilterOption key={faskes} value={faskes} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                    {faskes}
                  </FilterOption>
                ))}
              </FilterSelect>
            </div>

            {/* Filter Bulan */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="PengaduanComplianceTab-filter-3" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Bulan</span>
              </label>
              <FilterSelect aria-label="Bulan" id="PengaduanComplianceTab-filter-3"
                value={selectedBulan}
                onChange={(e) => setSelectedBulan(e.target.value)}
                className="sapa-control rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer"
              >
                {filterOptions.bulan.map((bln) => (
                  <FilterOption key={bln} value={bln} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                    {bln}
                  </FilterOption>
                ))}
              </FilterSelect>
            </div>

            {/* Filter Tipe Faskes (Dependen) */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="PengaduanComplianceTab-filter-4" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Tipe Faskes</span>
              </label>
              <FilterSelect aria-label="Jenis fasilitas kesehatan" id="PengaduanComplianceTab-filter-4"
                value={selectedTipeFaskes}
                onChange={(e) => handleTipeFaskesChange(e.target.value)}
                className="sapa-control rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer"
              >
                {filterOptions.tipe_faskes.map((tipe) => (
                  <FilterOption key={tipe} value={tipe} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                    {tipe}
                  </FilterOption>
                ))}
              </FilterSelect>
            </div>
          </div>
        </div>
      </MainCard>

      {/* 2. KARTU KPI UTAMA (CAPAIAN, KONTRIBUSI BOBOT 20%, TOTAL PENGADUAN, STATUS KEPATUHAN) */}
      <div className="sapa-kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: RATA-RATA CAPAIAN */}
        <MainCard content={false} className="sapa-kpi-lead berry-dashboard-card rounded-lg p-4 sm:p-5 border border-[var(--border-color)] relative overflow-hidden flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold text-[var(--text-muted)] tracking-wider">
              Capaian (Poin)
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--surface-accent)] text-[var(--bpjs-green)]">
              Target 100 Poin
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--text-main)] font-mono tracking-tight">
              {kpi.avg_capaian.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                kpi.avg_capaian >= 100
                  ? 'bg-[var(--surface-accent)] text-[var(--accent-text)] border border-[var(--border-color)]/40  '
                  : 'bg-amber-100 text-amber-800 border border-amber-300  '
              }`}
            >
              {kpi.avg_capaian >= 100 ? 'Tercapai' : 'Belum Tercapai'}
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Skor Rata-Rata FKRTL</span>
            <span className="font-bold font-mono text-[var(--text-main)]">
              Skala 0 - 100
            </span>
          </div>
        </MainCard>

        {/* KPI 2: KONTRIBUSI NILAI RIIL (BOBOT 20%) */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-4 sm:p-5 border border-[var(--border-color)] relative overflow-hidden flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold text-[var(--text-muted)] tracking-wider">
              Kontribusi Bobot
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--border-color)]/30 text-[var(--text-main)]">
              Bobot 20%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--bpjs-green)] font-mono tracking-tight">
              {kpi.kontribusi_capaian.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-medium">
              poin dari skala 20
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Kontribusi Riil Mutu</span>
            <span className="font-bold font-mono text-[var(--bpjs-green)]">
              {kpi.kontribusi_capaian}%
            </span>
          </div>
        </MainCard>

        {/* KPI 3: TOTAL PENGADUAN BULAN PENILAIAN */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-4 sm:p-5 border border-[var(--border-color)] relative overflow-hidden flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold text-[var(--text-muted)] tracking-wider">
              Pengaduan Bln Penilaian
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--border-color)]/20 text-[var(--text-main)]">
              Top10: {formatNumberID(kpi.total_top10_thnlalu)}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--text-main)] font-mono tracking-tight">
              {formatNumberID(kpi.total_pengaduan_bln)}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-medium">
              laporan
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Sesuai SLA / Tidak Selesai</span>
            <span className="font-bold font-mono text-[var(--text-main)]">
              {formatNumberID(kpi.total_ditindaklanjuti_sla)} / {formatNumberID(kpi.total_tidak_ditindaklanjuti)}
            </span>
          </div>
        </MainCard>

        {/* KPI 4: STATUS KEPATUHAN RS */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-4 sm:p-5 border border-[var(--border-color)] relative overflow-hidden flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold text-[var(--text-muted)] tracking-wider">
              Status Kepatuhan RS
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--surface-accent)] text-[var(--bpjs-green)]">
              Nilai 100 = Tercapai
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--bpjs-green)] font-mono tracking-tight">
              {totalTercapai}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-medium">
              RS Tercapai (100)
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Belum Tercapai (&lt; 100)</span>
            <span className="font-bold font-mono text-[var(--warning-text)]">
              {totalBelumTercapai} RS
            </span>
          </div>
        </MainCard>
      </div>

      {/* 3. GRAFIK BULANAN: LINE CHART CAPAIAN PENYELESAIAN PENGADUAN */}
      <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 sm:p-6 border border-[var(--border-color)] relative overflow-hidden min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[var(--border-color)]">
          <div>
            <Typography component="h4" variant="h5" className="text-xs sm:text-sm font-bold text-[var(--text-main)] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-green)]" />
              GRAFIK BULANAN: TREN CAPAIAN PENYELESAIAN PENGADUAN (POIN)
            </Typography>
            <p className="text-[11px] text-[var(--text-muted)]">
              Tren rata-rata skor capaian tindak lanjut pengaduan sesuai SLA (Januari - September 2026) • Bobot 20%
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-green)]" />
              <span className="text-[var(--text-muted)] font-medium text-[11px]">Capaian</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-amber-500" />
              <span className="text-[var(--text-muted)] font-medium text-[11px]">Target 100 Poin</span>
            </div>
          </div>
        </div>

        {monthlyChart.length > 0 ? (
          <div className="relative pt-4">
            <div className="w-full h-56 sm:h-64">
              <svg viewBox="0 0 900 240" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="pengaduanCapaianGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--bpjs-green)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--bpjs-green)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid horizontal lines */}
                {[0, 25, 50, 75, 100].map((val) => {
                  const y = 200 - (val / 100) * 160;
                  return (
                    <g key={val}>
                      <line
                        x1="45"
                        y1={y}
                        x2="880"
                        y2={y}
                        stroke="currentColor"
                        strokeDasharray={val === 100 ? '4 4' : '2 2'}
                        className={val === 100 ? 'text-[var(--warning-text)] stroke-amber-500/80 stroke-[1.5]' : 'text-[var(--text-muted)]  stroke-[1]'}
                      />
                      <text
                        x="38"
                        y={y + 3.5}
                        textAnchor="end"
                        className="text-[10px] font-mono fill-[var(--text-muted)] select-none"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Target label 100 */}
                <text
                  x="875"
                  y={200 - (100 / 100) * 160 - 5}
                  textAnchor="end"
                  className="text-[10px] font-bold fill-amber-700 select-none"
                >
                  Target 100 Poin
                </text>

                {/* SVG Curve & Area */}
                {(() => {
                  const points = monthlyChart.map((d, i) => {
                    const x = 70 + (i / Math.max(monthlyChart.length - 1, 1)) * 800;
                    const y = 200 - (Math.min(Math.max(d.avg_capaian, 0), 100) / 100) * 160;
                    return { x, y, data: d };
                  });

                  if (points.length === 0) return null;

                  let pathD = `M ${points[0].x} ${points[0].y}`;
                  for (let i = 0; i < points.length - 1; i++) {
                    const p0 = points[i];
                    const p1 = points[i + 1];
                    const mx = (p0.x + p1.x) / 2;
                    pathD += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
                  }

                  const areaD = `${pathD} L ${points[points.length - 1].x} 200 L ${points[0].x} 200 Z`;

                  return (
                    <g>
                      <path d={areaD} fill="url(#pengaduanCapaianGradient)" />
                      <path
                        d={pathD}
                        fill="none"
                        stroke="var(--bpjs-green)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-"
                      />

                      {/* Interactive Markers */}
                      {points.map((pt, i) => {
                        const isHovered = hoveredMonth?.bulan === pt.data.bulan;
                        return (
                          <g
                            key={i}
                            className="cursor-pointer transition-transform"
                            onMouseEnter={() => setHoveredMonth(pt.data)}
                            onMouseLeave={() => setHoveredMonth(null)}
                          >
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isHovered ? 6 : 4}
                              fill="var(--bpjs-green)"
                              stroke="var(--surface)"
                              strokeWidth={isHovered ? 2.5 : 1.8}
                              className="transition-all duration-200"
                            />
                            <text
                              x={pt.x}
                              y={220}
                              textAnchor="middle"
                              className={`text-[10px] select-none ${
                                isHovered
                                  ? 'font-bold fill-[var(--bpjs-green)] '
                                  : 'fill-[var(--text-muted)] '
                              }`}
                            >
                              {pt.data.short_name}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}
              </svg>
            </div>

            {/* Hover Tooltip Box */}
            {hoveredMonth && (
              <div className="absolute top-4 right-4 berry-dashboard-card p-3 rounded-xl border border-[var(--border-color)] text-xs space-y-1 z-20 min-w-[220px] min-w-0">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-1.5 font-bold text-[var(--text-main)]">
                  <span>{hoveredMonth.bulan_indo}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] ${
                      hoveredMonth.avg_capaian >= 100 ? 'bg-[var(--surface-accent)] text-[var(--accent-text)]' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {hoveredMonth.avg_capaian >= 100 ? 'Tercapai' : 'Belum Tercapai'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[var(--text-muted)]">Skor Capaian:</span>
                  <span className="font-bold text-[var(--bpjs-green)] font-mono">
                    {hoveredMonth.avg_capaian.toLocaleString('id-ID', { minimumFractionDigits: 1 })} poin
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Pengaduan Bln Ini:</span>
                  <span className="font-bold font-mono text-[var(--text-main)]">
                    {formatNumberID(hoveredMonth.total_pengaduan_bln)} kasus
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Sesuai SLA:</span>
                  <span className="font-bold font-mono text-[var(--bpjs-green)]">
                    {formatNumberID(hoveredMonth.total_ditindaklanjuti_sla)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">RS Tercapai (100):</span>
                  <span className="font-bold font-mono text-[var(--text-main)]">
                    {hoveredMonth.met_count} / {hoveredMonth.faskes_count} RS
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-44 flex items-center justify-center text-xs text-[var(--text-muted)]">
            Tidak ada data grafik untuk filter yang dipilih.
          </div>
        )}
      </MainCard>

      {/* 4. TABEL MATRIKS RINCI PENYELESAIAN PENGADUAN */}
      <MainCard content={false} className="berry-dashboard-card rounded-lg border border-[var(--border-color)] overflow-hidden min-w-0">
        {/* Table Top Controls */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface-subtle)]">
          <div>
            <Typography component="h4" variant="h5" className="text-xs sm:text-sm font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-navy)]" />
              Matriks Kepatuhan Penyelesaian Pengaduan FKRTL
            </Typography>
            <p className="text-[11px] text-[var(--text-muted)]">
              Daftar faskes rujukan lengkap dengan rincian pengaduan SLA dan capaian poin
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Status Badge */}
            <div className="flex items-center rounded-xl bg-[var(--surface)] p-1 border border-[var(--border-color)]">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-[var(--bpjs-navy)] text-[var(--on-primary)] shadow-sm'
                    : 'text-[var(--text-muted)]  hover:text-[var(--bpjs-navy)]'
                }`}
              >
                Semua ({apiData?.table_data.length || 0})
              </button>
              <button
                onClick={() => setStatusFilter('TERCAPAI')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'TERCAPAI'
                    ? 'bg-[var(--bpjs-green)] text-[var(--on-primary)] shadow-sm'
                    : 'text-[var(--text-muted)]  hover:text-[var(--accent-text)]'
                }`}
              >
                Tercapai ({totalTercapai})
              </button>
              <button
                onClick={() => setStatusFilter('BELUM_TERCAPAI')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'BELUM_TERCAPAI'
                    ? 'bg-amber-600 text-[var(--text-main)] shadow-sm'
                    : 'text-[var(--text-muted)]  hover:text-[var(--warning-text)]'
                }`}
              >
                Belum ({totalBelumTercapai})
              </button>
            </div>

            {/* Items Per Page */}
            <FilterSelect aria-label="Jumlah baris per halaman"
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="sapa-control rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer"
            >
              <FilterOption value={10} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">10 baris</FilterOption>
              <FilterOption value={15} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">15 baris</FilterOption>
              <FilterOption value={25} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">25 baris</FilterOption>
              <FilterOption value={50} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">50 baris</FilterOption>
            </FilterSelect>

            {/* Live Search */}
            <div className="relative min-w-[200px]">
              <input aria-label="Cari faskes/tipe..."
                type="text"
                placeholder="Cari faskes/tipe..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="sapa-control w-full rounded-xl pl-8 pr-3 py-1.5 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)]"
              />
              <svg
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="flex justify-end px-4 pb-3">
          <UnduhJpegKepatuhan tab="pengaduan" rows={processedTableRows} periode={selectedBulan} filter={[selectedKabupaten, selectedNamaPpk, selectedTipeFaskes]} pencarian={searchQuery} statusFilter={statusFilter} />
        </div>

        {/* Table Content */}
        <div aria-label="Area data yang dapat digulir" role="region" tabIndex={0} className="overflow-x-auto custom-scrollbar">
          <Table size="small" className="sapa-data-table sapa-table w-full text-left border-collapse text-xs">
            <TableHead className="bg-[var(--surface-subtle)] text-[var(--text-main)] uppercase text-[10.5px] font-bold tracking-wider border-b border-[var(--border-color)]">
              <TableRow>
                <TableCell className="py-3 px-3 text-center w-12">No</TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('nama_ppk')}
                  className="py-3 px-4 cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Nama Faskes</span>
                    {sortField === 'nama_ppk' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('tipe_faskes')}
                  className="py-3 px-3 cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Tipe Faskes</span>
                    {sortField === 'tipe_faskes' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('pengaduan_3bln')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="whitespace-normal break-words max-w-[130px] leading-tight">
                      pengaduan 3 bulan terakhir (termasuk bulan N)
                    </span>
                    {sortField === 'pengaduan_3bln' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('pengaduan_bln')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="whitespace-normal break-words max-w-[110px] leading-tight">
                      Jml Pengaduan Bln penilaian
                    </span>
                    {sortField === 'pengaduan_bln' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('ditindaklanjuti_sla')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="whitespace-normal break-words max-w-[130px] leading-tight">
                      Jml Pengaduan Ditindaklanjuti sesuai SLA
                    </span>
                    {sortField === 'ditindaklanjuti_sla' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('top10_thnlalu')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="whitespace-normal break-words max-w-[110px] leading-tight">
                      Jml Pengaduan Top 10 Tahun lalu
                    </span>
                    {sortField === 'top10_thnlalu' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('tidak_ditindaklanjuti')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="whitespace-normal break-words max-w-[120px] leading-tight">
                      Jml Pengaduan Tidak Ditindaklanjuti
                    </span>
                    {sortField === 'tidak_ditindaklanjuti' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('capaian')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Capaian</span>
                    {sortField === 'capaian' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center">Status</TableCell>
              </TableRow>
            </TableHead>

            <TableBody className="divide-y divide-[var(--border-color)]/20 font-medium">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-xs text-[var(--text-muted)]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[var(--border-color)] border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data kepatuhan penyelesaian pengaduan...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-xs text-[var(--text-muted)]">
                    Tidak ada data faskes yang cocok dengan filter atau pencarian.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row) => {
                  const isTercapai = row.capaian >= 100 || row.status === 'Tercapai';
                  return (
                    <TableRow
                      key={`${row.kode_ppk}-${row.bulan}-${row.no}`}
                      className="hover:bg-[var(--surface-accent)]/20 transition-colors group"
                    >
                      <TableCell className="py-2.5 px-3 text-center font-mono text-[var(--text-muted)]">
                        {row.no}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 font-bold text-[var(--text-main)]">
                        <div className="flex flex-col">
                          <span>{row.nama_ppk}</span>
                          <span className="text-[10px] font-normal text-[var(--text-muted)]">
                            {row.kabupaten} • {row.kode_ppk}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-[var(--text-muted)]">
                        <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[var(--surface-accent)]/50 text-[var(--text-main)] border border-[var(--border-color)]">
                          {row.tipe_faskes}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right font-mono text-[var(--text-muted)]">
                        {formatNumberID(row.pengaduan_3bln)}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text-main)]">
                        {formatNumberID(row.pengaduan_bln)}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right font-mono font-bold text-[var(--bpjs-green)]">
                        {formatNumberID(row.ditindaklanjuti_sla)}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right font-mono text-[var(--text-muted)]">
                        {formatNumberID(row.top10_thnlalu)}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right font-mono text-[var(--warning-text)]">
                        {formatNumberID(row.tidak_ditindaklanjuti)}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right font-mono font-semibold text-sm text-[var(--bpjs-green)]">
                        {row.capaian.toLocaleString('id-ID', { minimumFractionDigits: 1 })}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-center">
                        {isTercapai ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[var(--surface-accent)] text-[var(--bpjs-green)] border border-[var(--border-color)]">
                            <span></span>
                            <span>Tercapai</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <span></span>
                            <span>Belum Tercapai</span>
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Table Pagination */}
        <div className="p-4 border-t border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-[var(--text-muted)]">
            Menampilkan <span className="font-bold text-[var(--text-main)]">{processedTableRows.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> -{' '}
            <span className="font-bold text-[var(--text-main)]">
              {Math.min(currentPage * itemsPerPage, processedTableRows.length)}
            </span>{' '}
            dari <span className="font-bold text-[var(--text-main)]">{processedTableRows.length}</span> baris
          </div>

          <div className="flex items-center gap-1.5 self-center sm:self-auto">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-lg border border-[var(--border-color)] text-[var(--text-main)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-accent)]/40"
            >
              «
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded-lg border border-[var(--border-color)] text-[var(--text-main)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-accent)]/40"
            >
              ‹
            </button>
            <span className="px-3 py-1 font-bold text-[var(--text-main)]">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded-lg border border-[var(--border-color)] text-[var(--text-main)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-accent)]/40"
            >
              ›
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-lg border border-[var(--border-color)] text-[var(--text-main)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-accent)]/40"
            >
              »
            </button>
          </div>
        </div>
      </MainCard>
    </div>
  );
};
