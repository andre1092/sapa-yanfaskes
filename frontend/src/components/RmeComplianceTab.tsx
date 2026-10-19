import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/apiClient';

export interface RmeKpiData {
  avg_capaian: number;
  bobot_persen: number;
  kontribusi_capaian: number;
  target_capaian: number;
  target_persen: string;
  total_faskes: number;
  total_ritl_lt7: number;
  total_ritl_gt7: number;
  total_rjtl_lt7: number;
  total_rjtl_gt7: number;
  total_tercapai: number;
  total_belum_tercapai: number;
  persen_kepatuhan: number;
}

export interface RmeMonthlyChartItem {
  bulan: string;
  bulan_indo: string;
  short_name: string;
  avg_capaian: number;
  total_rjtl_lt7: number;
  total_ritl_lt7: number;
  faskes_count: number;
  met_count: number;
}

export interface RmeTableRow {
  no: number;
  kode_ppk: string;
  nama_ppk: string;
  tipe_faskes: string;
  kabupaten: string;
  kelas_ppk: string;
  bulan: string;
  bulan_indo: string;
  rjtl_lt7: number;
  rjtl_gt7: number;
  ritl_lt7: number;
  ritl_gt7: number;
  persentase_rme: number;
  capaian: number;
  capaian_nilai: number;
  is_met: boolean;
  status: string;
}

export interface RmeFilterOptions {
  kabupaten: string[];
  nama_ppk: string[];
  bulan: string[];
  tipe_faskes: string[];
}

export interface RmeApiResponse {
  status: string;
  selected_period: string;
  kpi: RmeKpiData;
  monthly_chart: RmeMonthlyChartItem[];
  table_data: RmeTableRow[];
  filter_options: RmeFilterOptions;
  active_filters: {
    kabupaten: string;
    nama_ppk: string;
    bulan: string;
    tipe_faskes: string;
  };
}

const fmtNum = (val: unknown, decimals: number = 1): string => {
  if (val === null || val === undefined || val === '') return (0).toFixed(decimals);
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? (0).toFixed(decimals) : n.toFixed(decimals);
};

