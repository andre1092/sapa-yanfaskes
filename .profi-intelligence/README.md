# PROFI INTELLIGENCE CORE (v1.0)
**Antigravity Intelligence Optimization System**
**Platform**: Google Antigravity & Gemini Models
**Lingkungan**: macOS Apple Silicon (ARM64)
**Bahasa**: Bahasa Indonesia

---

## Ringkasan Eksekutif
PROFI Intelligence Core adalah sistem optimasi terintegrasi untuk lingkungan pengembangan Google Antigravity. Sistem ini dirancang untuk:
1. **Efisiensi Token Maksimal**: Mengurangi overhead eksplorasi repositori hingga 99%+ menggunakan penelusuran simbol AST (`ast-grep`), pemotongan konteks (`headroom`), dan aturan global terarah.
2. **Memori Persisten Lintas Sesi**: Menyimpan dan memanggil kembali keputusan arsitektural, preferensi, dan solusi bug via `@memories.sh/cli` MCP dan `memories.md`.
3. **Kontekstual Cerdas & Anti-Halusinasi**: Verifikasi dokumentasi pustaka resmi secara *real-time* via **Context7 Remote MCP** (`https://mcp.context7.com/mcp`) dengan kebijakan *fail-closed*.
4. **Verifikasi Deterministik**: Menjamin kualitas kode melalui pengujian otomatis menggunakan `pytest` dan linter `ruff`.

---

## Struktur Direktori
```
.profi-intelligence/
|-- README.md                    # Dokumentasi utama sistem
|-- architecture.md              # Diagram arsitektur dan aliran data
|-- compatibility-matrix.md      # Matriks kompatibilitas lingkungan & dependensi
|-- selected-repositories.md     # Evaluasi & seleksi repositori GitHub
|-- baseline-metrics.json        # Data metrik baseline sebelum optimasi
|-- optimization-results.json    # Hasil empiris pengujian performa & efisiensi
|-- verification-report.md       # Laporan bukti verifikasi 10 skenario evaluasi
|
|-- benchmarks/                  # Skenario pengujian beban & konsumsi token
|-- tests/                       # Suite pengujian deterministik pytest
|   `-- test_profi_core.py       # 10 skenario pengujian utama
|-- scripts/                     # Skrip otomasi & runner pengujian
|   `-- run_benchmarks.py        # Pengumpul metrik empiris
`-- config/                      # Template konfigurasi pendukung
```

---

## Cara Menjalankan Verifikasi
```bash
# 1. Jalankan pengujian deterministik (10 skenario)
pytest -v .profi-intelligence/tests/test_profi_core.py

# 2. Jalankan linter dan analisis statis
ruff check .profi-intelligence/tests/test_profi_core.py

# 3. Jalankan pengumpulan metrik benchmark empiris
python .profi-intelligence/scripts/run_benchmarks.py
```
