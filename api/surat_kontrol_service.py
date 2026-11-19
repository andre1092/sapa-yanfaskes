"""Monitoring Penerbitan Surat Kontrol: Crosstab BI agregat (keputusan CEO 2026-11-19, opsi b).

Per bulan admin mengunggah 10 CSV Crosstab (Faskes Surkon, Header Surkon, Keterangan, Poli, Tren untuk
Rawat Jalan dan Rawat Inap, semua RS). Jenis pelayanan dan bulan diambil dari nama berkas
`YYYY-MM_RJ|RI_<Sheet>.csv`, karena Crosstab tidak memuatnya. Isi dibaca berdasarkan label header,
lalu keempat sheet data dicek silang (jumlah per status harus sama). Satu galat = seluruh unggahan ditolak.

Simpanan: satu JSON gzip berisi semua bulan; unggah ulang mengganti bulan itu saja. Tidak ada data
pribadi (tanpa Nomor SEP/Nomor Surat Kontrol). Pesan galat tidak memantulkan isi sel atau nama berkas.
"""
import base64
import binascii
import calendar
import csv
import gzip
import io
import json
import re
import zlib
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

BATAS_KOMPRES = 1 * 1024 * 1024
BATAS_MENTAH = 3 * 1024 * 1024  # JSON kiriman (base64 menambah ±33% dari total CSV 2 MB)
BATAS_BERKAS = 200 * 1024
BATAS_JUMLAH_BERKAS = 10
BATAS_SEL = 200
BATAS_RS = 100
BATAS_POLI = 200
_BLOK = 64 * 1024

STATUS = {"Surkon < SEP": "lt", "Surkon = SEP": "eq", "Surkon > SEP": "gt"}
KUNCI = ("lt", "eq", "gt")
JENIS = {"RJ": "Rawat Jalan", "RI": "Rawat Inap"}
SHEET_WAJIB = ("Faskes Surkon", "Header Surkon", "Poli", "Tren")
SHEET = SHEET_WAJIB + ("Keterangan",)
BULAN_ID = ("Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September",
            "Oktober", "November", "Desember")

_RE_NAMA = re.compile(r"(\d{4}-\d{2})_(RJ|RI)_(" + "|".join(re.escape(s) for s in SHEET) + r")\.csv")
_RE_BULAN = re.compile(r"\d{4}-(0[1-9]|1[0-2])")
_RE_ANGKA = re.compile(r"\d{1,3}(,\d{3})*|\d+")
_RE_RS = re.compile(r"(\d{4}[A-Z]\d{3}) - (.+)")


class BerkasDitolak(Exception):
    """Unggahan tidak bisa dipakai; `pesan` buatan modul ini, aman ditampilkan ke admin."""

    def __init__(self, pesan: str):
        super().__init__(pesan)
        self.pesan = pesan


def label_bulan(bulan: str) -> str:
    tahun, nomor = bulan.split("-")
    return f"{BULAN_ID[int(nomor) - 1]} {tahun}"


def cek_bulan(bulan: str) -> str:
    if not isinstance(bulan, str) or not _RE_BULAN.fullmatch(bulan):
        raise ValueError("bulan harus YYYY-MM")
    return bulan


# --- kiriman ---------------------------------------------------------------

def _buka_gzip(data: bytes) -> bytes:
    if len(data) > BATAS_KOMPRES:
        raise BerkasDitolak(f"Kiriman terlalu besar (batas {BATAS_KOMPRES // (1024 * 1024)} MB setelah dikompres).")
    if data[:2] != b"\x1f\x8b":
        raise BerkasDitolak("Kiriman tidak terbaca. Muat ulang halaman lalu coba lagi.")
    pembuka = zlib.decompressobj(16 + zlib.MAX_WBITS)
    keluar = io.BytesIO()
    sisa = data
    try:
        while True:
            potong = pembuka.decompress(sisa, _BLOK)
            keluar.write(potong)
            if keluar.tell() > BATAS_MENTAH:
                raise BerkasDitolak("Ukuran berkas melebihi batas. Unggah 10 berkas Crosstab satu bulan saja.")
            sisa = pembuka.unconsumed_tail
            if pembuka.eof or (not sisa and not potong):
                break
    except zlib.error:
        raise BerkasDitolak("Kiriman rusak. Muat ulang halaman lalu coba lagi.") from None
    if not pembuka.eof or pembuka.unused_data:
        raise BerkasDitolak("Kiriman terpotong. Muat ulang halaman lalu coba lagi.")
    return keluar.getvalue()


