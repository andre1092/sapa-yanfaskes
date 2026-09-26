import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/apiClient';

export interface DisplayTtKpiData {
  avg_jumlah_update: number;
  avg_capaian: number;
  bobot_persen: number;
  kontribusi_capaian: number;
  target_hari: number;
  target_capaian: number;
  total_faskes: number;
  total_update: number;
  total_tercapai: number;
  total_belum_tercapai: number;
  persen_kepatuhan: number;
  total_records: number;
}

export interface DisplayTtMonthlyChartItem {
  bulan: string;
  bulan_indo: string;
  short_name: string;
  avg_jumlah_update: number;
  avg_capaian: number;
  total_update: number;
  faskes_count: number;
  met_count: number;
  is_selected?: boolean;
}

export interface DisplayTtTableRow {
  no: number;
  kode_ppk: string;
  nama_ppk: string;
  tipe_faskes: string;
  kabupaten: string;
  kelas_ppk: string;
  bulan: string;
  bulan_indo: string;
  jumlah_update: number;
  capaian: number;
  capaian_nilai: number;
  is_met: boolean;
  status?: string;
}

export interface DisplayTtFilterOptions {
  kabupaten: string[];
  nama_ppk: string[];
  bulan: string[];
  tipe_faskes: string[];
}

export interface DisplayTtApiResponse {
  status: string;
  kpi: DisplayTtKpiData;
  monthly_chart: DisplayTtMonthlyChartItem[];
  table_data: DisplayTtTableRow[];
  filter_options: DisplayTtFilterOptions;
  active_filters: {
    kabupaten: string;
    nama_ppk: string;
    bulan: string;
    tipe_faskes: string;
  };
}

