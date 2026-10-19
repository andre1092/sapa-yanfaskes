import io
import csv
import time
import ssl
import urllib.request
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger("sapa-api")

# Spreadsheet IDs terverifikasi langsung dari Google Drive Folder
RINGKASAN_KEPATUHAN_SPREADSHEET_ID = "1jzNWEPc4yGodIQQJ8VgVsN3V3mgQ_WaIWDxyYgjhAkM"
TMO_SPREADSHEET_ID = "1zVl0oKveMyQTPOC9wYyWPb41apzK0xu9h2dVbh2gMkY"
ANTREAN_WTL_SPREADSHEET_ID = "16bki76IUsf9BzsIxFBlmKMcN5qJ6Eh7-3oZWY0fLm4c"
SURKON_SPREADSHEET_ID = "1zgkvAL2qu2pcUtphUNJtcqDsFZFWFmxm91Jivwp3PCM"
RME_SPREADSHEET_ID = "1pFTad-Hwl8PqVxgf5xiJn0lE63ssI9ZeI4VLpLwtl7c"
REF_FASKES_SPREADSHEET_ID = "17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs"

MONTH_ORDER = [
    "January 2026", "February 2026", "March 2026",
    "April 2026", "May 2026", "June 2026",
    "July 2026", "August 2026", "September 2026",
    "October 2026", "November 2026", "December 2026"
]

MONTH_INDO = {
    "January 2026": "Januari 2026",
    "February 2026": "Februari 2026",
    "March 2026": "Maret 2026",
    "April 2026": "April 2026",
    "May 2026": "Mei 2026",
    "June 2026": "Juni 2026",
    "July 2026": "Juli 2026",
    "August 2026": "Agustus 2026",
    "September 2026": "September 2026",
    "October 2026": "Oktober 2026",
    "November 2026": "November 2026",
    "December 2026": "Desember 2026"
}

_SERVICE_CACHE = {}
_SERVICE_CACHE_TTL = 300  # 5 menit

def normalize_month(m_str: Optional[str]) -> str:
    if not m_str:
        return ""
    cleaned = str(m_str).replace("\xa0", " ").strip()
    if "/" in cleaned:
        parts = cleaned.split("/")
        if len(parts) >= 2:
            try:
                m_num = int(parts[0])
                m_map = {
                    1: "January 2026", 2: "February 2026", 3: "March 2026",
                    4: "April 2026", 5: "May 2026", 6: "June 2026",
                    7: "July 2026", 8: "August 2026", 9: "September 2026",
                    10: "October 2026", 11: "November 2026", 12: "December 2026"
                }
                return m_map.get(m_num, cleaned)
            except Exception:
                pass
    return cleaned

def fetch_sheet_csv(spreadsheet_id: str, label: str) -> List[Dict[str, str]]:
    cache_key = f"svc_{spreadsheet_id}_{label}"
    now = time.time()
    if cache_key in _SERVICE_CACHE:
        cached_time, recs = _SERVICE_CACHE[cache_key]
        if (now - cached_time) < _SERVICE_CACHE_TTL:
            return recs

    url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv"
    try:
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=8) as resp:
            content = resp.read()
            reader = csv.DictReader(io.StringIO(content.decode("utf-8", errors="ignore")))
            records = list(reader)
            _SERVICE_CACHE[cache_key] = (now, records)
            return records
    except Exception as e:
        logger.error(f"Error fetching sheet {label} ({spreadsheet_id}): {e}")
        if cache_key in _SERVICE_CACHE:
            return _SERVICE_CACHE[cache_key][1]
        return []

def get_ref_lookup() -> Dict[str, Dict[str, str]]:
    raw = fetch_sheet_csv(REF_FASKES_SPREADSHEET_ID, "REF_FASKES")
    lookup = {}
    for r in raw:
        k = r.get("kode_ppk", "").strip()
        if k:
            lookup[k] = r
    return lookup

