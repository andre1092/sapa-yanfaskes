"""Canonical per_poli sheet adapter shared by chart and export endpoints."""
from collections import defaultdict
from datetime import datetime
import math
import re

_MONTHS = {
    "januari": 1, "jan": 1, "februari": 2, "feb": 2, "maret": 3, "mar": 3,
    "april": 4, "apr": 4, "mei": 5, "juni": 6, "jun": 6, "juli": 7, "jul": 7,
    "agustus": 8, "agu": 8, "ags": 8, "september": 9, "sep": 9,
    "oktober": 10, "okt": 10, "november": 11, "nov": 11, "desember": 12, "des": 12,
}
_REQUIRED = {
    "Periode", "Kdppk", "Nmppk", "Kode Poli", "Nama Poli", "Sumber Antrean", "Validasi Poli",
    "Waktu Pengambilan", "Last Update Dashboard", "Jumlah Antrean Sesuai Sumber",
    "Jumlah SEP dengan Antrol", "Jumlah SEP RJTL",
}


def _text(value):
    return str(value).strip() if value is not None else ""


def _source(value):
    value = _text(value)
    return "All Sumber" if value.lower() in {"", "(all)", "semua sumber", "all sumber"} else value


def _count(value):
    text = _text(value).replace(" ", "")
    # Google CSV uses comma thousands separators; numbers are counts, never percentages.
    if re.fullmatch(r"\d{1,3}(,\d{3})+(\.0+)?", text):
        text = text.replace(",", "")
    try:
        result = float(text)
    except (ValueError, TypeError):
        return None
    return result if math.isfinite(result) and result >= 0 and result.is_integer() else None


def _timestamp(value):
    text = _text(value)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%m/%d/%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _month_matches(period, month):
    if not month or month == "(All)":
        return True
    value = _text(month).lower()
    if re.fullmatch(r"\d{4}-\d{2}", value):
        return period == value
    if value.isdigit() and 1 <= int(value) <= 12:
        return int(period[5:]) == int(value)
    tokens = value.split()
    selected_month = _MONTHS.get(tokens[0]) if tokens else None
    if not selected_month or int(period[5:]) != selected_month:
        return False
    years = [t for t in tokens[1:] if t.isdigit()]
    return not years or period[:4].endswith(years[0])


def _metadata(frame):
    columns = {c.lower(): c for c in frame.columns}
    aliases = {
        "Kabupaten": ("kabupaten", "kab", "kota", "kab_kota", "kepwil"),
        "Kelas_RS": ("kelas_rs", "kelas", "jenis ppk", "jenis_ppk"),
        "Nama_RS": ("nama_fkrtl", "nama fkrtl", "nama_rs", "nama rs", "nama_faskes", "nama faskes", "faskes"),
    }
    result = {}
    for row in frame.to_dicts():
        code = _text(row.get("Kdppk"))
        if code and code not in result:
            result[code] = {key: next((_text(row.get(columns[a])) for a in options if a in columns), "") for key, options in aliases.items()}
    return result