export const DisplayTtComplianceTab: React.FC = () => {
  // Filter states (Default Bulan: September 2026)
  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('Semua Kabupaten');
  const [selectedNamaPpk, setSelectedNamaPpk] = useState<string>('Semua Faskes');
  const [selectedBulan, setSelectedBulan] = useState<string>('September 2026');
  const [selectedTipeFaskes, setSelectedTipeFaskes] = useState<string>('Semua Tipe Faskes');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'TERCAPAI' | 'BELUM_TERCAPAI'>('ALL');

  // Chart hover state for left and right charts
  const [hoveredMonthUpdate, setHoveredMonthUpdate] = useState<DisplayTtMonthlyChartItem | null>(null);
  const [hoveredMonthCapaian, setHoveredMonthCapaian] = useState<DisplayTtMonthlyChartItem | null>(null);

  // Pagination & Sorting state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  const [sortField, setSortField] = useState<keyof DisplayTtTableRow>('jumlah_update');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Data fetching state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [apiData, setApiData] = useState<DisplayTtApiResponse | null>(null);

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
      const response = await apiClient.get<DisplayTtApiResponse>(`/api/v1/fkrtl-kepatuhan/display-tt${queryString}`);

      if (response && response.data && response.data.status === 'success') {
        setApiData(response.data);
      } else {
        setError('Gagal memuat data kepatuhan display tempat tidur.');
      }
    } catch (err: any) {
      console.error('Error fetching Display TT compliance data:', err);
      setError(err?.response?.data?.detail || err?.message || 'Gagal mengambil data dari Google Spreadsheet Display TT.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedKabupaten, selectedNamaPpk, selectedBulan, selectedTipeFaskes]);

  // Fallback defaults
  const kpi: DisplayTtKpiData = useMemo(() => {
    return (
      apiData?.kpi || {
        avg_jumlah_update: 0.0,
        avg_capaian: 0.0,
        bobot_persen: 10,
        kontribusi_capaian: 0.0,
        target_hari: 25,
        target_capaian: 100.0,
        total_faskes: 0,
        total_update: 0,
        total_tercapai: 0,
        total_belum_tercapai: 0,
        persen_kepatuhan: 0.0,
        total_records: 0,
      }
    );
  }, [apiData]);

  const monthlyChart: DisplayTtMonthlyChartItem[] = useMemo(() => {
    return apiData?.monthly_chart || [];
  }, [apiData]);

  const rawTableData: DisplayTtTableRow[] = useMemo(() => {
    return apiData?.table_data || [];
  }, [apiData]);

  const filterOptions: DisplayTtFilterOptions = useMemo(() => {
    return (
      apiData?.filter_options || {
        kabupaten: ['Semua Kabupaten', 'KAB. JEMBER', 'KAB. LUMAJANG'],
        nama_ppk: ['Semua Faskes'],
        bulan: [
          'Semua Bulan',
          'January 2026',
          'February 2026',
          'March 2026',
          'April 2026',
          'May 2026',
          'June 2026',
          'July 2026',
          'August 2026',
          'September 2026',
        ],
        tipe_faskes: ['Semua Tipe Faskes'],
      }
    );
  }, [apiData]);

  // Handle cascading filter change: Kabupaten
  const handleKabupatenChange = (newKab: string) => {
    setSelectedKabupaten(newKab);
    setSelectedNamaPpk('Semua Faskes');
    setSelectedTipeFaskes('Semua Tipe Faskes');
    setCurrentPage(1);
  };

  // Handle cascading filter change: Tipe Faskes
  const handleTipeFaskesChange = (newTipe: string) => {
    setSelectedTipeFaskes(newTipe);
    setSelectedNamaPpk('Semua Faskes');
    setCurrentPage(1);
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedKabupaten('Semua Kabupaten');
    setSelectedNamaPpk('Semua Faskes');
    setSelectedBulan('September 2026');
    setSelectedTipeFaskes('Semua Tipe Faskes');
    setSearchQuery('');
    setStatusFilter('ALL');
    setCurrentPage(1);
  };

  // Filter Table Data by Search Query & Status Filter
  const filteredTableData = useMemo(() => {
    return rawTableData.filter((row) => {
      // Status Filter
      if (statusFilter === 'TERCAPAI' && !row.is_met) return false;
      if (statusFilter === 'BELUM_TERCAPAI' && row.is_met) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNama = row.nama_ppk.toLowerCase().includes(q);
        const matchKode = row.kode_ppk.toLowerCase().includes(q);
        const matchKab = row.kabupaten.toLowerCase().includes(q);
        const matchTipe = row.tipe_faskes.toLowerCase().includes(q);
        if (!matchNama && !matchKode && !matchKab && !matchTipe) {
          return false;
        }
      }
      return true;
    });
  }, [rawTableData, statusFilter, searchQuery]);

  // Sort Table Data
  const sortedTableData = useMemo(() => {
    return [...filteredTableData].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? (aVal as string).localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal as string);
      }

      if (typeof aVal === 'number') {
        return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      }

      return 0;
    });
  }, [filteredTableData, sortField, sortDirection]);

  // Paginated Table Data
  const totalPages = Math.ceil(sortedTableData.length / itemsPerPage) || 1;
  const paginatedTableData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedTableData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedTableData, currentPage, itemsPerPage]);

  const handleSort = (field: keyof DisplayTtTableRow) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const formatNumberID = (val: number) => {
    return val.toLocaleString('id-ID');
  };

  const formatPercentID = (val: number) => {
    return `${val.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!sortedTableData.length) return;
    const headers = ['No', 'Kode PPK', 'Nama Faskes', 'Kabupaten', 'Tipe Faskes', 'Jumlah Update (Hari)', 'Capaian (Poin)', 'Status'];
    const rows = sortedTableData.map((r, i) => [
      i + 1,
      `"${r.kode_ppk}"`,
      `"${r.nama_ppk}"`,
      `"${r.kabupaten}"`,
      `"${r.tipe_faskes}"`,
      r.jumlah_update,
      r.capaian,
      `"${r.status || (r.is_met ? 'Tercapai' : 'Belum Tercapai')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Kepatuhan_Display_TT_${selectedBulan.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalTercapai = useMemo(() => {
    return rawTableData.filter((r) => r.is_met).length;
  }, [rawTableData]);

  const totalBelumTercapai = useMemo(() => {
    return rawTableData.length - totalTercapai;
  }, [rawTableData, totalTercapai]);

  return (
    <div className="space-y-6">
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

      {/* 1. FILTER BAR 4-DIMENSI DENGAN GLASSMORPHISM UI */}
      <div className="glass-card rounded-2xl p-5 border border-[#83a67e]/30 dark:border-emerald-500/20 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-[#44853b]/10 via-[#2b4390]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#2b4390] to-[#44853b] text-white flex items-center justify-center text-sm shadow-md shadow-[#2b4390]/20">
                🔍
              </span>
              <div>
                <h3 className="text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider">
                  Filter Pembaruan Data Ketersediaan Tempat Tidur
                </h3>
                <p className="text-[11px] text-[#6573a1] dark:text-[#afbade] mt-0.5">
                  Filter interaktif 4-dimensi tersinkronisasi langsung dengan Google Spreadsheet Display TT
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleResetFilters}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#6573a1] dark:text-slate-300 hover:text-[#2b4390] hover:bg-[#d4ecd1]/40 dark:hover:bg-slate-800 border border-[#afbade]/30 dark:border-white/10 transition-colors flex items-center gap-1.5"
              >
                <span>🔄</span>
                <span>Reset Filter</span>
              </button>

              <button
                onClick={fetchData}
                disabled={loading}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#2b4390] text-white hover:bg-[#2b4390]/90 transition-all flex items-center gap-1.5 shadow-sm shadow-[#2b4390]/20"
              >
                <span>{loading ? '⏳' : '⚡'}</span>
                <span>{loading ? 'Memuat...' : 'Segarkan Data'}</span>
              </button>
            </div>
          </div>

          {/* Controls Grid */}
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
                onChange={(e) => {
                  setSelectedNamaPpk(e.target.value);
                  setCurrentPage(1);
                }}
                className="glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/90 dark:bg-slate-900/90 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer shadow-sm"
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
                <span>📅 Bulan Penilaian</span>
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

      {/* 2. KARTU KPI UTAMA (JUMLAH UPDATE, CAPAIAN BOBOT 10%, TOTAL FASKES, STATUS PATUH) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: RATA-RATA JUMLAH UPDATE */}
        <div className="glass-card rounded-2xl p-5 border border-[#83a67e]/40 dark:border-emerald-500/20 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">
              Rata-rata Hari Pembaruan
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300">
              Target &ge; 25 hari
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#2b4390] dark:text-[#f7fcfa] font-mono tracking-tight">
              {kpi.avg_jumlah_update.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400 font-semibold">
              hari / bulan
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ml-auto ${
                kpi.avg_jumlah_update >= 25
                  ? 'bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300'
              }`}
            >
              {kpi.avg_jumlah_update >= 25 ? 'Tercapai' : 'Perlu Peningkatan'}
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Total Akumulasi Pembaruan</span>
            <span className="font-bold font-mono text-[#2b4390] dark:text-white">
              {formatNumberID(kpi.total_update)} hari update
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

        {/* KPI 3: TOTAL RUMAH SAKIT */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/40 dark:border-white/10 shadow-md relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">
              Total Faskes Terdata
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#d4ecd1]/60 text-[#2b4390] dark:bg-slate-800 dark:text-slate-300">
              FKRTL Aktif
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#2b4390] dark:text-sky-300 font-mono tracking-tight">
              {kpi.total_faskes}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400 font-semibold">
              Rumah Sakit
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Rata-rata per Faskes</span>
            <span className="font-bold font-mono text-[#2b4390] dark:text-white">
              {kpi.avg_jumlah_update.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hari / bln
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
              &ge; 25 hari = Patuh
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl sm:text-4xl font-black text-[#44853b] dark:text-emerald-400 font-mono tracking-tight">
              {totalTercapai}
            </span>
            <span className="text-xs text-[#44853b] dark:text-emerald-400 font-semibold">
              RS Patuh ({kpi.total_faskes ? Math.round((totalTercapai / kpi.total_faskes) * 100) : 0}%)
            </span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#6573a1] dark:text-[#afbade]">
            <span>Belum Memenuhi (&lt; 25 hari)</span>
            <span className="font-bold font-mono text-amber-600 dark:text-amber-400">
              {totalBelumTercapai} RS
            </span>
          </div>
        </div>
      </div>

      {/* 3. DUA LINE CHART BULANAN TERPISAH (KANAN DAN KIRI) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LINE CHART KIRI: JUMLAH UPDATE (BIRU BPJS #2b4390) */}
        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2b4390] shadow-sm shadow-[#2b4390]/50" />
                Grafik Bulanan: Jumlah Update (Hari)
              </h3>
              <p className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-0.5">
                Tren rata-rata hari pembaruan ketersediaan tempat tidur secara harian dalam 1 bulan
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#2b4390] border-2 border-white shadow-sm" />
                <span className="text-[#2b4390] dark:text-[#afbade]">Rata-rata Hari</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-amber-500 border-t border-dashed border-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 text-[11px]">Target &ge; 25 hari</span>
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

                // Max scale 31 days
                const maxDays = 31;

                const getX = (idx: number) => {
                  if (monthlyChart.length <= 1) return padding.left + innerWidth / 2;
                  return padding.left + (idx / (monthlyChart.length - 1)) * innerWidth;
                };

                const getY = (val: number) => {
                  const clamped = Math.max(0, Math.min(val, maxDays));
                  return padding.top + innerHeight - (clamped / maxDays) * innerHeight;
                };

                const targetY = getY(25);

                const points = monthlyChart.map((d, i) => `${getX(i)},${getY(d.avg_jumlah_update)}`).join(' ');
                const areaPath = `${points} L ${getX(monthlyChart.length - 1)},${padding.top + innerHeight} L ${getX(0)},${padding.top + innerHeight} Z`;

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="blueGradientDisplayTt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2b4390" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#2b4390" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid lines */}
                    {[0, 10, 20, 25, 31].map((tick) => {
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
                            {tick} hr
                          </text>
                        </g>
                      );
                    })}

                    {/* Target Line 25 hari */}
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
                    <polygon points={areaPath} fill="url(#blueGradientDisplayTt)" />

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
                      const cy = getY(d.avg_jumlah_update);
                      const isHovered = hoveredMonthUpdate?.bulan === d.bulan;
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
                            onMouseEnter={() => setHoveredMonthUpdate(d)}
                            onMouseLeave={() => setHoveredMonthUpdate(null)}
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

                          {/* Value on top of point */}
                          <text
                            x={cx}
                            y={cy - 8}
                            textAnchor="middle"
                            fontSize="9"
                            fill="currentColor"
                            className="font-mono font-bold text-[#2b4390] dark:text-slate-200"
                          >
                            {d.avg_jumlah_update.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()
            )}

            {/* Hover Tooltip Kiri */}
            {hoveredMonthUpdate && (
              <div className="absolute top-2 right-4 bg-slate-900/95 text-white text-[11px] p-2.5 rounded-xl shadow-xl border border-white/10 z-20 pointer-events-none backdrop-blur-md animate-fadeIn">
                <div className="font-bold text-sky-300 pb-1 mb-1 border-b border-white/10">
                  {hoveredMonthUpdate.bulan_indo}
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">Rata-rata Hari:</span>
                  <span className="font-mono font-bold text-white">
                    {hoveredMonthUpdate.avg_jumlah_update.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hari
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">Faskes Patuh (&ge; 25 hr):</span>
                  <span className="font-mono text-emerald-300">
                    {hoveredMonthUpdate.met_count} / {hoveredMonthUpdate.faskes_count} RS
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 text-[11px] text-[#6573a1] dark:text-slate-400 flex items-center justify-between">
            <span>Standar Nasional: Minimal 25 hari pembaruan harian dalam 1 bulan</span>
            <span className="font-bold text-[#2b4390] dark:text-sky-300">Target &ge; 25 hari</span>
          </div>
        </div>

        {/* LINE CHART KANAN: CAPAIAN (HIJAU BPJS #44853b) */}
        <div className="glass-card rounded-2xl p-5 border border-[#83a67e]/40 dark:border-emerald-500/20 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#44853b] dark:text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#44853b] shadow-sm shadow-[#44853b]/50" />
                Grafik Bulanan: Capaian (Poin)
              </h3>
              <p className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-0.5">
                Tren rata-rata skor capaian pembaruan ketersediaan tempat tidur (Bobot 10%)
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#44853b] border-2 border-white shadow-sm" />
                <span className="text-[#44853b] dark:text-emerald-300">Capaian Poin</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-[#44853b] border-t border-dashed border-[#44853b]" />
                <span className="text-[#44853b] dark:text-emerald-400 text-[11px]">Target 100 Poin</span>
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

                const maxPoin = 100;

                const getX = (idx: number) => {
                  if (monthlyChart.length <= 1) return padding.left + innerWidth / 2;
                  return padding.left + (idx / (monthlyChart.length - 1)) * innerWidth;
                };

                const getY = (val: number) => {
                  const clamped = Math.max(0, Math.min(val, maxPoin));
                  return padding.top + innerHeight - (clamped / maxPoin) * innerHeight;
                };

                const targetY = getY(100);

                const points = monthlyChart.map((d, i) => `${getX(i)},${getY(d.avg_capaian)}`).join(' ');
                const areaPath = `${points} L ${getX(monthlyChart.length - 1)},${padding.top + innerHeight} L ${getX(0)},${padding.top + innerHeight} Z`;

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="greenGradientDisplayTt" x1="0" y1="0" x2="0" y2="1">
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

                    {/* Target Line 100 */}
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
                    <polygon points={areaPath} fill="url(#greenGradientDisplayTt)" />

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

                          {/* Value on top of point */}
                          <text
                            x={cx}
                            y={cy - 8}
                            textAnchor="middle"
                            fontSize="9"
                            fill="currentColor"
                            className="font-mono font-bold text-[#44853b] dark:text-emerald-300"
                          >
                            {d.avg_capaian.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()
            )}

            {/* Hover Tooltip Kanan */}
            {hoveredMonthCapaian && (
              <div className="absolute top-2 right-4 bg-slate-900/95 text-white text-[11px] p-2.5 rounded-xl shadow-xl border border-white/10 z-20 pointer-events-none backdrop-blur-md animate-fadeIn">
                <div className="font-bold text-emerald-300 pb-1 mb-1 border-b border-white/10">
                  {hoveredMonthCapaian.bulan_indo}
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">Rata-rata Capaian:</span>
                  <span className="font-mono font-bold text-white">
                    {hoveredMonthCapaian.avg_capaian.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} poin
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">Kontribusi Mutu (10%):</span>
                  <span className="font-mono text-emerald-300">
                    +{formatPercentID(hoveredMonthCapaian.avg_capaian * 0.1)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-[#afbade]/20 dark:border-slate-800 text-[11px] text-[#6573a1] dark:text-slate-400 flex items-center justify-between">
            <span>Pedoman Penilaian: &ge; 25 hari = 100, 15-24 hari = 50, 10-14 hari = 25, &lt; 10 hari = 0</span>
            <span className="font-bold text-[#44853b] dark:text-emerald-400">Target 100 Poin</span>
          </div>
        </div>
      </div>

      {/* 4. TABEL MATRIKS KEPATUHAN FASKES (DEDUPLIKASI / TANPA DUPLIKAT) */}
      <div className="glass-card rounded-2xl border border-[#afbade]/30 dark:border-white/10 shadow-xl overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-4 sm:p-5 border-b border-[#afbade]/20 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider flex items-center gap-2">
              <span>📋 Matriks Kepatuhan: Pembaruan (Update) Data Ketersediaan Tempat Tidur</span>
            </h3>
            <p className="text-xs text-[#6573a1] dark:text-slate-400 mt-0.5">
              Menampilkan {filteredTableData.length} fasilitas kesehatan rujukan (FKRTL) terintegrasi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari faskes, kode PPK, atau kab..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="glass-input rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#2b4390] dark:text-white placeholder-[#6573a1] dark:placeholder-slate-400 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] w-56 sm:w-64"
              />
              <span className="absolute left-2.5 top-2 text-xs text-[#6573a1] dark:text-slate-400">🔍</span>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center bg-[#afbade]/20 dark:bg-slate-800/80 p-0.5 rounded-xl border border-[#afbade]/30 dark:border-white/10 text-xs">
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-[#2b4390] text-white shadow-sm'
                    : 'text-[#6573a1] dark:text-slate-300 hover:text-[#2b4390]'
                }`}
              >
                Semua ({rawTableData.length})
              </button>
              <button
                onClick={() => {
                  setStatusFilter('TERCAPAI');
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  statusFilter === 'TERCAPAI'
                    ? 'bg-[#44853b] text-white shadow-sm'
                    : 'text-[#6573a1] dark:text-slate-300 hover:text-[#44853b]'
                }`}
              >
                Patuh ({totalTercapai})
              </button>
              <button
                onClick={() => {
                  setStatusFilter('BELUM_TERCAPAI');
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  statusFilter === 'BELUM_TERCAPAI'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-[#6573a1] dark:text-slate-300 hover:text-amber-600'
                }`}
              >
                Belum ({totalBelumTercapai})
              </button>
            </div>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#44853b] hover:text-white hover:bg-[#44853b] border border-[#83a67e]/40 dark:border-emerald-500/30 transition-all flex items-center gap-1.5"
            >
              <span>📥</span>
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#e6f2ed] dark:bg-slate-900/80 text-[#2b4390] dark:text-[#afbade] uppercase text-[10px] font-bold tracking-wider border-b border-[#afbade]/30 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">No</th>
                <th
                  onClick={() => handleSort('nama_ppk')}
                  className="py-3 px-4 cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Nama Fasilitas Kesehatan (FKRTL)</span>
                    {sortField === 'nama_ppk' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('kabupaten')}
                  className="py-3 px-4 cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Kabupaten</span>
                    {sortField === 'kabupaten' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('tipe_faskes')}
                  className="py-3 px-4 cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Tipe Faskes</span>
                    {sortField === 'tipe_faskes' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('jumlah_update')}
                  className="py-3 px-4 text-center cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Jumlah Update (Hari)</span>
                    {sortField === 'jumlah_update' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('capaian')}
                  className="py-3 px-4 text-center cursor-pointer hover:text-[#44853b] transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Capaian (Poin)</span>
                    {sortField === 'capaian' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#afbade]/20 dark:divide-slate-800/60 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#6573a1] dark:text-slate-400 italic">
                    Memuat data pembaruan display tempat tidur...
                  </td>
                </tr>
              ) : paginatedTableData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#6573a1] dark:text-slate-400 italic">
                    Tidak ada faskes yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                paginatedTableData.map((row, idx) => {
                  const isMet = row.is_met;
                  return (
                    <tr
                      key={row.kode_ppk}
                      className="hover:bg-[#d4ecd1]/20 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-3.5 px-4 text-[#6573a1] dark:text-slate-500 font-mono text-[11px]">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#2b4390] dark:text-white group-hover:text-[#44853b] dark:group-hover:text-emerald-300 transition-colors">
                        <div className="flex flex-col">
                          <span>{row.nama_ppk}</span>
                          <span className="text-[10px] font-mono text-[#6573a1] dark:text-slate-400 font-normal">
                            Kode PPK: {row.kode_ppk}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[#2b4390] dark:text-slate-300">
                        {row.kabupaten}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#d4ecd1]/50 text-[#2b4390] dark:bg-slate-800 dark:text-slate-300 border border-[#afbade]/30 dark:border-white/5">
                          {row.tipe_faskes || '-'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-[#2b4390] dark:text-white">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-sm">
                            {row.jumlah_update.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                          </span>
                          <span className="text-[10px] text-[#6573a1] dark:text-slate-400 font-normal">
                            hari
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-[#afbade]/20 dark:bg-slate-800 rounded-full h-2 overflow-hidden border border-[#afbade]/30 dark:border-white/5">
                            <div
                              style={{ width: `${Math.min(row.capaian, 100)}%` }}
                              className={`h-full rounded-full transition-all duration-500 ${
                                isMet
                                  ? 'bg-gradient-to-r from-[#44853b] to-[#83a67e]'
                                  : 'bg-gradient-to-r from-amber-500 to-rose-400'
                              }`}
                            />
                          </div>
                          <span className="font-mono font-bold text-[#2b4390] dark:text-white text-[11px]">
                            {row.capaian.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {isMet ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30">
                            ✓ Patuh (&ge; 25 hr)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30">
                            ⚠ Belum Patuh (&lt; 25 hr)
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
        <div className="p-4 border-t border-[#afbade]/20 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#6573a1] dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>Baris per halaman:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="glass-input rounded-lg px-2 py-1 text-xs text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900 border border-[#afbade]/40 dark:border-white/10"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>
              Menampilkan {sortedTableData.length ? (currentPage - 1) * itemsPerPage + 1 : 0} –{' '}
              {Math.min(currentPage * itemsPerPage, sortedTableData.length)} dari {sortedTableData.length} faskes
            </span>
          </div>

          <div className="flex items-center gap-1.5 self-center">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1 rounded-lg border border-[#afbade]/30 dark:border-white/10 disabled:opacity-40 hover:bg-[#d4ecd1]/30 transition-colors"
            >
              Sebelumnya
            </button>
            <span className="px-2 font-mono font-bold text-[#2b4390] dark:text-white">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 rounded-lg border border-[#afbade]/30 dark:border-white/10 disabled:opacity-40 hover:bg-[#d4ecd1]/30 transition-colors"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
