# SELEKSI & EVALUASI REPOSITORI GITHUB — PROFI INTELLIGENCE CORE

Evaluasi ini dilakukan secara empiris dengan mengutamakan performa lokal Apple Silicon, biaya 100% gratis, keamanan kredensial, dan efisiensi konsumsi token.

---

## Matriks Evaluasi Lengkap

| Repositori | Tujuan Utama | Kompatibilitas | Kebutuhan Sumber Daya | Biaya / API | Keamanan | Manfaat Diharapkan | Bukti Empiris | Keputusan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **upstash/context7** | Dokumentasi resmi versi spesifik pustaka | macOS / Node / Remote SSE | Sangat Ringan (< 10 MB) | Gratis (Public MCP) | Aman (Tanpa token wajib) | Mencegah halusinasi API pustaka | Berhasil uji query React docs (`react.dev`) | **SELECTED** |
| **doobidoo/mcp-memory-service** / `@memories.sh/cli` | Penyimpanan memori persisten SQLite | macOS / Node npx | Ringan (~50 MB RAM) | Gratis (Lokal) | Aman (Local SQLite, no cloud leak) | Retensi keputusan teknis lintas sesi | Berhasil simpan & panggil kembali fakta SAPA YANFASKES | **SELECTED** |
| **ast-grep/ast-grep** | Pencarian kode terstruktur berbasis AST | Apple Silicon binary (Rust) | Minimal (< 15 MB RAM) | Gratis (Lokal) | Aman (Lokal 100%) | Reduksi token hingga 99.8% vs full-file read | Berhasil temukan `health_check` dalam 22.89 ms | **SELECTED** |
| **pytest-dev/pytest** | Pengujian deterministik unit & integrasi | Python 3.9+ | Ringan (~30 MB RAM) | Gratis (Lokal) | Aman (Lokal) | Pembuktian deterministik fitur tanpa asumsi | 10/10 skenario evaluasi lulus dalam 0.39s | **SELECTED** |
| **astral-sh/ruff** | Linter & analisis statis ultra-cepat | Apple Silicon native (Rust) | Sangat Ringan (< 20 MB) | Gratis (Lokal) | Aman (Lokal) | Validasi kode instan sub-15ms | Mendeteksi & memperbaiki 9 error dalam 10ms | **SELECTED** |
| **Graphify-Labs/graphify** | Pemetaan graf dependensi repositori | Python / CLI v0.9.92 | Sedang (50–150 MB RAM) | Gratis (Lokal via `--code-only`) | Aman (Lokal) | Memahami arsitektur modul tanpa penjelajahan buta | CLI v0.9.92 terpasang di `/Users/and1092/.local/bin` | **SELECTED** |
| **headroom** | Kompresi konteks teks & caching berbasis hash | Apple Silicon binary | Ringan (~40 MB RAM) | Gratis (Lokal) | Aman (Lokal) | Mereduksi token pada dokumen panjang | Berhasil kompresi & pengambilan kembali hash lokal | **SELECTED** |
| **googleapis/python-genai** | SDK resmi Gemini API | Python 3.9+ | Ringan | Gratis / Sesuai Quota | Aman (Wajib isolasi API key) | Integrasi API langsung saat dibutuhkan | Terpasang di `.venv` | **SELECTED** |
| **google-gemini/gemini-cli** | Antarmuka CLI Gemini | macOS / Go | Ringan | Gratis / API key | Aman | Utilitas CLI eksternal | Tidak diperlukan saat Antigravity aktif | **OPTIONAL** |
| **BerriAI/litellm** | Proxy perutean multi-LLM & pemantauan biaya | Python | Sedang (~100 MB RAM) | Gratis (Open-Source) | Perlu penjagaan kredensial | Monitoring kuota eksternal | Relevan jika menggunakan API eksternal mandiri | **OPTIONAL** |
| **microsoft/markitdown** | Konversi format file ke markdown | Python | Ringan | Gratis | Aman | Konversi dokumen teknis | Digunakan jika ada dokumen Office/PDF | **OPTIONAL** |
| **promptfoo/promptfoo** | Evaluasi & pengujian prompt deterministik | Node.js | Ringan (~80 MB) | Gratis | Aman | Benchmarking kualitas respon | Diadopsi secara bertahap | **OPTIONAL** |
| **yamadashy/repomix** | Packer seluruh repositori menjadi 1 file | Node.js | Sedang | Gratis | Berisiko kebocoran jika ada secret | Mengumpulkan konteks | DITOLAK: Memicu lonjakan konteks tidak perlu | **REJECTED** |
| **microsoft/LLMLingua** | Kompresi prompt via model bahasa kecil | Python / PyTorch | Sangat Berat (4–8 GB RAM) | Gratis (Model Open-weights) | Berat untuk hardware lokal | Mengurangi token prompt | DITOLAK: Membebani RAM Apple Silicon & lambat | **REJECTED** |
| **Chroma / Milvus / Qdrant** | Database vektor terdistribusi | Docker / Python | Berat (> 1–2 GB RAM) | Gratis | Cukup aman | Pencarian semantik RAG | DITOLAK: Berlebihan untuk single-user workstation | **REJECTED** |
| **LangGraph / Mastra / AutoGen** | Framework multi-agent kompleks | Python / Node | Sedang–Tinggi | Gratis | Kompleks | Koordinasi banyak agen | DITOLAK: Overhead token tinggi & rawan loop | **REJECTED** |

---

## Ringkasan Seleksi
- **TOTAL TERSELEKSI (SELECTED)**: 8 Alat Inti (`context7`, `memories.sh`, `ast-grep`, `pytest`, `ruff`, `graphify`, `headroom`, `python-genai`).
- **OPSIONAL (OPTIONAL)**: 4 Alat Cadangan (`litellm`, `markitdown`, `promptfoo`, `gemini-cli`).
- **DITOLAK (REJECTED)**: 4 Kategori Alat Berat (`repomix`, `LLMLingua`, `Heavy Vector DBs`, `Multi-Agent Loops`).
