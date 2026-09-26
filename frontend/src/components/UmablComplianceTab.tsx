import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/apiClient';

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
  { populasi: '30 – 100', target: 30 },
  { populasi: '101 – 200', target: 80 },
  { populasi: '201 – 500', target: 132 },
  { populasi: '501 – 1.000', target: 217 },
  { populasi: '1.001 – 5.000', target: 278 },
  { populasi: '5.001 – 10.000', target: 357 },
  { populasi: '10.001 – 50.000', target: 370 },
  { populasi: '50.001 – 100.000', target: 381 },
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

      {/* 1. FILTER PANEL CASCADING (KABUPATEN, NAMA FASKES, BULAN, TIPE FASKES) */}
      <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#2b4390]/10 dark:bg-white/10 text-[#2b4390] dark:text-[#afbade] text-sm">
                🔍
              </span>
              <h3 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider">
                Filter Parameter Kepatuhan Umpan Balik Peserta
              </h3>
            </div>
            <span className="text-[11px] font-medium text-[#6573a1] dark:text-[#afbade]">
              Otomatis tersinkronisasi dengan Master FKRTL
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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

      {/* 2. KARTU KPI UTAMA (PERSEN TARGET, CAPAIAN BOBOT 10%, TOTAL KUNJUNGAN & RESPONDEN, STATUS PATUH) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: % JLH RESPONDEN TARGET */}
        <div className="glass-card rounded-2xl p-5 border border-[#83a67e]/40 dark:border-emerald-500/20 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">
              % Jlh Responden Target
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300">
              Target &ge; 100%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#2b4390] dark:text-[#f7fcfa] font-mono tracking-tight">
              {formatPercentID(kpi.avg_persen_target)}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                kpi.avg_persen_target >= 100
                  ? 'bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300'
              }`}
            >
              {kpi.avg_persen_target >= 100 ? 'Tercapai' : 'Belum Tercapai'}
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Total Responden / Target</span>
            <span className="font-bold font-mono text-[#2b4390] dark:text-white">
              {formatNumberID(kpi.total_responden)} / {formatNumberID(kpi.total_target)}
            </span>
          </div>
        </div>

        {/* KPI 2: CAPAIAN (BOBOT 10%) */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/40 dark:border-white/10 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">
              Rata-rata Capaian (Poin)
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#afbade]/30 text-[#2b4390] dark:bg-slate-800 dark:text-sky-300">
              Bobot 10%
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#44853b] dark:text-emerald-400 font-mono tracking-tight">
              {kpi.avg_capaian.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400 font-semibold">
              dari 100 poin
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Kontribusi Nilai Mutu</span>
            <span className="font-bold font-mono text-[#44853b] dark:text-emerald-300">
              +{formatPercentID(kpi.kontribusi_capaian)}
            </span>
          </div>
        </div>

        {/* KPI 3: TOTAL KUNJUNGAN POPULASI */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/40 dark:border-white/10 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">
              Total Kunjungan Populasi
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#d4ecd1]/60 text-[#2b4390] dark:bg-slate-800 dark:text-slate-300">
              {kpi.total_faskes} FKRTL
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#2b4390] dark:text-sky-300 font-mono tracking-tight">
              {formatNumberID(kpi.total_kunjungan)}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400 font-semibold">
              pasien
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Sampling Responden</span>
            <span className="font-bold font-mono text-[#2b4390] dark:text-white">
              {formatNumberID(kpi.total_responden)} ulasan
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

      {/* 3. DUA LINE CHART BULANAN TERPISAH (KANAN DAN KIRI) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LINE CHART KIRI: % JLH RESPONDEN TARGET (BIRU BPJS #2b4390) */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2b4390] shadow-sm shadow-[#2b4390]/50" />
                Grafik Bulanan: % Jlh Responden Target
              </h3>
              <p className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-0.5">
                Tren rata-rata persentase responden feedback terhadap target populasi
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#2b4390] border-2 border-white shadow-sm" />
                <span className="text-[#2b4390] dark:text-[#afbade]">% Responden Target</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-amber-500 border-t border-dashed border-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 text-[11px]">Target &ge; 100%</span>
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
                const areaPath = `${points} L ${getX(monthlyChart.length - 1)},${padding.top + innerHeight} L ${getX(0)},${padding.top + innerHeight} Z`;

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="blueGradientUmabl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2b4390" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#2b4390" stopOpacity="0.02" />
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
                            className="text-[#afbade]/20 dark:text-white/5"
                            strokeWidth="1"
                          />
                          <text
                            x={padding.left - 6}
                            y={y + 3}
                            textAnchor="end"
                            fontSize="9"
                            fill="currentColor"
                            className="text-[#6573a1] dark:text-slate-400 font-mono"
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
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />

                    {/* Area Fill */}
                    <polygon points={areaPath} fill="url(#blueGradientUmabl)" />

                    {/* Line Path */}
                    <polyline
                      fill="none"
                      stroke="#2b4390"
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
                            fill="#2b4390"
                            stroke="#ffffff"
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
                                ? 'text-[#2b4390] dark:text-sky-300 font-bold'
                                : 'text-[#6573a1] dark:text-slate-400'
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
              <div className="absolute top-2 right-2 pointer-events-none glass-card rounded-xl px-3 py-2 border border-[#2b4390]/40 shadow-lg text-[11px] space-y-1 bg-white/95 dark:bg-slate-900/95 z-20">
                <div className="font-bold text-[#2b4390] dark:text-white border-b border-[#afbade]/30 pb-0.5">
                  {hoveredMonthPersen.bulan_indo}
                </div>
                <div className="flex items-center justify-between gap-3 text-[#6573a1] dark:text-[#afbade]">
                  <span>% Responden Target:</span>
                  <span className="font-mono font-bold text-[#2b4390] dark:text-sky-300">
                    {formatPercentID(hoveredMonthPersen.avg_persen_target)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[#6573a1] dark:text-[#afbade]">
                  <span>Responden / Target:</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {formatNumberID(hoveredMonthPersen.total_responden)} / {formatNumberID(hoveredMonthPersen.total_target)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LINE CHART KANAN: CAPAIAN (POIN) (HIJAU BPJS #44853b) */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#44853b] dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#44853b] shadow-sm shadow-[#44853b]/50" />
                Grafik Bulanan: Capaian (Poin)
              </h3>
              <p className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-0.5">
                Tren rata-rata skor capaian poin KESSAN (Bobot 10%)
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#44853b] border-2 border-white shadow-sm" />
                <span className="text-[#44853b] dark:text-emerald-400">Capaian</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-[#44853b] border-t border-dashed border-[#44853b]" />
                <span className="text-[#44853b] dark:text-emerald-300 text-[11px]">Target 100 Poin</span>
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
                const areaPath = `${points} L ${getX(monthlyChart.length - 1)},${padding.top + innerHeight} L ${getX(0)},${padding.top + innerHeight} Z`;

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="greenGradientUmabl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#44853b" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#44853b" stopOpacity="0.02" />
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
                            className="text-[#afbade]/20 dark:text-white/5"
                            strokeWidth="1"
                          />
                          <text
                            x={padding.left - 6}
                            y={y + 3}
                            textAnchor="end"
                            fontSize="9"
                            fill="currentColor"
                            className="text-[#6573a1] dark:text-slate-400 font-mono"
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
                      stroke="#44853b"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />

                    {/* Area Fill */}
                    <polygon points={areaPath} fill="url(#greenGradientUmabl)" />

                    {/* Line Path */}
                    <polyline
                      fill="none"
                      stroke="#44853b"
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
                            fill="#44853b"
                            stroke="#ffffff"
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
                                ? 'text-[#44853b] dark:text-emerald-300 font-bold'
                                : 'text-[#6573a1] dark:text-slate-400'
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
              <div className="absolute top-2 right-2 pointer-events-none glass-card rounded-xl px-3 py-2 border border-[#44853b]/40 shadow-lg text-[11px] space-y-1 bg-white/95 dark:bg-slate-900/95 z-20">
                <div className="font-bold text-[#44853b] dark:text-emerald-400 border-b border-[#afbade]/30 pb-0.5">
                  {hoveredMonthCapaian.bulan_indo}
                </div>
                <div className="flex items-center justify-between gap-3 text-[#6573a1] dark:text-[#afbade]">
                  <span>Rata-rata Capaian:</span>
                  <span className="font-mono font-bold text-[#44853b] dark:text-emerald-400">
                    {hoveredMonthCapaian.avg_capaian.toLocaleString('id-ID', { minimumFractionDigits: 1 })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[#6573a1] dark:text-[#afbade]">
                  <span>RS Tercapai (&ge; 100):</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-300">
                    {hoveredMonthCapaian.met_count} / {hoveredMonthCapaian.faskes_count} RS
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. DAFTAR STANDAR PEDOMAN TARGET RESPONDEN KESSAN & CONTOH ULASAN KESSAN (SESUAI GAMBAR) */}
      <div className="glass-card rounded-3xl p-6 border border-[#83a67e]/40 dark:border-emerald-500/20 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
          {/* Kolom Kiri: Tabel Standar Target KESSAN */}
          <div className="w-full md:w-3/5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-[#44853b]/10 text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300 text-lg">
                📋
              </span>
              <div>
                <h3 className="text-base sm:text-lg font-black text-[#2b4390] dark:text-white tracking-tight">
                  Target Responden KESSAN
                </h3>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade]">
                  Target responden KESSAN ditentukan berdasarkan jumlah kunjungan yakni:
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#afbade]/30 dark:border-white/10 shadow-sm">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#2b4390] text-white font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4 text-left">Jumlah Kunjungan (Populasi)</th>
                    <th className="py-2.5 px-4 text-center">Jumlah Responden (Target)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#afbade]/20 dark:divide-slate-800 font-medium">
                  {KESSAN_TARGET_STANDARDS.map((std, idx) => (
                    <tr
                      key={std.populasi}
                      className={
                        idx % 2 === 0
                          ? 'bg-white/40 dark:bg-slate-900/40 hover:bg-[#d4ecd1]/20 transition-colors'
                          : 'bg-white/70 dark:bg-slate-900/70 hover:bg-[#d4ecd1]/20 transition-colors'
                      }
                    >
                      <td className="py-2 px-4 font-mono font-semibold text-[#2b4390] dark:text-slate-200">
                        {std.populasi}
                      </td>
                      <td className="py-2 px-4 text-center font-mono font-bold text-[#44853b] dark:text-emerald-400">
                        {std.target.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-[11px] text-[#6573a1] dark:text-slate-400 leading-relaxed bg-[#f7fcfa] dark:bg-slate-900/60 p-3 rounded-xl border border-[#afbade]/20">
              <span className="font-bold text-[#2b4390] dark:text-sky-300">💡 Pedoman Penilaian:</span> Capaian dihitung berdasarkan persentase responden feedback terhadap target yang ditentukan: 100% dari target = 100, 75% dari target = 75, 50% dari target = 50, 25% dari target = 25, dan &lt; 25% dari target = 0.
            </div>
          </div>

          {/* Kolom Kanan: Visual Mockup Contoh Ulasan KESSAN ala Aplikasi BPJS */}
          <div className="w-full md:w-2/5 flex flex-col items-center justify-center">
            <div className="w-full max-w-[320px] rounded-3xl p-4 bg-gradient-to-b from-[#2b4390] to-[#1c2d61] text-white shadow-2xl border-4 border-slate-700 relative">
              {/* Phone Speaker Notch */}
              <div className="w-16 h-1 bg-white/30 rounded-full mx-auto mb-3" />

              <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs font-semibold">
                <span className="flex items-center gap-1">
                  <span>←</span> <span>Ulasan</span>
                </span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">KESSAN</span>
              </div>

              {/* Summary Rating */}
              <div className="mt-3 p-3 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black font-mono text-amber-300">5.0</span>
                    <span className="text-amber-400 text-xs">★★★★★</span>
                  </div>
                  <span className="text-[10px] text-slate-300 block">Rating Kepuasan Pasien</span>
                </div>
                <div className="text-right text-[10px] text-slate-300">
                  <span className="font-bold text-white block">Rawat Jalan & Inap</span>
                  <span>Feedback Real-Time</span>
                </div>
              </div>

              {/* Sample Review Bubbles */}
              <div className="mt-3 space-y-2 text-[10.5px]">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-md space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-200">Azka Giovanny</span>
                    <span className="text-amber-300 font-mono text-[10px]">★ 5.0</span>
                  </div>
                  <p className="text-slate-200 leading-tight">
                    "Pelayanan dokter sangat ramah, penjelasan obat jelas dan ruang tunggu nyaman."
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-md space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-200">Desi Kartika</span>
                    <span className="text-amber-300 font-mono text-[10px]">★ 5.0</span>
                  </div>
                  <p className="text-slate-200 leading-tight">
                    "Waktu tunggu cepat sejak antrean online dan nakes melayani dengan prima."
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-white/10 text-center">
                <span className="text-[9.5px] text-slate-300 uppercase tracking-widest">
                  BPJS Kesehatan • Feedback Peserta
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. TABEL MATRIKS KEPATUHAN FASKES (TANPA DUPLIKAT FASKES) */}
      <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-xl space-y-4">
        {/* Table Top Controls: Search, Status Filter, Items per Page */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#2b4390]/10 text-[#2b4390] dark:bg-white/10 dark:text-[#afbade] text-sm">
              📊
            </span>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider">
                Matriks Kepatuhan Umpan Balik Peserta
              </h3>
              <p className="text-[11px] text-[#6573a1] dark:text-[#afbade]">
                Menampilkan {processedTableRows.length} faskes unik tanpa duplikasi
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari faskes..."
                className="glass-input pl-8 pr-3 py-1.5 rounded-xl text-xs text-[#2b4390] dark:text-white bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] w-40 sm:w-56"
              />
              <span className="absolute left-2.5 top-2 text-xs text-[#6573a1] dark:text-slate-400">🔍</span>
            </div>

            {/* Status Filter Toggle */}
            <div className="flex items-center p-1 rounded-xl bg-[#afbade]/20 dark:bg-slate-800/80 text-xs">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-[#2b4390] text-white shadow-sm'
                    : 'text-[#6573a1] dark:text-slate-300 hover:text-[#2b4390]'
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => setStatusFilter('TERCAPAI')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  statusFilter === 'TERCAPAI'
                    ? 'bg-[#44853b] text-white shadow-sm'
                    : 'text-[#6573a1] dark:text-slate-300 hover:text-[#44853b]'
                }`}
              >
                Tercapai
              </button>
              <button
                onClick={() => setStatusFilter('BELUM_TERCAPAI')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  statusFilter === 'BELUM_TERCAPAI'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-[#6573a1] dark:text-slate-300 hover:text-amber-600'
                }`}
              >
                Belum
              </button>
            </div>

            {/* Items Per Page Select */}
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="glass-input px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#2b4390] dark:text-white bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/40 dark:border-white/10"
            >
              <option value={10}>10 / hal</option>
              <option value={15}>15 / hal</option>
              <option value={25}>25 / hal</option>
              <option value={50}>50 / hal</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto rounded-2xl border border-[#afbade]/30 dark:border-white/10">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#2b4390]/10 dark:bg-slate-900/80 text-[#2b4390] dark:text-[#afbade] font-bold uppercase tracking-wider text-[11px] border-b border-[#afbade]/30 dark:border-slate-800">
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
                  onClick={() => handleSort('kunjungan')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Jlh Kunjungan</span>
                    {sortField === 'kunjungan' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('responden')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Jlh Responden</span>
                    {sortField === 'responden' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('target')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Target</span>
                    {sortField === 'target' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('persen_responden_target')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>% Jlh Responden Target</span>
                    {sortField === 'persen_responden_target' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
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
                  <td colSpan={9} className="py-12 text-center text-xs text-[#6573a1] dark:text-[#afbade]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#2b4390] border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data pelaksanaan umpan balik peserta...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-[#6573a1] dark:text-[#afbade]">
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
                        {formatNumberID(row.kunjungan)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2b4390] dark:text-[#f7fcfa]">
                        {formatNumberID(row.responden)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#6573a1] dark:text-slate-300">
                        {formatNumberID(row.target)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#44853b] dark:text-emerald-400">
                        {formatPercentID(row.persen_responden_target)}
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 text-xs text-[#6573a1] dark:text-[#afbade]">
          <div>
            Menampilkan baris{' '}
            <span className="font-bold text-[#2b4390] dark:text-white">
              {processedTableRows.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}
            </span>{' '}
            hingga{' '}
            <span className="font-bold text-[#2b4390] dark:text-white">
              {Math.min(currentPage * itemsPerPage, processedTableRows.length)}
            </span>{' '}
            dari <span className="font-bold text-[#2b4390] dark:text-white">{processedTableRows.length}</span> total faskes
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-[#afbade]/30 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d4ecd1]/30 transition-colors"
            >
              ««
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-lg border border-[#afbade]/30 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d4ecd1]/30 transition-colors"
            >
              «
            </button>
            <span className="px-3 py-1 font-bold font-mono text-[#2b4390] dark:text-white">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-lg border border-[#afbade]/30 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d4ecd1]/30 transition-colors"
            >
              »
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-[#afbade]/30 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d4ecd1]/30 transition-colors"
            >
              »»
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
