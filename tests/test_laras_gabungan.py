"""Angka semua fasilitas LARAS memakai tab `gabungan` (angka BI dibobot kunjungan); tidak membaca Sheets."""

import unittest

from api.laras_service import build_laras_data

STATUS = "Kurang dari 60 Menit"
TASK = "Rata-Rata Waktu 3-4 dan 2-4"


def detik(teks):
    jam, menit, dtk = (int(bagian) for bagian in teks.split(":"))
    return jam * 3600 + menit * 60 + dtk


def gab(grafik, periode, durasi, *, label="", tanggal="", kode_poli="", nama_poli="", bulan_filter=None, waktu="2026-11-13 10:00:00"):
    return {
        "grafik": grafik, "periode": periode, "tanggal": tanggal, "label": label,
        "kode_poli": kode_poli, "nama_poli": nama_poli, "jenis_task_id": TASK,
        "durasi_asli": f"00 hari {durasi}", "durasi_detik": str(detik(durasi)), "status_hasil": "Sesuai",
        "fasilitas_filter": "(All)", "status_filter": STATUS, "poli_filter": "(All)",
        "jenis_kunjungan_filter": "(All)", "bulan_filter": bulan_filter or periode,
        "waktu_pencatatan_wib": waktu,
    }


def per_rs(seconds, code, period="2026-11", **extra):
    return {
        "periode": period, "kode_faskes": code, "nama_faskes": f"RS {code}", "jenis_task_id": TASK,
        "durasi_detik": str(seconds), "durasi_asli": "", "status_filter": STATUS, "poli_filter": "(All)",
        "jenis_kunjungan_filter": "(All)", "waktu_pencatatan_wib": "2026-11-13 09:00:00", **extra,
    }


def poli_rs(seconds, code, nama_poli, period="2026-11"):
    return per_rs(seconds, code, period, kode_poli=nama_poli[:3], nama_poli=nama_poli)


# Angka uji dari BI (Fasilitas Kesehatan (All), Jenis Kunjungan (All), Namapoli (All), Status Kurang dari 60 Menit).
GABUNGAN = [
    gab("kpi", "2026-11", "00:49:43", label="Semua fasilitas"),
    gab("kpi", "2026-10", "00:49:43", label="Semua fasilitas"),
    gab("per_bulan", "2026-01", "00:58:53", label="Jan 26", bulan_filter="2026-11"),
    gab("per_bulan", "2026-06", "00:55:04", label="Jun 26", bulan_filter="2026-11"),
    gab("per_bulan", "2026-11", "00:42:03", label="Nov 26", bulan_filter="2026-11"),
    gab("per_kabupaten", "2026-11", "00:48:36", label="KAB. JEMBER"),
    gab("per_kabupaten", "2026-11", "00:37:03", label="KAB. BONDOWOSO"),
    gab("per_kabupaten", "2026-11", "00:30:02", label="KAB. LUMAJANG"),
    gab("per_hari", "2026-11", "00:29:22", tanggal="2026-11-01", label="01 Nov (Sat)"),
    gab("per_poli", "2026-11", "03:15:20", label="GOR-GERIATRI", kode_poli="GOR", nama_poli="GERIATRI"),
]
REF = {"A": {"kabupaten": "Jember"}, "B": {"kabupaten": "Bondowoso"}}
RS = {
    "per_faskes": [per_rs(600, "A"), per_rs(1200, "B"), per_rs(300, "A", "2026-10"), per_rs(900, "B", "2026-10")],
    "per_bulan": [{**per_rs(600, "A"), "tahun": "2026", "bulan": "11"}, {**per_rs(1200, "B"), "tahun": "2026", "bulan": "11"}],
    "per_poli": [poli_rs(500, "A", "GERIATRI"), poli_rs(700, "B", "GERIATRI")],
    "per_hari": [{**per_rs(400, "A"), "tanggal": "2026-11-01"}, {**per_rs(800, "B"), "tanggal": "2026-11-01"}],
}


def titik(chart):
    return [(point["label"], point["avg_seconds"]) for point in chart["points"]]


