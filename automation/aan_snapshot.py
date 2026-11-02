"""Validate the observed Faskes export and map it to the existing A:M schema.

This module performs no network access or writes. Source observations and the
independently read DB_FASKES code list are supplied from the chat embedded browser.
"""
import argparse
from datetime import datetime
import json
import math
from pathlib import Path
import re

HEADERS = ["Timestamp", "Kdppk", "Faskes", "Kdkr", "Kdkc", "Cabang", "Cabang",
           "Kdkr", "Capaian", "Jumlah Antrian by Sumber", "Jumlah Peserta Jkn",
           "Jumlah Sep Rjtl", "Sumber"]


def sheet_rows(snapshot):
    """Return verified rows; reject absent observations instead of inventing data."""
    if not isinstance(snapshot, dict):
        raise ValueError("Snapshot wajib berupa objek")
    timestamp = snapshot.get("timestamp", "")
    if not isinstance(timestamp, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", timestamp):
        raise ValueError("Timestamp BI wajib YYYY-MM-DD HH:MM:SS")
    observed = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
    if snapshot.get("period") != observed.strftime("%Y-%m"):
        raise ValueError("Periode filter harus sama dengan bulan timestamp BI")
    source = snapshot.get("source")
    if not isinstance(source, str) or source not in ("Mobile JKN", "Semua Sumber", "All Sumber"):
        raise ValueError("Sumber wajib Mobile JKN atau Semua Sumber")
    sheet_source = "Mobile JKN" if source == "Mobile JKN" else "All Sumber"
    if (snapshot.get("kepwil"), snapshot.get("cabang_code"), snapshot.get("cabang_name")) != (7, 1310, "JEMBER (1310)"):
        raise ValueError("Lingkup wajib Kepwil 07, Cabang JEMBER (1310)")
    expected = snapshot.get("expected_kdppk", [])
    rows = snapshot.get("rows", [])
    if not isinstance(expected, list) or len(expected) != 25 or not all(isinstance(code, str) and re.fullmatch(r"[0-9A-Z]{8}", code) for code in expected) or len(set(expected)) != 25:
        raise ValueError("Daftar DB_FASKES independen harus memuat 25 kode teks unik")
    if not isinstance(rows, list) or len(rows) != 25:
        raise ValueError("Ekspor harus memuat tepat 25 FKRTL")
    seen = set()
    mapped = []
    serial = (observed - datetime(1899, 12, 30)).total_seconds() / 86400
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Baris ekspor wajib berupa objek")
        code = row.get("kdppk")
        name = row.get("faskes")
        if code not in expected or code in seen:
            raise ValueError("Kode FKRTL tidak dikenal atau duplikat")
        seen.add(code)
        if not isinstance(name, str) or not name.strip() or not name.endswith(f"({code})"):
            raise ValueError("Nama Faskes lengkap harus sesuai dengan kode")
        counts = [row.get(key) for key in ("antrean", "peserta_jkn", "sep_rjtl")]
        if not all(type(value) is int and value >= 0 for value in counts):
            raise ValueError("Ketiga jumlah wajib bilangan bulat nonnegatif")
        ratio = row.get("capaian")
        if type(ratio) not in (int, float) or not math.isfinite(ratio) or ratio < 0:
            raise ValueError("Capaian wajib angka fraksi nonnegatif")
        # Tableau displays percentages to two decimal places. Preserve that
        # observed precision, checking it against independent underlying counts.
        denominator = counts[1] if source == "Mobile JKN" else counts[2]
        if denominator == 0:
            if counts[0] != 0 or ratio != 0:
                raise ValueError("Pembagi nol tidak boleh menghasilkan capaian semu")
        elif abs(ratio - counts[0] / denominator) > 0.000050001:
            raise ValueError("Capaian tidak cocok dengan pembagi sumber antrean")
        mapped.append([serial, code, name, 7, 1310, "JEMBER (1310)",
                       "JEMBER (1310)", 7, ratio, *counts, sheet_source])
    return mapped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    values = sheet_rows(json.loads(args.snapshot.read_text()))
    print(json.dumps({"headers": HEADERS, "values": values}, ensure_ascii=False))


if __name__ == "__main__":
    main()
