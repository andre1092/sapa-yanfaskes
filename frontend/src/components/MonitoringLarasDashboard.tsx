import { Typography } from '@mui/material';
import MainCard from '../berry/MainCard';
import { KerangkaMemuat } from './ui/KerangkaMemuat';
import '../berry/berry-dashboards.css';
import { useId, useState } from 'react';
import { AnimatedButton } from './ui/AnimatedButton';
import { FilterSelect, FilterOption } from './ui/FilterSelect';
import { EMPTY_LARAS_FILTERS, useLarasData, type LarasChart, type LarasFilters } from '../hooks/useLarasData';

const duration = (seconds: number | null | undefined) => {
  if (seconds == null || !Number.isFinite(seconds)) return 'N/A';
  const total = Math.max(0, Math.round(seconds));
  const days = String(Math.floor(total / 86400)).padStart(2, '0');
  const time = [Math.floor((total % 86400) / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
  return `${days} hari ${time}`;
};
const monthLabel = (label: string) => {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(label);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return label;
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
};
function Chart({ title, chart, vertical = false }: { title: string; chart: LarasChart; vertical?: boolean }) {
  const id = useId();
  const points = chart.points.filter(point => Number.isFinite(point.avg_seconds) && point.avg_seconds >= 0);
  const max = Math.max(1, ...points.map(point => point.avg_seconds));
  return <MainCard content={false} className={`laras-chart berry-dashboard-card ${vertical ? 'laras-chart-monthly' : ''}`} aria-labelledby={id}>
    <header className="laras-chart-heading"><Typography component="h2" variant="h4" id={id}>{title}</Typography><span>Hari · jam:menit:detik</span></header>
    {points.length === 0 ? <p className="laras-chart-empty">{chart.message || 'Belum ada data untuk pilihan ini.'}</p> : <>
      <div className={vertical ? 'laras-month-scroll' : 'laras-bars'} tabIndex={0} role="region" aria-label={`${title}, area grafik yang dapat digulir`}>
        <div className={vertical ? 'laras-months' : 'laras-bar-list'} role="list" aria-label={`${title}, rata-rata durasi dalam hari, jam, menit, dan detik`}>
          {points.map((point, index) => <div role="listitem" className={vertical ? 'laras-month' : 'laras-bar-row'} key={`${point.label}-${index}`}>
            <span className="laras-bar-label">{vertical ? monthLabel(point.label) : point.label}</span>
            <div className="laras-bar-track" aria-hidden="true"><div className="laras-bar-fill" style={vertical ? { height: `${point.avg_seconds / max * 100}%` } : { width: `${point.avg_seconds / max * 100}%` }} /></div>
            <span className="laras-bar-value" title={`${duration(point.avg_seconds)} · ${point.sample_count} agregat`}>{duration(point.avg_seconds)}<span className="sr-only">, {point.sample_count} agregat sumber</span></span>
          </div>)}
        </div>
      </div>
      {chart.message && <p className="laras-chart-note">{chart.message}</p>}
    </>}
  </MainCard>;
}
export function MonitoringLarasDashboard() {
  const [filters, setFilters] = useState<LarasFilters>({ ...EMPTY_LARAS_FILTERS });
  const query = useLarasData(filters);
  const { data } = query;
  const update = (key: keyof LarasFilters, value: string) => setFilters(current => ({ ...current, [key]: value, ...((key === 'faskes' || key === 'bulan') ? { poli: '' } : {}) }));
  const specs: Array<{ key: keyof LarasFilters; label: string; all: string; options: Array<{value: string; label: string}> }> = [
    { key: 'bulan', label: 'Bulan', all: 'Semua bulan', options: data?.filter_options.bulan || [] },
    { key: 'faskes', label: 'Fasilitas Kesehatan', all: 'Semua fasilitas', options: data?.filter_options.faskes || [] },
    { key: 'poli', label: 'Nama Poli', all: 'Semua poli', options: (data?.filter_options.poli || []).map(value => ({value, label: value})) },
    { key: 'jenis_kunjungan', label: 'Jenis Kunjungan', all: 'Semua kunjungan', options: (data?.filter_options.jenis_kunjungan || []).map(value => ({value, label: value})) },
  ];
  const hasFilters = Object.values(filters).some(Boolean);
  return <div className="sapa-page laras-page berry-dashboard">
    <header className="laras-heading berry-dashboard-heading"><div><p className="sapa-eyebrow">Pemantauan rawat jalan</p><Typography component="h1" variant="h3" className="sapa-title">Monitoring <span className="laras-wordmark">L A R A S</span></Typography><p className="sapa-description">Optimalisasi Waktu Tunggu Rawat Jalan Di Rumah Sakit</p></div><span className="laras-heading-tag">Waktu layanan</span></header>
    <MainCard content={false} className="laras-filters berry-dashboard-card" aria-label="Filter monitoring LARAS">
      <div className="laras-filter-grid">{specs.map(spec => <div className="laras-filter" key={spec.key}><label htmlFor={`laras-${spec.key}`}>{spec.label}</label><FilterSelect id={`laras-${spec.key}`} aria-label={spec.label} value={filters[spec.key]} className="w-full" disabled={query.isPending} onChange={event => update(spec.key, event.target.value)}><FilterOption value="">{spec.all}</FilterOption>{spec.options.filter(option => option.value !== '').map(option => <FilterOption key={option.value} value={option.value}>{option.label}</FilterOption>)}{filters[spec.key] && !spec.options.some(option => option.value === filters[spec.key]) && <FilterOption value={filters[spec.key]}>{filters[spec.key]}</FilterOption>}</FilterSelect>{spec.key === 'jenis_kunjungan' && <small className="laras-filter-hint">Sumber saat ini hanya memuat semua jenis kunjungan.</small>}</div>)}</div>
      <div className="laras-filter-footer"><p role="status" aria-live="polite">{query.isFetching ? 'Memuat data sesuai filter…' : hasFilters ? 'Data ditampilkan sesuai pilihan filter.' : 'Menampilkan seluruh periode yang tersedia.'}</p><AnimatedButton className="sapa-button sapa-button-secondary" disabled={!hasFilters} onClick={() => setFilters({ ...EMPTY_LARAS_FILTERS })}>Reset filter</AnimatedButton></div>
    </MainCard>
    {query.isPending ? <KerangkaMemuat label="Memuat monitoring LARAS" /> : query.isError ? <MainCard content={false} className="laras-state berry-dashboard-card" role="alert"><Typography component="h2" variant="h4">Data LARAS belum dapat dimuat</Typography><p>Sumber mungkin sedang tidak tersedia. Coba muat kembali.</p><AnimatedButton className="sapa-button" onClick={() => void query.refetch()} disabled={query.isFetching}>Coba lagi</AnimatedButton></MainCard> : data && <div aria-busy={query.isFetching}>
      <section className="laras-summary" aria-label="Ringkasan waktu layanan"><MainCard content={false} className="laras-score berry-dashboard-card"><p className="sapa-eyebrow">Rata-Rata Waktu 3-4 dan 2-4</p><div className="laras-score-value" title={data.kpi.avg_seconds == null ? undefined : duration(data.kpi.avg_seconds)}>{duration(data.kpi.avg_seconds)}</div><p>{data.kpi.avg_seconds == null ? 'Belum tersedia untuk pilihan ini.' : `${data.kpi.sample_count.toLocaleString('id-ID')} agregat sumber`}</p><small>{data.metadata.selected_period && <>Periode pembanding: {data.metadata.selected_period}<br /></>}{data.kpi.basis}</small></MainCard><MainCard content={false} className="laras-context berry-dashboard-card"><p className="sapa-eyebrow">Cakupan pembacaan</p><Typography component="h2" variant="h4">Agregat waktu layanan</Typography><p>{data.metadata.source_scope}</p><p className="laras-context-note">Rata-rata agregat sumber tanpa pembobotan jumlah pasien. Baca bersama cakupan dan batasan data.</p></MainCard></section>
      {data.status === 'no_data' && <div className="laras-no-data" role="status"><strong>Tidak ada data untuk pilihan ini.</strong><span>Ubah pilihan atau reset filter untuk melihat data yang tersedia.</span></div>}
      <div className="laras-chart-grid"><Chart title="Rata-Rata Waktu Per Bulan" chart={{ ...data.charts.per_bulan, message: data.charts.per_bulan.message || (filters.bulan ? 'Menampilkan bulan yang dipilih.' : `Seluruh bulan tersedia; pembanding lainnya menggunakan ${data.metadata.selected_period || 'periode terbaru'}.`) }} vertical /><Chart title="Rata-Rata Waktu Per Kabupaten/Kota" chart={data.charts.per_kabupaten} /><Chart title="Rata-Rata Waktu per Hari" chart={data.charts.per_hari} /><Chart title="Rata-Rata Waktu Per Fasilitas Kesehatan" chart={data.charts.per_faskes} /><Chart title="Rata-Rata Waktu Per Poli" chart={data.charts.per_poli} /></div>
      <footer className="laras-source berry-dashboard-card"><div><Typography component="h2" variant="h4">Catatan sumber</Typography><p>{data.metadata.methodology}</p><p>Terakhir diperbarui: {data.metadata.last_updated || 'Belum tersedia'}</p></div><a href="https://docs.google.com/spreadsheets/d/1rKEVk54FM7pDf2FpNA35ycTvvMsG542npXsU_xjaaoE/edit" target="_blank" rel="noopener noreferrer">Lihat sumber data<span className="sr-only"> (tab baru)</span> <span aria-hidden="true">↗</span></a>{data.metadata.limitations.length > 0 && <details><summary>Batasan data ({data.metadata.limitations.length})</summary><ul>{data.metadata.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></details>}</footer>
    </div>}
  </div>;
}
