"""LARAS chart marks: preserve extraction grain and filter scope, never invent visits."""
from __future__ import annotations

import csv
import io
import math
import re
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any


try:
    from .sheets_source import read_sheet_csv
except ImportError:
    from sheets_source import read_sheet_csv

SPREADSHEET_ID = "1rKEVk54FM7pDf2FpNA35ycTvvMsG542npXsU_xjaaoE"
SOURCE_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit"
TASK = "Rata-Rata Waktu 3-4 dan 2-4"
TABS = {"per_bulan": 0, "per_faskes": 101, "per_poli": 102, "per_hari": 103}
MONTHS = ("", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember")
_cache: tuple[float, dict, dict] | None = None
_cache_lock = threading.Lock()


class LarasSourceUnavailable(Exception):
    """A required source could not be read or its schema changed."""


def parse_duration_seconds(row: dict) -> float | None:
    raw = str(row.get("durasi_detik", "")).strip()
    if raw:
        try:
            value = float(raw)
        except ValueError:
            value = None
        if value is not None:
            return value if math.isfinite(value) and value >= 0 else None
    duration = str(row.get("durasi_asli", "")).strip()
    match = re.fullmatch(r"(?:(\d+)\s+hari\s+)?(\d+):(\d{2}):(\d{2})", duration)
    if not match:
        return None
    days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
    if minutes >= 60 or seconds >= 60:
        return None
    return float(days * 86400 + hours * 3600 + minutes * 60 + seconds)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _scope(value: Any) -> str:
    value = _text(value)
    return "" if value.casefold() in ("", "(all)", "all", "semua") else value


def _period(value: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}", value):
        return ""
    try:
        date.fromisoformat(value + "-01")
    except ValueError:
        return ""
    return value


def _normalize(rows: list[dict], grain: str) -> list[dict]:
    latest = {}
    for row in rows:
        if _text(row.get("jenis_task_id")).casefold() != TASK.casefold():
            continue
        code = _text(row.get("kode_faskes"))
        if not code:
            continue
        if grain == "per_bulan":
            try:
                period = _period(f"{int(row.get('tahun', '')):04d}-{int(row.get('bulan', '')):02d}")
            except (ValueError, TypeError):
                continue
        elif grain == "per_hari":
            try:
                day = date.fromisoformat(_text(row.get("tanggal"))).isoformat()
            except ValueError:
                continue
            period = day[:7]
        else:
            period = _period(_text(row.get("periode")))
        if not period:
            continue
        normalized = {
            **row, "_period": period, "_code": code,
            "_poli": _text(row.get("nama_poli")),
            "_poli_scope": _scope(row.get("poli_filter")),
            "_visit_scope": _scope(row.get("jenis_kunjungan_filter")),
            "_seconds": parse_duration_seconds(row),
        }
        key = (period, code, _text(row.get("kode_poli")) or normalized["_poli"] if grain == "per_poli" else "",
               _text(row.get("tanggal")) if grain == "per_hari" else "",
               normalized["_poli_scope"], normalized["_visit_scope"], _text(row.get("status_filter")))
        # ISO local recording timestamps sort chronologically; ties use last source mark.
        previous = latest.get(key)
        if previous is None or _text(row.get("waktu_pencatatan_wib")) >= _text(previous.get("waktu_pencatatan_wib")):
            latest[key] = normalized
    return list(latest.values())


def _chart(rows: list[dict], label, *, chronological: bool = False, empty: str = "Belum tersedia data untuk pilihan filter ini.") -> dict:
    groups = defaultdict(list)
    for row in rows:
        if row["_seconds"] is not None:
            groups[label(row)].append(row["_seconds"])
    points = [{"label": key, "avg_seconds": round(sum(values) / len(values), 3), "sample_count": len(values)}
              for key, values in groups.items()]
    points.sort(key=(lambda point: point["label"]) if chronological else (lambda point: (-point["avg_seconds"], point["label"])))
    return {"points": points, **({"message": empty} if not points else {})}


def build_laras_data(sheets: dict, ref: dict, bulan: str = "", faskes: str = "", poli: str = "", jenis_kunjungan: str = "") -> dict:
    bulan, faskes, poli, jenis_kunjungan = map(_scope, (bulan, faskes, poli, jenis_kunjungan))
    normalized = {grain: _normalize(sheets.get(grain, []), grain) for grain in TABS}
    all_rows = [row for rows in normalized.values() for row in rows]
    periods = sorted({row["_period"] for row in all_rows})
    comparison_periods = sorted({row["_period"] for row in normalized["per_faskes"]})
    selected_period = bulan or (comparison_periods[-1] if comparison_periods else (periods[-1] if periods else None))
    # Each extraction status is a population restriction, not an extra patient cohort to sum.
    latest_row = max(all_rows, key=lambda row: _text(row.get("waktu_pencatatan_wib")), default={})
    status_scope = _text(latest_row.get("status_filter"))

    def matches(row, grain, *, period=True):
        if status_scope and _text(row.get("status_filter")) != status_scope:
            return False
        if faskes and row["_code"] != faskes:
            return False
        if row["_visit_scope"].casefold() != jenis_kunjungan.casefold():
            return False
        if grain == "per_poli":
            if poli:
                if row["_poli"].casefold() != poli.casefold():
                    return False
                if row["_poli_scope"] and row["_poli_scope"].casefold() != poli.casefold():
                    return False
            elif row["_poli_scope"]:
                return False
        elif row["_poli_scope"].casefold() != poli.casefold():
            return False
        return not period or row["_period"] == selected_period

    monthly = [row for row in normalized["per_bulan"] if matches(row, "per_bulan", period=bool(bulan))]
    facilities = [row for row in normalized["per_faskes"] if matches(row, "per_faskes")]
    poli_rows = [row for row in normalized["per_poli"] if matches(row, "per_poli")]
    daily = [row for row in normalized["per_hari"] if matches(row, "per_hari")]
    basis = "Rata-rata antar fasilitas dari mark grafik sumber; tidak dibobot jumlah kunjungan."
    if not facilities:
        if poli:
            facilities = poli_rows
            basis = "Rata-rata antar mark poli terpilih per fasilitas; tidak dibobot jumlah kunjungan."
        else:
            facilities = [row for row in monthly if row["_period"] == selected_period]
            basis = "Rata-rata antar fasilitas dari mark bulanan sumber; tidak dibobot jumlah kunjungan."
    values = [row["_seconds"] for row in facilities if row["_seconds"] is not None]
    unavailable = "Rincian periode, poli, atau jenis kunjungan ini belum tersedia pada grafik sumber."
    charts = {
        "per_bulan": _chart(monthly, lambda row: row["_period"], chronological=True, empty=unavailable),
        "per_kabupaten": _chart(facilities, lambda row: _text(ref.get(row["_code"], {}).get("kabupaten")) or "Kabupaten/kota belum terpetakan", empty=unavailable),
        "per_hari": _chart(daily, lambda row: _text(row.get("tanggal")), chronological=True, empty=unavailable),
        "per_faskes": _chart(facilities, lambda row: _text(row.get("nama_faskes")) or row["_code"], empty=unavailable),
        "per_poli": _chart(poli_rows, lambda row: row["_poli"] or "Poli belum teridentifikasi", empty=unavailable),
    }
    options = {
        "bulan": [{"value": value, "label": f"{MONTHS[int(value[5:])]} {value[:4]}"} for value in periods],
        "faskes": [{"value": code, "label": name} for code, name in sorted({row["_code"]: _text(row.get("nama_faskes")) or row["_code"] for row in all_rows}.items(), key=lambda item: item[1])],
        "poli": sorted({row["_poli"] for row in normalized["per_poli"] if row["_poli"] and (not faskes or row["_code"] == faskes) and row["_period"] == selected_period}),
        "jenis_kunjungan": sorted({row["_visit_scope"] for row in all_rows if row["_visit_scope"]}),
    }
    return {
        "status": "success" if any(chart["points"] for chart in charts.values()) else "no_data",
        "filter_options": options,
        "active_filters": {"bulan": bulan, "faskes": faskes, "poli": poli, "jenis_kunjungan": jenis_kunjungan},
        "kpi": {"avg_seconds": round(sum(values) / len(values), 3) if values else None, "sample_count": len(values), "basis": basis},
        "charts": charts,
        "metadata": {
            "source_url": SOURCE_URL, "last_updated": _text(latest_row.get("waktu_pencatatan_wib")) or None,
            "selected_period": selected_period,
            "methodology": "Rata-rata aritmetika mark agregat sumber, bukan rata-rata berbobot pasien. Durasi kosong tidak dihitung; nol yang tercatat tetap dihitung. Setiap grafik memakai rincian sumbernya sendiri.",
            "source_scope": f"Cakupan ekstraksi sumber: {status_scope or 'tidak dicantumkan'}. Jenis task: {TASK}.",
            "limitations": [
                "Durasi pada mark dapat melebihi 60 menit meskipun status filter ekstraksi bertuliskan Kurang dari 60 Menit. Nilai sumber dipertahankan tanpa dipotong atau disaring ulang.",
                "Perbandingan fasilitas, kabupaten/kota, poli, harian, dan scorecard memakai bulan terpilih; pilihan semua bulan memakai periode terbaru. Grafik bulanan menampilkan seluruh periode yang tersedia bila semua bulan dipilih.",
                "Jumlah kunjungan tidak tersedia sebagai bobot. Data yang tidak mendukung kombinasi filter ditampilkan sebagai belum tersedia, bukan nol.",
                *([] if options["jenis_kunjungan"] else ["Sumber saat ini hanya memuat semua jenis kunjungan; rincian jenis kunjungan belum tersedia."]),
            ],
        },
    }


def _read_csv(spreadsheet_id: str, gid: int | None, required: set[str]) -> list[dict]:
    content = read_sheet_csv(spreadsheet_id, gid, "LARAS")
    if not content:
        raise LarasSourceUnavailable("Sumber LARAS tidak dapat dibaca.")
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    if not required.issubset(set(reader.fieldnames or [])):
        raise LarasSourceUnavailable("Skema sumber LARAS tidak sesuai.")
    return list(reader)


def get_laras_data(*, bulan: str = "", faskes: str = "", poli: str = "", jenis_kunjungan: str = "", refresh: bool = False) -> dict:
    global _cache
    with _cache_lock:
        if refresh or _cache is None or time.monotonic() - _cache[0] >= 300:
            try:
                with ThreadPoolExecutor(max_workers=5) as pool:
                    futures = {name: pool.submit(_read_csv, SPREADSHEET_ID, gid, {"kode_faskes", "durasi_detik", "jenis_task_id"}) for name, gid in TABS.items()}
                    reference = pool.submit(_read_csv, "17562YXR6wJq8Az6ibi40_fwsmzdnzaqCorytQTnnWxs", None, {"kode_ppk", "kabupaten"})
                    sheets = {name: future.result() for name, future in futures.items()}
                    ref = {_text(row.get("kode_ppk")): row for row in reference.result()}
                _cache = (time.monotonic(), sheets, ref)
            except Exception as exc:
                raise LarasSourceUnavailable("Sumber LARAS belum dapat dihubungi. Silakan coba kembali.") from exc
        _, sheets, ref = _cache
    return build_laras_data(sheets, ref, bulan, faskes, poli, jenis_kunjungan)
