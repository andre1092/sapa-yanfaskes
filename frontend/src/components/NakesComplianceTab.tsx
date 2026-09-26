import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/apiClient';

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

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Alert Error State if any */}
      {error && (
        <div className="glass-card rounded-2xl p-4 border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 font-bold transition-colors cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* 1. FILTER BAR 4 DIMENSI + SEARCH (KABUPATEN, NAMA FASKES, BULAN, TIPE FASKES) */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg relative overflow-hidden">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </span>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-[#f7fcfa] uppercase tracking-wider">
                  Filter Analisis Jadwal Praktek Nakes
                </h4>
                <p className="text-[11px] text-[#6573a1] dark:text-[#afbade]">
                  Pilih parameter Kabupaten, Nama Faskes, Bulan, dan Tipe Faskes untuk memfilter data real-time
                </p>
              </div>
            </div>

            <button
              onClick={handleResetFilters}
              className="self-start sm:self-center px-3 py-1.5 rounded-xl text-xs font-bold text-[#2b4390] dark:text-white hover:bg-[#d4ecd1]/40 dark:hover:bg-slate-800 border border-[#afbade]/40 dark:border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
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
              <label className="text-[11px] font-bold text-[#2b4390] dark:text-slate-300 flex items-center gap-1">
                <span>📍 Kabupaten</span>
              </label>
              <select
                value={selectedKabupaten}
                onChange={(e) => handleKabupatenChange(e.target.value)}
                className="glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer shadow-sm"
              >
                {filterOptions.kabupaten.map((kab) => (
                  <option key={kab} value={kab} className="bg-slate-900 text-white">
                    {kab}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Nama Faskes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[#2b4390] dark:text-slate-300 flex items-center gap-1">
                <span>🏥 Nama Faskes (FKRTL)</span>
              </label>
              <select
                value={selectedNamaPpk}
                onChange={(e) => setSelectedNamaPpk(e.target.value)}
                className="glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer shadow-sm truncate"
              >
                {filterOptions.nama_ppk.map((faskes) => (
                  <option key={faskes} value={faskes} className="bg-slate-900 text-white">
                    {faskes}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Bulan */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[#2b4390] dark:text-slate-300 flex items-center gap-1">
                <span>🗓️ Bulan</span>
              </label>
              <select
                value={selectedBulan}
                onChange={(e) => setSelectedBulan(e.target.value)}
                className="glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer shadow-sm"
              >
                {filterOptions.bulan.map((bln) => (
                  <option key={bln} value={bln} className="bg-slate-900 text-white">
                    {bln}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Tipe Faskes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[#2b4390] dark:text-slate-300 flex items-center gap-1">
                <span>🏷️ Tipe Faskes</span>
              </label>
              <select
                value={selectedTipeFaskes}
                onChange={(e) => handleTipeFaskesChange(e.target.value)}
                className="glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer shadow-sm"
              >
                {filterOptions.tipe_faskes.map((tipe) => (
                  <option key={tipe} value={tipe} className="bg-slate-900 text-white">
                    {tipe}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 2. KARTU KPI UTAMA (PERSEN SESUAI, CAPAIAN BOBOT 25%, TOTAL KUNJUNGAN, STATUS TERCAPAI) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: PERSEN SESUAI */}
        <div className="glass-card rounded-2xl p-5 border border-[#83a67e]/40 dark:border-emerald-500/20 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">
              Persen Sesuai
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300">
              Target 100%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#2b4390] dark:text-[#f7fcfa] font-mono tracking-tight">
              {formatPercentID(kpi.avg_persen_sesuai)}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                kpi.avg_persen_sesuai >= 100
                  ? 'bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300'
              }`}
            >
              {kpi.avg_persen_sesuai >= 100 ? 'Tercapai' : 'Belum Tercapai'}
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Tertimbang (Sesuai/Total)</span>
            <span className="font-bold font-mono text-[#2b4390] dark:text-white">
              {formatPercentID(kpi.weighted_persen_sesuai)}
            </span>
          </div>
        </div>

        {/* KPI 2: CAPAIAN (BOBOT 25%) */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/40 dark:border-blue-500/20 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">
              Capaian
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#afbade]/30 text-[#2b4390] dark:bg-blue-500/20 dark:text-sky-300">
              Bobot {kpi.bobot_persen}%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#44853b] dark:text-emerald-400 font-mono tracking-tight">
              {kpi.avg_capaian.toFixed(1)}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400 font-semibold">
              poin dari skala 100
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Kontribusi Nilai Riil</span>
            <span className="font-bold font-mono text-[#44853b] dark:text-emerald-300">
              {((kpi.avg_capaian * kpi.bobot_persen) / 100).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* KPI 3: TOTAL KUNJUNGAN & DOKTER SESUAI */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/40 dark:border-white/10 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">
              Kunjungan Nakes
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#afbade]/20 text-[#2b4390] dark:bg-slate-800 dark:text-slate-300">
              Total Log
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#2b4390] dark:text-sky-300 font-mono tracking-tight">
              {formatNumberID(kpi.total_kunjungan)}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400 font-semibold">
              kunjungan
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Sesuai / Tidak Sesuai</span>
            <span className="font-bold font-mono text-[#2b4390] dark:text-white">
              {formatNumberID(kpi.total_sesuai)} / {formatNumberID(kpi.total_tidak_sesuai)}
            </span>
          </div>
        </div>

        {/* KPI 4: STATUS TERCAPAI RS */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/40 dark:border-white/10 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">
              Status Kepatuhan RS
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#afbade]/20 text-[#2b4390] dark:bg-slate-800 dark:text-slate-300">
              Nilai 100 = Tercapai
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#44853b] dark:text-emerald-400 font-mono tracking-tight">
              {totalTercapai}
            </span>
            <span className="text-xs text-[#44853b] dark:text-emerald-400 font-semibold">
              RS Tercapai (100)
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Belum Tercapai (&lt; 100)</span>
            <span className="font-bold font-mono text-amber-600 dark:text-amber-400">
              {totalBelumTercapai} RS
            </span>
          </div>
        </div>
      </div>

      {/* 3. DUA LINE CHART TERPISAH (KANAN DAN KIRI) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LINE CHART KIRI: PERSEN SESUAI (%) */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2b4390] shadow-sm shadow-[#2b4390]/50" />
                Grafik Bulanan: Persen Sesuai (%)
              </h3>
              <p className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-0.5">
                Tren rata-rata kesesuaian jadwal praktek nakes (Januari - September 2026)
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#2b4390] border-2 border-white shadow-sm" />
                <span className="text-[#2b4390] dark:text-[#afbade]">Persen Sesuai</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-amber-500 border-t border-dashed border-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 text-[11px]">Target 100%</span>
              </div>
            </div>
          </div>

          {/* SVG Left Chart */}
          <div className="relative w-full h-64 select-none">
            {monthlyChart.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-[#6573a1] dark:text-slate-400 italic">
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
                        <stop offset="0%" stopColor="#2b4390" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#2b4390" stopOpacity="0.0" />
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
                            stroke="#afbade"
                            strokeOpacity={tick === 100 ? '0.4' : '0.15'}
                            strokeDasharray={tick === 100 ? '4 3' : undefined}
                            strokeWidth={tick === 100 ? '1.5' : '1'}
                          />
                          <text
                            x={paddingLeft - 6}
                            y={y + 3.5}
                            textAnchor="end"
                            fontSize="9.5"
                            className="font-mono fill-[#6573a1] dark:fill-slate-400 font-medium"
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
                      stroke="#d97706"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />

                    {/* Area & Line */}
                    <path d={areaPersen} fill="url(#leftPersenGrad)" />
                    <path
                      d={pathPersen}
                      fill="none"
                      stroke="#2b4390"
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
                            fill="#2b4390"
                            stroke="#ffffff"
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
                                ? 'fill-[#2b4390] dark:fill-white font-black'
                                : 'fill-[#6573a1] dark:fill-slate-400 group-hover:fill-[#2b4390] dark:group-hover:fill-white'
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
              <div className="absolute top-2 right-2 glass-card p-2.5 rounded-xl border border-[#2b4390]/30 shadow-lg pointer-events-none text-xs z-20 min-w-[170px] animate-fadeIn">
                <div className="font-bold text-[#2b4390] dark:text-white border-b border-[#afbade]/30 pb-1 mb-1 flex items-center justify-between">
                  <span>{hoveredMonthPersen.bulan_indo}</span>
                  <span className="text-[10px] px-1 py-0.2 rounded bg-[#afbade]/20 text-[#2b4390] dark:text-slate-300">
                    {hoveredMonthPersen.faskes_count} RS
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#6573a1] dark:text-slate-400">Persen Sesuai:</span>
                  <span className="font-mono font-bold text-[#2b4390] dark:text-sky-300">
                    {formatPercentID(hoveredMonthPersen.avg_persen_sesuai)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#6573a1] dark:text-slate-400">Dokter Sesuai:</span>
                  <span className="font-mono text-[#44853b] dark:text-emerald-300">
                    {formatNumberID(hoveredMonthPersen.total_sesuai)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LINE CHART KANAN: CAPAIAN (POIN) */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#44853b] dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#44853b] shadow-sm shadow-[#44853b]/50" />
                Grafik Bulanan: Capaian (Poin)
              </h3>
              <p className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-0.5">
                Tren rata-rata skor capaian kepatuhan faskes (Bobot 25%)
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#44853b] border-2 border-white shadow-sm" />
                <span className="text-[#44853b] dark:text-emerald-400">Capaian</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-amber-500 border-t border-dashed border-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 text-[11px]">Target 100 Poin</span>
              </div>
            </div>
          </div>

          {/* SVG Right Chart */}
          <div className="relative w-full h-64 select-none">
            {monthlyChart.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-[#6573a1] dark:text-slate-400 italic">
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
                        <stop offset="0%" stopColor="#44853b" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#44853b" stopOpacity="0.0" />
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
                            stroke="#83a67e"
                            strokeOpacity={tick === 100 ? '0.4' : '0.15'}
                            strokeDasharray={tick === 100 ? '4 3' : undefined}
                            strokeWidth={tick === 100 ? '1.5' : '1'}
                          />
                          <text
                            x={paddingLeft - 6}
                            y={y + 3.5}
                            textAnchor="end"
                            fontSize="9.5"
                            className="font-mono fill-[#6573a1] dark:fill-slate-400 font-medium"
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
                      stroke="#d97706"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />

                    {/* Area & Line */}
                    <path d={areaCapaian} fill="url(#rightCapaianGrad)" />
                    <path
                      d={pathCapaian}
                      fill="none"
                      stroke="#44853b"
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
                            fill="#44853b"
                            stroke="#ffffff"
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
                                ? 'fill-[#44853b] dark:fill-emerald-400 font-black'
                                : 'fill-[#6573a1] dark:fill-slate-400 group-hover:fill-[#44853b] dark:group-hover:fill-emerald-400'
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
              <div className="absolute top-2 right-2 glass-card p-2.5 rounded-xl border border-[#44853b]/30 shadow-lg pointer-events-none text-xs z-20 min-w-[170px] animate-fadeIn">
                <div className="font-bold text-[#44853b] dark:text-emerald-400 border-b border-[#83a67e]/30 pb-1 mb-1 flex items-center justify-between">
                  <span>{hoveredMonthCapaian.bulan_indo}</span>
                  <span className="text-[10px] px-1 py-0.2 rounded bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300">
                    {hoveredMonthCapaian.faskes_count} RS
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#6573a1] dark:text-slate-400">Skor Capaian:</span>
                  <span className="font-mono font-bold text-[#44853b] dark:text-emerald-300">
                    {hoveredMonthCapaian.avg_capaian.toFixed(1)} poin
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#6573a1] dark:text-slate-400">Kontribusi Bobot:</span>
                  <span className="font-mono text-[#2b4390] dark:text-white">
                    {((hoveredMonthCapaian.avg_capaian * 25) / 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. TABEL MATRIKS KEPATUHAN DETAIL (NAMA FASKES, TIPE FASKES, TOTAL KUNJUNGAN, TIDAK SESUAI, SESUAI, PERSEN SESUAI, CAPAIAN, STATUS) */}
      <div className="glass-card rounded-2xl shadow-xl border border-[#afbade]/30 dark:border-white/10 overflow-hidden">
        {/* Table Header Bar */}
        <div className="p-4 sm:p-5 border-b border-[#afbade]/30 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f0f7f4] dark:bg-slate-900/40">
          <div>
            <h3 className="text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#44853b] shadow-sm shadow-[#44853b]/50" />
              Tabel Matriks Kepatuhan Jadwal Praktek Nakes
            </h3>
            <p className="text-xs text-[#6573a1] dark:text-slate-400 mt-0.5">
              Menampilkan {processedTableRows.length} data fasilitas kesehatan terverifikasi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Status Kepatuhan: Tercapai / Belum Tercapai */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="glass-input rounded-xl px-3 py-1.5 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900 text-white">Semua Status</option>
                <option value="TERCAPAI" className="bg-slate-900 text-white">Tercapai (Nilai 100)</option>
                <option value="BELUM_TERCAPAI" className="bg-slate-900 text-white">Belum Tercapai (&lt; 100)</option>
              </select>
            </div>

            {/* Live Search */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Cari Nama Faskes / Tipe..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input w-full rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#2b4390] dark:text-white placeholder-[#6573a1] dark:placeholder-slate-500 bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
              />
              <svg className="w-3.5 h-3.5 text-[#6573a1] dark:text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#e6f2ed] dark:bg-slate-900/80 text-[#2b4390] dark:text-[#afbade] uppercase text-[10.5px] font-bold tracking-wider border-b border-[#afbade]/30 dark:border-slate-800">
              <tr>
                <th className="py-3 px-3.5 text-center w-12">No</th>
                <th
                  className="py-3 px-3.5 cursor-pointer hover:text-[#44853b] transition-colors"
                  onClick={() => handleSort('nama_ppk')}
                >
                  <div className="flex items-center gap-1">
                    <span>Nama Faskes</span>
                    {sortField === 'nama_ppk' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  className="py-3 px-3.5 cursor-pointer hover:text-[#44853b] transition-colors"
                  onClick={() => handleSort('tipe_faskes')}
                >
                  <div className="flex items-center gap-1">
                    <span>Tipe Faskes</span>
                    {sortField === 'tipe_faskes' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  className="py-3 px-3.5 text-center cursor-pointer hover:text-[#44853b] transition-colors"
                  onClick={() => handleSort('total_kunjungan')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Total Kunjungan</span>
                    {sortField === 'total_kunjungan' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  className="py-3 px-3.5 text-center cursor-pointer hover:text-[#44853b] transition-colors"
                  onClick={() => handleSort('tidak_sesuai')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Tidak Sesuai</span>
                    {sortField === 'tidak_sesuai' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  className="py-3 px-3.5 text-center cursor-pointer hover:text-[#44853b] transition-colors"
                  onClick={() => handleSort('sesuai')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Sesuai</span>
                    {sortField === 'sesuai' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  className="py-3 px-3.5 text-center cursor-pointer hover:text-[#44853b] transition-colors"
                  onClick={() => handleSort('persen_sesuai')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Persen Sesuai</span>
                    {sortField === 'persen_sesuai' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  className="py-3 px-3.5 text-center cursor-pointer hover:text-[#44853b] transition-colors"
                  onClick={() => handleSort('capaian')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Capaian</span>
                    {sortField === 'capaian' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th className="py-3 px-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#afbade]/20 dark:divide-slate-800/60 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#6573a1] dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#44853b] border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data live Jadwal Praktek Nakes...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#6573a1] dark:text-slate-400 italic">
                    Tidak ada data fasilitas kesehatan yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, idx) => {
                  const isTercapai = row.capaian >= 100 || row.persen_sesuai >= 100 || row.status === 'Tercapai';
                  const rowNumber = (currentPage - 1) * itemsPerPage + idx + 1;

                  return (
                    <tr
                      key={`${row.kode_ppk}-${row.bulan}-${idx}`}
                      className="hover:bg-[#d4ecd1]/20 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-3 px-3.5 text-center text-[#6573a1] dark:text-slate-500 font-mono text-[11px]">
                        {rowNumber}
                      </td>
                      <td className="py-3 px-3.5 font-bold text-[#2b4390] dark:text-white group-hover:text-[#44853b] dark:group-hover:text-emerald-300 transition-colors">
                        {row.nama_ppk}
                      </td>
                      <td className="py-3 px-3.5">
                        <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#d4ecd1]/50 text-[#2b4390] dark:bg-slate-800 dark:text-slate-300 border border-[#afbade]/30 dark:border-white/5">
                          {row.tipe_faskes}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-center font-mono font-bold text-[#2b4390] dark:text-slate-200">
                        {formatNumberID(row.total_kunjungan)}
                      </td>
                      <td className="py-3 px-3.5 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                        {formatNumberID(row.tidak_sesuai)}
                      </td>
                      <td className="py-3 px-3.5 text-center font-mono font-bold text-[#44853b] dark:text-emerald-400">
                        {formatNumberID(row.sesuai)}
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-[#afbade]/20 dark:bg-slate-800 rounded-full h-2 overflow-hidden border border-[#afbade]/30 dark:border-white/5">
                            <div
                              style={{ width: `${Math.min(row.persen_sesuai, 100)}%` }}
                              className={`h-full rounded-full transition-all duration-500 ${
                                isTercapai
                                  ? 'bg-gradient-to-r from-[#44853b] to-[#83a67e]'
                                  : 'bg-gradient-to-r from-amber-500 to-rose-400'
                              }`}
                            />
                          </div>
                          <span className="font-mono font-bold text-[#2b4390] dark:text-white text-[11px] w-12 text-right">
                            {formatPercentID(row.persen_sesuai)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <span
                          className={`font-mono font-bold px-2.5 py-0.5 rounded-md text-[11px] ${
                            row.capaian >= 100
                              ? 'bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300'
                              : row.capaian >= 50
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-sky-300'
                              : row.capaian > 0
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {row.capaian}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        {isTercapai ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30">
                            ✓ Tercapai
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30">
                            ⚠ Belum Tercapai
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-[#afbade]/30 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#6573a1] dark:text-slate-400">
            <span>Baris per halaman:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="glass-input rounded-lg px-2 py-1 text-xs text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              Menampilkan {processedTableRows.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -{' '}
              {Math.min(currentPage * itemsPerPage, processedTableRows.length)} dari {processedTableRows.length} baris
            </span>
          </div>

          <div className="flex items-center gap-1.5 self-center sm:self-auto">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-lg border border-[#afbade]/40 dark:border-white/10 text-[#2b4390] dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d4ecd1]/40 dark:hover:bg-slate-800"
            >
              «
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded-lg border border-[#afbade]/40 dark:border-white/10 text-[#2b4390] dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d4ecd1]/40 dark:hover:bg-slate-800"
            >
              Sebelumnya
            </button>
            <span className="px-3 py-1 font-mono font-bold text-[#2b4390] dark:text-white">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 rounded-lg border border-[#afbade]/40 dark:border-white/10 text-[#2b4390] dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d4ecd1]/40 dark:hover:bg-slate-800"
            >
              Selanjutnya
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded-lg border border-[#afbade]/40 dark:border-white/10 text-[#2b4390] dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d4ecd1]/40 dark:hover:bg-slate-800"
            >
              »
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