def baca_kiriman(data: bytes) -> List[Tuple[str, bytes]]:
    """Body gzip berisi JSON {berkas: [{nama, isi(base64)}]} dari halaman Integrasi data."""
    rusak = BerkasDitolak("Kiriman tidak terbaca. Muat ulang halaman lalu coba lagi.")
    try:
        isi = json.loads(_buka_gzip(data).decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise rusak from None
    daftar = isi.get("berkas") if isinstance(isi, dict) else None
    if not isinstance(daftar, list) or not daftar:
        raise rusak
    if len(daftar) > BATAS_JUMLAH_BERKAS:
        raise BerkasDitolak(f"Pilih paling banyak {BATAS_JUMLAH_BERKAS} berkas untuk satu bulan.")
    hasil = []
    for b in daftar:
        if not isinstance(b, dict) or not isinstance(b.get("nama"), str) or not isinstance(b.get("isi"), str):
            raise rusak
        try:
            mentah = base64.b64decode(b["isi"], validate=True)
        except (binascii.Error, ValueError):
            raise rusak from None
        if len(mentah) > BATAS_BERKAS:
            raise BerkasDitolak(f"Satu berkas melebihi {BATAS_BERKAS // 1024} KB. Berkas Crosstab biasanya di bawah 5 KB.")
        hasil.append((b["nama"][:120], mentah))
    return hasil


# --- baca satu CSV Crosstab ------------------------------------------------

def _grid(raw: bytes, apa: str) -> List[List[str]]:
    utf16 = raw[:2] in (b"\xff\xfe", b"\xfe\xff")
    try:
        teks = raw.decode("utf-16" if utf16 else "utf-8")
    except UnicodeDecodeError:
        raise BerkasDitolak(f"{apa}: berkas harus CSV dari Download → Crosstab BI, tanpa dibuka di Excel.") from None
    if "\x00" in teks:
        raise BerkasDitolak(f"{apa}: berkas memuat karakter yang tidak sah. Unduh ulang dari BI.")
    teks = teks.lstrip("﻿")
    try:
        rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(teks, newline=""), delimiter="\t", strict=True)]
    except csv.Error:
        raise BerkasDitolak(f"{apa}: berkas tidak terbaca. Unduh ulang dari BI.") from None
    rows = [r for r in rows if any(r)]
    for r in rows:
        if any(len(c) > BATAS_SEL for c in r):
            raise BerkasDitolak(f"{apa}: ada isi sel lebih dari {BATAS_SEL} karakter.")
    return rows


def _angka(nilai: str, apa: str) -> int:
    if nilai == "":
        return 0
    if not _RE_ANGKA.fullmatch(nilai):
        raise BerkasDitolak(f"{apa}: ada sel jumlah yang bukan angka bulat.")
    return int(nilai.replace(",", ""))


def _tata_letak(apa: str) -> BerkasDitolak:
    return BerkasDitolak(f"{apa}: tata letak tidak dikenali. Pastikan berkas dari Download → Crosstab dashboard "
                         "Monitoring Penerbitan Surat Kontrol.")


def _status(label: str, apa: str) -> str:
    kunci = STATUS.get(label)
    if kunci is None:
        raise BerkasDitolak(f"{apa}: Status harus Surkon < SEP, Surkon = SEP, atau Surkon > SEP.")
    return kunci


def _kosong() -> Dict[str, int]:
    return {k: 0 for k in KUNCI}


def _status_di_kolom(rows, apa) -> Tuple[List[str], List[List[str]]]:
    """Baris 0: '' + 'Status'…, baris 1: '' + label status…; data mulai baris 2."""
    if len(rows) < 2 or rows[0][0] or rows[1][0] or len(rows[0]) < 2 or any(c != "Status" for c in rows[0][1:]):
        raise _tata_letak(apa)
    kunci = [_status(s, apa) for s in rows[1][1:]]
    if len(set(kunci)) != len(kunci):
        raise _tata_letak(apa)
    for r in rows[2:]:
        if len(r) != len(rows[0]):
            raise _tata_letak(apa)
    return kunci, rows[2:]


def _status_di_baris(rows, judul: str, apa: str) -> Tuple[List[str], Dict[str, List[int]]]:
    """Baris judul berisi label dimensi; tiap baris berikutnya = satu status."""
    if not rows or len(rows[0]) < 2:
        raise _tata_letak(apa)
    lebar = len(rows[0])
    hasil: Dict[str, List[int]] = {}
    for r in rows:
        if len(r) != lebar:
            raise _tata_letak(apa)
    for r in rows:
        kunci = _status(r[0], apa)
        if kunci in hasil:
            raise _tata_letak(apa)
        hasil[kunci] = [_angka(c, apa) for c in r[1:]]
    return judul, hasil


