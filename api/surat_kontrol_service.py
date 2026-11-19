"""Monitoring Penerbitan Surat Kontrol: Crosstab BI agregat (keputusan CEO 2026-11-19, opsi b).

Per bulan admin mengunggah 10 CSV Crosstab (Faskes Surkon, Header Surkon, Keterangan, Poli, Tren untuk
Rawat Jalan dan Rawat Inap, semua RS) lewat dua area unggah. Jenis pelayanan diambil dari area,
bulan dari pilihan admin, dan sheet dikenali dari isi header; nama berkas tidak dikirim dan tidak dipakai.
Header = Faskes = Tren per status wajib sama; selisih Poli hanya dilaporkan.
Satu galat = seluruh unggahan ditolak.

Simpanan: satu JSON gzip berisi semua bulan; unggah ulang mengganti bulan itu saja. Tidak ada data
pribadi (tanpa Nomor SEP/Nomor Surat Kontrol). Pesan galat tidak memantulkan isi sel.
"""
import base64
import binascii
import calendar
import csv
import gzip
import io
import json
import re
import hashlib
import zlib
from dataclasses import dataclass
from datetime import date
from typing import Dict, List, Optional, Tuple

BATAS_KOMPRES = 1 * 1024 * 1024
BATAS_MENTAH = 3 * 1024 * 1024  # JSON kiriman (base64 menambah ±33% dari total CSV 2 MB)
BATAS_TOTAL = 2 * 1024 * 1024  # total CSV setelah base64 dibuka
BATAS_BERKAS = 200 * 1024
BATAS_SIMPANAN = 30 * 1024 * 1024  # sama dengan dari_gzip SSBI
BATAS_JUMLAH_BERKAS = 10
BATAS_SEL = 200
BATAS_RS = 100
BATAS_POLI = 200
_BLOK = 64 * 1024

STATUS = {"Surkon < SEP": "lt", "Surkon = SEP": "eq", "Surkon > SEP": "gt"}
KUNCI = ("lt", "eq", "gt")
JENIS = {"RJ": "rawat jalan", "RI": "rawat inap"}
SHEET_WAJIB = ("Faskes Surkon", "Header Surkon", "Poli", "Tren")
SHEET = SHEET_WAJIB + ("Keterangan",)
BULAN_ID = ("Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September",
            "Oktober", "November", "Desember")

