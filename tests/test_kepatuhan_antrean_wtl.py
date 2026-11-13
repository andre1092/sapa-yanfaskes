import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

import kepatuhan_service  # noqa: E402


def baris(kode, nama, bulan, mjkn, antrol, waktu, capaian):
    return {
        "Kode FKTP": kode,
        "Nama FKTP": nama,
        "Tipe Faskes": "RS Kelas C",
        "Rata-rata Waktu task 2-4": waktu,
        "Capaian": capaian,
        "Kunjungan dengan MJKN": mjkn,
        "Kunjungan dengan Antrean Online": antrol,
        "% Target Nasional": "30.00 %",
        "bulan": bulan,
    }


def panggil(monkeypatch, rows, **kwargs):
    # Data uji menggantikan Google Sheets agar tes tidak memakai jaringan.
    monkeypatch.setattr(
        kepatuhan_service,
        "fetch_sheet_csv",
        lambda sheet_id, label: rows if label == "ANTREAN_WTL_DATA" else [],
    )
    return kepatuhan_service.process_antrean_wtl_kepatuhan(**kwargs)


ROWS = [
    baris("0000R009", "RS CONTOH C", "September 2026", "10", "20", "00 hari 00:20:00", "100"),
    baris("0000R009", "RS CONTOH C", "October 2026", "4194", "7492", "00 hari 01:13:23", "75"),
    baris("0000R001", "RS CONTOH A", "October 2026", "5879", "6234", "00 hari 00:13:02", "100"),
]


def test_kolom_seperti_tabel_bi(monkeypatch):
    hasil = panggil(monkeypatch, ROWS, bulan="October 2026")
    baris_a = hasil["table_data"][0]

    assert baris_a["fasilitas_kesehatan"] == "0000R001 - RS CONTOH A"
    assert baris_a["tipe_faskes"] == "RS Kelas C"
    assert baris_a["waktu_task_2_4"] == "00 hari 00:13:02"
    assert (baris_a["total_mjkn"], baris_a["total_antrol"]) == (5879, 6234)
    assert baris_a["persen_target_nasional"] == "30.00 %"
    assert baris_a["capaian"] == 100.0
    # Kolom Task 2/3/4 tidak ada di BI, jadi tidak dikirim lagi.
    assert not {"persen_t2", "persen_t3", "persen_t4"} & set(baris_a)


def test_urut_kode_faskes_seperti_bi(monkeypatch):
    hasil = panggil(monkeypatch, ROWS, bulan="October 2026")
    assert [r["kode_ppk"] for r in hasil["table_data"]] == ["0000R001", "0000R009"]


def test_tanpa_bulan_memakai_bulan_terakhir(monkeypatch):
    hasil = panggil(monkeypatch, ROWS)
    assert hasil["selected_period"] == "October 2026"
    assert len(hasil["table_data"]) == 2
