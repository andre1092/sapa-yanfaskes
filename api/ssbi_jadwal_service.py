"""Data SSBI Kesesuaian Jadwal Praktik Dokter FKRTL (unggahan admin, unduhan Download Detail).

Alur: browser mengompres CSV SSBI dengan gzip -> server membuka bertahap dengan batas ukuran ->
CSV diperiksa seluruhnya (satu baris salah = seluruh berkas ditolak) -> bentuk baku disimpan
sebagai satu berkas gzip di Drive. Unduhan menyaring satu bulan (dan satu RS untuk Petugas RS)
lalu menulis .xlsx tanpa formula atau tautan dari isi data.

Pesan galat menyebut nomor baris dan nama kolom, tidak pernah memantulkan isi sel.
"""
import csv
import gzip
import io
import re
import unicodedata
import zlib
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

BATAS_KOMPRES = 4 * 1024 * 1024
BATAS_MENTAH = 30 * 1024 * 1024
BATAS_BARIS = 200_000
BATAS_SEL = 200
_BLOK = 64 * 1024

PERIODE_PANJANG = "Day, Month, Year of Periode Data"
# Nama kolom baku (urutan keluar sesuai spesifikasi Rosa) dan nama header yang diterima di berkas.
KOLOM_KELUAR = ("Kabupaten", "Nama Faskes", "Tipe Faskes", "Nama Poli", "Nama Dokter", "Waktu SIMRS",
                "Jam Buka HFIS", "Jam Tutup HFIS", "Periode Data", "Hari HFIS", "Status")
_HEADER_DITERIMA = {nama: nama for nama in KOLOM_KELUAR}
_HEADER_DITERIMA[PERIODE_PANJANG] = "Periode Data"

HARI = ("SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU", "MINGGU")
STATUS = ("SESUAI", "TIDAK SESUAI")
BULAN_ID = ("Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September",
            "Oktober", "November", "Desember")
_BULAN_EN = {nama: i + 1 for i, nama in enumerate(("January", "February", "March", "April", "May", "June", "July",
                                                    "August", "September", "October", "November", "December"))}

