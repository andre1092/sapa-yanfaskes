"""Login satu halaman (BFF, SAPA_LOGIN_BFF=1): masuk dengan akun lokal, sesi di server, cookie __Host-sapa_sesi.

Akun dibaca dari penyimpanan akun (memori di tes; Worker sapa-akun di produksi), sandi diperiksa argon2id di
server SAPA. Cloudflare Turnstile, HIBP, dan Postgres dipalsukan; tes tidak memakai jaringan.
Penyiapan akun, pemulihan, ubah sandi, MAC baris, dan jangkar diuji di test_akun_lokal.py.
"""
import asyncio
import base64
import hashlib
import json
import logging
import time
from datetime import datetime, timedelta

import pytest

from login_uji import (ASAL, ASAL_SENDIRI, COOKIE, HEADER, IP_ASLI, IP_PALSU, ISIAN, KUNCI_A, KUNCI_B, SALAH,
                       SANDI, SANDI_SALAH, TERLALU_BANYAK, USERNAME, bff, browser_lain, catat_audit, kredensial,
                       klien_uji, masuk, nilai_cookie, pasang_cloudflare, set_cookie, tambah_akun)  # noqa: F401
from test_api_auth import token

BODY_EMAIL = {"to_email": "uji@example.com", "verification_url": "https://sapa-yanfaskes.vercel.app"}


def _jejak_respons(res):
    """Status, body, dan header yang relevan untuk dibandingkan antar-respons."""
    return (res.status_code, res.text, {k: res.headers.get(k) for k in ("cache-control", "retry-after", "set-cookie",
                                                                         "content-type", "www-authenticate")})


# --- flag mati ---------------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", [("post", "/api/v1/auth/masuk"), ("get", "/api/v1/auth/sesi"),
                                         ("post", "/api/v1/auth/keluar"), ("get", "/api/v1/auth/siap"),
                                         ("get", "/api/v1/auth/masuk"), ("get", "/api/v1/auth/siapkan-akun"),
                                         ("post", "/api/v1/auth/siapkan-akun"), ("post", "/api/v1/akun/ubah-sandi")])
def test_flag_mati_endpoint_tidak_ada(bff, method, path):
    b = bff(SAPA_LOGIN_BFF=None)
    res = getattr(b.client, method)(path, headers=HEADER)
    assert res.status_code == 404
    assert b.akun.panggilan == [] and b.cf.kiriman == []


def test_flag_mati_cookie_diabaikan_dan_bearer_tetap_jalan(bff):
    b = bff()
    cookie = nilai_cookie(masuk(b))
    b = bff(SAPA_LOGIN_BFF="0")
    tanpa = b.client.get("/api/v1/akun/status", headers={"Cookie": f"{COOKIE}={cookie}"})
    assert tanpa.status_code == 401
    bearer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['viewer']})}"}
    assert b.client.get("/api/v1/akun/status", headers=bearer).status_code == 200


def test_flag_mati_galat_422_tetap_seperti_lama(bff):
    b = bff(SAPA_LOGIN_BFF=None)
    res = b.client.post("/api/v1/verifikasi-manusia", json={"state": "isian-lama"})
    assert res.status_code == 422 and "isian-lama" in res.text


@pytest.mark.parametrize("flag,harapan", [(None, False), ("0", False), ("1", True)])
def test_mode_login_selalu_tersedia(bff, flag, harapan):
    b = bff(SAPA_LOGIN_BFF=flag)
    res = b.client.get("/api/v1/auth/mode")
    assert res.status_code == 200 and res.json() == {"bff": harapan}
    assert res.headers["cache-control"] == "no-store"


# --- masuk sukses ------------------------------------------------------------------------------

@pytest.mark.parametrize("ingat,max_age", [(True, "Max-Age=2592000"), (False, None)])
def test_masuk_sukses_memasang_cookie_aman(bff, ingat, max_age):
    b = bff()
    res = masuk(b, ingat=ingat)
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "no-store"
    assert res.json() == {"masuk": True, "peran": "super_admin"}
    [cookie] = set_cookie(res)
    bagian = [p.strip() for p in cookie.split(";")]
    rendah = [p.lower() for p in bagian]
    assert "httponly" in rendah and "secure" in rendah and "samesite=strict" in rendah and "path=/" in rendah
    assert not any(p.startswith("domain") for p in rendah)
    if max_age:
        assert max_age in bagian
    else:
        assert not any(p.startswith("max-age") or p.startswith("expires") for p in rendah)
    nilai = bagian[0].split("=", 1)[1]
    assert len(nilai) >= 40
    # Id sesi disimpan sebagai sha256 dari nilai cookie; isi sesi terenkripsi, tanpa hash sandi maupun username.
    [baris] = b.store.sesi.values()
    assert baris["id_hash"] == hashlib.sha256(nilai.encode()).hexdigest()
    blob = json.dumps(baris, default=str)
    assert nilai not in blob and USERNAME not in blob and "$argon2" not in blob
    assert baris["sub"] == "sapa|" + b.utama.id and baris["ingat"] is ingat
    umur = baris["kedaluwarsa"] - baris["dibuat_pada"]
    assert umur == (timedelta(days=30) if ingat else timedelta(hours=12))
    # Respons tidak membawa hash, mac, atau id akun.
    assert "$argon2" not in res.text and b.utama.mac not in res.text and b.utama.id not in res.text


def test_masuk_tanpa_auth0_sama_sekali(bff, monkeypatch):
    """Flag 1: tidak ada panggilan Auth0 maupun verifikasi JWT Auth0 di jalur masuk, sesi, dan data."""
    b = bff()

    def dilarang(*a, **k):
        raise AssertionError("jalur Auth0 dipakai saat flag 1")
    monkeypatch.setattr(b.api, "verify_auth0_token", dilarang)
    assert not hasattr(b.ss, "_auth0_post") and not hasattr(b.ss, "konfigurasi_auth0")
    assert masuk(b).status_code == 200
    assert b.client.get("/api/v1/auth/sesi").json()["masuk"] is True
    assert b.client.get("/api/v1/akun/status").status_code == 200
    assert b.client.post("/api/v1/auth/keluar", headers=ASAL_SENDIRI).status_code == 200


def test_masuk_memeriksa_sandi_dengan_argon2_dan_ip_asli(bff):
    b = bff()
    assert masuk(b).status_code == 200
    assert b.verif == [b.utama.hash]
    assert b.akun.panggilan == ["ambil_username"]
    # Turnstile memakai IP tepercaya, bukan X-Forwarded-For mentah.
    assert b.cf.kiriman[0][1]["remoteip"] == IP_ASLI


def test_masuk_username_tidak_peka_huruf_besar_dan_spasi(bff):
    b = bff()
    assert masuk(b, username="  " + USERNAME.upper() + " ").status_code == 200


def test_ip_dari_x_real_ip_bila_header_vercel_tidak_ada(bff):
    b = bff()
    res = b.client.post("/api/v1/auth/masuk", json=kredensial(),
                        headers={"X-SAPA": "1", "Origin": ASAL, "x-real-ip": "203.0.113.9", "X-Forwarded-For": IP_PALSU,
                                 "x-vercel-forwarded-for": ""})
    assert res.status_code == 200
    assert b.cf.kiriman[-1][1]["remoteip"] == "203.0.113.9"


def test_ip_pengguna_tidak_percaya_x_forwarded_for(bff):
    b = bff()
    from types import SimpleNamespace

    def req(headers, host="10.0.0.5"):
        return SimpleNamespace(headers=headers, client=SimpleNamespace(host=host))
    assert b.api.ip_pengguna(req({"x-vercel-forwarded-for": "198.51.100.7, 10.0.0.1", "x-forwarded-for": IP_PALSU})) == IP_ASLI
    assert b.api.ip_pengguna(req({"x-real-ip": "2001:db8::1", "x-forwarded-for": IP_PALSU})) == "2001:db8::1"
    assert b.api.ip_pengguna(req({"x-forwarded-for": IP_PALSU})) == "10.0.0.5"
    assert b.api.ip_pengguna(req({"x-vercel-forwarded-for": "bukan-ip\r\nX: y"}, host="testclient")) is None


def test_setiap_masuk_memberi_id_sesi_baru_dan_mengakhiri_yang_lama(bff):
    b = bff()
    satu, dua = set_cookie(masuk(b))[0], set_cookie(masuk(b))[0]
    assert satu.split(";")[0] != dua.split(";")[0]
    [baris] = b.store.sesi.values()
    assert baris["id_hash"] == hashlib.sha256(dua.split(";")[0].split("=", 1)[1].encode()).hexdigest()
    masuk(b, client=browser_lain(b))
    assert len(b.store.sesi) == 2


# --- galat masuk: seragam untuk akun ada dan tidak ada ------------------------------------------

def _kondisi_gagal(b, kondisi):
    """Siapkan kondisi gagal kredensial; kembalikan username yang dipakai."""
    if kondisi == "sandi_salah":
        return USERNAME
    if kondisi == "akun_tidak_ada":
        return "tidak.ada@contoh.invalid"
    if kondisi == "nonaktif":
        tambah_akun(b, username="nonaktif@contoh.invalid", aktif=0)
        return "nonaktif@contoh.invalid"
    raise AssertionError(kondisi)


KONDISI_GAGAL = ["sandi_salah", "akun_tidak_ada", "nonaktif"]


@pytest.mark.parametrize("kondisi", KONDISI_GAGAL)
def test_galat_kredensial_seragam_dengan_waktu_minimum(bff, kondisi):
    b = bff()
    username = _kondisi_gagal(b, kondisi)
    res = masuk(b, username=username, password=SANDI_SALAH if kondisi == "sandi_salah" else SANDI)
    assert res.status_code == 401 and res.json() == SALAH
    assert res.headers["cache-control"] == "no-store"
    assert set_cookie(res) == [] and b.store.sesi == {}
    assert b.tidur and 0 < b.tidur[-1] <= b.ab.WAKTU_MINIMUM_GAGAL
    assert b.ab.WAKTU_MINIMUM_GAGAL == 0.7
    # Satu kali argon2 untuk setiap kondisi (hash tiruan untuk akun yang tidak ada atau tidak sah).
    assert len(b.verif) == 1


def test_akun_ada_dan_tidak_ada_identik_status_body_waktu_dan_jejak(bff, monkeypatch):
    """Sandi salah untuk akun yang ada dan username yang tidak ada: status, body, header, waktu tahan, jumlah
    argon2, operasi akun, dan urutan operasi penyimpanan sesi (ternormal) sama persis."""
    hasil = {}
    for kondisi in ("sandi_salah", "akun_tidak_ada"):
        b = bff()
        monkeypatch.setattr(b.ab, "_monoton", lambda: 100.0)
        monkeypatch.setattr(b.ss, "_acak", lambda: 1.0)
        urutan = []
        username = _kondisi_gagal(b, kondisi)
        monkeypatch.setattr(b.ss, "_store", _PerekamStore(b.store, urutan, b.jam))
        res = masuk(b, username=username, password=SANDI_SALAH)
        hasil[kondisi] = (_jejak_respons(res), list(b.tidur), len(b.verif), list(b.akun.panggilan), urutan)
    assert hasil["sandi_salah"] == hasil["akun_tidak_ada"]
    assert hasil["sandi_salah"][2] == 1 and hasil["sandi_salah"][3] == ["ambil_username"]
    assert any(r[0] == "baca_jangkar" for r in hasil["sandi_salah"][4])


def test_hash_tiruan_berparameter_sama_dengan_hash_asli(bff):
    b = bff()
    masuk(b, username="tidak.ada@contoh.invalid")
    [palsu] = b.verif
    asli = b.utama.hash
    assert palsu.split("$")[:4] == asli.split("$")[:4]  # $argon2id$v=19$m=..,t=..,p=..
    assert palsu != asli


