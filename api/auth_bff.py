"""Login satu halaman dengan akun lokal (BFF, tanpa Auth0): /api/v1/auth/masuk, /sesi, /keluar, /siap,
/siapkan-akun, dan /api/v1/akun/ubah-sandi.

Router ini hanya dipasang di api/index.py bila SAPA_LOGIN_BFF=1. Dengan flag 0 rutenya tidak ada sama sekali
(404 bawaan) dan aplikasi memakai Auth0 SPA seperti sebelumnya. Saat flag 1 tidak ada panggilan Auth0 maupun
verifikasi JWT Auth0 di jalur mana pun.

Akun ada di tabel akun_sapa (Cloudflare D1, lewat Worker sapa-akun; lihat api/akun_service.py). Sesi, pembatas,
hash token Turnstile, dan jangkar versi ada di DB sesi Neon (api/sesi_service.py). Prosedur operasi (tindakan
pemilik sebelum flag 1, penyiapan akun pertama, pemulihan, rollback): docs/runbook-login-bff.md.

Urutan /masuk: asal (permintaan_sah: X-SAPA, plus Sec-Fetch-Site same-origin atau Origin sendiri) -> bentuk
permintaan -> konfigurasi (kunci sesi, DB sesi, pepper dan kunci MAC, penyimpanan akun, Turnstile) -> IP klien
tepercaya (kosong di Vercel berarti 503) -> pembatas kasar per IP -> hash token Turnstile dicatat sekali pakai
sebelum siteverify -> siteverify (tenggat total TENGGAT_SITEVERIFY) -> pembatas per IP -> batas username unik yang
gagal per IP per hari -> pembatas kegagalan per (username ternormal + IP) -> kuota global percobaan per detik ->
baca akun (Worker) dan jangkar (Neon) -> periksa MAC, jangkar, aktif -> satu verifikasi argon2id (hash asli bila
baris sah, hash tiruan bila akun tidak ada atau tidak sah) -> sesi baru.
Semua operasi penyimpanan satu permintaan memakai satu koneksi DB (sesi_service.satu_koneksi).

Pembatas (IPv6 per prefiks /64), tanpa penguncian per akun (kegagalan dari IP lain tidak pernah menahan IP
pemilik akun):
- per IP kasar: BATAS_IP_KASAR, semua percobaan, dihitung sebelum siteverify;
- per IP: BATAS_IP, hanya percobaan yang lolos siteverify;
- per (username ternormal + IP): BATAS_GAGAL_USERNAME_IP, hanya kegagalan kredensial, dengan perkiraan jendela
  geser. Satu slot dipesan atomik sebelum akun dibaca dan dikembalikan bila hasilnya bukan kegagalan kredensial;
- hitungan gagal per (username ternormal + IP) tanpa jendela geser: di bawah ambang berumur UMUR_HITUNGAN_GAGAL
  sejak gagal terakhir; pada kegagalan ke-BATAS_GAGAL_USERNAME_IP naik menjadi penanda lengket berumur UMUR_PENANDA
  (selama kuota BATAS_PENANDA_LENGKET_HARIAN belum penuh), direset oleh login sukses dari IP itu. Kegagalan sampai
  ke-BATAS_GAGAL_USERNAME_IP dijawab sandi_salah, sesudahnya terlalu_banyak;
- username unik yang gagal per IP: BATAS_USERNAME_UNIK_IP per hari UTC;
- global: sesi_service.BATAS_GLOBAL_LOGIN verifikasi per detik;
- peringatan per username (log dan audit, tanpa memblokir) bila AMBANG_PERINGATAN_USERNAME kegagalan per jam.
Sandi lama yang salah di /akun/ubah-sandi dihitung pada pembatas (username + IP) yang sama dengan /masuk.

/siapkan-akun: GET menjawab {"tersedia": true, "jenis": "penyiapan"|"pemulihan"} hanya bila env
SAPA_KODE_PENYIAPAN ada, kodenya belum terpakai, dan tabel akun kosong (penyiapan), atau env SAPA_KODE_PEMULIHAN
ada, belum terpakai, dan sudah ada akun (pemulihan); selain itu 404 tanpa alasan. POST menukar kode dengan sandi
baru: bukti asal, isian ketat, pembatas per IP BATAS_SIAPKAN_IP, Turnstile action "sapa_siapkan_akun", kebijakan
sandi, kode dibandingkan waktu-konstan dengan semua kode env aktif, kode belum terpakai, HIBP (gagal tertutup),
lalu penyiapan (INSERT hanya bila tabel kosong, sekaligus menandai kode) atau pemulihan (ganti hash akun dengan
username yang cocok, versi_sandi+1, kode ditandai). Pemulihan tidak pernah membuat akun. Sesudah berhasil jangkar
dinaikkan dan semua sesi akun dicabut.

/akun/ubah-sandi: butuh sesi cookie dan bukti asal; sandi lama diverifikasi (berbatas), sandi baru lolos kebijakan
dan HIBP dan tidak sama dengan sandi lama; versi_sandi+1, jangkar naik, semua sesi akun (termasuk yang sedang
dipakai) dicabut, lalu satu sesi baru diterbitkan (id cookie berotasi).

Revalidasi sesi (muat_sesi, dipanggil middleware untuk setiap permintaan /api/ bercookie): baca baris akun dan
jangkar setiap permintaan tanpa cache; MAC tidak cocok, versi_sandi di bawah jangkar, akun nonaktif atau hilang,
atau versi_sandi sesi berbeda: sesi dihapus dan permintaan 401. MAC dan rollback dicatat di audit tanpa nilai.
Penyimpanan akun, DB sesi, atau kunci bermasalah: 503 tanpa menghapus sesi.

Setiap respons gagal memuat field `kode` yang stabil (lihat KODE). Jawaban /masuk untuk kegagalan kredensial
identik untuk akun ada, tidak ada, nonaktif, atau tidak utuh (status, body, header, satu argon2, urutan operasi).
Semua jawaban gagal ditahan minimal WAKTU_MINIMUM_GAGAL detik; bila lebih lama, dibulatkan ke atas ke kelipatan
LANGKAH_WAKTU_GAGAL. Sandi, kode, hash, username mentah, dan token tidak pernah dicatat; log dan audit hanya memuat
penanda HMAC username 12 karakter (ringkas_username), IP tersamar, dan kode hasil.
"""
from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import math
import re
import time
from dataclasses import dataclass
from datetime import timedelta
from typing import Callable, Optional

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

