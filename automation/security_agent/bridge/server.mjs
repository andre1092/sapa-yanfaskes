#!/usr/bin/env node
// Jembatan lokal antara halaman Kantor Keamanan dan mesin pemilik repositori.
// Menjalankan pemindai per meja, mengerjakan perbaikan lewat Claude Code (claude -p) di worktree
// sendiri, mendorong branch dan membuka PR. Merge hanya lewat /approve, terikat pada satu PR dan satu commit.
// Hanya mendengarkan 127.0.0.1; lihat lib.mjs#authorize untuk lapisan pengamanan.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as lib from './lib.mjs';

const TERMINAL = new Set(['ready', 'failed', 'deployed', 'deploy_failed']);
const FIX_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(git:*)', 'Bash(npm:*)', 'Bash(npx:*)', 'Bash(node:*)', 'Bash(python3:*)', 'Bash(ls:*)', 'Bash(cat:*)'];
const FIX_DENY = ['Bash(git push:*)', 'Bash(gh:*)', 'Bash(curl:*)', 'Bash(wget:*)', 'Bash(rm:*)', 'Bash(sudo:*)', 'Read(.env*)', 'Read(**/.env*)'];

function defaultRun(cmd, args, { cwd, timeout = 120_000, env, input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (error) => { clearTimeout(timer); resolve({ code: 127, stdout, stderr: String(error.message) }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin.end(input ?? '');
  });
}

export function createBridge(options) {
  const root = options.root;
  const reports = path.join(root, 'automation/security_agent/reports');
  const port = options.port;
  const origins = options.origins ?? lib.DEFAULT_ORIGINS;
  const token = options.token;
  const githubToken = options.githubToken ?? '';
  const python = options.python ?? 'python3';
  const run = options.run ?? defaultRun;
  const claudeBin = options.claudeBin ?? 'claude';
  const worktreeRoot = options.worktreeRoot ?? path.join(os.homedir(), '.local/share/sapa-security-agent/worktrees');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const scanScript = (base) => path.join(base, 'automation/security_agent/scan.py');

  const jobs = new Map();
  let scanning = false;
  let activeJob = null;

  const readLatest = async () => {
    try { return JSON.parse(await readFile(path.join(reports, 'latest.json'), 'utf8')); } catch { return null; }
  };

  // ---------- pemindaian ----------
  async function scan(stationId) {
    const checks = lib.checksFor(stationId);
    if (!checks) return { status: 404, body: { error: 'Meja tidak dikenal' } };
    if (!checks.length) return { status: 400, body: { error: 'Meja ini tidak punya pemeriksaan' } };
    if (scanning) return { status: 409, body: { error: 'Pemindaian lain sedang berjalan' } };
    scanning = true;
    try {
      const logsFile = path.join(reports, 'vercel-logs.json');
      const skipped = [];
      const todo = checks.filter((id) => {
        if (id === 'vercel_logs' && !existsSync(logsFile)) { skipped.push({ id, reason: 'Log Vercel belum diambil. Minta agen mengambilnya lewat Vercel MCP (perintah patroli keamanan).' }); return false; }
        return true;
      });
      if (!todo.length) return { status: 200, body: { report: await readLatest(), ran: [], skipped } };
      await mkdir(path.join(reports, 'partial'), { recursive: true });
      const out = path.join(reports, 'partial', `${Date.now()}-${stationId}.json`);
      const args = [scanScript(root), '--only', todo.join(','), '--out', out];
      if (todo.includes('vercel_logs')) args.push('--vercel-logs', logsFile);
      await run(python, args, { cwd: root, timeout: 180_000 }); // kode keluar 1 = ada temuan kritis
      if (!existsSync(out)) return { status: 502, body: { error: 'Pemindai tidak menghasilkan laporan' } };
      const partial = JSON.parse(await readFile(out, 'utf8'));
      await rm(out, { force: true });
      const merged = lib.mergeReports(await readLatest(), partial, todo);
      await writeFile(path.join(reports, 'latest.json'), JSON.stringify(merged, null, 2));
      return { status: 200, body: { report: merged, ran: todo, skipped } };
    } finally { scanning = false; }
  }

  // ---------- GitHub ----------
  async function github(method, apiPath, body) {
    const response = await fetchImpl(`https://api.github.com${apiPath}`, {
      method,
      headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sapa-security-bridge', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }
  const remote = async () => options.repo ?? lib.parseGitHubRemote((await run('git', ['remote', 'get-url', 'origin'], { cwd: root })).stdout);

  // ---------- pekerjaan ----------
  function emit(job, event) {
    const full = { ...event, seq: job.events.length, at: Date.now() };
    if (event.state) job.state = event.state;
    job.events.push(full);
    if (job.events.length > 600) job.events.splice(0, 100);
    for (const listener of job.listeners) listener(full);
  }
  const publicJob = (job) => ({ id: job.id, findingId: job.findingId, state: job.state, branch: job.branch, headSha: job.headSha, prNumber: job.prNumber, prUrl: job.prUrl, compareUrl: job.compareUrl, verified: job.verified });

  async function startFix(findingId) {
    if (!lib.FINDING_ID.test(findingId ?? '')) return { status: 400, body: { error: 'ID temuan tidak valid' } };
    const finding = (await readLatest())?.findings.find((f) => f.id === findingId);
    if (!finding) return { status: 404, body: { error: 'Temuan tidak ada di laporan terakhir. Periksa ulang mejanya.' } };
    if (activeJob) return { status: 409, body: { error: 'Agen sedang mengerjakan temuan lain', jobId: activeJob.id } };
    const job = { id: randomUUID(), findingId, state: 'queued', events: [], listeners: new Set(), finding };
    jobs.set(job.id, job);
    activeJob = job;
    runFix(job).catch((error) => emit(job, { type: 'error', state: 'failed', text: `Galat tak terduga: ${String(error.message).slice(0, 200)}` }))
      .finally(() => { if (activeJob === job) activeJob = null; });
    return { status: 202, body: { job: publicJob(job) } };
  }

  async function runFix(job) {
    const { finding } = job;
    job.branch = lib.branchName(finding.id, finding.title);
    const dir = path.join(worktreeRoot, finding.id);
    const fail = (text) => emit(job, { type: 'error', state: 'failed', text });
    const cleanup = async () => {
      await run('git', ['worktree', 'remove', '--force', dir], { cwd: root });
      await run('git', ['branch', '-D', job.branch], { cwd: root });
    };

    emit(job, { type: 'status', state: 'preparing', text: 'Menyiapkan worktree dari main terbaru' });
    await mkdir(worktreeRoot, { recursive: true });
    const fetched = await run('git', ['fetch', 'origin', 'main'], { cwd: root, timeout: 90_000 });
    if (fetched.code !== 0) return fail('Gagal mengambil main dari GitHub');
    const added = await run('git', ['worktree', 'add', '-b', job.branch, dir, 'origin/main'], { cwd: root });
    if (added.code !== 0) return fail(`Gagal membuat worktree: ${added.stderr.trim().slice(0, 160)}. Jika branch ${job.branch} sudah ada, hapus dulu.`);

    emit(job, { type: 'status', state: 'working', text: 'Agen mulai mengerjakan' });
    const env = { ...process.env };
    delete env.SAPA_GITHUB_TOKEN; delete env.SAPA_BRIDGE_TOKEN;
    const prompt = lib.buildFixPrompt(finding, { venvPython: python });
    const result = await new Promise((resolve) => {
      const child = spawn(claudeBin, ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
        '--allowedTools', FIX_TOOLS.join(','), '--disallowedTools', FIX_DENY.join(',')], { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let buffer = ''; let final = null;
      const timer = setTimeout(() => child.kill('SIGKILL'), 25 * 60_000);
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const parsed = lib.parseStreamLine(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
          if (!parsed) continue;
          if (parsed.type === 'result') final = parsed; else emit(job, parsed);
        }
      });
      child.on('error', () => { clearTimeout(timer); resolve({ code: 127, final }); });
      child.on('close', (code) => { clearTimeout(timer); resolve({ code, final }); });
      child.stdin.end(prompt);
    });
    if (result.code !== 0 || result.final?.ok === false) { await cleanup(); return fail(`Agen berhenti dengan galat${result.final?.text ? `: ${result.final.text.slice(0, 200)}` : ''}`); }

    const ahead = Number((await run('git', ['rev-list', '--count', 'origin/main..HEAD'], { cwd: dir })).stdout.trim());
    if (!ahead) { await cleanup(); return fail('Agen selesai tanpa membuat commit, jadi tidak ada perubahan untuk di-PR'); }
    job.headSha = (await run('git', ['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim();

    emit(job, { type: 'status', state: 'verifying', text: 'Memindai ulang di branch' });
    if (lib.REPO_CHECKS.has(finding.check)) {
      const out = path.join(dir, '.verify.json');
      const args = [scanScript(dir), '--only', finding.check, '--out', out];
      if (!['npm', 'python'].includes(finding.check)) args.push('--offline');
      await run(python, args, { cwd: dir, timeout: 180_000 });
      try { job.verified = !JSON.parse(await readFile(out, 'utf8')).findings.some((f) => f.id === finding.id); } catch { job.verified = null; }
      await rm(out, { force: true });
    } else job.verified = null;

    emit(job, { type: 'status', state: 'pushing', text: 'Mendorong branch ke GitHub' });
    const pushed = await run('git', ['push', 'origin', job.branch], { cwd: dir, timeout: 120_000 });
    if (pushed.code !== 0) return fail(`Gagal push branch (worktree disimpan di ${dir}): ${pushed.stderr.trim().slice(0, 160)}`);

    const repo = await remote();
    if (repo) job.compareUrl = `https://github.com/${repo.owner}/${repo.repo}/compare/main...${encodeURIComponent(job.branch)}?expand=1`;
    if (repo && githubToken) {
      const pr = await github('POST', `/repos/${repo.owner}/${repo.repo}/pulls`, {
        title: `fix(security): ${finding.title.slice(0, 100)}`, head: job.branch, base: 'main',
        body: lib.prBody({ finding, summary: result.final?.text, verified: job.verified, branch: job.branch }),
      });
      if (pr.ok) { job.prNumber = pr.data.number; job.prUrl = pr.data.html_url; }
    }
    emit(job, { ...publicJob(job), type: 'ready', state: 'ready', text: job.prNumber ? `PR #${job.prNumber} siap ditinjau` : 'Branch siap; buka PR di GitHub', summary: String(result.final?.text ?? '').slice(0, 600) });
  }

  async function approve(jobId) {
    const job = jobs.get(jobId);
    if (!job) return { status: 404, body: { error: 'Pekerjaan tidak ditemukan' } };
    if (!githubToken) return { status: 501, body: { error: 'SAPA_GITHUB_TOKEN belum diatur; merge manual lewat GitHub', compareUrl: job.compareUrl, prUrl: job.prUrl } };
    if (job.state !== 'ready' || !job.prNumber || !job.headSha) return { status: 409, body: { error: 'Belum ada PR yang siap disetujui' } };
    const repo = await remote();
    const base = `/repos/${repo.owner}/${repo.repo}/pulls/${job.prNumber}`;
    const current = await github('GET', base);
    if (!current.ok || current.data.state !== 'open') return { status: 409, body: { error: 'PR tidak lagi terbuka' } };
    if (current.data.head.sha !== job.headSha) return { status: 409, body: { error: 'PR berubah setelah dikerjakan agen. Tinjau ulang; persetujuan ini tidak berlaku.' } };
    job.state = 'merging';
    const merged = await github('PUT', `${base}/merge`, { sha: job.headSha, merge_method: 'merge' });
    if (!merged.ok) { job.state = 'ready'; return { status: 502, body: { error: `GitHub menolak merge: ${String(merged.data.message ?? merged.status).slice(0, 200)}` } }; }
    await mkdir(reports, { recursive: true });
    await appendFile(path.join(reports, 'approvals.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), pr: job.prNumber, commit: job.headSha, merge: merged.data.sha, finding: job.findingId, via: 'kantor-keamanan' })}\n`);
    emit(job, { type: 'status', state: 'merging', text: `PR #${job.prNumber} di-merge; menunggu deploy produksi` });
    watchDeploy(job, repo, merged.data.sha).catch(() => emit(job, { type: 'error', state: 'deploy_failed', text: 'Gagal memantau deploy' }));
    return { status: 202, body: { job: publicJob(job) } };
  }

  async function watchDeploy(job, repo, sha) {
    const deadline = Date.now() + (options.deployTimeoutMs ?? 10 * 60_000);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, options.pollMs ?? 15_000));
      const status = await github('GET', `/repos/${repo.owner}/${repo.repo}/commits/${sha}/status`);
      const state = status.ok && status.data.statuses?.length ? status.data.state : 'pending';
      if (state === 'success') {
        const rescan = await scan('production');
        return emit(job, { type: 'deployed', state: 'deployed', text: 'Deploy produksi selesai; pemeriksaan produksi dijalankan ulang', report: rescan.body.report });
      }
      if (state === 'failure' || state === 'error') return emit(job, { type: 'error', state: 'deploy_failed', text: 'Deploy produksi gagal di Vercel. Pertimbangkan rollback.' });
    }
    emit(job, { type: 'error', state: 'deploy_failed', text: 'Deploy belum selesai dalam 10 menit; periksa dashboard Vercel.' });
  }

  // ---------- HTTP ----------
  const send = (res, status, body, origin) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(origin ? lib.corsHeaders(origin) : {}) });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 16_384) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch (e) { reject(e); } });
  });

  async function handle(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const isPublic = req.method === 'OPTIONS' || (req.method === 'GET' && url.pathname === '/health');
    const auth = lib.authorize(req, { token, origins, port, needToken: !isPublic });
    if (!auth.ok) return send(res, auth.status, { error: auth.reason }, auth.origin);
    if (req.method === 'OPTIONS') { res.writeHead(204, lib.corsHeaders(auth.origin)); return res.end(); }
    const reply = (status, body) => send(res, status, body, auth.origin);

    if (req.method === 'GET' && url.pathname === '/health') {
      const paired = lib.authorize(req, { token, origins, port, needToken: true }).ok;
      return reply(200, { ok: true, paired, canMerge: paired && Boolean(githubToken) });
    }
    if (req.method === 'GET' && url.pathname === '/report') {
      const report = await readLatest();
      return report ? reply(200, { report }) : reply(404, { error: 'Belum ada laporan' });
    }
    if (req.method === 'POST' && url.pathname === '/scan') {
      const { stationId } = await readBody(req);
      const result = await scan(String(stationId ?? ''));
      return reply(result.status, result.body);
    }
    if (req.method === 'POST' && url.pathname === '/fix') {
      const { findingId } = await readBody(req);
      const result = await startFix(String(findingId ?? ''));
      return reply(result.status, result.body);
    }
    if (req.method === 'POST' && url.pathname === '/approve') {
      const { jobId } = await readBody(req);
      const result = await approve(String(jobId ?? ''));
      return reply(result.status, result.body);
    }
    const events = /^\/jobs\/([\w-]+)\/events$/.exec(url.pathname);
    if (req.method === 'GET' && events) {
      const job = jobs.get(events[1]);
      if (!job) return reply(404, { error: 'Pekerjaan tidak ditemukan' });
      const after = Number(url.searchParams.get('after') ?? -1);
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', ...lib.corsHeaders(auth.origin) });
      const write = (event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); if (event.state && TERMINAL.has(event.state)) finish(); };
      const listener = (event) => write(event);
      const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
      const finish = () => { clearInterval(heartbeat); job.listeners.delete(listener); res.end(); };
      req.on('close', () => { clearInterval(heartbeat); job.listeners.delete(listener); });
      for (const event of job.events) if (event.seq > after && !res.writableEnded) write(event);
      if (res.writableEnded) return;
      if (TERMINAL.has(job.state)) return finish();
      job.listeners.add(listener);
      return;
    }
    return reply(404, { error: 'Tidak ditemukan' });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => { if (!res.headersSent) send(res, error.message === 'too large' ? 413 : 500, { error: 'Galat jembatan' }); else res.end(); });
  });
  return { server, scan, startFix, approve, jobs, readLatest };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const reports = path.join(root, 'automation/security_agent/reports');
  const tokenFile = path.join(reports, 'bridge-token');
  await mkdir(reports, { recursive: true });
  let token = existsSync(tokenFile) ? (await readFile(tokenFile, 'utf8')).trim() : '';
  if (!token) { token = randomBytes(24).toString('hex'); await writeFile(tokenFile, `${token}\n`, { mode: 0o600 }); }
  const port = Number(process.env.SAPA_BRIDGE_PORT ?? 43125);
  const venv = path.join(root, '.venv/bin/python');
  const { server } = createBridge({
    root, port, token,
    origins: [...lib.DEFAULT_ORIGINS, ...(process.env.SAPA_BRIDGE_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)],
    githubToken: process.env.SAPA_GITHUB_TOKEN ?? '',
    python: existsSync(venv) ? venv : 'python3',
    claudeBin: process.env.SAPA_CLAUDE_BIN ?? 'claude',
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Jembatan Kantor Keamanan aktif di http://127.0.0.1:${port}`);
    console.log(`Token pairing (tempel di halaman kantor): ${token}`);
    console.log(process.env.SAPA_GITHUB_TOKEN ? 'SAPA_GITHUB_TOKEN terbaca: PR dibuat dan di-merge lewat API.' : 'SAPA_GITHUB_TOKEN belum diatur: PR dibuat manual lewat tautan dan merge dilakukan di GitHub; tombol setujui di halaman belum aktif.');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