def test_penyimpanan_akun_tidak_terjangkau_gagal_tertutup_503(bff):
    b = bff()
    b.akun.gagal = b.ak.AkunBelumSiap()
    res = masuk(b)
    assert res.status_code == 503 and res.json() == {"detail": b.ab.PESAN_BELUM_SIAP, "kode": "belum_siap"}
    assert set_cookie(res) == [] and b.verif == [] and b.tidur
    jendela = int(b.jam.waktu.timestamp() // 900)
    kunci = b.ss.jejak(f"900:gagal:username:{USERNAME}|ip:{IP_ASLI}")
    assert b.store.batas.get((kunci, jendela), 0) == 0  # slot kegagalan dikembalikan


@pytest.mark.parametrize("hapus", ["SAPA_SESI_KUNCI", "TURNSTILE_SECRET_KEY", "SAPA_AKUN_PEPPER",
                                   "SAPA_AKUN_KUNCI_MAC"])
def test_konfigurasi_belum_siap_503_tanpa_membaca_akun(bff, hapus):
    b = bff()
    import os
    os.environ.pop(hapus)
    res = masuk(b)
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert b.akun.panggilan == [] and b.verif == []


def test_penyimpanan_akun_belum_dikonfigurasi_503(bff, monkeypatch):
    b = bff()
    monkeypatch.setattr(b.ak, "_store", None)
    for nama in ("SAPA_AKUN_WORKER_URL", "SAPA_AKUN_HMAC"):
        monkeypatch.delenv(nama, raising=False)
    assert b.ak.store() is None
    res = masuk(b)
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"


@pytest.mark.parametrize("nilai", [base64.b64encode(b"pendek").decode(), "bukan base64 !!"])
def test_kunci_akun_tidak_sah_dianggap_belum_siap(bff, monkeypatch, nilai):
    b = bff()
    monkeypatch.setenv("SAPA_AKUN_PEPPER", nilai)
    assert masuk(b).status_code == 503
    assert b.akun.panggilan == []


def test_kunci_sesi_tidak_sah_dianggap_belum_siap(bff):
    b = bff(SAPA_SESI_KUNCI=base64.b64encode(b"pendek").decode())
    assert masuk(b).status_code == 503


# --- turnstile ---------------------------------------------------------------------------------

@pytest.mark.parametrize("ubah", [{"success": False, "error-codes": ["invalid-input-response"]},
                                  {"hostname": "asing.example"}, {"action": "sapa_login"},
                                  {"action": "sapa_siapkan_akun"}])
def test_turnstile_ditolak_tidak_membaca_akun(bff, ubah):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, **ubah}
    res = masuk(b)
    assert res.status_code == 403 and res.json() == {"detail": b.ab.PESAN_TURNSTILE_GAGAL, "kode": "turnstile_gagal"}
    assert b.tidur and "invalid-input-response" not in res.text
    assert b.akun.panggilan == [] and b.verif == []


def test_turnstile_tidak_terjangkau_gagal_tertutup(bff):
    b = bff()
    b.cf.gagal = True
    res = masuk(b)
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert b.akun.panggilan == []


def _cek_ts(b, varian, *a, **kw):
    """cek_turnstile sinkron (verifikasi manusia) atau cek_turnstile_async (login BFF)."""
    if varian == "async":
        return asyncio.run(b.ts.cek_turnstile_async(*a, **kw))
    return b.ts.cek_turnstile(*a, **kw)


@pytest.mark.parametrize("varian", ["sinkron", "async"])
def test_cek_turnstile_menolak_localhost_di_produksi(bff, monkeypatch, varian):
    b = bff(APP_ORIGINS="https://sapa-yanfaskes.vercel.app,http://localhost:3000")
    b.cf.jawaban = {**b.cf.jawaban, "hostname": "localhost"}
    _cek_ts(b, varian, "jawaban", None, b.ts.AKSI_MASUK)
    monkeypatch.setenv("VERCEL_ENV", "production")
    with pytest.raises(b.ts.TurnstileGagal) as err:
        _cek_ts(b, varian, "jawaban", None, b.ts.AKSI_MASUK)
    assert err.value.status == 403


@pytest.mark.parametrize("varian", ["sinkron", "async"])
def test_cek_turnstile_kunci_idempotensi_opsional(bff, varian):
    b = bff()
    _cek_ts(b, varian, "jawaban", "198.51.100.7", b.ts.AKSI_MASUK)
    assert "idempotency_key" not in b.cf.kiriman[-1][1] and b.cf.kiriman[-1][1]["remoteip"] == "198.51.100.7"
    _cek_ts(b, varian, "jawaban", None, b.ts.AKSI_MASUK, idempotency_key="kunci-1")
    assert b.cf.kiriman[-1][1]["idempotency_key"] == "kunci-1" and "remoteip" not in b.cf.kiriman[-1][1]
    assert b.cf.kiriman[-1][0] == b.ts.TURNSTILE_URL


@pytest.mark.parametrize("jawaban,alasan", [((200, {"success": False, "error-codes": ["timeout-or-duplicate"]}),
                                             (403, "kedaluwarsa")),
                                            ((200, {"success": False, "error-codes": ["invalid-input-response"]}),
                                             (403, "ditolak")),
                                            ((500, {"success": True}), (503, "tidak terjangkau")),
                                            ((200, ["bukan", "objek"]), (503, "tidak terjangkau"))])
def test_cek_turnstile_async_memetakan_jawaban_sama_dengan_sinkron(bff, monkeypatch, jawaban, alasan):
    import httpx
    b = bff()
    status, body = jawaban
    transport = httpx.MockTransport(lambda r: httpx.Response(status, json=body))
    monkeypatch.setattr(b.ts, "_klien_siteverify", lambda: httpx.AsyncClient(transport=transport))

    class Jawaban:
        status_code = status

        def json(_):
            return body
    monkeypatch.setattr(b.ts, "_kirim", lambda url, data=None, timeout=None: Jawaban())
    for varian in ("sinkron", "async"):
        with pytest.raises(b.ts.TurnstileGagal) as err:
            _cek_ts(b, varian, "jawaban", IP_ASLI, b.ts.AKSI_MASUK)
        assert (err.value.status, err.value.alasan) == alasan, varian


def test_aksi_turnstile_masuk_dan_siapkan_akun_berbeda():
    from api import turnstile
    assert turnstile.AKSI_MASUK == "login"
    assert turnstile.AKSI_SIAPKAN_AKUN == "sapa_siapkan_akun"


def test_token_turnstile_sekali_pakai_dijamin_sapa(bff):
    b = bff()
    assert masuk(b, turnstile_token="token-sama").status_code == 200
    b.jam.maju(seconds=1)
    res = masuk(b, client=browser_lain(b), turnstile_token="token-sama")
    assert res.status_code == 403
    assert res.json() == {"detail": b.ab.PESAN_TURNSTILE_KEDALUWARSA, "kode": "turnstile_kedaluwarsa"}
    assert b.akun.panggilan == ["ambil_username"]
    # Hash dicatat SEBELUM siteverify: token yang sudah dipakai tidak dikirim lagi ke Cloudflare.
    assert len(b.cf.kiriman) == 1


def test_token_turnstile_dicatat_sebelum_siteverify_dan_berumur_5_menit(bff):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    assert masuk(b, turnstile_token="token-x").status_code == 403
    b.cf.jawaban = {**b.cf.jawaban, "success": True}
    res = masuk(b, turnstile_token="token-x")
    assert res.json()["kode"] == "turnstile_kedaluwarsa" and len(b.cf.kiriman) == 1
    assert b.ab.UMUR_TURNSTILE == 300
    kunci = (b.ss.jejak("sekali:turnstile:token-x"), 0)
    assert b.store.kedaluwarsa_batas[kunci] == b.jam.waktu + timedelta(seconds=300)
    assert all("token-x" not in k for k in b.store.batas)


def test_turnstile_timeout_or_duplicate_menjadi_kedaluwarsa(bff):
    b = bff()
    b.cf.jawaban = {"success": False, "error-codes": ["timeout-or-duplicate"]}
    res = masuk(b)
    assert res.status_code == 403
    assert res.json() == {"detail": b.ab.PESAN_TURNSTILE_KEDALUWARSA, "kode": "turnstile_kedaluwarsa"}
    assert b.akun.panggilan == [] and b.tidur


def test_varian_token_turnstile_ditolak_tanpa_siteverify(bff):
    b = bff()
    for varian in ("token dengan spasi", "token​", "tøken"):
        res = masuk(b, turnstile_token=varian)
        assert res.status_code == 403 and res.json()["kode"] == "turnstile_gagal"
    assert b.cf.kiriman == []


def test_tenggat_total_siteverify_503_tanpa_membaca_akun(bff, monkeypatch):
    b = bff()
    assert b.ab.TENGGAT_SITEVERIFY == 5
    pasang_cloudflare(monkeypatch, b.ts, b.cf, tunda=0.3)
    monkeypatch.setattr(b.ab, "TENGGAT_SITEVERIFY", 0.05)
    mulai = time.monotonic()
    res = masuk(b)
    assert time.monotonic() - mulai < 0.25
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert b.akun.panggilan == [] and b.cf.kiriman == []


def test_siteverify_lambat_dibatalkan_tanpa_kerja_tertinggal(bff, monkeypatch):
    b = bff()
    pasang_cloudflare(monkeypatch, b.ts, b.cf, tunda=0.6)

    async def jalan():
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(b.ts.cek_turnstile_async("jawaban", IP_ASLI, b.ts.AKSI_MASUK), 0.1)
        await asyncio.sleep(0.8)
    asyncio.run(jalan())
    assert b.cf.kiriman == []


# --- pembatas ----------------------------------------------------------------------------------

def test_pembatas_per_ip_20_per_menit(bff):
    b = bff()
    for i in range(20):
        assert masuk(b, username=f"user{i}@contoh.invalid").status_code == 401
        b.jam.maju(seconds=1)  # di bawah kuota global login per detik
    res = masuk(b, username="user-lain@contoh.invalid")
    assert res.status_code == 429 and res.json() == TERLALU_BANYAK and "retry-after" not in res.headers
    # Batas 20/menit dihitung setelah siteverify, jadi akun tidak dibaca untuk percobaan ke-21.
    assert len(b.cf.kiriman) == 21 and len(b.akun.panggilan) == 20
    b.jam.maju(minutes=1, seconds=1)
    assert masuk(b).status_code == 200


def test_pembatas_kasar_per_ip_dihitung_sebelum_turnstile(bff):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    for _ in range(60):
        assert masuk(b).status_code == 403
    res = masuk(b)
    assert res.status_code == 429 and res.json() == TERLALU_BANYAK
    assert len(b.cf.kiriman) == 60


def test_tanpa_penguncian_per_akun_kegagalan_lintas_ip(bff):
    """Kegagalan dari banyak IP tidak mengunci akun: pemilik akun tetap bisa masuk dari IP-nya sendiri."""
    b = bff()
    for i in range(60):
        res = masuk(b, password=SANDI_SALAH, header={"x-vercel-forwarded-for": f"198.51.100.{i + 10}"})
        assert res.status_code == 401 and res.json() == SALAH
        b.jam.maju(seconds=1)
    assert len(b.akun.panggilan) == 60
    assert masuk(b, header={"x-vercel-forwarded-for": "203.0.113.5"}).status_code == 200


