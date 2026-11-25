"""Detail SRK per SEP untuk "Download Detail" Monitoring Surat Kontrol (versi 1, keputusan CEO 2026-11-19).

Sumber: view SSBI 1310_YANFASKES_SRK_FKRTL/SuratKontrolSEP. Syarat Clara (butir 0, menunggu DPO):
Nomor SEP dan Nomor Surat Kontrol TIDAK pernah sampai ke server. Browser admin mengambil kode PPK dari
8 karakter awal Nomor SEP lalu membuang kedua kolom nomor; server menolak kolom nomor dan sel apa pun
yang berpola nomor. Hanya status tidak sesuai (= SEP, > SEP). Retensi 3 bulan. Semua regex digit ASCII.
"""
import csv
import gzip
import io
import json
import re
import unicodedata
import zlib
from dataclasses import dataclass
from datetime import date, datetime
from typing import Dict, Iterable, List, Optional, Set

BATAS_KOMPRES = 4 * 1024 * 1024
BATAS_MENTAH = 30 * 1024 * 1024
BATAS_BARIS = 200_000
BATAS_SEL = 200
RETENSI_BULAN = 3
_BLOK = 64 * 1024

KEPALA = ("kode_ppk", "Jenis Pelayanan", "Kode Poli Tujuan SEP", "Day, Month, Year of Tgl SEP",
          "Day, Month, Year of Tgl Terbit Kontrol", "Nama Faskes", "Status Surat Kontrol")
KOLOM = ("Kabupaten", "Kode PPK", "Nama Faskes", "Jenis Pelayanan", "Poli Tujuan SEP", "Tanggal SEP",
         "Tanggal Terbit Surat Kontrol", "Selisih (hari)", "Status")
STATUS = {"Tanggal Terbit Kontrol Sama Dengan Tanggal SEP": "eq", "Tanggal Terbit Kontrol Lebih Besar Tanggal SEP": "gt"}
LABEL_STATUS = {"eq": "Surkon = SEP", "gt": "Surkon > SEP"}
JENIS = {"Rawat Jalan": "RJ", "Rawat Inap": "RI"}
LABEL_JENIS = {"RJ": "Rawat Jalan", "RI": "Rawat Inap", "semua": "Semua"}
PREFIKS_KC = {"0188": "Lumajang", "1330": "Lumajang", "0189": "Jember", "1329": "Jember", "0191": "Bondowoso", "1332": "Bondowoso"}
BULAN_ID = ("Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober",
            "November", "Desember")
_BULAN_EN = {n: i + 1 for i, n in enumerate(("January", "February", "March", "April", "May", "June", "July", "August",
                                              "September", "October", "November", "December"))}

_RE_NOMOR = re.compile(r"[0-9]{4}[A-Z][0-9]{7}[A-Z][0-9]{6}")
# Review Clara PR #87 butir 3: sel dinormalisasi dulu, lalu dicek pola utuh dan pola potongan nomor:
# kepala (kode PPK + 4 digit tanggal + ...), ekor (>=4 digit + huruf + 6 digit), atau deret digit panjang.
_RE_POTONGAN = re.compile(r"[0-9]{4}[A-Z][0-9]{7}|[0-9]{4}[A-Z][0-9]{6}|[0-9]{11}")
_RE_PEMISAH = re.compile(r"[\s._\-/]+")
_RE_POLI = re.compile(r"[A-Z0-9]{0,6}")
_RE_KODE = re.compile(r"[0-9]{4}[A-Z][0-9]{3}")
_RE_TGL = re.compile(r"([A-Z][a-z]+) ([0-9]{1,2}), ([0-9]{4})")
_RE_BULAN = re.compile(r"[0-9]{4}-(0[1-9]|1[0-2])")
_RE_ANGKA = re.compile(r"[+-]?[0-9]+(\.[0-9]+)?")
_AWALAN_FORMULA = ("=", "+", "-", "@", "\t", "\r", "＝", "＋", "－", "＠")


class BerkasDitolak(Exception):
    def __init__(self, pesan: str):
        super().__init__(pesan)
        self.pesan = pesan


def label_bulan(bulan: str) -> str:
    t, b = bulan.split("-")
    return f"{BULAN_ID[int(b) - 1]} {t}"


def cek_bulan(bulan: str) -> str:
    if not isinstance(bulan, str) or not _RE_BULAN.fullmatch(bulan):
        raise ValueError("bulan harus YYYY-MM")
    return bulan


def normalkan_sel(nilai: str) -> str:
    """NFKC, digit Unicode apa pun -> ASCII, huruf besar, buang kategori Cf/Z* dan pemisah spasi . - _ /."""
    teks = unicodedata.normalize("NFKC", nilai or "")
    keluar = []
    for ch in teks:
        kat = unicodedata.category(ch)
        if kat == "Cf" or kat.startswith("Z"):
            continue
        d = unicodedata.decimal(ch, None)
        keluar.append(str(d) if d is not None else ch)
    return _RE_PEMISAH.sub("", "".join(keluar).upper())