try:
    from . import akun_service, audit_log, sesi_service, turnstile
except ImportError:
    import akun_service
    import audit_log
    import sesi_service
    import turnstile

logger = logging.getLogger("sapa-api")

_NO_STORE = {"Cache-Control": "no-store"}
WAKTU_MINIMUM_GAGAL = 0.7
LANGKAH_WAKTU_GAGAL = 0.25
MAKS_BODY = 4096
_MAKS_USERNAME = 254
_MAKS_SANDI = akun_service.SANDI_MAKS
_MAKS_KODE = 256
_MAKS_SANDI_BARU_ISIAN = 512  # batas bentuk isian; kebijakan sandi baru lebih ketat (akun_service.SANDI_MAKS)
_FIELD_MASUK = {"username", "password", "ingat", "turnstile_token"}
_FIELD_SIAPKAN = {"username", "kode", "password_baru", "turnstile_token"}
_FIELD_UBAH = {"password_lama", "password_baru"}
_MAKS_TURNSTILE = 2048
# Token Turnstile berbentuk base64url bertitik. Pola ketat supaya varian token yang sama (spasi, karakter
# tak terlihat) tidak menghasilkan hash sekali pakai yang berbeda.
_POLA_TURNSTILE = re.compile(r"[A-Za-z0-9._-]{1,%d}" % _MAKS_TURNSTILE)
BATAS_IP_KASAR = (60, 60)
BATAS_IP = (60, 20)
BATAS_GAGAL_USERNAME_IP = (15 * 60, 10)
BATAS_GLOBAL = sesi_service.BATAS_GLOBAL_LOGIN
UMUR_HITUNGAN_GAGAL = timedelta(seconds=BATAS_GAGAL_USERNAME_IP[0])
UMUR_PENANDA = timedelta(days=30)
BATAS_USERNAME_UNIK_IP = (24 * 60 * 60, 50)  # username unik yang gagal per IP per hari
BATAS_PENANDA_LENGKET_HARIAN = (24 * 60 * 60, 1000)
KUNCI_PENANDA_LENGKET_HARIAN = "global:penanda-lengket-baru"
BATAS_SIAPKAN_IP = (60 * 60, 10)  # POST /siapkan-akun per IP per jam, semua percobaan
BATAS_LIHAT_SIAPKAN_IP = (60, 30)  # GET /siapkan-akun per IP per menit
TENGGAT_SITEVERIFY = turnstile.TENGGAT_SITEVERIFY
AMBANG_PERINGATAN_USERNAME = (60 * 60, 30)
UMUR_TURNSTILE = 300
SIMPAN_SIAP_DETIK = 30
_PERAN_ADMIN = {"admin", "super_admin"}
# Alasan penolakan baris akun yang dicatat di audit (tanpa nilai).
_ALASAN_AUDIT = {"integritas_gagal", "rollback_terdeteksi"}

PESAN_SALAH = "Nama pengguna atau kata sandi salah."
PESAN_TURNSTILE_GAGAL = "Verifikasi keamanan gagal. Ulangi centang."
PESAN_TURNSTILE_KEDALUWARSA = "Verifikasi keamanan sudah kedaluwarsa. Ulangi centang."
PESAN_SESI_BERAKHIR = "Sesi berakhir. Silakan masuk kembali."
PESAN_TERLALU_BANYAK = "Terlalu banyak percobaan. Coba lagi beberapa saat lagi."
PESAN_BELUM_SIAP = "Layanan masuk sedang tidak tersedia. Coba beberapa saat lagi."
PESAN_ISIAN = "Isian masuk tidak lengkap atau tidak sah."
PESAN_DITOLAK = "Permintaan ditolak. Muat ulang halaman lalu coba lagi."
PESAN_KELUAR_GAGAL = "Sesi belum dapat diakhiri. Coba lagi."
PESAN_KODE_SALAH = "Kode atau nama pengguna tidak cocok."
PESAN_TIDAK_TERSEDIA = "Halaman ini tidak tersedia."
PESAN_SANDI_LEMAH = ("Kata sandi baru harus 15 sampai 128 karakter dan tidak sama dengan nama pengguna atau kode.")
PESAN_SANDI_BOCOR = "Kata sandi ini pernah bocor di internet. Pilih kata sandi lain."
PESAN_SANDI_SAMA = "Kata sandi baru tidak boleh sama dengan kata sandi lama."
PESAN_SANDI_LAMA_SALAH = "Kata sandi lama salah."

# Kode galat stabil untuk frontend -> (status bawaan, pesan bawaan). Jangan mengganti nama kode yang ada.
KODE = {
    "sandi_salah": (401, PESAN_SALAH),
    "terlalu_banyak": (429, PESAN_TERLALU_BANYAK),
    "turnstile_gagal": (403, PESAN_TURNSTILE_GAGAL),
    "turnstile_kedaluwarsa": (403, PESAN_TURNSTILE_KEDALUWARSA),
    "belum_siap": (503, PESAN_BELUM_SIAP),
    "asal_tidak_sah": (403, PESAN_DITOLAK),
    "isian_tidak_sah": (400, PESAN_ISIAN),  # semua pelanggaran isian 400 dengan satu pesan
    "sesi_berakhir": (401, PESAN_SESI_BERAKHIR),
    "kode_salah": (403, PESAN_KODE_SALAH),
    "tidak_tersedia": (404, PESAN_TIDAK_TERSEDIA),
    "sandi_lemah": (400, PESAN_SANDI_LEMAH),
    "sandi_bocor": (400, PESAN_SANDI_BOCOR),
    "sandi_sama": (400, PESAN_SANDI_SAMA),
    "sandi_lama_salah": (401, PESAN_SANDI_LAMA_SALAH),
    "hibp_tidak_tersedia": (503, akun_service.PESAN_HIBP_TIDAK_TERSEDIA),
}


