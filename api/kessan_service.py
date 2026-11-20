"""Monitoring Kessan FKRTL: data agregat kunjungan Kessan per FKRTL per bulan dari Google Sheets.

Sumber dua lembar dalam satu spreadsheet: `kessan` (data per faskes per bulan) dan `db_fkrtl` (daftar induk FKRTL:
nama dan kabupaten; FKRTL di sini selalu tampil tiap bulan). ID spreadsheet dan gid hanya dibaca dari env; jangan
menuliskannya di repo, begitu pula daftar kode yang dikecualikan.
Hanya data agregat per faskes, tanpa data peserta.
"""
import csv
import io
import logging
import os
import re
import threading
import time
import urllib.request
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, Iterable, List, Optional

try:
    from .sheets_source import read_sheet_csv
except ImportError:
    from sheets_source import read_sheet_csv

logger = logging.getLogger("sapa-api")

ENV_SPREADSHEET = "SAPA_KESSAN_SPREADSHEET_ID"
ENV_GID = "SAPA_KESSAN_GID"
ENV_GID_DB = "SAPA_KESSAN_GID_DB_FKRTL"
# Kode PPK di db_fkrtl yang tidak ditampilkan, dipisah koma (di produksi: 0188S001). Tidak ditanam di kode.
ENV_KODE_DIKECUALIKAN = "SAPA_KESSAN_KODE_DIKECUALIKAN"

PESAN_BELUM_DIKONFIGURASI = "Data Kessan belum dikonfigurasi."
PESAN_GAGAL = "Data Kessan belum bisa dimuat."

KABUPATEN_URUT = ("Jember", "Lumajang", "Bondowoso")
CACHE_TTL = 300  # 5 menit, sama dengan menu kepatuhan
CACHE_TTL_SINGKAT = 60  # db_fkrtl gagal: nama memakai cadangan, dicoba lagi lebih cepat
JEDA_GAGAL = 60  # setelah sheet kessan gagal dibaca, permintaan dalam jeda ini tidak membaca sheet lagi
_BATAS_UNDUH = 5 * 1024 * 1024
_TIMEOUT_UNDUH = 15
_KOLOM_WAJIB = ("kode_ppk", "jumlah_kessan", "target", "bulan", "kabupaten", "last_update_bi")

_ID_SAH = re.compile(r"[A-Za-z0-9_-]{20,100}")
_GID_SAH = re.compile(r"\d{1,12}")
_KODE_PPK_SAH = re.compile(r"[0-9]{4}[A-Z][0-9]{3}")  # mis. 0101R001; hanya untuk daftar induk db_fkrtl

_BULAN = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10,
    "nov": 11, "dec": 12,
    # Cadangan bila suatu saat sheet ditulis dalam bahasa Indonesia.
    "januari": 1, "februari": 2, "maret": 3, "mei": 5, "juni": 6, "juli": 7, "agustus": 8, "oktober": 10,
    "desember": 12, "agu": 8, "okt": 10, "des": 12,
}

# kunci konfigurasi -> (kedaluwarsa_pada, respons lengkap | None bila gagal, peta nama | None)
_CACHE: Dict[tuple, tuple] = {}
_CACHE_LOCK = threading.Lock()
_KUNCI_MUAT: Dict[tuple, threading.Lock] = {}  # satu pengambilan per kunci cache (single-flight)


class KessanBelumDikonfigurasi(Exception):
    """Env sumber data Kessan kosong atau tidak sah."""


class KessanGagalDimuat(Exception):
    """Sheet Kessan tidak bisa dibaca atau isinya tidak dikenali."""


# --- fungsi murni ------------------------------------------------------------