def test_pembatas_per_username_dan_ip_10_gagal_per_15_menit(bff):
    b = bff()
    for _ in range(10):
        assert masuk(b, password=SANDI_SALAH).status_code == 401
        b.jam.maju(seconds=4)
    # Normalisasi: huruf besar, spasi, dan bentuk NFKC dihitung sebagai username yang sama.
    res = masuk(b, username="  " + USERNAME.upper() + " ", password=SANDI_SALAH)
    assert res.status_code == 429 and res.json() == TERLALU_BANYAK and "retry-after" not in res.headers
    assert len(b.akun.panggilan) == 10
    # Sandi benar dari IP yang sama juga tertahan selama jendela berjalan (tanpa membaca akun).
    assert masuk(b).status_code == 429 and len(b.akun.panggilan) == 10
    # IP lain dan username lain dari IP yang sama tidak ikut tertahan.
    assert masuk(b, header={"x-vercel-forwarded-for": "203.0.113.5"}).status_code == 200
    assert masuk(b, username="petugas.lain@contoh.invalid", password=SANDI_SALAH).status_code == 401
    # Penanda lengket: jendela 15 menit sudah lewat, tetapi kegagalan tetap terlalu_banyak.
    b.jam.maju(minutes=31)
    assert masuk(b, password=SANDI_SALAH).status_code == 429
    # Login sukses dari IP itu memadamkan penanda; kegagalan berikutnya kembali sandi_salah.
    b.jam.maju(seconds=4)
    assert masuk(b).status_code == 200
    b.jam.maju(seconds=4)
    assert masuk(b, password=SANDI_SALAH).status_code == 401


def test_pembatas_username_ip_tidak_lolos_di_pergantian_jendela(bff):
    b = bff()
    b.jam.maju(minutes=14, seconds=20)
    for _ in range(10):
        assert masuk(b, password=SANDI_SALAH).status_code == 401
        b.jam.maju(seconds=4)
    assert b.jam.waktu.minute == 15 and b.jam.waktu.second == 0
    assert masuk(b, password=SANDI_SALAH).status_code == 429
    assert len(b.akun.panggilan) == 10


def test_pembatas_username_ip_ternormal_nfkc(bff):
    b = bff()
    for _ in range(10):
        assert masuk(b, password=SANDI_SALAH).status_code == 401
        b.jam.maju(seconds=4)
    lebar = "".join(chr(ord(c) + 0xFEE0) if c not in ".@" else c for c in USERNAME)  # huruf fullwidth
    assert lebar != USERNAME and b.ab.normal_username(lebar) == USERNAME
    assert masuk(b, username=lebar, password=SANDI_SALAH).status_code == 429


def test_pembatas_per_username_dan_ip_hanya_menghitung_gagal(bff):
    b = bff()
    for _ in range(15):
        assert masuk(b).status_code == 200  # sukses tidak dihitung
        b.jam.maju(seconds=4)
    b.jam.maju(minutes=1)
    # Kegagalan non-kredensial (Turnstile, penyimpanan akun bermasalah, kuota global) juga tidak dihitung.
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    for _ in range(5):
        assert masuk(b).status_code == 403
        b.jam.maju(seconds=4)
    b.cf.jawaban = {**b.cf.jawaban, "success": True}
    b.akun.gagal = b.ak.AkunBelumSiap()
    for _ in range(5):
        assert masuk(b).status_code == 503
        b.jam.maju(seconds=4)
    b.akun.gagal = None
    b.jam.maju(minutes=1)
    for _ in range(5):
        for _ in range(b.ss.BATAS_GLOBAL_LOGIN[1]):
            asyncio.run(b.ss.batas(b.ss.KUNCI_GLOBAL_LOGIN, *b.ss.BATAS_GLOBAL_LOGIN))
        res = masuk(b)
        assert res.status_code == 429 and res.json()["kode"] == "terlalu_banyak"
        b.jam.maju(seconds=4)
    b.jam.maju(minutes=1)
    for _ in range(10):
        assert masuk(b, password=SANDI_SALAH).status_code == 401
        b.jam.maju(seconds=4)
    assert masuk(b, password=SANDI_SALAH).status_code == 429


def test_peringatan_30_gagal_per_jam_per_username_tanpa_memblokir(bff, monkeypatch, caplog):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    caplog.set_level(logging.INFO)
    for i in range(31):
        res = masuk(b, password=SANDI_SALAH, header={"x-vercel-forwarded-for": f"198.51.100.{i + 10}"})
        assert res.status_code == 401  # tidak memblokir
        b.jam.maju(seconds=10)
    peringatan = [r for r in caplog.records if r.levelno == logging.WARNING and "30" in r.getMessage()
                  and b.ab.ringkas_username(USERNAME) in r.getMessage()]
    assert len(peringatan) == 1
    ditandai = [e for e in tercatat if "peringatan=gagal_" in e["target"]]
    assert len(ditandai) == 1 and tercatat.index(ditandai[0]) == 29
    blob = json.dumps(tercatat) + "\n".join(r.getMessage() for r in caplog.records)
    assert USERNAME not in blob and SANDI_SALAH not in blob


def test_pembatas_global_login_3_per_detik(bff):
    b = bff()
    maks = b.ss.BATAS_GLOBAL_LOGIN[1]
    assert b.ss.BATAS_GLOBAL_LOGIN == (1, 3)
    for i in range(maks):
        res = masuk(b, header={"x-vercel-forwarded-for": f"198.51.100.{i + 10}"}, username=f"u{i}@contoh.invalid")
        assert res.status_code == 401
    res = masuk(b, header={"x-vercel-forwarded-for": "198.51.100.50"})
    assert res.status_code == 429 and res.json() == TERLALU_BANYAK
    assert len(b.verif) == maks


def test_batas_menghitung_per_jendela(bff):
    b = bff()
    hasil = [asyncio.run(b.ss.batas("kunci-uji", 60, 3)) for _ in range(4)]
    assert hasil == [True, True, True, False]
    assert all("kunci-uji" not in k for k in b.store.batas)


def test_pembatas_ip_ipv6_dihitung_per_prefiks_64(bff):
    b = bff()
    for i in range(20):
        res = masuk(b, header={"x-vercel-forwarded-for": f"2001:db8::{i + 1:x}"}, username=f"user{i}@contoh.invalid")
        assert res.status_code == 401
        b.jam.maju(seconds=1)
    assert masuk(b, header={"x-vercel-forwarded-for": "2001:db8::ffff:1"}).status_code == 429
    # /64 lain tidak ikut terbatas; Turnstile tetap menerima IP penuh.
    assert masuk(b, header={"x-vercel-forwarded-for": "2001:db8:0:1::1"}).status_code == 200
    assert b.cf.kiriman[-1][1]["remoteip"] == "2001:db8:0:1::1"


def test_hitungan_kumulatif_direset_login_sukses(bff):
    b = bff()
    for _ in range(9):
        b.jam.maju(minutes=5)
        assert masuk(b, password=SANDI_SALAH).json() == SALAH
    b.jam.maju(minutes=5)
    assert masuk(b).status_code == 200
    for _ in range(10):
        b.jam.maju(minutes=5)
        assert masuk(b, password=SANDI_SALAH).json() == SALAH
    b.jam.maju(minutes=5)
    assert masuk(b, password=SANDI_SALAH).json() == TERLALU_BANYAK


def test_penanda_lengket_bertahan_30_hari_sejak_gagal_terakhir(bff):
    b = bff()
    for _ in range(10):
        assert masuk(b, password=SANDI_SALAH).status_code == 401
        b.jam.maju(seconds=4)
    b.jam.maju(days=29)
    assert masuk(b, password=SANDI_SALAH).json() == TERLALU_BANYAK
    b.jam.maju(days=30, minutes=1)
    assert masuk(b, password=SANDI_SALAH).json() == SALAH


# --- urutan deret gagal identik untuk akun ada dan tidak ada --------------------------------------

AKUN_KOSONG = "tidak.ada@contoh.invalid"


def _deret(b, username, n, jeda_detik):
    hasil = []
    for _ in range(n):
        b.jam.maju(seconds=jeda_detik)
        hasil.append(_jejak_respons(masuk(b, username=username, password=SANDI_SALAH)))
    return hasil


def _kode(deret):
    return [json.loads(body)["kode"] for _, body, _ in deret]


def _bandingkan_akun(bff, jalankan):
    hasil = {}
    for u in (USERNAME, AKUN_KOSONG):
        b = bff()
        hasil[u] = jalankan(b, u)
    return hasil[USERNAME], hasil[AKUN_KOSONG]


def test_akun_ada_dan_tidak_ada_identik_percobaan_berjeda_120_detik(bff):
    ada, kosong = _bandingkan_akun(bff, lambda b, u: _deret(b, u, 12, 120))
    assert ada == kosong
    assert _kode(ada) == ["sandi_salah"] * 10 + ["terlalu_banyak"] * 2


def test_akun_ada_dan_tidak_ada_identik_9_gagal_jeda_31_menit_lalu_2_gagal(bff):
    def jalankan(b, u):
        hasil = _deret(b, u, 9, 4)
        b.jam.maju(minutes=31)
        return hasil + _deret(b, u, 2, 4)
    ada, kosong = _bandingkan_akun(bff, jalankan)
    assert ada == kosong
    assert _kode(ada) == ["sandi_salah"] * 11


def test_batas_50_username_unik_gagal_per_ip_per_hari(bff):
    b = bff()
    for i in range(b.ab.BATAS_USERNAME_UNIK_IP[1]):
        assert masuk(b, username=f"pengguna.{i}@contoh.invalid").status_code == 401
        b.jam.maju(seconds=4)
    res = masuk(b, username="pengguna.baru@contoh.invalid")
    assert res.status_code == 429 and res.json() == TERLALU_BANYAK
    # Username yang sudah punya hitungan gagal hidup tetap dijawab sandi_salah.
    b.jam.maju(seconds=4)
    assert masuk(b, username="pengguna.0@contoh.invalid").json() == SALAH


def test_semua_jawaban_terlalu_banyak_seragam_tanpa_retry_after(bff):
    jejak = {}

    def kasar(b):
        b.cf.jawaban = {**b.cf.jawaban, "success": False}
        for _ in range(60):
            masuk(b)
        return masuk(b)

    def per_ip(b):
        for i in range(20):
            masuk(b, username=f"user{i}@contoh.invalid")
            b.jam.maju(seconds=1)
        return masuk(b)

    def username_ip(b):
        for _ in range(10):
            masuk(b, password=SANDI_SALAH)
            b.jam.maju(seconds=4)
        return masuk(b)

    def penanda(b):
        username_ip(b)
        b.jam.maju(minutes=31)
        return masuk(b, password=SANDI_SALAH)

    def global_login(b):
        for _ in range(b.ss.BATAS_GLOBAL_LOGIN[1]):
            asyncio.run(b.ss.batas(b.ss.KUNCI_GLOBAL_LOGIN, *b.ss.BATAS_GLOBAL_LOGIN))
        return masuk(b)

    def username_unik_ip(b):
        for i in range(b.ab.BATAS_USERNAME_UNIK_IP[1]):
            masuk(b, username=f"pengguna.{i}@contoh.invalid")
            b.jam.maju(seconds=4)
        return masuk(b, username="pengguna.baru@contoh.invalid")

    for picu in (kasar, per_ip, username_ip, penanda, global_login, username_unik_ip):
        jejak[picu.__name__] = _jejak_respons(picu(bff()))
    pertama = jejak["kasar"]
    assert pertama[0] == 429 and json.loads(pertama[1]) == TERLALU_BANYAK and pertama[2]["retry-after"] is None
    assert all(v == pertama for v in jejak.values()), jejak


# --- bentuk permintaan --------------------------------------------------------------------------

def test_get_dan_query_string_ditolak_tanpa_memanggil_layanan(bff):
    b = bff()
    get = b.client.get(f"/api/v1/auth/masuk?username={USERNAME}&password={SANDI}", headers=HEADER)
    assert get.status_code == 405 and SANDI not in get.text
    query = b.client.post(f"/api/v1/auth/masuk?password={SANDI}", json=kredensial(), headers=HEADER)
    assert query.status_code == 400 and SANDI not in query.text
    assert b.akun.panggilan == [] and b.cf.kiriman == []


