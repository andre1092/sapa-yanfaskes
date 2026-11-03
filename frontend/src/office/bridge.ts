import type { Severity } from './securityOfficeScene';

// Klien jembatan lokal (automation/security_agent/bridge). Jembatan berjalan di mesin pemilik repositori;
// halaman produksi hanya bisa memakainya dari browser pemilik yang sudah memasukkan token pairing.
export const BRIDGE_URL = 'http://127.0.0.1:43125';
const TOKEN_KEY = 'sapa-office-bridge-token';

export interface Finding { id: string; severity: Severity; category: string; check: string; title: string; location: string; evidence: string; recommendation: string }
export interface Check { id: string; name: string; status: 'ok' | 'error'; note: string; findings: number }
export interface SecurityReport { generated_at: string; commit: string; target: string; summary: Record<Severity, number>; checks: Check[]; findings: Finding[] }

export interface BridgeHealth { ok: boolean; paired: boolean; canMerge: boolean }
export type JobState = 'queued' | 'preparing' | 'working' | 'verifying' | 'pushing' | 'ready' | 'failed' | 'merging' | 'deployed' | 'deploy_failed';
export interface JobEvent {
  seq: number; type: string; state?: JobState; text?: string; branch?: string; headSha?: string; prNumber?: number; prUrl?: string;
  compareUrl?: string; verified?: boolean | null; summary?: string; report?: SecurityReport;
}
export const TERMINAL_STATES: JobState[] = ['ready', 'failed', 'deployed', 'deploy_failed'];

// Meja yang memeriksa tiap pemeriksaan; dipakai agar agen berjalan ke meja yang benar saat bekerja.
export const STATION_OF_CHECK: Record<string, 'code' | 'deps' | 'production' | 'privacy' | 'logs'> = {
  secrets: 'code', code: 'code', npm: 'deps', python: 'deps', headers: 'production', auth_probe: 'production', privacy: 'privacy', vercel_logs: 'logs',
};

export const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } };
export const setToken = (token: string) => { try { sessionStorage.setItem(TOKEN_KEY, token.trim()); } catch { /* tanpa penyimpanan: token hanya berlaku untuk sesi ini */ } };

async function request(path: string, init: RequestInit = {}, timeoutMs = 0): Promise<Response> {
  const token = getToken();
  return fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: init.signal ?? (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined),
  });
}

export async function health(): Promise<BridgeHealth | null> {
  try {
    const response = await request('/health', {}, 1500);
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `Jembatan menjawab ${response.status}`);
  return body as T;
}

export const getReport = () => request('/report').then(r => json<{ report: SecurityReport }>(r)).then(b => b.report);
export const scan = (stationId: string) => request('/scan', { method: 'POST', body: JSON.stringify({ stationId }) })
  .then(r => json<{ report: SecurityReport | null; ran: string[]; skipped: { id: string; reason: string }[] }>(r));
export const startFix = (findingId: string) => request('/fix', { method: 'POST', body: JSON.stringify({ findingId }) }).then(r => json<{ job: { id: string } }>(r));
export const approve = (jobId: string) => request('/approve', { method: 'POST', body: JSON.stringify({ jobId }) }).then(r => json<{ job: { id: string } }>(r));

// Membaca aliran SSE lewat fetch (EventSource tidak bisa mengirim header Authorization).
export async function streamJob(jobId: string, after: number, onEvent: (event: JobEvent) => void, signal: AbortSignal): Promise<void> {
  const response = await request(`/jobs/${encodeURIComponent(jobId)}/events?after=${after}`, { signal });
  if (!response.ok || !response.body) throw new Error(`Aliran pekerjaan gagal (${response.status})`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, index); buffer = buffer.slice(index + 2);
      if (chunk.startsWith('data: ')) onEvent(JSON.parse(chunk.slice(6)) as JobEvent);
    }
  }
}
