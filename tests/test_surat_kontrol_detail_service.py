"""Detail SRK per SEP tanpa nomor (versi 1, syarat Clara): browser membuang Nomor SEP/Surat Kontrol.

Semua nilai di sini palsu. Pola nomor tiruan dipakai hanya untuk menguji penolakan.
"""
import gzip
from datetime import date

import pytest
from openpyxl import load_workbook
import io

from api import surat_kontrol_detail_service as dt

KEPALA = "kode_ppk,Jenis Pelayanan,Kode Poli Tujuan SEP,Day, Month, Year of Tgl SEP,Day, Month, Year of Tgl Terbit Kontrol,Nama Faskes,Status Surat Kontrol"
SAMA = "Tanggal Terbit Kontrol Sama Dengan Tanggal SEP"
BESAR = "Tanggal Terbit Kontrol Lebih Besar Tanggal SEP"
PADANAN = {"0189R001": {"rsd mawar"}, "1330R002": {"melati lumajang, rsud"}}


def csv(*baris, kepala=KEPALA):
    import csv as _c
    out = io.StringIO()
    w = _c.writer(out, lineterminator="\r\n")
    w.writerow(kepala.split(",") if kepala != KEPALA else ["kode_ppk", "Jenis Pelayanan", "Kode Poli Tujuan SEP",
               "Day, Month, Year of Tgl SEP", "Day, Month, Year of Tgl Terbit Kontrol", "Nama Faskes", "Status Surat Kontrol"])
    for b in baris:
        w.writerow(b)
    return out.getvalue().encode("utf-8")


BAIK = [("0189R001", "Rawat Jalan", "INT", "November 3, 2026", "November 3, 2026", "RSD Mawar", SAMA),
        ("1330R002", "Rawat Inap", "BED", "November 4, 2026", "November 9, 2026", "MELATI LUMAJANG, RSUD", BESAR)]


def periksa(raw, bulan="2026-11"):
    return dt.periksa_csv(raw, bulan, PADANAN)


def test_valid_rows_are_normalised_without_numbers():
    h = periksa(csv(*BAIK))
    assert h.baris == [
        ["0189R001", "RSD Mawar", "RJ", "INT", "2026-11-03", "2026-11-03", "eq"],
        ["1330R002", "MELATI LUMAJANG, RSUD", "RI", "BED", "2026-11-04", "2026-11-09", "gt"],
    ]
    assert h.ringkasan == {"bulan": "2026-11", "baris": 2, "RJ": {"eq": 1, "gt": 0}, "RI": {"eq": 0, "gt": 1},
                           "faskes": 2, "kode_tak_dikenal": []}


@pytest.mark.parametrize("kepala", [KEPALA.replace("kode_ppk", "Nomor SEP"), KEPALA + ",Nomor Surat Kontrol"])
def test_number_columns_are_refused(kepala):
    with pytest.raises(dt.BerkasDitolak, match="nomor"):
        periksa(csv(kepala=kepala))


def test_number_pattern_in_any_cell_is_refused_without_echo():
    nomor = "0189R0011125V000123"  # pola tiruan
    b = list(BAIK[0]); b[2] = nomor
    with pytest.raises(dt.BerkasDitolak) as err:
        periksa(csv(tuple(b)))
    assert nomor not in err.value.pesan and "nomor" in err.value.pesan


@pytest.mark.parametrize("kode", ["0189R01", "０189R001", "9999R001", "0189r001"])
def test_bad_ppk_code_is_refused(kode):
    b = list(BAIK[0]); b[0] = kode
    with pytest.raises(dt.BerkasDitolak, match="kode PPK"):
        periksa(csv(tuple(b)))


def test_ppk_code_must_match_hospital_name_when_known():
    b = list(BAIK[0]); b[5] = "RS LAIN"
    with pytest.raises(dt.BerkasDitolak, match="tidak cocok"):
        periksa(csv(tuple(b)))


def test_code_missing_from_padanan_is_reported_not_refused():
    b = ("0191R006", "Rawat Inap", "INT", "November 3, 2026", "November 4, 2026", "RS BARU", BESAR)
    assert periksa(csv(b)).ringkasan["kode_tak_dikenal"] == ["0191R006"]


@pytest.mark.parametrize("i,nilai,pesan", [(6, "Tanggal Terbit Kontrol Lebih Kecil Tanggal SEP", "Status"),
                                           (1, "Rawat Darurat", "Jenis"), (3, "October 30, 2026", "bulan"),
                                           (3, "2026-11-03", "tanggal"), (2, "X" * 201, "200")])
def test_invalid_values_are_refused(i, nilai, pesan):
    b = list(BAIK[0]); b[i] = nilai
    with pytest.raises(dt.BerkasDitolak, match=pesan):
        periksa(csv(tuple(b)))


def test_empty_file_is_refused():
    with pytest.raises(dt.BerkasDitolak):
        periksa(csv())


def test_storage_keeps_last_three_months_and_filters_on_read():
    s = None
    for bln in ("2026-09", "2026-10", "2026-11", "2026-12"):
        s = dt.simpanan_baru(s, bln, [["0189R001", "RSD Mawar", "RJ", "INT", f"{bln}-03", f"{bln}-03", "eq"]],
                             {"diunggah_oleh": "Admin"}, hari_ini=date(2026, 12, 5))
    isi = dt.baca_simpanan(s)
    assert sorted(isi["bulan"]) == ["2026-10", "2026-11", "2026-12"]
    assert sorted(dt.bulan_aktif(isi, hari_ini=date(2027, 2, 1))) == ["2026-12"]


def test_rows_filtered_by_type_status_and_hospital():
    baris = periksa(csv(*BAIK)).baris
    assert len(dt.saring(baris, "semua", "semua", None)) == 2
    assert [b[0] for b in dt.saring(baris, "RI", "gt", None)] == ["1330R002"]
    assert dt.saring(baris, "RJ", "gt", None) == []
    assert [b[0] for b in dt.saring(baris, "semua", "semua", "0189R001")] == ["0189R001"]


def test_xlsx_has_confidential_title_columns_and_no_formulas():
    b = list(BAIK[0]); b[2] = "=HYPERLINK(\"x\")"
    baris = periksa(csv(tuple(b), BAIK[1])).baris
    isi = dt.buat_xlsx(baris, "2026-11", "semua", None, {"0189R001": "KAB. JEMBER"})
    ws = load_workbook(io.BytesIO(isi)).active
    assert ws["A1"].value == "RAHASIA — data pelayanan peserta"
    assert [c.value for c in ws[5]] == list(dt.KOLOM)
    data = [[c.value for c in r] for r in ws.iter_rows(min_row=6)]
    assert data[0][0] == "Jember" and data[1][0] == "Lumajang"
    assert data[0][4].startswith("'=") and data[0][7] == 0 and data[1][7] == 5
    assert ws.freeze_panes == "A6"


def test_file_name():
    assert dt.nama_berkas("2026-11", "RJ", None) == "Detail_Surat_Kontrol_November_2026_RJ.xlsx"
    assert dt.nama_berkas("2026-11", "semua", "MELATI LUMAJANG, RSUD") == "Detail_Surat_Kontrol_November_2026_Semua_MELATI_LUMAJANG_RSUD.xlsx"
