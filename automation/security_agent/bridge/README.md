# Jembatan Kantor Keamanan

Server lokal yang menghubungkan halaman `/kantor-keamanan` dengan mesin pemilik repositori.
Tanpa jembatan, halaman produksi tidak menampilkan temuan (repositori ini publik).

```bash
npm --prefix frontend run office:bridge     # mendengarkan 127.0.0.1:43125
```

Saat pertama jalan, jembatan membuat token pairing di `automation/security_agent/reports/bridge-token`
(tidak di-commit) dan mencetaknya. Buka halaman, tempel token di kotak "Hubungkan"; token disimpan
di sessionStorage tab itu.

## Yang dilakukan

| Aksi di halaman | Endpoint | Efek |
| --- | --- | --- |
| Klik meja, judul panel, atau agen | `POST /scan` | Menjalankan `scan.py --only <pemeriksaan meja>` dan menggabungkannya ke `reports/latest.json` |
| Klik "Kerjakan" | `POST /fix` | Worktree baru dari `origin/main`, `claude -p` memperbaiki dan meng-commit, pemindaian ulang, push branch, PR bila `SAPA_GITHUB_TOKEN` ada |
| Klik "Setujui & deploy" | `POST /approve` | Merge PR hanya jika head PR sama dengan commit agen, lalu memantau deploy dan memindai ulang produksi |

Meja Log Vercel butuh `reports/vercel-logs.json` (diambil agen lewat Vercel MCP pada `patroli keamanan`).

## Pengamanan

- Hanya `127.0.0.1`; Host harus `127.0.0.1:43125` atau `localhost:43125`.
- Origin harus `https://sapa-yanfaskes.vercel.app` atau `http://127.0.0.1:3120`
  (tambahan lewat `SAPA_BRIDGE_ORIGINS`, dipisah koma). Semua rute selain `/health` butuh token.
- Agen perbaikan tidak menerima `SAPA_GITHUB_TOKEN`, tidak boleh `git push`, `gh`, `curl`, `rm`, `sudo`
  atau membaca `.env`, dan berjalan di worktree sendiri (`~/.local/share/sapa-security-agent/worktrees`).
  Teks temuan diberikan sebagai data, bukan instruksi.
- Push, PR dan merge dilakukan jembatan, bukan agen. Setiap persetujuan dicatat di `reports/approvals.jsonl`.
- `SAPA_GITHUB_TOKEN`: token GitHub fine-grained untuk repositori ini (Contents dan Pull requests: read/write).
  Tanpa token, PR dibuat lewat tautan dan merge dilakukan manual di GitHub.

Setiap "Kerjakan" memulai sesi Claude Code sungguhan dan memakai kuota langganan Anda.

## Tes

```bash
npm --prefix frontend run test:bridge
```
