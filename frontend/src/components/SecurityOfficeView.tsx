import { useEffect, useMemo, useRef, useState } from 'react';
import { Chip, Stack, Typography } from '@mui/material';
import MainCard from '../berry/MainCard';
import '../berry/berry-dashboards.css';
import './SecurityOfficeView.css';
import { useThemeStore } from '../store/themeStore';
import { createSecurityOffice, type SecurityOffice, type Severity, type StationId, type StationState } from '../office/securityOfficeScene';

interface Finding { id: string; severity: Severity; category: string; check: string; title: string; location: string; evidence: string; recommendation: string }
interface Check { id: string; name: string; status: 'ok' | 'error'; note: string; findings: number }
interface SecurityReport { generated_at: string; commit: string; target: string; summary: Record<Severity, number>; checks: Check[]; findings: Finding[] }

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Kritis', high: 'Tinggi', medium: 'Sedang', low: 'Rendah', info: 'Info' };
const STATIONS: { id: StationId; label: string; short: string; checks: string[]; role: string }[] = [
  { id: 'code', label: 'Meja Audit Kode', short: 'Kode', checks: ['secrets', 'code'], role: 'Rahasia ter-commit dan pola kode rawan' },
  { id: 'deps', label: 'Ruang Server Dependensi', short: 'Dependensi', checks: ['npm', 'python'], role: 'Paket npm dan Python yang rentan' },
  { id: 'production', label: 'Pos Pantau Produksi', short: 'Produksi', checks: ['headers', 'auth_probe'], role: 'Header keamanan dan akses API tanpa login' },
  { id: 'privacy', label: 'Arsip Privasi Data', short: 'Privasi', checks: ['privacy'], role: 'NIK, nomor HP dan email di kode atau respons' },
  { id: 'logs', label: 'Monitor Log Vercel', short: 'Log Vercel', checks: ['vercel_logs'], role: 'Galat runtime dan pola serangan' },
  { id: 'ceo', label: 'Meja CEO · Persetujuan', short: 'CEO', checks: [], role: 'Deploy produksi hanya setelah CEO menyetujui PR' },
];

