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


HARI = date(2026, 11, 20)


def periksa(raw, hari=HARI):
    return dt.periksa_csv(raw, PADANAN, hari)


def test_valid_rows_are_normalised_without_numbers():
    h = periksa(csv(*BAIK))
    assert h.baris == [
        ["0189R001", "RSD Mawar", "RJ", "INT", "2026-11-03", "2026-11-03", "eq"],
        ["1330R002", "MELATI LUMAJANG, RSUD", "RI", "BED", "2026-11-04", "2026-11-09", "gt"],
    ]
    assert h.ringkasan == {"bulan": ["2026-11"], "baris": 2,
                           "per_bulan": {"2026-11": {"baris": 2, "RJ": {"eq": 1, "gt": 0}, "RI": {"eq": 0, "gt": 1}}},
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
                                           (1, "Rawat Darurat", "Jenis"), (3, "August 30, 2026", "Agustus 2026"),
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
        s = dt.simpanan_baru(s, [["0189R001", "RSD Mawar", "RJ", "INT", f"{bln}-03", f"{bln}-03", "eq"]],
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
    # Kode Poli kini whitelist ASCII pendek, jadi pengaman formula diuji lewat Nama Faskes.
    baris = periksa(csv(*BAIK)).baris
    baris[0][1] = "=HYPERLINK(\"x\")"
    isi = dt.buat_xlsx(baris, "2026-11", "semua", None, {"0189R001": "KAB. JEMBER"})
    ws = load_workbook(io.BytesIO(isi)).active
    assert ws["A1"].value == "RAHASIA — data pelayanan peserta"
    assert [c.value for c in ws[5]] == list(dt.KOLOM)
    data = [[c.value for c in r] for r in ws.iter_rows(min_row=6)]
    assert data[0][0] == "Jember" and data[1][0] == "Lumajang"
    assert data[0][2].startswith("'=") and data[0][7] == 0 and data[1][7] == 5
    assert ws.freeze_panes == "A6"


def test_file_name():
    assert dt.nama_berkas("2026-11", "RJ", None) == "Detail_Surat_Kontrol_November_2026_RJ.xlsx"
    assert dt.nama_berkas("2026-11", "semua", "MELATI LUMAJANG, RSUD") == "Detail_Surat_Kontrol_November_2026_Semua_MELATI_LUMAJANG_RSUD.xlsx"


# --- Review Clara PR #87 (2026-11-19), butir wajib 2, 3, 5, 6. Semua nilai palsu. ---------------------------

# Varian penyamaran nomor tiruan: pemisah, huruf kecil, digit lebar penuh/Arab-Indik, karakter Cf, NBSP, potongan.
VARIAN = ["0189 R001 1125 V000123", "0189.R001.1125.V000123", "0189-R001-1125-V000123", "0189_R001_1125_V000123",
          "0189/R001/1125/V000123", "0189r0011125v000123", "\uff10\uff11\uff18\uff19R0011125V000123",
          "\u0660\u0661\u0668\u0669R0011125V000123", "0189R001\u200b1125V000123", "0189R001\u00a01125\u2060V000123",
          "0189R0011125", "1125V000123", "SEP 0189R0011125"]


@pytest.mark.parametrize("varian", VARIAN)
@pytest.mark.parametrize("kolom", [2, 5])
def test_disguised_number_in_any_cell_is_refused_without_echo(varian, kolom):
    b = list(BAIK[0]); b[kolom] = varian
    with pytest.raises(dt.BerkasDitolak) as err:
        periksa(csv(tuple(b)))
    assert "nomor" in err.value.pesan and varian not in err.value.pesan


@pytest.mark.parametrize("poli", ["INT", "BED", "017", "", "AB12CD"])
def test_poli_whitelist_accepts_short_ascii_codes(poli):
    b = list(BAIK[0]); b[2] = poli
    assert periksa(csv(tuple(b))).baris[0][3] == poli


@pytest.mark.parametrize("poli", ["int", "INT A", "PENYAKIT DALAM", "ABCDEFG", "\uff29NT", "I\u200bNT", "=1+1"])
def test_poli_outside_whitelist_is_refused(poli):
    b = list(BAIK[0]); b[2] = poli
    with pytest.raises(dt.BerkasDitolak, match="Poli"):
        periksa(csv(tuple(b)))


def test_normal_cells_do_not_look_like_numbers():
    for nilai in ("November 30, 2026", "RSD Mawar", "MELATI LUMAJANG, RSUD", "0189R001", SAMA, BESAR):
        assert not dt.mirip_nomor(nilai)


def test_unmatched_code_using_another_codes_hospital_name_is_refused():
    b = ("0191R006", "Rawat Jalan", "INT", "November 3, 2026", "November 3, 2026", "  rsd   MAWAR ", SAMA)
    with pytest.raises(dt.BerkasDitolak, match="kode PPK lain"):
        periksa(csv(b))


def test_unmatched_code_must_keep_one_name_across_file():
    a = ("0191R006", "Rawat Jalan", "INT", "November 3, 2026", "November 3, 2026", "RS BARU", SAMA)
    b = ("0191R006", "Rawat Inap", "", "November 4, 2026", "November 5, 2026", "RS BARU LAIN", BESAR)
    with pytest.raises(dt.BerkasDitolak, match="satu nama"):
        periksa(csv(a, b))
    c = ("0191R006", "Rawat Inap", "", "November 4, 2026", "November 5, 2026", "rs  baru", BESAR)
    assert periksa(csv(a, c)).ringkasan["kode_tak_dikenal"] == ["0191R006"]


def test_header_is_checked_before_rows_are_parsed():
    raw = csv(kepala="a,b,c") + b'"x"y,1,2\r\n'
    with pytest.raises(dt.BerkasDitolak, match="Kolom berkas"):
        periksa(raw)


def test_blank_lines_count_toward_row_limit(monkeypatch):
    monkeypatch.setattr(dt, "BATAS_BARIS", 5)
    with pytest.raises(dt.BerkasDitolak, match="terlalu banyak baris"):
        periksa(csv(BAIK[0]) + b"\r\n" * 10)
    assert periksa(csv(BAIK[0]) + b"\r\n" * 3).ringkasan["baris"] == 1


def test_blank_line_flood_is_parsed_lazily():
    import tracemalloc
    raw = csv() + b"\n" * 3_000_000
    tracemalloc.start()
    try:
        with pytest.raises(dt.BerkasDitolak, match="terlalu banyak baris"):
            periksa(raw)
        _, puncak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert puncak < 40 * 1024 * 1024


def _baris_bulan(tgl):
    b = list(BAIK[0]); b[3] = b[4] = tgl
    return tuple(b)


@pytest.mark.parametrize("tgl", ["September 3, 2026", "October 3, 2026", "November 3, 2026"])
def test_upload_month_inside_three_month_window_is_accepted(tgl):
    assert periksa(csv(_baris_bulan(tgl))).ringkasan["baris"] == 1


@pytest.mark.parametrize("tgl,hari", [("August 3, 2026", date(2026, 11, 20)), ("December 3, 2026", date(2026, 11, 20)),
                                       ("October 3, 2026", date(2027, 1, 2)), ("February 3, 2027", date(2027, 1, 31))])
def test_upload_month_outside_window_or_future_is_refused(tgl, hari):
    with pytest.raises(dt.BerkasDitolak, match="3 bulan terakhir"):
        periksa(csv(_baris_bulan(tgl)), hari)


# --- Seret-lepas tanpa pilih bulan (perintah CEO 2026-11-25, "Setuju semua"). Nilai palsu. ---------------------

OKT = ("0189R001", "Rawat Jalan", "INT", "October 30, 2026", "November 2, 2026", "RSD Mawar", BESAR)


def test_rows_are_grouped_per_month_of_sep_date():
    h = periksa(csv(OKT, *BAIK))
    assert h.ringkasan["bulan"] == ["2026-10", "2026-11"]
    assert h.ringkasan["per_bulan"]["2026-10"] == {"baris": 1, "RJ": {"eq": 0, "gt": 1}, "RI": {"eq": 0, "gt": 0}}
    assert h.ringkasan["per_bulan"]["2026-11"]["baris"] == 2 and h.ringkasan["baris"] == 3


def test_months_outside_window_refuse_whole_file_and_are_named():
    agu = list(OKT); agu[3] = "August 3, 2026"; agu[4] = "August 4, 2026"
    des = list(OKT); des[3] = "December 1, 2026"; des[4] = "December 1, 2026"
    with pytest.raises(dt.BerkasDitolak) as err:
        periksa(csv(tuple(agu), BAIK[0], tuple(des)))
    assert "Agustus 2026" in err.value.pesan and "Desember 2026" in err.value.pesan and "November" not in err.value.pesan


def test_new_upload_replaces_only_months_present():
    lama = dt.simpanan_baru(None, periksa(csv(OKT, BAIK[0])).baris, {"diunggah_oleh": "A"}, hari_ini=HARI)
    baru = dt.simpanan_baru(lama, periksa(csv(BAIK[1])).baris, {"diunggah_oleh": "B"}, hari_ini=HARI)
    isi = dt.baca_simpanan(baru)
    assert isi["bulan"]["2026-10"]["meta"]["diunggah_oleh"] == "A" and len(isi["bulan"]["2026-10"]["baris"]) == 1
    assert isi["bulan"]["2026-11"]["meta"]["diunggah_oleh"] == "B"
    assert [b[0] for b in isi["bulan"]["2026-11"]["baris"]] == ["1330R002"]
