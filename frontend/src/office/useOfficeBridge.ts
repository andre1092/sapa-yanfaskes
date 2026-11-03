import { useCallback, useEffect, useRef, useState } from 'react';
import * as bridge from './bridge';
import { TERMINAL_STATES, type JobEvent, type JobState, type SecurityReport } from './bridge';

export type BridgeStatus = 'checking' | 'offline' | 'unpaired' | 'ready';
export interface OfficeJob {
  id: string; findingId: string; check: string; state: JobState; lines: string[]; branch?: string; headSha?: string; prNumber?: number; prUrl?: string;
  compareUrl?: string; verified?: boolean | null; summary?: string; error?: string;
}
export const RUNNING_STATES: JobState[] = ['queued', 'preparing', 'working', 'verifying', 'pushing', 'merging'];

export function useOfficeBridge() {
  const [status, setStatus] = useState<BridgeStatus>('checking');
  const [canMerge, setCanMerge] = useState(false);
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<OfficeJob | null>(null);
  const streamRef = useRef<AbortController | null>(null);
  const lastSeq = useRef(-1);

  const check = useCallback(async () => {
    const result = await bridge.health();
    setStatus(!result ? 'offline' : result.paired ? 'ready' : 'unpaired');
    setCanMerge(Boolean(result?.canMerge));
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), 10_000);
    return () => window.clearInterval(timer);
  }, [check]);

  useEffect(() => {
    if (status !== 'ready') return;
    bridge.getReport().then(setReport).catch(() => { /* belum ada laporan: dibuat saat meja pertama diperiksa */ });
  }, [status]);

  useEffect(() => () => streamRef.current?.abort(), []);

  const pair = useCallback(async (token: string) => {
    bridge.setToken(token);
    await check();
  }, [check]);

  const scan = useCallback(async (stationId: string) => {
    setScanning(stationId); setError(null); setNotes([]);
    try {
      const result = await bridge.scan(stationId);
      if (result.report) setReport(result.report);
      setNotes(result.skipped.map(s => s.reason));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pemindaian gagal');
    } finally { setScanning(null); }
  }, []);

  const follow = useCallback(async (jobId: string) => {
    streamRef.current?.abort();
    const controller = new AbortController();
    streamRef.current = controller;
    const apply = (event: JobEvent) => {
      lastSeq.current = Math.max(lastSeq.current, event.seq);
      if (event.report) setReport(event.report);
      setJob(current => {
        if (!current || current.id !== jobId) return current;
        const next: OfficeJob = { ...current };
        if (event.state) next.state = event.state;
        if (event.type === 'log' && event.text) next.lines = [...current.lines, event.text].slice(-12);
        if (event.type === 'status' && event.text) next.lines = [...current.lines, event.text].slice(-12);
        if (event.type === 'error') next.error = event.text;
        if (event.type === 'deployed' && event.text) next.lines = [...current.lines, event.text].slice(-12);
        if (event.type === 'ready') Object.assign(next, { branch: event.branch, headSha: event.headSha, prNumber: event.prNumber, prUrl: event.prUrl, compareUrl: event.compareUrl, verified: event.verified, summary: event.summary });
        return next;
      });
    };
    try { await bridge.streamJob(jobId, lastSeq.current, apply, controller.signal); } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Koneksi ke jembatan terputus');
    }
  }, []);

  const fix = useCallback(async (findingId: string, check: string) => {
    setError(null);
    try {
      const { job: started } = await bridge.startFix(findingId);
      lastSeq.current = -1;
      setJob({ id: started.id, findingId, check, state: 'queued', lines: [] });
      void follow(started.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal memulai perbaikan'); }
  }, [follow]);

  const approve = useCallback(async () => {
    if (!job) return;
    setError(null);
    try {
      await bridge.approve(job.id);
      setJob(current => current && { ...current, state: 'merging' });
      void follow(job.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Persetujuan ditolak'); }
  }, [job, follow]);

  const running = job ? RUNNING_STATES.includes(job.state) : false;
  return { status, canMerge, report, scanning, notes, error, job, running, pair, scan, fix, approve, dismissJob: () => { if (job && TERMINAL_STATES.includes(job.state)) setJob(null); } };
}
