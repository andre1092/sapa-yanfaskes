import { Typography } from '@mui/material';
import MainCard from '../berry/MainCard';
import { Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import '../berry/berry-dashboards.css';
import { FilterSelect, FilterOption } from './ui/FilterSelect';
import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/apiClient';
import { UnduhJpegKepatuhan } from './UnduhJpegKepatuhan';

export interface NakesKpiData {
  avg_persen_sesuai: number;
  weighted_persen_sesuai: number;
  avg_capaian: number;
  bobot_persen: number;
  target_persen: number;
  total_faskes: number;
  total_kunjungan: number;
  total_sesuai: number;
  total_tidak_sesuai: number;
  total_met: number;
  total_unmet: number;
  total_tercapai?: number;
  total_belum_tercapai?: number;
  total_records: number;
}

export interface NakesMonthlyChartItem {
  bulan: string;
  bulan_indo: string;
  short_name: string;
  avg_persen_sesuai: number;
  weighted_persen_sesuai: number;
  avg_capaian: number;
  total_kunjungan: number;
  total_sesuai: number;
  faskes_count: number;
  met_count: number;
  is_selected?: boolean;
}

export interface NakesTableRow {
  no: number;
  kode_ppk: string;
  nama_ppk: string;
  kabupaten: string;
  tipe_faskes: string;
  kelas_ppk: string;
  bulan: string;
  bulan_indo: string;
  total_kunjungan: number;
  tidak_sesuai: number;
  sesuai: number;
  persen_sesuai: number;
  capaian: number;
  capaian_nilai: number;
  is_met: boolean;
  status?: string;
}

export interface NakesFilterOptions {
  kabupaten: string[];
  nama_ppk: string[];
  bulan: string[];
  tipe_faskes: string[];
}

export interface NakesApiResponse {
  status: string;
  kpi: NakesKpiData;
  monthly_chart: NakesMonthlyChartItem[];
  table_data: NakesTableRow[];
  filter_options: NakesFilterOptions;
  active_filters: {
    kabupaten: string;
    nama_ppk: string;
    bulan: string;
    tipe_faskes: string;
  };
}

export const NakesComplianceTab: React.FC = () => {
  // Filter states
  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('Semua Kabupaten');
  const [selectedNamaPpk, setSelectedNamaPpk] = useState<string>('Semua Faskes');
  const [selectedBulan, setSelectedBulan] = useState<string>('September 2026');
  const [selectedTipeFaskes, setSelectedTipeFaskes] = useState<string>('Semua Tipe Faskes');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'TERCAPAI' | 'BELUM_TERCAPAI'>('ALL');

  // Chart hover state for left and right charts
  const [hoveredMonthPersen, setHoveredMonthPersen] = useState<NakesMonthlyChartItem | null>(null);
  const [hoveredMonthCapaian, setHoveredMonthCapaian] = useState<NakesMonthlyChartItem | null>(null);

  // Pagination & Sorting state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  const [sortField, setSortField] = useState<keyof NakesTableRow>('persen_sesuai');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Data fetching state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [apiData, setApiData] = useState<NakesApiResponse | null>(null);

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

      const res = await apiClient.get<NakesApiResponse>(`/api/v1/fkrtl-kepatuhan/nakes?${params.toString()}`);
      if (res.data && res.data.status === 'success') {
        setApiData(res.data);
      } else {
        throw new Error('Format data tidak sesuai');
      }
    } catch (err: any) {
      console.warn('Gagal memuat live data nakes dari backend:', err);
      setError('Gagal menghubungkan ke server, memuat data lokal...');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedKabupaten, selectedNamaPpk, selectedBulan, selectedTipeFaskes]);

  // Handlers for Cascading Filters (Dependent Dropdowns)
  const handleKabupatenChange = (newKab: string) => {
    setSelectedKabupaten(newKab);
    // Otomatis reset faskes dan tipe faskes saat kabupaten berganti agar tidak ada faskes luar kabupaten
    setSelectedNamaPpk('Semua Faskes');
    setSelectedTipeFaskes('Semua Tipe Faskes');
  };

  const handleTipeFaskesChange = (newTipe: string) => {
    setSelectedTipeFaskes(newTipe);
    // Otomatis reset faskes saat tipe faskes berganti
    setSelectedNamaPpk('Semua Faskes');
  };

  // Sinkronisasi otomatis jika nilai terpilih tidak ada dalam opsi API yang dikembalikan
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
      rows = rows.filter((r) => r.capaian >= 100 || r.persen_sesuai >= 100 || r.status === 'Tercapai');
    } else if (statusFilter === 'BELUM_TERCAPAI') {
      rows = rows.filter((r) => r.capaian < 100 && r.persen_sesuai < 100);
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

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
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

  const handleSort = (field: keyof NakesTableRow) => {
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

  const formatPercentID = (val: number): string => {
    return val.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  };

  const kpi = apiData?.kpi || {
    avg_persen_sesuai: 0,
    weighted_persen_sesuai: 0,
    avg_capaian: 0,
    bobot_persen: 25,
    target_persen: 100,
    total_faskes: 0,
    total_kunjungan: 0,
    total_sesuai: 0,
    total_tidak_sesuai: 0,
    total_met: 0,
    total_unmet: 0,
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

  const totalTercapai = kpi.total_tercapai ?? kpi.total_met ?? 0;
  const totalBelumTercapai = kpi.total_belum_tercapai ?? kpi.total_unmet ?? kpi.total_records;

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

      {/* 1. KARTU KPI UTAMA (PERSEN SESUAI, CAPAIAN BOBOT 25%, TOTAL KUNJUNGAN, STATUS TERCAPAI) */}
      <div className="sapa-kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: PERSEN SESUAI */}
        <MainCard content={false} className="sapa-kpi-lead sapa-metric berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Persen Sesuai
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--surface-accent)] text-[var(--bpjs-green)]">
              Target 100%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--text-main)] font-mono tracking-tight">
              {formatPercentID(kpi.avg_persen_sesuai)}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                kpi.avg_persen_sesuai >= 100
                  ? 'bg-[var(--surface-accent)] text-[var(--accent-text)] border border-[var(--border-color)]/40  '
                  : 'bg-amber-100 text-amber-800 border border-amber-300  '
              }`}
            >
              {kpi.avg_persen_sesuai >= 100 ? 'Tercapai' : 'Belum Tercapai'}
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Tertimbang (Sesuai/Total)</span>
            <span className="font-bold font-mono text-[var(--text-main)]">
              {formatPercentID(kpi.weighted_persen_sesuai)}
            </span>
          </div>
        </MainCard>

        {/* KPI 2: CAPAIAN (BOBOT 25%) */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Capaian
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--border-color)]/30 text-[var(--text-main)]">
              Bobot {kpi.bobot_persen}%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--bpjs-green)] font-mono tracking-tight">
              {kpi.avg_capaian.toFixed(1)}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-semibold">
              poin dari skala 100
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Kontribusi Nilai Riil</span>
            <span className="font-bold font-mono text-[var(--bpjs-green)]">
              {((kpi.avg_capaian * kpi.bobot_persen) / 100).toFixed(2)}%
            </span>
          </div>
        </MainCard>

        {/* KPI 3: TOTAL KUNJUNGAN & DOKTER SESUAI */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Kunjungan Nakes
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--border-color)]/20 text-[var(--text-main)]">
              Total Log
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--text-main)] font-mono tracking-tight">
              {formatNumberID(kpi.total_kunjungan)}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-semibold">
              kunjungan
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Sesuai / Tidak Sesuai</span>
            <span className="font-bold font-mono text-[var(--text-main)]">
              {formatNumberID(kpi.total_sesuai)} / {formatNumberID(kpi.total_tidak_sesuai)}
            </span>
          </div>
        </MainCard>

        {/* KPI 4: STATUS TERCAPAI RS */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Status Kepatuhan RS
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--border-color)]/20 text-[var(--text-main)]">
              Nilai 100 = Tercapai
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--bpjs-green)] font-mono tracking-tight">
              {totalTercapai}
            </span>
            <span className="text-xs text-[var(--bpjs-green)] font-semibold">
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

      {/* 2. FILTER BAR 4 DIMENSI + SEARCH (KABUPATEN, NAMA FASKES, BULAN, TIPE FASKES) */}
      <MainCard content={false} className="berry-dashboard-card rounded-lg p-4 sm:p-5 border border-[var(--border-color)] relative overflow-hidden min-w-0">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[var(--surface-accent)] text-[var(--bpjs-green)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </span>
              <div>
                <Typography component="h4" variant="h5" className="text-xs sm:text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">
                  Filter Analisis Jadwal Praktek Nakes
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
              <label htmlFor="NakesComplianceTab-filter-1" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Kabupaten</span>
              </label>
              <FilterSelect aria-label="Kabupaten" id="NakesComplianceTab-filter-1"
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

            {/* Filter Nama Faskes */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="NakesComplianceTab-filter-2" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Nama Faskes (FKRTL)</span>
              </label>
              <FilterSelect aria-label="Fasilitas kesehatan" id="NakesComplianceTab-filter-2"
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
              <label htmlFor="NakesComplianceTab-filter-3" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Bulan</span>
              </label>
              <FilterSelect aria-label="Bulan" id="NakesComplianceTab-filter-3"
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

            {/* Filter Tipe Faskes */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="NakesComplianceTab-filter-4" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Tipe Faskes</span>
              </label>
              <FilterSelect aria-label="Jenis fasilitas kesehatan" id="NakesComplianceTab-filter-4"
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

      {/* 3. DUA LINE CHART TERPISAH (KANAN DAN KIRI) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LINE CHART KIRI: PERSEN SESUAI (%) */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden flex flex-col justify-between min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[var(--border-color)]">
            <div>
              <Typography component="h3" variant="h5" className="sapa-section-heading text-xs sm:text-sm font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-navy)]" />
                Grafik Bulanan: Persen Sesuai (%)
              </Typography>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Tren rata-rata kesesuaian jadwal praktek nakes (Januari - September 2026)
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[var(--bpjs-navy)] border-2 border-white" />
                <span className="text-[var(--text-main)]">Persen Sesuai</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-amber-500 border-t border-dashed border-amber-500" />
                <span className="text-[var(--warning-text)] text-[11px]">Target 100%</span>
              </div>
            </div>
          </div>

          {/* SVG Left Chart */}
          <div className="relative w-full h-64 select-none">
            {monthlyChart.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-[var(--text-muted)] italic">
                Tidak ada data bulanan.
              </div>
            ) : (
              (() => {
                const width = 500;
                const height = 240;
                const paddingLeft = 45;
                const paddingRight = 20;
                const paddingTop = 20;
                const paddingBottom = 35;
                const chartWidth = width - paddingLeft - paddingRight;
                const chartHeight = height - paddingTop - paddingBottom;

                const n = monthlyChart.length;
                const xStep = n > 1 ? chartWidth / (n - 1) : chartWidth;

                const getX = (index: number) => paddingLeft + index * xStep;
                const getY = (val: number) => paddingTop + chartHeight - (Math.min(Math.max(val, 0), 100) / 100) * chartHeight;

                const pathPersen = monthlyChart
                  .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.avg_persen_sesuai)}`)
                  .join(' ');

                const areaPersen = `${pathPersen} L ${getX(n - 1)} ${paddingTop + chartHeight} L ${getX(0)} ${paddingTop + chartHeight} Z`;
                const yTarget100 = getY(100);

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="leftPersenGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--bpjs-navy)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="var(--bpjs-navy)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid */}
                    {[0, 25, 50, 75, 100].map((tick) => {
                      const y = getY(tick);
                      return (
                        <g key={tick}>
                          <line
                            x1={paddingLeft}
                            y1={y}
                            x2={width - paddingRight}
                            y2={y}
                            stroke="var(--border-color)"
                            strokeOpacity={tick === 100 ? '0.4' : '0.15'}
                            strokeDasharray={tick === 100 ? '4 3' : undefined}
                            strokeWidth={tick === 100 ? '1.5' : '1'}
                          />
                          <text
                            x={paddingLeft - 6}
                            y={y + 3.5}
                            textAnchor="end"
                            fontSize="9.5"
                            className="font-mono fill-[var(--text-muted)] font-medium"
                          >
                            {tick}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Target 100% Line */}
                    <line
                      x1={paddingLeft}
                      y1={yTarget100}
                      x2={width - paddingRight}
                      y2={yTarget100}
                      stroke="var(--warning)"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />

                    {/* Area & Line */}
                    <path d={areaPersen} fill="url(#leftPersenGrad)" />
                    <path
                      d={pathPersen}
                      fill="none"
                      stroke="var(--bpjs-navy)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Points */}
                    {monthlyChart.map((d, i) => {
                      const cx = getX(i);
                      const cy = getY(d.avg_persen_sesuai);
                      const isSelected = selectedBulan === d.bulan || selectedBulan === d.bulan_indo;

                      return (
                        <g
                          key={d.bulan}
                          className="cursor-pointer group"
                          onMouseEnter={() => setHoveredMonthPersen(d)}
                          onMouseLeave={() => setHoveredMonthPersen(null)}
                          onClick={() => setSelectedBulan(selectedBulan === d.bulan ? 'Semua Bulan' : d.bulan)}
                        >
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isSelected ? 6 : 4}
                            fill="var(--bpjs-navy)"
                            stroke="var(--surface)"
                            strokeWidth="2"
                            className="transition-transform duration-200 group-hover:scale-125"
                          />
                          <text
                            x={cx}
                            y={paddingTop + chartHeight + 18}
                            textAnchor="middle"
                            fontSize="9.5"
                            className={`font-semibold transition-colors ${
                              isSelected
                                ? 'fill-[var(--bpjs-navy)]  font-black'
                                : 'fill-[var(--text-muted)]  group-hover:fill-[var(--bpjs-navy)] '
                            }`}
                          >
                            {d.short_name}
                          </text>
                          <rect
                            x={cx - xStep / 2}
                            y={paddingTop}
                            width={xStep}
                            height={chartHeight + paddingBottom}
                            fill="transparent"
                          />
                        </g>
                      );
                    })}
                  </svg>
                );
              })()
            )}

            {/* Hover Tooltip Left Chart */}
            {hoveredMonthPersen && (
              <div className="absolute top-2 right-2 berry-dashboard-card p-2.5 rounded-xl border border-[var(--border-color)] pointer-events-none text-xs z-20 min-w-[170px] min-w-0">
                <div className="font-bold text-[var(--text-main)] border-b border-[var(--border-color)] pb-1 mb-1 flex items-center justify-between">
                  <span>{hoveredMonthPersen.bulan_indo}</span>
                  <span className="text-[10px] px-1 py-0.2 rounded bg-[var(--border-color)]/20 text-[var(--text-main)]">
                    {hoveredMonthPersen.faskes_count} RS
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Persen Sesuai:</span>
                  <span className="font-mono font-bold text-[var(--text-main)]">
                    {formatPercentID(hoveredMonthPersen.avg_persen_sesuai)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Dokter Sesuai:</span>
                  <span className="font-mono text-[var(--bpjs-green)]">
                    {formatNumberID(hoveredMonthPersen.total_sesuai)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </MainCard>

        {/* LINE CHART KANAN: CAPAIAN (POIN) */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden flex flex-col justify-between min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[var(--border-color)]">
            <div>
              <Typography component="h3" variant="h5" className="sapa-section-heading text-xs sm:text-sm font-bold text-[var(--bpjs-green)] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-green)]" />
                Grafik Bulanan: Capaian (Poin)
              </Typography>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Tren rata-rata skor capaian kepatuhan faskes (Bobot 25%)
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[var(--bpjs-green)] border-2 border-white" />
                <span className="text-[var(--bpjs-green)]">Capaian</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-amber-500 border-t border-dashed border-amber-500" />
                <span className="text-[var(--warning-text)] text-[11px]">Target 100 Poin</span>
              </div>
            </div>
          </div>

          {/* SVG Right Chart */}
          <div className="relative w-full h-64 select-none">
            {monthlyChart.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-[var(--text-muted)] italic">
                Tidak ada data bulanan.
              </div>
            ) : (
              (() => {
                const width = 500;
                const height = 240;
                const paddingLeft = 45;
                const paddingRight = 20;
                const paddingTop = 20;
                const paddingBottom = 35;
                const chartWidth = width - paddingLeft - paddingRight;
                const chartHeight = height - paddingTop - paddingBottom;

                const n = monthlyChart.length;
                const xStep = n > 1 ? chartWidth / (n - 1) : chartWidth;

                const getX = (index: number) => paddingLeft + index * xStep;
                const getY = (val: number) => paddingTop + chartHeight - (Math.min(Math.max(val, 0), 100) / 100) * chartHeight;

                const pathCapaian = monthlyChart
                  .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.avg_capaian)}`)
                  .join(' ');

                const areaCapaian = `${pathCapaian} L ${getX(n - 1)} ${paddingTop + chartHeight} L ${getX(0)} ${paddingTop + chartHeight} Z`;
                const yTarget100 = getY(100);

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="rightCapaianGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--bpjs-green)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="var(--bpjs-green)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid */}
                    {[0, 25, 50, 75, 100].map((tick) => {
                      const y = getY(tick);
                      return (
                        <g key={tick}>
                          <line
                            x1={paddingLeft}
                            y1={y}
                            x2={width - paddingRight}
                            y2={y}
                            stroke="var(--border-color)"
                            strokeOpacity={tick === 100 ? '0.4' : '0.15'}
                            strokeDasharray={tick === 100 ? '4 3' : undefined}
                            strokeWidth={tick === 100 ? '1.5' : '1'}
                          />
                          <text
                            x={paddingLeft - 6}
                            y={y + 3.5}
                            textAnchor="end"
                            fontSize="9.5"
                            className="font-mono fill-[var(--text-muted)] font-medium"
                          >
                            {tick}
                          </text>
                        </g>
                      );
                    })}

                    {/* Target 100 Poin Line */}
                    <line
                      x1={paddingLeft}
                      y1={yTarget100}
                      x2={width - paddingRight}
                      y2={yTarget100}
                      stroke="var(--warning)"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />

                    {/* Area & Line */}
                    <path d={areaCapaian} fill="url(#rightCapaianGrad)" />
                    <path
                      d={pathCapaian}
                      fill="none"
                      stroke="var(--bpjs-green)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Points */}
                    {monthlyChart.map((d, i) => {
                      const cx = getX(i);
                      const cy = getY(d.avg_capaian);
                      const isSelected = selectedBulan === d.bulan || selectedBulan === d.bulan_indo;

                      return (
                        <g
                          key={d.bulan}
                          className="cursor-pointer group"
                          onMouseEnter={() => setHoveredMonthCapaian(d)}
                          onMouseLeave={() => setHoveredMonthCapaian(null)}
                          onClick={() => setSelectedBulan(selectedBulan === d.bulan ? 'Semua Bulan' : d.bulan)}
                        >
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isSelected ? 6 : 4}
                            fill="var(--bpjs-green)"
                            stroke="var(--surface)"
                            strokeWidth="2"
                            className="transition-transform duration-200 group-hover:scale-125"
                          />
                          <text
                            x={cx}
                            y={paddingTop + chartHeight + 18}
                            textAnchor="middle"
                            fontSize="9.5"
                            className={`font-semibold transition-colors ${
                              isSelected
                                ? 'fill-[var(--bpjs-green)]  font-black'
                                : 'fill-[var(--text-muted)]  group-hover:fill-[var(--bpjs-green)] '
                            }`}
                          >
                            {d.short_name}
                          </text>
                          <rect
                            x={cx - xStep / 2}
                            y={paddingTop}
                            width={xStep}
                            height={chartHeight + paddingBottom}
                            fill="transparent"
                          />
                        </g>
                      );
                    })}
                  </svg>
                );
              })()
            )}

            {/* Hover Tooltip Right Chart */}
            {hoveredMonthCapaian && (
              <div className="absolute top-2 right-2 berry-dashboard-card p-2.5 rounded-xl border border-[var(--border-color)] pointer-events-none text-xs z-20 min-w-[170px] min-w-0">
                <div className="font-bold text-[var(--bpjs-green)] border-b border-[var(--border-color)] pb-1 mb-1 flex items-center justify-between">
                  <span>{hoveredMonthCapaian.bulan_indo}</span>
                  <span className="text-[10px] px-1 py-0.2 rounded bg-[var(--surface-accent)] text-[var(--bpjs-green)]">
                    {hoveredMonthCapaian.faskes_count} RS
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Skor Capaian:</span>
                  <span className="font-mono font-bold text-[var(--bpjs-green)]">
                    {hoveredMonthCapaian.avg_capaian.toFixed(1)} poin
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Kontribusi Bobot:</span>
                  <span className="font-mono text-[var(--text-main)]">
                    {((hoveredMonthCapaian.avg_capaian * 25) / 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </MainCard>
      </div>

      {/* 4. TABEL MATRIKS KEPATUHAN DETAIL (NAMA FASKES, TIPE FASKES, TOTAL KUNJUNGAN, TIDAK SESUAI, SESUAI, PERSEN SESUAI, CAPAIAN, STATUS) */}
      <MainCard content={false} className="berry-dashboard-card rounded-lg border border-[var(--border-color)] overflow-hidden min-w-0">
        {/* Table Header Bar */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface-subtle)]">
          <div>
            <Typography component="h3" variant="h5" className="sapa-section-heading text-sm font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-green)]" />
              Tabel Matriks Kepatuhan Jadwal Praktek Nakes
            </Typography>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Menampilkan {processedTableRows.length} data fasilitas kesehatan terverifikasi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Status Kepatuhan: Tercapai / Belum Tercapai */}
            <div className="flex items-center gap-2">
              <label htmlFor="NakesComplianceTab-filter-5" className="text-xs font-bold text-[var(--text-main)]">Status:</label>
              <FilterSelect aria-label="Status capaian" id="NakesComplianceTab-filter-5"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="sapa-control rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer"
              >
                <FilterOption value="ALL" className="bg-[var(--surface-subtle)] text-[var(--text-main)]">Semua Status</FilterOption>
                <FilterOption value="TERCAPAI" className="bg-[var(--surface-subtle)] text-[var(--text-main)]">Tercapai (Nilai 100)</FilterOption>
                <FilterOption value="BELUM_TERCAPAI" className="bg-[var(--surface-subtle)] text-[var(--text-main)]">Belum Tercapai (&lt; 100)</FilterOption>
              </FilterSelect>
            </div>

            {/* Live Search */}
            <div className="relative w-full sm:w-64">
              <input aria-label="Cari Nama Faskes / Tipe..."
                type="text"
                placeholder="Cari Nama Faskes / Tipe..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="sapa-control w-full rounded-xl sapa-control--search pr-3 py-1.5 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)]"
              />
              <svg className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="flex justify-end px-4 pb-3">
          <UnduhJpegKepatuhan tab="nakes" rows={processedTableRows} periode={selectedBulan} filter={[selectedKabupaten, selectedNamaPpk, selectedTipeFaskes]} pencarian={searchQuery} statusFilter={statusFilter} />
        </div>

        {/* Table Content */}
        <div aria-label="Area data yang dapat digulir" role="region" tabIndex={0} className="overflow-x-auto custom-scrollbar">
          <Table size="small" className="sapa-data-table sapa-table w-full text-left text-xs">
              <caption className="sr-only">Rincian kepatuhan fasilitas kesehatan sesuai filter dan periode yang dipilih</caption>
            <TableHead className="bg-[var(--surface-subtle)] text-[var(--text-main)] uppercase text-[10.5px] font-bold tracking-wider border-b border-[var(--border-color)]">
              <TableRow>
                <TableCell className="py-3 px-3.5 text-center w-12">No</TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  className="py-3 px-3.5 cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                  onClick={() => handleSort('nama_ppk')}
                >
                  <div className="flex items-center gap-1">
                    <span>Nama Faskes</span>
                    {sortField === 'nama_ppk' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  className="py-3 px-3.5 cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                  onClick={() => handleSort('tipe_faskes')}
                >
                  <div className="flex items-center gap-1">
                    <span>Tipe Faskes</span>
                    {sortField === 'tipe_faskes' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  className="py-3 px-3.5 text-center cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                  onClick={() => handleSort('total_kunjungan')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Total Kunjungan</span>
                    {sortField === 'total_kunjungan' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  className="py-3 px-3.5 text-center cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                  onClick={() => handleSort('tidak_sesuai')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Tidak Sesuai</span>
                    {sortField === 'tidak_sesuai' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  className="py-3 px-3.5 text-center cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                  onClick={() => handleSort('sesuai')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Sesuai</span>
                    {sortField === 'sesuai' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  className="py-3 px-3.5 text-center cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                  onClick={() => handleSort('persen_sesuai')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Persen Sesuai</span>
                    {sortField === 'persen_sesuai' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  className="py-3 px-3.5 text-center cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                  onClick={() => handleSort('capaian')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Capaian</span>
                    {sortField === 'capaian' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3.5 text-center">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-[var(--border-color)]/20 font-medium">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-[var(--text-muted)]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[var(--border-color)] border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data live Jadwal Praktek Nakes...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-[var(--text-muted)] italic">
                    Tidak ada data fasilitas kesehatan yang sesuai dengan filter.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row, idx) => {
                  const isTercapai = row.capaian >= 100 || row.persen_sesuai >= 100 || row.status === 'Tercapai';
                  const rowNumber = (currentPage - 1) * itemsPerPage + idx + 1;

                  return (
                    <TableRow
                      key={`${row.kode_ppk}-${row.bulan}-${idx}`}
                      className="hover:bg-[var(--surface-accent)]/20 transition-colors group"
                    >
                      <TableCell className="py-3 px-3.5 text-center text-[var(--text-muted)] font-mono text-[11px]">
                        {rowNumber}
                      </TableCell>
                      <TableCell className="py-3 px-3.5 font-bold text-[var(--text-main)] group-hover:text-[var(--bpjs-green)] transition-colors">
                        {row.nama_ppk}
                      </TableCell>
                      <TableCell className="py-3 px-3.5">
                        <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[var(--surface-accent)]/50 text-[var(--text-main)] border border-[var(--border-color)]">
                          {row.tipe_faskes}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-3.5 text-center font-mono font-bold text-[var(--text-main)]">
                        {formatNumberID(row.total_kunjungan)}
                      </TableCell>
                      <TableCell className="py-3 px-3.5 text-center font-mono font-bold text-[var(--warning-text)]">
                        {formatNumberID(row.tidak_sesuai)}
                      </TableCell>
                      <TableCell className="py-3 px-3.5 text-center font-mono font-bold text-[var(--bpjs-green)]">
                        {formatNumberID(row.sesuai)}
                      </TableCell>
                      <TableCell className="py-3 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-[var(--border-color)]/20 rounded-full h-2 overflow-hidden border border-[var(--border-color)]">
                            <div
                              style={{ width: `${Math.min(row.persen_sesuai, 100)}%` }}
                              className={`h-full rounded-full transition-all duration-500 ${
                                isTercapai
                                  ? 'bg-[var(--bpjs-green)]'
                                  : 'bg-amber-500'
                              }`}
                            />
                          </div>
                          <span className="font-mono font-bold text-[var(--text-main)] text-[11px] w-12 text-right">
                            {formatPercentID(row.persen_sesuai)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3.5 text-center">
                        <span
                          className={`font-mono font-bold px-2.5 py-0.5 rounded-md text-[11px] ${
                            row.capaian >= 100
                              ? 'bg-[var(--surface-accent)] text-[var(--accent-text)]  '
                              : row.capaian >= 50
                              ? 'bg-blue-100 text-blue-800  '
                              : row.capaian > 0
                              ? 'bg-amber-100 text-amber-800  '
                              : 'bg-[var(--surface-subtle)] text-slate-600  '
                          }`}
                        >
                          {row.capaian}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-3.5 text-center">
                        {isTercapai ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[var(--surface-accent)] text-[var(--bpjs-green)] border border-[var(--border-color)]">
                             Tercapai
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                             Belum Tercapai
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

        {/* Pagination Bar */}
        <div className="p-4 border-t border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <span>Baris per halaman:</span>
            <FilterSelect aria-label="Jumlah baris per halaman"
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="sapa-control shrink-0 rounded-lg px-2 py-1 text-xs text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)]"
            >
              <FilterOption value={10}>10</FilterOption>
              <FilterOption value={15}>15</FilterOption>
              <FilterOption value={25}>25</FilterOption>
              <FilterOption value={50}>50</FilterOption>
              <FilterOption value={100}>100</FilterOption>
            </FilterSelect>
            <span>
              Menampilkan {processedTableRows.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -{' '}
              {Math.min(currentPage * itemsPerPage, processedTableRows.length)} dari {processedTableRows.length} baris
            </span>
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
              Sebelumnya
            </button>
            <span className="px-3 py-1 font-mono font-bold text-[var(--text-main)]">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 rounded-lg border border-[var(--border-color)] text-[var(--text-main)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-accent)]/40"
            >
              Selanjutnya
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
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