@pytest.mark.parametrize("body", [
    {"username": USERNAME, "turnstile_token": "x"},
    {"username": "", "password": SANDI, "turnstile_token": "x"},
    {"username": USERNAME, "password": SANDI},
    {"username": USERNAME, "password": SANDI * 100, "turnstile_token": "x"},
    {"username": ["a"], "password": SANDI, "turnstile_token": "x"},
    {"username": USERNAME, "password": SANDI, "turnstile_token": "x", "ingat": "ya"},
    [SANDI],
])
def test_bentuk_tidak_sah_400_tanpa_memantulkan_isian(bff, body):
    b = bff()
    res = b.client.post("/api/v1/auth/masuk", json=body, headers=HEADER)
    assert res.status_code == 400 and res.json() == ISIAN
    assert SANDI not in res.text and USERNAME not in res.text
    assert b.akun.panggilan == [] and b.cf.kiriman == []


@pytest.mark.parametrize("ubah", [
    {"lain": "x"}, {"ingat": None}, {"ingat": 1}, {"username": "a" * 255}, {"username": "petugas\u0007uji"},
    {"password": "s" * 129}, {"password": "sandi\u0000panjang-sekali"}, {"turnstile_token": "t" * 2049},
    {"realm": "Username-Password-Authentication"},
])
def test_isian_tidak_sah_ditolak_400_satu_pesan(bff, ubah):
    b = bff()
    res = b.client.post("/api/v1/auth/masuk", json=kredensial(**ubah), headers=HEADER)
    assert res.status_code == 400 and res.json() == ISIAN
    assert b.akun.panggilan == []


def test_isian_tepat_di_batas_panjang_diterima(bff):
    b = bff()
    res = masuk(b, username="a" * 254, password="s" * 128)
    assert res.status_code == 401 and res.json() == SALAH


def test_body_bukan_json_dan_terlalu_besar_ditolak(bff):
    b = bff()
    form = b.client.post("/api/v1/auth/masuk", data={"username": USERNAME, "password": SANDI}, headers=HEADER)
    assert form.status_code == 400 and form.json() == ISIAN and SANDI not in form.text
    besar = b.client.post("/api/v1/auth/masuk", content=b"{" + b" " * 20000 + b"}",
                          headers={**HEADER, "Content-Type": "application/json"})
    assert besar.status_code == 400 and besar.json() == ISIAN
    assert b.akun.panggilan == []


@pytest.mark.parametrize("header,boleh", [
    ({"Origin": None}, False),
    ({"Origin": None, "Sec-Fetch-Site": "none"}, False),
    ({"Sec-Fetch-Site": "none"}, False),
    ({"Sec-Fetch-Site": "cross-site"}, False),
    ({"Sec-Fetch-Site": "same-site"}, False),
    ({"Origin": None, "Sec-Fetch-Site": "same-origin"}, True),
    ({"Sec-Fetch-Site": "same-origin"}, True),
    ({}, True),
    ({"Origin": "https://asing.example", "Sec-Fetch-Site": "same-origin"}, False),
    ({"X-SAPA": None}, False),
])
def test_masuk_wajib_bukti_asal_sendiri(bff, header, boleh):
    b = bff()
    kirim = {k: v for k, v in {**HEADER, **header}.items() if v is not None}
    res = b.client.post("/api/v1/auth/masuk", json=kredensial(), headers=kirim)
    if boleh:
        assert res.status_code == 200, res.text
    else:
        assert res.status_code == 403 and res.json() == {"detail": b.ab.PESAN_DITOLAK, "kode": "asal_tidak_sah"}
        assert b.cf.kiriman == [] and b.akun.panggilan == [] and b.tidur


@pytest.mark.parametrize("vercel_env,boleh", [("production", False), ("preview", True)])
def test_origin_localhost_ditolak_di_production(bff, vercel_env, boleh):
    b = bff(APP_ORIGINS=f"{ASAL},http://localhost:3000", VERCEL_ENV=vercel_env)
    res = masuk(b, header={"Origin": "http://localhost:3000"})
    assert (res.status_code == 200) is boleh
    if not boleh:
        assert res.json()["kode"] == "asal_tidak_sah"


def test_ip_klien_kosong_di_vercel_503_sebelum_turnstile(bff):
    b = bff()
    res = b.client.post("/api/v1/auth/masuk", json=kredensial(),
                        headers={"X-SAPA": "1", "Origin": ASAL, "X-Forwarded-For": IP_PALSU, "x-vercel-forwarded-for": ""})
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert b.cf.kiriman == [] and b.akun.panggilan == [] and b.tidur


def test_handler_422_global_tidak_memantulkan_input(bff):
    b = bff()
    res = b.client.post("/api/v1/verifikasi-manusia", json={"state": SANDI})
    assert res.status_code == 422
    assert SANDI not in res.text
    assert res.json()["detail"]
    assert res.headers["cache-control"] == "no-store"


def _picu_kode(b, kode):
    if kode == "sandi_salah":
        return masuk(b, password=SANDI_SALAH)
    if kode == "terlalu_banyak":
        for _ in range(10):
            masuk(b, password=SANDI_SALAH)
            b.jam.maju(seconds=4)
        return masuk(b, password=SANDI_SALAH)
    if kode == "turnstile_gagal":
        b.cf.jawaban = {**b.cf.jawaban, "success": False}
    elif kode == "turnstile_kedaluwarsa":
        b.cf.jawaban = {"success": False, "error-codes": ["timeout-or-duplicate"]}
    elif kode == "belum_siap":
        b.akun.gagal = b.ak.AkunBelumSiap()
    elif kode == "asal_tidak_sah":
        return masuk(b, header={"Origin": "https://asing.example"})
    elif kode == "isian_tidak_sah":
        return b.client.post("/api/v1/auth/masuk", json={"username": USERNAME, "turnstile_token": "x"}, headers=HEADER)
    return masuk(b)


@pytest.mark.parametrize("kode", ["sandi_salah", "terlalu_banyak", "turnstile_gagal", "turnstile_kedaluwarsa",
                                  "belum_siap", "asal_tidak_sah", "isian_tidak_sah"])
def test_semua_respons_gagal_masuk_memuat_kode_stabil(bff, kode):
    b = bff()
    res = _picu_kode(b, kode)
    status, pesan = b.ab.KODE[kode]
    assert res.status_code == status and res.json() == {"detail": pesan, "kode": kode}
    assert res.headers["cache-control"] == "no-store" and set_cookie(res) == []


def test_kode_mfa_auth0_tidak_ada_lagi(bff):
    assert "mfa" not in bff().ab.KODE


def test_durasi_gagal_melewati_minimum_dibulatkan_ke_kelipatan_dan_dicatat(bff, monkeypatch, caplog):
    b = bff()
    waktu = iter([100.0, 101.25])
    monkeypatch.setattr(b.ab, "_monoton", lambda: next(waktu))
    caplog.set_level(logging.INFO)
    assert masuk(b, password=SANDI_SALAH).json() == SALAH
    assert b.tidur == [pytest.approx(0.2)]  # 1,25 dibulatkan ke 1,45 (0,7 + 3 x 0,25)
    assert any("melewati batas minimum" in r.getMessage() for r in caplog.records)


def test_waktu_tahan_gagal_minimum_lalu_kelipatan_250_ms(bff):
    ab = bff().ab
    assert [ab.waktu_tahan_gagal(d) for d in (0.0, 0.7, 0.71, 0.95, 0.96)] == [0.7, 0.7, 0.95, 0.95, 1.2]


def test_galat_tak_terduga_di_masuk_tetap_503_seragam(bff, monkeypatch, caplog):
    b = bff()

    async def meledak(*a, **k):
        raise RuntimeError(SANDI)
    monkeypatch.setattr(b.ss, "buat_sesi_lokal", meledak)
    caplog.set_level(logging.DEBUG)
    res = masuk(b)
    assert res.status_code == 503 and res.json() == {"detail": b.ab.PESAN_BELUM_SIAP, "kode": "belum_siap"}
    assert res.headers["cache-control"] == "no-store" and b.tidur
    assert SANDI not in "\n".join(r.getMessage() for r in caplog.records)


def test_db_mati_di_pembatas_menjadi_503_dengan_jeda(bff, monkeypatch):
    b = bff()

    async def rusak(*a, **k):
        raise OSError("db mati")
    monkeypatch.setattr(b.store, "tambah_batas", rusak)
    res = masuk(b)
    assert res.status_code == 503 and res.json() == {"detail": b.ab.PESAN_BELUM_SIAP, "kode": "belum_siap"}
    assert b.tidur and b.akun.panggilan == []


# --- log ---------------------------------------------------------------------------------------

def test_sandi_username_dan_hash_tidak_pernah_dicatat(bff, caplog):
    b = bff()
    caplog.set_level(logging.DEBUG)
    masuk(b)
    masuk(b, password=SANDI_SALAH)
    masuk(b, username="tidak.ada@contoh.invalid")
    b.client.post("/api/v1/auth/masuk", json={"username": USERNAME, "password": SANDI}, headers=HEADER)
    teks = "\n".join(r.getMessage() for r in caplog.records)
    for rahasia in (SANDI, SANDI_SALAH, USERNAME, "tidak.ada", "$argon2", b.utama.mac, KUNCI_A):
        assert rahasia not in teks


def test_jejak_log_dan_pembatas_memakai_hmac_berkunci(bff, monkeypatch):
    b = bff()
    satu = b.ab.ringkas_username(USERNAME)
    assert len(satu) == 12 and satu != hashlib.sha256(USERNAME.encode()).hexdigest()[:12]
    asyncio.run(b.ss.batas("ip:198.51.100.7", 60, 20))
    assert all(k != hashlib.sha256(b"60:ip:198.51.100.7").hexdigest() for k, _ in b.store.batas)
    monkeypatch.setenv("SAPA_SESI_KUNCI", KUNCI_B)
    assert b.ab.ringkas_username(USERNAME) != satu


def test_header_ip_vercel_hanya_dipercaya_di_vercel(bff, monkeypatch):
    b = bff(VERCEL=None)
    from types import SimpleNamespace
    req = SimpleNamespace(headers={"x-vercel-forwarded-for": IP_ASLI, "x-real-ip": IP_ASLI},
                          client=SimpleNamespace(host="10.0.0.5"))
    assert b.api.ip_pengguna(req) == "10.0.0.5"
    monkeypatch.setenv("VERCEL_ENV", "preview")
    assert b.api.ip_pengguna(req) == IP_ASLI


# --- /sesi -------------------------------------------------------------------------------------

def test_sesi_tanpa_cookie(bff):
    b = bff()
    res = b.client.get("/api/v1/auth/sesi")
    assert res.status_code == 200 and res.json() == {"masuk": False}
    assert res.headers["cache-control"] == "no-store"


def test_sesi_dengan_cookie_memuat_peran_dan_nama_tanpa_rahasia(bff):
    b = bff()
    masuk(b)
    res = b.client.get("/api/v1/auth/sesi")
    assert res.status_code == 200
    assert res.json() == {"masuk": True, "peran": "super_admin", "nama": USERNAME}
    assert "$argon2" not in res.text and b.utama.id not in res.text
    assert res.headers["cache-control"] == "no-store"


def test_sesi_cookie_asal_dihapus(bff):
    b = bff()
    res = b.client.get("/api/v1/auth/sesi", headers={"Cookie": f"{COOKIE}=nilai-palsu-yang-tidak-ada"})
    assert res.status_code == 200 and res.json() == {"masuk": False, "kode": "sesi_berakhir"}
    [hapus] = set_cookie(res)
    assert "max-age=0" in hapus.lower()


def test_sesi_db_bermasalah_503_belum_siap(bff, monkeypatch):
    b = bff()
    masuk(b)

    async def rusak(*a, **k):
        raise OSError("db mati")
    monkeypatch.setattr(b.store, "ambil", rusak)
    res = b.client.get("/api/v1/auth/sesi")
    assert res.status_code == 503 and res.json() == {"detail": b.ab.PESAN_BELUM_SIAP, "kode": "belum_siap"}
    assert set_cookie(res) == []


