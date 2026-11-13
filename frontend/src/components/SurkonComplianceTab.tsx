import { Typography } from '@mui/material';
import MainCard from '../berry/MainCard';
import { bulanIndonesia } from '../lib/formatTanggal';
import { KerangkaMemuat } from './ui/KerangkaMemuat';
import { Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import '../berry/berry-dashboards.css';
import { FilterSelect, FilterOption } from './ui/FilterSelect';
import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/apiClient';
import { UnduhJpegKepatuhan } from './UnduhJpegKepatuhan';

import { pencocokCari } from '../lib/cocokCari';
import { FilterLainnya } from './ui/FilterLainnya';
export interface SurkonKpiData {
  avg_capaian: number;
  bobot_persen: number;
  kontribusi_capaian: number;
  target_capaian: number;
  target_persen: string;
  total_faskes: number;
  total_sep: number;
  total_sesuai: number;
  avg_persentase: number;
  total_tercapai: number;
  total_belum_tercapai: number;
  persen_kepatuhan: number;
}

export interface SurkonMonthlyChartItem {
  bulan: string;
  bulan_indo: string;
  short_name: string;
  avg_capaian: number;
  total_sep: number;
  total_sesuai: number;
  faskes_count: number;
  met_count: number;
}

export interface SurkonTableRow {
  no: number;
  kode_ppk: string;
  nama_ppk: string;
  tipe_faskes: string;
  kabupaten: string;
  kelas_ppk: string;
  bulan: string;
  bulan_indo: string;
  total_sep: number;
  total_sesuai: number;
  persentase: number;
  capaian: number;
  capaian_nilai: number;
  is_met: boolean;
  status: string;
}

export interface SurkonFilterOptions {
  kabupaten: string[];
  nama_ppk: string[];
  bulan: string[];
  tipe_faskes: string[];
}

export interface SurkonApiResponse {
  status: string;
  selected_period: string;
  kpi: SurkonKpiData;
  monthly_chart: SurkonMonthlyChartItem[];
  table_data: SurkonTableRow[];
  filter_options: SurkonFilterOptions;
  active_filters: {
    kabupaten: string;
    nama_ppk: string;
    bulan: string;
    tipe_faskes: string;
  };
}

const fmtNum = (val: unknown, decimals: number = 1): string => {
  if (val === null || val === undefined || val === '') return '-';
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? '-' : n.toFixed(decimals);
};

export const SurkonComplianceTab: React.FC = () => {
  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('Semua Kabupaten');
  const [selectedNamaPpk, setSelectedNamaPpk] = useState<string>('Semua Faskes');
  const [selectedBulan, setSelectedBulan] = useState<string>('September 2026');
  const [selectedTipeFaskes, setSelectedTipeFaskes] = useState<string>('Semua Tipe Faskes');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'TERCAPAI' | 'BELUM_TERCAPAI'>('ALL');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 15;
  const [sortField, setSortField] = useState<keyof SurkonTableRow>('capaian');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [apiData, setApiData] = useState<SurkonApiResponse | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<SurkonMonthlyChartItem | null>(null);

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
      const response = await apiClient.get<SurkonApiResponse>(`/api/v1/fkrtl-kepatuhan/surkon${queryString}`);

      if (response && response.data && response.data.status === 'success') {
        setApiData(response.data);
      } else {
        setError('Gagal memuat data kepatuhan Surat Kontrol.');
      }
    } catch (err: any) {
      console.error('Error fetching Surkon compliance data:', err);
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
    target_persen: '≥ 90.0%',
    total_faskes: 0,
    total_sep: 0,
    total_sesuai: 0,
    avg_persentase: 0,
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
      const cocok = pencocokCari(searchQuery);
      rows = rows.filter((r) => cocok(r.nama_ppk, r.kode_ppk, r.kabupaten));
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

  const handleSort = (field: keyof SurkonTableRow) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  if (!apiData) {
    if (loading) return <KerangkaMemuat label="Memuat data kepatuhan" />;
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
        <span>Filter aktif:</span><span>{selectedKabupaten}</span><span>{selectedNamaPpk}</span><span>{bulanIndonesia(selectedBulan)}</span><span>{selectedTipeFaskes}</span>
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
      {/* 1. Header Banner */}
      <div className="berry-dashboard-heading min-w-0">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="sapa-eyebrow inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Indikator Kepatuhan FKRTL - Bobot 5%
            </div>
            <Typography component="h2" variant="h4" className="sapa-section-heading sapa-title text-xl sm:text-2xl">
              07. Penerbitan Surat Kontrol (SURKON) dan SPRI
            </Typography>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              Monitoring kesesuaian penerbitan Surat Kontrol (SURKON) pada pelayanan rawat jalan dan SPRI (Surat Perintah Rawat Inap) yang terbit secara bridging dengan sistem V-Claim BPJS Kesehatan. Standar persentase minimal adalah &ge; 90.0%.
            </p>
          </div>
          <MainCard content={false} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 berry-dashboard-card p-3 rounded-xl shrink-0">
            <div>
              <span className="text-xs text-[var(--text-muted)] block font-medium">Bobot Pilar</span>
              <span className="text-2xl font-semibold text-[var(--bpjs-green)] font-mono">5.0%</span>
            </div>
            <div className="h-10 w-px bg-[var(--surface)] hidden sm:block" />
            <div>
              <span className="text-xs text-[var(--text-muted)] block font-medium">Rata-Rata Capaian</span>
              <span className="text-2xl font-semibold text-[var(--text-main)] font-mono">
                {kpi.avg_capaian.toFixed(1)}%
              </span>
            </div>
          </MainCard>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <MainCard content={false} className="berry-dashboard-card rounded-lg p-4 border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3 min-w-0 sapa-filterbar">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="SurkonComplianceTab-filter-1" className="text-xs font-bold text-[var(--text-main)]">Kabupaten:</label>
            <FilterSelect aria-label="Kabupaten" id="SurkonComplianceTab-filter-1"
              value={selectedKabupaten}
              onChange={(e) => {
                setSelectedKabupaten(e.target.value);
                setCurrentPage(1);
              }}
              className="sapa-control rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer"
            >
              {filterOptions.kabupaten.map((kab) => (
                <FilterOption key={kab} value={kab} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                  {kab}
                </FilterOption>
              ))}
            </FilterSelect>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="SurkonComplianceTab-filter-4" className="text-xs font-bold text-[var(--text-main)]">Bulan:</label>
            <FilterSelect aria-label="Bulan" id="SurkonComplianceTab-filter-4"
              value={selectedBulan}
              onChange={(e) => {
                setSelectedBulan(e.target.value);
                setCurrentPage(1);
              }}
              className="sapa-control rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer"
            >
              {filterOptions.bulan.map((bln) => (
                <FilterOption key={bln} value={bln} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                  {bulanIndonesia(bln)}
                </FilterOption>
              ))}
            </FilterSelect>
          </div>

          <FilterLainnya>
            <div className="flex items-center gap-2">
              <label htmlFor="SurkonComplianceTab-filter-2" className="text-xs font-bold text-[var(--text-main)]">Faskes:</label>
              <FilterSelect aria-label="Fasilitas kesehatan" id="SurkonComplianceTab-filter-2"
                value={selectedNamaPpk}
                onChange={(e) => {
                  setSelectedNamaPpk(e.target.value);
                  setCurrentPage(1);
                }}
                className="sapa-control rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer max-w-[180px] truncate"
              >
                {filterOptions.nama_ppk.map((faskes) => (
                  <FilterOption key={faskes} value={faskes} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                    {faskes}
                  </FilterOption>
                ))}
              </FilterSelect>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="SurkonComplianceTab-filter-3" className="text-xs font-bold text-[var(--text-main)]">Tipe:</label>
              <FilterSelect aria-label="Jenis fasilitas kesehatan" id="SurkonComplianceTab-filter-3"
                value={selectedTipeFaskes}
                onChange={(e) => {
                  setSelectedTipeFaskes(e.target.value);
                  setCurrentPage(1);
                }}
                className="sapa-control rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer"
              >
                {filterOptions.tipe_faskes.map((tipe) => (
                  <FilterOption key={tipe} value={tipe} className="bg-[var(--surface-subtle)] text-[var(--text-main)]">
                    {tipe}
                  </FilterOption>
                ))}
              </FilterSelect>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="SurkonComplianceTab-filter-5" className="text-xs font-bold text-[var(--text-main)]">Status:</label>
              <FilterSelect aria-label="Status capaian" id="SurkonComplianceTab-filter-5"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="sapa-control rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)] cursor-pointer"
              >
                <FilterOption value="ALL" className="bg-[var(--surface-subtle)] text-[var(--text-main)]">Semua Status</FilterOption>
                <FilterOption value="TERCAPAI" className="bg-[var(--surface-subtle)] text-[var(--text-main)]">Tercapai (100%)</FilterOption>
                <FilterOption value="BELUM_TERCAPAI" className="bg-[var(--surface-subtle)] text-[var(--text-main)]">Belum Tercapai (&lt;100%)</FilterOption>
              </FilterSelect>
            </div>
          </FilterLainnya>
        </div>

        <div className="relative w-full md:w-72">
          <input aria-label="Cari Rumah Sakit / Kode PPK..."
            type="text"
            placeholder="Cari Rumah Sakit / Kode PPK..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="sapa-control w-full rounded-xl sapa-control--search pr-3 py-1.5 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border-color)] focus:outline-none focus:border-[var(--border-color)]"
          />
          <svg className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </MainCard>

      {/* 3. KPI Cards */}
      <div className="sapa-kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MainCard content={false} className="sapa-kpi-lead sapa-metric berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] min-w-0">
          <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
            Rata-Rata Capaian Surkon
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-semibold text-[var(--text-main)] font-mono">
              {fmtNum(kpi.avg_capaian, 1)}%
            </span>
            <span className="text-xs font-bold text-[var(--bpjs-green)]">
              (Kontribusi: {fmtNum(kpi.kontribusi_capaian, 2)} pt)
            </span>
          </div>
          <span className="text-[10.5px] text-[var(--bpjs-green)] mt-1 block font-semibold">
            Target Mutu: {kpi.target_persen}
          </span>
        </MainCard>

        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] min-w-0">
          <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
            Rata-Rata Kesesuaian SEP
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-semibold text-[var(--bpjs-green)] font-mono">
              {fmtNum(kpi.avg_persentase, 2)}%
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              Kesesuaian Bridging
            </span>
          </div>
          <span className="text-[10.5px] text-[var(--bpjs-green)] mt-1 block font-semibold">
            {(kpi.total_sesuai ?? 0).toLocaleString('id-ID')} dari {(kpi.total_sep ?? 0).toLocaleString('id-ID')} SEP
          </span>
        </MainCard>

        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] min-w-0">
          <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
            Faskes Memenuhi Target (Patuh)
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-semibold text-[var(--text-main)] font-mono">
              {kpi.total_tercapai}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              dari {kpi.total_faskes} RS ({fmtNum(kpi.persen_kepatuhan, 1)}%)
            </span>
          </div>
          <span className="text-[10.5px] text-[var(--text-main)] mt-1 block font-semibold">
            Kepatuhan Sempurna 100%
          </span>
        </MainCard>

        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 border border-[var(--border-color)] min-w-0">
          <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
            Total Surat Kontrol Diterbitkan
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-semibold text-[var(--text-main)] font-mono">
              {kpi.total_sep.toLocaleString('id-ID')}
            </span>
            <span className="text-xs text-[var(--text-muted)]">Dokumen SEP</span>
          </div>
          <span className="text-[10.5px] text-[var(--text-muted)] mt-1 block">
            Terekam di Sistem Pelayanan
          </span>
        </MainCard>
      </div>

      {/* 4. Monthly Trend Chart: SVG LINE CHART */}
      {apiData?.monthly_chart && apiData.monthly_chart.length > 0 && (
        <MainCard content={false} className="berry-dashboard-card rounded-lg p-5 sm:p-6 border border-[var(--border-color)] relative overflow-hidden min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[var(--border-color)]">
            <div>
              <Typography component="h4" variant="h5" className="text-xs sm:text-sm font-bold text-[var(--text-main)] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-navy)]" />
                GRAFIK BULANAN: TREN CAPAIAN SURAT KONTROL (SURKON) (%)
              </Typography>
              <p className="text-[11px] text-[var(--text-muted)]">
                Tren rata-rata skor capaian penerbitan Surat Kontrol per bulan di tahun 2026 • Bobot 5%
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-navy)]" />
                <span className="text-[var(--text-muted)] font-medium text-[11px]">Capaian Surkon</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-amber-500" />
                <span className="text-[var(--warning-text)] font-semibold text-[11px]">Target 100%</span>
              </div>
            </div>
          </div>

          {/* Interactive Tooltip Snapshot Banner */}
          <div className="h-10 mb-2 flex items-center justify-between px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border-color)]">
            {hoveredMonth ? (
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-[var(--text-main)]">{hoveredMonth.bulan_indo || hoveredMonth.bulan}:</span>
                <span className="font-mono font-bold text-[var(--text-main)]">{fmtNum(hoveredMonth.avg_capaian, 1)}%</span>
                <span className="text-[var(--text-muted)] font-mono">({(hoveredMonth.total_sesuai ?? 0).toLocaleString('id-ID')} / {(hoveredMonth.total_sep ?? 0).toLocaleString('id-ID')} SEP • {hoveredMonth.met_count} RS Patuh)</span>
              </div>
            ) : (
              <span className="text-xs text-[var(--text-muted)] italic">
                Arahkan kursor pada titik bulan untuk melihat rincian capaian Surat Kontrol.
              </span>
            )}
          </div>

          <div className="relative pt-2">
            <div className="w-full h-56 sm:h-64">
              <svg viewBox="0 0 900 240" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="surkonCapaianGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--bpjs-navy)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--bpjs-navy)" stopOpacity="0.0" />
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
                  className="text-[10px] font-bold fill-amber-700 select-none"
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
                      <path d={areaD} fill="url(#surkonCapaianGradient)" />
                      <path
                        d={pathD}
                        fill="none"
                        stroke="var(--bpjs-navy)"
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
                              fill="var(--bpjs-navy)"
                              stroke="var(--surface)"
                              strokeWidth={isHovered ? 2.5 : 1.8}
                              className="transition-all duration-200"
                            />
                            {/* Value label on top of point */}
                            <text
                              x={pt.x}
                              y={pt.y - 8}
                              textAnchor="middle"
                              className={`text-[9.5px] font-mono font-bold select-none ${
                                isHovered ? 'fill-[var(--bpjs-navy)] ' : 'fill-[var(--bpjs-navy)] '
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
                                  ? 'font-bold fill-[var(--bpjs-navy)] '
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
          </div>
        </MainCard>
      )}

      {/* 5. Tabel Detail Kepatuhan Surkon */}
      <MainCard content={false} className="berry-dashboard-card rounded-lg border border-[var(--border-color)] overflow-hidden min-w-0">
        <div className="p-4 sm:p-5 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface-subtle)]">
          <div>
            <Typography component="h3" variant="h5" className="sapa-section-heading text-sm font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--bpjs-green)]" />
              Matriks Kepatuhan Penerbitan Surat Kontrol (SURKON)
            </Typography>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Daftar fasilitas kesehatan tingkat lanjutan beserta jumlah SEP yang terbit sesuai ketentuan bridging.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>Menampilkan <span className="font-bold text-[var(--text-main)]">{processedRows.length}</span> fasilitas</span>
            <UnduhJpegKepatuhan tab="surkon" rows={processedRows} periode={bulanIndonesia(selectedBulan)} filter={[selectedKabupaten, selectedNamaPpk, selectedTipeFaskes]} pencarian={searchQuery} statusFilter={statusFilter} />
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <div className="w-10 h-10 border-4 border-[var(--border-color)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-[var(--text-muted)] font-semibold">
              Memuat data kepatuhan Surat Kontrol...
            </p>
          </div>
        ) : error ? (
          <div className="py-12 px-6 text-center text-[var(--danger)] text-xs">
            {error}
          </div>
        ) : (
          <div aria-label="Area data yang dapat digulir" role="region" tabIndex={0} className="overflow-x-auto">
            <Table size="small" className="sapa-data-table sapa-table w-full text-left text-xs">
              <caption className="sr-only">Rincian kepatuhan fasilitas kesehatan sesuai filter dan periode yang dipilih</caption>
              <TableHead className="bg-[var(--surface-subtle)] text-[var(--text-main)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--border-color)]">
                <TableRow>
                  <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="py-3 px-3 text-center cursor-pointer" onClick={() => handleSort('no')}>No</TableCell>
                  <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="py-3 px-3 cursor-pointer" onClick={() => handleSort('kode_ppk')}>Kode PPK</TableCell>
                  <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="py-3 px-3 cursor-pointer" onClick={() => handleSort('nama_ppk')}>Nama Rumah Sakit</TableCell>
                  <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="py-3 px-3 cursor-pointer" onClick={() => handleSort('kabupaten')}>Kabupaten</TableCell>
                  <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="py-3 px-3 text-center cursor-pointer" onClick={() => handleSort('total_sep')}>Total SEP</TableCell>
                  <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="py-3 px-3 text-center cursor-pointer" onClick={() => handleSort('total_sesuai')}>SEP Sesuai</TableCell>
                  <TableCell className="py-3 px-3 text-center" title="Persentase Sesuai">Kesesuaian (%)</TableCell>
                  <TableCell tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="py-3 px-3 text-center cursor-pointer" onClick={() => handleSort('capaian')}>Capaian</TableCell>
                  <TableCell className="py-3 px-3 text-center" title="Kontribusi Nilai (Bobot 5%)">Poin (5%)</TableCell>
                  <TableCell className="py-3 px-3 text-center">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody className="divide-y divide-[var(--border-color)]/20 font-medium">
                {paginatedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-[var(--text-muted)] italic">
                      Tidak ada data yang sesuai dengan filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((row, idx) => (
                    <TableRow
                      key={`${row.kode_ppk}-${row.bulan}`}
                      className="hover:bg-[var(--surface-accent)]/20 transition-colors group"
                    >
                      <TableCell className="py-3 px-3 text-center text-[var(--text-muted)] font-mono text-[11px]">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </TableCell>
                      <TableCell className="py-3 px-3 font-mono font-bold text-[var(--text-main)]">
                        {row.kode_ppk}
                      </TableCell>
                      <TableCell className="py-3 px-3 font-bold text-[var(--text-main)] group-hover:text-[var(--bpjs-green)] transition-colors">
                        {row.nama_ppk}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-[var(--text-main)]">{row.kabupaten}</TableCell>
                      <TableCell className="py-3 px-3 text-center font-mono">{(row.total_sep ?? 0).toLocaleString('id-ID')}</TableCell>
                      <TableCell className="py-3 px-3 text-center font-mono font-bold text-[var(--bpjs-green)]">
                        {(row.total_sesuai ?? 0).toLocaleString('id-ID')}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-center font-mono">{fmtNum(row.persentase, 2)}%</TableCell>
                      <TableCell className="py-3 px-3 text-center">
                        <span className={`font-mono font-black text-sm px-2 py-0.5 rounded-lg ${
                          row.is_met
                            ? 'bg-[var(--surface-accent)] text-[var(--accent-text)]  '
                            : 'bg-amber-100 text-amber-800  '
                        }`}>
                          {fmtNum(row.capaian, 1)}%
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-3 text-center font-mono font-bold text-[var(--bpjs-green)]">
                        {fmtNum(row.capaian_nilai, 2)} pt
                      </TableCell>
                      <TableCell className="py-3 px-3 text-center">
                        {row.is_met ? (
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="p-4 border-t border-[var(--border-color)] flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">
              Halaman {currentPage} dari {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg text-xs font-bold border border-[var(--border-color)] disabled:opacity-40 cursor-pointer"
              >
                Sebelumnya
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded-lg text-xs font-bold border border-[var(--border-color)] disabled:opacity-40 cursor-pointer"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </MainCard>
    </div>
  );
};