# ------------------------------------------------------------------------------
# 1. TAB 0: RINGKASAN NILAI AKHIR KEPATUHAN FKRTL
# ------------------------------------------------------------------------------
def process_ringkasan_kepatuhan(
    kabupaten: Optional[str] = None,
    nama_ppk: Optional[str] = None,
    bulan: Optional[str] = None,
    tipe_faskes: Optional[str] = None
) -> Dict[str, Any]:
    raw = fetch_sheet_csv(RINGKASAN_KEPATUHAN_SPREADSHEET_ID, "RINGKASAN_KEPATUHAN")
    ref = get_ref_lookup()

    joined = []
    for r in raw:
        k = r.get("kode ppk", "").strip()
        if not k:
            continue
        ref_item = ref.get(k, {})
        kab = ref_item.get("kabupaten", "Jember").strip()
        nama_rs = ref_item.get("nama_ppk", r.get("nama ppk", "")).strip()
        tipe = r.get("tipe ppk", ref_item.get("kelas_ppk", "RS")).strip()
        m = normalize_month(r.get("bulan", "September 2026"))

        try:
            nilai_all = float(r.get("Nilai akhir all", 0) or 0)
        except Exception:
            nilai_all = 0.0

        def parse_val(col):
            try:
                return float(r.get(col, 0) or 0)
            except Exception:
                return 0.0

        joined.append({
            "kode_ppk": k,
            "nama_ppk": nama_rs,
            "kabupaten": kab,
            "tipe_faskes": tipe,
            "bulan": m,
            "nilai_akhir_all": nilai_all,
            "nilai_jadwal_dokter": parse_val("Nilai Akhir Jadwaldokter"),
            "nilai_pengaduan": parse_val("Nilai Akhir Pengaduan"),
            "nilai_kessan": parse_val("Nilai Akhir Kessan"),
            "nilai_tt": parse_val("Nilai Akhir Tt"),
            "nilai_tmo": parse_val("Nilai Akhir Tmo"),
            "nilai_surkon": parse_val("Nilai Akhir Surkon"),
            "nilai_waktulayan": parse_val("Nilai Akhir Waktulayan"),
            "nilai_rme": parse_val("Nilai Akhir Rme"),
            "status": "Patuh" if nilai_all >= 85.0 else "Belum Patuh"
        })

    # Filter Cascading
    all_kab = sorted(list(set(r["kabupaten"] for r in joined if r["kabupaten"])))
    all_bulan = sorted(list(set(r["bulan"] for r in joined if r["bulan"])))

    filtered = joined
    if kabupaten and kabupaten != "Semua Kabupaten":
        filtered = [r for r in filtered if r["kabupaten"].lower() == kabupaten.lower()]

    avail_faskes = sorted(list(set(r["nama_ppk"] for r in filtered if r["nama_ppk"])))
    avail_tipe = sorted(list(set(r["tipe_faskes"] for r in filtered if r["tipe_faskes"])))

    if nama_ppk and nama_ppk != "Semua Faskes":
        filtered = [r for r in filtered if r["nama_ppk"].lower() == nama_ppk.lower()]
    if tipe_faskes and tipe_faskes != "Semua Tipe Faskes":
        filtered = [r for r in filtered if r["tipe_faskes"].lower() == tipe_faskes.lower()]

    total_faskes = len(filtered)
    avg_all = round(sum(r["nilai_akhir_all"] for r in filtered) / total_faskes, 2) if total_faskes else 0.0
    patuh_count = sum(1 for r in filtered if r["nilai_akhir_all"] >= 85.0)

    pilar_keys = [
        ("Jadwal Dokter (25%)", "nilai_jadwal_dokter"),
        ("Pengaduan (20%)", "nilai_pengaduan"),
        ("Waktu Layan (20%)", "nilai_waktulayan"),
        ("KESSAN (10%)", "nilai_kessan"),
        ("Display TT (10%)", "nilai_tt"),
        ("TMO (5%)", "nilai_tmo"),
        ("Surkon (5%)", "nilai_surkon"),
        ("RME (5%)", "nilai_rme")
    ]

    pilar_summary = []
    for label, col in pilar_keys:
        val = round(sum(r[col] for r in filtered) / total_faskes, 2) if total_faskes else 0.0
        pilar_summary.append({"label": label, "avg_nilai": val})

    filtered.sort(key=lambda x: x["nilai_akhir_all"], reverse=True)

    return {
        "status": "success",
        "kpi": {
            "avg_nilai_akhir": avg_all,
            "target_nasional": 85.0,
            "total_faskes": total_faskes,
            "total_patuh": patuh_count,
            "total_belum_patuh": total_faskes - patuh_count,
            "persen_kepatuhan": round((patuh_count / total_faskes * 100), 1) if total_faskes else 0.0,
            "pilar_summary": pilar_summary
        },
        "monthly_chart": [
            {
                "bulan": "September 2026",
                "bulan_indo": "September 2026",
                "short_name": "Sep 26",
                "avg_capaian": avg_all,
                "faskes_count": total_faskes,
                "met_count": patuh_count
            }
        ],
        "table_data": filtered,
        "filter_options": {
            "kabupaten": ["Semua Kabupaten"] + all_kab,
            "nama_ppk": ["Semua Faskes"] + avail_faskes,
            "bulan": ["Semua Bulan"] + all_bulan,
            "tipe_faskes": ["Semua Tipe Faskes"] + avail_tipe
        },
        "active_filters": {
            "kabupaten": kabupaten or "Semua Kabupaten",
            "nama_ppk": nama_ppk or "Semua Faskes",
            "bulan": bulan or "Semua Bulan",
            "tipe_faskes": tipe_faskes or "Semua Tipe Faskes"
        }
    }