def test_sesi_penyimpanan_akun_mati_503_tanpa_mengakhiri_sesi(bff):
    b = bff()
    masuk(b)
    b.akun.gagal = b.ak.AkunBelumSiap()
    res = b.client.get("/api/v1/auth/sesi")
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert b.client.get("/api/v1/akun/status").status_code == 503
    assert len(b.store.sesi) == 1
    b.akun.gagal = None
    assert b.client.get("/api/v1/akun/status").status_code == 200


# --- keluar ------------------------------------------------------------------------------------

def test_keluar_menghapus_sesi_dan_cookie(bff):
    b = bff()
    masuk(b)
    assert len(b.store.sesi) == 1
    res = b.client.post("/api/v1/auth/keluar", headers=ASAL_SENDIRI)
    assert res.status_code == 200 and res.json() == {"keluar": True}
    assert b.store.sesi == {}
    [hapus] = set_cookie(res)
    assert "max-age=0" in hapus.lower()
    assert res.headers["clear-site-data"] == '"cookies", "storage"'
    assert b.client.get("/api/v1/auth/sesi").json() == {"masuk": False}


def test_keluar_tanpa_x_sapa_ditolak(bff):
    b = bff()
    masuk(b)
    res = b.client.post("/api/v1/auth/keluar")
    assert res.status_code == 403 and res.json() == {"detail": b.ab.PESAN_DITOLAK, "kode": "asal_tidak_sah"}
    assert len(b.store.sesi) == 1


def test_hapus_semua_sesi_user(bff):
    b = bff()
    masuk(b)
    masuk(b, client=browser_lain(b))
    assert asyncio.run(b.ss.hapus_semua_sesi_user("sapa|" + b.utama.id)) == 2
    assert b.store.sesi == {}


# --- require_auth lewat cookie -----------------------------------------------------------------

def test_require_auth_lewat_cookie_untuk_get(bff):
    b = bff()
    masuk(b)
    assert b.client.get("/api/v1/akun/status").status_code == 200


def test_post_lewat_cookie_wajib_bukti_asal(bff):
    b = bff()
    masuk(b)
    tanpa = b.client.post("/api/v1/auth/send-verification-email", json=BODY_EMAIL)
    assert tanpa.status_code == 403 and tanpa.json()["kode"] == "asal_tidak_sah"
    for header in ({"X-SAPA": "1", "Origin": "https://asing.example"}, {"X-SAPA": "1", "Sec-Fetch-Site": "cross-site"},
                   {"X-SAPA": "1"}, {"X-SAPA": "1", "Sec-Fetch-Site": "none"}):
        assert b.client.post("/api/v1/auth/send-verification-email", json=BODY_EMAIL, headers=header).status_code == 403
    for header in (ASAL_SENDIRI, {"X-SAPA": "1", "Sec-Fetch-Site": "same-origin"}):
        res = b.client.post("/api/v1/auth/send-verification-email", json=BODY_EMAIL, headers=header)
        assert res.status_code not in (401, 403)


@pytest.mark.parametrize("dengan_cookie", [False, True])
def test_bearer_auth0_ditolak_tanpa_syarat_saat_flag_1(bff, monkeypatch, dengan_cookie):
    """Bearer Auth0 tidak pernah menjadi identitas saat flag 1; tanpa sesi cookie jawabannya 401."""
    b = bff()

    def dilarang(*a, **k):
        raise AssertionError("verifikasi JWT Auth0 dipanggil saat flag 1")
    bearer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['super_admin']})}"}
    monkeypatch.setattr(b.api, "verify_auth0_token", dilarang)
    if dengan_cookie:
        masuk(b)
        # Bearer diabaikan; identitas dari cookie, jadi mutasi tetap wajib bukti asal.
        res = b.client.post("/api/v1/auth/send-verification-email", json=BODY_EMAIL, headers=bearer)
        assert res.status_code == 403 and res.json()["kode"] == "asal_tidak_sah"
    else:
        for jalur in ("/api/v1/akun/status", "/api/v1/audit-log", "/api/v1/auth/siap"):
            res = b.client.get(jalur, headers=bearer)
            assert res.status_code in (401, 200), jalur
            assert "cek" not in res.text
        assert b.client.get("/api/v1/akun/status", headers=bearer).status_code == 401


def test_sesi_absolut_tanpa_ingat_kedaluwarsa_12_jam(bff):
    b = bff()
    masuk(b, ingat=False)
    for _ in range(11):
        b.jam.maju(hours=1)
        assert b.client.get("/api/v1/akun/status").status_code == 200
    b.jam.maju(hours=1, minutes=1)
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 401 and res.json()["kode"] == "sesi_berakhir"
    assert b.store.sesi == {}


def test_sesi_tanpa_ingat_menganggur_2_jam_ditolak(bff):
    b = bff()
    masuk(b, ingat=False)
    b.jam.maju(hours=1, minutes=50)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    b.jam.maju(hours=2, minutes=1)
    assert b.client.get("/api/v1/akun/status").status_code == 401


def test_batas_sesi_bisa_diatur_lewat_env(bff):
    b = bff(SAPA_SESI_IDLE_MENIT="10", SAPA_SESI_TANPA_INGAT_JAM="1")
    masuk(b, ingat=False)
    b.jam.maju(minutes=11)
    assert b.client.get("/api/v1/akun/status").status_code == 401


def test_sesi_ingat_30_hari_lalu_kedaluwarsa(bff):
    b = bff()
    masuk(b, ingat=True)
    b.jam.maju(days=29)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    b.jam.maju(days=1, minutes=1)
    assert b.client.get("/api/v1/akun/status").status_code == 401


def test_revalidasi_membaca_akun_setiap_permintaan(bff):
    b = bff()
    masuk(b)
    b.akun.panggilan.clear()
    for _ in range(3):
        assert b.client.get("/api/v1/akun/status").status_code == 200
    assert b.akun.panggilan == ["ambil_id"] * 3


@pytest.mark.parametrize("ubah", ["nonaktif", "hapus"])
def test_akun_nonaktif_atau_hilang_sesi_langsung_401(bff, ubah):
    b = bff()
    masuk(b)
    if ubah == "nonaktif":
        b.akun_mentah.akun[b.utama.id] = b.ak.baris_dari(b.ak.dengan_mac(b.utama, aktif=0))
    else:
        del b.akun_mentah.akun[b.utama.id]
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 401 and res.json()["kode"] == "sesi_berakhir"
    assert b.store.sesi == {}
    assert b.client.get("/api/v1/auth/sesi").json() == {"masuk": False}


def test_sesi_dengan_versi_sandi_lama_langsung_401(bff):
    b = bff()
    masuk(b)
    baru = b.ak.dengan_mac(b.utama, versi_sandi=b.utama.versi_sandi + 1)
    b.akun_mentah.akun[b.utama.id] = b.ak.baris_dari(baru)
    assert b.client.get("/api/v1/akun/status").status_code == 401


def test_sesi_lama_berisi_token_auth0_ditolak_dan_dihapus(bff):
    """Baris sesi dari login Auth0 sebelumnya (berisi access token) tidak berlaku di jalur akun lokal."""
    b = bff()
    cookie = nilai_cookie(masuk(b))
    [baris] = b.store.sesi.values()
    baris["token_enc"] = b.ss._enkripsi({"at": "eyJ.lama.token", "rt": "rt-lama"}, baris["id_hash"])
    res = b.client.get("/api/v1/akun/status", headers={"Cookie": f"{COOKIE}={cookie}"})
    assert res.status_code == 401 and res.json()["kode"] == "sesi_berakhir"
    assert b.store.sesi == {}


def test_kunci_lama_masih_bisa_dekripsi(bff, monkeypatch):
    b = bff()
    masuk(b)
    monkeypatch.setenv("SAPA_SESI_KUNCI", KUNCI_B)
    monkeypatch.setenv("SAPA_SESI_KUNCI_LAMA", KUNCI_A)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    # Setelah terbaca dengan kunci lama, isi sesi dienkripsi ulang dengan kunci baru.
    monkeypatch.delenv("SAPA_SESI_KUNCI_LAMA")
    assert b.client.get("/api/v1/akun/status").status_code == 200


def test_enkripsi_terikat_pada_id_sesi(bff):
    b = bff()
    tambah_akun(b, username="lain@contoh.invalid")
    masuk(b, client=browser_lain(b))
    masuk(b, username="lain@contoh.invalid")
    satu, dua = list(b.store.sesi.values())
    satu["token_enc"], dua["token_enc"] = dua["token_enc"], satu["token_enc"]
    # Isi yang tidak bisa dibuka tidak pernah diterima (gagal tertutup, 503).
    assert b.client.get("/api/v1/akun/status").status_code == 503


def test_kunci_salah_pasang_tidak_menghapus_sesi_maupun_cookie(bff, monkeypatch):
    b = bff()
    masuk(b)
    monkeypatch.setenv("SAPA_SESI_KUNCI", KUNCI_B)
    assert b.client.get("/api/v1/akun/status").status_code == 503
    res = b.client.get("/api/v1/auth/sesi")
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert set_cookie(res) == [] and len(b.store.sesi) == 1
    monkeypatch.setenv("SAPA_SESI_KUNCI", KUNCI_A)
    assert b.client.get("/api/v1/akun/status").status_code == 200


def test_db_sesi_bermasalah_menjadi_503(bff, monkeypatch):
    b = bff()
    masuk(b)

    async def rusak(*a, **k):
        raise OSError("db mati")
    monkeypatch.setattr(b.store, "ambil", rusak)
    assert b.client.get("/api/v1/akun/status").status_code == 503


def test_401_permintaan_bercookie_berkode_sesi_berakhir(bff):
    b = bff()
    masuk(b)
    asyncio.run(b.ss.hapus_semua_sesi_user("sapa|" + b.utama.id))
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 401 and res.json()["kode"] == "sesi_berakhir"
    assert res.headers["cache-control"] == "no-store"
    res = browser_lain(b).get("/api/v1/akun/status")
    assert res.status_code == 401 and res.json() == {"detail": "Silakan masuk terlebih dahulu"}


def test_flag_mati_401_tetap_tanpa_kode(bff):
    b = bff(SAPA_LOGIN_BFF="0")
    res = b.client.get("/api/v1/akun/status", headers={"Cookie": f"{COOKIE}={'a' * 43}"})
    assert res.status_code == 401 and res.json() == {"detail": "Silakan masuk terlebih dahulu"}


def test_idle_admin_disiapkan_tetapi_nonaktif_bila_env_kosong(bff):
    b = bff()
    assert b.ss.IDLE_ADMIN_USULAN_MENIT == 30
    assert b.ss.batas_menganggur_admin() is None
    masuk(b, ingat=True)
    b.jam.maju(minutes=90)
    assert b.client.get("/api/v1/akun/status").status_code == 200


def test_idle_admin_berlaku_bila_env_diisi(bff):
    b = bff(SAPA_SESI_IDLE_ADMIN_MENIT="30")
    assert b.ss.batas_menganggur_admin() == timedelta(minutes=30)
    masuk(b, ingat=True)
    b.jam.maju(minutes=29)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    b.jam.maju(minutes=31)
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 401 and res.json()["kode"] == "sesi_berakhir"
    tambah_akun(b, username="viewer@contoh.invalid", peran="viewer")
    masuk(b, username="viewer@contoh.invalid", ingat=True)
    b.jam.maju(minutes=45)
    assert b.client.get("/api/v1/auth/sesi").json()["masuk"] is True


# --- /siap -------------------------------------------------------------------------------------

def test_siap_tanpa_login_tanpa_rincian(bff):
    b = bff()
    res = b.client.get("/api/v1/auth/siap")
    assert res.status_code == 200 and res.json() == {"siap": True}


