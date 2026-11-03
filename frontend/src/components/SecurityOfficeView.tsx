import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Chip, Stack, Typography } from '@mui/material';
import MainCard from '../berry/MainCard';
import '../berry/berry-dashboards.css';
import './SecurityOfficeView.css';
import { useThemeStore } from '../store/themeStore';
import { createSecurityOffice, type SecurityOffice, type Severity, type StationId, type StationState } from '../office/securityOfficeScene';
import { STATION_OF_CHECK, TERMINAL_STATES, type Finding, type JobState, type SecurityReport } from '../office/bridge';
import { useOfficeBridge } from '../office/useOfficeBridge';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Kritis', high: 'Tinggi', medium: 'Sedang', low: 'Rendah', info: 'Info' };
const JOB_LABEL: Record<JobState, string> = {
  queued: 'Antre', preparing: 'Menyiapkan', working: 'Mengerjakan', verifying: 'Memindai ulang', pushing: 'Mengirim branch',
  ready: 'Siap ditinjau', failed: 'Gagal', merging: 'Merge dan menunggu deploy', deployed: 'Selesai di produksi', deploy_failed: 'Deploy gagal',
};
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
  const bridge = useOfficeBridge();
  const [devReport, setDevReport] = useState<SecurityReport | null>(null);
  const [devStatus, setDevStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [active, setActive] = useState<StationId | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Severity | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [labels, setLabels] = useState<{ id: StationId; x: number; y: number }[]>([]);
  const [compact, setCompact] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const officeRef = useRef<SecurityOffice | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ choose: (_id: StationId) => {}, patrol: () => {} });

  useEffect(() => {
    let cancelled = false;
    // Laporan hanya disajikan server pengembangan lokal atau jembatan lokal; repositori publik dan auth API belum ketat.
    fetch('/__security-agent/report', { cache: 'no-store' })
      .then(response => response.ok && response.headers.get('content-type')?.includes('json') ? response.json() : Promise.reject())
      .then(data => { if (!cancelled) { setDevReport(data); setDevStatus('ready'); } })
      .catch(() => { if (!cancelled) setDevStatus('unavailable'); });
    return () => { cancelled = true; };
  }, []);

  const report = bridge.report ?? devReport;
  const status = report ? 'ready' : bridge.status === 'ready' ? 'empty' : devStatus;
  const bridgeReady = bridge.status === 'ready';
  const busy = bridge.scanning !== null || bridge.running;

  const stationStates = useMemo<StationState[]>(() => STATIONS.map(station => {
    if (station.id === 'ceo') return { id: station.id, label: station.label, worst: report ? 'clear' : 'idle', count: 0 };
    const findings = report?.findings.filter(f => station.checks.includes(f.check)) ?? [];
    const ran = report?.checks.some(c => station.checks.includes(c.id) && c.status === 'ok');
    return { id: station.id, label: station.label, worst: worstOf(findings) ?? (ran ? 'clear' : 'idle'), count: findings.length };
  }), [report]);

  const choose = (id: StationId) => {
    const next = active === id ? null : id;
    setActive(next);
    // Memilih meja langsung memeriksa bidangnya bila jembatan lokal terhubung.
    if (next && next !== 'ceo' && bridgeReady && !busy) void bridge.scan(next);
  };
  const patrol = () => {
    setActive(null);
    if (bridgeReady && !busy) void bridge.scan('all');
  };
  useEffect(() => { handlers.current = { choose, patrol }; });

  useEffect(() => {
    if (!hostRef.current) return;
    const office = createSecurityOffice(hostRef.current, {
      dark: effectiveTheme === 'dark',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onSelect: id => handlers.current.choose(id),
      onAgent: () => handlers.current.patrol(),
      onLabels: next => { setLabels(next); setCompact((hostRef.current?.clientWidth ?? 800) < 640); },
    });
    officeRef.current = office;
    return () => { office.dispose(); officeRef.current = null; };
  }, [effectiveTheme]);

  // Saat bekerja, agen berjalan ke meja pemeriksaan yang sedang dikerjakannya dan berhenti di sana.
  const workingStation: StationId | null = bridge.running && bridge.job ? STATION_OF_CHECK[bridge.job.check] ?? null
    : bridge.scanning && bridge.scanning !== 'all' ? bridge.scanning as StationId : null;
  useEffect(() => { officeRef.current?.update(stationStates); }, [stationStates, effectiveTheme]);
  useEffect(() => { officeRef.current?.setActive(workingStation ?? active); }, [workingStation, active, effectiveTheme]);
  useEffect(() => { officeRef.current?.setBusy(busy); }, [busy, effectiveTheme]);

  // Di layar sempit panel berada di bawah kanvas; bawa ke layar agar klik meja terlihat hasilnya.
  useEffect(() => {
    if (!active || !window.matchMedia('(max-width: 960px)').matches) return;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [active]);

  const activeStation = STATIONS.find(s => s.id === active);
  const visible = (report?.findings ?? []).filter(f => (!activeStation || activeStation.checks.includes(f.check)) && (!severityFilter || f.severity === severityFilter));
  const failedChecks = report?.checks.filter(c => c.status === 'error') ?? [];
  const canRescan = bridgeReady && active !== 'ceo';
  const title = activeStation ? activeStation.label : 'Semua temuan';
  const job = bridge.job;
  const jobFinding = job ? report?.findings.find(f => f.id === job.findingId) : undefined;
  const pairing = (event: FormEvent) => { event.preventDefault(); if (tokenInput.trim()) { void bridge.pair(tokenInput); setTokenInput(''); } };

  return <div className="sapa-page security-office">
    <header className="security-office-header">
      <div>
        <p className="sapa-eyebrow">KARYAWAN AI · PRIVASI & KEAMANAN</p>
        <Typography component="h1" variant="h2">Kantor Penjaga Keamanan</Typography>
        <Typography color="text.secondary">
          {status === 'ready' && report ? `Patroli terakhir ${formatTime(report.generated_at)} · commit ${report.commit} · ${report.target}` :
            status === 'empty' ? 'Belum ada laporan. Pilih meja atau agen untuk memeriksa.' :
            status === 'loading' ? 'Memuat laporan patroli…' : 'Laporan patroli hanya tersedia di server pengembangan lokal.'}
        </Typography>
      </div>
      {report && <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap aria-label="Ringkasan temuan">
        {SEVERITIES.filter(s => s !== 'info').map(s => <Chip key={s} className={`severity-chip severity-${s}${severityFilter === s ? ' is-active' : ''}`} label={`${SEVERITY_LABEL[s]} ${report.summary[s]}`}
          clickable onClick={() => setSeverityFilter(current => current === s ? null : s)} aria-pressed={severityFilter === s} />)}
      </Stack>}
    </header>

    <div className="security-office-grid">
      <MainCard content={false} className="security-office-stage berry-dashboard-card">
        <div className="security-office-canvas" ref={hostRef}>
          {labels.map(label => {
            const state = stationStates.find(s => s.id === label.id)!;
            return <button key={label.id} type="button" className={`office-tag office-${state.worst} ${active === label.id ? 'is-active' : ''}`}
              style={{ left: label.x, top: label.y }} aria-pressed={active === label.id} onClick={() => choose(label.id)}>
              <span aria-hidden={compact}>{compact ? STATIONS.find(s => s.id === label.id)!.short : state.label}</span>{compact && <span className="sr-only">{state.label}</span>}{state.count > 0 && <span className="office-tag-count">{state.count}</span>}
            </button>;
          })}
        </div>
      </MainCard>

      <MainCard content={false} className="security-office-panel berry-dashboard-card" aria-labelledby="office-panel-title">
        <div className="security-office-panel-inner" ref={panelRef}>
          <Typography id="office-panel-title" component="h2" variant="h4">
            {canRescan ? <button type="button" className="office-title-btn" disabled={busy} onClick={() => void bridge.scan(active ?? 'all')}>{title}<span aria-hidden="true"> ↻</span><span className="sr-only"> (periksa ulang)</span></button> : title}
          </Typography>
          <Typography variant="body2" color="text.secondary">{activeStation?.role ?? 'Pilih meja di kantor untuk melihat temuan per bidang.'}</Typography>
          {active === 'ceo' && <div className="office-approval" role="note">
            <strong>Gerbang persetujuan CEO</strong>
            <p>Agen membuat perbaikan di branch dan membuka PR. Merge dan deploy ke produksi hanya setelah CEO menyetujui PR yang tepat: lewat tombol “Setujui &amp; deploy” di halaman ini (terikat pada satu PR dan satu commit) atau dengan menulis persetujuan di chat.</p>
          </div>}

          {bridge.status === 'unpaired' && <form className="office-pair" onSubmit={pairing}>
            <label htmlFor="office-bridge-token">Jembatan lokal terdeteksi. Tempel token pairing dari terminal untuk memakainya.</label>
            <div><input id="office-bridge-token" type="password" autoComplete="off" value={tokenInput} onChange={e => setTokenInput(e.target.value)} /><button type="submit">Hubungkan</button></div>
          </form>}
          {bridge.scanning && <p className="office-empty" role="status">Memeriksa {bridge.scanning === 'all' ? 'semua bidang' : STATIONS.find(s => s.id === bridge.scanning)?.short}…</p>}
          {bridge.error && <p className="office-warning" role="alert">{bridge.error}</p>}
          {bridge.notes.map(note => <p key={note} className="office-warning" role="status">{note}</p>)}

          {job && <section className="office-job" aria-live="polite" aria-label="Pekerjaan agen">
            <div className="office-job-head"><strong>Agen: {JOB_LABEL[job.state]}</strong>{TERMINAL_STATES.includes(job.state) && <button type="button" onClick={bridge.dismissJob}>Tutup</button>}</div>
            {jobFinding && <span className="office-finding-meta">{jobFinding.title}</span>}
            {job.lines.length > 0 && <ol className="office-job-log">{job.lines.slice(-5).map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}</ol>}
            {job.error && <p className="office-warning" role="alert">{job.error}</p>}
            {job.state === 'ready' && <>
              <p className="office-empty">{job.verified === true ? 'Pemindaian ulang di branch: temuan hilang.' : job.verified === false ? 'Pemindaian ulang di branch: temuan MASIH ada. Tinjau dulu.' : 'Pemindaian ulang tidak bisa dibuktikan di branch (pemeriksaan terhadap produksi).'}</p>
              {job.summary && <p className="office-job-summary">{job.summary}</p>}
              {(job.prUrl || job.compareUrl) && <a href={job.prUrl ?? job.compareUrl} target="_blank" rel="noreferrer">{job.prUrl ? `Buka PR #${job.prNumber}` : 'Buka PR di GitHub'}</a>}
              {bridge.canMerge && job.prNumber
                ? <button type="button" className="office-approve-btn" onClick={() => void bridge.approve()}>Setujui &amp; deploy PR #{job.prNumber} · {job.headSha?.slice(0, 7)}</button>
                : <p className="office-empty">Untuk menyetujui dari halaman ini, jalankan jembatan dengan SAPA_GITHUB_TOKEN. Atau merge lewat GitHub setelah meninjau.</p>}
            </>}
          </section>}

          {status === 'unavailable' && bridge.status !== 'unpaired' && <div className="office-empty" role="status">
            <p><strong>{activeStation ? `Detail temuan ${activeStation.short} tidak ditampilkan di sini.` : 'Detail temuan tidak ditampilkan di sini.'}</strong></p>
            <p>Laporan patroli berisi detail kerentanan dan repositori ini publik, jadi hanya dilayani server pengembangan lokal. Jalankan <code>patroli keamanan</code>, lalu buka halaman ini dari <code>npm run dev</code>.</p>
            <p>Untuk memeriksa dan memperbaiki langsung dari halaman ini, jalankan jembatan lokal di Mac pemilik repositori: <code>npm --prefix frontend run office:bridge</code>.</p>
          </div>}
          {failedChecks.length > 0 && <p className="office-warning" role="status">{failedChecks.length} pemeriksaan gagal: {failedChecks.map(c => c.name).join(', ')}.</p>}
          {report && active !== 'ceo' && (visible.length === 0 ? <p className="office-empty">Tidak ada temuan di bidang ini{severityFilter ? ` dengan tingkat ${SEVERITY_LABEL[severityFilter]}` : ''}.</p> :
            <ol className="office-findings" aria-label="Daftar temuan">
              {visible.map(f => <li key={f.id} className={`office-finding severity-${f.severity}`}>
                <div className="office-finding-head"><span className={`severity-dot severity-${f.severity}`} aria-hidden="true" /><strong>{f.title}</strong></div>
                <span className="office-finding-meta">{SEVERITY_LABEL[f.severity]} · {f.location} · <code>{f.id}</code></span>
                <span className="office-finding-fix">{f.recommendation}</span>
                {bridgeReady && <button type="button" className="office-fix-btn" disabled={busy} onClick={() => void bridge.fix(f.id, f.check)}>{job?.findingId === f.id && bridge.running ? 'Sedang dikerjakan…' : 'Kerjakan'}</button>}
              </li>)}
            </ol>)}
        </div>
      </MainCard>
    </div>
  </div>;
}

export default SecurityOfficeView;
