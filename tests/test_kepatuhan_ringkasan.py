import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

import kepatuhan_service  # noqa: E402

BULAN = "October 2026"


def baris(kode, nilai):
    return {"kode ppk": kode, "nama ppk": f"RS {kode}", "tipe ppk": "RS Kelas C", "bulan": BULAN, "Nilai akhir all": nilai}


def panggil_ringkasan(monkeypatch, rows):
    # Data uji menggantikan Google Sheets agar tes tidak memakai jaringan.
    monkeypatch.setattr(
        kepatuhan_service,
        "fetch_sheet_csv",
        lambda sheet_id, label: rows if label == "RINGKASAN_KEPATUHAN" else [],
    )
    hasil = kepatuhan_service.process_ringkasan_kepatuhan(bulan=BULAN)
    return hasil, {r["kode_ppk"]: r for r in hasil["table_data"]}


def test_nilai_akhir_patuh_mulai_dari_70(monkeypatch):
    _, per_kode = panggil_ringkasan(
        monkeypatch,
        [baris("A", "69.99"), baris("B", "70"), baris("C", "84.99"), baris("D", "85")],
    )

    assert {k: r["status"] for k, r in per_kode.items()} == {
        "A": "Belum Patuh",
        "B": "Patuh",
        "C": "Patuh",
        "D": "Patuh",
    }
    assert {k: r["is_met"] for k, r in per_kode.items()} == {"A": False, "B": True, "C": True, "D": True}


def test_kpi_dan_grafik_menghitung_patuh_dengan_batas_70(monkeypatch):
    hasil, _ = panggil_ringkasan(
        monkeypatch,
        [baris("A", "69.99"), baris("B", "70"), baris("C", "84.99"), baris("D", "85")],
    )

    kpi = hasil["kpi"]
    assert kpi["target_nasional"] == 70.0
    assert kpi["total_patuh"] == 3
    assert kpi["total_belum_patuh"] == 1
    assert kpi["persen_kepatuhan"] == 75.0
    assert [(b["bulan"], b["met_count"]) for b in hasil["monthly_chart"]] == [(BULAN, 3)]