def _baca_faskes(raw, apa):
    kunci, data = _status_di_kolom(_grid(raw, apa), apa)
    hasil, dipakai = [], set()
    for r in data:
        cocok = _RE_RS.fullmatch(r[0])
        if not cocok:
            raise BerkasDitolak(f"{apa}: nama RS harus diawali kode PPK (contoh 1329R001 - nama RS).")
        if cocok[1] in dipakai:
            raise BerkasDitolak(f"{apa}: kode PPK yang sama muncul lebih dari sekali.")
        dipakai.add(cocok[1])
        baris = {"kode": cocok[1], "nama": cocok[2].strip(), **_kosong()}
        for k, c in zip(kunci, r[1:]):
            baris[k] = _angka(c, apa)
        hasil.append(baris)
    if not hasil or len(hasil) > BATAS_RS:
        raise _tata_letak(apa)
    return hasil


def _baca_header(raw, apa):
    kunci, data = _status_di_kolom(_grid(raw, apa), apa)
    jumlah = [r for r in data if r[0] == "Jumlah SEP"]
    if len(jumlah) != 1 or any(r[0] != "Jumlah SEP" and not r[0].startswith("% of Total") for r in data):
        raise _tata_letak(apa)
    total = _kosong()
    for k, c in zip(kunci, jumlah[0][1:]):
        total[k] = _angka(c, apa)
    return total


def _baca_poli(raw, apa):
    rows = _grid(raw, apa)
    if len(rows) < 3 or rows[0][0] or rows[1][0] or any(c != "Poli Tuju SEP" for c in rows[0][1:]):
        raise _tata_letak(apa)
    nama = rows[1][1:]
    if not all(nama) or len(set(nama)) != len(nama) or len(nama) > BATAS_POLI:
        raise _tata_letak(apa)
    _, per = _status_di_baris(rows[2:], "", apa)
    if any(len(v) != len(nama) for v in per.values()):
        raise _tata_letak(apa)
    return [{"nama": n, **{k: (per[k][i] if k in per else 0) for k in KUNCI}} for i, n in enumerate(nama)]


def _baca_tren(raw, apa, bulan):
    rows = _grid(raw, apa)
    if len(rows) < 2 or rows[0][0] != "Status":
        raise _tata_letak(apa)
    try:
        hari = [int(h) for h in rows[0][1:]]
    except ValueError:
        raise _tata_letak(apa) from None
    tahun, nomor = map(int, bulan.split("-"))
    maks = calendar.monthrange(tahun, nomor)[1]
    if any(h < 1 or h > maks for h in hari) or len(set(hari)) != len(hari):
        raise BerkasDitolak(f"{apa}: tanggal SEP di luar {label_bulan(bulan)}.")
    _, per = _status_di_baris(rows[1:], "", apa)
    return sorted(({"hari": h, **{k: (per[k][i] if k in per else 0) for k in KUNCI}} for i, h in enumerate(hari)),
                  key=lambda t: t["hari"])


def _baca_keterangan(raw, apa):
    rows = _grid(raw, apa)
    if not rows or not any(c == "Status Surat Kontrol" for c in rows[0]):
        raise _tata_letak(apa)


# --- periksa 10 berkas -----------------------------------------------------

@dataclass
class HasilPeriksa:
    data: dict
    ringkasan: dict


def _jumlah(baris: List[dict]) -> Dict[str, int]:
    return {k: sum(r[k] for r in baris) for k in KUNCI}


