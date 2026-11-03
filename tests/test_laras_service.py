"""Deterministic checks for aggregate LARAS data; never access Sheets."""

import unittest

from api.laras_service import build_laras_data, parse_duration_seconds


def mark(seconds=600, period="2026-10", code="A", **overrides):
    row = {
        "periode": period,
        "kode_faskes": code,
        "nama_faskes": {"A": "RS Alpha", "B": "RS Beta"}.get(code, "RS Unknown"),
        "jenis_task_id": "Rata-Rata Waktu 3-4 dan 2-4",
        "durasi_detik": str(seconds),
        "durasi_asli": "",
        "status_hasil": "Sesuai",
        "bulan_filter": "(All)",
        "status_filter": "(All)",
        "poli_filter": "(All)",
        "jenis_kunjungan_filter": "(All)",
        "waktu_pencatatan_wib": "2026-10-20 10:00:00",
    }
    row.update(overrides)
    return row


def monthly(seconds=600, period="2026-10", **overrides):
    row = mark(seconds, period, **overrides)
    row["tahun"], row["bulan"] = period.split("-")
    row.pop("periode")
    return row


def daily(seconds=600, date="2026-10-20", **overrides):
    row = mark(seconds, date[:7], **overrides)
    row.pop("periode")
    row.update(tanggal=date, hari_sumber="Selasa")
    return row


REF = {"A": {"kabupaten": "Jember"}, "B": {"kabupaten": "Bondowoso"}}


class DurationTests(unittest.TestCase):
    def test_numeric_seconds_and_legitimate_zero(self):
        for raw, expected in [(0, 0), ("0", 0), ("780", 780), ("1.5", 1.5)]:
            with self.subTest(raw=raw):
                self.assertEqual(parse_duration_seconds({"durasi_detik": raw}), expected)

    def test_duration_fallback(self):
        for duration, expected in [("00 hari 00:13:00", 780), ("01 hari 01:02:03", 90123), ("00:13:00", 780)]:
            with self.subTest(duration=duration):
                self.assertEqual(parse_duration_seconds({"durasi_detik": "invalid", "durasi_asli": duration}), expected)

    def test_valid_seconds_take_precedence(self):
        self.assertEqual(parse_duration_seconds({"durasi_detik": "0", "durasi_asli": "00:13:00"}), 0)

    def test_invalid_values_are_missing(self):
        for raw in [None, "", "nan", "inf", "-inf", -1, "-5", "bad"]:
            with self.subTest(raw=raw):
                self.assertIsNone(parse_duration_seconds({"durasi_detik": raw}))
        for raw in ["-01:00:00", "garbage", "00:99:00", "00:01", "-1 hari 00:00:00"]:
            with self.subTest(duration=raw):
                self.assertIsNone(parse_duration_seconds({"durasi_asli": raw}))


