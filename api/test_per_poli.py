"""Regression tests for per_poli snapshot, filtering, and weighted aggregation."""
import json
import unittest
from pathlib import Path
import polars as pl
from api.per_poli import build_poli_data


def row(**changes):
    value = {"Periode": "2026-10", "Kdppk": "0001", "Nmppk": "Sheet RS", "Kode Poli": "005", "Nama Poli": "POLI A", "Sumber Antrean": "Mobile JKN", "Validasi Poli": "Include", "Waktu Pengambilan": "2026-10-21 11:27:37", "Last Update Dashboard": "2026-10-20 02:31:11", "Jumlah Antrean Sesuai Sumber": 10, "Jumlah SEP dengan Antrol": 20, "Jumlah SEP RJTL": 25, "Capaian (%)": "50.00%", "Jenis PPK": "(All)", "Kelas Faskes": "(All)"}
    value.update(changes)
    return value


class PerPoliTest(unittest.TestCase):
    def build(self, rows, **filters):
        metadata = pl.DataFrame({"Kdppk": ["0001", "0002"], "Nama_FKRTL": ["RS A", "RS B"], "Kabupaten": ["JEMBER", "LUMAJANG"], "Kelas_RS": ["C", "D"]})
        return build_poli_data(pl.DataFrame(rows, infer_schema_length=None), metadata, sumber=filters.pop("sumber", "Mobile JKN"), **filters)

    def test_weighted_ratio_and_leading_zero(self):
        result = self.build([row(), row(Kdppk="0002", **{"Jumlah Antrean Sesuai Sumber": 90, "Jumlah SEP dengan Antrol": 100, "Waktu Pengambilan": "2026-10-21 11:32:00", "Capaian (%)": 0.9})])
        self.assertEqual(result["top_poli"], [{"poli": "POLI A", "kode_poli": "005", "avg_capaian": 83.33}])
        self.assertEqual(len(result["data"]), 2)

    def test_latest_hospital_snapshot_removes_disappeared_poli(self):
        result = self.build([row(), row(**{"Kode Poli": "008", "Nama Poli": "REMOVED"}), row(**{"Waktu Pengambilan": "2026-10-21 12:00:00", "Jumlah Antrean Sesuai Sumber": 20}), row(Kdppk="0002", **{"Waktu Pengambilan": "2026-10-21 11:32:00"})])
        self.assertEqual(len(result["data"]), 2)
        self.assertEqual([p["poli"] for p in result["top_poli"]], ["POLI A"])
        self.assertEqual(result["top_poli"][0]["avg_capaian"], 75.0)

    def test_deduplicate_same_snapshot(self):
        self.assertEqual(len(self.build([row(), row()])["data"]), 1)

    def test_dashboard_timestamp_precedes_collection_time(self):
        result = self.build([row(), row(**{"Last Update Dashboard": "2026-10-19 02:00:00", "Waktu Pengambilan": "2026-10-21 12:00:00", "Jumlah Antrean Sesuai Sumber": 0})])
        self.assertEqual(result["top_poli"][0]["avg_capaian"], 50)

    def test_source_is_never_combined(self):
        rows = [row(), row(**{"Sumber Antrean": "All Sumber", "Jumlah Antrean Sesuai Sumber": 20})]
        self.assertEqual(self.build(rows, sumber=None)["top_poli"][0]["avg_capaian"], 80)
        self.assertEqual(self.build(rows)["top_poli"][0]["avg_capaian"], 50)
        self.assertFalse(self.build([row()], sumber="All Sumber")["top_poli"])
        self.assertIn("Mobile JKN", self.build([row()], sumber="All Sumber")["poli_message"])

    def test_metadata_and_period_filters(self):
        rows = [row(), row(Kdppk="0002")]
        for month in ("Oktober 2026", "Okt 26", "2026-10", "10"):
            result = self.build(rows, tahun="2026", bulan=month, kabupaten="JEMBER", kelas_rs="C", nama_rs="RS A")
            self.assertEqual(len(result["data"]), 1)
            self.assertEqual(result["data"][0]["Nama_RS"], "RS A")
        self.assertFalse(self.build(rows, bulan="September 2026")["data"])
        self.assertFalse(self.build(rows, tahun="2025")["data"])
        self.assertFalse(self.build(rows, kelas_rs="D", kabupaten="JEMBER")["data"])

    def test_zero_and_formatted_counts(self):
        self.assertEqual(self.build([row(**{"Jumlah SEP dengan Antrol": 0})])["top_poli"][0]["avg_capaian"], 0)
        self.assertEqual(self.build([row(**{"Jumlah Antrean Sesuai Sumber": "1,000", "Jumlah SEP dengan Antrol": "2,000"})])["top_poli"][0]["avg_capaian"], 50)
        for percentage in ("50.00%", 0.5, "garbage"):
            self.assertEqual(self.build([row(**{"Capaian (%)": percentage})])["top_poli"][0]["avg_capaian"], 50)

    def test_invalid_counts_and_headers(self):
        for count in ("nan", "inf", "-1", "", "1.5", "50%", None):
            result = self.build([row(**{"Jumlah SEP dengan Antrol": count})])
            self.assertFalse(result["top_poli"])
            self.assertIn("tidak valid", result["poli_message"])
        missing = row()
        del missing["Jumlah SEP dengan Antrol"]
        self.assertIn("kolom wajib", self.build([missing])["poli_message"])
        self.assertFalse(self.build([row(**{"Validasi Poli": "Exclude"})])["data"])
        self.assertFalse(self.build([row(**{"Waktu Pengambilan": "bad"})])["data"])

    @unittest.skipUnless(Path('/tmp/bpjs-poli-extract/prepared.json').exists(), "local verified extraction fixture unavailable")
    def test_verified_live_fixture(self):
        fixture = json.loads(Path('/tmp/bpjs-poli-extract/prepared.json').read_text())
        frame = pl.DataFrame(fixture["rows"], schema=fixture["headers"], orient="row", infer_schema_length=None, strict=False)
        result = build_poli_data(frame, pl.DataFrame(), sumber="Mobile JKN", bulan="Oktober 2026")
        self.assertEqual(len(result["data"]), 342)
        self.assertEqual(len(result["top_poli"]), 33)
        self.assertEqual(len({r["Kdppk"] for r in result["data"]}), 25)
        self.assertEqual(sum(r["jumlah_antrean"] for r in result["data"]), 45429)
        self.assertEqual(sum(r["sep_antrol"] for r in result["data"]), 62823)
        self.assertEqual(sum(r["sep_rjtl"] for r in result["data"]), 66394)


if __name__ == "__main__":
    unittest.main()