async def _tidur(detik: float) -> None:
    await asyncio.sleep(detik)


def _monoton() -> float:
    return time.monotonic()


class _Gagal(Exception):
    def __init__(self, kode: str, status: Optional[int] = None, pesan: Optional[str] = None):
        bawaan_status, bawaan_pesan = KODE[kode]
        super().__init__(kode)
        self.kode, self.status, self.pesan = kode, status or bawaan_status, pesan or bawaan_pesan


@dataclass
class SesiAktif:
    """Sesi cookie yang lolos revalidasi terhadap baris akun dan jangkar."""
    sesi: sesi_service.SesiLokal
    akun: akun_service.Akun


def normal_username(username: str) -> str:
    """Bentuk ternormal untuk kunci pembatas, penanda, dan pencarian akun: NFKC, trim, huruf kecil."""
    return akun_service.normal_username(username)


def ringkas_username(username: str) -> str:
    """Penanda log dan audit untuk username: 12 karakter HMAC berkunci server, bukan nilai mentah."""
    return sesi_service.jejak("username:" + normal_username(username))[:12]


def _id_tiruan(normal: str) -> str:
    """Id akun tiruan untuk membaca jangkar saat username tidak ada (operasi DB sama dengan akun yang ada)."""
    return "tiruan-" + sesi_service.jejak("akun-tiruan:" + normal)[:32]


def kunci_ip(ip: Optional[str]) -> str:
    """Kunci pembatas IP: IPv4 apa adanya, IPv6 per prefiks /64 (satu alokasi pelanggan)."""
    if not ip:
        return "tidak-diketahui"
    try:
        alamat = ipaddress.ip_address(ip)
    except ValueError:
        return "tidak-diketahui"
    if alamat.version == 6:
        if alamat.ipv4_mapped:
            return str(alamat.ipv4_mapped)
        return str(ipaddress.ip_network(f"{alamat}/64", strict=False))
    return str(alamat)


def permintaan_sah(request, asal_diizinkan) -> bool:
    """Penjaga CSRF untuk /masuk, /keluar, /siapkan-akun, /akun/ubah-sandi, dan setiap non-GET bercookie:
    X-SAPA: 1 dan bukti asal sendiri yang WAJIB ada.

    Lolos hanya bila Sec-Fetch-Site = same-origin, atau header itu tidak dikirim dan Origin termasuk
    asal_diizinkan. Origin asing, Sec-Fetch-Site selain same-origin (termasuk none), dan permintaan tanpa
    Origin maupun Sec-Fetch-Site ditolak.
    """
    h = request.headers
    if h.get("x-sapa") != "1":
        return False
    origin = h.get("origin")
    if origin and origin.rstrip("/") not in asal_diizinkan:
        return False
    situs = h.get("sec-fetch-site")
    if situs is not None:
        return situs == "same-origin"
    return bool(origin)


def waktu_tahan_gagal(durasi: float) -> float:
    """Total durasi jawaban gagal: minimal WAKTU_MINIMUM_GAGAL, di atasnya dibulatkan ke kelipatan langkah."""
    if durasi <= WAKTU_MINIMUM_GAGAL:
        return WAKTU_MINIMUM_GAGAL
    langkah = math.ceil(round((durasi - WAKTU_MINIMUM_GAGAL) / LANGKAH_WAKTU_GAGAL, 9))
    return WAKTU_MINIMUM_GAGAL + langkah * LANGKAH_WAKTU_GAGAL


def _teks(nilai, maks: int) -> str:
    if not isinstance(nilai, str) or len(nilai) > maks or not nilai.strip():
        raise _Gagal("isian_tidak_sah")
    if any(ord(c) < 32 for c in nilai):
        raise _Gagal("isian_tidak_sah")
    return nilai


def _sandi_isian(nilai, maks: int) -> str:
    """Sandi pada isian: teks tak kosong, paling panjang `maks`, tanpa karakter kontrol. Tidak dipotong."""
    if not isinstance(nilai, str) or not nilai or len(nilai) > maks or any(ord(c) < 32 for c in nilai):
        raise _Gagal("isian_tidak_sah")
    return nilai


def _token_turnstile(nilai) -> str:
    token = _teks(nilai, _MAKS_TURNSTILE)
    if not _POLA_TURNSTILE.fullmatch(token):
        raise _Gagal("turnstile_gagal")
    return token


async def _baca_json(request: Request) -> dict:
    if (request.headers.get("content-type") or "").split(";")[0].strip().lower() != "application/json":
        raise _Gagal("isian_tidak_sah")
    try:
        if int(request.headers.get("content-length") or 0) > MAKS_BODY:
            raise _Gagal("isian_tidak_sah")
    except ValueError:
        raise _Gagal("isian_tidak_sah") from None
    isi = bytearray()
    async for potong in request.stream():
        isi += potong
        if len(isi) > MAKS_BODY:
            raise _Gagal("isian_tidak_sah")
    try:
        body = json.loads(bytes(isi))
    except (ValueError, UnicodeDecodeError):
        raise _Gagal("isian_tidak_sah") from None
    if not isinstance(body, dict):
        raise _Gagal("isian_tidak_sah")
    return body


def _cookie(res: JSONResponse, nilai: str, ingat: bool) -> None:
    res.set_cookie(sesi_service.NAMA_COOKIE, nilai, max_age=int(sesi_service.UMUR_INGAT.total_seconds()) if ingat else None,
                   path="/", secure=True, httponly=True, samesite="strict")


def _hapus_cookie(res: JSONResponse) -> None:
    res.delete_cookie(sesi_service.NAMA_COOKIE, path="/", secure=True, httponly=True, samesite="strict")


def _jawab(status: int, isi: dict) -> JSONResponse:
    return JSONResponse(status_code=status, headers=_NO_STORE, content=isi)


