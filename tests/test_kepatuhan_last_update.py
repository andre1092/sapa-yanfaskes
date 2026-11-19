import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

import kepatuhan_service  # noqa: E402


def panggil(monkeypatch, rows):
    dipanggil = {}

    def palsu(sheet_id, label, gid=None):
        dipanggil["gid"] = gid
        return rows if label == "LAST_UPDATE_BI" else []

    # Data uji menggantikan Google Sheets agar tes tidak memakai jaringan.
    monkeypatch.setattr(kepatuhan_service, "fetch_sheet_csv", palsu)
    return kepatuhan_service.get_last_update_bi(), dipanggil


def test_last_update_mengikuti_tab_bi(monkeypatch):
    rows = [
        {"indikator": "01-nakes", "last_update_bi": "2026-11-06 11:43:22"},
        {"indikator": "02-pengaduan", "last_update_bi": "2026-11-15 22:29:29"},
        {"indikator": "08-rme", "last_update_bi": "2026-09-30 16:59:05"},
    ]
    hasil, dipanggil = panggil(monkeypatch, rows)

    assert dipanggil["gid"] == kepatuhan_service.LAST_UPDATE_BI_GID
    assert hasil["tabs"]["01-nakes"] == "06/11/2026 11:43:22"
    assert hasil["tabs"]["02-pengaduan"] == "15/11/2026 22:29:29"
    assert hasil["tabs"]["08-rme"] == "30/09/2026 16:59:05"
    # Ringkasan tidak punya Last Update di BI: pakai waktu terbaru dari indikator.
    assert hasil["tabs"]["00-ringkasan"] == "15/11/2026 22:29:29"


def test_format_waktu_bi_lain_dan_baris_rusak(monkeypatch):
    rows = [
        {"indikator": "05-tmo", "last_update_bi": "11/15/2026 10:24:44 PM"},
        {"indikator": "07-surkon", "last_update_bi": "2026-11-06 04:44:32.449043048"},
        {"indikator": "06-antrean-wtl", "last_update_bi": "belum ada"},
        {"indikator": "99-lain", "last_update_bi": "2026-11-20 10:00:00"},
    ]
    hasil, _ = panggil(monkeypatch, rows)

    assert hasil["tabs"]["05-tmo"] == "15/11/2026 22:24:44"
    assert hasil["tabs"]["07-surkon"] == "06/11/2026 04:44:32"
    assert "06-antrean-wtl" not in hasil["tabs"]
    assert "99-lain" not in hasil["tabs"]


def test_tanpa_data_tidak_mengarang_waktu(monkeypatch):
    hasil, _ = panggil(monkeypatch, [])
    assert hasil["tabs"] == {}
