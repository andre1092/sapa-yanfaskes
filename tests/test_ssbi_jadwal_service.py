"""Data SSBI Kesesuaian Jadwal Praktik Dokter FKRTL: buka gzip, periksa CSV, saring bulan, tulis Excel.

Semua nama dokter dan RS di sini samaran. Berkas asli SSBI tidak pernah masuk repo.
"""
import gzip
import io
from datetime import datetime

import pytest
from openpyxl import load_workbook

from api import ssbi_jadwal_service as ssbi

HEADER = ("Hari HFIS,Jam Buka HFIS,Jam Tutup HFIS,Kabupaten,\"Day, Month, Year of Periode Data\","
          "Nama Dokter,Nama Faskes,Nama Poli,Status,Tipe Faskes,Waktu SIMRS")
BARIS = [
    'SABTU,06:30,09:30,KAB. BONDOWOSO,"April 26, 2026",DOKTER A,RS MAWAR,Mata,SESUAI,RS Swasta Setara Type C,2026-04-25 07:04:30',
    'SENIN,07:00,15:00,KAB. JEMBER,"April 26, 2026",DOKTER B,RSD Melati,Penyakit Dalam ,SESUAI,RS Kelas B,2026-04-20 07:19:47.127',
    'MINGGU,00:00,00:00,KAB. LUMAJANG,"May 3, 2026",DOKTER C,"KENANGA LUMAJANG, RSUD",Anak,TIDAK SESUAI,RS Kelas B,Tidak Ada',
    'MINGGU,00:00,00:00,KAB. LUMAJANG,"May 3, 2026",DOKTER C,"KENANGA LUMAJANG, RSUD",Anak,TIDAK SESUAI,RS Kelas B,Tidak Ada',
]


def csv_bytes(header=HEADER, rows=BARIS, end="\r\n"):
    return (end.join([header, *rows]) + end).encode("utf-8")


def periksa(**kw):
    return ssbi.periksa_csv(csv_bytes(**kw))


# --- buka gzip -------------------------------------------------------------

def test_gzip_is_opened():
    assert ssbi.buka_gzip(gzip.compress(b"abc")) == b"abc"


@pytest.mark.parametrize("data", [b"", b"bukan gzip", b"\x1f\x8b" + b"\x00" * 20, gzip.compress(b"x" * 1000)[:-12]])
def test_broken_or_truncated_gzip_is_refused(data):
    with pytest.raises(ssbi.BerkasDitolak):
        ssbi.buka_gzip(data)


def test_compressed_body_over_limit_is_refused():
    with pytest.raises(ssbi.BerkasDitolak):
        ssbi.buka_gzip(b"\x1f\x8b" + b"\x00" * (ssbi.BATAS_KOMPRES + 1))


def test_gzip_bomb_stops_at_the_uncompressed_limit():
    bomb = gzip.compress(b"\x00" * (ssbi.BATAS_MENTAH + 10), compresslevel=9)
    assert len(bomb) < 100_000
    with pytest.raises(ssbi.BerkasDitolak, match="30 MB"):
        ssbi.buka_gzip(bomb)


# --- periksa CSV -----------------------------------------------------------

def test_valid_file_is_summarised():
    hasil = periksa()
    assert hasil.ringkasan == {
        "baris": 4, "faskes": 3,
        "periode_awal": "2026-04-26", "periode_akhir": "2026-05-03",
        "bulan": {"2026-04": 2, "2026-05": 2},
        "kabupaten": {"KAB. BONDOWOSO": 1, "KAB. JEMBER": 1, "KAB. LUMAJANG": 2},
    }


def test_rows_are_normalised_and_not_deduplicated():
    rows = periksa().baris
    assert len(rows) == 4
    melati = rows[1]
    assert melati["Nama Poli"] == "Penyakit Dalam"
    assert melati["Waktu SIMRS"] == "2026-04-20 07:19:47"
    assert melati["Periode Data"] == "2026-04-26"
    assert rows[2]["Waktu SIMRS"] == "Tidak Ada"
    assert rows[2]["Nama Faskes"] == "KENANGA LUMAJANG, RSUD"


def test_short_period_header_is_accepted_and_column_order_is_free():
    header = "Status,Periode Data,Kabupaten,Nama Faskes,Tipe Faskes,Nama Poli,Nama Dokter,Waktu SIMRS,Jam Buka HFIS,Jam Tutup HFIS,Hari HFIS"
    row = 'SESUAI,"April 26, 2026",KAB. JEMBER,RSD Melati,RS Kelas B,Mata,DOKTER B,Tidak Ada,07:00,15:00,SENIN'
    assert periksa(header=header, rows=[row]).ringkasan["baris"] == 1