def mirip_nomor(nilai: str) -> bool:
    n = normalkan_sel(nilai)
    return bool(_RE_NOMOR.search(n) or _RE_POTONGAN.search(n))


def _dalam_jendela(bulan: str, hari_ini: date) -> bool:
    """Review Clara butir 6: unggah hanya untuk 3 bulan terakhir (bulan berjalan WIB dan dua sebelumnya)."""
    return _bulan_minimum(hari_ini) <= bulan <= f"{hari_ini.year}-{hari_ini.month:02d}"


def norm(nama: str) -> str:
    return " ".join((nama or "").split()).casefold()


def buka_gzip(data: bytes) -> bytes:
    if len(data) > BATAS_KOMPRES:
        raise BerkasDitolak("Berkas terlalu besar untuk dikirim (batas 4 MB setelah dikompres).")
    if data[:2] != b"\x1f\x8b":
        raise BerkasDitolak("Kiriman tidak terbaca. Muat ulang halaman lalu coba lagi.")
    pembuka, keluar, sisa = zlib.decompressobj(16 + zlib.MAX_WBITS), io.BytesIO(), data
    try:
        while True:
            potong = pembuka.decompress(sisa, _BLOK)
            keluar.write(potong)
            if keluar.tell() > BATAS_MENTAH:
                raise BerkasDitolak("Ukuran berkas melebihi batas 30 MB.")
            sisa = pembuka.unconsumed_tail
            if pembuka.eof or (not sisa and not potong):
                break
    except zlib.error:
        raise BerkasDitolak("Kiriman rusak. Muat ulang halaman lalu coba lagi.") from None
    if not pembuka.eof or pembuka.unused_data:
        raise BerkasDitolak("Kiriman terpotong. Muat ulang halaman lalu coba lagi.")
    return keluar.getvalue()


def _tgl(nilai: str) -> Optional[str]:
    m = _RE_TGL.fullmatch(nilai)
    if not m or m[1] not in _BULAN_EN:
        return None
    try:
        return date(int(m[3]), _BULAN_EN[m[1]], int(m[2])).isoformat()
    except ValueError:
        return None


@dataclass
class HasilPeriksa:
    baris: List[List[str]]
    ringkasan: dict


def _galat(nomor: int, kolom: str, alasan: str) -> BerkasDitolak:
    return BerkasDitolak(f"Isi berkas tidak sesuai di baris {nomor}, kolom {kolom}: {alasan}. Tidak ada data yang diubah.")