class LarasAggregateTests(unittest.TestCase):
    def build(self, **sheets):
        return build_laras_data(sheets, REF)

    def test_no_data_does_not_fabricate_zero(self):
        result = self.build()
        self.assertEqual(result["status"], "no_data")
        self.assertIsNone(result["kpi"]["avg_seconds"])
        self.assertEqual(result["kpi"]["sample_count"], 0)

    def test_zero_is_valid_and_invalid_values_do_not_lower_average(self):
        result = self.build(per_faskes=[mark(0), mark("nan", code="B")])
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["kpi"]["avg_seconds"], 0)
        self.assertEqual(result["kpi"]["sample_count"], 1)

    def test_other_task_marks_do_not_contaminate_combined_task(self):
        result = self.build(per_faskes=[mark(600), mark(9999, code="B", jenis_task_id="Task 3")])
        self.assertEqual(result["kpi"]["avg_seconds"], 600)
        self.assertEqual(result["kpi"]["sample_count"], 1)

    def test_source_status_scope_is_retained(self):
        result = self.build(per_faskes=[mark(600, status_filter="Kurang dari 60 Menit")])
        self.assertIn("Kurang dari 60 Menit", result["metadata"]["source_scope"])

    def test_latest_snapshot_and_exact_duplicate_are_not_double_counted(self):
        old = mark(100, waktu_pencatatan_wib="2026-10-19 09:00:00")
        new = mark(900, waktu_pencatatan_wib="2026-10-20 09:00:00")
        result = self.build(per_faskes=[old, new, dict(new)])
        self.assertEqual(result["kpi"]["avg_seconds"], 900)
        self.assertEqual(result["kpi"]["sample_count"], 1)

    def test_default_uses_latest_period_but_keeps_monthly_trend(self):
        result = self.build(per_faskes=[mark(100, "2026-09"), mark(900)], per_bulan=[monthly(900), monthly(100, "2026-09")])
        self.assertEqual(result["kpi"]["avg_seconds"], 900)
        self.assertEqual([p["avg_seconds"] for p in result["charts"]["per_bulan"]["points"]], [100, 900])
        options = result["filter_options"]["bulan"]
        self.assertIn({"value": "2026-10", "label": "Oktober 2026"}, options)

    def test_selected_month_restricts_scorecard_and_trend(self):
        result = build_laras_data({"per_faskes": [mark(100, "2026-09"), mark(900)], "per_bulan": [monthly(100, "2026-09"), monthly(900)]}, REF, bulan="2026-09")
        self.assertEqual(result["kpi"]["avg_seconds"], 100)
        self.assertEqual([p["avg_seconds"] for p in result["charts"]["per_bulan"]["points"]], [100])

    def test_historic_month_uses_monthly_facility_marks_when_comparison_is_absent(self):
        result = build_laras_data({
            "per_faskes": [mark(900)],
            "per_bulan": [monthly(100, "2026-09"), monthly(300, "2026-09", code="B")],
        }, REF, bulan="2026-09")
        self.assertEqual(result["kpi"]["avg_seconds"], 200)
        self.assertEqual(result["kpi"]["sample_count"], 2)
        self.assertEqual(result["metadata"]["selected_period"], "2026-09")
        self.assertEqual({p["label"] for p in result["charts"]["per_faskes"]["points"]}, {"RS Alpha", "RS Beta"})

    def test_invalid_source_periods_and_calendar_dates_are_ignored(self):
        result = self.build(
            per_faskes=[mark(600), mark(9999, "2026-13", code="B"), mark(9999, "not-a-period", code="X")],
            per_bulan=[monthly(9999, "2026-13")],
            per_hari=[daily(9999, "2026-02-30"), daily(300, "2026-10-20")],
        )
        self.assertEqual(result["kpi"]["avg_seconds"], 600)
        self.assertEqual(result["filter_options"]["bulan"], [{"value": "2026-10", "label": "Oktober 2026"}])
        self.assertEqual([p["avg_seconds"] for p in result["charts"]["per_hari"]["points"]], [300])

    def test_daily_points_follow_calendar_order_within_latest_period(self):
        result = self.build(per_faskes=[mark(600)], per_hari=[daily(900, "2026-10-21"), daily(100, "2026-09-01"), daily(300, "2026-10-02")])
        self.assertEqual([p["avg_seconds"] for p in result["charts"]["per_hari"]["points"]], [300, 900])

    def test_matching_poli_scope_is_required_for_monthly_and_daily(self):
        result = build_laras_data({
            "per_poli": [mark(1200, kode_poli="INT", nama_poli="Penyakit Dalam")],
            "per_bulan": [monthly(600), monthly(1200, poli_filter="Penyakit Dalam")],
            "per_hari": [daily(600), daily(1200, poli_filter="Penyakit Dalam")],
        }, REF, poli="Penyakit Dalam")
        self.assertEqual([p["avg_seconds"] for p in result["charts"]["per_bulan"]["points"]], [1200])
        self.assertEqual([p["avg_seconds"] for p in result["charts"]["per_hari"]["points"]], [1200])

    def test_default_does_not_mix_specific_visit_scope(self):
        result = self.build(per_faskes=[mark(600), mark(900, jenis_kunjungan_filter="BPJS")])
        self.assertEqual(result["kpi"]["avg_seconds"], 600)
        self.assertIn("BPJS", result["filter_options"]["jenis_kunjungan"])
        self.assertNotIn("(All)", result["filter_options"]["jenis_kunjungan"])

    def test_visit_and_facility_filters_intersect(self):
        rows = [mark(600), mark(900, jenis_kunjungan_filter="BPJS"), mark(1800, code="B", jenis_kunjungan_filter="BPJS")]
        result = build_laras_data({"per_faskes": rows}, REF, faskes="A", jenis_kunjungan="BPJS")
        self.assertEqual(result["kpi"]["avg_seconds"], 900)
        self.assertEqual(result["kpi"]["sample_count"], 1)

    def test_poli_uses_matching_grain_without_inventing_monthly_or_daily_data(self):
        rows = [mark(1200, kode_poli="INT", nama_poli="Penyakit Dalam"), mark(300, kode_poli="ANA", nama_poli="Anak")]
        result = build_laras_data({"per_faskes": [mark(600)], "per_poli": rows, "per_bulan": [monthly(600)], "per_hari": [daily(600)]}, REF, poli="Penyakit Dalam")
        self.assertEqual(result["kpi"]["avg_seconds"], 1200)
        self.assertEqual(result["charts"]["per_bulan"]["points"], [])
        self.assertEqual(result["charts"]["per_hari"]["points"], [])

    def test_unavailable_visit_scope_does_not_fall_back_to_all(self):
        result = build_laras_data({"per_faskes": [mark(600)]}, REF, jenis_kunjungan="Non BPJS")
        self.assertEqual(result["status"], "no_data")
        self.assertIsNone(result["kpi"]["avg_seconds"])

    def test_region_mapping_preserves_unknown_facilities(self):
        result = self.build(per_faskes=[mark(600, code="A"), mark(900, code="X")])
        points = {p["label"]: p["avg_seconds"] for p in result["charts"]["per_kabupaten"]["points"]}
        self.assertEqual(points["Jember"], 600)
        self.assertEqual(points["Kabupaten/kota belum terpetakan"], 900)


if __name__ == "__main__":
    unittest.main()