def test_siap_super_admin_melihat_rincian_tanpa_nilai_rahasia(bff, monkeypatch):
    b = bff()
    masuk(b)
    monkeypatch.delenv("TURNSTILE_SECRET_KEY")
    res = b.client.get("/api/v1/auth/siap")
    assert res.status_code == 200
    assert res.json() == {"siap": False, "cek": {"kunci": True, "db": True, "akun": True, "turnstile": False}}
    for rahasia in (KUNCI_A, "kunci-turnstile-uji"):
        assert rahasia not in res.text


def test_siap_anonim_memakai_hasil_sementara(bff, monkeypatch):
    b = bff()
    hitung = []

    async def cek():
        hitung.append(1)
    monkeypatch.setattr(b.store, "cek", cek)
    waktu = [100.0]
    monkeypatch.setattr(b.ab, "_monoton", lambda: waktu[0])
    for _ in range(3):
        assert b.client.get("/api/v1/auth/siap").json() == {"siap": True}
    assert len(hitung) == 1
    waktu[0] += 31
    b.client.get("/api/v1/auth/siap")
    assert len(hitung) == 2


# --- audit -------------------------------------------------------------------------------------

def test_masuk_dan_keluar_tercatat_di_audit_tanpa_username(bff, monkeypatch):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    masuk(b, password=SANDI_SALAH)
    masuk(b)
    b.client.post("/api/v1/auth/keluar", headers=ASAL_SENDIRI)
    assert [(e["action"], e["status"]) for e in tercatat] == [
        ("POST /api/v1/auth/masuk", 401), ("POST /api/v1/auth/masuk", 200), ("POST /api/v1/auth/keluar", 200)]
    assert tercatat[1]["actor"] == "sapa|" + b.utama.id and tercatat[1]["ip"] == "198.51.100.0"
    blob = json.dumps(tercatat)
    assert USERNAME not in blob and SANDI not in blob


def test_audit_masuk_mencatat_hash_username_ip_tersamar_dan_kode(bff, monkeypatch):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    jejak = b.ab.ringkas_username(USERNAME)
    masuk(b, password=SANDI_SALAH)
    masuk(b)
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    masuk(b, username="lain.lagi@contoh.invalid")
    masuk(b, header={"Origin": "https://asing.example"})
    gagal, sukses, turnstile_gagal, asal = tercatat
    assert gagal["target"] == f"/api/v1/auth/masuk u={jejak} hasil=sandi_salah" and gagal["status"] == 401
    assert sukses["target"] == f"/api/v1/auth/masuk u={jejak} hasil=berhasil"
    assert turnstile_gagal["target"].endswith("hasil=turnstile_gagal")
    assert asal["target"] == "/api/v1/auth/masuk hasil=asal_tidak_sah"
    assert all(e["ip"] == "198.51.100.0" for e in tercatat)
    blob = json.dumps(tercatat)
    for rahasia in (USERNAME, "lain.lagi", SANDI, "$argon2", "jawaban-turnstile"):
        assert rahasia not in blob


def test_audit_mencatat_429_dari_masuk_lewat_middleware(bff, monkeypatch):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    for i in range(21):
        masuk(b, username=f"pengguna{i}@contoh.invalid")
        b.jam.maju(seconds=1)
    assert ("POST /api/v1/auth/masuk", 429) in [(e["action"], e["status"]) for e in tercatat]
    assert "pengguna20" not in json.dumps(tercatat)


def test_audit_flag_mati_404_auth_tidak_dicatat(bff, monkeypatch):
    b = bff(SAPA_LOGIN_BFF=None)
    tercatat = catat_audit(monkeypatch)
    assert b.client.get("/api/v1/auth/masuk").status_code == 404
    assert b.client.post("/api/v1/auth/keluar").status_code == 404
    assert b.client.post("/api/v1/auth/masuk", json=kredensial()).status_code == 404
    assert b.client.post("/api/v1/auth/siapkan-akun", json={}).status_code == 404
    assert tercatat == []


def test_audit_flag_hidup_get_masuk_405_tidak_dicatat(bff, monkeypatch):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    assert b.client.get("/api/v1/auth/masuk").status_code == 405
    assert tercatat == []


def test_audit_masuk_tanpa_ip_tepercaya_mencatat_ip_kosong(bff, monkeypatch):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    b.client.post("/api/v1/auth/masuk", json=kredensial(),
                  headers={"X-SAPA": "1", "Origin": ASAL, "X-Forwarded-For": "203.0.113.77", "x-vercel-forwarded-for": ""})
    assert tercatat and tercatat[-1]["ip"] == ""


def test_galat_422_dan_500_tidak_mencetak_body_ke_log(bff, caplog):
    b = bff()
    caplog.set_level(logging.DEBUG)
    rusak = b.client.post("/api/v1/auth/masuk", content=json.dumps({"username": USERNAME, "password": SANDI}).encode() + b"}",
                          headers={**HEADER, "Content-Type": "application/json"})
    assert rusak.status_code == 400 and SANDI not in rusak.text
    teks = "\n".join(r.getMessage() + str(r.args) + (r.exc_text or "") for r in caplog.records)
    assert SANDI not in teks and USERNAME not in teks


# --- penyimpanan Postgres ----------------------------------------------------------------------

class KoneksiPalsuDasar:
    """Bagian asyncpg.Connection yang dipakai daftar koneksi siaga: is_closed() dan terminate()."""
    tertutup = False

    def is_closed(self):
        return self.tertutup

    def terminate(self):
        self.tertutup = True


def test_postgres_store_menyimpan_hash_dan_tidak_meninggalkan_koneksi_terbuka(bff, monkeypatch):
    b = bff()
    dsn = "postgresql://uji@db.invalid/sapa"
    kueri, dibuka, ditutup = [], [], []

    class Koneksi(KoneksiPalsuDasar):
        async def execute(self, sql, *args):
            kueri.append((sql, args))
            return "DELETE 3" if "WHERE sub" in sql else "INSERT 0 1"

        async def fetchrow(self, sql, *args):
            kueri.append((sql, args))
            return None

        async def fetchval(self, sql, *args):
            kueri.append((sql, args))
            return 1

        async def close(self):
            ditutup.append(1)

    async def sambung(alamat, **kw):
        assert alamat == dsn
        dibuka.append(1)
        return Koneksi()

    import asyncpg
    monkeypatch.setattr(asyncpg, "connect", sambung)
    monkeypatch.setattr(b.ss, "_store", b.ss.PostgresSesiStore(dsn))
    cookie = asyncio.run(b.ss.buat_sesi_lokal("akun-uji-1", 3, USERNAME, "super_admin", True))
    for tabel in ("sapa_sesi", "sapa_batas", "akun_jangkar"):
        assert f"CREATE TABLE IF NOT EXISTS {tabel}" in kueri[0][0]
    [(_, args)] = [k for k in kueri if k[0].startswith("INSERT INTO sapa_sesi")]
    teks = json.dumps(args, default=str)
    assert cookie not in teks and USERNAME not in teks
    assert args[0] == hashlib.sha256(cookie.encode()).hexdigest() and args[1] == "sapa|akun-uji-1" and args[2] is True
    assert args[6].startswith("v2.")  # penanda versi kunci
    assert asyncio.run(b.ss.hapus_semua_sesi_user("sapa|akun-uji-1")) == 3
    asyncio.run(b.ss.batas("kunci-uji", 60, 5))
    assert asyncio.run(b.ss.ambil_sesi_lokal(cookie)) is None
    assert dibuka and len(dibuka) == len(ditutup)


def test_store_dipilih_dari_env(bff, monkeypatch):
    b = bff()
    monkeypatch.setattr(b.ss, "_store", None)
    monkeypatch.delenv("SAPA_SESI_DATABASE_URL", raising=False)
    assert b.ss.store() is None
    monkeypatch.setenv("SAPA_SESI_DATABASE_URL", "postgresql://uji@db.invalid/sapa")
    assert isinstance(b.ss.store(), b.ss.PostgresSesiStore)


def test_masuk_memakai_satu_koneksi_db(bff, monkeypatch):
    b = bff()
    monkeypatch.setattr(b.ss, "_acak", lambda: 0.0)  # pembersihan ikut berjalan di koneksi yang sama
    dibuka, ditutup = _postgres_palsu(b, monkeypatch)
    assert masuk(b, password=SANDI_SALAH).status_code == 401
    assert dibuka == [1] and ditutup == [1]


def test_satu_koneksi_dibuka_ulang_setelah_galat(bff, monkeypatch):
    b = bff()
    dibuka, ditutup = _postgres_palsu(b, monkeypatch)
    pg = b.ss.store()
    asli = pg._jalankan_di
    gagal = [True]

    async def sekali_gagal(conn, perintah):
        if gagal.pop() if gagal else False:
            raise OSError("koneksi putus")
        return await asli(conn, perintah)
    monkeypatch.setattr(pg, "_jalankan_di", sekali_gagal)

    async def jalan():
        async with b.ss.satu_koneksi():
            with pytest.raises(b.ss.SesiBelumSiap):
                await b.ss.batas("k", 60, 5)
            assert await b.ss.batas("k", 60, 5)
    asyncio.run(jalan())
    assert len(dibuka) == 2 and len(ditutup) == 1


def test_hitungan_geser(bff):
    H = bff().ss.HitunganGeser
    assert H(ini=1, lalu=10, lewat=0, jendela_detik=900, tiket=("k", 1)).perkiraan == 11
    assert H(ini=1, lalu=10, lewat=90, jendela_detik=900, tiket=("k", 1)).perkiraan == 10
    assert H(ini=3, lalu=0, lewat=10, jendela_detik=60, tiket=("k", 1)).perkiraan == 3


def test_baris_pembatas_kedaluwarsa_dibersihkan_tanpa_login_sukses(bff, monkeypatch):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    for i in range(5):
        masuk(b, header={"x-vercel-forwarded-for": f"2001:db8:{i}::1"})
    assert len(b.store.batas) >= 10
    b.jam.maju(days=2)
    monkeypatch.setattr(b.ss, "_acak", lambda: 0.0)
    masuk(b)
    assert all(v >= b.jam.waktu for v in b.store.kedaluwarsa_batas.values())


def test_pembersihan_pembatas_gagal_tidak_menggagalkan_permintaan(bff, monkeypatch):
    b = bff()

    async def rusak(*a, **k):
        raise OSError("db mati")
    monkeypatch.setattr(b.store, "bersihkan_batas", rusak)
    monkeypatch.setattr(b.ss, "_acak", lambda: 0.0)
    assert masuk(b).status_code == 200


def test_surat_kontrol_lewat_cookie_admin_wajib_csrf(bff, monkeypatch):
    b = bff()
    from datetime import date
    from test_surat_kontrol_api import FakeDrive
    drive = FakeDrive()
    monkeypatch.setattr(b.api, "_sk_drive_info", drive.info)
    monkeypatch.setattr(b.api, "_sk_drive_unduh", drive.unduh)
    monkeypatch.setattr(b.api, "_sk_drive_tulis", drive.tulis)
    monkeypatch.setattr(b.api, "_sk_simpanan", {"versi": None, "isi": None})
    monkeypatch.setattr(b.api, "_sk_hari_ini", lambda: date(2026, 11, 19))
    from test_surat_kontrol_service import kiriman, sepuluh
    tambah_akun(b, username="admin.uji@contoh.invalid", peran="admin")
    assert masuk(b, username="admin.uji@contoh.invalid").status_code == 200
    for aksi in ("periksa", "integrasikan"):
        alamat, isi = f"/api/v1/surat-kontrol/{aksi}?bulan=2026-11", kiriman(sepuluh())
        gz = {"Content-Type": "application/gzip"}
        for header in ({}, {"X-SAPA": "1", "Origin": "https://asing.example"}, {"Origin": ASAL}):
            res = b.client.post(alamat, content=isi, headers={**gz, **header})
            assert res.status_code == 403 and res.json()["kode"] == "asal_tidak_sah", header
        sah = b.client.post(alamat, content=isi, headers={**gz, **ASAL_SENDIRI})
        assert sah.status_code == 200, sah.text
    assert drive.tulis_dipanggil == 1

