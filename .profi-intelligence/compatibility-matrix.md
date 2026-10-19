# MATRIKS KOMPATIBILITAS LINGKUNGAN — PROFI INTELLIGENCE CORE

Dokumen ini memetakan status kompatibilitas seluruh komponen, pustaka, dan infrastruktur terhadap lingkungan pengembang Antigravity pada **macOS Apple Silicon (M2, 24 GB RAM)**.

---

## 1. Lingkungan Runtime Dasar

| Komponen | Versi Terdeteksi | Status | Keterangan & Batasan |
| :--- | :--- | :--- | :--- |
| **Sistem Operasi** | macOS 27.0.1 (Darwin 27.0.0 arm64) | **SUPPORTED** | Apple Silicon M2, memori terpadu 24 GB, SSD bebas > 214 GB. |
| **Antigravity IDE** | 2.24.0 (`/Applications/Antigravity.app`) | **SUPPORTED** | Mendukung integrasi aturan global, skills, dan MCP servers via `mcp_config.json`. |
| **Python** | 3.9.6 (`.venv/bin/python`) | **SUPPORTED** | Lingkungan terisolasi virtualenv di `/Volumes/WD_BLACK_PRO/sapa-yanfaskes/.venv`. |
| **Node.js / NPM** | Node v24.22.0 / NPM 11.19.1 | **SUPPORTED** | Kompatibel penuh dengan MCP berbasis npx dan runtime JavaScript. |
| **Git** | 2.54.0 (Apple Git-157) | **SUPPORTED** | Pelacakan versi dan automasi commit terdukung. |

---

## 2. Model Context Protocol (MCP) Servers

| Server MCP | Transport / Endpoint | Status | Keterangan Fungsional |
| :--- | :--- | :--- | :--- |
| **Context7** | Remote URL (`https://mcp.context7.com/mcp`) | **SUPPORTED** | Pengambilan dokumentasi resmi eksternal secara langsung tanpa API key wajib. |
| **Memories** | Local npx (`@memories.sh/cli serve`) | **SUPPORTED** | Penyimpanan memori persisten berbasis SQLite (fakta, aturan, keputusan teknis). |
| **Headroom** | Local binary (`headroom mcp serve`) | **SUPPORTED WITH CONDITIONS** | Tool `headroom_compress` & `headroom_retrieve` aktif lokal. Daemon proxy port 8787 opsional/offline. |
| **Graphify** | Local binary (`graphify mcp`) | **SUPPORTED** | Versi 0.9.92 terpasang di `/Users/and1092/.local/bin/graphify`. Mendukung ekstraksi AST lokal (`--code-only`). |
| **Stitch** | Remote URL (`https://stitch.googleapis.com/mcp`) | **SUPPORTED** | Terhubung dengan header `X-Goog-Api-Key`. |
| **Canva** | npx `mcp-remote` | **SUPPORTED** | Integrasi remote endpoint Canva aktif. |
| **Vercel** | Remote URL (`https://mcp.vercel.com`) | **SUPPORTED** | Integrasi Vercel deployment aktif. |

---

## 3. Pustaka Pengujian & Kualitas Kode

| Alat / Pustaka | Versi | Status | Peran & Manfaat |
| :--- | :--- | :--- | :--- |
| **pytest** | 8.4.2 | **SUPPORTED** | Runner pengujian deterministik untuk 10 skenario evaluasi kualitas. |
| **ruff** | 0.17.1 | **SUPPORTED** | Linter berbasis Rust dengan eksekusi sub-15ms, validasi sintaks & pembersihan import. |
| **ast-grep** | 0.51.0 | **SUPPORTED** | Penelusuran simbol AST terarah (`/Users/and1092/.local/bin/ast-grep`), mereduksi token hingga 99.8%. |

---

## 4. Komponen Ditolak / Tidak Digunakan (*Rejected Candidates*)

| Komponen | Keputusan | Alasan Penolakan (*Rationale*) |
| :--- | :--- | :--- |
| **Repomix (Full Dump)** | **REJECTED** | Menggabungkan seluruh repositori menjadi 1 file raksasa memicu ledakan konteks dan inefisiensi biaya token drastis. |
| **LLMLingua (Local Model)** | **REJECTED** | Membutuhkan dependensi PyTorch dan model bobot lokal (1B–7B) yang membebani 4–8 GB RAM Apple Silicon dan menambah latensi 2–5 detik. Digantikan oleh seleksi simbol terarah AST dan Headroom. |
| **Heavy Vector DBs (Milvus, Qdrant cluster)** | **REJECTED** | Terlalu berat untuk kebutuhan workstation tunggal; SQLite lokal dan `@memories.sh/cli` jauh lebih hemat sumber daya dan instan. |
| **Multi-Agent Loops Tanpa Batas** | **REJECTED** | Arsitektur multi-agent berlebih menimbulkan overhead latensi, konsumsi token kumulatif, dan potensi *infinite loop*. Sistem mempertahankan *Single Orchestrator*. |
