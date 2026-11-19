"""Crosstab BI Monitoring Penerbitan Surat Kontrol: baca 10 CSV per bulan, cek silang, simpan per bulan.

Tata letak tiruan meniru unduhan Crosstab asli (UTF-16 LE ber-BOM, tab, CRLF, angka ribuan "3,513").
Semua nama RS dan poli di sini samaran. Berkas asli tidak pernah masuk repo.
"""
import base64
import gzip
import json

import pytest

from api import surat_kontrol_service as sk

LT, EQ, GT = "Surkon < SEP", "Surkon = SEP", "Surkon > SEP"
# Angka contoh per jenis: {status: {rs: n}}; Tren dan Poli dibagi dari angka yang sama supaya cek silang cocok.
RS = ["0101R001 - RSD MAWAR", "0202R002 - MELATI LUMAJANG, RSUD", "0303S003 - KLINIK UTAMA KENANGA"]


def _sel(n):
    return "" if n == 0 else f"{n:,}"


def _berkas(rows):
    return ("\r\n".join("\t".join(r) for r in rows) + "\r\n").encode("utf-16")


def faskes(per_status):
    status = list(per_status)
    rows = [["", *["Status"] * len(status)], ["", *status]]
    for rs in RS:
        if any(per_status[s].get(rs, 0) for s in status):
            rows.append([rs, *[_sel(per_status[s].get(rs, 0)) for s in status]])
    return _berkas(rows)


def header(total):
    status = list(total)
    jumlah = sum(total.values())
    return _berkas([["", *["Status"] * len(status)], ["", *status],
                    ["% of Total Jumlah SEP along Status", *[f"{total[s] / jumlah:.2%}" for s in status]],
                    ["Jumlah SEP", *[_sel(total[s]) for s in status]]])


def poli(per_status):
    nama = ["ANAK", "PENYAKIT DALAM", "SARAF"]
    rows = [["", *["Poli Tuju SEP"] * len(nama)], ["", *nama]]
    for s, n in per_status.items():
        rows.append([s, *[_sel(v) for v in _bagi(n, len(nama))]])
    return _berkas(rows)


def tren(per_status, hari=12):
    rows = [["Status", *[str(h) for h in range(1, hari + 1)]]]
    for s, n in per_status.items():
        rows.append([s, *[_sel(v) for v in _bagi(n, hari)]])
    return _berkas(rows)


def keterangan():
    return _berkas([["", "Status Surat Kontrol", "Status Surat Kontrol"],
                    ["", "Tanggal Terbit Kontrol Lebih Kecil Tanggal SEP", "Tanggal Terbit Kontrol Sama Dengan Tanggal SEP"],
                    [LT, "3,600", ""], [EQ, "", "12"]])


def _bagi(n, k):
    dasar, sisa = divmod(n, k)
    return [dasar + (1 if i < sisa else 0) for i in range(k)]


ANGKA = {
    "RJ": {LT: {RS[0]: 3513, RS[1]: 87}, EQ: {RS[0]: 9, RS[1]: 3}},
    "RI": {LT: {RS[0]: 2}, EQ: {RS[0]: 858, RS[1]: 627, RS[2]: 15}, GT: {RS[0]: 159, RS[1]: 112}},
}


def satu_jenis(jenis, bulan="2026-11", angka=None, hari=12):
    per = angka or ANGKA[jenis]
    total = {s: sum(v.values()) for s, v in per.items()}
    awal = f"{bulan}_{jenis}_"
    return [(awal + "Faskes Surkon.csv", faskes(per)), (awal + "Header Surkon.csv", header(total)),
            (awal + "Keterangan.csv", keterangan()), (awal + "Poli.csv", poli(total)),
            (awal + "Tren.csv", tren(total, hari))]


def sepuluh(bulan="2026-11", **kw):
    return satu_jenis("RJ", bulan, **kw) + satu_jenis("RI", bulan)


def ganti(berkas, nama_akhir, isi):
    return [(n, isi if n.endswith(nama_akhir) else b) for n, b in berkas]


def kiriman(berkas):
    return gzip.compress(json.dumps({"berkas": [{"nama": n, "isi": base64.b64encode(b).decode()} for n, b in berkas]}).encode())


# --- kiriman gzip berisi JSON ---------------------------------------------

def test_upload_body_is_unpacked_into_named_files():
    berkas = sepuluh()
    assert sk.baca_kiriman(kiriman(berkas)) == berkas


@pytest.mark.parametrize("data", [b"", b"bukan gzip", gzip.compress(b"[1,2]"), gzip.compress(b"{rusak"),
                                  gzip.compress(json.dumps({"berkas": [{"nama": "a.csv", "isi": "%%%"}]}).encode()),
                                  gzip.compress(json.dumps({"berkas": [{"nama": 5, "isi": ""}]}).encode())])
def test_broken_upload_body_is_refused(data):
    with pytest.raises(sk.BerkasDitolak):
        sk.baca_kiriman(data)


def test_upload_body_over_compressed_limit_is_refused():
    with pytest.raises(sk.BerkasDitolak, match="1 MB"):
        sk.baca_kiriman(b"\x1f\x8b" + b"\x00" * (sk.BATAS_KOMPRES + 1))


