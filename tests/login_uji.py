"""Perlengkapan tes login lokal (SAPA_LOGIN_BFF=1): akun di penyimpanan memori, sesi di memori, Turnstile dan
HIBP palsu. Tidak ada jaringan; semua nilai rahasia di sini palsu dan hanya untuk tes.
"""
import asyncio
import base64
import hashlib
import itertools
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from test_api_auth import load_api

SANDI = "Sandi-Uji-Panjang-Sekali-42!"
SANDI_SALAH = "Sandi-Salah-Panjang-Sekali-7?"
USERNAME = "admin@contoh.invalid"
IP_ASLI = "198.51.100.7"
IP_PALSU = "1.2.3.4"
KUNCI_A = base64.b64encode(b"a" * 32).decode()
KUNCI_B = base64.b64encode(b"b" * 32).decode()
PEPPER = base64.b64encode(b"p" * 32).decode()
KUNCI_MAC = base64.b64encode(b"m" * 32).decode()
KODE_PENYIAPAN = "kode-penyiapan-uji-" + "x" * 32
KODE_PEMULIHAN = "kode-pemulihan-uji-" + "y" * 32
COOKIE = "__Host-sapa_sesi"
ASAL = "https://sapa-yanfaskes.vercel.app"
PESAN_SALAH = "Nama pengguna atau kata sandi salah."
SALAH = {"detail": PESAN_SALAH, "kode": "sandi_salah"}
ISIAN = {"detail": "Isian masuk tidak lengkap atau tidak sah.", "kode": "isian_tidak_sah"}
TERLALU_BANYAK = {"detail": "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.", "kode": "terlalu_banyak"}
PESAN_FITUR = "Fitur ini belum tersedia di sistem akun baru."

ENV = {
    "AUTH0_DOMAIN": "sapa.test.auth0.com",
    "SAPA_LOGIN_BFF": "1",
    "TURNSTILE_SECRET_KEY": "kunci-turnstile-uji",
    "SAPA_SESI_KUNCI": KUNCI_A,
    "SAPA_AKUN_PEPPER": PEPPER,
    "SAPA_AKUN_KUNCI_MAC": KUNCI_MAC,
    "APP_ORIGINS": ASAL,
    "VERCEL": "1",  # header IP Vercel hanya dipercaya saat berjalan di Vercel
}
_ENV_LAIN = ("SAPA_LOGIN_BFF", "SAPA_SESI_KUNCI", "SAPA_SESI_KUNCI_LAMA", "SAPA_SESI_DATABASE_URL",
             "SAPA_SESI_IDLE_MENIT", "SAPA_SESI_TANPA_INGAT_JAM", "TURNSTILE_SECRET_KEY", "APP_ORIGINS", "VERCEL",
             "VERCEL_ENV", "SAPA_SESI_IDLE_ADMIN_MENIT", "SAPA_AKUN_PEPPER", "SAPA_AKUN_KUNCI_MAC", "SAPA_AKUN_HMAC",
             "SAPA_AKUN_WORKER_URL", "SAPA_KODE_PENYIAPAN", "SAPA_KODE_PEMULIHAN", "SAPA_SKEMA_MANUAL",
             "AUTH0_LOGIN_CLIENT_ID", "AUTH0_LOGIN_CLIENT_SECRET", "AUTH0_LOGIN_REALM", "SAPA_TERIMA_BEARER")

# Parameter argon2 murah supaya tes cepat; parameter produksi diuji tersendiri tanpa fixture ini.
ARGON2_UJI = {"ARGON2_MEMORI": 64, "ARGON2_WAKTU": 1, "ARGON2_PARALEL": 1}


