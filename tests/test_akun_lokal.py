"""Akun login lokal (flag SAPA_LOGIN_BFF=1): hash sandi, MAC baris, jangkar versi, penyiapan akun pertama,
pemulihan, ubah sandi, klien Worker ber-HMAC, dan penyusuran semua rute.

Penyimpanan akun memori (MemoryAkunStore) menggantikan Worker di tes alur; klien Worker diuji dengan Worker palsu
lewat httpx.MockTransport. HIBP dipalsukan. Semua nilai rahasia di sini palsu.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import re
import time
from pathlib import Path

import httpx
import pytest
from fastapi.routing import APIRoute

from login_uji import bff  # noqa: F401  (fixture)
from login_uji import (ASAL_SENDIRI, COOKIE, HEADER, KODE_PEMULIHAN, KODE_PENYIAPAN, PESAN_FITUR, SALAH, SANDI,
                       SANDI_SALAH, USERNAME, browser_lain, catat_audit, isian_siapkan, masuk, nilai_cookie,
                       set_cookie, siapkan, tambah_akun, ubah_sandi)
from test_api_auth import load_api

AKAR = Path(__file__).resolve().parents[1]
VEKTOR = AKAR / "workers" / "sapa-akun" / "test" / "vektor-tanda.json"
SANDI_BARU = "Sandi-Baru-Yang-Panjang-2026"
PESAN_HIBP = "Pemeriksaan keamanan sandi sedang tidak tersedia. Coba lagi beberapa saat lagi."


def _lihat(b, client=None):
    return (client or b.client).get("/api/v1/auth/siapkan-akun")


def _aksi(b, aksi):
    """Action yang dijawab Cloudflare palsu: "login" untuk /masuk, "sapa_siapkan_akun" untuk penyiapan."""
    b.cf.jawaban = {**b.cf.jawaban, "action": aksi}


# --- hash sandi, pepper, MAC baris -------------------------------------------------------------

def test_parameter_argon2id_produksi(monkeypatch):
    """Parameter bawaan modul (tanpa fixture yang memurahkan argon2): m=19456 KiB, t=2, p=1, PHC argon2id."""
    api = load_api(monkeypatch, SAPA_LOGIN_BFF="1", SAPA_AKUN_PEPPER=base64.b64encode(b"p" * 32).decode())
    ak = api.auth_bff.akun_service
    assert (ak.ARGON2_MEMORI, ak.ARGON2_WAKTU, ak.ARGON2_PARALEL) == (19456, 2, 1)
    phc = ak.hash_sandi(SANDI)
    assert phc.startswith("$argon2id$v=19$m=19456,t=2,p=1$")
    assert ak.cocokkan_sandi(phc, SANDI) and not ak.cocokkan_sandi(phc, SANDI_SALAH)
    assert ak.SANDI_MIN == 15


def test_hash_memakai_pepper_dari_env(bff, monkeypatch):
    b = bff()
    phc = b.ak.hash_sandi(SANDI)
    assert b.ak.cocokkan_sandi(phc, SANDI)
    monkeypatch.setenv("SAPA_AKUN_PEPPER", base64.b64encode(b"q" * 32).decode())
    # Pepper lain: hash yang sama tidak lagi cocok (pepper ikut menentukan masukan argon2).
    assert not b.ak.cocokkan_sandi(phc, SANDI)
    monkeypatch.delenv("SAPA_AKUN_PEPPER")
    with pytest.raises(b.ak.AkunBelumSiap):
        b.ak.hash_sandi(SANDI)


def test_hash_menormalkan_nfc(bff):
    b = bff()
    phc = b.ak.hash_sandi("Kata-sandi-café-panjang")
    assert b.ak.cocokkan_sandi(phc, "Kata-sandi-café-panjang")


def test_kanonik_mac_tidak_ambigu_dan_mencakup_semua_kolom(bff):
    b = bff()
    a = b.utama
    dasar = b.ak.hitung_mac(a.id, a.username, a.hash, a.peran, a.versi_sandi, a.aktif)
    assert dasar == a.mac and re.fullmatch(r"[0-9a-f]{64}", dasar)
    def lain(teks):
        return teks[:-1] + ("B" if teks[-1] == "A" else "A")
    for ubah in ({"username": a.username + "x"}, {"hash": lain(a.hash)}, {"peran": "admin"},
                 {"versi_sandi": a.versi_sandi + 1}, {"aktif": 0}, {"id": lain(a.id)}):
        isi = {"id": a.id, "username": a.username, "hash": a.hash, "peran": a.peran, "versi_sandi": a.versi_sandi,
               "aktif": a.aktif, **ubah}
        assert b.ak.hitung_mac(**isi) != dasar, ubah
    # Pemisah di dalam nilai tidak bisa menggeser batas kolom.
    assert b.ak.kanonik_mac("a", "b|c", "h", "p", 1, 1) != b.ak.kanonik_mac("a|b", "c", "h", "p", 1, 1)
    assert json.loads(b.ak.kanonik_mac("a", "b", "h", "p", 1, 1))["versi_sandi"] == 1


def test_kunci_mac_terpisah_dari_pepper(bff, monkeypatch):
    b = bff()
    mac = b.utama.mac
    monkeypatch.setenv("SAPA_AKUN_PEPPER", base64.b64encode(b"z" * 32).decode())
    assert b.ak.mac_sah(b.utama)
    monkeypatch.setenv("SAPA_AKUN_KUNCI_MAC", base64.b64encode(b"z" * 32).decode())
    assert not b.ak.mac_sah(b.utama) and b.utama.mac == mac


@pytest.mark.parametrize("kolom,nilai", [("hash", "ganti"), ("peran", "admin"), ("versi_sandi", 7), ("aktif", 0),
                                         ("username", "penyusup@contoh.invalid")])
def test_baris_diubah_langsung_di_db_login_401_dan_audit(bff, monkeypatch, kolom, nilai):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    baris = b.akun_mentah.akun[b.utama.id]
    if kolom == "hash":
        # Hash sandi lain yang sah formatnya, ditanam tanpa MAC yang benar.
        nilai = b.ak.hash_sandi("Sandi-Penyusup-Panjang-99")
    baris[kolom] = nilai
    username = nilai if kolom == "username" else USERNAME
    sandi = "Sandi-Penyusup-Panjang-99" if kolom == "hash" else SANDI
    res = masuk(b, username=username, password=sandi)
    assert res.status_code == 401 and res.json() == SALAH and set_cookie(res) == []
    [catatan] = [e for e in tercatat if e["action"] == "POST /api/v1/auth/masuk"]
    assert "peringatan=integritas_gagal" in catatan["target"]
    blob = json.dumps(tercatat)
    assert sandi not in blob and "$argon2" not in blob and baris["mac"] not in blob


@pytest.mark.parametrize("kolom,nilai", [("hash", "$argon2id$v=19$m=64,t=1,p=1$AAAA$BBBB"), ("peran", "admin"),
                                         ("versi_sandi", 9)])
def test_baris_diubah_langsung_di_db_revalidasi_401_dan_audit(bff, monkeypatch, kolom, nilai):
    b = bff()
    assert masuk(b).status_code == 200
    tercatat = catat_audit(monkeypatch)
    b.akun_mentah.akun[b.utama.id][kolom] = nilai
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 401 and res.json()["kode"] == "sesi_berakhir"
    assert any("peringatan=integritas_gagal" in e["target"] for e in tercatat)
    assert b.store.sesi == {}


@pytest.mark.parametrize("hapus", ["SAPA_AKUN_KUNCI_MAC", "SAPA_AKUN_PEPPER"])
def test_kunci_mac_atau_pepper_kosong_503(bff, monkeypatch, hapus):
    b = bff()
    assert masuk(b).status_code == 200
    monkeypatch.delenv(hapus)
    assert masuk(b).json()["kode"] == "belum_siap"
    if hapus == "SAPA_AKUN_KUNCI_MAC":
        assert b.client.get("/api/v1/akun/status").status_code == 503


# --- jangkar anti-rollback (Neon sesi) ----------------------------------------------------------

def _pulihkan_baris_lama(b, akun):
    """Seolah D1 dikembalikan ke salinan lama: baris versi lama dengan MAC yang sah untuk versi itu."""
    b.akun_mentah.akun[akun.id] = b.ak.baris_dari(akun)


def test_rollback_baris_lama_ditolak_login_dan_revalidasi(bff, monkeypatch):
    b = bff()
    lama = b.utama
    assert masuk(b).status_code == 200
    assert ubah_sandi(b).status_code == 200
    assert asyncio.run(b.ss.baca_jangkar(lama.id)) == lama.versi_sandi + 1
    tercatat = catat_audit(monkeypatch)
    _pulihkan_baris_lama(b, lama)
    # Sandi lama (benar untuk baris lama) tetap ditolak seragam.
    res = masuk(b, client=browser_lain(b))
    assert res.status_code == 401 and res.json() == SALAH
    assert any("peringatan=rollback_terdeteksi" in e["target"] for e in tercatat)
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 401
    assert sum("rollback_terdeteksi" in e["target"] for e in tercatat) == 2


def test_jangkar_tidak_terbaca_503(bff, monkeypatch):
    b = bff()

    async def rusak(*a, **k):
        raise OSError("db mati")
    monkeypatch.setattr(b.store, "baca_jangkar", rusak)
    assert masuk(b).json()["kode"] == "belum_siap"


def test_jangkar_naik_saat_baca_versi_lebih_baru(bff):
    """Baris sah berversi lebih tinggi dari jangkar (tulis jangkar sempat gagal) menaikkan jangkar saat dibaca."""
    b = bff()
    baru = b.ak.dengan_mac(b.utama, versi_sandi=b.utama.versi_sandi + 2)
    b.akun_mentah.akun[b.utama.id] = b.ak.baris_dari(baru)
    assert masuk(b).status_code == 200
    assert asyncio.run(b.ss.baca_jangkar(b.utama.id)) == baru.versi_sandi


def test_skema_manual_tidak_menjalankan_ddl(bff, monkeypatch):
    b = bff()
    kueri = []

    class Koneksi:
        def is_closed(self):
            return False

        def terminate(self):
            pass

        async def execute(self, sql, *args):
            kueri.append(sql)
            return "INSERT 0 1"

        async def fetchval(self, sql, *args):
            kueri.append(sql)
            return 1

        async def fetchrow(self, sql, *args):
            kueri.append(sql)
            return None

        async def close(self):
            pass

    async def sambung(alamat, **kw):
        return Koneksi()
    import asyncpg
    monkeypatch.setattr(asyncpg, "connect", sambung)
    for manual in ("1", None):
        kueri.clear()
        if manual:
            monkeypatch.setenv("SAPA_SKEMA_MANUAL", manual)
        else:
            monkeypatch.delenv("SAPA_SKEMA_MANUAL", raising=False)
        monkeypatch.setattr(b.ss, "_store", b.ss.PostgresSesiStore("postgresql://uji@db.invalid/sapa"))
        asyncio.run(b.ss.batas("k", 60, 5))
        asyncio.run(b.ss.naikkan_jangkar("akun-1", 2))
        asyncio.run(b.ss.baca_jangkar("akun-1"))
        ddl = [q for q in kueri if re.search(r"\b(CREATE|ALTER|DROP)\b", q)]
        assert bool(ddl) is (manual is None), manual


def test_berkas_sql_sesi_neon_dengan_grant_tanpa_ddl_dan_tanpa_sandi():
    sql = (AKAR / "api" / "sql" / "sesi_neon.sql").read_text(encoding="utf-8")
    for tabel in ("sapa_sesi", "sapa_batas", "akun_jangkar"):
        assert f"CREATE TABLE IF NOT EXISTS {tabel}" in sql
    grant = [b for b in sql.splitlines() if b.strip().upper().startswith("GRANT")]
    assert grant and all("TO sapa_aplikasi" in g for g in grant)
    assert not any(re.search(r"\b(CREATE|ALTER|DROP|TRUNCATE|ALL)\b", g.upper()) for g in grant)
    assert any("akun_jangkar" in g and "DELETE" not in g.upper() for g in grant)
    assert "PASSWORD" not in sql.upper()
    import sesi_service as ss
    for tabel in ("sapa_sesi", "sapa_batas", "akun_jangkar"):
        assert f"CREATE TABLE IF NOT EXISTS {tabel}" in ss.SCHEMA_SQL


# --- GET/POST /auth/siapkan-akun: penyiapan akun pertama -----------------------------------------

def test_siapkan_tersedia_hanya_bila_env_ada_dan_tabel_kosong(bff, monkeypatch):
    b = bff(akun_awal=False)
    assert _lihat(b).status_code == 404  # env belum diisi
    monkeypatch.setenv("SAPA_KODE_PENYIAPAN", KODE_PENYIAPAN)
    res = _lihat(b)
    assert res.status_code == 200 and res.json() == {"tersedia": True, "jenis": "penyiapan"}
    assert res.headers["cache-control"] == "no-store"
    tambah_akun(b)
    res = _lihat(b)
    assert res.status_code == 404 and KODE_PENYIAPAN not in res.text and "kosong" not in res.text


def test_siapkan_kode_env_terlalu_pendek_dianggap_tidak_ada(bff, monkeypatch):
    b = bff(akun_awal=False)
    monkeypatch.setenv("SAPA_KODE_PENYIAPAN", "pendek")
    assert _lihat(b).status_code == 404


def test_siapkan_akun_pertama_berhasil_lalu_bisa_masuk(bff, monkeypatch):
    b = bff(akun_awal=False)
    monkeypatch.setenv("SAPA_KODE_PENYIAPAN", KODE_PENYIAPAN)
    _aksi(b, b.ts.AKSI_SIAPKAN_AKUN)
    tercatat = catat_audit(monkeypatch)
    res = siapkan(b)
    assert res.status_code == 201 and res.json() == {"siap": True}
    assert res.headers["cache-control"] == "no-store" and set_cookie(res) == []
    [baris] = b.akun_mentah.akun.values()
    assert baris["username"] == USERNAME and baris["peran"] == "super_admin" and baris["aktif"] == 1
    assert baris["versi_sandi"] == 1 and baris["hash"].startswith("$argon2id$")
    assert b.ak.mac_sah(b.ak.akun_dari(baris))
    assert asyncio.run(b.ss.baca_jangkar(baris["id"])) == 1
    # Kode penyiapan langsung tercatat terpakai (hash berkunci, bukan nilai kode).
    assert b.akun_mentah.kode == {b.ak.hash_kode(KODE_PENYIAPAN): "penyiapan"}
    _aksi(b, b.ts.AKSI_MASUK)
    assert masuk(b).status_code == 200
    blob = json.dumps(tercatat)
    assert KODE_PENYIAPAN not in blob and SANDI not in blob and USERNAME not in blob
    assert [e["status"] for e in tercatat if e["action"] == "POST /api/v1/auth/siapkan-akun"] == [201]


def test_siapkan_memakai_aksi_turnstile_sendiri(bff, monkeypatch):
    b = bff(akun_awal=False)
    monkeypatch.setenv("SAPA_KODE_PENYIAPAN", KODE_PENYIAPAN)
    res = siapkan(b)  # Cloudflare palsu menjawab action "login"
    assert res.status_code == 403 and res.json()["kode"] == "turnstile_gagal"
    b.cf.jawaban = {**b.cf.jawaban, "action": b.ts.AKSI_SIAPKAN_AKUN}
    assert siapkan(b).status_code == 201


@pytest.fixture
def siap_penyiapan(bff, monkeypatch):
    def muat(**ubah):
        b = bff(akun_awal=False, **ubah)
        monkeypatch.setenv("SAPA_KODE_PENYIAPAN", KODE_PENYIAPAN)
        b.cf.jawaban = {**b.cf.jawaban, "action": b.ts.AKSI_SIAPKAN_AKUN}
        return b
    return muat


def test_siapkan_kedua_404_satu_akun_saja(siap_penyiapan, monkeypatch):
    b = siap_penyiapan()
    assert siapkan(b).status_code == 201
    # Env belum dihapus, tetapi tabel sudah berisi: GET 404, POST dengan kode baru maupun lama 404.
    assert _lihat(b).status_code == 404
    monkeypatch.setenv("SAPA_KODE_PENYIAPAN", KODE_PENYIAPAN + "-baru")
    res = siapkan(b, kode=KODE_PENYIAPAN + "-baru", username="kedua@contoh.invalid")
    assert res.status_code == 404 and res.json()["kode"] == "tidak_tersedia"
    assert len(b.akun_mentah.akun) == 1


def test_kode_penyiapan_sekali_pakai_walau_env_masih_ada(siap_penyiapan):
    b = siap_penyiapan()
    assert siapkan(b).status_code == 201
    b.akun_mentah.akun.clear()  # seolah tabel dikosongkan lagi: kode yang sama tetap tidak berlaku
    assert _lihat(b).status_code == 404
    assert siapkan(b).status_code == 404
    assert b.akun_mentah.akun == {}


def test_siapkan_insert_sekali_dua_permintaan_serentak(siap_penyiapan):
    """Dua permintaan penyiapan serentak dengan kode sah: tepat satu 201, satu 404, satu baris akun."""
    b = siap_penyiapan()

    async def dua():
        transport = httpx.ASGITransport(app=b.api.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://testserver",
                                     headers={"x-vercel-forwarded-for": "198.51.100.7"}) as klien:
            return await asyncio.gather(*[
                klien.post("/api/v1/auth/siapkan-akun", json=isian_siapkan(username=f"a{i}@contoh.invalid"),
                           headers=HEADER) for i in range(2)])
    hasil = sorted(r.status_code for r in asyncio.run(dua()))
    assert hasil == [201, 404]
    assert len(b.akun_mentah.akun) == 1


def test_sisip_pertama_atomik_di_penyimpanan(bff):
    b = bff(akun_awal=False)
    satu = b.ak.akun_baru("satu@contoh.invalid", SANDI)
    dua = b.ak.akun_baru("dua@contoh.invalid", SANDI)

    async def jalan():
        return await asyncio.gather(b.ak.sisip_pertama(satu, b.ak.hash_kode("k1")),
                                    b.ak.sisip_pertama(dua, b.ak.hash_kode("k2")))
    assert sorted(asyncio.run(jalan())) == [False, True]
    assert len(b.akun_mentah.akun) == 1


def test_kode_salah_403_dan_benar_dibandingkan_waktu_konstan(siap_penyiapan, monkeypatch):
    b = siap_penyiapan()
    monkeypatch.setenv("SAPA_KODE_PEMULIHAN", KODE_PEMULIHAN)
    dibandingkan = []
    asli = b.ak._sama

    def sama(a, c):
        dibandingkan.append((len(a), len(c)))
        return asli(a, c)
    monkeypatch.setattr(b.ak, "_sama", sama)
    salah = siapkan(b, kode=KODE_PENYIAPAN[:-1] + "Z")
    assert salah.status_code == 403 and salah.json()["kode"] == "kode_salah"
    jumlah_salah = len(dibandingkan)
    dibandingkan.clear()
    assert siapkan(b).status_code == 201
    # Kode dibandingkan dengan semua kode env aktif, selalu, lewat pembanding waktu-konstan.
    assert jumlah_salah == len(dibandingkan) == 2
    assert asli is hmac.compare_digest
    assert b.tidur and 0 < b.tidur[0] <= b.ab.WAKTU_MINIMUM_GAGAL


def test_siapkan_kode_salah_tidak_membaca_atau_menulis_akun(siap_penyiapan):
    b = siap_penyiapan()
    assert siapkan(b, kode="x" * 44).status_code == 403
    assert b.akun.panggilan == [] and b.hibp.permintaan == []


@pytest.mark.parametrize("sandi,kode", [("pendek-sekali", "sandi_lemah"), ("s" * 129, "sandi_lemah"),
                                        (KODE_PENYIAPAN, "sandi_lemah"), (USERNAME, "sandi_lemah")])
def test_siapkan_kebijakan_sandi_400(siap_penyiapan, sandi, kode):
    b = siap_penyiapan()
    res = siapkan(b, password_baru=sandi)
    assert res.status_code == 400 and res.json()["kode"] == kode
    assert sandi not in res.text and b.akun_mentah.akun == {}


def test_siapkan_sandi_bocor_hibp_400(siap_penyiapan):
    b = siap_penyiapan()
    b.hibp.bocor.add(SANDI)
    res = siapkan(b)
    assert res.status_code == 400 and res.json()["kode"] == "sandi_bocor"
    [permintaan] = b.hibp.permintaan
    # k-anonymity: hanya 5 karakter awal SHA-1 yang dikirim, dengan Add-Padding.
    sha1 = hashlib.sha1(SANDI.encode()).hexdigest().upper()
    assert str(permintaan.url) == f"https://api.pwnedpasswords.com/range/{sha1[:5]}"
    assert permintaan.headers["add-padding"] == "true"
    assert sha1[5:] not in str(permintaan.url) and SANDI not in str(permintaan.url)
    assert b.akun_mentah.akun == {} and b.akun_mentah.kode == {}


@pytest.mark.parametrize("gangguan", ["mati", "500"])
def test_siapkan_hibp_tidak_tersedia_gagal_tertutup(siap_penyiapan, gangguan):
    b = siap_penyiapan()
    if gangguan == "mati":
        b.hibp.mati = True
    else:
        b.hibp.status = 500
    res = siapkan(b)
    assert res.status_code == 503 and res.json() == {"detail": PESAN_HIBP, "kode": "hibp_tidak_tersedia"}
    assert b.akun_mentah.akun == {} and b.akun_mentah.kode == {}


def test_siapkan_hibp_bertenggat(bff, monkeypatch):
    b = bff()
    assert b.ak.TENGGAT_HIBP <= 3

    async def lambat(permintaan):
        await asyncio.sleep(0.5)
        return httpx.Response(200, text="")
    asli = b.ak._klien_hibp.asli
    monkeypatch.setattr(b.ak, "_klien_hibp", lambda: asli(transport=httpx.MockTransport(lambat)))
    monkeypatch.setattr(b.ak, "TENGGAT_HIBP", 0.05)
    mulai = time.monotonic()
    with pytest.raises(b.ak.HibpTidakTersedia):
        asyncio.run(b.ak.cek_bocor(SANDI))
    assert time.monotonic() - mulai < 0.4


@pytest.mark.parametrize("body", [
    {"username": USERNAME, "kode": KODE_PENYIAPAN, "password_baru": SANDI},
    {"username": USERNAME, "kode": KODE_PENYIAPAN, "password_baru": SANDI, "turnstile_token": "t", "lain": 1},
    {"username": "", "kode": KODE_PENYIAPAN, "password_baru": SANDI, "turnstile_token": "t"},
    {"username": "Bukan Username!", "kode": KODE_PENYIAPAN, "password_baru": SANDI, "turnstile_token": "t"},
    {"username": USERNAME, "kode": ["x"], "password_baru": SANDI, "turnstile_token": "t"},
    [USERNAME],
])
def test_siapkan_isian_tidak_sah_400(siap_penyiapan, body):
    b = siap_penyiapan()
    res = b.client.post("/api/v1/auth/siapkan-akun", json=body, headers=HEADER)
    assert res.status_code == 400 and res.json()["kode"] == "isian_tidak_sah"
    assert KODE_PENYIAPAN not in res.text and SANDI not in res.text


def test_siapkan_wajib_bukti_asal(siap_penyiapan):
    b = siap_penyiapan()
    res = b.client.post("/api/v1/auth/siapkan-akun", json=isian_siapkan(), headers={"x-vercel-forwarded-for": "198.51.100.7"})
    assert res.status_code == 403 and res.json()["kode"] == "asal_tidak_sah"
    assert b.cf.kiriman == []


def test_siapkan_tanpa_env_404_tanpa_layanan_lain(bff):
    b = bff(akun_awal=False)
    res = siapkan(b)
    assert res.status_code == 404 and res.json()["kode"] == "tidak_tersedia"
    assert b.cf.kiriman == [] and b.akun.panggilan == []


def test_siapkan_batas_laju_per_ip_ketat(siap_penyiapan):
    b = siap_penyiapan()
    maks = b.ab.BATAS_SIAPKAN_IP[1]
    assert maks <= 10
    for _ in range(maks):
        assert siapkan(b, kode="z" * 44).status_code == 403
    res = siapkan(b)
    assert res.status_code == 429 and res.json()["kode"] == "terlalu_banyak"
    assert b.akun_mentah.akun == {}
    # IP lain tidak ikut tertahan.
    assert siapkan(b, header={"x-vercel-forwarded-for": "203.0.113.9"}).status_code == 201


def test_siapkan_penyimpanan_akun_mati_503(siap_penyiapan):
    b = siap_penyiapan()
    b.akun.gagal = b.ak.AkunBelumSiap()
    assert _lihat(b).status_code == 503
    assert siapkan(b).json()["kode"] == "belum_siap"


# --- pemulihan (SAPA_KODE_PEMULIHAN) -------------------------------------------------------------

@pytest.fixture
def siap_pemulihan(bff, monkeypatch):
    def muat(**ubah):
        b = bff(**ubah)
        monkeypatch.setenv("SAPA_KODE_PEMULIHAN", KODE_PEMULIHAN)
        b.cf.jawaban = {**b.cf.jawaban, "action": b.ts.AKSI_SIAPKAN_AKUN}
        return b
    return muat


def test_pemulihan_mengganti_hash_menaikkan_versi_dan_mencabut_sesi(siap_pemulihan, monkeypatch):
    b = siap_pemulihan()
    _aksi(b, b.ts.AKSI_MASUK)
    lama = nilai_cookie(masuk(b))
    lain = browser_lain(b)
    masuk(b, client=lain)
    assert len(b.store.sesi) == 2
    _aksi(b, b.ts.AKSI_SIAPKAN_AKUN)
    res = _lihat(b, client=browser_lain(b))
    assert res.status_code == 200 and res.json() == {"tersedia": True, "jenis": "pemulihan"}
    res = siapkan(b, client=browser_lain(b), kode=KODE_PEMULIHAN, password_baru=SANDI_BARU)
    assert res.status_code == 201 and res.json() == {"siap": True}
    baris = b.akun_mentah.akun[b.utama.id]
    assert baris["versi_sandi"] == b.utama.versi_sandi + 1 and baris["id"] == b.utama.id
    assert b.ak.mac_sah(b.ak.akun_dari(baris))
    assert asyncio.run(b.ss.baca_jangkar(b.utama.id)) == baris["versi_sandi"]
    # Semua sesi akun dicabut seketika.
    assert b.store.sesi == {}
    assert b.client.get("/api/v1/akun/status", headers={"Cookie": f"{COOKIE}={lama}"}).status_code == 401
    assert lain.get("/api/v1/akun/status").status_code == 401
    # Sandi lama tidak berlaku, sandi baru berlaku (jam maju: kuota global percobaan per detik).
    _aksi(b, b.ts.AKSI_MASUK)
    b.jam.maju(seconds=1)
    assert masuk(b, client=browser_lain(b)).status_code == 401
    assert masuk(b, client=browser_lain(b), password=SANDI_BARU).status_code == 200


def test_pemulihan_kode_sekali_pakai_walau_env_masih_ada(siap_pemulihan):
    b = siap_pemulihan()
    assert siapkan(b, kode=KODE_PEMULIHAN, password_baru=SANDI_BARU).status_code == 201
    assert _lihat(b).status_code == 404
    res = siapkan(b, kode=KODE_PEMULIHAN, password_baru="Sandi-Lain-Lagi-Panjang-1")
    assert res.status_code == 404 and res.json()["kode"] == "tidak_tersedia"
    assert b.akun_mentah.akun[b.utama.id]["versi_sandi"] == b.utama.versi_sandi + 1


def test_pemulihan_tidak_pernah_membuat_akun(siap_pemulihan):
    b = siap_pemulihan(akun_awal=False)
    assert _lihat(b).status_code == 404
    res = siapkan(b, kode=KODE_PEMULIHAN)
    assert res.status_code == 404
    assert b.akun_mentah.akun == {} and b.akun_mentah.kode == {}


def test_pemulihan_username_tidak_cocok_ditolak_tanpa_mengubah(siap_pemulihan):
    b = siap_pemulihan()
    res = siapkan(b, kode=KODE_PEMULIHAN, username="lain@contoh.invalid", password_baru=SANDI_BARU)
    assert res.status_code == 403 and res.json()["kode"] == "kode_salah"
    assert b.akun_mentah.akun[b.utama.id]["versi_sandi"] == b.utama.versi_sandi
    assert b.akun_mentah.kode == {}


def test_pemulihan_baris_tidak_utuh_ditolak(siap_pemulihan):
    b = siap_pemulihan()
    b.akun_mentah.akun[b.utama.id]["peran"] = "admin"  # MAC tidak cocok lagi
    res = siapkan(b, kode=KODE_PEMULIHAN, password_baru=SANDI_BARU)
    assert res.status_code == 403
    assert b.akun_mentah.akun[b.utama.id]["versi_sandi"] == b.utama.versi_sandi


# --- POST /akun/ubah-sandi ------------------------------------------------------------------------

def test_ubah_sandi_berhasil_merotasi_cookie_dan_mencabut_sesi_lain(bff, monkeypatch):
    b = bff()
    lama = nilai_cookie(masuk(b))
    lain = browser_lain(b)
    masuk(b, client=lain)
    tercatat = catat_audit(monkeypatch)
    res = ubah_sandi(b, baru=SANDI_BARU)
    assert res.status_code == 200 and res.json() == {"diubah": True}
    assert res.headers["cache-control"] == "no-store"
    baru = nilai_cookie(res)
    assert baru != lama
    # Sesi lain dan sesi yang tadi dipakai langsung 401; cookie baru berlaku.
    assert lain.get("/api/v1/akun/status").status_code == 401
    assert browser_lain(b).get("/api/v1/akun/status", headers={"Cookie": f"{COOKIE}={lama}"}).status_code == 401
    assert browser_lain(b).get("/api/v1/akun/status", headers={"Cookie": f"{COOKIE}={baru}"}).status_code == 200
    assert len(b.store.sesi) == 1
    baris = b.akun_mentah.akun[b.utama.id]
    assert baris["versi_sandi"] == b.utama.versi_sandi + 1
    assert asyncio.run(b.ss.baca_jangkar(b.utama.id)) == baris["versi_sandi"]
    b.jam.maju(seconds=1)  # kuota global percobaan per detik
    assert masuk(b, client=browser_lain(b), password=SANDI_BARU).status_code == 200
    assert masuk(b, client=browser_lain(b)).status_code == 401
    [catatan] = [e for e in tercatat if e["action"] == "POST /api/v1/akun/ubah-sandi"]
    assert catatan["status"] == 200
    blob = json.dumps(tercatat)
    assert SANDI not in blob and SANDI_BARU not in blob


def test_ubah_sandi_lama_salah_401_dan_berbatas(bff):
    b = bff()
    masuk(b)
    for _ in range(b.ab.BATAS_GAGAL_USERNAME_IP[1]):
        res = ubah_sandi(b, lama=SANDI_SALAH)
        assert res.status_code == 401 and res.json()["kode"] == "sandi_lama_salah"
        b.jam.maju(seconds=4)
    res = ubah_sandi(b, lama=SANDI_SALAH)
    assert res.status_code == 429 and res.json()["kode"] == "terlalu_banyak"
    # Dihitung bersama kegagalan masuk (username + IP yang sama).
    assert masuk(b, client=browser_lain(b), password=SANDI_SALAH).status_code == 429
    assert b.akun_mentah.akun[b.utama.id]["versi_sandi"] == b.utama.versi_sandi


@pytest.mark.parametrize("baru,kode", [("pendek-sekali", "sandi_lemah"), (SANDI, "sandi_sama"),
                                       (USERNAME, "sandi_lemah"), ("s" * 129, "sandi_lemah")])
def test_ubah_sandi_kebijakan_400(bff, baru, kode):
    b = bff()
    masuk(b)
    res = ubah_sandi(b, baru=baru)
    assert res.status_code == 400 and res.json()["kode"] == kode
    assert b.akun_mentah.akun[b.utama.id]["versi_sandi"] == b.utama.versi_sandi


def test_ubah_sandi_bocor_hibp_400(bff):
    b = bff()
    masuk(b)
    b.hibp.bocor.add(SANDI_BARU)
    res = ubah_sandi(b, baru=SANDI_BARU)
    assert res.status_code == 400 and res.json()["kode"] == "sandi_bocor"
    assert b.akun_mentah.akun[b.utama.id]["versi_sandi"] == b.utama.versi_sandi


def test_ubah_sandi_hibp_mati_gagal_tertutup(bff):
    b = bff()
    masuk(b)
    b.hibp.mati = True
    res = ubah_sandi(b, baru=SANDI_BARU)
    assert res.status_code == 503 and res.json() == {"detail": PESAN_HIBP, "kode": "hibp_tidak_tersedia"}
    assert b.akun_mentah.akun[b.utama.id]["versi_sandi"] == b.utama.versi_sandi
    assert b.client.get("/api/v1/akun/status").status_code == 200  # sesi tetap


def test_ubah_sandi_wajib_sesi_dan_bukti_asal(bff):
    b = bff()
    res = ubah_sandi(b)
    assert res.status_code == 401
    masuk(b)
    res = b.client.post("/api/v1/akun/ubah-sandi", json={"password_lama": SANDI, "password_baru": SANDI_BARU})
    assert res.status_code == 403 and res.json()["kode"] == "asal_tidak_sah"
    res = b.client.post("/api/v1/akun/ubah-sandi", json={"password_lama": SANDI}, headers=ASAL_SENDIRI)
    assert res.status_code == 400 and res.json()["kode"] == "isian_tidak_sah"


def test_ubah_sandi_penyimpanan_akun_mati_503(bff):
    b = bff()
    masuk(b)
    b.akun.gagal = b.ak.AkunBelumSiap()
    assert ubah_sandi(b, baru=SANDI_BARU).status_code == 503


# --- klien Worker ber-HMAC ----------------------------------------------------------------------

KUNCI_HMAC = base64.b64encode(b"k" * 32).decode()


def _kanonik_mandiri(metode, path, waktu, nonce, body: bytes) -> str:
    """Kanonikalisasi string bertanda tangan, ditulis ulang di tes (bukan dari modul yang diuji)."""
    return "\n".join(["sapa-akun-v1", metode, path, waktu, nonce, hashlib.sha256(body).hexdigest()])


class WorkerPalsu:
    """Worker sapa-akun palsu: memeriksa tanda tangan, lalu menjawab dari penyimpanan memori."""

    def __init__(self, ak, kunci=KUNCI_HMAC):
        self.ak = ak
        self.kunci = base64.b64decode(kunci)
        self.mem = ak.MemoryAkunStore()
        self.permintaan = []
        self.paksa = None  # (status, body) yang dijawab untuk semua permintaan
        self.tunda = 0.0

    def transport(self):
        async def tangani(r):
            if self.tunda:
                await asyncio.sleep(self.tunda)
            body = r.content
            h = r.headers
            self.permintaan.append((r.method, r.url.path, dict(h), body))
            if self.paksa:
                return httpx.Response(self.paksa[0], json=self.paksa[1])
            tanda = hmac.new(self.kunci, _kanonik_mandiri(r.method, r.url.path, h.get("x-sapa-waktu", ""),
                                                          h.get("x-sapa-nonce", ""), body).encode(), hashlib.sha256)
            if not hmac.compare_digest(tanda.hexdigest(), h.get("x-sapa-tanda", "")):
                return httpx.Response(401, json={"galat": "tidak_sah"})
            isi = json.loads(body)
            op = r.url.path
            if op == "/akun/jumlah":
                return httpx.Response(200, json={"jumlah": await self.mem.jumlah()})
            if op == "/akun/ambil-username":
                return httpx.Response(200, json={"akun": await self.mem.ambil_username(isi["username"])})
            if op == "/akun/ambil-id":
                return httpx.Response(200, json={"akun": await self.mem.ambil_id(isi["id"])})
            if op == "/kode/terpakai":
                return httpx.Response(200, json={"terpakai": await self.mem.kode_terpakai(isi["hash_kode"])})
            if op == "/akun/sisip-pertama":
                return httpx.Response(200, json={"ok": await self.mem.sisip_pertama(isi["akun"], isi["hash_kode"])})
            if op == "/akun/ganti-hash":
                ok = await self.mem.ganti_hash(isi["id"], isi["versi_lama"], isi["hash"], isi["versi_baru"],
                                               isi["mac"], isi.get("hash_kode"), isi.get("jenis"))
                return httpx.Response(200, json={"ok": ok})
            return httpx.Response(404, json={"galat": "tidak_ada"})
        return httpx.MockTransport(tangani)


@pytest.fixture
def worker(bff, monkeypatch):
    b = bff(akun_awal=False, SAPA_AKUN_WORKER_URL="https://sapa-akun.contoh.invalid/", SAPA_AKUN_HMAC=KUNCI_HMAC)
    w = WorkerPalsu(b.ak)
    monkeypatch.setattr(b.ak, "_store", None)
    asli = getattr(b.ak._klien_worker, "asli", b.ak._klien_worker)

    def klien():
        return asli(transport=w.transport())
    klien.asli = asli
    monkeypatch.setattr(b.ak, "_klien_worker", klien)
    b.worker = w
    assert isinstance(b.ak.store(), b.ak.WorkerAkunStore)
    return b


def test_klien_worker_menandatangani_setiap_permintaan(worker):
    b = worker
    akun = b.ak.akun_baru(USERNAME, SANDI)
    assert asyncio.run(b.ak.jumlah()) == 0
    assert asyncio.run(b.ak.sisip_pertama(akun, b.ak.hash_kode(KODE_PENYIAPAN))) is True
    assert asyncio.run(b.ak.ambil_username(USERNAME)) == akun
    assert asyncio.run(b.ak.kode_terpakai(b.ak.hash_kode(KODE_PENYIAPAN))) is True
    baca, tulis = b.worker.permintaan[0], b.worker.permintaan[1]
    assert baca[0] == "POST" and baca[1] == "/akun/jumlah"
    assert re.fullmatch(r"\d{10}", baca[2]["x-sapa-waktu"]) and re.fullmatch(r"[0-9a-f]{64}", baca[2]["x-sapa-tanda"])
    assert baca[2].get("x-sapa-nonce", "") == ""  # baca tanpa nonce
    assert re.fullmatch(r"[0-9a-f]{32}", tulis[2]["x-sapa-nonce"])  # tulis wajib nonce
    assert abs(int(baca[2]["x-sapa-waktu"]) - time.time()) < 5
    # Kunci tidak pernah ikut dikirim.
    for _, _, header, body in b.worker.permintaan:
        assert KUNCI_HMAC not in json.dumps(header) and KUNCI_HMAC.encode() not in body


def test_klien_worker_nonce_unik_setiap_tulis(worker):
    b = worker
    akun = b.ak.akun_baru(USERNAME, SANDI)
    asyncio.run(b.ak.sisip_pertama(akun, b.ak.hash_kode("k1")))
    for _ in range(3):
        asyncio.run(b.ak.ganti_hash(akun, b.ak.hash_sandi(SANDI)))
        akun = asyncio.run(b.ak.ambil_id(akun.id))
    nonce = [h["x-sapa-nonce"] for _, p, h, _ in b.worker.permintaan if p in ("/akun/sisip-pertama", "/akun/ganti-hash")]
    assert len(nonce) == 4 and len(set(nonce)) == 4


@pytest.mark.parametrize("paksa", [(401, {"galat": "tidak_sah"}), (500, {"galat": "x"}), (502, None), (404, {}),
                                   (200, ["bukan", "objek"]), (200, {"akun": {"id": 1}})])
def test_klien_worker_galat_menjadi_belum_siap_atau_tidak_utuh(worker, paksa):
    b = worker
    b.worker.paksa = paksa
    if paksa == (200, {"akun": {"id": 1}}):
        # Bentuk baris rusak dianggap tidak utuh (MAC tidak bisa cocok), bukan galat 500.
        akun = asyncio.run(b.ak.ambil_username(USERNAME))
        assert akun is not None and not b.ak.mac_sah(akun)
        return
    with pytest.raises(b.ak.AkunBelumSiap):
        asyncio.run(b.ak.jumlah())


@pytest.mark.parametrize("galat", [httpx.ConnectError, httpx.ReadTimeout])
def test_klien_worker_tidak_terjangkau_belum_siap(worker, monkeypatch, galat):
    b = worker

    def gagal(r):
        raise galat("gagal", request=r)
    asli = b.ak._klien_worker.asli
    monkeypatch.setattr(b.ak, "_klien_worker", lambda: asli(transport=httpx.MockTransport(gagal)))
    with pytest.raises(b.ak.AkunBelumSiap):
        asyncio.run(b.ak.jumlah())


def test_klien_worker_tenggat_total_paling_lama_3_detik(worker, monkeypatch):
    b = worker
    assert b.ak.TENGGAT_WORKER <= 3
    b.worker.tunda = 0.5
    monkeypatch.setattr(b.ak, "TENGGAT_WORKER", 0.05)
    mulai = time.monotonic()
    with pytest.raises(b.ak.AkunBelumSiap):
        asyncio.run(b.ak.jumlah())
    assert time.monotonic() - mulai < 0.4


def test_masuk_lewat_worker_dan_worker_401_menjadi_503(worker):
    b = worker
    akun = b.ak.akun_baru(USERNAME, SANDI)
    asyncio.run(b.worker.mem.sisip_pertama(b.ak.baris_dari(akun), "0" * 64))
    asyncio.run(b.ss.naikkan_jangkar(akun.id, 1))
    assert masuk(b).status_code == 200
    assert b.client.get("/api/v1/akun/status").status_code == 200
    b.worker.paksa = (401, {"galat": "tidak_sah"})
    res = masuk(b, client=browser_lain(b))
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert b.client.get("/api/v1/akun/status").status_code == 503


def test_worker_url_wajib_https(bff, monkeypatch):
    b = bff()
    monkeypatch.setattr(b.ak, "_store", None)
    monkeypatch.setenv("SAPA_AKUN_HMAC", KUNCI_HMAC)
    monkeypatch.setenv("SAPA_AKUN_WORKER_URL", "http://sapa-akun.contoh.invalid")
    assert b.ak.store() is None
    monkeypatch.setenv("SAPA_AKUN_WORKER_URL", "https://sapa-akun.contoh.invalid")
    assert isinstance(b.ak.store(), b.ak.WorkerAkunStore)
    monkeypatch.delenv("SAPA_AKUN_HMAC")
    assert b.ak.store() is None


def test_vektor_tanda_tangan_bersama_python_dan_worker(bff):
    """Berkas vektor yang sama dipakai tes Worker (node --test); kanonikalisasi dan HMAC harus identik."""
    ak = bff().ak
    data = json.loads(VEKTOR.read_text(encoding="utf-8"))
    kunci = base64.b64decode(data["kunci_base64"])
    assert len(data["vektor"]) >= 4
    for v in data["vektor"]:
        body = v["body"].encode("utf-8")
        kanonik = ak.kanonik_tanda(v["metode"], v["path"], v["waktu"], v["nonce"], body)
        assert kanonik == v["kanonik"] == _kanonik_mandiri(v["metode"], v["path"], v["waktu"], v["nonce"], body)
        assert ak.tanda_tangan(kunci, v["metode"], v["path"], v["waktu"], v["nonce"], body) == v["tanda"]


# --- Worker: berkas di repo ------------------------------------------------------------------------

WORKER = AKAR / "workers" / "sapa-akun"


def test_worker_tidak_mencatat_isi_hash_username_kode_atau_tanda_tangan():
    sumber = (WORKER / "src" / "index.js").read_text(encoding="utf-8")
    # Satu-satunya log: metadata path (hanya nama operasi tetap atau "lain"), status, dan durasi.
    panggilan = re.findall(r"console\.\w+\((.*)\);", sumber)
    assert panggilan == ["JSON.stringify({ path: jalur, status, durasi_ms: Date.now() - mulai })"], panggilan
    assert len(re.findall(r"\bconsole\b", sumber)) == 1


def test_worker_verifikasi_hmac_sebelum_d1_dengan_subtle_verify():
    sumber = (WORKER / "src" / "index.js").read_text(encoding="utf-8")
    assert "crypto.subtle.verify(" in sumber and "timingSafeEqual" not in sumber
    badan = sumber[sumber.index("async function tangani"):]
    assert badan.index("await verifikasiTanda(") < badan.index("env.DB")


def test_wrangler_toml_tanpa_account_id_dan_secret():
    toml = (WORKER / "wrangler.toml").read_text(encoding="utf-8")
    assert "account_id" not in toml and "SAPA_AKUN_HMAC =" not in toml
    assert "[[d1_databases]]" in toml and 'binding = "DB"' in toml
    assert not re.search(r"[0-9a-f]{32}", toml.replace("00000000-0000-0000-0000-000000000000", ""))


def test_migrasi_d1_membuat_tiga_tabel():
    sql = (WORKER / "migrations" / "0001_akun.sql").read_text(encoding="utf-8")
    for tabel in ("akun_sapa", "kode_terpakai", "nonce_terpakai"):
        assert f"CREATE TABLE IF NOT EXISTS {tabel}" in sql


def test_skrip_uji_worker_produksi_tidak_mencetak_kunci():
    skrip = (AKAR / "scripts" / "uji-worker-akun.py").read_text(encoding="utf-8")
    assert "getpass" in skrip and "SAPA_AKUN_HMAC" in skrip
    for baris in skrip.splitlines():
        if "print(" in baris or "write(" in baris:
            assert "rahasia_hmac" not in baris, baris
    for kasus in ("tanpa_tanda", "tanda_salah", "waktu_lewat", "nonce_ganda", "path_asing", "body_diubah"):
        assert kasus in skrip


# --- fitur yang bergantung Auth0: 503 terkendali saat flag 1 -----------------------------------------

FITUR_AUTH0 = [
    ("get", "/api/v1/pengguna-fkrtl", None),
    ("post", "/api/v1/pengguna-fkrtl", {"nama": "Uji", "email": "uji@contoh.invalid", "kode_ppk": "0101R001"}),
    ("post", "/api/v1/pengguna-fkrtl/auth0%7Cuji/username", None),
    ("post", "/api/v1/pengguna-fkrtl/auth0%7Cuji/atur-ulang-sandi", None),
    ("post", "/api/v1/pengguna-fkrtl/auth0%7Cuji/undangan", None),
    ("patch", "/api/v1/pengguna-fkrtl/auth0%7Cuji", {"aktif": False}),
    ("post", "/api/v1/akun/ganti-sandi", {"sandi_baru": SANDI}),
]


@pytest.mark.parametrize("method,path,body", FITUR_AUTH0)
def test_fitur_auth0_503_terkendali_bukan_500(bff, monkeypatch, method, path, body):
    b = bff()
    dipanggil = []
    monkeypatch.setattr(b.api.pengguna_service, "get_client", lambda: dipanggil.append(1))
    masuk(b)
    res = b.client.request(method.upper(), path, json=body, headers=ASAL_SENDIRI)
    assert res.status_code == 503 and res.json() == {"detail": PESAN_FITUR}
    assert dipanggil == []


def test_verifikasi_manusia_auth0_503_saat_flag_1(bff):
    b = bff()
    res = b.client.post("/api/v1/verifikasi-manusia", json={"state": "s", "session_token": "t", "turnstile_token": "x"})
    assert res.status_code == 503 and res.json() == {"detail": PESAN_FITUR}


def test_status_akun_tanpa_auth0_saat_flag_1(bff, monkeypatch):
    b = bff()
    monkeypatch.setattr(b.api.pengguna_service, "status_akun", lambda *a, **k: (_ for _ in ()).throw(AssertionError()))
    masuk(b)
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 200 and res.json() == {"wajib_ganti_sandi": False, "petugas_rs": False, "nonaktif": False}


# --- menyusuri app.routes ------------------------------------------------------------------------

TERBUKA = {"/", "/api", "/api/index.py", "/api/v1/health", "/health", "/api/v2/tenants/{tenant_id}/Users",
           "/api/v1/verifikasi-manusia", "/api/v1/auth/mode", "/api/v1/auth/masuk", "/api/v1/auth/sesi",
           "/api/v1/auth/keluar", "/api/v1/auth/siap", "/api/v1/auth/siapkan-akun"}
JALUR_FITUR_AUTH0 = {"/api/v1/pengguna-fkrtl", "/api/v1/pengguna-fkrtl/{user_id}/username",
                     "/api/v1/pengguna-fkrtl/{user_id}/atur-ulang-sandi", "/api/v1/pengguna-fkrtl/{user_id}/undangan",
                     "/api/v1/pengguna-fkrtl/{user_id}", "/api/v1/akun/ganti-sandi"}


def _rute(routes):
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
        elif getattr(route, "original_router", None) is not None:
            yield from _rute(route.original_router.routes)
        elif getattr(route, "routes", None):
            yield from _rute(route.routes)


def _semua_permintaan(api):
    for route in _rute(api.app.routes):
        if route.path in TERBUKA:
            continue
        for metode in sorted(route.methods - {"HEAD", "OPTIONS"}):
            yield metode, re.sub(r"\{[^}]+\}", "uji", route.path), route.path


def test_menyusuri_rute_tanpa_cookie_cookie_palsu_dan_kedaluwarsa_401(bff):
    b = bff()
    kedaluwarsa = asyncio.run(b.ss.buat_sesi_lokal(b.utama.id, b.utama.versi_sandi, USERNAME, "super_admin", False))
    b.jam.maju(hours=13)
    semua = list(_semua_permintaan(b.api))
    assert len(semua) > 30 and any(p == "/api/v1/akun/ubah-sandi" for _, _, p in semua)
    for metode, alamat, pola in semua:
        for cookie in (None, "a" * 43, "nilai-palsu-yang-tidak-pernah-ada-di-db", kedaluwarsa):
            header = {**ASAL_SENDIRI, **({"Cookie": f"{COOKIE}={cookie}"} if cookie else {})}
            res = browser_lain(b).request(metode, alamat, headers=header)
            assert res.status_code == 401, (metode, pola, cookie, res.status_code, res.text[:200])


def test_menyusuri_rute_mutasi_tanpa_x_sapa_403_dan_fitur_auth0_503(bff):
    b = bff()
    masuk(b)
    for metode, alamat, pola in _semua_permintaan(b.api):
        if metode != "GET":
            for header in ({}, {"Origin": "https://sapa-yanfaskes.vercel.app"}, {"X-SAPA": "1"}):
                res = b.client.request(metode, alamat, headers=header)
                assert res.status_code == 403, (metode, pola, header, res.status_code)
        if pola in JALUR_FITUR_AUTH0:
            res = b.client.request(metode, alamat, headers=ASAL_SENDIRI)
            assert res.status_code == 503 and res.json() == {"detail": PESAN_FITUR}, (metode, pola)


def test_menyusuri_rute_tanpa_500_dengan_sesi_sah(bff, monkeypatch):
    """Dengan sesi Super Admin sah dan bukti asal, tidak ada rute yang menjawab 500 karena jalur Auth0."""
    b = bff()
    monkeypatch.setattr(b.api.pengguna_service, "get_client", lambda: None)
    masuk(b)
    for metode, alamat, pola in _semua_permintaan(b.api):
        if pola not in JALUR_FITUR_AUTH0 and not pola.startswith("/api/v1/akun"):
            continue
        res = b.client.request(metode, alamat, headers=ASAL_SENDIRI)
        assert res.status_code != 500, (metode, pola)