def periksa_csv(raw: bytes, padanan: Dict[str, Set[str]], hari_ini: date) -> HasilPeriksa:
    """`padanan`: kode PPK -> himpunan nama faskes baku (norm).

    Kode di luar padanan diterima dengan syarat (review Clara butir 2): namanya bukan nama padanan milik kode lain,
    dan satu kode tak terpadan hanya punya satu nama di seluruh berkas. Parsing lazy (butir 5): kepala dicek dulu,
    baris kosong ikut dihitung, dan pembacaan berhenti begitu melewati BATAS_BARIS.
    """
    try:
        teks = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise BerkasDitolak("Kiriman harus CSV UTF-8 dari halaman Integrasi data.") from None
    if "\x00" in teks:
        raise BerkasDitolak("Berkas memuat karakter yang tidak sah.")
    pembaca = csv.reader(io.StringIO(teks, newline=""), strict=True)
    try:
        kepala = [h.strip() for h in next(pembaca, [])]
    except csv.Error:
        raise BerkasDitolak("Berkas CSV tidak terbaca. Unduh ulang dari SSBI.") from None
    if not kepala:
        raise BerkasDitolak("Berkas tidak berisi baris data.")
    if any("nomor" in normalkan_sel(h).casefold() for h in kepala):
        raise BerkasDitolak("Kiriman masih memuat kolom nomor SEP atau nomor surat kontrol. Unggah lewat halaman Integrasi data.")
    if tuple(kepala) != KEPALA:
        raise BerkasDitolak("Kolom berkas tidak sesuai view SSBI Surat Kontrol = SEP.")
    milik: Dict[str, str] = {n: k for k, nama in padanan.items() for n in nama}
    hasil: List[List[str]] = []
    per_bulan: Dict[str, dict] = {}  # bulan diambil dari Tgl SEP (seret-lepas tanpa pilih bulan, CEO 2026-11-25)
    tak_dikenal: Dict[str, str] = {}
    nomor = 1
    try:
        for sel in pembaca:
            nomor += 1
            if nomor - 1 > BATAS_BARIS:
                raise BerkasDitolak("Berkas berisi terlalu banyak baris.")
            if not any(c.strip() for c in sel):
                continue
            if len(sel) != len(KEPALA):
                raise BerkasDitolak(f"Jumlah kolom di baris {nomor} tidak sama dengan baris judul. Tidak ada data yang diubah.")
            sel = [c.strip() for c in sel]
            for k, c in zip(KEPALA, sel):
                if len(c) > BATAS_SEL:
                    raise _galat(nomor, k, f"isi lebih dari {BATAS_SEL} karakter")
                if mirip_nomor(c):
                    raise BerkasDitolak(f"Baris {nomor} memuat pola nomor SEP atau nomor surat kontrol. Nomor harus dibuang di browser; tidak ada data yang diubah.")
            kode, jenis, poli, t_sep, t_terbit, nama, status = sel
            if not _RE_KODE.fullmatch(kode) or kode[:4] not in PREFIKS_KC:
                raise _galat(nomor, "kode PPK", "bukan kode PPK FKRTL KC Jember")
            n = norm(nama)
            if kode in padanan:
                if n not in padanan[kode]:
                    raise _galat(nomor, "Nama Faskes", "tidak cocok dengan kode PPK")
            elif n in milik:
                raise _galat(nomor, "Nama Faskes", "nama ini milik kode PPK lain di tabel padanan")
            elif tak_dikenal.setdefault(kode, n) != n:
                raise _galat(nomor, "Nama Faskes", "kode PPK di luar tabel padanan harus memakai satu nama di seluruh berkas")
            if not _RE_POLI.fullmatch(poli):
                raise _galat(nomor, "Kode Poli", "harus kode poli SSBI (huruf besar/angka, paling banyak 6)")
            if jenis not in JENIS:
                raise _galat(nomor, "Jenis Pelayanan", "harus Rawat Jalan atau Rawat Inap")
            if status not in STATUS:
                raise _galat(nomor, "Status", "hanya status tidak sesuai (= SEP atau > SEP)")
            a, b = _tgl(t_sep), _tgl(t_terbit)
            if a is None or b is None:
                raise _galat(nomor, "Tgl SEP/Tgl Terbit", "tanggal tidak terbaca")
            j, s = JENIS[jenis], STATUS[status]
            ring = per_bulan.setdefault(a[:7], {"baris": 0, "RJ": {"eq": 0, "gt": 0}, "RI": {"eq": 0, "gt": 0}})
            ring["baris"] += 1
            ring[j][s] += 1
            hasil.append([kode, nama, j, poli, a, b, s])
    except csv.Error:
        raise BerkasDitolak("Berkas CSV tidak terbaca. Unduh ulang dari SSBI.") from None
    if not hasil:
        raise BerkasDitolak("Berkas tidak berisi baris data.")
    bulan = sorted(per_bulan)
    luar = [label_bulan(b) for b in bulan if not _dalam_jendela(b, hari_ini)]
    if luar:  # keputusan CEO 2026-11-25: seluruh kiriman ditolak, pesan menyebut bulannya
        raise BerkasDitolak(f"Berkas memuat bulan di luar 3 bulan terakhir atau bulan yang akan datang: {', '.join(luar)}. "
                            "Hapus bulan itu dari filter SSBI, lalu unduh ulang. Tidak ada data yang diubah.")
    return HasilPeriksa(hasil, {"bulan": bulan, "baris": len(hasil), "per_bulan": per_bulan,
                                "faskes": len({b[0] for b in hasil}), "kode_tak_dikenal": sorted(tak_dikenal)})


# --- simpanan dan retensi ----------------------------------------------------

def _bulan_minimum(hari_ini: date) -> str:
    t, b = hari_ini.year, hari_ini.month - (RETENSI_BULAN - 1)
    while b < 1:
        t, b = t - 1, b + 12
    return f"{t}-{b:02d}"


def baca_simpanan(isi: bytes) -> dict:
    if not isi:
        return {"versi": 1, "bulan": {}}
    pembuka = zlib.decompressobj(16 + zlib.MAX_WBITS)
    mentah = pembuka.decompress(isi, BATAS_MENTAH * 2 + 1)
    if len(mentah) > BATAS_MENTAH * 2 or not pembuka.eof:
        raise ValueError("simpanan detail rusak atau terlalu besar")
    if not mentah.strip():
        return {"versi": 1, "bulan": {}}
    data = json.loads(mentah.decode("utf-8"))
    if (not isinstance(data, dict) or data.get("versi") != 1 or not isinstance(data.get("bulan"), dict)
            or not all(isinstance(k, str) and _RE_BULAN.fullmatch(k) for k in data["bulan"])):
        raise ValueError("format simpanan detail tidak dikenal")
    return data