def periksa_bulan(bulan: str, berkas: List[Tuple[str, bytes]]) -> HasilPeriksa:
    try:
        cek_bulan(bulan)
    except ValueError:
        raise BerkasDitolak("Pilih bulan data terlebih dahulu.") from None
    dikenal: Dict[Tuple[str, str], bytes] = {}
    for nama, isi in berkas:
        cocok = _RE_NAMA.fullmatch(nama)
        if not cocok:
            raise BerkasDitolak("Nama berkas harus berpola YYYY-MM_RJ_<Sheet>.csv atau YYYY-MM_RI_<Sheet>.csv, "
                                "dengan Sheet: Faskes Surkon, Header Surkon, Keterangan, Poli, Tren.")
        if cocok[1] != bulan:
            raise BerkasDitolak(f"Ada berkas yang bukan untuk {label_bulan(bulan)}. Periksa awalan tanggal di nama berkas.")
        kunci = (cocok[2], cocok[3])
        if kunci in dikenal:
            raise BerkasDitolak(f"Berkas {cocok[2]} {cocok[3]} dipilih lebih dari sekali.")
        dikenal[kunci] = isi
    hilang = [f"{j} {s}" for j in JENIS for s in SHEET_WAJIB if (j, s) not in dikenal]
    if hilang:
        raise BerkasDitolak(f"Berkas ini belum ada: {', '.join(hilang)}.")

    data: dict = {}
    for j, nama_jenis in JENIS.items():
        apa = lambda s: f"{s} {nama_jenis}"  # noqa: E731
        faskes = _baca_faskes(dikenal[(j, "Faskes Surkon")], apa("Faskes Surkon"))
        total = _baca_header(dikenal[(j, "Header Surkon")], apa("Header Surkon"))
        poli = _baca_poli(dikenal[(j, "Poli")], apa("Poli"))
        tren = _baca_tren(dikenal[(j, "Tren")], apa("Tren"), bulan)
        if (j, "Keterangan") in dikenal:
            _baca_keterangan(dikenal[(j, "Keterangan")], apa("Keterangan"))
        sumber = {"Header": total, "Faskes": _jumlah(faskes), "Tren": _jumlah(tren), "Poli": _jumlah(poli)}
        if len({tuple(v.values()) for v in sumber.values()}) != 1:
            rinci = "; ".join(f"{n} {sum(v.values()):,}".replace(",", ".") for n, v in sumber.items())
            raise BerkasDitolak(f"Angka antar-sheet {nama_jenis} tidak sama ({rinci}). Pastikan semua berkas "
                                "diunduh dengan filter bulan dan jenis pelayanan yang sama.")
        data[j] = {"total": total, "faskes": sorted(faskes, key=lambda f: -sum(f[k] for k in KUNCI)),
                   "poli": poli, "tren": tren}
    hari_akhir = max((t["hari"] for j in JENIS for t in data[j]["tren"]), default=1)
    data["sampai"] = f"{bulan}-{hari_akhir:02d}"
    ringkasan = {"bulan": bulan, "sampai": data["sampai"],
                 "jenis": {j: {"total": data[j]["total"], "faskes": len(data[j]["faskes"]), "poli": len(data[j]["poli"])}
                           for j in JENIS}}
    return HasilPeriksa(data, ringkasan)


def kode_faskes(data: dict) -> List[Tuple[str, str]]:
    """(kode, nama) semua RS di satu bulan, untuk dicocokkan dengan tabel padanan."""
    hasil: Dict[str, str] = {}
    for j in JENIS:
        for f in data[j]["faskes"]:
            hasil.setdefault(f["kode"], f["nama"])
    return sorted(hasil.items())


# --- simpanan --------------------------------------------------------------

def baca_simpanan(isi: bytes) -> dict:
    if not isi:
        return {"versi": 1, "bulan": {}}
    pembuka = zlib.decompressobj(16 + zlib.MAX_WBITS)
    mentah = pembuka.decompress(isi, 50 * 1024 * 1024)
    if not pembuka.eof:
        raise ValueError("simpanan surat kontrol rusak atau terlalu besar")
    if not mentah.strip():
        return {"versi": 1, "bulan": {}}  # berkas awal yang disiapkan CEO berisi gzip kosong
    data = json.loads(mentah.decode("utf-8"))
    if not isinstance(data, dict) or data.get("versi") != 1 or not isinstance(data.get("bulan"), dict):
        raise ValueError("format simpanan surat kontrol tidak dikenal")
    return data


def simpanan_baru(lama: Optional[bytes], bulan: str, data: dict, meta: Dict[str, str]) -> bytes:
    isi = baca_simpanan(lama or b"")
    isi["bulan"][cek_bulan(bulan)] = {**data, "meta": dict(meta)}
    isi["bulan"] = dict(sorted(isi["bulan"].items()))
    return gzip.compress(json.dumps(isi, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)


def untuk_petugas(data: dict, kode: str) -> dict:
    """Petugas RS: hanya baris RS sendiri; Tren dan Poli (gabungan semua RS) tidak dikirim."""
    hasil = {k: v for k, v in data.items() if k not in JENIS}
    for j in JENIS:
        milik = [f for f in data[j]["faskes"] if f["kode"] == kode]
        hasil[j] = {"total": _jumlah(milik), "faskes": milik, "poli": [], "tren": []}
    return hasil