# ------------------------------------------------------------------------------
# 2. TAB 05: UPDATE TMO & JADWAL OPERASI
# ------------------------------------------------------------------------------
def process_tmo_kepatuhan(
    kabupaten: Optional[str] = None,
    nama_ppk: Optional[str] = None,
    bulan: Optional[str] = None,
    tipe_faskes: Optional[str] = None
) -> Dict[str, Any]:
    raw = fetch_sheet_csv(TMO_SPREADSHEET_ID, "TMO_DATA")
    ref = get_ref_lookup()

    joined = []
    for r in raw:
        k = r.get("Kode FKRTL", "").strip()
        if not k:
            continue
        ref_item = ref.get(k, {})
        kab = ref_item.get("kabupaten", "Jember").strip()
        nama_rs = ref_item.get("nama_ppk", r.get("Nama FKRTL", "")).strip()
        tipe = r.get("Nmtypeppk", ref_item.get("kelas_ppk", "RS")).strip()
        m = normalize_month(r.get("bulan", ""))

        try:
            capaian = float(r.get("Capaian Nilai", 0) or 0)
        except Exception:
            capaian = 0.0

        try:
            ops = int(float(r.get("Jumlah Jadwal Operasi", 0) or 0))
        except Exception:
            ops = 0

        joined.append({
            "kode_ppk": k,
            "nama_ppk": nama_rs,
            "kabupaten": kab,
            "tipe_faskes": tipe,
            "bulan": m,
            "flag_target": r.get("Flagtarget", "TMO").strip(),
            "jumlah_jadwal_operasi": ops,
            "capaian": capaian,
            "status": "Tercapai" if capaian >= 100.0 else "Belum Tercapai"
        })

    all_kab = sorted(list(set(r["kabupaten"] for r in joined if r["kabupaten"])))
    all_bulan = [m for m in MONTH_ORDER if any(r["bulan"] == m for r in joined)]

    filtered = joined
    if kabupaten and kabupaten != "Semua Kabupaten":
        filtered = [r for r in filtered if r["kabupaten"].lower() == kabupaten.lower()]

    avail_faskes = sorted(list(set(r["nama_ppk"] for r in filtered if r["nama_ppk"])))
    avail_tipe = sorted(list(set(r["tipe_faskes"] for r in filtered if r["tipe_faskes"])))

    if nama_ppk and nama_ppk != "Semua Faskes":
        filtered = [r for r in filtered if r["nama_ppk"].lower() == nama_ppk.lower()]
    if tipe_faskes and tipe_faskes != "Semua Tipe Faskes":
        filtered = [r for r in filtered if r["tipe_faskes"].lower() == tipe_faskes.lower()]

    # Filter bulan aktif atau ambil bulan terakhir jika Semua
    active_b = bulan if (bulan and bulan != "Semua Bulan") else (all_bulan[-1] if all_bulan else None)
    display_rows = [r for r in filtered if r["bulan"] == active_b] if active_b else filtered

    total_f = len(display_rows)
    avg_c = round(sum(r["capaian"] for r in display_rows) / total_f, 2) if total_f else 0.0
    total_ops = sum(r["jumlah_jadwal_operasi"] for r in display_rows)
    tercapai_cnt = sum(1 for r in display_rows if r["capaian"] >= 100.0)

    # Monthly Trend
    by_month = {}
    for r in filtered:
        m = r["bulan"]
        if m not in by_month:
            by_month[m] = {"sum_c": 0.0, "count": 0, "met": 0, "ops": 0}
        by_month[m]["sum_c"] += r["capaian"]
        by_month[m]["ops"] += r["jumlah_jadwal_operasi"]
        by_month[m]["count"] += 1
        if r["capaian"] >= 100.0:
            by_month[m]["met"] += 1

    monthly_chart = []
    for m in all_bulan:
        if m in by_month:
            d = by_month[m]
            cnt = d["count"]
            monthly_chart.append({
                "bulan": m,
                "bulan_indo": MONTH_INDO.get(m, m),
                "short_name": MONTH_INDO.get(m, m).split()[0][:3],
                "avg_capaian": round(d["sum_c"] / cnt, 2) if cnt else 0.0,
                "total_operasi": d["ops"],
                "faskes_count": cnt,
                "met_count": d["met"]
            })

    display_rows.sort(key=lambda x: x["capaian"], reverse=True)

    return {
        "status": "success",
        "kpi": {
            "avg_capaian": avg_c,
            "bobot_persen": 5,
            "kontribusi_capaian": round(avg_c * 0.05, 2),
            "target_capaian": 100.0,
            "total_faskes": total_f,
            "total_jadwal_operasi": total_ops,
            "total_tercapai": tercapai_cnt,
            "total_belum_tercapai": total_f - tercapai_cnt,
            "persen_kepatuhan": round((tercapai_cnt / total_f * 100), 1) if total_f else 0.0
        },
        "monthly_chart": monthly_chart,
        "table_data": display_rows,
        "filter_options": {
            "kabupaten": ["Semua Kabupaten"] + all_kab,
            "nama_ppk": ["Semua Faskes"] + avail_faskes,
            "bulan": ["Semua Bulan"] + all_bulan,
            "tipe_faskes": ["Semua Tipe Faskes"] + avail_tipe
        },
        "active_filters": {
            "kabupaten": kabupaten or "Semua Kabupaten",
            "nama_ppk": nama_ppk or "Semua Faskes",
            "bulan": active_b or "Semua Bulan",
            "tipe_faskes": tipe_faskes or "Semua Tipe Faskes"
        }
    }