def baca_csv(isi) -> List[Dict[str, str]]:
    """CSV (bytes/str) menjadi daftar baris; kepala kolom dirapikan huruf kecil, tanda kutip dihormati."""
    if isinstance(isi, bytes):
        isi = isi.decode("utf-8", errors="replace")
    isi = (isi or "").lstrip("\ufeff")  # BOM ditulis sebagai escape supaya tidak hilang oleh editor
    pembaca = csv.reader(io.StringIO(isi))
    kepala = next(pembaca, None)
    if not kepala:
        return []
    kepala = [str(k).replace("\xa0", " ").strip().lower() for k in kepala]
    hasil = []
    for baris in pembaca:
        hasil.append({k: (baris[i].strip() if i < len(baris) else "") for i, k in enumerate(kepala) if k})
    return hasil


def kunci_bulan(teks) -> Optional[str]:
    """"January 2026" atau "2026-01" menjadi "2026-01"; None bila tidak dikenali."""
    teks = re.sub(r"\s+", " ", str(teks or "").replace("\xa0", " ")).strip().lower()
    m = re.fullmatch(r"(\d{4})-(\d{1,2})", teks)
    if m:
        tahun, bulan = int(m.group(1)), int(m.group(2))
    else:
        m = re.fullmatch(r"([a-z]+)\.? (\d{4})", teks)
        if not m or m.group(1) not in _BULAN:
            return None
        tahun, bulan = int(m.group(2)), _BULAN[m.group(1)]
    if not 1 <= bulan <= 12:
        return None
    return f"{tahun:04d}-{bulan:02d}"


_RIBUAN_KOMA = re.compile(r"\d{1,3}(?:,\d{3})+")  # 1,644 / 1,234,567
_RIBUAN_TITIK_JAMAK = re.compile(r"\d{1,3}(?:\.\d{3}){2,}")  # 1.234.567 (titik ganda pasti pemisah ribuan)
_DESIMAL_TITIK = re.compile(r"(\d{1,3}(?:,\d{3})+|\d+)\.(\d+)")  # 1,644.00 / 100.0
_DESIMAL_KOMA = re.compile(r"(\d{1,3}(?:\.\d{3})+|\d+),(\d+)")  # 1.644,00 / 12,5


def bilangan_bulat(teks) -> Optional[int]:
    """Bilangan bulat tak negatif dari teks sheet; None bila kosong, bukan angka, negatif, atau berdesimal non-nol.

    Sheet ber-locale en-US (titik desimal, koma ribuan, mis. "591.37%"), jadi "1,644" = 1644 dan "100.000" = 100.
    Pola id-ID hanya dipakai bila tidak ambigu ("1.644,00", "1.234.567"). "1.182" dibaca 1,182 sehingga ditolak.
    """
    teks = str(teks or "").replace("\xa0", "").replace(" ", "").strip()
    if re.fullmatch(r"\d+", teks):
        return int(teks)
    if _RIBUAN_KOMA.fullmatch(teks) or _RIBUAN_TITIK_JAMAK.fullmatch(teks):
        return int(re.sub(r"[.,]", "", teks))
    for pola in (_DESIMAL_TITIK, _DESIMAL_KOMA):
        m = pola.fullmatch(teks)
        if m:
            return None if m.group(2).strip("0") else int(re.sub(r"[.,]", "", m.group(1)))
    return None