# Hanya digit ASCII: \d di Python juga cocok dengan digit Unicode.
_RE_BULAN = re.compile(r"[0-9]{4}-(0[1-9]|1[0-2])")
_RE_ANGKA = re.compile(r"[0-9]{1,3}(,[0-9]{3})*|[0-9]+")
_RE_RS = re.compile(r"([0-9]{4}[A-Z][0-9]{3}) - (.+)")
_RE_HARI = re.compile(r"[0-9]{1,2}")


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
    """Body gzip berisi JSON {berkas: [{jenis: RJ|RI, isi(base64)}]} dari halaman Integrasi data."""
    rusak = BerkasDitolak("Kiriman tidak terbaca. Muat ulang halaman lalu coba lagi.")
    try:
        isi = json.loads(_buka_gzip(data).decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        raise rusak from None
    if not isinstance(isi, dict) or set(isi) != {"berkas"} or not isinstance(isi["berkas"], list) or not isi["berkas"]:
        raise rusak
    daftar = isi["berkas"]
    if len(daftar) > BATAS_JUMLAH_BERKAS:
        raise BerkasDitolak(f"Pilih paling banyak {BATAS_JUMLAH_BERKAS} berkas untuk satu bulan (5 per jenis pelayanan).")
    hasil, total = [], 0
    for b in daftar:
        if (not isinstance(b, dict) or set(b) != {"jenis", "isi"} or not isinstance(b["jenis"], str)
                or b["jenis"] not in JENIS or not isinstance(b["isi"], str)):
            raise rusak
        if len(b["isi"]) > (BATAS_BERKAS * 4) // 3 + 4:
            raise BerkasDitolak(_PESAN_BESAR)
        try:
            mentah = base64.b64decode(b["isi"], validate=True)
        except (binascii.Error, ValueError):
            raise rusak from None
        total += len(mentah)
        if len(mentah) > BATAS_BERKAS or total > BATAS_TOTAL:
            raise BerkasDitolak(_PESAN_BESAR)
        hasil.append((b["jenis"], mentah))
    return hasil


_PESAN_BESAR = ("Ada berkas yang melebihi 200 KB, atau totalnya melebihi 2 MB. Pastikan berkasnya Crosstab CSV dari BI, "
                "bukan Data Detail.")


# --- baca satu CSV Crosstab ------------------------------------------------

_PESAN_BUKAN_CSV = "Berkas harus CSV dari Crosstab BI. Unduh ulang, lalu unggah tanpa dibuka di Excel."


def _grid(raw: bytes, apa: str, cek_sel: bool = True) -> List[List[str]]:
    utf16 = raw[:2] in (b"\xff\xfe", b"\xfe\xff")
    try:
        teks = raw.decode("utf-16" if utf16 else "utf-8")
    except UnicodeDecodeError:
        raise BerkasDitolak(_PESAN_BUKAN_CSV) from None
    if "\x00" in teks:
        raise BerkasDitolak(_PESAN_BUKAN_CSV)
    teks = teks.lstrip("﻿")
    try:
        rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(teks, newline=""), delimiter="\t", strict=True)]
    except csv.Error:
        raise BerkasDitolak(_PESAN_BUKAN_CSV) from None
    rows = [r for r in rows if any(r)]
    for r in rows if cek_sel else ():
        if any(len(c) > BATAS_SEL for c in r):
            raise BerkasDitolak(f"Berkas {apa} memuat isi sel lebih dari {BATAS_SEL} karakter.")
    return rows


def _angka(nilai: str, apa: str) -> int:
    if nilai == "":
        return 0
    if not _RE_ANGKA.fullmatch(nilai):
        raise BerkasDitolak(f"Berkas {apa} memuat sel jumlah yang bukan angka bulat.")
    return int(nilai.replace(",", ""))


def _tata_letak(apa: str) -> BerkasDitolak:
    return BerkasDitolak(f"Tata letak berkas {apa} tidak dikenali. Unduh ulang lewat Download → Crosstab dashboard "
                         "Monitoring Penerbitan Surat Kontrol.")


def _status(label: str, apa: str) -> str:
    kunci = STATUS.get(label)
    if kunci is None:
        raise BerkasDitolak(f"Berkas {apa} memuat status selain Surkon < SEP, Surkon = SEP, dan Surkon > SEP. Unduh ulang "
                            "dari BI. Bila pesan ini tetap muncul, tampilan BI mungkin berubah; hubungi administrator SAPA.")
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
            raise BerkasDitolak(f"Berkas {apa}: nama faskes harus diawali kode PPK (contoh 1329R001 - nama RS).")
        if cocok[1] in dipakai:
            raise BerkasDitolak(f"Berkas {apa}: kode PPK yang sama muncul lebih dari sekali.")
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
    if not all(_RE_HARI.fullmatch(h) for h in rows[0][1:]):
        raise _tata_letak(apa)
    hari = [int(h) for h in rows[0][1:]]
    tahun, nomor = map(int, bulan.split("-"))
    maks = calendar.monthrange(tahun, nomor)[1]
    if any(h < 1 or h > maks for h in hari) or len(set(hari)) != len(hari):
        raise BerkasDitolak(f"Sheet Tren memuat tanggal di luar {label_bulan(bulan)}. Periksa bulan yang dipilih.")
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