_RE_PERIODE = re.compile(r"([A-Z][a-z]+) (\d{1,2}), (\d{4})")
_RE_JAM = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
_RE_WAKTU = re.compile(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(\.\d{1,6})?")
_RE_BULAN = re.compile(r"\d{4}-(0[1-9]|1[0-2])")
_RE_ANGKA = re.compile(r"[+-]?\d+(\.\d+)?")
_AWALAN_FORMULA = ("=", "+", "-", "@", "\t", "\r", "＝", "＋", "－", "＠")

PESAN_BUKAN_KOMA = ("Berkas ini bukan CSV berpemisah koma atau tab. Biasanya ini terjadi bila berkas dibuka lalu "
                    "disimpan ulang di Excel. Unduh ulang dari SSBI, lalu unggah tanpa dibuka.")
PADANAN_BAWAAN = Path(__file__).resolve().parent / "data" / "padanan_faskes_ssbi.csv"


class BerkasDitolak(Exception):
    """Berkas unggahan tidak bisa dipakai; `pesan` buatan modul ini, aman ditampilkan ke admin."""

    def __init__(self, pesan: str):
        super().__init__(pesan)
        self.pesan = pesan


# --- gzip ------------------------------------------------------------------

def buka_gzip(data: bytes) -> bytes:
    """Buka gzip dari browser secara bertahap; berhenti begitu hasilnya melewati BATAS_MENTAH."""
    if len(data) > BATAS_KOMPRES:
        raise BerkasDitolak(f"Berkas terlalu besar untuk dikirim (batas {BATAS_KOMPRES // (1024 * 1024)} MB setelah dikompres).")
    if data[:2] != b"\x1f\x8b":
        raise BerkasDitolak("Berkas kiriman tidak terbaca. Muat ulang halaman lalu coba lagi.")
    pembuka = zlib.decompressobj(16 + zlib.MAX_WBITS)
    keluar = io.BytesIO()
    sisa = data
    try:
        while True:
            potong = pembuka.decompress(sisa, _BLOK)
            keluar.write(potong)
            if keluar.tell() > BATAS_MENTAH:
                raise BerkasDitolak(f"Ukuran berkas melebihi batas {BATAS_MENTAH // (1024 * 1024)} MB.")
            sisa = pembuka.unconsumed_tail
            if pembuka.eof or (not sisa and not potong):
                break
    except zlib.error:
        raise BerkasDitolak("Berkas kiriman rusak. Muat ulang halaman lalu coba lagi.") from None
    if not pembuka.eof:
        raise BerkasDitolak("Berkas kiriman terpotong. Muat ulang halaman lalu coba lagi.")
    if pembuka.unused_data:
        raise BerkasDitolak("Berkas kiriman tidak terbaca. Muat ulang halaman lalu coba lagi.")
    return keluar.getvalue()


# --- periksa CSV -----------------------------------------------------------

@dataclass
class HasilPeriksa:
    baris: List[Dict[str, str]]
    ringkasan: dict


def _galat_baris(nomor: int, kolom: str, alasan: str) -> BerkasDitolak:
    return BerkasDitolak(f"Isi berkas tidak sesuai di baris {nomor}, kolom {kolom}: {alasan}. Tidak ada data yang diubah.")


def _periode(nilai: str) -> Optional[str]:
    cocok = _RE_PERIODE.fullmatch(nilai)
    if not cocok or cocok[1] not in _BULAN_EN:
        return None
    try:
        return datetime(int(cocok[3]), _BULAN_EN[cocok[1]], int(cocok[2])).strftime("%Y-%m-%d")
    except ValueError:
        return None


def _waktu(nilai: str) -> Optional[str]:
    if nilai == "Tidak Ada":
        return nilai
    cocok = _RE_WAKTU.fullmatch(nilai)
    if not cocok:
        return None
    try:
        datetime.strptime(cocok[1], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    return cocok[1]


def _baku(nomor: int, sel: Dict[str, str]) -> Dict[str, str]:
    for kolom, nilai in sel.items():
        if len(nilai) > BATAS_SEL:
            raise _galat_baris(nomor, kolom, f"isi lebih dari {BATAS_SEL} karakter")
    for kolom in ("Kabupaten", "Nama Faskes", "Nama Dokter"):
        if not sel[kolom]:
            raise _galat_baris(nomor, kolom, "kosong")
    periode = _periode(sel["Periode Data"])
    if periode is None:
        raise _galat_baris(nomor, "Periode Data", "tanggal tidak terbaca (contoh benar: April 26, 2026)")
    waktu = _waktu(sel["Waktu SIMRS"])
    if waktu is None:
        raise _galat_baris(nomor, "Waktu SIMRS", "harus tanggal-waktu atau Tidak Ada")
    for kolom in ("Jam Buka HFIS", "Jam Tutup HFIS"):
        if not _RE_JAM.fullmatch(sel[kolom]):
            raise _galat_baris(nomor, kolom, "harus berformat JJ:MM")
    hari = sel["Hari HFIS"].upper()
    if hari not in HARI:
        raise _galat_baris(nomor, "Hari HFIS", "harus nama hari SENIN sampai MINGGU")
    status = sel["Status"].upper()
    if status not in STATUS:
        raise _galat_baris(nomor, "Status", "harus SESUAI atau TIDAK SESUAI")
    return {**sel, "Periode Data": periode, "Waktu SIMRS": waktu, "Hari HFIS": hari, "Status": status}


def _teks(raw: bytes) -> str:
    """UTF-8 (unduhan FKRTL.csv) atau UTF-16 ber-BOM (unduhan Tableau "Download Data")."""
    utf16 = raw[:2] in (b"\xff\xfe", b"\xfe\xff")
    try:
        teks = raw.decode("utf-16" if utf16 else "utf-8")
    except UnicodeDecodeError:
        raise BerkasDitolak("Berkas harus CSV UTF-8 atau UTF-16. Unduh ulang dari SSBI, lalu unggah tanpa dibuka.") from None
    if "\x00" in teks:
        raise BerkasDitolak("Berkas memuat karakter yang tidak sah. Unduh ulang dari SSBI.")
    return teks[1:] if teks.startswith("\ufeff") else teks


def periksa_csv(raw: bytes) -> HasilPeriksa:
    if len(raw) > BATAS_MENTAH:
        raise BerkasDitolak(f"Ukuran berkas melebihi batas {BATAS_MENTAH // (1024 * 1024)} MB.")
    teks = _teks(raw)
    baris_pertama = teks.split("\n", 1)[0]
    # Header periode berisi koma, jadi tab di baris judul berarti berkas berpemisah tab.
    pemisah = "\t" if "\t" in baris_pertama else ","
    if pemisah == "," and ";" in baris_pertama and "," not in baris_pertama.replace(PERIODE_PANJANG, ""):
        raise BerkasDitolak(PESAN_BUKAN_KOMA)
    pembaca = csv.reader(io.StringIO(teks, newline=""), delimiter=pemisah, strict=True)
    try:
        header = next(pembaca, None)
        if not header:
            raise BerkasDitolak("Berkas tidak berisi baris data.")
        header = [h.strip() for h in header]
        posisi: Dict[str, int] = {}
        for i, nama in enumerate(header):
            baku = _HEADER_DITERIMA.get(nama)
            if baku is None:
                continue
            if baku in posisi:
                raise BerkasDitolak(f"Kolom {baku} muncul lebih dari sekali.")
            posisi[baku] = i
        hilang = [nama for nama in KOLOM_KELUAR if nama not in posisi]
        if hilang:
            raise BerkasDitolak(f"Kolom ini tidak ada: {', '.join(hilang)}. Pastikan berkas diekspor dari view FKRTL.")
        lebar = len(header)
        hasil: List[Dict[str, str]] = []
        for nomor, sel in enumerate(pembaca, start=2):
            if not sel or (len(sel) == 1 and not sel[0].strip()):
                continue
            if len(hasil) >= BATAS_BARIS:
                raise BerkasDitolak(f"Berkas berisi lebih dari {BATAS_BARIS:,} baris data.".replace(",", "."))
            if len(sel) != lebar:
                raise BerkasDitolak(f"Jumlah kolom di baris {nomor} tidak sama dengan baris judul. Tidak ada data yang diubah.")
            hasil.append(_baku(nomor, {nama: sel[i].strip() for nama, i in posisi.items()}))
    except csv.Error:
        raise BerkasDitolak("Berkas CSV tidak terbaca (tanda kutip tidak lengkap). Unduh ulang lewat tautan FKRTL.csv.") from None
    if not hasil:
        raise BerkasDitolak("Berkas tidak berisi baris data.")
    return HasilPeriksa(hasil, ringkas(hasil))


def ringkas(baris: List[Dict[str, str]]) -> dict:
    periode = sorted({r["Periode Data"] for r in baris})
    return {
        "baris": len(baris),
        "faskes": len({norm(r["Nama Faskes"]) for r in baris}),
        "periode_awal": periode[0],
        "periode_akhir": periode[-1],
        "bulan": dict(sorted(Counter(r["Periode Data"][:7] for r in baris).items())),
        "kabupaten": dict(sorted(Counter(r["Kabupaten"] for r in baris).items())),
    }


# --- bentuk simpanan -------------------------------------------------------

def ke_gzip(baris: List[Dict[str, str]]) -> bytes:
    teks = io.StringIO(newline="")
    penulis = csv.writer(teks, lineterminator="\n")
    penulis.writerow(KOLOM_KELUAR)
    for r in baris:
        penulis.writerow([r[k] for k in KOLOM_KELUAR])
    return gzip.compress(teks.getvalue().encode("utf-8"), compresslevel=9, mtime=0)


def dari_gzip(data: bytes) -> List[Dict[str, str]]:
    """Membaca berkas simpanan buatan ke_gzip (dari Drive)."""
    pembuka = zlib.decompressobj(16 + zlib.MAX_WBITS)
    mentah = pembuka.decompress(data, BATAS_MENTAH + 1)
    if len(mentah) > BATAS_MENTAH or not pembuka.eof:
        raise ValueError("simpanan SSBI melebihi batas atau rusak")
    teks = mentah.decode("utf-8")
    pembaca = csv.reader(io.StringIO(teks, newline=""))
    header = next(pembaca)
    if tuple(header) != KOLOM_KELUAR:
        raise ValueError("format simpanan SSBI tidak dikenal")
    return [dict(zip(KOLOM_KELUAR, sel)) for sel in pembaca if sel]


# --- saring dan unduh ------------------------------------------------------

def norm(nama: str) -> str:
    return " ".join((nama or "").split()).casefold()


SEMUA = "semua"  # parameter unduh semua bulan (keputusan CEO 2026-11-16)


def cek_bulan(bulan: str) -> str:
    if bulan == SEMUA:
        return bulan
    if not isinstance(bulan, str) or not _RE_BULAN.fullmatch(bulan):
        raise ValueError("bulan harus YYYY-MM atau semua")
    return bulan


def saring(baris: Iterable[Dict[str, str]], bulan: str, faskes: Optional[Set[str]]) -> List[Dict[str, str]]:
    return [r for r in baris if (bulan == SEMUA or r["Periode Data"][:7] == bulan)
            and (faskes is None or norm(r["Nama Faskes"]) in faskes)]


def bulan_tersedia(baris: Iterable[Dict[str, str]], faskes: Optional[Set[str]]) -> List[str]:
    return sorted({r["Periode Data"][:7] for r in baris if faskes is None or norm(r["Nama Faskes"]) in faskes})


def label_bulan(bulan: str) -> str:
    if bulan == SEMUA:
        return "Semua Bulan"
    tahun, nomor = bulan.split("-")
    return f"{BULAN_ID[int(nomor) - 1]} {tahun}"


def _aman_nama(teks: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", teks).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Za-z0-9]+", "_", ascii_).strip("_")


def rentang(bulan_ada: Iterable[str]) -> Tuple[str, str]:
    """("April–Oktober 2026", "April-Oktober_2026") untuk judul dan nama berkas; lintas tahun ditulis lengkap."""
    ada = sorted(set(bulan_ada))
    if not ada:
        return "", ""
    awal, akhir = label_bulan(ada[0]).split(), label_bulan(ada[-1]).split()
    if awal == akhir:
        return " ".join(awal), "_".join(awal)
    if awal[1] == akhir[1]:
        return f"{awal[0]}–{akhir[0]} {akhir[1]}", f"{awal[0]}-{akhir[0]}_{akhir[1]}"
    return f"{' '.join(awal)}–{' '.join(akhir)}", f"{'_'.join(awal)}-{'_'.join(akhir)}"


def nama_berkas(bulan: str, rs: Optional[str], bulan_ada: Iterable[str] = ()) -> str:
    bagian = ["Detail_Jadwal_Dokter_FKRTL"]
    if rs:
        bagian.append(_aman_nama(rs))
    if bulan == SEMUA:
        # Nama berkas memuat rentang supaya unduhan bulan lain tidak bentrok (masukan Kim).
        _, teks = rentang(bulan_ada)
        bagian.append(re.sub(r"[^A-Za-z0-9_-]+", "", teks) or "Semua_Bulan")
    else:
        bagian.append(_aman_nama(label_bulan(bulan)))
    return "_".join(b for b in bagian if b) + ".xlsx"


def aman_sel(nilai: str) -> str:
    """Lapis kedua anti formula: teks berawalan karakter formula diberi awalan '; angka murni dibiarkan."""
    if nilai.startswith(_AWALAN_FORMULA) and not _RE_ANGKA.fullmatch(nilai):
        return "'" + nilai
    return nilai


def _kunci_urut(r: Dict[str, str]) -> Tuple:
    hari = HARI.index(r["Hari HFIS"]) if r["Hari HFIS"] in HARI else len(HARI)
    return (r["Kabupaten"], r["Nama Faskes"], r["Nama Poli"], r["Nama Dokter"], r["Periode Data"], hari)


def buat_xlsx(baris: List[Dict[str, str]], bulan: str, rs: Optional[str], diintegrasikan: str) -> bytes:
    import xlsxwriter

    keluar = io.BytesIO()
    # Lapis pertama: teks tidak pernah diubah menjadi formula, tautan, atau angka.
    buku = xlsxwriter.Workbook(keluar, {"in_memory": True, "strings_to_formulas": False,
                                        "strings_to_urls": False, "strings_to_numbers": False})
    lembar = buku.add_worksheet("Detail")
    tebal = buku.add_format({"bold": True})
    judul_kolom = buku.add_format({"bold": True, "bg_color": "#E8EEF5", "border": 1})
    tanggal = buku.add_format({"num_format": "dd/mm/yyyy"})
    hijau = buku.add_format({"bg_color": "#DFF3E6"})
    merah = buku.add_format({"bg_color": "#FBE1E1"})

    subjek = f"Detail Kesesuaian Jadwal Praktik Dokter FKRTL {rs}" if rs else "Detail Kesesuaian Jadwal Praktik Dokter FKRTL"
    if bulan == SEMUA:
        teks, _ = rentang(r["Periode Data"][:7] for r in baris)
        periode = f"semua bulan ({teks})" if teks else "semua bulan"
    else:
        periode = label_bulan(bulan)
    lembar.write_string(0, 0, f"{subjek}, {periode}", tebal)
    lembar.write_string(1, 0, f"Sumber: SSBI BPJS Kesehatan, diintegrasikan {diintegrasikan}")
    for c, nama in enumerate(KOLOM_KELUAR):
        lembar.write_string(3, c, nama, judul_kolom)
    i_periode, i_status = KOLOM_KELUAR.index("Periode Data"), KOLOM_KELUAR.index("Status")
    for r_i, r in enumerate(sorted(baris, key=_kunci_urut), start=4):
        for c, nama in enumerate(KOLOM_KELUAR):
            nilai = r[nama]
            if c == i_periode:
                lembar.write_datetime(r_i, c, datetime.strptime(nilai, "%Y-%m-%d"), tanggal)
            elif c == i_status:
                lembar.write_string(r_i, c, nilai, hijau if nilai == "SESUAI" else merah)
            else:
                lembar.write_string(r_i, c, aman_sel(nilai))
    lembar.freeze_panes(4, 0)
    lembar.autofilter(3, 0, 3 + len(baris), len(KOLOM_KELUAR) - 1)
    for c, lebar in enumerate((16, 34, 24, 22, 30, 20, 14, 14, 13, 11, 14)):
        lembar.set_column(c, c, lebar)
    buku.close()
    return keluar.getvalue()


# --- padanan Nama Faskes SSBI -> kode PPK (dipelihara Rosa) ---------------

class Padanan:
    def __init__(self, pasangan: List[Tuple[str, str]]):
        self.kode: Dict[str, Tuple[str, Set[str]]] = {}
        dipakai: Set[str] = set()
        for nama, kode in pasangan:
            kunci = norm(nama)
            if not kunci or not kode or kunci in dipakai:
                raise ValueError("tabel padanan SSBI tidak sah")
            dipakai.add(kunci)
            tampil, nama_set = self.kode.get(kode, (nama, set()))
            nama_set.add(kunci)
            self.kode[kode] = (tampil, nama_set)

    @classmethod
    def dari_berkas(cls, path: Path = PADANAN_BAWAAN) -> "Padanan":
        with open(path, encoding="utf-8", newline="") as f:
            return cls([(r["nama_faskes_ssbi"], r["kode_ppk"].strip()) for r in csv.DictReader(f)])

    def tak_terpetakan(self, baris: Iterable[Dict[str, str]]) -> List[str]:
        """Nama Faskes di data yang belum ada di tabel padanan (Petugas RS-nya belum bisa mengunduh)."""
        dikenal = {nama for _, nama_set in self.kode.values() for nama in nama_set}
        hasil: Dict[str, str] = {}
        for r in baris:
            kunci = norm(r["Nama Faskes"])
            if kunci not in dikenal:
                hasil.setdefault(kunci, r["Nama Faskes"])
        return sorted(hasil.values(), key=str.casefold)

    def untuk_kode(self, kode: str) -> Optional[Tuple[str, Set[str]]]:
        """(nama tampil, himpunan nama baku) untuk kode PPK, atau None (gagal tertutup)."""
        found = self.kode.get((kode or "").strip())
        return (found[0], set(found[1])) if found else None