def _jawab_gagal(gagal: _Gagal) -> JSONResponse:
    # Tanpa Retry-After: semua jawaban terlalu_banyak seragam.
    return _jawab(gagal.status, {"detail": gagal.pesan, "kode": gagal.kode})


def _detail_audit(catatan: dict, hasil: str) -> str:
    """Detail audit: hash username pendek, hasil/kode, dan peringatan. Tanpa nilai mentah."""
    bagian = [f"u={catatan['u']}"] if catatan.get("u") else []
    bagian.append(f"hasil={hasil}")
    for kunci in ("integritas", "peringatan"):
        if catatan.get(kunci):
            bagian.append(f"peringatan={catatan[kunci]}")
    return " ".join(bagian)


def _tandai_integritas(catatan: dict, alasan: Optional[str], jejak: str) -> None:
    if alasan in _ALASAN_AUDIT:
        catatan["integritas"] = alasan
        logger.error("Baris akun ditolak (%s): %s", alasan, jejak)


async def _naikkan_jangkar_bila_perlu(akun: akun_service.Akun, versi_min: int) -> None:
    """Baris sah berversi di atas jangkar menaikkan jangkar (menutup celah bila tulis jangkar sempat gagal)."""
    if akun.versi_sandi > versi_min:
        try:
            await sesi_service.naikkan_jangkar(akun.id, akun.versi_sandi)
        except sesi_service.SesiBelumSiap:
            logger.warning("Jangkar akun belum dapat dinaikkan saat dibaca")


async def muat_sesi(request: Request) -> None:
    """Baca dan revalidasi sesi cookie untuk permintaan ini; hasilnya di request.state.sapa_sesi (SesiAktif) atau
    request.state.sapa_sesi_galat (503). Dipanggil middleware sebelum dependency auth berjalan."""
    request.state.sapa_sesi = None
    request.state.sapa_sesi_galat = None
    cookie = request.cookies.get(sesi_service.NAMA_COOKIE)
    if not cookie:
        return
    try:
        sesi = await sesi_service.ambil_sesi_lokal(cookie, adalah_admin=lambda peran: peran in _PERAN_ADMIN)
        if sesi is None:
            return
        if not akun_service.kunci_siap():
            logger.error("Revalidasi sesi belum siap: pepper atau kunci MAC akun kosong")
            raise akun_service.AkunBelumSiap()
        akun = await akun_service.ambil_id(sesi.akun_id)
        versi_min = await sesi_service.baca_jangkar(sesi.akun_id)
        alasan = "tidak_ada" if akun is None else akun_service.periksa_akun(akun, versi_min)
        if alasan is None and akun.versi_sandi != sesi.versi_sandi:
            alasan = "versi_berubah"
        if alasan is not None:
            if alasan in _ALASAN_AUDIT:
                logger.error("Sesi ditolak saat revalidasi (%s)", alasan)
                request.state.audit_detail = f"peringatan={alasan}"
                request.state.audit_paksa = True
            await sesi_service.hapus_sesi_id(sesi.id_hash)
            return
        await _naikkan_jangkar_bila_perlu(akun, versi_min)
        request.state.sapa_sesi = SesiAktif(sesi=sesi, akun=akun)
    except (sesi_service.SesiBelumSiap, akun_service.AkunBelumSiap):
        request.state.sapa_sesi_galat = 503
    except Exception as exc:
        logger.error("Revalidasi sesi gagal tak terduga: %s", type(exc).__name__)
        request.state.sapa_sesi_galat = 503