def bulan_aktif(isi: dict, hari_ini: date) -> Dict[str, dict]:
    """Syarat Clara: bulan lebih tua dari 3 bulan terhadap bulan berjalan tidak disajikan."""
    batas = _bulan_minimum(hari_ini)
    return {b: v for b, v in isi["bulan"].items() if b >= batas}


def simpanan_baru(lama: Optional[bytes], baris: List[List[str]], meta: Dict[str, str], hari_ini: date) -> bytes:
    """Setiap bulan Tgl SEP yang ada di `baris` menggantikan bulan itu; bulan lain tidak berubah."""
    isi = baca_simpanan(lama or b"")
    for bulan in {b[4][:7] for b in baris}:
        isi["bulan"][cek_bulan(bulan)] = {"baris": [b for b in baris if b[4][:7] == bulan], "meta": dict(meta)}
    isi["bulan"] = dict(sorted(bulan_aktif(isi, hari_ini).items()))
    return gzip.compress(json.dumps(isi, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)


# --- unduh -------------------------------------------------------------------

def saring(baris: Iterable[List[str]], jenis: str, status: str, kode: Optional[str]) -> List[List[str]]:
    return [b for b in baris if (jenis == "semua" or b[2] == jenis) and (status == "semua" or b[6] == status)
            and (kode is None or b[0] == kode)]


def _kab(kode: str, kabupaten: Dict[str, str]) -> str:
    kab = re.sub(r"^kab(upaten)?\.?\s*", "", (kabupaten.get(kode) or PREFIKS_KC.get(kode[:4], "")).strip(), flags=re.I)
    return kab.title() if kab else "-"


def aman(nilai: str) -> str:
    if nilai.startswith(_AWALAN_FORMULA) and not _RE_ANGKA.fullmatch(nilai):
        return "'" + nilai
    return nilai


def _aman_nama(teks: str) -> str:
    a = unicodedata.normalize("NFKD", teks).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Za-z0-9]+", "_", a).strip("_")


def nama_berkas(bulan: str, jenis: str, rs: Optional[str]) -> str:
    bagian = ["Detail_Surat_Kontrol", _aman_nama(label_bulan(bulan)), "Semua" if jenis == "semua" else jenis]
    if rs:
        bagian.append(_aman_nama(rs))
    return "_".join(bagian) + ".xlsx"


def buat_xlsx(baris: List[List[str]], bulan: str, jenis: str, rs: Optional[str], kabupaten: Dict[str, str]) -> bytes:
    import xlsxwriter

    keluar = io.BytesIO()
    buku = xlsxwriter.Workbook(keluar, {"in_memory": True, "strings_to_formulas": False, "strings_to_urls": False,
                                        "strings_to_numbers": False})
    ws = buku.add_worksheet("Detail")
    rahasia = buku.add_format({"bold": True, "font_color": "#9C0006", "bg_color": "#FFC7CE"})
    tebal = buku.add_format({"bold": True})
    kepala = buku.add_format({"bold": True, "bg_color": "#E8EEF5", "border": 1})
    tgl = buku.add_format({"num_format": "dd/mm/yyyy"})
    ws.merge_range(0, 0, 0, len(KOLOM) - 1, "RAHASIA — data pelayanan peserta", rahasia)
    ws.write_string(1, 0, f"Detail Surat Kontrol tidak sesuai, {label_bulan(bulan)}, {LABEL_JENIS[jenis].capitalize()}{', ' + rs if rs else ''}", tebal)
    ws.write_string(2, 0, "Sumber: SSBI BPJS Kesehatan (1310_YANFASKES_SRK_FKRTL). Tanpa nomor SEP dan nomor surat kontrol.")
    for c, n in enumerate(KOLOM):
        ws.write_string(4, c, n, kepala)
    urut = sorted(baris, key=lambda b: (_kab(b[0], kabupaten), b[1], b[4], b[3]))
    for r, b in enumerate(urut, start=5):
        kode, nama, j, poli, a, t, s = b
        ws.write_string(r, 0, _kab(kode, kabupaten))
        ws.write_string(r, 1, kode)
        ws.write_string(r, 2, aman(nama))
        ws.write_string(r, 3, LABEL_JENIS[j])
        ws.write_string(r, 4, aman(poli))
        ws.write_datetime(r, 5, datetime.fromisoformat(a), tgl)
        ws.write_datetime(r, 6, datetime.fromisoformat(t), tgl)
        ws.write_number(r, 7, (date.fromisoformat(t) - date.fromisoformat(a)).days)
        ws.write_string(r, 8, LABEL_STATUS[s])
    ws.freeze_panes(5, 0)
    ws.autofilter(4, 0, 4 + len(urut), len(KOLOM) - 1)
    for c, w in enumerate((12, 11, 34, 14, 14, 12, 14, 10, 14)):
        ws.set_column(c, c, w)
    buku.close()
    return keluar.getvalue()