def build_poli_data(df_poli, df_faskes, tahun=None, bulan=None, kabupaten=None, nama_rs=None, kelas_rs=None, sumber=None):
    """Return actual source rows and weighted poli totals; never substitute mock data."""
    result = {"top_poli": [], "poli_message": "", "poli_sources": [], "data": []}
    missing = sorted(_REQUIRED - set(df_poli.columns))
    if missing:
        result["poli_message"] = "Data per_poli belum tersedia atau kolom wajib tidak lengkap: " + ", ".join(missing)
        return result

    snapshots = defaultdict(list)
    for original in df_poli.to_dicts():
        row = {key: _text(value) for key, value in original.items()}
        period = row["Periode"]
        period_date = _timestamp(period)
        legacy_period = bool(re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", period))
        if (not legacy_period and period_date is None) or row["Validasi Poli"].lower() != "include":
            continue
        if not row["Kdppk"] or not row["Kode Poli"] or not row["Nama Poli"] or not row["Sumber Antrean"]:
            continue
        updated, collected = _timestamp(row["Last Update Dashboard"]), _timestamp(row["Waktu Pengambilan"])
        if updated is None or collected is None:
            continue
        if period_date is not None and period_date != updated:
            continue
        row["_month"] = period if legacy_period else period_date.strftime("%Y-%m")
        row["_snapshot"] = (updated, collected)
        row["_source"] = _source(row["Sumber Antrean"])
        snapshots[(row["_month"], row["_source"])].append(row)

    metadata = _metadata(df_faskes)
    selected_source = _source(sumber)
    sources = set()
    invalid = 0
    for group in snapshots.values():
        # A month uses one BI update per source, never a mixture of old and new FKRTL.
        latest = max(row["_snapshot"][0] for row in group)
        collected_by_faskes = {}
        for row in group:
            if row["_snapshot"][0] == latest:
                code = row["Kdppk"]
                collected_by_faskes[code] = max(collected_by_faskes.get(code, datetime.min), row["_snapshot"][1])
        dedup = {}
        for row in group:
            if row["_snapshot"] == (latest, collected_by_faskes.get(row["Kdppk"])):
                dedup[(row["Kdppk"], row["Kode Poli"])] = row
        for row in dedup.values():
            period, code = row["_month"], row["Kdppk"]
            if tahun and tahun != "(All)" and period[:4] != str(tahun):
                continue
            if not _month_matches(period, bulan):
                continue
            meta = metadata.get(code, {})
            name = meta.get("Nama_RS") or row["Nmppk"]
            if any(selected and selected != "(All)" and actual != selected for selected, actual in (
                (kabupaten, meta.get("Kabupaten", "")), (kelas_rs, meta.get("Kelas_RS", "")), (nama_rs, name),
            )):
                continue
            sources.add(row["_source"])
            if row["_source"] != selected_source:
                continue
            counts = [_count(row[key]) for key in ("Jumlah Antrean Sesuai Sumber", "Jumlah SEP dengan Antrol", "Jumlah SEP RJTL")]
            if any(value is None for value in counts):
                invalid += 1
                continue
            numerator, sep_antrol, sep_rjtl = counts
            denominator = sep_antrol if selected_source == "Mobile JKN" else sep_rjtl
            result["data"].append({
                "Periode": row["Periode"], "Kdppk": code, "Nama_RS": name,
                "Kabupaten": meta.get("Kabupaten", ""), "Kelas_RS": meta.get("Kelas_RS", ""),
                "Kode_Poli": row["Kode Poli"], "Nama_Poli": row["Nama Poli"], "Sumber": selected_source,
                "jumlah_antrean": numerator, "sep_antrol": sep_antrol, "sep_rjtl": sep_rjtl,
                "capaian_pct": round(numerator / denominator * 100, 2) if denominator else 0.0,
                "last_update": row["Last Update Dashboard"],
            })

    totals = defaultdict(lambda: [0.0, 0.0])
    for row in result["data"]:
        total = totals[(row["Kode_Poli"], row["Nama_Poli"])]
        total[0] += row["jumlah_antrean"]
        total[1] += row["sep_antrol"] if selected_source == "Mobile JKN" else row["sep_rjtl"]
    result["top_poli"] = sorted([
        {"poli": name, "kode_poli": code, "avg_capaian": round(num / den * 100, 2) if den else 0.0}
        for (code, name), (num, den) in totals.items()
    ], key=lambda row: (-row["avg_capaian"], row["poli"], row["kode_poli"]))
    result["data"].sort(key=lambda row: (row["Periode"], row["Kdppk"], row["Kode_Poli"]))
    result["poli_sources"] = sorted(sources)
    if not result["data"]:
        available = ", ".join(sorted(sources))
        result["poli_message"] = (f"Data poli untuk {selected_source} belum tersedia. Pilih sumber {available}." if available and selected_source not in sources else "Tidak ada data poli untuk filter yang dipilih.")
    if invalid:
        result["poli_message"] = f"{invalid} baris per_poli diabaikan karena jumlah antrean/SEP tidak valid."
    return result