def test_gzip_bomb_stops_at_raw_limit():
    with pytest.raises(sk.BerkasDitolak):
        sk.baca_kiriman(gzip.compress(b" " * (sk.BATAS_MENTAH + 10)))


def test_more_than_ten_files_is_refused():
    with pytest.raises(sk.BerkasDitolak, match="10 berkas"):
        sk.baca_kiriman(kiriman(sepuluh() + [("2026-11_RJ_Poli (1).csv", b"x")]))


def test_single_file_over_limit_is_refused():
    with pytest.raises(sk.BerkasDitolak, match="200 KB"):
        sk.baca_kiriman(kiriman([("2026-11_RJ_Poli.csv", b"x" * (sk.BATAS_BERKAS + 1))]))


# --- periksa satu bulan ----------------------------------------------------

def test_ten_files_are_read_into_one_month():
    hasil = sk.periksa_bulan("2026-11", sepuluh())
    rj, ri = hasil.data["RJ"], hasil.data["RI"]
    assert rj["total"] == {"lt": 3600, "eq": 12, "gt": 0}
    assert ri["total"] == {"lt": 2, "eq": 1500, "gt": 271}
    assert rj["faskes"][0] == {"kode": "0101R001", "nama": "RSD MAWAR", "lt": 3513, "eq": 9, "gt": 0}
    assert [f["kode"] for f in ri["faskes"]] == ["0101R001", "0202R002", "0303S003"]
    assert ri["faskes"][1]["nama"] == "MELATI LUMAJANG, RSUD"
    assert [p["nama"] for p in rj["poli"]] == ["ANAK", "PENYAKIT DALAM", "SARAF"]
    assert sum(p["lt"] for p in rj["poli"]) == 3600
    assert [t["hari"] for t in rj["tren"]] == list(range(1, 13))
    assert hasil.data["sampai"] == "2026-11-12"


def test_summary_lists_totals_per_service_type():
    r = sk.periksa_bulan("2026-11", sepuluh()).ringkasan
    assert r["bulan"] == "2026-11" and r["sampai"] == "2026-11-12"
    assert r["jenis"]["RJ"] == {"total": {"lt": 3600, "eq": 12, "gt": 0}, "faskes": 2, "poli": 3}
    assert r["jenis"]["RI"]["faskes"] == 3


def test_utf8_crosstab_is_also_accepted():
    berkas = [(n, b.decode("utf-16").encode("utf-8")) for n, b in sepuluh()]
    assert sk.periksa_bulan("2026-11", berkas).data["RJ"]["total"]["lt"] == 3600


def test_keterangan_is_optional():
    berkas = [(n, b) for n, b in sepuluh() if "Keterangan" not in n]
    assert sk.periksa_bulan("2026-11", berkas).data["RI"]["total"]["gt"] == 271


@pytest.mark.parametrize("buang", ["RJ_Faskes Surkon", "RI_Tren", "RJ_Header Surkon", "RI_Poli"])
def test_missing_required_sheet_is_refused(buang):
    berkas = [(n, b) for n, b in sepuluh() if buang not in n]
    with pytest.raises(sk.BerkasDitolak, match="belum ada"):
        sk.periksa_bulan("2026-11", berkas)


@pytest.mark.parametrize("nama", ["Poli.csv", "2026-11_RJ_Poli.xlsx", "2026-11_RX_Poli.csv", "2026-11_RJ_Cabang.csv",
                                  "2026-11-RJ-Poli.csv", "../2026-11_RJ_Poli.csv"])
def test_unknown_file_name_is_refused(nama):
    berkas = sepuluh() + [(nama, b"")]
    with pytest.raises(sk.BerkasDitolak, match="Nama berkas"):
        sk.periksa_bulan("2026-11", berkas)


def test_unknown_file_name_is_not_echoed():
    with pytest.raises(sk.BerkasDitolak) as err:
        sk.periksa_bulan("2026-11", sepuluh() + [("<script>.csv", b"")])
    assert "<script>" not in err.value.pesan


def test_duplicate_sheet_is_refused():
    berkas = sepuluh()
    with pytest.raises(sk.BerkasDitolak, match="lebih dari sekali"):
        sk.periksa_bulan("2026-11", berkas + [berkas[0]])


def test_file_month_must_match_chosen_month():
    with pytest.raises(sk.BerkasDitolak, match="Oktober 2026"):
        sk.periksa_bulan("2026-10", sepuluh())


@pytest.mark.parametrize("bulan", ["", "2026-13", "2026-1", "semua", "2026-11-01"])
def test_invalid_month_is_refused(bulan):
    with pytest.raises(ValueError):
        sk.cek_bulan(bulan)


def test_cross_check_mismatch_is_refused():
    berkas = ganti(sepuluh(), "RJ_Tren.csv", tren({LT: 3599, EQ: 12}))
    with pytest.raises(sk.BerkasDitolak, match="Rawat Jalan") as err:
        sk.periksa_bulan("2026-11", berkas)
    assert "tidak sama" in err.value.pesan


