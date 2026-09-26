import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/apiClient';

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

      {/* 1. FILTER BAR 4-DIMENSI CASCADING */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg relative overflow-hidden">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#2b4390]/10 dark:bg-[#afbade]/20 flex items-center justify-center text-[#2b4390] dark:text-[#afbade]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-[#f7fcfa] uppercase tracking-wider">
                  Filter Analisis Penyelesaian Pengaduan
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

            {/* Filter Nama Faskes (Dependen) */}
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

            {/* Filter Tipe Faskes (Dependen) */}
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

      {/* 2. KARTU KPI UTAMA (CAPAIAN, KONTRIBUSI BOBOT 20%, TOTAL PENGADUAN, STATUS KEPATUHAN) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: RATA-RATA CAPAIAN */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-black text-[#6573a1] dark:text-[#afbade] tracking-wider">
              Capaian (Poin)
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300">
              Target 100 Poin
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#2b4390] dark:text-[#f7fcfa] font-mono tracking-tight">
              {kpi.avg_capaian.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                kpi.avg_capaian >= 100
                  ? 'bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300'
              }`}
            >
              {kpi.avg_capaian >= 100 ? 'Tercapai' : 'Belum Tercapai'}
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Skor Rata-Rata FKRTL</span>
            <span className="font-bold font-mono text-[#2b4390] dark:text-white">
              Skala 0 - 100
            </span>
          </div>
        </div>

        {/* KPI 2: KONTRIBUSI NILAI RIIL (BOBOT 20%) */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-black text-[#6573a1] dark:text-[#afbade] tracking-wider">
              Kontribusi Bobot
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#afbade]/30 text-[#2b4390] dark:bg-blue-500/20 dark:text-sky-300">
              Bobot 20%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#44853b] dark:text-emerald-400 font-mono tracking-tight">
              {kpi.kontribusi_capaian.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-[#afbade] font-medium">
              poin dari skala 20
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Kontribusi Riil Mutu</span>
            <span className="font-bold font-mono text-[#44853b] dark:text-emerald-400">
              {kpi.kontribusi_capaian}%
            </span>
          </div>
        </div>

        {/* KPI 3: TOTAL PENGADUAN BULAN PENILAIAN */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-black text-[#6573a1] dark:text-[#afbade] tracking-wider">
              Pengaduan Bln Penilaian
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#afbade]/20 text-[#2b4390] dark:bg-slate-800 dark:text-slate-300">
              Top10: {formatNumberID(kpi.total_top10_thnlalu)}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#2b4390] dark:text-[#f7fcfa] font-mono tracking-tight">
              {formatNumberID(kpi.total_pengaduan_bln)}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-[#afbade] font-medium">
              laporan
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Sesuai SLA / Tidak Selesai</span>
            <span className="font-bold font-mono text-[#2b4390] dark:text-white">
              {formatNumberID(kpi.total_ditindaklanjuti_sla)} / {formatNumberID(kpi.total_tidak_ditindaklanjuti)}
            </span>
          </div>
        </div>

        {/* KPI 4: STATUS KEPATUHAN RS */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-black text-[#6573a1] dark:text-[#afbade] tracking-wider">
              Status Kepatuhan RS
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300">
              Nilai 100 = Tercapai
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#44853b] dark:text-emerald-400 font-mono tracking-tight">
              {totalTercapai}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-[#afbade] font-medium">
              RS Tercapai (100)
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Belum Tercapai (&lt; 100)</span>
            <span className="font-bold font-mono text-amber-700 dark:text-amber-400">
              {totalBelumTercapai} RS
            </span>
          </div>
        </div>
      </div>

      {/* 3. GRAFIK BULANAN: LINE CHART CAPAIAN PENYELESAIAN PENGADUAN */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 border border-[#afbade]/30 dark:border-white/10 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-[#f7fcfa] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#44853b]" />
              GRAFIK BULANAN: TREN CAPAIAN PENYELESAIAN PENGADUAN (POIN)
            </h4>
            <p className="text-[11px] text-[#6573a1] dark:text-[#afbade]">
              Tren rata-rata skor capaian tindak lanjut pengaduan sesuai SLA (Januari – September 2026) • Bobot 20%
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#44853b]" />
              <span className="text-[#6573a1] dark:text-[#afbade] font-medium text-[11px]">Capaian</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-amber-500" />
              <span className="text-[#6573a1] dark:text-[#afbade] font-medium text-[11px]">Target 100 Poin</span>
            </div>
          </div>
        </div>

        {monthlyChart.length > 0 ? (
          <div className="relative pt-4">
            <div className="w-full h-56 sm:h-64">
              <svg viewBox="0 0 900 240" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="pengaduanCapaianGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#44853b" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#44853b" stopOpacity="0.0" />
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
                        className={val === 100 ? 'text-amber-500 stroke-amber-500/80 stroke-[1.5]' : 'text-slate-300 dark:text-slate-800 stroke-[1]'}
                      />
                      <text
                        x="38"
                        y={y + 3.5}
                        textAnchor="end"
                        className="text-[10px] font-mono fill-[#6573a1] dark:fill-slate-400 select-none"
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
                  className="text-[10px] font-bold fill-amber-700 dark:fill-amber-400 select-none"
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
                        stroke="#44853b"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-md"
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
                              fill="#44853b"
                              stroke="#ffffff"
                              strokeWidth={isHovered ? 2.5 : 1.8}
                              className="transition-all duration-200"
                            />
                            <text
                              x={pt.x}
                              y={220}
                              textAnchor="middle"
                              className={`text-[10px] select-none ${
                                isHovered
                                  ? 'font-bold fill-[#44853b] dark:fill-emerald-400'
                                  : 'fill-[#6573a1] dark:fill-[#afbade]'
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
              <div className="absolute top-4 right-4 glass-panel p-3 rounded-xl border border-[#44853b]/40 shadow-lg text-xs space-y-1 bg-white/95 dark:bg-slate-900/95 z-20 min-w-[220px]">
                <div className="flex items-center justify-between border-b border-[#afbade]/30 pb-1.5 font-bold text-[#2b4390] dark:text-white">
                  <span>{hoveredMonth.bulan_indo}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] ${
                      hoveredMonth.avg_capaian >= 100 ? 'bg-[#d4ecd1] text-[#44853b]' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {hoveredMonth.avg_capaian >= 100 ? 'Tercapai' : 'Belum Tercapai'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[#6573a1] dark:text-[#afbade]">Skor Capaian:</span>
                  <span className="font-bold text-[#44853b] font-mono">
                    {hoveredMonth.avg_capaian.toLocaleString('id-ID', { minimumFractionDigits: 1 })} poin
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6573a1] dark:text-[#afbade]">Pengaduan Bln Ini:</span>
                  <span className="font-bold font-mono text-[#2b4390] dark:text-white">
                    {formatNumberID(hoveredMonth.total_pengaduan_bln)} kasus
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6573a1] dark:text-[#afbade]">Sesuai SLA:</span>
                  <span className="font-bold font-mono text-[#44853b]">
                    {formatNumberID(hoveredMonth.total_ditindaklanjuti_sla)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6573a1] dark:text-[#afbade]">RS Tercapai (100):</span>
                  <span className="font-bold font-mono text-[#2b4390] dark:text-white">
                    {hoveredMonth.met_count} / {hoveredMonth.faskes_count} RS
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-44 flex items-center justify-center text-xs text-[#6573a1] dark:text-[#afbade]">
            Tidak ada data grafik untuk filter yang dipilih.
          </div>
        )}
      </div>

      {/* 4. TABEL MATRIKS RINCI PENYELESAIAN PENGADUAN */}
      <div className="glass-card rounded-3xl border border-[#afbade]/30 dark:border-white/10 shadow-xl overflow-hidden">
        {/* Table Top Controls */}
        <div className="p-4 sm:p-5 border-b border-[#afbade]/30 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f0f7f4] dark:bg-slate-900/40">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-[#f7fcfa] uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2b4390]" />
              Matriks Kepatuhan Penyelesaian Pengaduan FKRTL
            </h4>
            <p className="text-[11px] text-[#6573a1] dark:text-[#afbade]">
              Daftar faskes rujukan lengkap dengan rincian pengaduan SLA dan capaian poin
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Status Badge */}
            <div className="flex items-center rounded-xl bg-white/80 dark:bg-slate-900/80 p-1 border border-[#afbade]/40 dark:border-white/10">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-[#2b4390] text-white shadow-sm'
                    : 'text-[#6573a1] dark:text-slate-400 hover:text-[#2b4390]'
                }`}
              >
                Semua ({apiData?.table_data.length || 0})
              </button>
              <button
                onClick={() => setStatusFilter('TERCAPAI')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'TERCAPAI'
                    ? 'bg-[#44853b] text-white shadow-sm'
                    : 'text-[#6573a1] dark:text-slate-400 hover:text-[#44853b]'
                }`}
              >
                Tercapai ({totalTercapai})
              </button>
              <button
                onClick={() => setStatusFilter('BELUM_TERCAPAI')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'BELUM_TERCAPAI'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-[#6573a1] dark:text-slate-400 hover:text-amber-600'
                }`}
              >
                Belum ({totalBelumTercapai})
              </button>
            </div>

            {/* Items Per Page */}
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="glass-input rounded-xl px-3 py-1.5 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer"
            >
              <option value={10} className="bg-slate-900 text-white">10 baris</option>
              <option value={15} className="bg-slate-900 text-white">15 baris</option>
              <option value={25} className="bg-slate-900 text-white">25 baris</option>
              <option value={50} className="bg-slate-900 text-white">50 baris</option>
            </select>

            {/* Live Search */}
            <div className="relative min-w-[200px]">
              <input
                type="text"
                placeholder="Cari faskes/tipe..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input w-full rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#2b4390] dark:text-white placeholder-[#6573a1] dark:placeholder-slate-500 bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
              />
              <svg
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6573a1] dark:text-slate-400 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#e6f2ed] dark:bg-slate-900/80 text-[#2b4390] dark:text-[#afbade] uppercase text-[10.5px] font-bold tracking-wider border-b border-[#afbade]/30 dark:border-slate-800">
              <tr>
                <th className="py-3 px-3 text-center w-12">No</th>
                <th
                  onClick={() => handleSort('nama_ppk')}
                  className="py-3 px-4 cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Nama Faskes</span>
                    {sortField === 'nama_ppk' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('tipe_faskes')}
                  className="py-3 px-3 cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Tipe Faskes</span>
                    {sortField === 'tipe_faskes' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('pengaduan_3bln')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="whitespace-normal break-words max-w-[130px] leading-tight">
                      pengaduan 3 bulan terakhir (termasuk bulan N)
                    </span>
                    {sortField === 'pengaduan_3bln' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('pengaduan_bln')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="whitespace-normal break-words max-w-[110px] leading-tight">
                      Jml Pengaduan Bln penilaian
                    </span>
                    {sortField === 'pengaduan_bln' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ditindaklanjuti_sla')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="whitespace-normal break-words max-w-[130px] leading-tight">
                      Jml Pengaduan Ditindaklanjuti sesuai SLA
                    </span>
                    {sortField === 'ditindaklanjuti_sla' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('top10_thnlalu')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="whitespace-normal break-words max-w-[110px] leading-tight">
                      Jml Pengaduan Top 10 Tahun lalu
                    </span>
                    {sortField === 'top10_thnlalu' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('tidak_ditindaklanjuti')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="whitespace-normal break-words max-w-[120px] leading-tight">
                      Jml Pengaduan Tidak Ditindaklanjuti
                    </span>
                    {sortField === 'tidak_ditindaklanjuti' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('capaian')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Capaian</span>
                    {sortField === 'capaian' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#afbade]/20 dark:divide-slate-800/60 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-xs text-[#6573a1] dark:text-[#afbade]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#2b4390] border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data kepatuhan penyelesaian pengaduan...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-xs text-[#6573a1] dark:text-[#afbade]">
                    Tidak ada data faskes yang cocok dengan filter atau pencarian.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const isTercapai = row.capaian >= 100 || row.status === 'Tercapai';
                  return (
                    <tr
                      key={`${row.kode_ppk}-${row.bulan}-${row.no}`}
                      className="hover:bg-[#d4ecd1]/20 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-[#6573a1] dark:text-slate-400">
                        {row.no}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-[#2b4390] dark:text-[#f7fcfa]">
                        <div className="flex flex-col">
                          <span>{row.nama_ppk}</span>
                          <span className="text-[10px] font-normal text-[#6573a1] dark:text-[#afbade]">
                            {row.kabupaten} • {row.kode_ppk}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[#6573a1] dark:text-slate-300">
                        <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#d4ecd1]/50 text-[#2b4390] dark:bg-slate-800 dark:text-slate-300 border border-[#afbade]/30 dark:border-white/5">
                          {row.tipe_faskes}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#6573a1] dark:text-slate-300">
                        {formatNumberID(row.pengaduan_3bln)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2b4390] dark:text-[#f7fcfa]">
                        {formatNumberID(row.pengaduan_bln)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#44853b] dark:text-emerald-400">
                        {formatNumberID(row.ditindaklanjuti_sla)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#6573a1] dark:text-slate-300">
                        {formatNumberID(row.top10_thnlalu)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 dark:text-amber-400">
                        {formatNumberID(row.tidak_ditindaklanjuti)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-sm text-[#44853b] dark:text-emerald-400">
                        {row.capaian.toLocaleString('id-ID', { minimumFractionDigits: 1 })}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isTercapai ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30">
                            <span>✓</span>
                            <span>Tercapai</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30">
                            <span>✕</span>
                            <span>Belum Tercapai</span>
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

        {/* Table Pagination */}
        <div className="p-4 border-t border-[#afbade]/30 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-[#6573a1] dark:text-[#afbade]">
            Menampilkan <span className="font-bold text-[#2b4390] dark:text-white">{processedTableRows.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> -{' '}
            <span className="font-bold text-[#2b4390] dark:text-white">
              {Math.min(currentPage * itemsPerPage, processedTableRows.length)}
            </span>{' '}
            dari <span className="font-bold text-[#2b4390] dark:text-white">{processedTableRows.length}</span> baris
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
              ‹
            </button>
            <span className="px-3 py-1 font-bold text-[#2b4390] dark:text-white">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded-lg border border-[#afbade]/40 dark:border-white/10 text-[#2b4390] dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d4ecd1]/40 dark:hover:bg-slate-800"
            >
              ›
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
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