# ------------------------------------------------------------------------------
# 3. TAB 06: ANTREAN MJKN & WAKTU TUNGGU LAYANAN (WTL TASK 2-4)
# ------------------------------------------------------------------------------
def process_antrean_wtl_kepatuhan(
    kabupaten: Optional[str] = None,
    nama_ppk: Optional[str] = None,
    bulan: Optional[str] = None,
    tipe_faskes: Optional[str] = None
) -> Dict[str, Any]:
    raw = fetch_sheet_csv(ANTREAN_WTL_SPREADSHEET_ID, "ANTREAN_WTL_DATA")
    ref = get_ref_lookup()

    joined = []
    for r in raw:
        k = r.get("Kode FKTP", r.get("Kode FKRTL", "")).strip()
        if not k:
            continue
        ref_item = ref.get(k, {})
        kab = ref_item.get("kabupaten", "Jember").strip()
        nama_rs = ref_item.get("nama_ppk", r.get("Nama FKTP", r.get("Nama FKRTL", ""))).strip()
        tipe = r.get("Tipe Faskes", ref_item.get("kelas_ppk", "RS")).strip()
        m = normalize_month(r.get("bulan", ""))

        try:
            capaian = float(r.get("Capaian", 0) or 0)
        except Exception:
            capaian = 0.0

        try:
            mjkn = int(float(r.get("Kunjungan dengan MJKN", 0) or 0))
        except Exception:
            mjkn = 0

        try:
            antrol = int(float(r.get("Kunjungan dengan Antrean Online", 0) or 0))
        except Exception:
            antrol = 0

        target_nas = r.get("% Target Nasional", "30.00 %").strip()
        waktu_task = r.get("Rata-rata Waktu task 2-4", "00:00:00").strip()

        joined.append({
            "kode_ppk": k,
            "nama_ppk": nama_rs,
            "kabupaten": kab,
            "tipe_faskes": tipe,
            "bulan": m,
            "waktu_task_2_4": waktu_task,
            "kunjungan_mjkn": mjkn,
            "kunjungan_antrol": antrol,
            "persen_target_nasional": target_nas,
            "capaian": capaian,
            "status": "Tercapai" if capaian >= 100.0 else "Belum Tercapai"
        })

    all_kab = sorted(list(set(r["kabupaten"] for r in joined if r["kabupaten"])))
    all_bulan = [m for m in MONTH_ORDER if any(r["bulan"] == m for r in joined)]

    filtered = joined
    if kabupaten and kabupaten != "Semua Kabupaten":
        filtered = [r for r in filtered if r["kabupaten"].lower() == kabupaten.lower()]

    avail_faskes = sorted(list(set(r["nama_ppk"] for r in filtered if r["nama_ppk"])))
    avail_tipe = sorted(list(set(r["tipe_faskes"] for r in filtered if r["tipe_faskes"])))

    if nama_ppk and nama_ppk != "Semua Faskes":
        filtered = [r for r in filtered if r["nama_ppk"].lower() == nama_ppk.lower()]
    if tipe_faskes and tipe_faskes != "Semua Tipe Faskes":
        filtered = [r for r in filtered if r["tipe_faskes"].lower() == tipe_faskes.lower()]

    active_b = bulan if (bulan and bulan != "Semua Bulan") else (all_bulan[-1] if all_bulan else None)
    display_rows = [r for r in filtered if r["bulan"] == active_b] if active_b else filtered

    total_f = len(display_rows)
    avg_c = round(sum(r["capaian"] for r in display_rows) / total_f, 2) if total_f else 0.0
    total_mjkn = sum(r["kunjungan_mjkn"] for r in display_rows)
    total_antrol = sum(r["kunjungan_antrol"] for r in display_rows)
    tercapai_cnt = sum(1 for r in display_rows if r["capaian"] >= 100.0)

    # Monthly Trend
    by_month = {}
    for r in filtered:
        m = r["bulan"]
        if m not in by_month:
            by_month[m] = {"sum_c": 0.0, "count": 0, "met": 0, "mjkn": 0, "antrol": 0}
        by_month[m]["sum_c"] += r["capaian"]
        by_month[m]["mjkn"] += r["kunjungan_mjkn"]
        by_month[m]["antrol"] += r["kunjungan_antrol"]
        by_month[m]["count"] += 1
        if r["capaian"] >= 100.0:
            by_month[m]["met"] += 1

    monthly_chart = []
    for m in all_bulan:
        if m in by_month:
            d = by_month[m]
            cnt = d["count"]
            monthly_chart.append({
                "bulan": m,
                "bulan_indo": MONTH_INDO.get(m, m),
                "short_name": MONTH_INDO.get(m, m).split()[0][:3],
                "avg_capaian": round(d["sum_c"] / cnt, 2) if cnt else 0.0,
                "total_mjkn": d["mjkn"],
                "total_antrol": d["antrol"],
                "faskes_count": cnt,
                "met_count": d["met"]
            })

    display_rows.sort(key=lambda x: x["capaian"], reverse=True)

    return {
        "status": "success",
        "kpi": {
            "avg_capaian": avg_c,
            "bobot_persen": 20,
            "kontribusi_capaian": round(avg_c * 0.20, 2),
            "target_capaian": 100.0,
            "target_nasional_persen": "30.00 %",
            "total_faskes": total_f,
            "total_mjkn": total_mjkn,
            "total_antrol": total_antrol,
            "rasio_mjkn_antrol": round((total_mjkn / total_antrol * 100), 1) if total_antrol else 0.0,
            "total_tercapai": tercapai_cnt,
            "total_belum_tercapai": total_f - tercapai_cnt,
            "persen_kepatuhan": round((tercapai_cnt / total_f * 100), 1) if total_f else 0.0
        },
        "monthly_chart": monthly_chart,
        "table_data": display_rows,
        "filter_options": {
            "kabupaten": ["Semua Kabupaten"] + all_kab,
            "nama_ppk": ["Semua Faskes"] + avail_faskes,
            "bulan": ["Semua Bulan"] + all_bulan,
            "tipe_faskes": ["Semua Tipe Faskes"] + avail_tipe
        },
        "active_filters": {
            "kabupaten": kabupaten or "Semua Kabupaten",
            "nama_ppk": nama_ppk or "Semua Faskes",
            "bulan": active_b or "Semua Bulan",
            "tipe_faskes": tipe_faskes or "Semua Tipe Faskes"
        }
    }