def test_unknown_status_is_refused():
    berkas = ganti(sepuluh(), "RJ_Poli.csv", poli({"Surkon ? SEP": 3600, EQ: 12}))
    with pytest.raises(sk.BerkasDitolak, match="Status"):
        sk.periksa_bulan("2026-11", berkas)


@pytest.mark.parametrize("nilai", ["-5", "1.5", "abc", "1,23", "=1+1"])
def test_non_count_cell_is_refused(nilai):
    isi = faskes(ANGKA["RJ"]).decode("utf-16").replace("3,513", nilai).encode("utf-16")
    with pytest.raises(sk.BerkasDitolak, match="angka"):
        sk.periksa_bulan("2026-11", ganti(sepuluh(), "RJ_Faskes Surkon.csv", isi))


def test_hospital_without_ppk_code_is_refused():
    isi = faskes(ANGKA["RJ"]).decode("utf-16").replace("0101R001 - ", "").encode("utf-16")
    with pytest.raises(sk.BerkasDitolak, match="kode PPK"):
        sk.periksa_bulan("2026-11", ganti(sepuluh(), "RJ_Faskes Surkon.csv", isi))


def test_day_beyond_month_length_is_refused():
    berkas = satu_jenis("RJ", "2026-11", hari=31) + satu_jenis("RI")
    with pytest.raises(sk.BerkasDitolak, match="tanggal"):
        sk.periksa_bulan("2026-11", berkas)


def test_layout_change_is_refused_with_clear_message():
    with pytest.raises(sk.BerkasDitolak, match="tata letak"):
        sk.periksa_bulan("2026-11", ganti(sepuluh(), "RJ_Header Surkon.csv", _berkas([["a", "b"], ["c", "d"]])))


def test_nul_character_is_refused():
    with pytest.raises(sk.BerkasDitolak):
        sk.periksa_bulan("2026-11", ganti(sepuluh(), "RJ_Poli.csv", "﻿a\x00b".encode("utf-16-le")))


def test_long_cell_is_refused():
    isi = faskes(ANGKA["RJ"]).decode("utf-16").replace("RSD MAWAR", "X" * 300).encode("utf-16")
    with pytest.raises(sk.BerkasDitolak, match="200 karakter"):
        sk.periksa_bulan("2026-11", ganti(sepuluh(), "RJ_Faskes Surkon.csv", isi))


# --- simpanan per bulan ----------------------------------------------------

def test_new_month_is_added_and_existing_month_replaced():
    nov = sk.periksa_bulan("2026-11", sepuluh()).data
    des = sk.periksa_bulan("2026-12", sepuluh("2026-12")).data
    simpan = sk.simpanan_baru(None, "2026-11", nov, {"diunggah_oleh": "Admin"})
    simpan = sk.simpanan_baru(simpan, "2026-12", des, {"diunggah_oleh": "Admin"})
    nov2 = sk.periksa_bulan("2026-11", satu_jenis("RJ", angka={LT: {RS[0]: 10}}) + satu_jenis("RI")).data
    simpan = sk.simpanan_baru(simpan, "2026-11", nov2, {"diunggah_oleh": "Super Admin"})
    isi = sk.baca_simpanan(simpan)
    assert sorted(isi["bulan"]) == ["2026-11", "2026-12"]
    assert isi["bulan"]["2026-11"]["RJ"]["total"]["lt"] == 10
    assert isi["bulan"]["2026-11"]["meta"]["diunggah_oleh"] == "Super Admin"
    assert isi["bulan"]["2026-12"]["RJ"]["total"]["lt"] == 3600


def test_empty_drive_file_means_no_months():
    assert sk.baca_simpanan(b"") == {"versi": 1, "bulan": {}}


def test_empty_gzip_placeholder_means_no_months():
    assert sk.baca_simpanan(gzip.compress(b"")) == {"versi": 1, "bulan": {}}


def test_unknown_storage_format_is_rejected():
    with pytest.raises(ValueError):
        sk.baca_simpanan(gzip.compress(b'{"versi": 9}'))


# --- cakupan Petugas RS ----------------------------------------------------

def test_hospital_officer_sees_only_own_row_and_totals():
    data = sk.periksa_bulan("2026-11", sepuluh()).data
    milik = sk.untuk_petugas(data, "0202R002")
    assert [f["kode"] for f in milik["RJ"]["faskes"]] == ["0202R002"]
    assert milik["RJ"]["total"] == {"lt": 87, "eq": 3, "gt": 0}
    assert milik["RI"]["total"] == {"lt": 0, "eq": 627, "gt": 112}
    assert milik["RJ"]["poli"] == [] and milik["RJ"]["tren"] == []
    assert milik["sampai"] == data["sampai"]


def test_hospital_absent_this_month_gets_empty_rows():
    data = sk.periksa_bulan("2026-11", sepuluh()).data
    milik = sk.untuk_petugas(data, "0303S003")
    assert milik["RJ"]["faskes"] == [] and milik["RJ"]["total"] == {"lt": 0, "eq": 0, "gt": 0}
    assert milik["RI"]["total"]["eq"] == 15