def test_utf8_bom_is_ignored():
    assert ssbi.periksa_csv(b"\xef\xbb\xbf" + csv_bytes()).ringkasan["baris"] == 4


def test_missing_columns_are_named():
    header = HEADER.replace(",Status", "").replace("Hari HFIS,", "")
    rows = [r.split(",", 1)[1] for r in BARIS]
    with pytest.raises(ssbi.BerkasDitolak) as err:
        periksa(header=header, rows=rows)
    assert "Hari HFIS" in str(err.value) and "Status" in str(err.value)


@pytest.mark.parametrize("raw", [
    "﻿a\tb".encode("utf-16"),
    HEADER.replace(",", "\t").encode("utf-8"),
    HEADER.replace(",", ";").encode("utf-8"),
])
def test_excel_resaved_files_get_the_clear_message(raw):
    with pytest.raises(ssbi.BerkasDitolak, match="bukan CSV berpemisah koma"):
        ssbi.periksa_csv(raw)


def test_nul_and_invalid_utf8_are_refused():
    for raw in (csv_bytes().replace(b"DOKTER A", b"DOK\x00TER"), csv_bytes().replace(b"DOKTER A", b"DOK\xffTER")):
        with pytest.raises(ssbi.BerkasDitolak):
            ssbi.periksa_csv(raw)


def test_header_only_file_is_refused():
    with pytest.raises(ssbi.BerkasDitolak, match="tidak berisi baris data"):
        periksa(rows=[])


@pytest.mark.parametrize("old,new,kolom", [
    ("SESUAI,RS Swasta", "-,RS Swasta", "Status"),
    ('"April 26, 2026",DOKTER A', '26 Apr,DOKTER A', "Periode Data"),
    ("06:30,09:30", "6.30,09:30", "Jam Buka HFIS"),
    ("2026-04-25 07:04:30", "kemarin", "Waktu SIMRS"),
    ("SABTU,", "SATURDAY,", "Hari HFIS"),
    ("DOKTER A", "D" * 201, "Nama Dokter"),
])
def test_one_bad_row_rejects_the_whole_file_without_echoing_it(old, new, kolom):
    rows = [BARIS[0].replace(old, new), *BARIS[1:]]
    with pytest.raises(ssbi.BerkasDitolak) as err:
        periksa(rows=rows)
    pesan = str(err.value)
    assert kolom in pesan and "baris 2" in pesan
    assert new not in pesan


def test_row_with_wrong_number_of_cells_is_refused():
    with pytest.raises(ssbi.BerkasDitolak, match="baris 3"):
        periksa(rows=[BARIS[0], BARIS[1] + ",lebih"])


def test_too_many_rows_is_refused(monkeypatch):
    monkeypatch.setattr(ssbi, "BATAS_BARIS", 3)
    with pytest.raises(ssbi.BerkasDitolak, match="baris"):
        periksa()


# --- simpan, saring, unduh -------------------------------------------------

def test_stored_form_round_trips_and_is_deterministic():
    rows = periksa().baris
    gz = ssbi.ke_gzip(rows)
    assert gz == ssbi.ke_gzip(rows)
    assert ssbi.dari_gzip(gz) == rows


def test_filter_by_month_and_hospital():
    rows = periksa().baris
    assert len(ssbi.saring(rows, "2026-05", None)) == 2
    assert [r["Nama Dokter"] for r in ssbi.saring(rows, "2026-04", {ssbi.norm("rsd melati")})] == ["DOKTER B"]
    assert ssbi.bulan_tersedia(rows, None) == ["2026-04", "2026-05"]
    assert ssbi.bulan_tersedia(rows, {ssbi.norm("RS MAWAR")}) == ["2026-04"]


@pytest.mark.parametrize("bulan", ["", "Semua Bulan", "2026-13", "2026-4", "26-04", "2026-04-01", "2026-04\n"])
def test_month_parameter_must_be_yyyy_mm(bulan):
    with pytest.raises(ValueError):
        ssbi.cek_bulan(bulan)


