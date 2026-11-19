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


def satu_jenis(jenis, angka=None, hari=12, poli_kurang=0):
    per = angka or ANGKA[jenis]
    total = {st: sum(v.values()) for st, v in per.items()}
    poli_total = dict(total)
    if poli_kurang:
        k = next(iter(poli_total))
        poli_total[k] -= poli_kurang
    return [(jenis, faskes(per)), (jenis, header(total)), (jenis, keterangan()), (jenis, poli(poli_total)),
            (jenis, tren(total, hari))]


def sepuluh(**kw):
    return satu_jenis("RJ", **kw) + satu_jenis("RI")


def ganti(berkas, urutan, isi):
    """Ganti berkas ke-`urutan` (0 Faskes, 1 Header, 2 Keterangan, 3 Poli, 4 Tren; +5 untuk RI)."""
    return [(j, isi if i == urutan else b) for i, (j, b) in enumerate(berkas)]


def kiriman(berkas, **tambahan):
    return gzip.compress(json.dumps({"berkas": [{"jenis": j, "isi": base64.b64encode(b).decode(), **tambahan}
                                                for j, b in berkas]}).encode())


# --- kiriman gzip berisi JSON ---------------------------------------------

def test_upload_body_is_unpacked_into_service_type_and_bytes():
    berkas = sepuluh()
    assert sk.baca_kiriman(kiriman(berkas)) == berkas


@pytest.mark.parametrize("data", [b"", b"bukan gzip", gzip.compress(b"[1,2]"), gzip.compress(b"{rusak"),
                                  gzip.compress(json.dumps({"berkas": [{"jenis": "RJ", "isi": "%%%"}]}).encode()),
                                  gzip.compress(json.dumps({"berkas": [{"jenis": "RX", "isi": ""}]}).encode()),
                                  gzip.compress(json.dumps({"berkas": [{"jenis": 5, "isi": ""}]}).encode()),
                                  gzip.compress(json.dumps({"berkas": []}).encode())])
def test_broken_upload_body_is_refused(data):
    with pytest.raises(sk.BerkasDitolak):
        sk.baca_kiriman(data)


def test_unknown_keys_in_upload_body_are_refused():
    with pytest.raises(sk.BerkasDitolak):
        sk.baca_kiriman(kiriman(sepuluh(), nama="../rahasia.csv"))
    tambahan = gzip.compress(json.dumps({"berkas": [], "bulan": "2026-11"}).encode())
    with pytest.raises(sk.BerkasDitolak):
        sk.baca_kiriman(tambahan)


def test_upload_body_over_compressed_limit_is_refused():
    with pytest.raises(sk.BerkasDitolak, match="1 MB"):
        sk.baca_kiriman(b"\x1f\x8b" + b"\x00" * (sk.BATAS_KOMPRES + 1))


def test_gzip_bomb_stops_at_raw_limit():
    with pytest.raises(sk.BerkasDitolak):
        sk.baca_kiriman(gzip.compress(b" " * (sk.BATAS_MENTAH + 10)))


def test_more_than_ten_files_is_refused():
    with pytest.raises(sk.BerkasDitolak, match="10 berkas"):
        sk.baca_kiriman(kiriman(sepuluh() + [("RJ", b"x")]))


def test_single_file_over_limit_is_refused():
    with pytest.raises(sk.BerkasDitolak, match="200 KB"):
        sk.baca_kiriman(kiriman([("RJ", b"x" * (sk.BATAS_BERKAS + 1))]))


def test_total_decoded_size_over_limit_is_refused(monkeypatch):
    monkeypatch.setattr(sk, "BATAS_TOTAL", 10_000)
    with pytest.raises(sk.BerkasDitolak, match="2 MB"):
        sk.baca_kiriman(kiriman([("RJ", b"x" * 6000), ("RI", b"y" * 6000)]))


# --- kenali sheet dari isi ---------------------------------------------------

def test_sheets_are_recognised_from_content():
    assert [sk.kenali_sheet(b) for _, b in satu_jenis("RJ")] == ["Faskes Surkon", "Header Surkon", "Keterangan", "Poli", "Tren"]
    assert sk.kenali_sheet(_berkas([["a", "b"], ["c", "d"]])) is None
    assert sk.kenali_sheet(b"\xff\xfe\x00") is None


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


def test_order_of_files_does_not_matter():
    berkas = list(reversed(sepuluh()))
    assert sk.periksa_bulan("2026-11", berkas).data["RI"]["total"]["gt"] == 271