def kenali_sheet(raw: bytes) -> Optional[str]:
    """Nama sheet Crosstab dari baris judul, atau None bila bukan sheet Surat Kontrol."""
    try:
        rows = _grid(raw, "", cek_sel=False)
    except BerkasDitolak:
        return None
    if len(rows) < 2 or len(rows[0]) < 2:
        return None
    judul = rows[0]
    if judul[0] == "Status" and all(_RE_HARI.fullmatch(c) for c in judul[1:]):
        return "Tren"
    if judul[0]:
        return None
    if all(c == "Poli Tuju SEP" for c in judul[1:]):
        return "Poli"
    if all(c == "Status Surat Kontrol" for c in judul[1:]):
        return "Keterangan"
    if all(c == "Status" for c in judul[1:]):
        return "Header Surkon" if any(r[0] == "Jumlah SEP" for r in rows[2:]) else "Faskes Surkon"
    return None


def periksa_bulan(bulan: str, berkas: List[Tuple[str, bytes]], hari_ini: Optional[date] = None) -> HasilPeriksa:
    try:
        cek_bulan(bulan)
    except ValueError:
        raise BerkasDitolak("Pilih bulan dulu.") from None
    dikenal: Dict[Tuple[str, str], bytes] = {}
    asing: Dict[str, int] = {}
    for jenis, isi in berkas:
        sheet = kenali_sheet(isi)
        if sheet is None:
            asing[jenis] = asing.get(jenis, 0) + 1
            continue
        if (jenis, sheet) in dikenal:
            raise BerkasDitolak(f"Berkas {sheet} {JENIS[jenis]} terpilih dua kali. Hapus salah satu di daftar berkas.")
        dikenal[(jenis, sheet)] = isi
    for jenis, n in asing.items():
        raise BerkasDitolak(f"{n} berkas di area {JENIS[jenis].capitalize()} tidak dikenali sebagai sheet Surat Kontrol.")
    hilang = [f"{s} {JENIS[j]}" for j in JENIS for s in SHEET_WAJIB if (j, s) not in dikenal]
    if hilang:
        raise BerkasDitolak(f"Berkas {', '.join(hilang)} belum ada.")

    data: dict = {}
    ringkas_jenis: dict = {}
    for j, nama_jenis in JENIS.items():
        apa = lambda s: f"{s} {nama_jenis}"  # noqa: E731
        faskes = _baca_faskes(dikenal[(j, "Faskes Surkon")], apa("Faskes Surkon"))
        total = _baca_header(dikenal[(j, "Header Surkon")], apa("Header Surkon"))
        poli = _baca_poli(dikenal[(j, "Poli")], apa("Poli"))
        tren = _baca_tren(dikenal[(j, "Tren")], apa("Tren"), bulan)
        if (j, "Keterangan") in dikenal:
            _baca_keterangan(dikenal[(j, "Keterangan")], apa("Keterangan"))
        if not (total == _jumlah(faskes) == _jumlah(tren)):
            rinci = "; ".join(f"{n} {sum(v.values()):,}".replace(",", ".")
                              for n, v in (("Header", total), ("Tren", _jumlah(tren)), ("Faskes", _jumlah(faskes))))
            raise BerkasDitolak(f"Jumlah di berkas Header Surkon, Tren, dan Faskes Surkon {nama_jenis} berbeda ({rinci}). Di BI, "
                                f"pastikan Tgl SEP, Fasilitas Kesehatan = (All), Status = (All), dan Jenis Pelayanan = "
                                f"{nama_jenis.title()} sama untuk kelima sheet, lalu unduh ulang.")
        data[j] = {"total": total, "faskes": sorted(faskes, key=lambda f: -sum(f[k] for k in KUNCI)),
                   "poli": poli, "tren": tren}
        ringkas_jenis[j] = {"total": total, "faskes": len(faskes), "poli": len(poli),
                            "selisih_poli": sum(total.values()) - sum(_jumlah(poli).values())}
    hari_akhir = max((t["hari"] for j in JENIS for t in data[j]["tren"]), default=1)
    data["sampai"] = f"{bulan}-{hari_akhir:02d}"
    if hari_ini is not None and (bulan > hari_ini.strftime("%Y-%m")
                                 or (hari_ini.strftime("%Y-%m") == bulan and hari_akhir > hari_ini.day)):
        # Bulan berjalan tidak mungkin punya data setelah hari ini.
        raise BerkasDitolak("Sheet Tren memuat tanggal yang belum terjadi. Periksa bulan yang dipilih.")
    peringatan = []
    if sum(data["RI"]["total"].values()) > sum(data["RJ"]["total"].values()):
        peringatan.append("Total rawat inap lebih besar dari rawat jalan. Pastikan berkas rawat jalan dan rawat inap "
                          "tidak tertukar antar-area.")
    ringkasan = {"bulan": bulan, "sampai": data["sampai"], "jenis": ringkas_jenis, "peringatan": peringatan}
    return HasilPeriksa(data, ringkasan)


