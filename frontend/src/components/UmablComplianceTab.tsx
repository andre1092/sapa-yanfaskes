import { Typography } from '@mui/material';
import MainCard from '../berry/MainCard';
import { Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import '../berry/berry-dashboards.css';
import { FilterSelect, FilterOption } from './ui/FilterSelect';
import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/apiClient';
import { UnduhJpegKepatuhan } from './UnduhJpegKepatuhan';

export interface UmablKpiData {
  avg_persen_target: number;
  avg_capaian: number;
  bobot_persen: number;
  kontribusi_capaian: number;
  target_persen: number;
  total_faskes: number;
  total_kunjungan: number;
  total_responden: number;
  total_target: number;
  total_tercapai: number;
  total_belum_tercapai: number;
  total_records: number;
}

export interface UmablMonthlyChartItem {
  bulan: string;
  bulan_indo: string;
  short_name: string;
  avg_persen_target: number;
  avg_capaian: number;
  total_kunjungan: number;
  total_responden: number;
  total_target: number;
  faskes_count: number;
  met_count: number;
  is_selected?: boolean;
}

export interface UmablTableRow {
  no: number;
  kode_ppk: string;
  nama_ppk: string;
  tipe_faskes: string;
  kabupaten: string;
  kelas_ppk: string;
  bulan: string;
  bulan_indo: string;
  kunjungan: number;
  responden: number;
  target: number;
  persen_responden_target: number;
  capaian: number;
  is_met: boolean;
  status?: string;
}

export interface UmablFilterOptions {
  kabupaten: string[];
  nama_ppk: string[];
  bulan: string[];
  tipe_faskes: string[];
}

export interface UmablApiResponse {
  status: string;
  kpi: UmablKpiData;
  monthly_chart: UmablMonthlyChartItem[];
  table_data: UmablTableRow[];
  filter_options: UmablFilterOptions;
  active_filters: {
    kabupaten: string;
    nama_ppk: string;
    bulan: string;
    tipe_faskes: string;
  };
}

// Standar Target Responden KESSAN Berdasarkan Jumlah Kunjungan
const KESSAN_TARGET_STANDARDS = [
  { populasi: '30 - 100', target: 30 },
  { populasi: '101 - 200', target: 80 },
  { populasi: '201 - 500', target: 132 },
  { populasi: '501 - 1.000', target: 217 },
  { populasi: '1.001 - 5.000', target: 278 },
  { populasi: '5.001 - 10.000', target: 357 },
  { populasi: '10.001 - 50.000', target: 370 },
  { populasi: '50.001 - 100.000', target: 381 },
  { populasi: '> 100.000', target: 384 },
];

export const UmablComplianceTab: React.FC = () => {
  // Filter states (Default Bulan: September 2026)
  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('Semua Kabupaten');
  const [selectedNamaPpk, setSelectedNamaPpk] = useState<string>('Semua Faskes');
  const [selectedBulan, setSelectedBulan] = useState<string>('September 2026');
  const [selectedTipeFaskes, setSelectedTipeFaskes] = useState<string>('Semua Tipe Faskes');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'TERCAPAI' | 'BELUM_TERCAPAI'>('ALL');

  // Chart hover state for left and right charts
  const [hoveredMonthPersen, setHoveredMonthPersen] = useState<UmablMonthlyChartItem | null>(null);
  const [hoveredMonthCapaian, setHoveredMonthCapaian] = useState<UmablMonthlyChartItem | null>(null);

  // Pagination & Sorting state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  const [sortField, setSortField] = useState<keyof UmablTableRow>('persen_responden_target');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Data fetching state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [apiData, setApiData] = useState<UmablApiResponse | null>(null);

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

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await apiClient.get<UmablApiResponse>(`/api/v1/fkrtl-kepatuhan/umabl${queryString}`);

      if (response && response.data && response.data.status === 'success') {
        setApiData(response.data);
      } else {
        setError('Gagal memuat data kepatuhan umpan balik peserta.');
      }
    } catch (err: any) {
      console.error('Error fetching Umabl Compliance data:', err);
      setError(err?.response?.data?.detail || err?.message || 'Terjadi kesalahan saat memuat data dari server.');
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
    setSelectedNamaPpk('Semua Faskes');
    setSelectedTipeFaskes('Semua Tipe Faskes');
  };

  const handleTipeFaskesChange = (newTipe: string) => {
    setSelectedTipeFaskes(newTipe);
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

  // Sorting Handler
  const handleSort = (field: keyof UmablTableRow) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Format Helper
  const formatPercentID = (val: number | undefined): string => {
    if (val === undefined || isNaN(val)) return '0,0%';
    return val.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  };

  const formatNumberID = (val: number | undefined): string => {
    if (val === undefined || isNaN(val)) return '0';
    return val.toLocaleString('id-ID');
  };

  // Processed table rows (filter status, search query, sorting)
  const processedTableRows = useMemo(() => {
    if (!apiData?.table_data) return [];
    let rows = [...apiData.table_data];

    // Status filter: Tercapai (capaian >= 100) vs Belum Tercapai (capaian < 100)
    if (statusFilter === 'TERCAPAI') {
      rows = rows.filter((r) => r.capaian >= 100 || r.persen_responden_target >= 100 || r.status === 'Tercapai');
    } else if (statusFilter === 'BELUM_TERCAPAI') {
      rows = rows.filter((r) => r.capaian < 100 && r.persen_responden_target < 100);
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

  const kpi = apiData?.kpi || {
    avg_persen_target: 0,
    avg_capaian: 0,
    bobot_persen: 10,
    kontribusi_capaian: 0,
    target_persen: 100,
    total_faskes: 0,
    total_kunjungan: 0,
    total_responden: 0,
    total_target: 0,
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
  const totalBelumTercapai = kpi.total_belum_tercapai ?? (kpi.total_faskes - totalTercapai);

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
      
        <button type="button" className="sapa-button sapa-button-secondary" onClick={() => {
          setSelectedKabupaten('Semua Kabupaten');
          setSelectedNamaPpk('Semua Faskes');
          setSelectedTipeFaskes('Semua Tipe Faskes');
          setSelectedBulan('September 2026');
          setStatusFilter('ALL');
          setSearchQuery('');
          setCurrentPage(1);
        }}>Reset filter</button>
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

      {/* 1. KARTU KPI UTAMA (PERSEN TARGET, CAPAIAN BOBOT 10%, TOTAL KUNJUNGAN & RESPONDEN, STATUS PATUH) */}
      <div className="sapa-kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: % JLH RESPONDEN TARGET */}
        <MainCard content={false} className="sapa-kpi-lead berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              % Jlh Responden Target
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--surface-accent)] text-[var(--bpjs-green)]">
              Target &ge; 100%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--text-main)] font-mono tracking-tight">
              {formatPercentID(kpi.avg_persen_target)}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                kpi.avg_persen_target >= 100
                  ? 'bg-[var(--surface-accent)] text-[var(--accent-text)] border border-[var(--border-color)]/40  '
                  : 'bg-amber-100 text-amber-800 border border-amber-300  '
              }`}
            >
              {kpi.avg_persen_target >= 100 ? 'Tercapai' : 'Belum Tercapai'}
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Total Responden / Target</span>
            <span className="font-bold font-mono text-[var(--text-main)]">
              {formatNumberID(kpi.total_responden)} / {formatNumberID(kpi.total_target)}
            </span>
          </div>
        </MainCard>

        {/* KPI 2: CAPAIAN (BOBOT 10%) */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Rata-rata Capaian (Poin)
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--border-color)]/30 text-[var(--text-main)]">
              Bobot 10%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--bpjs-green)] font-mono tracking-tight">
              {kpi.avg_capaian.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-semibold">
              dari 100 poin
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Kontribusi Nilai Mutu</span>
            <span className="font-bold font-mono text-[var(--bpjs-green)]">
              +{formatPercentID(kpi.kontribusi_capaian)}
            </span>
          </div>
        </MainCard>

        {/* KPI 3: TOTAL KUNJUNGAN POPULASI */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden group min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Total Kunjungan Populasi
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--surface-accent)]/60 text-[var(--text-main)]">
              {kpi.total_faskes} FKRTL
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-semibold text-[var(--text-main)] font-mono tracking-tight">
              {formatNumberID(kpi.total_kunjungan)}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-semibold">
              pasien
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Sampling Responden</span>
            <span className="font-bold font-mono text-[var(--text-main)]">
              {formatNumberID(kpi.total_responden)} ulasan
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

      {/* 2. FILTER PANEL CASCADING (KABUPATEN, NAMA FASKES, BULAN, TIPE FASKES) */}
      <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] min-w-0">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[var(--bpjs-navy)]/10 text-[var(--text-main)] text-sm">

              </span>
              <Typography component="h3" variant="h5" className="sapa-section-heading text-xs sm:text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">
                Filter Parameter Kepatuhan Umpan Balik Peserta
              </Typography>
            </div>
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Otomatis tersinkronisasi dengan Master FKRTL
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Filter Kabupaten */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="UmablComplianceTab-filter-1" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Kabupaten</span>
              </label>
              <FilterSelect aria-label="Kabupaten" id="UmablComplianceTab-filter-1"
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
              <label htmlFor="UmablComplianceTab-filter-2" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Nama Faskes (FKRTL)</span>
              </label>
              <FilterSelect aria-label="Fasilitas kesehatan" id="UmablComplianceTab-filter-2"
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
              <label htmlFor="UmablComplianceTab-filter-3" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Bulan</span>
              </label>
              <FilterSelect aria-label="Bulan" id="UmablComplianceTab-filter-3"
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
              <label htmlFor="UmablComplianceTab-filter-4" className="text-[11px] font-bold text-[var(--text-main)] flex items-center gap-1">
                <span> Tipe Faskes</span>
              </label>
              <FilterSelect aria-label="Jenis fasilitas kesehatan" id="UmablComplianceTab-filter-4"
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

      {/* 3. DUA LINE CHART BULANAN TERPISAH (KANAN DAN KIRI) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LINE CHART KIRI: % JLH RESPONDEN TARGET (BIRU BPJS var(--bpjs-navy)) */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden flex flex-col justify-between min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[var(--border-color)]">
            <div>
              <Typography component="h3" variant="h5" className="sapa-section-heading text-xs sm:text-sm font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-navy)]" />
                Grafik Bulanan: % Jlh Responden Target
              </Typography>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Tren rata-rata persentase responden feedback terhadap target populasi
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[var(--bpjs-navy)] border-2 border-white" />
                <span className="text-[var(--text-main)]">% Responden Target</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-amber-500 border-t border-dashed border-amber-500" />
                <span className="text-[var(--warning-text)] text-[11px]">Target &ge; 100%</span>
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
                const height = 220;
                const padding = { top: 25, right: 30, bottom: 35, left: 45 };
                const innerWidth = width - padding.left - padding.right;
                const innerHeight = height - padding.top - padding.bottom;

                // Max percent scale (at least 150% or maximum observed value)
                const maxPct = Math.max(150, ...monthlyChart.map((d) => d.avg_persen_target)) * 1.1;

                const getX = (idx: number) => {
                  if (monthlyChart.length <= 1) return padding.left + innerWidth / 2;
                  return padding.left + (idx / (monthlyChart.length - 1)) * innerWidth;
                };

                const getY = (val: number) => {
                  const clamped = Math.max(0, Math.min(val, maxPct));
                  return padding.top + innerHeight - (clamped / maxPct) * innerHeight;
                };

                const targetY = getY(100);

                const points = monthlyChart.map((d, i) => `${getX(i)},${getY(d.avg_persen_target)}`).join(' ');
                const areaPath = `${points} ${getX(monthlyChart.length - 1)},${padding.top + innerHeight} ${getX(0)},${padding.top + innerHeight}`;

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="blueGradientUmabl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--bpjs-navy)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="var(--bpjs-navy)" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid lines */}
                    {[0, 50, 100, Math.round(maxPct)].map((tick) => {
                      const y = getY(tick);
                      return (
                        <g key={tick}>
                          <line
                            x1={padding.left}
                            y1={y}
                            x2={width - padding.right}
                            y2={y}
                            stroke="currentColor"
                            className="text-[var(--border-color)]/20"
                            strokeWidth="1"
                          />
                          <text
                            x={padding.left - 6}
                            y={y + 3}
                            textAnchor="end"
                            fontSize="9"
                            fill="currentColor"
                            className="text-[var(--text-muted)] font-mono"
                          >
                            {tick}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Target Line 100% */}
                    <line
                      x1={padding.left}
                      y1={targetY}
                      x2={width - padding.right}
                      y2={targetY}
                      stroke="var(--warning)"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />

                    {/* Area Fill */}
                    <polygon points={areaPath} fill="url(#blueGradientUmabl)" />

                    {/* Line Path */}
                    <polyline
                      fill="none"
                      stroke="var(--bpjs-navy)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points}
                    />

                    {/* Data Points */}
                    {monthlyChart.map((d, i) => {
                      const cx = getX(i);
                      const cy = getY(d.avg_persen_target);
                      const isHovered = hoveredMonthPersen?.bulan === d.bulan;
                      return (
                        <g key={d.bulan}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isHovered ? 6 : 4}
                            fill="var(--bpjs-navy)"
                            stroke="var(--surface)"
                            strokeWidth="2"
                            className="cursor-pointer transition-all duration-200"
                            onMouseEnter={() => setHoveredMonthPersen(d)}
                            onMouseLeave={() => setHoveredMonthPersen(null)}
                          />
                          {/* X-axis Month Label */}
                          <text
                            x={cx}
                            y={padding.top + innerHeight + 16}
                            textAnchor="middle"
                            fontSize="9.5"
                            fill="currentColor"
                            className={`font-semibold transition-colors ${
                              isHovered
                                ? 'text-[var(--bpjs-navy)]  font-bold'
                                : 'text-[var(--text-muted)] '
                            }`}
                          >
                            {d.short_name}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()
            )}

            {/* Hover Tooltip Left */}
            {hoveredMonthPersen && (
              <div className="absolute top-2 right-2 pointer-events-none berry-dashboard-card rounded-xl px-3 py-2 border border-[var(--border-color)] text-[11px] space-y-1 z-20 min-w-0">
                <div className="font-bold text-[var(--text-main)] border-b border-[var(--border-color)] pb-0.5">
                  {hoveredMonthPersen.bulan_indo}
                </div>
                <div className="flex items-center justify-between gap-3 text-[var(--text-muted)]">
                  <span>% Responden Target:</span>
                  <span className="font-mono font-bold text-[var(--text-main)]">
                    {formatPercentID(hoveredMonthPersen.avg_persen_target)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[var(--text-muted)]">
                  <span>Responden / Target:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatNumberID(hoveredMonthPersen.total_responden)} / {formatNumberID(hoveredMonthPersen.total_target)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </MainCard>

        {/* LINE CHART KANAN: CAPAIAN (POIN) (HIJAU BPJS var(--bpjs-green)) */}
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] relative overflow-hidden flex flex-col justify-between min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[var(--border-color)]">
            <div>
              <Typography component="h3" variant="h5" className="sapa-section-heading text-xs sm:text-sm font-bold text-[var(--bpjs-green)] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-green)]" />
                Grafik Bulanan: Capaian (Poin)
              </Typography>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Tren rata-rata skor capaian poin KESSAN (Bobot 10%)
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[var(--bpjs-green)] border-2 border-white" />
                <span className="text-[var(--bpjs-green)]">Capaian</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-[var(--bpjs-green)] border-t border-dashed border-[var(--border-color)]" />
                <span className="text-[var(--bpjs-green)] text-[11px]">Target 100 Poin</span>
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
                const height = 220;
                const padding = { top: 25, right: 30, bottom: 35, left: 45 };
                const innerWidth = width - padding.left - padding.right;
                const innerHeight = height - padding.top - padding.bottom;
                const maxScore = 100;

                const getX = (idx: number) => {
                  if (monthlyChart.length <= 1) return padding.left + innerWidth / 2;
                  return padding.left + (idx / (monthlyChart.length - 1)) * innerWidth;
                };

                const getY = (val: number) => {
                  const clamped = Math.max(0, Math.min(val, maxScore));
                  return padding.top + innerHeight - (clamped / maxScore) * innerHeight;
                };

                const targetY = getY(100);

                const points = monthlyChart.map((d, i) => `${getX(i)},${getY(d.avg_capaian)}`).join(' ');
                const areaPath = `${points} ${getX(monthlyChart.length - 1)},${padding.top + innerHeight} ${getX(0)},${padding.top + innerHeight}`;

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="greenGradientUmabl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--bpjs-green)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="var(--bpjs-green)" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid lines */}
                    {[0, 25, 50, 75, 100].map((tick) => {
                      const y = getY(tick);
                      return (
                        <g key={tick}>
                          <line
                            x1={padding.left}
                            y1={y}
                            x2={width - padding.right}
                            y2={y}
                            stroke="currentColor"
                            className="text-[var(--border-color)]/20"
                            strokeWidth="1"
                          />
                          <text
                            x={padding.left - 6}
                            y={y + 3}
                            textAnchor="end"
                            fontSize="9"
                            fill="currentColor"
                            className="text-[var(--text-muted)] font-mono"
                          >
                            {tick}
                          </text>
                        </g>
                      );
                    })}

                    {/* Target Line 100 Poin */}
                    <line
                      x1={padding.left}
                      y1={targetY}
                      x2={width - padding.right}
                      y2={targetY}
                      stroke="var(--bpjs-green)"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />

                    {/* Area Fill */}
                    <polygon points={areaPath} fill="url(#greenGradientUmabl)" />

                    {/* Line Path */}
                    <polyline
                      fill="none"
                      stroke="var(--bpjs-green)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points}
                    />

                    {/* Data Points */}
                    {monthlyChart.map((d, i) => {
                      const cx = getX(i);
                      const cy = getY(d.avg_capaian);
                      const isHovered = hoveredMonthCapaian?.bulan === d.bulan;
                      return (
                        <g key={d.bulan}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isHovered ? 6 : 4}
                            fill="var(--bpjs-green)"
                            stroke="var(--surface)"
                            strokeWidth="2"
                            className="cursor-pointer transition-all duration-200"
                            onMouseEnter={() => setHoveredMonthCapaian(d)}
                            onMouseLeave={() => setHoveredMonthCapaian(null)}
                          />
                          {/* X-axis Month Label */}
                          <text
                            x={cx}
                            y={padding.top + innerHeight + 16}
                            textAnchor="middle"
                            fontSize="9.5"
                            fill="currentColor"
                            className={`font-semibold transition-colors ${
                              isHovered
                                ? 'text-[var(--accent-text)]  font-bold'
                                : 'text-[var(--text-muted)] '
                            }`}
                          >
                            {d.short_name}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()
            )}

            {/* Hover Tooltip Right */}
            {hoveredMonthCapaian && (
              <div className="absolute top-2 right-2 pointer-events-none berry-dashboard-card rounded-xl px-3 py-2 border border-[var(--border-color)] text-[11px] space-y-1 z-20 min-w-0">
                <div className="font-bold text-[var(--bpjs-green)] border-b border-[var(--border-color)] pb-0.5">
                  {hoveredMonthCapaian.bulan_indo}
                </div>
                <div className="flex items-center justify-between gap-3 text-[var(--text-muted)]">
                  <span>Rata-rata Capaian:</span>
                  <span className="font-mono font-bold text-[var(--bpjs-green)]">
                    {hoveredMonthCapaian.avg_capaian.toLocaleString('id-ID', { minimumFractionDigits: 1 })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[var(--text-muted)]">
                  <span>RS Tercapai (&ge; 100):</span>
                  <span className="font-mono font-semibold text-emerald-600">
                    {hoveredMonthCapaian.met_count} / {hoveredMonthCapaian.faskes_count} RS
                  </span>
                </div>
              </div>
            )}
          </div>
        </MainCard>
      </div>

      {/* 4. DAFTAR STANDAR PEDOMAN TARGET RESPONDEN KESSAN & CONTOH ULASAN KESSAN (SESUAI GAMBAR) */}
      <MainCard content={false} className="berry-dashboard-card rounded-lg p-6 border border-[var(--border-color)] relative overflow-hidden min-w-0">
        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
          {/* Kolom Kiri: Tabel Standar Target KESSAN */}
          <div className="w-full md:w-3/5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-[var(--bpjs-green)]/10 text-[var(--bpjs-green)] text-lg">

              </span>
              <div>
                <Typography component="h3" variant="h5" className="sapa-section-heading text-base sm:text-lg font-semibold text-[var(--text-main)] tracking-tight">
                  Target Responden KESSAN
                </Typography>
                <p className="text-xs text-[var(--text-muted)]">
                  Target responden KESSAN ditentukan berdasarkan jumlah kunjungan yakni:
                </p>
              </div>
            </div>

            <div aria-label="Area data yang dapat digulir" role="region" tabIndex={0} className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
              <Table size="small" className="sapa-data-table sapa-table w-full text-xs text-left">
              <caption className="sr-only">Rincian kepatuhan fasilitas kesehatan sesuai filter dan periode yang dipilih</caption>
                <TableHead className="bg-[var(--bpjs-navy)] text-[var(--on-primary)] font-bold uppercase tracking-wider text-[11px]">
                  <TableRow>
                    <TableCell className="py-2.5 px-4 text-left">Jumlah Kunjungan (Populasi)</TableCell>
                    <TableCell className="py-2.5 px-4 text-center">Jumlah Responden (Target)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody className="divide-y divide-[var(--border-color)]/20 font-medium">
                  {KESSAN_TARGET_STANDARDS.map((std, idx) => (
                    <TableRow
                      key={std.populasi}
                      className={
                        idx % 2 === 0
                          ? 'bg-[var(--surface)]  hover:bg-[var(--surface-accent)]/20 transition-colors'
                          : 'bg-[var(--surface)]  hover:bg-[var(--surface-accent)]/20 transition-colors'
                      }
                    >
                      <TableCell className="py-2 px-4 font-mono font-semibold text-[var(--text-main)]">
                        {std.populasi}
                      </TableCell>
                      <TableCell className="py-2 px-4 text-center font-mono font-bold text-[var(--bpjs-green)]">
                        {std.target.toLocaleString('id-ID')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="text-[11px] text-[var(--text-muted)] leading-relaxed bg-[var(--surface-subtle)] p-3 rounded-xl border border-[var(--border-color)]">
              <span className="font-bold text-[var(--text-main)]"> Pedoman Penilaian:</span> Capaian dihitung berdasarkan persentase responden feedback terhadap target yang ditentukan: 100% dari target = 100, 75% dari target = 75, 50% dari target = 50, 25% dari target = 25, dan &lt; 25% dari target = 0.
            </div>
          </div>

          {/* Kolom Kanan: Visual Mockup Contoh Ulasan KESSAN ala Aplikasi BPJS */}
          <div className="w-full md:w-2/5 flex flex-col items-center justify-center">
            <div className="w-full max-w-[320px] rounded-lg p-4 text-[var(--text-main)] border-4 border-slate-700 relative">
              {/* Phone Speaker Notch */}
              <div className="w-16 h-1 bg-[var(--surface)] rounded-full mx-auto mb-3" />

              <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs font-semibold">
                <span className="flex items-center gap-1">
                  <span>←</span> <span>Ulasan</span>
                </span>
                <span className="text-[10px] bg-[var(--surface)] px-2 py-0.5 rounded-full">KESSAN</span>
              </div>

              {/* Summary Rating */}
              <div className="mt-3 p-3 rounded-lg bg-[var(--surface)] flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-semibold font-mono text-[var(--warning-text)]">5.0</span>
                    <span className="text-[var(--warning-text)] text-xs"></span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] block">Rating Kepuasan Pasien</span>
                </div>
                <div className="text-right text-[10px] text-[var(--text-muted)]">
                  <span className="font-bold text-[var(--text-main)] block">Rawat Jalan & Inap</span>
                  <span>Feedback Real-Time</span>
                </div>
              </div>

              {/* Sample Review Bubbles */}
              <div className="mt-3 space-y-2 text-[10.5px]">
                <div className="p-2.5 rounded-xl bg-[var(--surface)] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--bpjs-navy)]">Azka Giovanny</span>
                    <span className="text-[var(--warning-text)] font-mono text-[10px]"> 5.0</span>
                  </div>
                  <p className="text-[var(--text-muted)] leading-tight">
                    "Pelayanan dokter sangat ramah, penjelasan obat jelas dan ruang tunggu nyaman."
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-[var(--surface)] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--bpjs-navy)]">Desi Kartika</span>
                    <span className="text-[var(--warning-text)] font-mono text-[10px]"> 5.0</span>
                  </div>
                  <p className="text-[var(--text-muted)] leading-tight">
                    "Waktu tunggu cepat sejak antrean online dan nakes melayani dengan prima."
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-white/10 text-center">
                <span className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-widest">
                  BPJS Kesehatan • Feedback Peserta
                </span>
              </div>
            </div>
          </div>
        </div>
      </MainCard>

      {/* 5. TABEL MATRIKS KEPATUHAN FASKES (TANPA DUPLIKAT FASKES) */}
      <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] space-y-4 min-w-0">
        {/* Table Top Controls: Search, Status Filter, Items per Page */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[var(--bpjs-navy)]/10 text-[var(--text-main)] text-sm">

            </span>
            <div>
              <Typography component="h3" variant="h5" className="sapa-section-heading text-xs sm:text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">
                Matriks Kepatuhan Umpan Balik Peserta
              </Typography>
              <p className="text-[11px] text-[var(--text-muted)]">
                Menampilkan {processedTableRows.length} faskes unik tanpa duplikasi
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <input aria-label="Cari faskes..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari faskes..."
                className="sapa-control pl-8 pr-3 py-1.5 rounded-xl text-xs text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] w-40 sm:w-56"
              />
              <span className="absolute left-2.5 top-2 text-xs text-[var(--text-muted)]"></span>
            </div>

            {/* Status Filter Toggle */}
            <div className="flex items-center p-1 rounded-xl bg-[var(--border-color)]/20 text-xs">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-[var(--bpjs-navy)] text-[var(--on-primary)] shadow-sm'
                    : 'text-[var(--text-muted)]  hover:text-[var(--bpjs-navy)]'
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => setStatusFilter('TERCAPAI')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  statusFilter === 'TERCAPAI'
                    ? 'bg-[var(--bpjs-green)] text-[var(--on-primary)] shadow-sm'
                    : 'text-[var(--text-muted)]  hover:text-[var(--accent-text)]'
                }`}
              >
                Tercapai
              </button>
              <button
                onClick={() => setStatusFilter('BELUM_TERCAPAI')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  statusFilter === 'BELUM_TERCAPAI'
                    ? 'bg-amber-600 text-[var(--text-main)] shadow-sm'
                    : 'text-[var(--text-muted)]  hover:text-[var(--warning-text)]'
                }`}
              >
                Belum
              </button>
            </div>

            {/* Items Per Page Select */}
            <FilterSelect aria-label="Jumlah baris per halaman"
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="sapa-control px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)]"
            >
              <FilterOption value={10}>10 / hal</FilterOption>
              <FilterOption value={15}>15 / hal</FilterOption>
              <FilterOption value={25}>25 / hal</FilterOption>
              <FilterOption value={50}>50 / hal</FilterOption>
            </FilterSelect>
          </div>
        </div>

        <div className="flex justify-end px-4 pb-3">
          <UnduhJpegKepatuhan tab="umabl" rows={processedTableRows} periode={selectedBulan} filter={[selectedKabupaten, selectedNamaPpk, selectedTipeFaskes]} pencarian={searchQuery} statusFilter={statusFilter} />
        </div>

        {/* Table Content */}
        <div aria-label="Area data yang dapat digulir" role="region" tabIndex={0} className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
          <Table size="small" className="sapa-data-table sapa-table w-full text-xs text-left">
              <caption className="sr-only">Rincian kepatuhan fasilitas kesehatan sesuai filter dan periode yang dipilih</caption>
            <TableHead className="bg-[var(--bpjs-navy)]/10 text-[var(--text-main)] font-bold uppercase tracking-wider text-[11px] border-b border-[var(--border-color)]">
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
                  onClick={() => handleSort('kunjungan')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Jlh Kunjungan</span>
                    {sortField === 'kunjungan' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('responden')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Jlh Responden</span>
                    {sortField === 'responden' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('target')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Target</span>
                    {sortField === 'target' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </TableCell>
                <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => handleSort('persen_responden_target')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[var(--bpjs-green)] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>% Jlh Responden Target</span>
                    {sortField === 'persen_responden_target' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
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
                  <TableCell colSpan={9} className="py-12 text-center text-xs text-[var(--text-muted)]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[var(--border-color)] border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data pelaksanaan umpan balik peserta...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-xs text-[var(--text-muted)]">
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
                        {formatNumberID(row.kunjungan)}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text-main)]">
                        {formatNumberID(row.responden)}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right font-mono text-[var(--text-muted)]">
                        {formatNumberID(row.target)}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right font-mono font-bold text-[var(--bpjs-green)]">
                        {formatPercentID(row.persen_responden_target)}
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[var(--border-color)] text-xs text-[var(--text-muted)]">
          <div>
            Menampilkan baris{' '}
            <span className="font-bold text-[var(--text-main)]">
              {processedTableRows.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}
            </span>{' '}
            hingga{' '}
            <span className="font-bold text-[var(--text-main)]">
              {Math.min(currentPage * itemsPerPage, processedTableRows.length)}
            </span>{' '}
            dari <span className="font-bold text-[var(--text-main)]">{processedTableRows.length}</span> total faskes
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-accent)]/30 transition-colors"
            >
              ««
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-lg border border-[var(--border-color)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-accent)]/30 transition-colors"
            >
              «
            </button>
            <span className="px-3 py-1 font-bold font-mono text-[var(--text-main)]">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-lg border border-[var(--border-color)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-accent)]/30 transition-colors"
            >
              »
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-accent)]/30 transition-colors"
            >
              »»
            </button>
          </div>
        </div>
      </MainCard>
    </div>
  );
};