def test_summary_lists_totals_per_service_type():
    r = sk.periksa_bulan("2026-11", sepuluh()).ringkasan
    assert r["bulan"] == "2026-11" and r["sampai"] == "2026-11-12"
    assert r["jenis"]["RJ"] == {"total": {"lt": 3600, "eq": 12, "gt": 0}, "faskes": 2, "poli": 3, "selisih_poli": 0}
    assert r["jenis"]["RI"]["faskes"] == 3
    assert r["peringatan"] == []


def test_poli_difference_is_reported_not_refused():
    berkas = satu_jenis("RJ", poli_kurang=7) + satu_jenis("RI")
    r = sk.periksa_bulan("2026-11", berkas).ringkasan
    assert r["jenis"]["RJ"]["selisih_poli"] == 7


def test_inpatient_larger_than_outpatient_is_warned():
    berkas = satu_jenis("RJ", angka={LT: {RS[0]: 10}}) + satu_jenis("RI")
    assert any("tertukar" in p for p in sk.periksa_bulan("2026-11", berkas).ringkasan["peringatan"])


def test_utf8_crosstab_is_also_accepted():
    berkas = [(j, b.decode("utf-16").encode("utf-8")) for j, b in sepuluh()]
    assert sk.periksa_bulan("2026-11", berkas).data["RJ"]["total"]["lt"] == 3600


def test_keterangan_is_optional():
    berkas = [b for i, b in enumerate(sepuluh()) if i not in (2, 7)]
    assert sk.periksa_bulan("2026-11", berkas).data["RI"]["total"]["gt"] == 271


@pytest.mark.parametrize("buang,pesan", [(0, "Faskes Surkon rawat jalan"), (9, "Tren rawat inap"),
                                         (1, "Header Surkon rawat jalan"), (8, "Poli rawat inap")])
def test_missing_required_sheet_is_refused(buang, pesan):
    berkas = [b for i, b in enumerate(sepuluh()) if i != buang]
    with pytest.raises(sk.BerkasDitolak, match="belum ada") as err:
        sk.periksa_bulan("2026-11", berkas)
    assert pesan in err.value.pesan


def test_unrecognised_file_is_counted_without_echo():
    berkas = sepuluh() + [("RJ", _berkas([["<script>", "x"]]))]
    with pytest.raises(sk.BerkasDitolak, match="1 berkas di area Rawat jalan tidak dikenali") as err:
        sk.periksa_bulan("2026-11", berkas)
    assert "<script>" not in err.value.pesan


def test_duplicate_sheet_is_refused():
    berkas = sepuluh()
    with pytest.raises(sk.BerkasDitolak, match="Poli rawat jalan terpilih dua kali"):
        sk.periksa_bulan("2026-11", berkas + [berkas[3]])


@pytest.mark.parametrize("bulan", ["", "2026-13", "2026-1", "semua", "2026-11-01"])
def test_invalid_month_is_refused(bulan):
    with pytest.raises(ValueError):
        sk.cek_bulan(bulan)


def test_cross_check_mismatch_is_refused_with_totals_only():
    berkas = ganti(sepuluh(), 4, tren({LT: 3599, EQ: 12}))
    with pytest.raises(sk.BerkasDitolak, match="rawat jalan") as err:
        sk.periksa_bulan("2026-11", berkas)
    assert "tidak cocok" in err.value.pesan and "MAWAR" not in err.value.pesan


def test_unknown_status_is_refused():
    berkas = ganti(sepuluh(), 3, poli({"Surkon ? SEP": 3600, EQ: 12}))
    with pytest.raises(sk.BerkasDitolak, match="status yang tidak dikenal"):
        sk.periksa_bulan("2026-11", berkas)


@pytest.mark.parametrize("nilai", ["-5", "1.5", "abc", "1,23", "=1+1"])
def test_non_count_cell_is_refused(nilai):
    isi = faskes(ANGKA["RJ"]).decode("utf-16").replace("3,513", nilai).encode("utf-16")
    with pytest.raises(sk.BerkasDitolak, match="angka"):
        sk.periksa_bulan("2026-11", ganti(sepuluh(), 0, isi))


def test_hospital_without_ppk_code_is_refused():
    isi = faskes(ANGKA["RJ"]).decode("utf-16").replace("0101R001 - ", "").encode("utf-16")
    with pytest.raises(sk.BerkasDitolak, match="kode PPK"):
        sk.periksa_bulan("2026-11", ganti(sepuluh(), 0, isi))