def _postgres_palsu(b, monkeypatch):
    dsn = "postgresql://uji@db.invalid/sapa"
    dibuka, ditutup, baris = [], [], {}

    class Koneksi(KoneksiPalsuDasar):
        async def execute(self, sql, *args):
            if sql.startswith("UPDATE sapa_batas"):
                baris[args] = max(baris.get(args, 0) - 1, 0)
            return "DELETE 0" if sql.startswith("DELETE") else "INSERT 0 1"

        async def fetchrow(self, sql, *args):
            return None

        async def fetchval(self, sql, *args):
            if sql.startswith("INSERT INTO sapa_batas"):
                baris[args[:2]] = baris.get(args[:2], 0) + 1
                return baris[args[:2]]
            if sql.startswith("SELECT jumlah FROM sapa_batas"):
                return baris.get(args)
            if "jendela = -1" in sql:  # penanda lengket belum menyala
                return None
            return 1

        async def close(self):
            ditutup.append(1)

    async def sambung(alamat, **kw):
        dibuka.append(1)
        return Koneksi()
    import asyncpg
    monkeypatch.setattr(asyncpg, "connect", sambung)
    monkeypatch.setattr(b.ss, "_store", b.ss.PostgresSesiStore(dsn))
    return dibuka, ditutup


# --- primitive asyncio hanya di dalam coroutine -----------------------------------------------------

_PRIMITIF_ASYNCIO = {"Event", "Lock", "Semaphore", "BoundedSemaphore", "Condition", "Queue", "LifoQueue",
                     "PriorityQueue", "Barrier", "Future"}


def _primitif_di_luar_coroutine(sumber: str) -> list:
    """Baris pembuatan primitive asyncio (termasuk Future) yang dievaluasi di luar coroutine.

    Dikenali: asyncio.Event(), alias modul (import asyncio as aio), atribut bertingkat (asyncio.locks.Event()),
    nama dari ImportFrom (from asyncio import Event as E, termasuk from asyncio import *), serta default
    argumen, dekorator, dan anotasi parameter atau return (dievaluasi saat def dijalankan, di cakupan luar,
    bahkan untuk async def; ditandai juga di berkas dengan from __future__ import annotations).
    """
    import ast
    pohon = ast.parse(sumber)
    modul, nama = {"asyncio"}, set()
    for simpul in ast.walk(pohon):
        if isinstance(simpul, ast.Import):
            modul |= {a.asname or a.name for a in simpul.names if a.name == "asyncio" or a.name.startswith("asyncio.")}
        elif (isinstance(simpul, ast.ImportFrom) and simpul.level == 0
              and (simpul.module or "").split(".")[0] == "asyncio"):
            if any(a.name == "*" for a in simpul.names):
                nama |= _PRIMITIF_ASYNCIO
            nama |= {a.asname or a.name for a in simpul.names if a.name in _PRIMITIF_ASYNCIO}
            modul |= {a.asname or a.name for a in simpul.names if a.name not in _PRIMITIF_ASYNCIO | {"*"}}

    def dari_asyncio(nilai) -> bool:
        while isinstance(nilai, ast.Attribute):
            nilai = nilai.value
        return isinstance(nilai, ast.Name) and nilai.id in modul

    def primitif(panggil) -> bool:
        f = panggil.func
        if isinstance(f, ast.Attribute):
            return f.attr in _PRIMITIF_ASYNCIO and dari_asyncio(f.value)
        return isinstance(f, ast.Name) and f.id in nama

    temuan = []

    def kunjungi(simpul, di_coroutine):
        if isinstance(simpul, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            # Default argumen, dekorator, dan anotasi dievaluasi di cakupan luar saat definisi dijalankan.
            argumen = simpul.args
            luar = [*argumen.defaults, *[d for d in argumen.kw_defaults if d is not None]]
            if not isinstance(simpul, ast.Lambda):
                semua = [*argumen.posonlyargs, *argumen.args, *argumen.kwonlyargs, argumen.vararg, argumen.kwarg]
                luar += [a.annotation for a in semua if a is not None and a.annotation is not None]
                luar += [simpul.returns] if simpul.returns is not None else []
                luar += simpul.decorator_list
            for anak in luar:
                kunjungi(anak, di_coroutine)
            badan = simpul.body if isinstance(simpul.body, list) else [simpul.body]
            for anak in badan:
                kunjungi(anak, isinstance(simpul, ast.AsyncFunctionDef))
            return
        if isinstance(simpul, ast.Call) and primitif(simpul) and not di_coroutine:
            temuan.append(simpul.lineno)
        for anak in ast.iter_child_nodes(simpul):
            kunjungi(anak, di_coroutine)
    kunjungi(pohon, False)
    return temuan


@pytest.mark.parametrize("sumber,harap", [
    ("import asyncio\nKUNCI = asyncio.Lock()", [2]),
    ("import asyncio\nasync def f():\n    return asyncio.Event()", []),
    ("import asyncio\ndef f():\n    return asyncio.Event()", [3]),
    ("from asyncio import Event\nTANDA = Event()", [2]),
    ("from asyncio import Event as E\nasync def f():\n    return E()", []),
    ("import asyncio\nasync def f(tanda=asyncio.Event()):\n    pass", [2]),
    ("import asyncio\ndef f(*, tanda=asyncio.Event()):\n    pass", [2]),
    ("import asyncio as aio\nTANDA = aio.Event()", [2]),
    ("import asyncio\nTANDA = asyncio.locks.Event()", [2]),
    ("from asyncio import locks\nTANDA = locks.Event()", [2]),
    # Lambda dan fungsi biasa dianggap di luar coroutine (konservatif), di mana pun didefinisikan.
    ("import asyncio\nasync def f():\n    g = lambda: asyncio.Event()\n    return g()", [3]),
    # Anotasi parameter dan return dievaluasi di cakupan luar (tanpa from __future__ import annotations);
    # tetap ditandai secara konservatif. Star import dari asyncio membawa semua nama primitive.
    ("import asyncio\ndef f(x: asyncio.Event() = None):\n    pass", [2]),
    ("import asyncio\nasync def f(*a: asyncio.Lock(), **k: asyncio.Queue()):\n    pass", [2, 2]),
    ("import asyncio\nasync def f(x, /, *, y: asyncio.Event()):\n    pass", [2]),
    ("import asyncio\nasync def f() -> asyncio.Lock():\n    pass", [2]),
    ("from asyncio import *\nTANDA = Event()", [2]),
    ("from asyncio import *\nasync def f():\n    return Event()", []),
    # Dekorator dievaluasi di cakupan tempat definisi berada (modul, badan kelas, atau coroutine luar).
    ("import asyncio\n@dekor(asyncio.Lock())\nasync def f():\n    pass", [2]),
    ("import asyncio\nclass K:\n    @dekor(asyncio.Event())\n    async def f(self):\n        pass", [3]),
    ("import asyncio\n@dekor(asyncio.Lock())\nclass K:\n    pass", [2]),
    ("import asyncio\nasync def f():\n    @dekor(asyncio.Lock())\n    def g():\n        pass\n    return g", []),
    # asyncio.Future juga terikat ke loop saat dibuat.
    ("import asyncio\nF = asyncio.Future()", [2]),
    ("import asyncio\ndef f():\n    return asyncio.futures.Future()", [3]),
    ("from asyncio import Future\nasync def f():\n    return Future()", []),
    ("from asyncio import Future as F\nTANDA = F()", [2]),
])
def test_pemeriksa_ast_primitive_asyncio_mengenali_semua_bentuk(sumber, harap):
    assert _primitif_di_luar_coroutine(sumber) == harap


def test_primitive_asyncio_hanya_dibuat_di_dalam_coroutine():
    """Di Python 3.9 asyncio.Event/Lock/... yang dibuat di luar loop terikat ke loop lain."""
    from pathlib import Path
    akar = Path(__file__).resolve().parents[1]
    lewati = {".venv", "venv", "node_modules", "__pycache__"}
    semua = sorted(p for folder in ("api", "tests") for p in (akar / folder).rglob("*.py")
                   if not lewati & set(p.relative_to(akar).parts))
    assert akar / "api" / "auth_bff.py" in semua and Path(__file__).resolve() in semua
    temuan = []
    for berkas in semua:
        temuan += [f"{berkas.relative_to(akar)}:{baris}"
                   for baris in _primitif_di_luar_coroutine(berkas.read_text(encoding="utf-8"))]
    assert temuan == []


# --- perekam operasi penyimpanan sesi --------------------------------------------------------------

class _PerekamStore:
    """Proxy store: setiap atribut publik yang callable dibungkus, lalu (nama, argumen, hasil) dicatat dalam
    bentuk ternormal. Datetime dicatat sebagai selisih terhadap jam uji, str dan bytes (kunci hash) sebagai
    label urutan kemunculan pertama (kunci0, kunci1, ...), nilai lain apa adanya."""

    def __init__(self, asli, rekaman: list, jam=None):
        self._asli, self._rekaman, self._jam, self._label = asli, rekaman, jam, {}

    def _normal(self, v):
        if isinstance(v, datetime):
            return ("selisih", v - self._jam.waktu) if self._jam else v
        if isinstance(v, (str, bytes)):
            return self._label.setdefault(v, f"kunci{len(self._label)}")
        if isinstance(v, dict):
            return tuple(sorted((k, self._normal(x)) for k, x in v.items()))
        if isinstance(v, (list, tuple)):
            return tuple(self._normal(x) for x in v)
        return v

    def _catat(self, nama, a, k, hasil):
        self._rekaman.append((nama, self._normal(a), self._normal(k), self._normal(hasil)))
        return hasil

    def __getattr__(self, nama):
        nilai = getattr(self._asli, nama)
        if nama.startswith("_") or not callable(nilai):
            return nilai
        if asyncio.iscoroutinefunction(nilai):
            async def rekam(*a, **k):
                return self._catat(nama, a, k, await nilai(*a, **k))
        else:
            def rekam(*a, **k):
                return self._catat(nama, a, k, nilai(*a, **k))
        return rekam


def _isi_batas_ternormal(b) -> list:
    """Multiset (jendela, kedaluwarsa - sekarang, nilai) baris pembatas di store memori, tanpa kunci hash."""
    return sorted((j, b.store.kedaluwarsa_batas.get((k, j)) - b.jam.waktu, n) for (k, j), n in b.store.batas.items())


def _method_publik(kelas) -> set:
    return {n for n, v in vars(kelas).items() if callable(v) and not n.startswith("_")}


def test_perekam_store_membungkus_semua_method_publik_store(bff):
    ss = bff().ss
    protokol = _method_publik(ss.SesiStore)
    assert protokol and _method_publik(ss.MemorySesiStore) == protokol
    assert _method_publik(ss.PostgresSesiStore) == protokol
    rekaman = []
    asli = ss.MemorySesiStore()
    perekam = _PerekamStore(asli, rekaman)
    for nama in sorted(protokol):
        assert getattr(perekam, nama) != getattr(asli, nama), nama
    assert asyncio.run(perekam.baca_batas("k", 1)) == 0 and rekaman == [("baca_batas", ("kunci0", 1), (), 0)]
    assert perekam.batas is asli.batas  # atribut data diteruskan apa adanya


def test_perekam_store_menormalkan_argumen_waktu_dan_kunci(bff):
    """Kunci hash berbeda dengan urutan kemunculan sama menghasilkan label sama; kedaluwarsa berbeda
    menghasilkan rekaman berbeda."""
    b = bff()

    def rekam(kunci, umur):
        rekaman = []
        perekam = _PerekamStore(b.ss.MemorySesiStore(), rekaman, b.jam)
        asyncio.run(perekam.tambah_batas(kunci, 7, b.jam.waktu + umur))
        asyncio.run(perekam.baca_batas(kunci, 7))
        return rekaman
    satu_menit = rekam("hash-a", timedelta(minutes=1))
    assert satu_menit == rekam("hash-b", timedelta(minutes=1))
    assert satu_menit[0] == ("tambah_batas", ("kunci0", 7, ("selisih", timedelta(minutes=1))), (), 1)
    assert satu_menit != rekam("hash-a", timedelta(days=30, minutes=1))


# --- penutupan koneksi bertenggat ------------------------------------------------------------------

def _postgres_koneksi_macet(b, monkeypatch, baris, tutup="macet", operasi_gagal=False, operasi_macet=False):
    """PostgresSesiStore dengan koneksi palsu yang menutup lambat (atau galat); terminate() dicatat."""
    tercatat = {"dibuka": 0, "close": 0, "terminate": 0}

    class Koneksi(KoneksiPalsuDasar):
        async def fetchrow(self, sql, *args):
            return dict(baris) if baris else None

        async def fetchval(self, sql, *args):
            if operasi_gagal:
                raise OSError("koneksi putus")
            if operasi_macet:
                await asyncio.sleep(5)
            return 1

        async def close(self):
            tercatat["close"] += 1
            if tutup == "macet":
                await asyncio.sleep(5)
            else:
                raise OSError("koneksi putus")

        def terminate(self):
            tercatat["terminate"] += 1
            self.tertutup = True
    pg = b.ss.PostgresSesiStore("postgresql://uji@db.invalid/sapa")
    pg._skema_siap = True

    async def sambung():
        tercatat["dibuka"] += 1
        return Koneksi()
    monkeypatch.setattr(pg, "_sambung", sambung)
    monkeypatch.setattr(b.ss, "_store", pg)
    return tercatat

def test_koneksi_lebih_dari_daftar_siaga_di_akhir_blok_ditutup_dalam_tenggat_dinding(bff, monkeypatch):
    b = bff()
    tercatat = _postgres_koneksi_macet(b, monkeypatch, None)
    monkeypatch.setattr(b.ss, "TENGGAT_TUTUP_DB", 3)

    async def jalan():
        kolam = b.ss._kolam_loop()
        penuh = [await b.ss.store()._sambung() for _ in range(b.ss.MAKS_KONEKSI_SIAGA)]
        async with b.ss.satu_koneksi(b.ss._monoton() + 0.1):
            await b.ss.store().cek()
            for conn in penuh:  # permintaan serentak lain lebih dulu mengembalikan koneksinya
                await kolam.kembalikan(conn, b.ss.store().dsn, 1)
            mulai = time.monotonic()
        return time.monotonic() - mulai
    assert asyncio.run(jalan()) < 0.1 + 0.15
    assert tercatat["dibuka"] == b.ss.MAKS_KONEKSI_SIAGA + 1 and tercatat["terminate"] >= 1


@pytest.mark.parametrize("tutup", ["macet", "galat"])
def test_tutup_koneksi_tanpa_tenggat_dibatasi_tenggat_tutup(bff, monkeypatch, tutup):
    b = bff()
    tercatat = _postgres_koneksi_macet(b, monkeypatch, None, tutup)
    assert b.ss.TENGGAT_TUTUP_DB == 2
    monkeypatch.setattr(b.ss, "TENGGAT_TUTUP_DB", 0.1)

    async def jalan():
        async with b.ss.satu_koneksi():
            await b.ss.store().cek()
    mulai = time.monotonic()
    asyncio.run(jalan())
    assert time.monotonic() - mulai < 0.1 + 0.15
    assert tercatat == {"dibuka": 1, "close": 1, "terminate": 1}


@pytest.mark.parametrize("batas_akhir", [None, 0.1])
def test_tutup_koneksi_rusak_di_tengah_blok_ikut_tenggat(bff, monkeypatch, batas_akhir):
    """Koneksi yang rusak di tengah satu_koneksi() dibuang oleh _urutan dan langsung dihentikan, tanpa menunggu
    close() maupun command_timeout asyncpg."""
    b = bff()
    tercatat = _postgres_koneksi_macet(b, monkeypatch, None, operasi_gagal=True)
    monkeypatch.setattr(b.ss, "TENGGAT_TUTUP_DB", 0.1 if batas_akhir is None else 3)

    async def jalan():
        batas = None if batas_akhir is None else b.ss._monoton() + batas_akhir
        async with b.ss.satu_koneksi(batas):
            with pytest.raises(b.ss.SesiBelumSiap):
                await b.ss.batas("k", 60, 5)
    mulai = time.monotonic()
    asyncio.run(jalan())
    assert time.monotonic() - mulai < 0.1 + 0.15
    assert tercatat == {"dibuka": 1, "close": 0, "terminate": 1}


def test_tutup_koneksi_normal_tidak_dihentikan_paksa(bff, monkeypatch):
    b = bff()
    dibuka, ditutup = _postgres_palsu(b, monkeypatch)

    async def jalan():
        async with b.ss.satu_koneksi(batas_akhir=b.ss._monoton() + 5):
            await b.ss.batas("k", 60, 5)
    asyncio.run(jalan())
    assert dibuka == [1] and ditutup == [1]


# --- koneksi tanpa satu_koneksi(): penutupan bertenggat --------------------------------------------

@pytest.mark.parametrize("tutup", ["macet", "galat"])
def test_tutup_koneksi_tanpa_wadah_bertenggat_dan_hasil_operasi_tetap_dipakai(bff, monkeypatch, tutup):
    """Di luar satu_koneksi(), close() yang lambat atau galat tidak menggagalkan operasi yang sudah berhasil:
    penutupan dibatasi TENGGAT_TUTUP_DB, lalu terminate()."""
    b = bff()
    tercatat = _postgres_koneksi_macet(b, monkeypatch, None, tutup)
    monkeypatch.setattr(b.ss, "TENGGAT_TUTUP_DB", 0.1)
    mulai = time.monotonic()
    assert asyncio.run(b.ss.store().baca_batas("k", 1)) == 1
    assert time.monotonic() - mulai < 0.1 + 0.15
    assert tercatat == {"dibuka": 1, "close": 1, "terminate": 1}


def test_tutup_koneksi_tanpa_wadah_saat_operasi_galat_bertenggat(bff, monkeypatch):
    b = bff()
    tercatat = _postgres_koneksi_macet(b, monkeypatch, None, "macet", operasi_gagal=True)
    monkeypatch.setattr(b.ss, "TENGGAT_TUTUP_DB", 0.1)
    mulai = time.monotonic()
    with pytest.raises(b.ss.SesiBelumSiap):
        asyncio.run(b.ss.batas("k", 60, 5))
    assert time.monotonic() - mulai < 0.1 + 0.15
    assert tercatat == {"dibuka": 1, "close": 0, "terminate": 1}  # galat koneksi: langsung dihentikan


def test_tutup_koneksi_tanpa_wadah_saat_dibatalkan_dihentikan_tanpa_close(bff, monkeypatch):
    b = bff()
    tercatat = _postgres_koneksi_macet(b, monkeypatch, None, "macet", operasi_macet=True)

    async def jalan():
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(b.ss.store().baca_batas("k", 1), 0.05)
    mulai = time.monotonic()
    asyncio.run(jalan())
    assert time.monotonic() - mulai < 0.05 + 0.15
    assert tercatat == {"dibuka": 1, "close": 0, "terminate": 1}


def test_tutup_koneksi_tanpa_wadah_normal_tidak_dihentikan_paksa(bff, monkeypatch, caplog):
    b = bff()
    dibuka, ditutup = _postgres_palsu(b, monkeypatch)
    with caplog.at_level(logging.WARNING, logger="sapa-api"):
        asyncio.run(b.ss.store().cek())
    assert dibuka == [1] and ditutup == [1]
    assert not [r for r in caplog.records if "Koneksi penyimpanan sesi" in r.getMessage()]

# --- executor DNS per loop ---------------------------------------------------------------------------

def test_executor_dns_dipasang_sekali_per_loop_dan_dipakai_getaddrinfo(monkeypatch):
    import socket
    import threading

    import sesi_service as ss
    dibuat = []
    asli = ss._buat_executor_dns

    def buat():
        dibuat.append(1)
        return asli()
    monkeypatch.setattr(ss, "_buat_executor_dns", buat)
    thread_dns = []

    def getaddrinfo_palsu(*a, **k):
        thread_dns.append(threading.current_thread().name)
        return []
    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo_palsu)

    async def jalan():
        ss.pasang_executor_dns()
        ss.pasang_executor_dns()
        await asyncio.get_running_loop().getaddrinfo("db.invalid", 5432)
    asyncio.run(jalan())
    assert dibuat == [1] and len(thread_dns) == 1 and thread_dns[0].startswith("sapa-dns")
    asyncio.run(jalan())  # loop baru: executor baru
    assert dibuat == [1, 1]
    executor = asli()
    try:
        assert executor._max_workers == ss.MAKS_THREAD_DNS == 64
    finally:
        executor.shutdown()