def hitung_persen(jumlah: int, target: Optional[int]) -> Optional[float]:
    """jumlah ÷ target × 100, dua desimal; None bila target kosong atau 0."""
    if not target:
        return None
    # Setengah ke atas seperti ROUND di Sheets/BI; round() float memakai pembulatan bankir (1/32 -> 3,12).
    return float((Decimal(jumlah) * 100 / Decimal(target)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def skor_dari_aturan(persen: Optional[float]) -> int:
    """Aturan skor Umbal (persen asli, tanpa pembulatan). Target kosong atau 0 bernilai 100."""
    if persen is None:
        return 100
    for ambang in (100, 75, 50, 25):
        if persen >= ambang:
            return ambang
    return 0


def tanggal_last_update(teks) -> Optional[date]:
    """Tanggal dari "Last Update : 2026-11-20 02:42:06". Hanya ISO (kontrak sheet); DD/MM dan M/D ambigu, jadi None."""
    m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", str(teks or ""))
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def bulan_sementara(bulan: Iterable[str], tanggal: Optional[date]) -> List[str]:
    """Bulan M sementara bila tanggal Last Update lebih awal dari tanggal 1 bulan M+1."""
    if tanggal is None:
        return []
    hasil = []
    for kunci in bulan:
        tahun, nomor = int(kunci[:4]), int(kunci[5:7])
        awal_berikut = date(tahun + 1, 1, 1) if nomor == 12 else date(tahun, nomor + 1, 1)
        if tanggal < awal_berikut:
            hasil.append(kunci)
    return hasil


def nama_kabupaten(teks) -> str:
    """"KAB. JEMBER" / "Kabupaten Jember" / "jember" menjadi "Jember"."""
    teks = re.sub(r"\s+", " ", str(teks or "").replace("\xa0", " ")).strip()
    teks = re.sub(r"^(kabupaten|kab\.?)\s*", "", teks, flags=re.IGNORECASE).strip()
    if not teks:
        return ""
    dikenal = {k.lower(): k for k in KABUPATEN_URUT}
    return dikenal.get(teks.lower(), teks.title())


def kode_ppk(teks) -> str:
    """Kode PPK baku: tanpa spasi tepi, huruf besar."""
    return str(teks or "").replace("\xa0", " ").strip().upper()


def _kosong(teks) -> bool:
    return str(teks or "").strip() in ("", "-")


def peta_nama(db_rows: Iterable[Dict[str, str]]) -> Dict[str, str]:
    """kode_ppk (huruf besar) -> nama_ppk dari sheet db_fkrtl."""
    hasil = {}
    for r in db_rows:
        kode, nama = kode_ppk(r.get("kode_ppk")), (r.get("nama_ppk") or "").strip()
        if kode and nama:
            hasil[kode] = nama
    return hasil


def daftar_kode(teks) -> frozenset:
    """"0188s001, 0909R009" menjadi {"0188S001", "0909R009"}; butir kosong diabaikan."""
    return frozenset(k for k in (kode_ppk(b) for b in str(teks or "").split(",")) if k)


def kode_dikecualikan() -> frozenset:
    """Kode PPK di env SAPA_KESSAN_KODE_DIKECUALIKAN (dipisah koma); kosong berarti tidak ada pengecualian."""
    return daftar_kode(os.environ.get(ENV_KODE_DIKECUALIKAN))


def _urut_kabupaten(nama: Iterable[str]) -> List[str]:
    ada = {n for n in nama if n}
    return [k for k in KABUPATEN_URUT if k in ada] + sorted(ada - set(KABUPATEN_URUT))


def _induk_fkrtl(db_rows: Iterable[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    """kode_ppk -> {nama, kabupaten} untuk setiap FKRTL di db_fkrtl, urut seperti di sheet."""
    hasil: Dict[str, Dict[str, str]] = {}
    tidak_sah = 0
    for r in db_rows:
        if _kosong(r.get("kode_ppk")):
            continue
        kode = kode_ppk(r.get("kode_ppk"))
        if not _KODE_PPK_SAH.fullmatch(kode):
            tidak_sah += 1  # baris catatan atau salah ketik: jangan jadi faskes tampil
            continue
        hasil[kode] = {"nama": (r.get("nama_ppk") or "").strip(), "kabupaten": nama_kabupaten(r.get("kabupaten"))}
    if tidak_sah:
        logger.warning("db_fkrtl Kessan: %d baris berkode PPK tidak sah dilewati", tidak_sah)  # isi baris tidak dicatat
    return hasil


def susun(kessan_rows: List[Dict[str, str]], db_rows: List[Dict[str, str]],
          dikecualikan: Iterable[str] = ()) -> Dict[str, Any]:
    """Respons lengkap dari baris sheet kessan dan db_fkrtl.

    Untuk setiap bulan yang ada di sheet, semua FKRTL di db_fkrtl (kecuali kode di `dikecualikan`) selalu punya baris.
    FKRTL tanpa baris sheet pada bulan itu diberi kunjungan 0, target kosong, dan skor 100. Baris sheet berkode
    dikecualikan dibuang. Bila db_fkrtl kosong (gagal dibaca), hanya baris sheet yang dipakai.
    """
    if isinstance(dikecualikan, str):  # "0188S001" atau "a,b": jangan diiterasi per karakter
        dikecualikan = daftar_kode(dikecualikan)
    dikecualikan = {kode_ppk(k) for k in dikecualikan}
    nama_db = peta_nama(db_rows)
    induk = _induk_fkrtl(db_rows)
    per_kunci: Dict[tuple, Dict[str, Any]] = {}
    cadangan: Dict[str, Dict[str, str]] = {}  # nama dan kabupaten terakhir di sheet per kode
    last_update = None
    dibaca = dibuang = ganda = tanpa_kab = 0
    for r in kessan_rows:
        if last_update is None and (r.get("last_update_bi") or "").strip():
            last_update = r["last_update_bi"].strip()
        if all(_kosong(r.get(k)) for k in ("kode_ppk", "jumlah_kessan", "bulan")):
            continue  # baris kosong di ujung sheet
        kode = kode_ppk(r.get("kode_ppk"))
        if kode in dikecualikan:
            continue  # bukan baris rusak, jadi tidak ikut dihitung
        dibaca += 1
        bulan = kunci_bulan(r.get("bulan"))
        jumlah = bilangan_bulat(r.get("jumlah_kessan"))
        target = None if _kosong(r.get("target")) else bilangan_bulat(r.get("target"))
        if not kode or not bulan or jumlah is None or (target is None and not _kosong(r.get("target"))):
            dibuang += 1
            continue
        target = target or None
        persen = hitung_persen(jumlah, target)
        skor = bilangan_bulat(r.get("skor_kepatuhan"))
        kabupaten = nama_kabupaten(r.get("kabupaten")) or induk.get(kode, {}).get("kabupaten", "")
        tanpa_kab += not kabupaten
        ganda += (kode, bulan) in per_kunci
        nama_sheet = (r.get("nama_ppk") or "").strip()
        cadangan[kode] = {"nama": nama_sheet or cadangan.get(kode, {}).get("nama", ""),
                          "kabupaten": kabupaten or cadangan.get(kode, {}).get("kabupaten", "")}
        per_kunci[(kode, bulan)] = {
            "kode_ppk": kode,
            "nama_faskes": nama_db.get(kode) or nama_sheet or kode,
            "kabupaten": kabupaten,
            "bulan": bulan,
            "jumlah_kessan": jumlah,
            "target": target,
            "persen": persen,
            # Ambang skor memakai persen asli, bukan yang sudah dibulatkan untuk tampilan.
            "skor": skor if skor is not None else skor_dari_aturan(jumlah / target * 100 if target else None),
        }
    # Log hanya berisi jumlah baris, tanpa isi data.
    if dibuang:
        logger.warning("Sheet Kessan: %d dari %d baris tidak terbaca dan dibuang", dibuang, dibaca)
        if dibuang * 2 > dibaca:
            logger.error("Sheet Kessan: lebih dari separuh baris tidak terbaca")
            raise KessanGagalDimuat(PESAN_GAGAL)
    if ganda:
        logger.warning("Sheet Kessan: %d pasangan kode PPK dan bulan ganda; yang terakhir dipakai", ganda)
    if tanpa_kab:
        logger.warning("Sheet Kessan: %d baris tanpa kabupaten", tanpa_kab)
    tersedia = sorted({bulan for _, bulan in per_kunci})
    for kode, ref in induk.items():
        if kode in dikecualikan:
            continue
        sheet = cadangan.get(kode, {})
        for bulan in tersedia:
            if (kode, bulan) in per_kunci:
                continue
            per_kunci[(kode, bulan)] = {
                "kode_ppk": kode,
                "nama_faskes": ref["nama"] or sheet.get("nama") or kode,
                "kabupaten": ref["kabupaten"] or sheet.get("kabupaten", ""),
                "bulan": bulan,
                "jumlah_kessan": 0,
                "target": None,
                "persen": None,
                "skor": skor_dari_aturan(None),
            }
    baris = sorted(per_kunci.values(), key=lambda b: (b["bulan"], -b["jumlah_kessan"], b["nama_faskes"].casefold()))
    tanggal = tanggal_last_update(last_update)
    if last_update and tanggal is None:
        logger.warning("Last Update sheet Kessan tidak berformat YYYY-MM-DD; bulan sementara tidak ditandai")
    return {
        "status": "success",
        "last_update_bi": last_update,
        "last_update_tanggal": tanggal.isoformat() if tanggal else None,
        "bulan_tersedia": tersedia,
        "bulan_sementara": bulan_sementara(tersedia, tanggal),
        "kabupaten": _urut_kabupaten(b["kabupaten"] for b in baris),
        "rs": None,
        "terkunci": False,
        "baris": baris,
    }


def saring_petugas(data: Dict[str, Any], kode: str, nama_db: Dict[str, str]) -> Dict[str, Any]:
    """Salinan respons yang hanya memuat baris RS milik petugas (penyaringan di server)."""
    kode = kode_ppk(kode)
    baris = [dict(b) for b in data["baris"] if kode_ppk(b["kode_ppk"]) == kode]
    nama = ({kode_ppk(k): v for k, v in nama_db.items()}.get(kode)
            or next((b["nama_faskes"] for b in reversed(baris)), None) or kode)
    return {**data, "kabupaten": _urut_kabupaten(b["kabupaten"] for b in baris),
            "rs": {"kode": kode, "nama": nama}, "terkunci": True, "baris": baris}


# --- pengambilan data ---------------------------------------------------------

def _konfigurasi() -> tuple:
    """(spreadsheet, gid kessan, gid db_fkrtl, kode dikecualikan terurut); juga menjadi kunci cache."""
    sid = (os.environ.get(ENV_SPREADSHEET) or "").strip()
    gid = (os.environ.get(ENV_GID) or "").strip()
    gid_db = (os.environ.get(ENV_GID_DB) or "").strip()
    if not (sid and gid and gid_db):
        raise KessanBelumDikonfigurasi(PESAN_BELUM_DIKONFIGURASI)
    if not (_ID_SAH.fullmatch(sid) and _GID_SAH.fullmatch(gid) and _GID_SAH.fullmatch(gid_db)):
        logger.error("Env sumber data Kessan tidak sah")  # nilai env tidak dicatat
        raise KessanBelumDikonfigurasi(PESAN_BELUM_DIKONFIGURASI)
    return sid, gid, gid_db, tuple(sorted(kode_dikecualikan()))


def _unduh_ekspor_csv(spreadsheet_id: str, gid: str) -> Optional[bytes]:
    """Cadangan: ekspor CSV publik (sheet dibagikan "siapa saja yang punya tautan"). URL tidak pernah dicatat."""
    url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid={gid}"
    permintaan = urllib.request.Request(url, headers={"User-Agent": "sapa-yanfaskes"})
    with urllib.request.urlopen(permintaan, timeout=_TIMEOUT_UNDUH) as respons:  # noqa: S310 (host tetap)
        if respons.status != 200 or "csv" not in (respons.headers.get("Content-Type") or ""):
            return None
        isi = respons.read(_BATAS_UNDUH + 1)
    return isi if len(isi) <= _BATAS_UNDUH else None


def _baca_lembar(spreadsheet_id: str, gid: str, label: str) -> Optional[bytes]:
    """Akun layanan lebih dulu, lalu ekspor CSV publik. None bila keduanya gagal."""
    isi = read_sheet_csv(spreadsheet_id, gid, label)
    if isi:
        return isi
    try:
        return _unduh_ekspor_csv(spreadsheet_id, gid)
    except Exception as exc:
        logger.warning("Ekspor CSV %s tidak terbaca (%s)", label, type(exc).__name__)
        return None


def _ambil(spreadsheet_id: str, gid: str, label: str) -> Optional[List[Dict[str, str]]]:
    try:
        isi = _baca_lembar(spreadsheet_id, gid, label)
    except Exception as exc:
        logger.error("Lembar %s gagal dibaca (%s)", label, type(exc).__name__)
        return None
    return baca_csv(isi) if isi else None


def _muat(sid: str, gid: str, gid_db: str, dikecualikan: tuple = ()) -> tuple:
    """(respons lengkap, peta nama, lengkap?) dari sheet; KessanGagalDimuat bila sheet kessan tak terbaca."""
    kessan = _ambil(sid, gid, "KESSAN")
    if kessan is None:
        raise KessanGagalDimuat(PESAN_GAGAL)
    if kessan and not all(k in kessan[0] for k in _KOLOM_WAJIB):
        logger.error("Kolom sheet Kessan tidak dikenali")
        raise KessanGagalDimuat(PESAN_GAGAL)
    db = _ambil(sid, gid_db, "KESSAN_DB_FKRTL")
    if db is None:
        logger.warning("Referensi db_fkrtl Kessan tidak terbaca; hanya baris sheet kessan, nama dari sheet kessan")
    return susun(kessan, db or [], dikecualikan), peta_nama(db or []), db is not None


def _segarkan(kunci: tuple, simpanan: Optional[tuple]) -> tuple:
    """Ambil ulang sheet dengan satu utas per kunci; utas lain menunggu lalu memakai hasilnya.

    Hasil gagal juga disimpan (data lama bila ada, atau penanda gagal) selama JEDA_GAGAL, supaya Google yang lambat
    tidak dibaca ulang di setiap permintaan sampai melewati batas waktu fungsi dan menguras kuota.
    """
    with _CACHE_LOCK:
        kunci_muat = _KUNCI_MUAT.setdefault(kunci, threading.Lock())
    with kunci_muat:
        with _CACHE_LOCK:
            simpanan = _CACHE.get(kunci, simpanan)
        sekarang = time.time()
        if simpanan is not None and sekarang < simpanan[0]:
            return simpanan  # sudah disegarkan utas lain selama menunggu
        try:
            data, nama_db, lengkap = _muat(*kunci)
        except KessanGagalDimuat:
            if simpanan is not None and simpanan[1] is not None:
                logger.warning("Sheet Kessan gagal dibaca; memakai data simpanan terakhir")
                baru = (sekarang + JEDA_GAGAL, simpanan[1], simpanan[2])
            else:
                baru = (sekarang + JEDA_GAGAL, None, None)
        else:
            baru = (sekarang + (CACHE_TTL if lengkap else CACHE_TTL_SINGKAT), data, nama_db)
        with _CACHE_LOCK:
            _CACHE[kunci] = baru
        return baru


def data_kessan(kode_rs: Optional[str]) -> Dict[str, Any]:
    """Respons GET /api/v1/kessan/data. kode_rs terisi untuk Petugas RS (hanya baris RS itu)."""
    kunci = _konfigurasi()
    with _CACHE_LOCK:
        simpanan = _CACHE.get(kunci)
    if simpanan is None or time.time() >= simpanan[0]:
        simpanan = _segarkan(kunci, simpanan)
    _, data, nama_db = simpanan
    if data is None:
        raise KessanGagalDimuat(PESAN_GAGAL)
    return saring_petugas(data, kode_rs, nama_db) if kode_rs else data