def test_day_beyond_month_length_is_refused():
    berkas = satu_jenis("RJ", hari=31) + satu_jenis("RI")
    with pytest.raises(sk.BerkasDitolak, match="tanggal 31, padahal November hanya 30 hari"):
        sk.periksa_bulan("2026-11", berkas)


def test_nul_character_is_refused():
    with pytest.raises(sk.BerkasDitolak):
        sk.periksa_bulan("2026-11", ganti(sepuluh(), 3, "﻿a\x00b".encode("utf-16-le")))


def test_long_cell_is_refused():
    isi = faskes(ANGKA["RJ"]).decode("utf-16").replace("RSD MAWAR", "X" * 300).encode("utf-16")
    with pytest.raises(sk.BerkasDitolak, match="200 karakter"):
        sk.periksa_bulan("2026-11", ganti(sepuluh(), 0, isi))


# --- simpanan per bulan ----------------------------------------------------

def test_new_month_is_added_and_existing_month_replaced():
    nov = sk.periksa_bulan("2026-11", sepuluh()).data
    des = sk.periksa_bulan("2026-12", sepuluh()).data
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


@pytest.mark.parametrize("isi", [b'{"versi": 9}', b'{"versi": 1, "bulan": {"nov": {}}}', b'{"versi": 1, "bulan": []}', b"[]"])
def test_unknown_storage_format_is_rejected(isi):
    with pytest.raises(ValueError):
        sk.baca_simpanan(gzip.compress(isi))


def test_storage_over_raw_limit_is_rejected(monkeypatch):
    monkeypatch.setattr(sk, "BATAS_SIMPANAN", 100)
    with pytest.raises(ValueError):
        sk.baca_simpanan(gzip.compress(b" " * 200))


# --- cakupan Petugas RS ----------------------------------------------------

def test_hospital_officer_sees_only_own_row_and_totals_but_branch_trend():
    data = sk.periksa_bulan("2026-11", sepuluh()).data
    milik = sk.untuk_petugas(data, "0202R002")
    assert [f["kode"] for f in milik["RJ"]["faskes"]] == ["0202R002"]
    assert milik["RJ"]["total"] == {"lt": 87, "eq": 3, "gt": 0}
    assert milik["RI"]["total"] == {"lt": 0, "eq": 627, "gt": 112}
    # Tren dan Poli = total cabang berlabel (keputusan CEO 2b, disetujui Clara); tanpa nama RS.
    assert milik["RJ"]["poli"] == data["RJ"]["poli"] and milik["RJ"]["tren"] == data["RJ"]["tren"]
    assert "MAWAR" not in json.dumps(milik)
    assert milik["sampai"] == data["sampai"]


def test_hospital_absent_this_month_gets_empty_rows():
    data = sk.periksa_bulan("2026-11", sepuluh()).data
    milik = sk.untuk_petugas(data, "0303S003")
    assert milik["RJ"]["faskes"] == [] and milik["RJ"]["total"] == {"lt": 0, "eq": 0, "gt": 0}
    assert milik["RI"]["total"]["eq"] == 15


# --- pengaman bulan salah (syarat Clara e, f) --------------------------------

def test_current_month_cannot_have_days_after_today():
    from datetime import date
    with pytest.raises(sk.BerkasDitolak, match="melewati hari ini"):
        sk.periksa_bulan("2026-11", sepuluh(), hari_ini=date(2026, 11, 10))
    assert sk.periksa_bulan("2026-11", sepuluh(), hari_ini=date(2026, 11, 12)).data["sampai"] == "2026-11-12"
    assert sk.periksa_bulan("2026-10", sepuluh(), hari_ini=date(2026, 11, 1)).data["sampai"] == "2026-10-12"


def test_identical_content_in_another_month_is_found():
    nov = sk.periksa_bulan("2026-11", sepuluh()).data
    simpan = sk.baca_simpanan(sk.simpanan_baru(None, "2026-11", nov, {"diunggah_oleh": "Admin"}))
    des_sama = sk.periksa_bulan("2026-12", sepuluh()).data
    assert sk.bulan_kembar(simpan, "2026-12", des_sama) == ["2026-11"]
    # Bulan yang sama (unggah ulang) tidak dihitung kembar.
    assert sk.bulan_kembar(simpan, "2026-11", nov) == []
    lain = sk.periksa_bulan("2026-12", satu_jenis("RJ", angka={LT: {RS[0]: 10}}) + satu_jenis("RI", angka={EQ: {RS[1]: 5}})).data
    assert sk.bulan_kembar(simpan, "2026-12", lain) == []