def test_executor_dns_tidak_menimpa_executor_kustom_yang_sudah_ada():
    """Executor bawaan yang dipasang pihak lain sebelum panggilan pertama dipertahankan."""
    import threading
    import sesi_service as ss
    from concurrent.futures import ThreadPoolExecutor
    kustom = ThreadPoolExecutor(max_workers=2, thread_name_prefix="kustom")

    async def jalan():
        loop = asyncio.get_running_loop()
        loop.set_default_executor(kustom)
        ss.pasang_executor_dns()
        ss.pasang_executor_dns()
        return loop._default_executor, await loop.run_in_executor(None, lambda: threading.current_thread().name)
    try:
        dipakai, nama = asyncio.run(jalan())
    finally:
        kustom.shutdown()
    assert dipakai is kustom and nama.startswith("kustom")


def test_executor_dns_mengganti_executor_otomatis_asyncio_dan_mematikannya():
    """Executor otomatis asyncio (dibuat run_in_executor(None) sebelum panggilan pertama) diganti; tugas yang
    sedang berjalan di executor lama tetap selesai dan executor lama tidak menerima tugas baru."""
    import threading
    import sesi_service as ss

    async def jalan():
        loop = asyncio.get_running_loop()
        mulai, lanjut = threading.Event(), threading.Event()

        def tugas():
            mulai.set()
            lanjut.wait(5)
            return "selesai"
        berjalan = loop.run_in_executor(None, tugas)
        await loop.run_in_executor(None, mulai.wait, 5)
        lama = loop._default_executor
        ss.pasang_executor_dns()
        lanjut.set()
        baru = loop._default_executor
        nama = await loop.run_in_executor(None, lambda: threading.current_thread().name)
        with pytest.raises(RuntimeError):
            lama.submit(lambda: None)
        return lama, baru, await berjalan, nama
    lama, baru, hasil, nama = asyncio.run(jalan())
    assert lama is not baru and lama._thread_name_prefix == "asyncio"
    assert hasil == "selesai" and nama.startswith("sapa-dns") and baru._max_workers == 64


def test_executor_dns_tanpa_loop_berjalan_tidak_melakukan_apa_pun(monkeypatch):
    import sesi_service as ss
    dibuat = []
    monkeypatch.setattr(ss, "_buat_executor_dns", lambda: dibuat.append(1))
    ss.pasang_executor_dns()
    assert dibuat == []


def test_executor_dns_dipasang_saat_masuk_dan_tidak_saat_flag_mati(bff, monkeypatch):
    b = bff()
    dipasang = []
    monkeypatch.setattr(b.ss, "pasang_executor_dns", lambda: dipasang.append("dns"))
    assert masuk(b).status_code == 200
    assert dipasang
    b = bff(SAPA_LOGIN_BFF=None)
    dipasang.clear()
    monkeypatch.setattr(b.ss, "pasang_executor_dns", lambda: dipasang.append("dns"))
    for jalur in ("/api/v1/health", "/api/v1/auth/mode"):
        assert b.client.get(jalur).status_code == 200
    assert masuk(b).status_code == 404
    assert dipasang == []