# ------------------------------------------------------------------------------
# 4. TAB 07: PENERBITAN SURAT KONTROL (SURKON TERBIT)
# ------------------------------------------------------------------------------
def process_surkon_kepatuhan(
    kabupaten: Optional[str] = None,
    nama_ppk: Optional[str] = None,
    bulan: Optional[str] = None,
    tipe_faskes: Optional[str] = None
) -> Dict[str, Any]:
    raw = fetch_sheet_csv(SURKON_SPREADSHEET_ID, "SURKON_DATA")
    ref = get_ref_lookup()

    joined = []
    for r in raw:
        k = r.get("Kode FKRTL", "").strip()
        if not k:
            continue
        ref_item = ref.get(k, {})
        kab = ref_item.get("kabupaten", "Jember").strip()
        nama_rs = ref_item.get("nama_ppk", r.get("Nama FKRTL", "")).strip()
        tipe = r.get("Tipe Faskes", ref_item.get("kelas_ppk", "RS")).strip()
        m = normalize_month(r.get("bulan", ""))

        try:
            capaian = float(r.get("Capaian", 0) or 0)
        except Exception:
            capaian = 0.0

        try:
            totalsep = int(float(r.get("Totalsep", 0) or 0))
        except Exception:
            totalsep = 0

        try:
            sesuai = int(float(r.get("Sesuai", 0) or 0))
        except Exception:
            sesuai = 0

        pct = r.get("Persentase", "0%").strip()

        joined.append({
            "kode_ppk": k,
            "nama_ppk": nama_rs,
            "kabupaten": kab,
            "tipe_faskes": tipe,
            "bulan": m,
            "totalsep": totalsep,
            "sesuai": sesuai,
            "persentase": pct,
            "capaian": capaian,
            "status": "Tercapai" if capaian >= 100.0 else "Belum Tercapai"
        })

    all_kab = sorted(list(set(r["kabupaten"] for r in joined if r["kabupaten"])))
    all_bulan = [m for m in MONTH_ORDER if any(r["bulan"] == m for r in joined)]

    filtered = joined
    if kabupaten and kabupaten != "Semua Kabupaten":
        filtered = [r for r in filtered if r["kabupaten"].lower() == kabupaten.lower()]

    avail_faskes = sorted(list(set(r["nama_ppk"] for r in filtered if r["nama_ppk"])))
    avail_tipe = sorted(list(set(r["tipe_faskes"] for r in filtered if r["tipe_faskes"])))

    if nama_ppk and nama_ppk != "Semua Faskes":
        filtered = [r for r in filtered if r["nama_ppk"].lower() == nama_ppk.lower()]
    if tipe_faskes and tipe_faskes != "Semua Tipe Faskes":
        filtered = [r for r in filtered if r["tipe_faskes"].lower() == tipe_faskes.lower()]

    active_b = bulan if (bulan and bulan != "Semua Bulan") else (all_bulan[-1] if all_bulan else None)
    display_rows = [r for r in filtered if r["bulan"] == active_b] if active_b else filtered

    total_f = len(display_rows)
    avg_c = round(sum(r["capaian"] for r in display_rows) / total_f, 2) if total_f else 0.0
    total_sep_all = sum(r["totalsep"] for r in display_rows)
    total_sesuai_all = sum(r["sesuai"] for r in display_rows)
    tercapai_cnt = sum(1 for r in display_rows if r["capaian"] >= 100.0)

    # Monthly Trend
    by_month = {}
    for r in filtered:
        m = r["bulan"]
        if m not in by_month:
            by_month[m] = {"sum_c": 0.0, "count": 0, "met": 0, "sep": 0, "sesuai": 0}
        by_month[m]["sum_c"] += r["capaian"]
        by_month[m]["sep"] += r["totalsep"]
        by_month[m]["sesuai"] += r["sesuai"]
        by_month[m]["count"] += 1
        if r["capaian"] >= 100.0:
            by_month[m]["met"] += 1

    monthly_chart = []
    for m in all_bulan:
        if m in by_month:
            d = by_month[m]
            cnt = d["count"]
            monthly_chart.append({
                "bulan": m,
                "bulan_indo": MONTH_INDO.get(m, m),
                "short_name": MONTH_INDO.get(m, m).split()[0][:3],
                "avg_capaian": round(d["sum_c"] / cnt, 2) if cnt else 0.0,
                "total_sep": d["sep"],
                "total_sesuai": d["sesuai"],
                "faskes_count": cnt,
                "met_count": d["met"]
            })

    display_rows.sort(key=lambda x: x["capaian"], reverse=True)

    return {
        "status": "success",
        "kpi": {
            "avg_capaian": avg_c,
            "bobot_persen": 5,
            "kontribusi_capaian": round(avg_c * 0.05, 2),
            "target_capaian": 100.0,
            "target_persen": "≥ 90.0%",
            "total_faskes": total_f,
            "total_sep": total_sep_all,
            "total_sesuai": total_sesuai_all,
            "avg_persentase": round((total_sesuai_all / total_sep_all * 100), 2) if total_sep_all else 0.0,
            "total_tercapai": tercapai_cnt,
            "total_belum_tercapai": total_f - tercapai_cnt,
            "persen_kepatuhan": round((tercapai_cnt / total_f * 100), 1) if total_f else 0.0
        },
        "monthly_chart": monthly_chart,
        "table_data": display_rows,
        "filter_options": {
            "kabupaten": ["Semua Kabupaten"] + all_kab,
            "nama_ppk": ["Semua Faskes"] + avail_faskes,
            "bulan": ["Semua Bulan"] + all_bulan,
            "tipe_faskes": ["Semua Tipe Faskes"] + avail_tipe
        },
        "active_filters": {
            "kabupaten": kabupaten or "Semua Kabupaten",
            "nama_ppk": nama_ppk or "Semua Faskes",
            "bulan": active_b or "Semua Bulan",
            "tipe_faskes": tipe_faskes or "Semua Tipe Faskes"
        }
    }