class GabunganSemuaFasilitasTests(unittest.TestCase):
    def build(self, gabungan=GABUNGAN, **filters):
        return build_laras_data({**RS, "gabungan": gabungan}, REF, **filters)

    def test_semua_fasilitas_sama_dengan_bi(self):
        result = self.build()
        self.assertEqual(result["kpi"]["avg_seconds"], detik("00:49:43"))
        self.assertEqual(titik(result["charts"]["per_bulan"]),
                         [("2026-01", detik("00:58:53")), ("2026-06", detik("00:55:04")), ("2026-11", detik("00:42:03"))])
        self.assertEqual(titik(result["charts"]["per_kabupaten"]),
                         [("KAB. JEMBER", detik("00:48:36")), ("KAB. BONDOWOSO", detik("00:37:03")), ("KAB. LUMAJANG", detik("00:30:02"))])
        self.assertEqual(titik(result["charts"]["per_hari"]), [("2026-11-01", detik("00:29:22"))])
        self.assertEqual(titik(result["charts"]["per_poli"]), [("GERIATRI", detik("03:15:20"))])
        self.assertTrue(result["metadata"]["bobot_kunjungan"])

    def test_grafik_per_fasilitas_tetap_per_rs(self):
        self.assertEqual(titik(self.build()["charts"]["per_faskes"]), [("RS B", 1200), ("RS A", 600)])

    def test_bulan_terpilih(self):
        result = self.build(bulan="2026-10")
        self.assertEqual(result["kpi"]["avg_seconds"], detik("00:49:43"))
        # Gabungan belum punya per_kabupaten Oktober: kembali ke rata-rata antar fasilitas.
        self.assertEqual(titik(result["charts"]["per_kabupaten"]), [("Bondowoso", 900), ("Jember", 300)])
        self.assertEqual(titik(self.build(bulan="2026-06")["charts"]["per_bulan"]), [("2026-06", detik("00:55:04"))])

    def test_baris_terbaru_dipakai(self):
        lama = gab("kpi", "2026-11", "00:10:00", waktu="2026-11-12 08:00:00")
        baru = gab("kpi", "2026-11", "00:49:43", waktu="2026-11-13 10:00:00")
        self.assertEqual(self.build(gabungan=[baru, lama])["kpi"]["avg_seconds"], detik("00:49:43"))
        self.assertEqual(self.build(gabungan=[lama, baru])["kpi"]["avg_seconds"], detik("00:49:43"))

    def test_filter_faskes_atau_poli_memakai_cara_lama(self):
        result = self.build(faskes="A")
        self.assertEqual(result["kpi"]["avg_seconds"], 600)
        self.assertEqual(titik(result["charts"]["per_kabupaten"]), [("Jember", 600)])
        self.assertFalse(result["metadata"]["bobot_kunjungan"])
        result = self.build(poli="GERIATRI")
        self.assertEqual(titik(result["charts"]["per_poli"]), [("GERIATRI", 600)])
        self.assertNotEqual(result["kpi"]["avg_seconds"], detik("00:49:43"))

    def test_tanpa_gabungan_memakai_cara_lama(self):
        result = self.build(gabungan=[])
        self.assertEqual(result["kpi"]["avg_seconds"], 900)
        self.assertEqual(titik(result["charts"]["per_kabupaten"]), [("Bondowoso", 1200), ("Jember", 600)])
        self.assertFalse(result["metadata"]["bobot_kunjungan"])

    def test_status_ekstraksi_lain_diabaikan(self):
        lain = {**gab("kpi", "2026-11", "00:10:00", waktu="2026-11-14 10:00:00"), "status_filter": "(All)"}
        self.assertEqual(self.build(gabungan=[*GABUNGAN, lain])["kpi"]["avg_seconds"], detik("00:49:43"))



class RincianPoliPerFaskesTests(unittest.TestCase):
    def test_rincian_poli_per_faskes_dengan_kabupaten(self):
        result = build_laras_data({**RS, "gabungan": GABUNGAN}, REF)
        self.assertEqual(result["rincian_poli"], [
            {"faskes": "RS B", "kabupaten": "Bondowoso", "poli": "GERIATRI", "avg_seconds": 700},
            {"faskes": "RS A", "kabupaten": "Jember", "poli": "GERIATRI", "avg_seconds": 500},
        ])

    def test_rincian_mengikuti_filter_dan_kabupaten_kosong_ditandai(self):
        result = build_laras_data({**RS, "gabungan": GABUNGAN}, {}, faskes="A")
        self.assertEqual(result["rincian_poli"],
                         [{"faskes": "RS A", "kabupaten": "Kabupaten/kota belum terpetakan", "poli": "GERIATRI", "avg_seconds": 500}])
        self.assertEqual(build_laras_data({**RS, "gabungan": GABUNGAN}, REF, bulan="2026-10")["rincian_poli"], [])


if __name__ == "__main__":
    unittest.main()