const worstOf = (findings: Finding[]) => SEVERITIES.find(severity => findings.some(f => f.severity === severity));
const formatTime = (iso: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export function SecurityOfficeView() {
  const effectiveTheme = useThemeStore(state => state.effectiveTheme);
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [active, setActive] = useState<StationId | null>(null);
  const [labels, setLabels] = useState<{ id: StationId; x: number; y: number }[]>([]);
  const [compact, setCompact] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const officeRef = useRef<SecurityOffice | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Laporan hanya disajikan server pengembangan lokal; repositori publik dan auth API belum ketat.
    fetch('/__security-agent/report', { cache: 'no-store' })
      .then(response => response.ok && response.headers.get('content-type')?.includes('json') ? response.json() : Promise.reject())
      .then(data => { if (!cancelled) { setReport(data); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('unavailable'); });
    return () => { cancelled = true; };
  }, []);

  const stationStates = useMemo<StationState[]>(() => STATIONS.map(station => {
    if (station.id === 'ceo') return { id: station.id, label: station.label, worst: report ? 'clear' : 'idle', count: 0 };
    const findings = report?.findings.filter(f => station.checks.includes(f.check)) ?? [];
    const ran = report?.checks.some(c => station.checks.includes(c.id) && c.status === 'ok');
    return { id: station.id, label: station.label, worst: worstOf(findings) ?? (ran ? 'clear' : 'idle'), count: findings.length };
  }), [report]);

  useEffect(() => {
    if (!hostRef.current) return;
    const office = createSecurityOffice(hostRef.current, {
      dark: effectiveTheme === 'dark',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onSelect: id => setActive(current => current === id ? null : id),
      onLabels: next => { setLabels(next); setCompact((hostRef.current?.clientWidth ?? 800) < 640); },
    });
    officeRef.current = office;
    return () => { office.dispose(); officeRef.current = null; };
  }, [effectiveTheme]);

  useEffect(() => { officeRef.current?.update(stationStates); }, [stationStates, effectiveTheme]);
  useEffect(() => { officeRef.current?.setActive(active); }, [active, effectiveTheme]);

  const activeStation = STATIONS.find(s => s.id === active);
  const visible = (report?.findings ?? []).filter(f => !activeStation || activeStation.checks.includes(f.check));
  const failedChecks = report?.checks.filter(c => c.status === 'error') ?? [];

  return <div className="sapa-page security-office">
    <header className="security-office-header">
      <div>
        <p className="sapa-eyebrow">KARYAWAN AI · PRIVASI & KEAMANAN</p>
        <Typography component="h1" variant="h2">Kantor Penjaga Keamanan</Typography>
        <Typography color="text.secondary">
          {status === 'ready' && report ? `Patroli terakhir ${formatTime(report.generated_at)} · commit ${report.commit} · ${report.target}` :
            status === 'loading' ? 'Memuat laporan patroli…' : 'Laporan patroli hanya tersedia di server pengembangan lokal.'}
        </Typography>
      </div>
      {report && <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap aria-label="Ringkasan temuan">
        {SEVERITIES.filter(s => s !== 'info').map(s => <Chip key={s} className={`severity-chip severity-${s}`} label={`${SEVERITY_LABEL[s]} ${report.summary[s]}`} />)}
      </Stack>}
    </header>

    <div className="security-office-grid">
      <MainCard content={false} className="security-office-stage berry-dashboard-card">
        <div className="security-office-canvas" ref={hostRef}>
          {labels.map(label => {
            const state = stationStates.find(s => s.id === label.id)!;
            return <button key={label.id} type="button" className={`office-tag office-${state.worst} ${active === label.id ? 'is-active' : ''}`}
              style={{ left: label.x, top: label.y }} aria-pressed={active === label.id} onClick={() => setActive(active === label.id ? null : label.id)}>
              <span aria-hidden={compact}>{compact ? STATIONS.find(s => s.id === label.id)!.short : state.label}</span>{compact && <span className="sr-only">{state.label}</span>}{state.count > 0 && <span className="office-tag-count">{state.count}</span>}
            </button>;
          })}
        </div>
      </MainCard>

      <MainCard content={false} className="security-office-panel berry-dashboard-card" aria-labelledby="office-panel-title">
        <div className="security-office-panel-inner">
          <Typography id="office-panel-title" component="h2" variant="h4">{activeStation ? activeStation.label : 'Semua temuan'}</Typography>
          <Typography variant="body2" color="text.secondary">{activeStation?.role ?? 'Pilih meja di kantor untuk melihat temuan per bidang.'}</Typography>
          {active === 'ceo' && <div className="office-approval" role="note">
            <strong>Gerbang persetujuan CEO</strong>
            <p>Agen membuat perbaikan di branch dan membuka PR. Deploy ke produksi hanya setelah CEO menulis di chat persetujuan untuk PR yang tepat, misalnya “setuju deploy PR #12”.</p>
          </div>}
          {status === 'unavailable' && <p className="office-empty">Jalankan <code>patroli keamanan</code> lalu buka halaman ini dari <code>npm run dev</code>. Laporan hanya tersedia di server dev lokal karena berisi detail kerentanan dan repositori ini publik.</p>}
          {failedChecks.length > 0 && <p className="office-warning" role="status">{failedChecks.length} pemeriksaan gagal: {failedChecks.map(c => c.name).join(', ')}.</p>}
          {report && active !== 'ceo' && (visible.length === 0 ? <p className="office-empty">Tidak ada temuan di bidang ini.</p> :
            <ol className="office-findings" aria-label="Daftar temuan">
              {visible.map(f => <li key={f.id} className={`office-finding severity-${f.severity}`}>
                <div className="office-finding-head"><span className={`severity-dot severity-${f.severity}`} aria-hidden="true" /><strong>{f.title}</strong></div>
                <span className="office-finding-meta">{SEVERITY_LABEL[f.severity]} · {f.location} · <code>{f.id}</code></span>
                <span className="office-finding-fix">{f.recommendation}</span>
              </li>)}
            </ol>)}
        </div>
      </MainCard>
    </div>
  </div>;
}

export default SecurityOfficeView;
