import asyncio
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

BULAN = "October 2026"


def load_api(monkeypatch):
    for name in ("AUTH0_DOMAIN", "SAPA_DEV_AUTH_BYPASS", "VERCEL_ENV", "SCIM_BEARER_TOKEN", "SMTP_HOST"):
        monkeypatch.delenv(name, raising=False)
    sys.modules.pop("index", None)
    return importlib.import_module("index")


def baris(kode, nama, total, tidak, sesuai, persen, capaian):
    return {
        "kode_ppk": kode,
        "nama_ppk": nama,
        "Tipe Faskes": "RS Kelas D",
        "Capaian Nilai": capaian,
        "Total Kunjungan": total,
        "Tidak Sesuai": tidak,
        "Sesuai": sesuai,
        "Persen Sesuai": persen,
        "Capaian": capaian,
        "bulan": BULAN,
    }


def panggil_nakes(monkeypatch, rows):
    api = load_api(monkeypatch)
    # Data uji menggantikan Google Sheets agar tes tidak memakai jaringan.
    monkeypatch.setattr(api, "fetch_csv_records", lambda sheet_id, label: rows if label == "NAKES_DATA" else [])
    hasil = asyncio.run(api.get_fkrtl_kepatuhan_nakes(bulan=BULAN, user={"role": "admin"}))
    return hasil, {r["kode_ppk"]: r for r in hasil["table_data"]}


def test_persen_dan_capaian_per_keadaan_data(monkeypatch):
    api = load_api(monkeypatch)
    assert api.nakes_persen_capaian(27, 29, True, 0.0) == (93.1, 75.0)
    assert api.nakes_persen_capaian(0, 0, True, 0.0) == (100.0, 100.0)
    assert api.nakes_persen_capaian(0, 0, False, 0.0) == (0.0, 0.0)
    assert api.nakes_persen_capaian(0, 0, False, 100.0) == (0.0, 100.0)


def test_faskes_tanpa_data_mengikuti_capaian_bi(monkeypatch):
    rows = [
        baris("0000R001", "RS CONTOH A", "29", "2", "27", "93.10 %", "75"),
        baris("0000R002", "RS CONTOH B", "", "", "", "", "0"),
    ]
    hasil, tabel = panggil_nakes(monkeypatch, rows)

    assert tabel["0000R001"]["capaian"] == 75.0
    assert tabel["0000R002"]["persen_sesuai"] == 0.0
    assert tabel["0000R002"]["capaian"] == 0.0
    assert tabel["0000R002"]["status"] == "Belum Tercapai"
    assert hasil["monthly_chart"][0]["avg_capaian"] == 37.5


def test_faskes_nol_kunjungan_tetap_100(monkeypatch):
    rows = [baris("0000R003", "RS CONTOH C", "0", "0", "0", "0.00 %", "100")]
    hasil, tabel = panggil_nakes(monkeypatch, rows)

    assert tabel["0000R003"]["capaian"] == 100.0
    assert tabel["0000R003"]["status"] == "Tercapai"
    assert hasil["monthly_chart"][0]["avg_capaian"] == 100.0