def buat_router(*, ip_pengguna: Callable, label_peran: Callable, klaim_opsional: Callable,
                asal_diizinkan) -> APIRouter:
    """Router login lokal yang memakai fungsi auth api/index.py (disuntikkan agar tidak ada impor melingkar)."""
    router = APIRouter()

    simpanan_siap = {"waktu": None, "siap": False}

    async def _batas(kunci: str, aturan: tuple) -> None:
        try:
            lolos = await sesi_service.batas(kunci, *aturan)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if not lolos:
            raise _Gagal("terlalu_banyak")

    async def _kembalikan_slot(tiket: tuple) -> None:
        try:
            await sesi_service.kembalikan(tiket)
        except sesi_service.SesiBelumSiap:
            # Hitungan tetap lebih tinggi (lebih ketat), jadi aman dilewati.
            logger.warning("Slot pembatas kegagalan tidak dapat dikembalikan")

    async def _pesan_slot_gagal(kunci: str) -> sesi_service.HitunganGeser:
        """Pesan satu slot kegagalan per (username + IP) secara atomik; 429 bila jendela geser sudah penuh."""
        jendela, maks = BATAS_GAGAL_USERNAME_IP
        try:
            hasil = await sesi_service.hitung_geser(kunci, jendela)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if hasil.perkiraan > maks:
            await _kembalikan_slot(hasil.tiket)
            raise _Gagal("terlalu_banyak")
        return hasil

    async def _tambah_gagal_kumulatif(kunci: str) -> int:
        """Tambah hitungan gagal (username + IP). Penanda lengket baru dibatasi per hari untuk seluruh SAPA."""
        jendela, maks = BATAS_PENANDA_LENGKET_HARIAN
        ambang = BATAS_GAGAL_USERNAME_IP[1]
        try:
            boleh_lengket = await sesi_service.baca_hitungan(KUNCI_PENANDA_LENGKET_HARIAN, jendela) < maks
            jumlah = await sesi_service.tambah_gagal_kumulatif(
                kunci, UMUR_HITUNGAN_GAGAL, UMUR_PENANDA if boleh_lengket else UMUR_HITUNGAN_GAGAL, ambang)
            if jumlah == ambang:
                if boleh_lengket:
                    await sesi_service.hitung(KUNCI_PENANDA_LENGKET_HARIAN, jendela)
                else:
                    logger.warning("Kuota penanda lengket harian penuh; penanda baru hanya berumur %d menit",
                                   int(UMUR_HITUNGAN_GAGAL.total_seconds() // 60))
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        return jumlah

    async def _pesan_username_unik(kunci_gagal: str, ip: str) -> tuple[Optional[tuple], bool]:
        """Pesan satu tempat username unik yang gagal untuk IP ini hari ini; (tiket, lewat_batas).

        Hanya bergantung pada data SAPA, jadi sama untuk username yang ada dan tidak ada.
        """
        jendela, maks = BATAS_USERNAME_UNIK_IP
        try:
            if await sesi_service.ada_gagal_kumulatif(kunci_gagal):
                return None, False
            jumlah, tiket = await sesi_service.hitung(f"unik-gagal:ip:{kunci_ip(ip)}", jendela)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if jumlah > maks:
            await _kembalikan_slot(tiket)
            await _peringatkan_batas_username_unik(ip, jendela)
            return None, True
        return tiket, False

    async def _peringatkan_batas_username_unik(ip: str, jendela: int) -> None:
        try:
            jumlah, _ = await sesi_service.hitung(f"peringatan-unik:ip:{kunci_ip(ip)}", jendela)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if jumlah == 1:
            logger.warning("Batas %d username unik yang gagal per IP tercapai untuk IP %s; kegagalan berikutnya "
                           "hari ini dijawab terlalu_banyak", BATAS_USERNAME_UNIK_IP[1],
                           audit_log.mask_ip(ip, None) or "tidak-diketahui")

    async def _padamkan_penanda(kunci: str) -> None:
        try:
            await sesi_service.padamkan_penanda(kunci)
        except sesi_service.SesiBelumSiap:
            logger.warning("Penanda lengket tidak dapat dipadamkan")

    async def _catat_gagal_username(normal: str, jejak: str, catatan: dict) -> None:
        """Hitung kegagalan per username lintas IP untuk peringatan log dan audit (tidak memblokir)."""
        jendela, ambang = AMBANG_PERINGATAN_USERNAME
        try:
            hasil = await sesi_service.hitung_geser(f"gagal-jam:username:{normal}", jendela)
            if hasil.perkiraan < ambang:
                return
            pertama = await sesi_service.sekali_pakai(f"peringatan:username:{normal}:{hasil.tiket[1]}", 2 * jendela)
        except sesi_service.SesiBelumSiap:
            return
        if pertama:
            jumlah = math.floor(hasil.perkiraan)
            logger.warning("Peringatan: username %s mencapai %d login gagal dalam satu jam (tidak diblokir)",
                           jejak, jumlah)
            catatan["peringatan"] = f"gagal_{jumlah}_per_jam"

    def _cek_konfigurasi(nama_jalur: str) -> None:
        kurang = [nama for nama, siap in (("kunci", sesi_service.kunci_siap()), ("db", sesi_service.store() is not None),
                                          ("akun", akun_service.konfigurasi_siap()),
                                          ("turnstile", bool(turnstile.kunci_rahasia()))) if not siap]
        if kurang:
            logger.error("%s belum siap: %s", nama_jalur, ",".join(kurang))
            raise _Gagal("belum_siap")

    def _ip_wajib(request: Request) -> str:
        ip = ip_pengguna(request)
        if not ip:
            logger.error("IP klien tepercaya tidak tersedia; permintaan ditolak (periksa header Vercel)")
            raise _Gagal("belum_siap")
        return ip

    async def _turnstile(token: str, ip: str, aksi: str, jejak: str) -> None:
        # Hash token dicatat sebelum siteverify, jadi kiriman ganda tidak sampai ke Cloudflare.
        try:
            pertama = await sesi_service.sekali_pakai(f"turnstile:{token}", UMUR_TURNSTILE)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        if not pertama:
            logger.info("Token Turnstile dipakai ulang: %s", jejak)
            raise _Gagal("turnstile_kedaluwarsa")
        try:
            await asyncio.wait_for(turnstile.cek_turnstile_async(token, ip, aksi), TENGGAT_SITEVERIFY)
        except asyncio.TimeoutError:
            logger.warning("Cloudflare Turnstile melewati tenggat total %s detik", TENGGAT_SITEVERIFY)
            raise _Gagal("belum_siap") from None
        except turnstile.TurnstileGagal as exc:
            if exc.status == 503:
                raise _Gagal("belum_siap") from None
            kedaluwarsa = exc.alasan == turnstile.ALASAN_KEDALUWARSA
            raise _Gagal("turnstile_kedaluwarsa" if kedaluwarsa else "turnstile_gagal") from None

    async def _baca_akun(normal: str) -> tuple[Optional[akun_service.Akun], Optional[str], int]:
        """(akun, alasan tidak sah, versi_min). Jangkar selalu dibaca (id tiruan bila akun tidak ada)."""
        try:
            akun = await akun_service.ambil_username(normal)
            versi_min = await sesi_service.baca_jangkar(akun.id if akun is not None else _id_tiruan(normal))
            alasan = None if akun is None else akun_service.periksa_akun(akun, versi_min)
        except (akun_service.AkunBelumSiap, sesi_service.SesiBelumSiap):
            raise _Gagal("belum_siap") from None
        return akun, alasan, versi_min

    async def _cek_hibp(sandi: str) -> None:
        try:
            bocor = await akun_service.cek_bocor(sandi)
        except akun_service.HibpTidakTersedia:
            raise _Gagal("hibp_tidak_tersedia") from None
        if bocor:
            raise _Gagal("sandi_bocor")

    async def _cabut_dan_jangkar(akun: akun_service.Akun) -> None:
        """Sesudah tulis D1 berhasil: naikkan jangkar ke versi baru, lalu cabut semua sesi akun."""
        try:
            await sesi_service.naikkan_jangkar(akun.id, akun.versi_sandi)
            await sesi_service.hapus_semua_sesi_user(sesi_service.SUB_AWALAN + akun.id)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None

    async def _tangani(request: Request, catatan: dict, proses):
        """Jalankan `proses` dalam satu koneksi DB; galat menjadi respons gagal yang ditahan waktu minimum."""
        mulai = _monoton()
        sesi_service.pasang_executor_dns()
        try:
            async with sesi_service.satu_koneksi():
                return await proses(request, catatan), None
        except Exception as exc:
            if isinstance(exc, _Gagal):
                gagal = exc
            elif isinstance(exc, (akun_service.AkunBelumSiap, sesi_service.SesiBelumSiap)):
                gagal = _Gagal("belum_siap")
            else:
                # Jaring pengaman: galat tak terduga tetap 503 seragam, tanpa rincian atau isian di log.
                logger.error("%s gagal tak terduga: %s", request.url.path, type(exc).__name__)
                gagal = _Gagal("belum_siap")
            durasi = _monoton() - mulai
            sisa = waktu_tahan_gagal(durasi) - durasi
            if sisa > 0:
                await _tidur(sisa)
            if durasi > WAKTU_MINIMUM_GAGAL:
                logger.warning("Durasi gagal %d ms melewati batas minimum %d ms (kode %s)",
                               round(durasi * 1000), round(WAKTU_MINIMUM_GAGAL * 1000), gagal.kode)
            request.state.audit_detail = _detail_audit(catatan, gagal.kode)
            return None, _jawab_gagal(gagal)

    # --- /masuk ----------------------------------------------------------------------------------

    async def _proses_masuk(request: Request, catatan: dict):
        # Sandi tidak boleh lewat URL: query string apa pun ditolak.
        if request.url.query:
            raise _Gagal("isian_tidak_sah")
        if not permintaan_sah(request, asal_diizinkan):
            raise _Gagal("asal_tidak_sah")
        body = await _baca_json(request)
        if set(body) - _FIELD_MASUK:
            raise _Gagal("isian_tidak_sah")
        username = _teks(body.get("username"), _MAKS_USERNAME).strip()
        password = _sandi_isian(body.get("password"), _MAKS_SANDI)
        token_turnstile = _token_turnstile(body.get("turnstile_token"))
        ingat = body.get("ingat")
        if not isinstance(ingat, bool):
            raise _Gagal("isian_tidak_sah")
        normal = normal_username(username)
        jejak = ringkas_username(username)
        catatan["u"] = jejak

        _cek_konfigurasi("Login lokal")
        ip = _ip_wajib(request)
        # Batas kasar dihitung sebelum Turnstile; batas 20/menit dihitung setelah siteverify.
        await _batas(f"ip-kasar:{kunci_ip(ip)}", BATAS_IP_KASAR)
        await _turnstile(token_turnstile, ip, turnstile.AKSI_MASUK, jejak)
        await _batas(f"ip:{kunci_ip(ip)}", BATAS_IP)

        kunci_gagal = f"gagal:username:{normal}|ip:{kunci_ip(ip)}"
        kredensial_salah = False
        tiket_unik, lewat_batas_unik = await _pesan_username_unik(kunci_gagal, ip)
        try:
            slot = await _pesan_slot_gagal(kunci_gagal)
        except _Gagal:
            if tiket_unik is not None:
                await _kembalikan_slot(tiket_unik)
            raise
        try:
            await _batas(sesi_service.KUNCI_GLOBAL_LOGIN, BATAS_GLOBAL)
            akun, alasan, versi_min = await _baca_akun(normal)
            # Tepat satu verifikasi argon2 untuk setiap kondisi: hash asli bila baris sah, tiruan bila tidak.
            if akun is not None and alasan is None:
                cocok = await run_in_threadpool(akun_service.cocokkan_sandi, akun.hash, password)
            else:
                cocok = await run_in_threadpool(akun_service.cocokkan_palsu, password)
            _tandai_integritas(catatan, alasan, jejak)
            if not cocok:
                kredensial_salah = True
                if lewat_batas_unik:
                    logger.info("Masuk ditolak (batas username unik per IP): %s", jejak)
                    raise _Gagal("terlalu_banyak")
                await _catat_gagal_username(normal, jejak, catatan)
                jumlah = await _tambah_gagal_kumulatif(kunci_gagal)
                if jumlah > BATAS_GAGAL_USERNAME_IP[1]:
                    logger.info("Masuk ditolak (penanda lengket): %s", jejak)
                    raise _Gagal("terlalu_banyak")
                logger.info("Masuk ditolak (kredensial): %s", jejak)
                raise _Gagal("sandi_salah")
        finally:
            # Hanya kegagalan kredensial yang dihitung; sukses dan kegagalan lain mengembalikan slot dan tempat
            # username unik.
            if not kredensial_salah:
                await _kembalikan_slot(slot.tiket)
                if tiket_unik is not None:
                    await _kembalikan_slot(tiket_unik)
        # Login sukses dari IP ini mereset hitungan kumulatif dan penanda lengket (username + IP).
        await _padamkan_penanda(kunci_gagal)
        await _naikkan_jangkar_bila_perlu(akun, versi_min)
        try:
            cookie = await sesi_service.buat_sesi_lokal(akun.id, akun.versi_sandi, akun.username, akun.peran, ingat)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        # Sesi lama di browser yang sama diakhiri, supaya setiap login memakai id baru.
        lama = request.cookies.get(sesi_service.NAMA_COOKIE)
        if lama:
            try:
                await sesi_service.hapus_sesi(lama)
            except sesi_service.SesiBelumSiap:
                pass
        logger.info("Masuk berhasil: %s", jejak)
        return akun, cookie, ingat

    @router.post("/api/v1/auth/masuk")
    async def masuk(request: Request):
        catatan: dict = {}
        hasil, gagal = await _tangani(request, catatan, _proses_masuk)
        if gagal is not None:
            return gagal
        akun, cookie, ingat = hasil
        request.state.audit_claims = {"sub": sesi_service.SUB_AWALAN + akun.id}
        request.state.audit_detail = _detail_audit(catatan, "berhasil")
        res = _jawab(200, {"masuk": True, "peran": akun.peran})
        _cookie(res, cookie, ingat)
        return res

    # --- /sesi, /keluar --------------------------------------------------------------------------

    @router.get("/api/v1/auth/sesi")
    async def sesi(request: Request):
        aktif = getattr(request.state, "sapa_sesi", None)
        if getattr(request.state, "sapa_sesi_galat", None):
            # DB sesi, penyimpanan akun, atau kunci bermasalah bukan berarti tidak masuk. Cookie dibiarkan.
            return _jawab_gagal(_Gagal("belum_siap"))
        if aktif is None:
            if request.cookies.get(sesi_service.NAMA_COOKIE):
                res = _jawab(200, {"masuk": False, "kode": "sesi_berakhir"})
                _hapus_cookie(res)
                return res
            return _jawab(200, {"masuk": False})
        return _jawab(200, {"masuk": True, "peran": aktif.akun.peran, "nama": aktif.akun.username})

    @router.post("/api/v1/auth/keluar")
    async def keluar(request: Request):
        if not permintaan_sah(request, asal_diizinkan):
            return _jawab_gagal(_Gagal("asal_tidak_sah"))
        aktif = getattr(request.state, "sapa_sesi", None)
        if aktif is not None:
            request.state.audit_claims = {"sub": aktif.sesi.sub}
        cookie = request.cookies.get(sesi_service.NAMA_COOKIE)
        if cookie:
            try:
                await sesi_service.hapus_sesi(cookie)
            except sesi_service.SesiBelumSiap:
                return _jawab_gagal(_Gagal("belum_siap", pesan=PESAN_KELUAR_GAGAL))
        res = _jawab(200, {"keluar": True})
        _hapus_cookie(res)
        # Browser juga membuang cookie dan penyimpanan lain milik asal ini.
        # Tinjau ulang bila SAPA kelak memakai domain bersama: "cookies" berlaku untuk seluruh domain
        # terdaftar (eTLD+1), jadi bisa ikut menghapus cookie aplikasi lain di domain itu.
        res.headers["Clear-Site-Data"] = '"cookies", "storage"'
        return res

    # --- /siap -----------------------------------------------------------------------------------

    async def _cek_lengkap() -> dict:
        cek = await sesi_service.cek_kesiapan()
        cek["akun"] = akun_service.konfigurasi_siap()
        cek["turnstile"] = bool(turnstile.kunci_rahasia())
        return cek

    @router.get("/api/v1/auth/siap")
    async def siap(request: Request):
        # Rincian hanya untuk Super Admin (selalu segar); tanpa login cukup satu nilai siap/tidak yang
        # disimpan sementara SIMPAN_SIAP_DETIK, supaya permintaan anonim tidak membebani DB.
        klaim: Optional[dict] = await run_in_threadpool(klaim_opsional, request)
        if klaim and label_peran(klaim) == "super_admin":
            cek = await _cek_lengkap()
            return _jawab(200, {"siap": all(cek.values()), "cek": cek})
        sekarang = _monoton()
        if simpanan_siap["waktu"] is None or sekarang - simpanan_siap["waktu"] >= SIMPAN_SIAP_DETIK:
            simpanan_siap.update(waktu=sekarang, siap=all((await _cek_lengkap()).values()))
        return _jawab(200, {"siap": simpanan_siap["siap"]})

    # --- /siapkan-akun ---------------------------------------------------------------------------

    async def _jenis_tersedia(aktif: dict) -> Optional[str]:
        """Jenis penukaran yang tersedia sekarang, atau None. AkunBelumSiap bila Worker tidak terjangkau."""
        jumlah = None
        if "penyiapan" in aktif and not await akun_service.kode_terpakai(akun_service.hash_kode(aktif["penyiapan"])):
            jumlah = await akun_service.jumlah()
            if jumlah == 0:
                return "penyiapan"
        if "pemulihan" in aktif and not await akun_service.kode_terpakai(akun_service.hash_kode(aktif["pemulihan"])):
            if jumlah is None:
                jumlah = await akun_service.jumlah()
            if jumlah > 0:
                return "pemulihan"
        return None

    @router.get("/api/v1/auth/siapkan-akun")
    async def lihat_siapkan_akun(request: Request):
        aktif = akun_service.kode_env()
        if not aktif:
            return _jawab_gagal(_Gagal("tidak_tersedia"))
        try:
            ip = _ip_wajib(request)
            async with sesi_service.satu_koneksi():
                await _batas(f"siapkan-lihat:ip:{kunci_ip(ip)}", BATAS_LIHAT_SIAPKAN_IP)
            if not akun_service.konfigurasi_siap():
                raise _Gagal("belum_siap")
            jenis = await _jenis_tersedia(aktif)
        except _Gagal as gagal:
            return _jawab_gagal(gagal)
        except akun_service.AkunBelumSiap:
            return _jawab_gagal(_Gagal("belum_siap"))
        if jenis is None:
            return _jawab_gagal(_Gagal("tidak_tersedia"))
        return _jawab(200, {"tersedia": True, "jenis": jenis})

    async def _proses_siapkan(request: Request, catatan: dict):
        if request.url.query:
            raise _Gagal("isian_tidak_sah")
        if not permintaan_sah(request, asal_diizinkan):
            raise _Gagal("asal_tidak_sah")
        body = await _baca_json(request)
        if set(body) != _FIELD_SIAPKAN:
            raise _Gagal("isian_tidak_sah")
        username = _teks(body["username"], _MAKS_USERNAME).strip()
        normal = normal_username(username)
        if not akun_service.username_sah(normal):
            raise _Gagal("isian_tidak_sah")
        kode = _teks(body["kode"], _MAKS_KODE)
        sandi_baru = _sandi_isian(body["password_baru"], _MAKS_SANDI_BARU_ISIAN)
        token_turnstile = _token_turnstile(body["turnstile_token"])
        jejak = ringkas_username(normal)
        catatan["u"] = jejak

        aktif = akun_service.kode_env()
        if not aktif:
            raise _Gagal("tidak_tersedia")
        _cek_konfigurasi("Penyiapan akun")
        ip = _ip_wajib(request)
        # Semua percobaan dihitung (sebelum Turnstile), termasuk kode yang salah.
        await _batas(f"siapkan:ip:{kunci_ip(ip)}", BATAS_SIAPKAN_IP)
        await _turnstile(token_turnstile, ip, turnstile.AKSI_SIAPKAN_AKUN, jejak)
        if akun_service.kebijakan_sandi(sandi_baru, larangan=(normal, username, kode)):
            raise _Gagal("sandi_lemah")
        jenis = akun_service.cocok_kode(kode, aktif)
        if jenis is None:
            logger.warning("Kode penyiapan atau pemulihan salah: %s", jejak)
            raise _Gagal("kode_salah")
        hash_kode = akun_service.hash_kode(kode)
        if await akun_service.kode_terpakai(hash_kode):
            raise _Gagal("tidak_tersedia")
        akun_lama = None
        if jenis == "penyiapan":
            if await akun_service.jumlah() != 0:
                raise _Gagal("tidak_tersedia")
        else:
            # Pemulihan tidak tersedia selama belum ada akun (pemulihan tidak pernah membuat akun).
            if await akun_service.jumlah() == 0:
                raise _Gagal("tidak_tersedia")
            akun_lama, alasan, _ = await _baca_akun(normal)
            _tandai_integritas(catatan, alasan, jejak)
            if akun_lama is None or alasan in _ALASAN_AUDIT:
                # Pemulihan hanya mengganti hash akun yang sudah ada, utuh, dan cocok username-nya.
                raise _Gagal("kode_salah")
        await _cek_hibp(sandi_baru)
        if jenis == "penyiapan":
            akun = await run_in_threadpool(akun_service.akun_baru, normal, sandi_baru)
            if not await akun_service.sisip_pertama(akun, hash_kode):
                raise _Gagal("tidak_tersedia")
        else:
            hash_baru = await run_in_threadpool(akun_service.hash_sandi, sandi_baru)
            akun = await akun_service.ganti_hash(akun_lama, hash_baru, hash_kode, "pemulihan")
            if akun is None:
                raise _Gagal("tidak_tersedia")
        await _cabut_dan_jangkar(akun)
        logger.warning("Akun %s lewat kode %s: %s", "disiapkan" if jenis == "penyiapan" else "dipulihkan", jenis, jejak)
        return jenis

    @router.post("/api/v1/auth/siapkan-akun")
    async def siapkan_akun(request: Request):
        catatan: dict = {}
        jenis, gagal = await _tangani(request, catatan, _proses_siapkan)
        if gagal is not None:
            return gagal
        request.state.audit_detail = _detail_audit(catatan, jenis)
        return _jawab(201, {"siap": True})

    # --- /akun/ubah-sandi ------------------------------------------------------------------------

    async def _proses_ubah_sandi(request: Request, catatan: dict):
        if request.url.query:
            raise _Gagal("isian_tidak_sah")
        if not permintaan_sah(request, asal_diizinkan):
            raise _Gagal("asal_tidak_sah")
        if getattr(request.state, "sapa_sesi_galat", None):
            raise _Gagal("belum_siap")
        aktif: Optional[SesiAktif] = getattr(request.state, "sapa_sesi", None)
        if aktif is None:
            raise _Gagal("sesi_berakhir")
        request.state.audit_claims = {"sub": aktif.sesi.sub}
        body = await _baca_json(request)
        if set(body) != _FIELD_UBAH:
            raise _Gagal("isian_tidak_sah")
        lama = _sandi_isian(body["password_lama"], _MAKS_SANDI)
        baru = _sandi_isian(body["password_baru"], _MAKS_SANDI_BARU_ISIAN)
        akun = aktif.akun
        jejak = ringkas_username(akun.username)
        catatan["u"] = jejak
        _cek_konfigurasi("Ubah sandi")
        ip = _ip_wajib(request)
        await _batas(f"ip-kasar:{kunci_ip(ip)}", BATAS_IP_KASAR)
        if akun_service.kebijakan_sandi(baru, larangan=(akun.username,)):
            raise _Gagal("sandi_lemah")
        # Sandi lama yang salah dihitung pada pembatas kegagalan (username + IP) yang sama dengan /masuk.
        kunci_gagal = f"gagal:username:{akun.username}|ip:{kunci_ip(ip)}"
        slot = await _pesan_slot_gagal(kunci_gagal)
        kredensial_salah = False
        try:
            await _batas(sesi_service.KUNCI_GLOBAL_LOGIN, BATAS_GLOBAL)
            if not await run_in_threadpool(akun_service.cocokkan_sandi, akun.hash, lama):
                kredensial_salah = True
                jumlah = await _tambah_gagal_kumulatif(kunci_gagal)
                if jumlah > BATAS_GAGAL_USERNAME_IP[1]:
                    raise _Gagal("terlalu_banyak")
                raise _Gagal("sandi_lama_salah")
        finally:
            if not kredensial_salah:
                await _kembalikan_slot(slot.tiket)
        await _padamkan_penanda(kunci_gagal)
        if akun_service.sama_sandi(lama, baru):
            raise _Gagal("sandi_sama")
        await _cek_hibp(baru)
        hash_baru = await run_in_threadpool(akun_service.hash_sandi, baru)
        akun_baru = await akun_service.ganti_hash(akun, hash_baru)
        if akun_baru is None:
            # Baris berubah sejak dibaca (permintaan lain); tidak ada yang ditimpa.
            raise _Gagal("belum_siap")
        await _cabut_dan_jangkar(akun_baru)
        try:
            cookie = await sesi_service.buat_sesi_lokal(akun_baru.id, akun_baru.versi_sandi, akun_baru.username,
                                                        akun_baru.peran, aktif.sesi.ingat)
        except sesi_service.SesiBelumSiap:
            raise _Gagal("belum_siap") from None
        logger.warning("Sandi akun diubah; semua sesi akun dicabut: %s", jejak)
        return cookie, aktif.sesi.ingat

    @router.post("/api/v1/akun/ubah-sandi")
    async def ubah_sandi(request: Request):
        catatan: dict = {}
        hasil, gagal = await _tangani(request, catatan, _proses_ubah_sandi)
        if gagal is not None:
            return gagal
        cookie, ingat = hasil
        request.state.audit_detail = _detail_audit(catatan, "sandi_diubah")
        res = _jawab(200, {"diubah": True})
        _cookie(res, cookie, ingat)
        return res

    return router