def sidik(data: dict) -> str:
    """sha256 bentuk ternormalisasi RJ + RI satu bulan (tanpa meta), untuk mendeteksi isi kembar."""
    inti = {j: data[j] for j in JENIS}
    return hashlib.sha256(json.dumps(inti, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def bulan_kembar(isi: dict, bulan: str, data: dict) -> List[str]:
    """Bulan lain tersimpan yang isinya identik; hanya untuk peringatan."""
    target = sidik(data)
    return [b for b, v in isi["bulan"].items() if b != bulan and all(j in v for j in JENIS) and sidik(v) == target]


def kode_faskes(data: dict) -> List[Tuple[str, str]]:
    """(kode, nama) semua RS di satu bulan, untuk dicocokkan dengan tabel padanan."""
    hasil: Dict[str, str] = {}
    for j in JENIS:
        for f in data[j]["faskes"]:
            hasil.setdefault(f["kode"], f["nama"])
    return sorted(hasil.items())


# --- simpanan --------------------------------------------------------------

def baca_simpanan(isi: bytes) -> dict:
    """Isi berkas Drive, dibuka dengan batas ukuran lalu dicek skemanya."""
    if not isi:
        return {"versi": 1, "bulan": {}}
    pembuka = zlib.decompressobj(16 + zlib.MAX_WBITS)
    mentah = pembuka.decompress(isi, BATAS_SIMPANAN + 1)
    if len(mentah) > BATAS_SIMPANAN or not pembuka.eof:
        raise ValueError("simpanan surat kontrol rusak atau terlalu besar")
    if not mentah.strip():
        return {"versi": 1, "bulan": {}}  # berkas awal yang disiapkan CEO berisi gzip kosong
    data = json.loads(mentah.decode("utf-8"))
    if (not isinstance(data, dict) or data.get("versi") != 1 or not isinstance(data.get("bulan"), dict)
            or not all(isinstance(k, str) and _RE_BULAN.fullmatch(k) and isinstance(v, dict) for k, v in data["bulan"].items())):
        raise ValueError("format simpanan surat kontrol tidak dikenal")
    return data


def simpanan_baru(lama: Optional[bytes], bulan: str, data: dict, meta: Dict[str, str]) -> bytes:
    isi = baca_simpanan(lama or b"")
    isi["bulan"][cek_bulan(bulan)] = {**data, "meta": dict(meta)}
    isi["bulan"] = dict(sorted(isi["bulan"].items()))
    return gzip.compress(json.dumps(isi, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)


def untuk_petugas(data: dict, kode: str) -> dict:
    """Petugas RS: baris Faskes hanya RS sendiri dan KPI dari baris itu. Tren dan Poli tetap total cabang
    (keputusan CEO 2b), karena tidak memuat angka per RS."""
    hasil = {"sampai": data.get("sampai", "")}  # daftar izin, bukan daftar tolak
    for j in JENIS:
        milik = [f for f in data[j]["faskes"] if f["kode"] == kode]
        hasil[j] = {"total": _jumlah(milik), "faskes": milik, "poli": data[j]["poli"], "tren": data[j]["tren"]}
    return hasil