export const RmeComplianceTab: React.FC = () => {
  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('Semua Kabupaten');
  const [selectedNamaPpk, setSelectedNamaPpk] = useState<string>('Semua Faskes');
  const [selectedBulan, setSelectedBulan] = useState<string>('September 2026');
  const [selectedTipeFaskes, setSelectedTipeFaskes] = useState<string>('Semua Tipe Faskes');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'TERCAPAI' | 'BELUM_TERCAPAI'>('ALL');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 15;
  const [sortField, setSortField] = useState<keyof RmeTableRow>('persentase_rme');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [apiData, setApiData] = useState<RmeApiResponse | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<RmeMonthlyChartItem | null>(null);

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
      const response = await apiClient.get<RmeApiResponse>(`/api/v1/fkrtl-kepatuhan/rme${queryString}`);

      if (response && response.data && response.data.status === 'success') {
        setApiData(response.data);
      } else {
        setError('Gagal memuat data kepatuhan Rekam Medis Elektronik (RME).');
      }
    } catch (err: any) {
      console.error('Error fetching RME compliance data:', err);
      setError(err?.response?.data?.detail || 'Terjadi kesalahan sistem saat menghubungi server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedKabupaten, selectedNamaPpk, selectedBulan, selectedTipeFaskes]);

  const kpi = apiData?.kpi || {
    avg_capaian: 0,
    bobot_persen: 5,
    kontribusi_capaian: 0,
    target_capaian: 100,
    target_persen: '≥ 95.0%',
    total_faskes: 0,
    total_ritl_lt7: 0,
    total_ritl_gt7: 0,
    total_rjtl_lt7: 0,
    total_rjtl_gt7: 0,
    total_tercapai: 0,
    total_belum_tercapai: 0,
    persen_kepatuhan: 0,
  };

  const filterOptions = apiData?.filter_options || {
    kabupaten: ['Semua Kabupaten'],
    nama_ppk: ['Semua Faskes'],
    bulan: ['Semua Bulan'],
    tipe_faskes: ['Semua Tipe Faskes'],
  };

  const processedRows = useMemo(() => {
    if (!apiData?.table_data) return [];
    let rows = [...apiData.table_data];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.nama_ppk.toLowerCase().includes(q) ||
          r.kode_ppk.toLowerCase().includes(q) ||
          r.kabupaten.toLowerCase().includes(q)
      );
    }

    if (statusFilter === 'TERCAPAI') {
      rows = rows.filter((r) => r.is_met);
    } else if (statusFilter === 'BELUM_TERCAPAI') {
      rows = rows.filter((r) => !r.is_met);
    }

    rows.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

    return rows;
  }, [apiData?.table_data, searchQuery, statusFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(processedRows.length / itemsPerPage) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedRows.slice(start, start + itemsPerPage);
  }, [processedRows, currentPage, itemsPerPage]);

  const handleSort = (field: keyof RmeTableRow) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2b4390]/90 via-[#1b2a4e]/90 to-[#44853b]/80 p-6 sm:p-8 text-white shadow-xl backdrop-blur-md border border-white/10">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-sm border border-white/20 text-[#d4ecd1]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Indikator Kepatuhan FKRTL - Bobot 5%
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              08. Integrasi Rekam Medis Elektronik (RME)
            </h2>
            <p className="text-sm text-slate-200 leading-relaxed">
              Monitoring adopsi dan kepatuhan pengiriman data Rekam Medis Elektronik (RME) Rawat Jalan (RJTL) dan Rawat Inap (RITL) yang terkirim dalam waktu &le; 7 hari sejak tanggal pelayanan. Standar target kepatuhan nasional adalah &ge; 95.0%.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
            <div>
              <span className="text-xs text-slate-300 block font-medium">Bobot Pilar</span>
              <span className="text-2xl font-black text-amber-300 font-mono">5.0%</span>
            </div>
            <div className="h-10 w-px bg-white/20 hidden sm:block" />
            <div>
              <span className="text-xs text-slate-300 block font-medium">Rata-Rata Capaian</span>
              <span className="text-2xl font-black text-white font-mono">
                {kpi.avg_capaian.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="glass-card rounded-2xl p-4 border border-[#afbade]/30 dark:border-white/10 shadow-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">Kabupaten:</label>
            <select
              value={selectedKabupaten}
              onChange={(e) => {
                setSelectedKabupaten(e.target.value);
                setCurrentPage(1);
              }}
              className="glass-input rounded-xl px-3 py-1.5 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer"
            >
              {filterOptions.kabupaten.map((kab) => (
                <option key={kab} value={kab} className="bg-slate-900 text-white">
                  {kab}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">Faskes:</label>
            <select
              value={selectedNamaPpk}
              onChange={(e) => {
                setSelectedNamaPpk(e.target.value);
                setCurrentPage(1);
              }}
              className="glass-input rounded-xl px-3 py-1.5 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer max-w-[180px] truncate"
            >
              {filterOptions.nama_ppk.map((faskes) => (
                <option key={faskes} value={faskes} className="bg-slate-900 text-white">
                  {faskes}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">Tipe:</label>
            <select
              value={selectedTipeFaskes}
              onChange={(e) => {
                setSelectedTipeFaskes(e.target.value);
                setCurrentPage(1);
              }}
              className="glass-input rounded-xl px-3 py-1.5 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer"
            >
              {filterOptions.tipe_faskes.map((tipe) => (
                <option key={tipe} value={tipe} className="bg-slate-900 text-white">
                  {tipe}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">Bulan:</label>
            <select
              value={selectedBulan}
              onChange={(e) => {
                setSelectedBulan(e.target.value);
                setCurrentPage(1);
              }}
              className="glass-input rounded-xl px-3 py-1.5 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer"
            >
              {filterOptions.bulan.map((bln) => (
                <option key={bln} value={bln} className="bg-slate-900 text-white">
                  {bln}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="glass-input rounded-xl px-3 py-1.5 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">Semua Status</option>
              <option value="TERCAPAI" className="bg-slate-900 text-white">Tercapai (100%)</option>
              <option value="BELUM_TERCAPAI" className="bg-slate-900 text-white">Belum Tercapai (&lt;100%)</option>
            </select>
          </div>
        </div>

        <div className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="Cari Rumah Sakit / Kode PPK..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="glass-input w-full rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#2b4390] dark:text-white placeholder-[#6573a1] dark:placeholder-slate-500 bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
          />
          <svg className="w-3.5 h-3.5 text-[#6573a1] dark:text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* 3. KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-5 border border-[#83a67e]/30 dark:border-emerald-500/20 shadow-md">
          <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider block">
            Rata-Rata Capaian RME
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-[#2b4390] dark:text-white font-mono">
              {fmtNum(kpi.avg_capaian, 1)}%
            </span>
            <span className="text-xs font-bold text-[#44853b] dark:text-emerald-400">
              (Kontribusi: {fmtNum(kpi.kontribusi_capaian, 2)} pt)
            </span>
          </div>
          <span className="text-[10.5px] text-[#44853b] dark:text-emerald-400/80 mt-1 block font-semibold">
            Standar Target: {kpi.target_persen}
          </span>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-md">
          <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider block">
            Faskes Memenuhi Target (Patuh)
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-[#44853b] dark:text-emerald-400 font-mono">
              {kpi.total_tercapai}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400">
              dari {kpi.total_faskes} RS ({fmtNum(kpi.persen_kepatuhan, 1)}%)
            </span>
          </div>
          <span className="text-[10.5px] text-[#44853b] dark:text-emerald-400/80 mt-1 block font-semibold">
            Pengiriman Tepat Waktu (&le;7 hari)
          </span>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-md">
          <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider block">
            Faskes Belum Tercapai (&lt;95%)
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-rose-500 dark:text-rose-400 font-mono">
              {kpi.total_belum_tercapai}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400">
              dari {kpi.total_faskes} RS
            </span>
          </div>
          <span className="text-[10.5px] text-rose-500 dark:text-rose-400/80 mt-1 block font-semibold">
            Perlu Akselerasi Bridging
          </span>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-blue-500/20 shadow-md">
          <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider block">
            Total Faskes Terdata
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-[#2b4390] dark:text-sky-400 font-mono">
              {kpi.total_faskes}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400">FKRTL Mitra</span>
          </div>
          <span className="text-[10.5px] text-[#6573a1] dark:text-slate-400 mt-1 block">
            Integrasi SatuSehat & BPJS
          </span>
        </div>
      </div>

      {/* 4. Monthly Trend Chart: SVG LINE CHART */}
      {apiData?.monthly_chart && apiData.monthly_chart.length > 0 && (
        <div className="glass-card rounded-3xl p-5 sm:p-6 border border-[#afbade]/30 dark:border-white/10 shadow-xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#afbade]/20 dark:border-slate-800">
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-[#f7fcfa] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#44853b]" />
                GRAFIK BULANAN: TREN CAPAIAN REKAM MEDIS ELEKTRONIK (RME) (%)
              </h4>
              <p className="text-[11px] text-[#6573a1] dark:text-[#afbade]">
                Tren rata-rata skor kepatuhan integrasi data RME tepat waktu (&le;7 hari) per bulan di tahun 2026 • Bobot 5%
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#44853b]" />
                <span className="text-[#6573a1] dark:text-[#afbade] font-medium text-[11px]">Capaian RME</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px]">Target 100%</span>
              </div>
            </div>
          </div>

          {/* Interactive Tooltip Snapshot Banner */}
          <div className="h-10 mb-2 flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/40 dark:bg-slate-900/40 border border-[#afbade]/20 dark:border-white/5">
            {hoveredMonth ? (
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-[#2b4390] dark:text-white">{hoveredMonth.bulan_indo || hoveredMonth.bulan}:</span>
                <span className="font-mono font-bold text-[#44853b] dark:text-emerald-400">{fmtNum(hoveredMonth.avg_capaian, 1)}%</span>
                <span className="text-[#6573a1] dark:text-slate-400 font-mono">({hoveredMonth.faskes_count} Faskes • {hoveredMonth.met_count} RS Patuh)</span>
              </div>
            ) : (
              <span className="text-xs text-[#6573a1] dark:text-slate-400 italic">
                Arahkan kursor pada titik bulan untuk melihat rincian capaian RME.
              </span>
            )}
          </div>

          <div className="relative pt-2">
            <div className="w-full h-56 sm:h-64">
              <svg viewBox="0 0 900 240" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="rmeCapaianGradient" x1="0" y1="0" x2="0" y2="1">
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
                        {val}%
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
                  Target 100%
                </text>

                {/* SVG Curve & Area */}
                {(() => {
                  const chartData = apiData.monthly_chart;
                  const points = chartData.map((d, i) => {
                    const x = 70 + (i / Math.max(chartData.length - 1, 1)) * 800;
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
                      <path d={areaD} fill="url(#rmeCapaianGradient)" />
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
                            {/* Value label on top of point */}
                            <text
                              x={pt.x}
                              y={pt.y - 8}
                              textAnchor="middle"
                              className={`text-[9.5px] font-mono font-bold select-none ${
                                isHovered ? 'fill-[#44853b] dark:fill-emerald-400' : 'fill-[#2b4390] dark:fill-slate-300'
                              }`}
                            >
                              {fmtNum(pt.data.avg_capaian, 0)}%
                            </text>
                            {/* Month label below */}
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
          </div>
        </div>
      )}

      {/* 5. Tabel Detail Kepatuhan RME */}
      <div className="glass-card rounded-2xl shadow-xl border border-[#afbade]/30 dark:border-white/10 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#afbade]/30 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f0f7f4] dark:bg-slate-900/40">
          <div>
            <h3 className="text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#44853b]" />
              Matriks Kepatuhan Pengiriman Data RME
            </h3>
            <p className="text-xs text-[#6573a1] dark:text-slate-400 mt-0.5">
              Rincian volume data rawat jalan (RJTL) dan rawat inap (RITL) yang terkirim dalam &le; 7 hari per faskes.
            </p>
          </div>
          <div className="text-xs text-[#6573a1] dark:text-slate-400">
            Menampilkan <span className="font-bold text-[#2b4390] dark:text-white">{processedRows.length}</span> fasilitas
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <div className="w-10 h-10 border-4 border-[#44853b] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#6573a1] dark:text-slate-400 font-semibold">
              Memuat data kepatuhan Rekam Medis Elektronik...
            </p>
          </div>
        ) : error ? (
          <div className="py-12 px-6 text-center text-rose-500 text-xs">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#e6f2ed] dark:bg-slate-900/80 text-[#2b4390] dark:text-[#afbade] uppercase text-[10px] font-bold tracking-wider border-b border-[#afbade]/30 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-3 text-center cursor-pointer" onClick={() => handleSort('no')}>No</th>
                  <th className="py-3 px-3 cursor-pointer" onClick={() => handleSort('kode_ppk')}>Kode PPK</th>
                  <th className="py-3 px-3 cursor-pointer" onClick={() => handleSort('nama_ppk')}>Nama Rumah Sakit</th>
                  <th className="py-3 px-3 cursor-pointer" onClick={() => handleSort('kabupaten')}>Kabupaten</th>
                  <th className="py-3 px-2 text-center" title="Rawat Jalan <= 7 Hari">RJTL &le; 7 hr</th>
                  <th className="py-3 px-2 text-center" title="Rawat Jalan > 7 Hari">RJTL &gt; 7 hr</th>
                  <th className="py-3 px-2 text-center" title="Rawat Inap <= 7 Hari">RITL &le; 7 hr</th>
                  <th className="py-3 px-2 text-center" title="Rawat Inap > 7 Hari">RITL &gt; 7 hr</th>
                  <th className="py-3 px-3 text-center cursor-pointer" onClick={() => handleSort('persentase_rme')}>Persentase (%)</th>
                  <th className="py-3 px-3 text-center cursor-pointer" onClick={() => handleSort('capaian')}>Capaian</th>
                  <th className="py-3 px-3 text-center" title="Kontribusi Nilai (Bobot 5%)">Poin (5%)</th>
                  <th className="py-3 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#afbade]/20 dark:divide-slate-800/60 font-medium">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-[#6573a1] dark:text-slate-400 italic">
                      Tidak ada data yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, idx) => (
                    <tr
                      key={`${row.kode_ppk}-${row.bulan}`}
                      className="hover:bg-[#d4ecd1]/20 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-3 px-3 text-center text-[#6573a1] dark:text-slate-500 font-mono text-[11px]">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-[#2b4390] dark:text-slate-300">
                        {row.kode_ppk}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#2b4390] dark:text-white group-hover:text-[#44853b] transition-colors">
                        {row.nama_ppk}
                      </td>
                      <td className="py-3 px-3 text-[#2b4390] dark:text-slate-300">{row.kabupaten}</td>
                      <td className="py-3 px-2 text-center font-mono">{row.rjtl_lt7}</td>
                      <td className="py-3 px-2 text-center font-mono text-slate-400">{row.rjtl_gt7}</td>
                      <td className="py-3 px-2 text-center font-mono">{row.ritl_lt7}</td>
                      <td className="py-3 px-2 text-center font-mono text-slate-400">{row.ritl_gt7}</td>
                      <td className="py-3 px-3 text-center font-mono font-bold">
                        {fmtNum(row.persentase_rme, 1)}%
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`font-mono font-black text-sm px-2 py-0.5 rounded-lg ${
                          row.is_met
                            ? 'bg-[#d4ecd1] text-[#44853b] dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                        }`}>
                          {fmtNum(row.capaian, 1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-[#44853b] dark:text-emerald-400">
                        {fmtNum(row.capaian_nilai, 2)} pt
                      </td>
                      <td className="py-3 px-3 text-center">
                        {row.is_met ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300">
                            ✓ Tercapai
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300">
                            ⚠ Belum Tercapai
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="p-4 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-[#6573a1] dark:text-slate-400">
              Halaman {currentPage} dari {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg text-xs font-bold border border-[#afbade]/30 dark:border-white/10 disabled:opacity-40 cursor-pointer"
              >
                Sebelumnya
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded-lg text-xs font-bold border border-[#afbade]/30 dark:border-white/10 disabled:opacity-40 cursor-pointer"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