def test_file_name_is_built_from_safe_characters_only():
    assert ssbi.nama_berkas("2026-10", None) == "Detail_Jadwal_Dokter_FKRTL_Oktober_2026.xlsx"
    assert ssbi.nama_berkas("2026-10", "RSD dr Soebandi") == "Detail_Jadwal_Dokter_FKRTL_RSD_dr_Soebandi_Oktober_2026.xlsx"
    assert ssbi.nama_berkas("2026-04", "KENANGA LUMAJANG, RSUD") == "Detail_Jadwal_Dokter_FKRTL_KENANGA_LUMAJANG_RSUD_April_2026.xlsx"
    assert ssbi.nama_berkas("2026-04", "RS Séhat/../\"x\"") == "Detail_Jadwal_Dokter_FKRTL_RS_Sehat_x_April_2026.xlsx"


def _sheet(data):
    return load_workbook(io.BytesIO(data)).active


def test_excel_has_title_header_and_rows():
    rows = ssbi.saring(periksa().baris, "2026-04", None)
    ws = _sheet(ssbi.buat_xlsx(rows, "2026-04", None, "16 Nov 2026 14.32 WIB"))
    assert ws["A1"].value == "Detail Kesesuaian Jadwal Praktik Dokter FKRTL, April 2026"
    assert ws["A2"].value == "Sumber: SSBI BPJS Kesehatan, diintegrasikan 16 Nov 2026 14.32 WIB"
    assert [c.value for c in ws[4]] == list(ssbi.KOLOM_KELUAR)
    assert ws.freeze_panes == "A5"
    assert ws["A5"].value == "KAB. BONDOWOSO" and ws["I5"].value == datetime(2026, 4, 26) and ws["I5"].number_format == "dd/mm/yyyy"


def test_excel_title_names_the_hospital_for_petugas():
    rows = ssbi.saring(periksa().baris, "2026-04", {ssbi.norm("RSD Melati")})
    ws = _sheet(ssbi.buat_xlsx(rows, "2026-04", "RSD Melati", "16 Nov 2026 14.32 WIB"))
    assert ws["A1"].value == "Detail Kesesuaian Jadwal Praktik Dokter FKRTL RSD Melati, April 2026"


@pytest.mark.parametrize("isi,harapan", [
    ("=HYPERLINK(\"http://x\",\"klik\")", "'=HYPERLINK(\"http://x\",\"klik\")"),
    ("+cmd", "'+cmd"), ("-1+2", "'-1+2"), ("@SUM(A1)", "'@SUM(A1)"), ("\tx", "'\tx"),
    ("＝1+1", "'＝1+1"), ("https://contoh.test", "https://contoh.test"), ("-1", "-1"),
])
def test_excel_never_turns_text_into_formulas_or_links(isi, harapan):
    row = dict(periksa().baris[0], **{"Nama Dokter": isi})
    ws = _sheet(ssbi.buat_xlsx([row], "2026-04", None, "x"))
    cell = ws["E5"]
    assert cell.data_type == "s" and cell.value == harapan and cell.hyperlink is None


# --- padanan RS ------------------------------------------------------------

def test_mapping_is_exact_after_trim_space_and_case(tmp_path):
    berkas = tmp_path / "padanan.csv"
    berkas.write_text('nama_faskes_ssbi,kode_ppk,nama_ppk_ref\nRSD Melati,0101R001,RSD MELATI\n'
                      '"KENANGA LUMAJANG, RSUD",0202R002,RSUD KENANGA\n', encoding="utf-8")
    padanan = ssbi.Padanan.dari_berkas(berkas)
    assert padanan.untuk_kode("0101R001") == ("RSD Melati", {ssbi.norm("  rsd   MELATI ")})
    assert padanan.untuk_kode("0202R002")[0] == "KENANGA LUMAJANG, RSUD"
    assert padanan.untuk_kode("9999R999") is None
    assert padanan.untuk_kode("") is None


def test_mapping_file_in_repo_is_one_to_one():
    padanan = ssbi.Padanan.dari_berkas()
    assert len(padanan.kode) == 25


def test_data_after_the_first_gzip_member_is_refused():
    with pytest.raises(ssbi.BerkasDitolak):
        ssbi.buka_gzip(gzip.compress(csv_bytes()) + gzip.compress(b"tambahan"))


def test_stored_drive_file_is_bounded():
    with pytest.raises(ValueError):
        ssbi.dari_gzip(gzip.compress(b"\x00" * (ssbi.BATAS_MENTAH + 10)))