class Jam:
    def __init__(self):
        # Awal jendela menit dan 15 menit, supaya hitungan pembatas tidak terbelah batas jendela.
        self.waktu = datetime(2026, 11, 19, 1, 0, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.waktu

    def maju(self, **selisih):
        self.waktu += timedelta(**selisih)


class CloudflarePalsu:
    def __init__(self, ts):
        self.ts = ts
        self.jawaban = {"success": True, "hostname": "sapa-yanfaskes.vercel.app", "action": ts.AKSI_MASUK}
        self.gagal = False
        self.kiriman = []

    def __call__(self, url, data=None, timeout=None):
        self.kiriman.append((url, dict(data or {})))
        if self.gagal:
            raise self.ts.requests.ConnectionError("tidak terjangkau")
        jawaban = dict(self.jawaban)

        class Jawaban:
            status_code = 200

            def json(_):
                return jawaban
        return Jawaban()


def transport_cloudflare(cf, tunda=0.0):
    """Transport httpx palsu untuk siteverify async. Action dijawab sesuai yang diminta formulir bila
    `cf.jawaban` tidak menetapkan action lain (lihat CloudflarePalsu.aksi)."""
    from urllib.parse import parse_qsl

    async def tangani(permintaan):
        if tunda:
            await asyncio.sleep(tunda)
        try:
            jawaban = cf(str(permintaan.url), data=dict(parse_qsl(permintaan.content.decode())))
        except cf.ts.requests.ConnectionError:
            raise httpx.ConnectError("tidak terjangkau", request=permintaan) from None
        return httpx.Response(jawaban.status_code, json=jawaban.json())
    return httpx.MockTransport(tangani)


def pasang_cloudflare(monkeypatch, ts, cf, tunda=0.0):
    asli = getattr(ts._klien_siteverify, "asli", ts._klien_siteverify)

    def klien():
        return asli(transport=transport_cloudflare(cf, tunda))
    klien.asli = asli
    monkeypatch.setattr(ts, "_klien_siteverify", klien)


class HibpPalsu:
    """api.pwnedpasswords.com/range palsu: daftar akhiran berpadding; `bocor` berisi sandi yang dianggap bocor."""

    def __init__(self):
        self.bocor = set()
        self.mati = False
        self.status = 200
        self.isi = None  # teks jawaban paksa (mis. halaman HTML) menggantikan daftar akhiran
        self.permintaan = []

    def transport(self):
        def tangani(permintaan):
            self.permintaan.append(permintaan)
            if self.mati:
                raise httpx.ConnectError("tidak terjangkau", request=permintaan)
            if self.isi is not None:
                return httpx.Response(self.status, text=self.isi)
            awalan = permintaan.url.path.rsplit("/", 1)[-1].upper()
            baris = [f"{'0' * 35}:0", f"{'F' * 35}:3"]  # padding dan akhiran lain
            for sandi in self.bocor:
                sha1 = hashlib.sha1(sandi.encode("utf-8")).hexdigest().upper()
                if sha1.startswith(awalan):
                    baris.append(f"{sha1[5:]}:12")
            return httpx.Response(self.status, text="\r\n".join(baris))
        return httpx.MockTransport(tangani)


class AkunPerekam:
    """Bungkus penyimpanan akun memori; setiap operasi dicatat (nama operasi saja, tanpa nilai)."""

    def __init__(self, asli):
        self._asli = asli
        self.panggilan = []
        self.gagal = None  # Exception yang dilempar setiap operasi (Worker tidak terjangkau)

    def __getattr__(self, nama):
        nilai = getattr(self._asli, nama)
        if nama.startswith("_") or not asyncio.iscoroutinefunction(nilai):
            return nilai

        async def rekam(*a, **k):
            self.panggilan.append(nama)
            if self.gagal is not None:
                raise self.gagal
            return await nilai(*a, **k)
        return rekam


_URUT = itertools.count()


def kredensial(**ubah):
    # Token Turnstile sekali pakai, jadi setiap percobaan memakai token baru.
    body = {"username": USERNAME, "password": SANDI, "ingat": False, "turnstile_token": f"jawaban-turnstile-{next(_URUT)}"}
    body.update(ubah)
    return body


def isian_siapkan(**ubah):
    body = {"username": USERNAME, "kode": KODE_PENYIAPAN, "password_baru": SANDI,
            "turnstile_token": f"jawaban-turnstile-{next(_URUT)}"}
    body.update(ubah)
    return body


# /masuk wajib membawa bukti asal (Origin sendiri atau Sec-Fetch-Site: same-origin), seperti browser sungguhan.
HEADER = {"X-SAPA": "1", "Origin": ASAL, "x-vercel-forwarded-for": IP_ASLI, "X-Forwarded-For": IP_PALSU}
ASAL_SENDIRI = {"X-SAPA": "1", "Origin": ASAL}


def klien_uji(api):
    # Di Vercel setiap permintaan membawa x-vercel-forwarded-for; tes yang butuh header itu kosong mengisinya "".
    return TestClient(api.app, base_url="https://testserver", raise_server_exceptions=False,
                      headers={"x-vercel-forwarded-for": IP_ASLI})


def masuk(b, header=None, client=None, **ubah):
    return (client or b.client).post("/api/v1/auth/masuk", json=kredensial(**ubah), headers={**HEADER, **(header or {})})


def siapkan(b, header=None, client=None, **ubah):
    return (client or b.client).post("/api/v1/auth/siapkan-akun", json=isian_siapkan(**ubah),
                                     headers={**HEADER, **(header or {})})


def ubah_sandi(b, lama=SANDI, baru="Sandi-Baru-Yang-Panjang-2026", header=None, client=None):
    return (client or b.client).post("/api/v1/akun/ubah-sandi", json={"password_lama": lama, "password_baru": baru},
                                     headers={**ASAL_SENDIRI, **(header or {})})


def browser_lain(b):
    return klien_uji(b.api)


def set_cookie(res):
    return [v for k, v in res.headers.multi_items() if k == "set-cookie" and v.startswith(COOKIE + "=")]


def nilai_cookie(res):
    return set_cookie(res)[0].split(";")[0].split("=", 1)[1]


def catat_audit(monkeypatch):
    import audit_log
    tercatat = []

    async def tulis(entry):
        tercatat.append(entry)
    monkeypatch.setattr(audit_log, "write_entry", tulis)
    return tercatat


def murahkan_argon2(monkeypatch, ak):
    for nama, nilai in ARGON2_UJI.items():
        monkeypatch.setattr(ak, nama, nilai)


def tambah_akun(b, username=USERNAME, sandi=SANDI, peran="super_admin", aktif=1):
    """Sisipkan akun langsung ke penyimpanan memori (seolah sudah disiapkan); kembalikan barisnya."""
    akun = b.ak.akun_baru(b.ak.normal_username(username), sandi, peran=peran)
    if not aktif:
        akun = b.ak.dengan_mac(akun, aktif=0)
    b.akun_mentah.akun[akun.id] = b.ak.baris_dari(akun)
    asyncio.run(b.ss.naikkan_jangkar(akun.id, akun.versi_sandi))
    return akun


@pytest.fixture
def bff(monkeypatch):
    for nama in _ENV_LAIN:
        monkeypatch.delenv(nama, raising=False)

    def muat(akun_awal=True, **ubah):
        env = {**ENV, **ubah}
        for nama in [k for k, v in env.items() if v is None]:
            env.pop(nama)
            monkeypatch.delenv(nama, raising=False)
        api = load_api(monkeypatch, **env)
        ss, ab, ts, ak = api.sesi_service, api.auth_bff, api.turnstile, api.auth_bff.akun_service
        murahkan_argon2(monkeypatch, ak)
        jam = Jam()
        store = ss.MemorySesiStore()
        monkeypatch.setattr(ss, "_store", store)
        monkeypatch.setattr(ss, "_sekarang", jam)
        akun_mentah = ak.MemoryAkunStore()
        akun = AkunPerekam(akun_mentah)
        monkeypatch.setattr(ak, "_store", akun)
        verif = []
        asli_verif = ak._verifikasi

        def verifikasi(hash_phc, data):
            verif.append(hash_phc)
            return asli_verif(hash_phc, data)
        monkeypatch.setattr(ak, "_verifikasi", verifikasi)
        hibp = HibpPalsu()
        asli_hibp = getattr(ak._klien_hibp, "asli", ak._klien_hibp)

        def klien_hibp():
            return asli_hibp(transport=hibp.transport())
        klien_hibp.asli = asli_hibp
        monkeypatch.setattr(ak, "_klien_hibp", klien_hibp)
        cf = CloudflarePalsu(ts)
        monkeypatch.setattr(ts, "_kirim", cf)  # cek_turnstile sinkron (verifikasi manusia, flag 0)
        pasang_cloudflare(monkeypatch, ts, cf)
        tidur = []

        async def tidur_palsu(detik):
            tidur.append(detik)
        monkeypatch.setattr(ab, "_tidur", tidur_palsu)
        client = klien_uji(api)
        b = type("Bff", (), dict(api=api, ss=ss, ab=ab, ts=ts, ak=ak, jam=jam, store=store, akun=akun,
                                 akun_mentah=akun_mentah, cf=cf, tidur=tidur, client=client, verif=verif,
                                 hibp=hibp))
        b.utama = tambah_akun(b) if akun_awal else None
        return b
    return muat


# --- sesi lokal untuk tes lain (RBAC, audit) ---------------------------------------------------------

def pasang_login_lokal(api, monkeypatch):
    """Pasang penyimpanan memori dan kunci uji untuk jalur flag 1; kembalikan (penyimpanan sesi, akun)."""
    for nama, nilai in (("SAPA_SESI_KUNCI", KUNCI_A), ("SAPA_AKUN_PEPPER", PEPPER), ("SAPA_AKUN_KUNCI_MAC", KUNCI_MAC)):
        monkeypatch.setenv(nama, nilai)
    ss, ak = api.sesi_service, api.auth_bff.akun_service
    murahkan_argon2(monkeypatch, ak)
    sesi = ss.MemorySesiStore()
    akun = ak.MemoryAkunStore()
    monkeypatch.setattr(ss, "_store", sesi)
    monkeypatch.setattr(ak, "_store", akun)
    return sesi, akun


def kepala_sesi(api, monkeypatch, peran, username="pengguna.uji@contoh.invalid"):
    """Header Cookie dan bukti asal untuk sesi lokal sah dengan `peran` (akun memori baru)."""
    ss, ak = api.sesi_service, api.auth_bff.akun_service
    if not isinstance(ak._store, ak.MemoryAkunStore):
        pasang_login_lokal(api, monkeypatch)
    akun = ak.akun_baru(ak.normal_username(username), SANDI, peran=peran)
    ak._store.akun[akun.id] = ak.baris_dari(akun)
    cookie = asyncio.run(ss.buat_sesi_lokal(akun.id, akun.versi_sandi, akun.username, akun.peran, False))
    return {"Cookie": f"{COOKIE}={cookie}", **ASAL_SENDIRI}, ss.SUB_AWALAN + akun.id