# ------------------------------------------------------------------------------
# 5. TAB 08: REKAM MEDIS ELEKTRONIK (RME)
# ------------------------------------------------------------------------------
def process_rme_kepatuhan(
    kabupaten: Optional[str] = None,
    nama_ppk: Optional[str] = None,
    bulan: Optional[str] = None,
    tipe_faskes: Optional[str] = None
) -> Dict[str, Any]:
    raw = fetch_sheet_csv(RME_SPREADSHEET_ID, "RME_DATA")
    ref = get_ref_lookup()

    joined = []
    for r in raw:
        k = r.get("kode FKRTL", "").strip()
        if not k:
            continue
        ref_item = ref.get(k, {})
        kab = ref_item.get("kabupaten", "Jember").strip()
        nama_rs = ref_item.get("nama_ppk", r.get("nama FKRTL", "")).strip()
        tipe = r.get("TIpe Faskes", ref_item.get("kelas_ppk", "RS")).strip()
        m = normalize_month(r.get("bulan", ""))

        try:
            capaian = float(r.get("Capaian", 0) or 0)
        except Exception:
            capaian = 0.0

        def parse_i(col):
            try:
                return int(float(r.get(col, 0) or 0))
            except Exception:
                return 0

        ritl_gt7 = parse_i("Jlh Sep Ritl > 7 hari")
        ritl_lt7 = parse_i("Jlh Sep Ritl < 7 hari")
        rjtl_gt7 = parse_i("Jlh Sep Rjtl > 7 hari")
        rjtl_lt7 = parse_i("Jlh Sep Rjtl < 7 hari")

        joined.append({
            "kode_ppk": k,
            "nama_ppk": nama_rs,
            "kabupaten": kab,
            "tipe_faskes": tipe,
            "bulan": m,
            "ritl_lt7": ritl_lt7,
            "ritl_gt7": ritl_gt7,
            "rjtl_lt7": rjtl_lt7,
            "rjtl_gt7": rjtl_gt7,
            "capaian": capaian,
            "status": "Tercapai" if capaian >= 100.0 else "Belum Tercapai"
        })

    all_kab = sorted(list(set(r["kabupaten"] for r in joined if r["kabupaten"])))
    all_bulan = [m for m in MONTH_ORDER if any(r["bulan"] == m for r in joined)]

    filtered = joined
    if kabupaten and kabupaten != "Semua Kabupaten":
        filtered = [r for r in filtered if r["kabupaten"].lower() == kabupaten.lower()]

    avail_faskes = sorted(list(set(r["nama_ppk"] for r in filtered if r["nama_ppk"])))
    avail_tipe = sorted(list(set(r["tipe_faskes"] for r in filtered if r["tipe_faskes"])))

    if nama_ppk and nama_ppk != "Semua Faskes":
        filtered = [r for r in filtered if r["nama_ppk"].lower() == nama_ppk.lower()]
    if tipe_faskes and tipe_faskes != "Semua Tipe Faskes":
        filtered = [r for r in filtered if r["tipe_faskes"].lower() == tipe_faskes.lower()]

    active_b = bulan if (bulan and bulan != "Semua Bulan") else (all_bulan[-1] if all_bulan else None)
    display_rows = [r for r in filtered if r["bulan"] == active_b] if active_b else filtered

    total_f = len(display_rows)
    avg_c = round(sum(r["capaian"] for r in display_rows) / total_f, 2) if total_f else 0.0
    tot_ritl_lt7 = sum(r["ritl_lt7"] for r in display_rows)
    tot_ritl_gt7 = sum(r["ritl_gt7"] for r in display_rows)
    tot_rjtl_lt7 = sum(r["rjtl_lt7"] for r in display_rows)
    tot_rjtl_gt7 = sum(r["rjtl_gt7"] for r in display_rows)
    tercapai_cnt = sum(1 for r in display_rows if r["capaian"] >= 100.0)

    # Monthly Trend
    by_month = {}
    for r in filtered:
        m = r["bulan"]
        if m not in by_month:
            by_month[m] = {"sum_c": 0.0, "count": 0, "met": 0}
        by_month[m]["sum_c"] += r["capaian"]
        by_month[m]["count"] += 1
        if r["capaian"] >= 100.0:
            by_month[m]["met"] += 1

    monthly_chart = []
    for m in all_bulan:
        if m in by_month:
            d = by_month[m]
            cnt = d["count"]
            monthly_chart.append({
                "bulan": m,
                "bulan_indo": MONTH_INDO.get(m, m),
                "short_name": MONTH_INDO.get(m, m).split()[0][:3],
                "avg_capaian": round(d["sum_c"] / cnt, 2) if cnt else 0.0,
                "faskes_count": cnt,
                "met_count": d["met"]
            })

    display_rows.sort(key=lambda x: x["capaian"], reverse=True)

    return {
        "status": "success",
        "kpi": {
            "avg_capaian": avg_c,
            "bobot_persen": 5,
            "kontribusi_capaian": round(avg_c * 0.05, 2),
            "target_capaian": 100.0,
            "target_persen": "≥ 95.0%",
            "total_faskes": total_f,
            "total_ritl_lt7": tot_ritl_lt7,
            "total_ritl_gt7": tot_ritl_gt7,
            "total_rjtl_lt7": tot_rjtl_lt7,
            "total_rjtl_gt7": tot_rjtl_gt7,
            "total_tercapai": tercapai_cnt,
            "total_belum_tercapai": total_f - tercapai_cnt,
            "persen_kepatuhan": round((tercapai_cnt / total_f * 100), 1) if total_f else 0.0
        },
        "monthly_chart": monthly_chart,
        "table_data": display_rows,
        "filter_options": {
            "kabupaten": ["Semua Kabupaten"] + all_kab,
            "nama_ppk": ["Semua Faskes"] + avail_faskes,
            "bulan": ["Semua Bulan"] + all_bulan,
            "tipe_faskes": ["Semua Tipe Faskes"] + avail_tipe
        },
        "active_filters": {
            "kabupaten": kabupaten or "Semua Kabupaten",
            "nama_ppk": nama_ppk or "Semua Faskes",
            "bulan": active_b or "Semua Bulan",
            "tipe_faskes": tipe_faskes or "Semua Tipe Faskes"
        }
    }
