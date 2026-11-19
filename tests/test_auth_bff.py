"""Login satu halaman (BFF): masuk lewat server SAPA, sesi di server, cookie __Host-sapa_sesi.

Semua panggilan ke Auth0, Cloudflare Turnstile, dan Postgres dipalsukan; tes tidak memakai jaringan.
"""
import asyncio
import base64
import hashlib
import itertools
import json
import logging
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from test_api_auth import load_api, token

SANDI = "Sandi-Rahasia-Uji-42!"
USERNAME = "petugas.uji"
IP_ASLI = "198.51.100.7"
IP_PALSU = "1.2.3.4"
KUNCI_A = base64.b64encode(b"a" * 32).decode()
KUNCI_B = base64.b64encode(b"b" * 32).decode()
COOKIE = "__Host-sapa_sesi"
PESAN_SALAH = "Nama pengguna atau kata sandi salah."
SALAH = {"detail": PESAN_SALAH, "kode": "sandi_salah"}
ISIAN = {"detail": "Isian masuk tidak lengkap atau tidak sah.", "kode": "isian_tidak_sah"}

ENV = {
    "AUTH0_DOMAIN": "sapa.test.auth0.com",
    "SAPA_LOGIN_BFF": "1",
    "AUTH0_LOGIN_CLIENT_ID": "klien-login-uji",
    "AUTH0_LOGIN_CLIENT_SECRET": "rahasia-klien-login-uji",
    "AUTH0_LOGIN_REALM": "SAPA-Staging-DB",
    "TURNSTILE_SECRET_KEY": "kunci-turnstile-uji",
    "SAPA_SESI_KUNCI": KUNCI_A,
    "APP_ORIGINS": "https://sapa-yanfaskes.vercel.app",
    "VERCEL": "1",  # header IP Vercel hanya dipercaya saat berjalan di Vercel
}
_ENV_LAIN = ("SAPA_LOGIN_BFF", "SAPA_TERIMA_BEARER", "SAPA_SESI_KUNCI", "SAPA_SESI_KUNCI_LAMA", "SAPA_SESI_DATABASE_URL",
             "SAPA_SESI_IDLE_MENIT", "SAPA_SESI_TANPA_INGAT_JAM", "AUTH0_LOGIN_CLIENT_ID", "AUTH0_LOGIN_CLIENT_SECRET",
             "AUTH0_LOGIN_REALM", "TURNSTILE_SECRET_KEY", "APP_ORIGINS", "VERCEL", "VERCEL_ENV",
             "SAPA_SESI_IDLE_ADMIN_MENIT")


class Jam:
    def __init__(self):
        # Awal jendela menit dan 15 menit, supaya hitungan pembatas tidak terbelah batas jendela.
        self.waktu = datetime(2026, 11, 19, 1, 0, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.waktu

    def maju(self, **selisih):
        self.waktu += timedelta(**selisih)


class Auth0Palsu:
    """Pengganti sesi_service._auth0_post: mencatat kiriman, menjawab sesuai antrean."""

    def __init__(self, api):
        self.api = api
        self.kiriman = []
        self.jawaban_token = None  # (status, body) untuk /oauth/token password-realm
        self.jawaban_segar = None
        self.peran = ["super_admin"]

    def token_baru(self, **klaim):
        return token(self.api, **{self.api.ROLES_CLAIM: self.peran, "sub": "auth0|petugas1", "iat": int(time.time()), **klaim})

    async def __call__(self, path, data, headers=None):
        self.kiriman.append((path, dict(data), dict(headers or {})))
        if path == "/oauth/revoke":
            return 200, {}
        if data.get("grant_type") == "refresh_token":
            if self.jawaban_segar:
                return self.jawaban_segar
            return 200, {"access_token": self.token_baru(), "expires_in": 600}
        if self.jawaban_token:
            return self.jawaban_token
        return 200, {"access_token": self.token_baru(), "refresh_token": "rt-rahasia-uji", "expires_in": 600,
                     "token_type": "Bearer"}

    def panggilan(self, grant=None, path=None):
        return [k for k in self.kiriman if (path is None or k[0] == path)
                and (grant is None or k[1].get("grant_type") == grant)]


class CloudflarePalsu:
    def __init__(self, ts):
        self.ts = ts
        self.jawaban = {"success": True, "hostname": "sapa-yanfaskes.vercel.app", "action": ts.AKSI_MASUK}
        self.gagal = False
        self.kiriman = []
        self.timeout = []

    def __call__(self, url, data=None, timeout=None):
        self.kiriman.append((url, dict(data or {})))
        self.timeout.append(timeout)
        if self.gagal:
            raise self.ts.requests.ConnectionError("tidak terjangkau")
        jawaban = self.jawaban

        class Jawaban:
            status_code = 200

            def json(_):
                return jawaban
        return Jawaban()


def transport_cloudflare(cf, tunda=0.0):
    """Transport httpx palsu untuk siteverify async: menunggu `tunda` detik, lalu meneruskan data form dan
    timeout per tahap ke CloudflarePalsu. Pembatalan oleh tenggat menghentikannya sebelum kiriman tercatat."""
    import httpx
    from urllib.parse import parse_qsl

    async def tangani(permintaan):
        if tunda:
            await asyncio.sleep(tunda)
        tahap = [v for v in (permintaan.extensions.get("timeout") or {}).values() if v is not None]
        try:
            jawaban = cf(str(permintaan.url), data=dict(parse_qsl(permintaan.content.decode())),
                         timeout=max(tahap) if tahap else None)
        except cf.ts.requests.ConnectionError:
            raise httpx.ConnectError("tidak terjangkau", request=permintaan) from None
        return httpx.Response(jawaban.status_code, json=jawaban.json())
    return httpx.MockTransport(tangani)


def pasang_cloudflare(monkeypatch, ts, cf, tunda=0.0):
    """Klien siteverify asli (timeout per tahap dari kode) dengan transport palsu."""
    asli = getattr(ts._klien_siteverify, "asli", ts._klien_siteverify)

    def klien():
        return asli(transport=transport_cloudflare(cf, tunda))
    klien.asli = asli
    monkeypatch.setattr(ts, "_klien_siteverify", klien)


@pytest.fixture
def bff(monkeypatch):
    for nama in _ENV_LAIN:
        monkeypatch.delenv(nama, raising=False)

    def muat(**ubah):
        env = {**ENV, **ubah}
        for nama in [k for k, v in env.items() if v is None]:
            env.pop(nama)
            monkeypatch.delenv(nama, raising=False)
        api = load_api(monkeypatch, **env)
        ss, ab, ts = api.sesi_service, api.auth_bff, api.turnstile
        jam = Jam()
        store = ss.MemorySesiStore()
        monkeypatch.setattr(ss, "_store", store)
        monkeypatch.setattr(ss, "_sekarang", jam)
        auth0 = Auth0Palsu(api)
        monkeypatch.setattr(ss, "_auth0_post", auth0)
        cf = CloudflarePalsu(ts)
        monkeypatch.setattr(ts, "_kirim", cf)  # cek_turnstile sinkron (verifikasi manusia, flag 0)
        pasang_cloudflare(monkeypatch, ts, cf)  # cek_turnstile_async (login BFF)
        tidur = []

        async def tidur_palsu(detik):
            tidur.append(detik)
        monkeypatch.setattr(ab, "_tidur", tidur_palsu)
        client = klien_uji(api)
        return type("Bff", (), dict(api=api, ss=ss, ab=ab, ts=ts, jam=jam, store=store, auth0=auth0, cf=cf,
                                    tidur=tidur, client=client))
    return muat


_URUT = itertools.count()


def kredensial(**ubah):
    # Token Turnstile sekali pakai, jadi setiap percobaan memakai token baru.
    body = {"username": USERNAME, "password": SANDI, "ingat": False, "turnstile_token": f"jawaban-turnstile-{next(_URUT)}"}
    body.update(ubah)
    return body


ASAL = "https://sapa-yanfaskes.vercel.app"
# /masuk wajib membawa bukti asal (Origin sendiri atau Sec-Fetch-Site: same-origin), seperti browser sungguhan.
HEADER = {"X-SAPA": "1", "Origin": ASAL, "x-vercel-forwarded-for": IP_ASLI, "X-Forwarded-For": IP_PALSU}


def masuk(b, header=None, client=None, **ubah):
    return (client or b.client).post("/api/v1/auth/masuk", json=kredensial(**ubah), headers={**HEADER, **(header or {})})


def klien_uji(api):
    # Di Vercel setiap permintaan membawa x-vercel-forwarded-for; tes yang butuh header itu kosong mengisinya "".
    return TestClient(api.app, base_url="https://testserver", raise_server_exceptions=False,
                      headers={"x-vercel-forwarded-for": IP_ASLI})


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


ASAL_SENDIRI = {"X-SAPA": "1", "Origin": ASAL}
BODY_EMAIL = {"to_email": "uji@example.com", "verification_url": "https://sapa-yanfaskes.vercel.app"}


# --- flag mati ---------------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", [("post", "/api/v1/auth/masuk"), ("get", "/api/v1/auth/sesi"),
                                         ("post", "/api/v1/auth/keluar"), ("get", "/api/v1/auth/siap"),
                                         ("get", "/api/v1/auth/masuk")])
def test_flag_mati_endpoint_tidak_ada(bff, method, path):
    b = bff(SAPA_LOGIN_BFF=None)
    res = getattr(b.client, method)(path, headers=HEADER)
    assert res.status_code == 404
    assert b.auth0.kiriman == [] and b.cf.kiriman == []


def test_flag_mati_cookie_diabaikan_dan_bearer_tetap_jalan(bff):
    b = bff()
    cookie = set_cookie(masuk(b))[0].split(";")[0].split("=", 1)[1]
    b = bff(SAPA_LOGIN_BFF="0")
    tanpa = b.client.get("/api/v1/akun/status", headers={"Cookie": f"{COOKIE}={cookie}"})
    assert tanpa.status_code == 401
    bearer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['viewer']})}"}
    assert b.client.get("/api/v1/akun/status", headers=bearer).status_code == 200


def test_flag_mati_galat_422_tetap_seperti_lama(bff):
    b = bff(SAPA_LOGIN_BFF=None)
    res = b.client.post("/api/v1/verifikasi-manusia", json={"state": "isian-lama"})
    assert res.status_code == 422 and "isian-lama" in res.text


# --- masuk sukses ------------------------------------------------------------------------------

@pytest.mark.parametrize("ingat,max_age", [(True, "Max-Age=2592000"), (False, None)])
def test_masuk_sukses_memasang_cookie_aman(bff, ingat, max_age):
    b = bff()
    res = masuk(b, ingat=ingat)
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "no-store"
    assert res.json()["masuk"] is True
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
    # Respons tidak membawa token Auth0 apa pun.
    assert "rt-rahasia-uji" not in res.text and "access_token" not in res.text and "eyJ" not in res.text
    # Id sesi disimpan sebagai sha256 dari nilai cookie; token Auth0 terenkripsi.
    [baris] = b.store.sesi.values()
    assert baris["id_hash"] == hashlib.sha256(nilai.encode()).hexdigest()
    assert nilai not in json.dumps(baris, default=str)
    assert "rt-rahasia-uji" not in json.dumps(baris, default=str)
    assert baris["sub"] == "auth0|petugas1" and baris["ingat"] is ingat


def test_masuk_meneruskan_ke_auth0_dengan_realm_dari_env_dan_ip_asli(bff):
    b = bff()
    # Field sisipan (realm/audience/client_id) kini ditolak seluruhnya, dan Auth0 tidak dipanggil.
    assert masuk(b, realm="Username-Password-Authentication", audience="https://lain.example",
                 client_id="klien-lain").status_code == 400
    assert b.auth0.panggilan(path="/oauth/token") == []
    assert masuk(b).status_code == 200
    [(path, data, header)] = b.auth0.panggilan(path="/oauth/token")
    assert path == "/oauth/token"
    assert data["grant_type"] == "http://auth0.com/oauth/grant-type/password-realm"
    assert data["realm"] == "SAPA-Staging-DB"
    assert data["client_id"] == "klien-login-uji" and data["client_secret"] == "rahasia-klien-login-uji"
    assert data["audience"] == b.api.AUTH0_API_AUDIENCE
    assert data["scope"] == "openid offline_access"
    assert data["username"] == USERNAME and data["password"] == SANDI
    assert header["auth0-forwarded-for"] == IP_ASLI
    # Turnstile memakai IP yang sama, bukan X-Forwarded-For mentah.
    assert b.cf.kiriman[0][1]["remoteip"] == IP_ASLI


def test_ip_dari_x_real_ip_bila_header_vercel_tidak_ada(bff):
    b = bff()
    res = b.client.post("/api/v1/auth/masuk", json=kredensial(),
                        headers={"X-SAPA": "1", "Origin": ASAL, "x-real-ip": "203.0.113.9", "X-Forwarded-For": IP_PALSU,
                                 "x-vercel-forwarded-for": ""})
    assert res.status_code == 200
    assert b.auth0.panggilan(path="/oauth/token")[0][2]["auth0-forwarded-for"] == "203.0.113.9"


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


# --- galat masuk -------------------------------------------------------------------------------

@pytest.mark.parametrize("jawaban", [
    (403, {"error": "invalid_grant", "error_description": "Wrong email or password."}),
    (401, {"error": "unauthorized", "error_description": "user is blocked"}),
    (403, {"error": "access_denied", "error_description": "Diblokir Action"}),
    (403, {"error": "password_leaked"}),
    (401, {"error": "blocked"}),
    (400, {"error": "invalid_user_password"}),
])
def test_galat_sandi_seragam_dengan_waktu_minimum(bff, jawaban):
    b = bff()
    b.auth0.jawaban_token = jawaban
    res = masuk(b)
    assert res.status_code == 401
    assert res.json() == SALAH
    assert res.headers["cache-control"] == "no-store"
    assert set_cookie(res) == [] and b.store.sesi == {}
    assert b.tidur and 0 < b.tidur[-1] <= b.ab.WAKTU_MINIMUM_GAGAL
    assert b.ab.WAKTU_MINIMUM_GAGAL == 0.7


def test_mfa_required_tidak_dipetakan_ke_sandi_salah(bff):
    b = bff()
    b.auth0.jawaban_token = (403, {"error": "mfa_required", "mfa_token": "mfa-rahasia"})
    res = masuk(b)
    assert res.status_code == 403
    assert res.json() == {"detail": "Akun ini memakai verifikasi dua langkah yang belum didukung di halaman ini. "
                                    "Hubungi administrator SAPA.", "kode": "mfa"}
    assert "mfa-rahasia" not in res.text and set_cookie(res) == []


@pytest.mark.parametrize("jawaban", [(429, {"error": "too_many_requests"}), (429, None), (429, {"error": "lain"}),
                                     (429, {"error": "too_many_attempts"})])
def test_semua_429_auth0_dihitung_sebagai_kegagalan(bff, jawaban):
    """Bentuk 429 apa pun dari /oauth/token dijawab dan dihitung persis seperti too_many_attempts."""
    b = bff()
    b.auth0.jawaban_token = jawaban
    res = masuk(b)
    assert res.status_code == 401 and res.json() == SALAH and "retry-after" not in res.headers
    jendela = int(b.jam.waktu.timestamp() // 900)
    assert b.store.batas[(b.ss.jejak(f"900:gagal:username:{USERNAME}|ip:{IP_ASLI}"), jendela)] == 1  # slot tetap
    assert b.store.penanda[b.ss.jejak(f"kumulatif:gagal:username:{USERNAME}|ip:{IP_ASLI}")][0] == 1
    for _ in range(9):
        b.jam.maju(seconds=4)
        assert masuk(b).json() == SALAH
    b.jam.maju(minutes=31)
    assert masuk(b).json() == TERLALU_BANYAK  # penanda lengket menyala dari 10 kegagalan ini


@pytest.mark.parametrize("jawaban", [(500, {"error": "server_error"}), (0, None), (401, {"error": "invalid_client"}),
                                     (400, {"error": "invalid_request"}), (403, {"error": "unauthorized_client"})])
def test_auth0_bermasalah_atau_salah_atur_menjadi_503(bff, jawaban):
    b = bff()
    b.auth0.jawaban_token = jawaban
    res = masuk(b)
    assert res.status_code == 503 and set_cookie(res) == []
    assert res.json() == {"detail": b.ab.PESAN_BELUM_SIAP, "kode": "belum_siap"}
    assert "invalid_client" not in res.text


def test_token_auth0_yang_tidak_lolos_verifikasi_ditolak(bff):
    b = bff()
    b.auth0.jawaban_token = (200, {"access_token": token(b.api, aud="https://lain.example"), "refresh_token": "rt",
                                   "expires_in": 600})
    res = masuk(b)
    assert res.status_code == 503 and set_cookie(res) == [] and b.store.sesi == {}


@pytest.mark.parametrize("hapus", ["AUTH0_LOGIN_CLIENT_ID", "AUTH0_LOGIN_CLIENT_SECRET", "AUTH0_LOGIN_REALM",
                                   "SAPA_SESI_KUNCI", "TURNSTILE_SECRET_KEY"])
def test_konfigurasi_belum_siap_503_tanpa_memanggil_auth0(bff, hapus):
    b = bff(**{hapus: None})
    res = masuk(b)
    assert res.status_code == 503
    assert b.auth0.panggilan(path="/oauth/token") == []


def test_kunci_sesi_tidak_sah_dianggap_belum_siap(bff):
    b = bff(SAPA_SESI_KUNCI=base64.b64encode(b"pendek").decode())
    assert masuk(b).status_code == 503


# --- turnstile ---------------------------------------------------------------------------------

@pytest.mark.parametrize("ubah", [{"success": False, "error-codes": ["invalid-input-response"]},
                                  {"hostname": "asing.example"}, {"action": "sapa_login"},
                                  {"action": "lupa_sandi"}])
def test_turnstile_ditolak_tidak_memanggil_auth0(bff, ubah):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, **ubah}
    res = masuk(b)
    # Turnstile tidak bergantung akun, jadi boleh punya kode sendiri.
    assert res.status_code == 403 and res.json() == {"detail": b.ab.PESAN_TURNSTILE_GAGAL, "kode": "turnstile_gagal"}
    assert b.tidur
    assert "invalid-input-response" not in res.text
    assert b.auth0.panggilan(path="/oauth/token") == []


def test_turnstile_tidak_terjangkau_gagal_tertutup(bff):
    b = bff()
    b.cf.gagal = True
    res = masuk(b)
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert b.auth0.panggilan(path="/oauth/token") == []


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
    """Pemetaan jawaban siteverify async identik dengan versi sinkron (kode turnstile_* tidak berubah)."""
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


def test_verifikasi_service_memakai_cek_turnstile(bff, monkeypatch):
    b = bff()
    import verifikasi_service as vs
    dipanggil = []

    def palsu(token, ip, aksi, **kw):
        dipanggil.append((aksi, kw.get("cdata")))
        raise b.ts.TurnstileGagal(403)
    monkeypatch.setattr(vs.turnstile, "cek_turnstile", palsu)
    monkeypatch.setenv("SAPA_VERIFIKASI_SECRET", "rahasia-uji-yang-cukup-panjang-untuk-hs256")
    import jwt as pyjwt
    st = pyjwt.encode({"sub": "auth0|x", "exp": int(time.time()) + 60, "tujuan": "sapa-verifikasi"},
                      "rahasia-uji-yang-cukup-panjang-untuk-hs256", algorithm="HS256")
    with pytest.raises(vs.VerifikasiGagal) as err:
        vs.verifikasi("state-uji", st, "jawaban", None)
    assert err.value.status == 403
    assert dipanggil == [(vs.AKSI, vs.ringkas_state("state-uji"))]


# --- pembatas ----------------------------------------------------------------------------------

def test_pembatas_per_ip_20_per_menit(bff):
    b = bff()
    for i in range(20):
        assert masuk(b, username=f"user{i}").status_code == 200
        b.jam.maju(seconds=1)  # di bawah kuota global login per detik
    res = masuk(b, username="user-lain")
    assert res.status_code == 429 and res.json() == {"detail": b.ab.PESAN_TERLALU_BANYAK, "kode": "terlalu_banyak"}
    assert "retry-after" not in res.headers
    # Batas 20/menit dihitung setelah siteverify, jadi Auth0 tidak dipanggil untuk percobaan ke-21.
    assert len(b.cf.kiriman) == 21 and len(b.auth0.panggilan(path="/oauth/token")) == 20
    b.jam.maju(minutes=1, seconds=1)
    assert masuk(b, username="user-lain").status_code == 200


def test_turnstile_gagal_tidak_dihitung_pada_pembatas_ip_sesudah_siteverify(bff):
    """Percobaan yang tidak lolos Turnstile tidak dihitung pada pembatas per IP sesudah siteverify."""
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    for _ in range(25):
        assert masuk(b, username="pengguna.lain").status_code == 403
    b.cf.jawaban = {**b.cf.jawaban, "success": True}
    assert masuk(b).status_code == 200


def test_pembatas_kasar_per_ip_dihitung_sebelum_turnstile(bff):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    for _ in range(60):
        assert masuk(b, username="pengguna.lain").status_code == 403
    res = masuk(b, username="pengguna.lain")
    assert res.status_code == 429 and res.json()["kode"] == "terlalu_banyak" and "retry-after" not in res.headers
    assert len(b.cf.kiriman) == 60  # percobaan ke-61 tidak sampai ke Cloudflare


def test_tidak_ada_blokir_per_username_lintas_ip(bff):
    """Kegagalan dari banyak IP tidak memblokir satu username (tanpa blokir per username lintas IP)."""
    b = bff()
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    for i in range(25):
        res = masuk(b, header={"x-vercel-forwarded-for": f"198.51.100.{i + 10}"})
        assert res.status_code == 401 and res.json() == SALAH
        b.jam.maju(seconds=1)
    assert len(b.auth0.panggilan(path="/oauth/token")) == 25
    b.auth0.jawaban_token = None
    assert masuk(b, header={"x-vercel-forwarded-for": "203.0.113.5"}).status_code == 200


def test_pembatas_per_username_dan_ip_10_gagal_per_15_menit(bff):
    b = bff()
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    for _ in range(10):
        assert masuk(b).status_code == 401
        b.jam.maju(seconds=4)  # di bawah 20 per menit per IP
    # Normalisasi: huruf besar, spasi, dan bentuk NFKC dihitung sebagai username yang sama.
    res = masuk(b, username="  " + USERNAME.upper() + " ")
    assert res.status_code == 429 and res.json() == {"detail": b.ab.PESAN_TERLALU_BANYAK, "kode": "terlalu_banyak"}
    assert "retry-after" not in res.headers
    assert len(b.auth0.panggilan(path="/oauth/token")) == 10
    # IP lain dan username lain dari IP yang sama tidak ikut tertahan.
    assert masuk(b, header={"x-vercel-forwarded-for": "203.0.113.5"}).status_code == 401
    assert masuk(b, username="petugas.lain").status_code == 401
    # Penanda lengket. Jendela 15 menit sudah lewat, tetapi kegagalan tetap terlalu_banyak.
    b.jam.maju(minutes=31)
    assert masuk(b).status_code == 429
    # Login sukses dari IP itu memadamkan penanda; kegagalan berikutnya kembali sandi_salah.
    b.auth0.jawaban_token = None
    b.jam.maju(seconds=4)
    assert masuk(b).status_code == 200
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    b.jam.maju(seconds=4)
    assert masuk(b).status_code == 401


def test_pembatas_username_ip_tidak_lolos_di_pergantian_jendela(bff):
    """10 gagal di akhir jendela 15 menit lalu langsung 10 lagi sesudah pergantian tidak boleh lolos."""
    b = bff()
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    b.jam.maju(minutes=14, seconds=20)
    for _ in range(10):
        assert masuk(b).status_code == 401
        b.jam.maju(seconds=4)
    assert b.jam.waktu.minute == 15 and b.jam.waktu.second == 0  # tepat di jendela baru
    assert masuk(b).status_code == 429
    assert len(b.auth0.panggilan(path="/oauth/token")) == 10


def test_pembatas_username_ip_ternormal_nfkc(bff):
    b = bff()
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    for _ in range(10):
        assert masuk(b).status_code == 401
        b.jam.maju(seconds=4)
    lebar = "".join(chr(ord(c) + 0xFEE0) if c != "." else "\uff0e" for c in USERNAME)  # huruf fullwidth
    assert lebar != USERNAME and b.ab.normal_username(lebar) == USERNAME
    assert masuk(b, username=lebar).status_code == 429


def test_pembatas_per_username_dan_ip_hanya_menghitung_gagal(bff):
    b = bff()
    for _ in range(15):
        assert masuk(b).status_code == 200  # sukses tidak dihitung
        b.jam.maju(seconds=4)
    b.jam.maju(minutes=1)
    # Kegagalan non-kredensial (Turnstile, Auth0 bermasalah, mfa, kuota global) juga tidak dihitung.
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    for _ in range(5):
        assert masuk(b).status_code == 403
        b.jam.maju(seconds=4)
    b.cf.jawaban = {**b.cf.jawaban, "success": True}
    b.auth0.jawaban_token = (500, {"error": "server_error"})
    for _ in range(5):
        assert masuk(b).status_code == 503
        b.jam.maju(seconds=4)
    b.jam.maju(minutes=1)
    b.auth0.jawaban_token = (403, {"error": "mfa_required"})
    for _ in range(10):
        assert masuk(b).status_code == 403
        b.jam.maju(seconds=4)
    b.jam.maju(minutes=1)
    for _ in range(5):
        for _ in range(b.ss.BATAS_GLOBAL_LOGIN[1]):
            asyncio.run(b.ss.batas(b.ss.KUNCI_GLOBAL_LOGIN, *b.ss.BATAS_GLOBAL_LOGIN))
        res = masuk(b)
        assert res.status_code == 429 and res.json()["kode"] == "terlalu_banyak"
        b.jam.maju(seconds=4)
    b.jam.maju(minutes=1)
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    for _ in range(10):
        assert masuk(b).status_code == 401
        b.jam.maju(seconds=4)
    assert masuk(b).status_code == 429


def test_peringatan_30_gagal_per_jam_per_username_tanpa_memblokir(bff, monkeypatch, caplog):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    caplog.set_level(logging.INFO)
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    for i in range(31):
        res = masuk(b, header={"x-vercel-forwarded-for": f"198.51.100.{i + 10}"})
        assert res.status_code == 401  # tidak memblokir
        b.jam.maju(seconds=10)
    peringatan = [r for r in caplog.records if r.levelno == logging.WARNING and "30" in r.getMessage()
                  and b.ab.ringkas_username(USERNAME) in r.getMessage()]
    assert len(peringatan) == 1
    ditandai = [e for e in tercatat if "peringatan=" in e["target"]]
    assert len(ditandai) == 1 and tercatat.index(ditandai[0]) == 29
    blob = json.dumps(tercatat) + "\n".join(r.getMessage() for r in caplog.records)
    assert USERNAME not in blob and SANDI not in blob


def test_peringatan_username_tidak_lolos_di_pergantian_jam(bff, monkeypatch, caplog):
    """29 gagal sebelum dan 29 sesudah pergantian jam tetap memicu peringatan, sekali saja."""
    b = bff()
    tercatat = catat_audit(monkeypatch)
    caplog.set_level(logging.INFO)
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    b.jam.maju(minutes=55)
    for i in range(58):
        if i == 29:
            b.jam.waktu = b.jam.waktu.replace(hour=2, minute=0, second=0)
        assert masuk(b, header={"x-vercel-forwarded-for": f"198.51.100.{i + 10}"}).status_code == 401
        b.jam.maju(seconds=10)
    peringatan = [r for r in caplog.records if r.levelno == logging.WARNING and "login gagal" in r.getMessage()]
    assert len(peringatan) == 1
    ditandai = [e for e in tercatat if "peringatan=" in e["target"]]
    assert len(ditandai) == 1 and tercatat.index(ditandai[0]) == 29


def test_pembatas_global_login_3_per_detik(bff):
    b = bff()
    maks = b.ss.BATAS_GLOBAL_LOGIN[1]
    assert b.ss.BATAS_GLOBAL_LOGIN == (1, 3) and b.ss.BATAS_GLOBAL_SEGAR == (1, 2)
    for i in range(maks):
        assert masuk(b, header={"x-vercel-forwarded-for": f"198.51.100.{i + 10}"}, username=f"u{i}").status_code == 200
    res = masuk(b, header={"x-vercel-forwarded-for": "198.51.100.50"}, username="u-lain")
    assert res.status_code == 429 and res.json()["kode"] == "terlalu_banyak"
    assert "retry-after" not in res.headers
    assert len(b.auth0.panggilan(path="/oauth/token")) == maks


def test_login_ramai_tidak_menunda_penyegaran_sesi(bff):
    """Kuota global login penuh terus-menerus tidak boleh membuat pengguna yang sudah masuk menerima 503."""
    b = bff()
    masuk(b)
    b.jam.maju(seconds=610)  # access token (600 detik) sudah habis
    for _ in range(b.ss.BATAS_GLOBAL_LOGIN[1] + 5):
        asyncio.run(b.ss.batas(b.ss.KUNCI_GLOBAL_LOGIN, *b.ss.BATAS_GLOBAL_LOGIN))
    res = b.client.get("/api/v1/akun/status", headers={"x-vercel-forwarded-for": IP_ASLI})
    assert res.status_code == 200
    assert len(b.auth0.panggilan(grant="refresh_token")) == 1


def test_batas_menghitung_per_jendela(bff):
    b = bff()
    hasil = [asyncio.run(b.ss.batas("kunci-uji", 60, 3)) for _ in range(4)]
    assert hasil == [True, True, True, False]
    assert all("kunci-uji" not in k for k in b.store.batas)


# --- bentuk permintaan --------------------------------------------------------------------------

def test_get_dan_query_string_ditolak_tanpa_memanggil_layanan(bff):
    b = bff()
    get = b.client.get(f"/api/v1/auth/masuk?username={USERNAME}&password={SANDI}", headers=HEADER)
    assert get.status_code == 405 and SANDI not in get.text
    query = b.client.post(f"/api/v1/auth/masuk?password={SANDI}", json=kredensial(), headers=HEADER)
    assert query.status_code == 400 and SANDI not in query.text
    assert b.auth0.kiriman == [] and b.cf.kiriman == []


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
    assert b.auth0.kiriman == [] and b.cf.kiriman == []


def test_body_bukan_json_dan_terlalu_besar_ditolak(bff):
    b = bff()
    form = b.client.post("/api/v1/auth/masuk", data={"username": USERNAME, "password": SANDI}, headers=HEADER)
    assert form.status_code == 400 and form.json() == ISIAN and SANDI not in form.text
    besar = b.client.post("/api/v1/auth/masuk", content=b"{" + b" " * 20000 + b"}",
                          headers={**HEADER, "Content-Type": "application/json"})
    assert besar.status_code == 400 and besar.json() == ISIAN
    assert b.auth0.kiriman == []


def test_masuk_wajib_header_x_sapa_dan_origin_sendiri(bff):
    b = bff()
    assert b.client.post("/api/v1/auth/masuk", json=kredensial(),
                         headers={"x-vercel-forwarded-for": IP_ASLI}).status_code == 403
    assert masuk(b, header={"Origin": "https://asing.example"}).status_code == 403
    assert b.auth0.kiriman == []
    assert masuk(b, header={"Origin": "https://sapa-yanfaskes.vercel.app"}).status_code == 200


def test_handler_422_global_tidak_memantulkan_input(bff):
    b = bff()
    res = b.client.post("/api/v1/verifikasi-manusia", json={"state": SANDI})
    assert res.status_code == 422
    assert SANDI not in res.text
    assert res.json()["detail"]
    assert res.headers["cache-control"] == "no-store"


# --- log ---------------------------------------------------------------------------------------

def test_sandi_dan_username_mentah_tidak_pernah_dicatat(bff, caplog):
    b = bff()
    caplog.set_level(logging.DEBUG)
    masuk(b)
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    masuk(b)
    b.auth0.jawaban_token = (403, {"error": "mfa_required"})
    masuk(b)
    b.client.post("/api/v1/auth/masuk", json={"username": USERNAME, "password": SANDI}, headers=HEADER)
    teks = "\n".join(r.getMessage() for r in caplog.records)
    assert SANDI not in teks and USERNAME not in teks and "rt-rahasia-uji" not in teks
    assert "rahasia-klien-login-uji" not in teks


# --- /sesi -------------------------------------------------------------------------------------

def test_sesi_tanpa_cookie(bff):
    b = bff()
    res = b.client.get("/api/v1/auth/sesi")
    assert res.status_code == 200 and res.json() == {"masuk": False}
    assert res.headers["cache-control"] == "no-store"


def test_sesi_dengan_cookie_tanpa_membocorkan_token(bff):
    b = bff()
    masuk(b)
    res = b.client.get("/api/v1/auth/sesi")
    assert res.status_code == 200
    body = res.json()
    assert body["masuk"] is True and body["peran"] == "super_admin"
    assert "rt-rahasia-uji" not in res.text and "eyJ" not in res.text
    assert res.headers["cache-control"] == "no-store"


def test_sesi_cookie_asal_dihapus(bff):
    b = bff()
    res = b.client.get("/api/v1/auth/sesi", headers={"Cookie": f"{COOKIE}=nilai-palsu-yang-tidak-ada"})
    assert res.status_code == 200 and res.json() == {"masuk": False, "kode": "sesi_berakhir"}
    [hapus] = set_cookie(res)
    assert "max-age=0" in hapus.lower()


def test_sesi_db_bermasalah_503_belum_siap(bff, monkeypatch):
    """DB sesi mati bukan berarti tidak masuk; jawab 503 belum_siap dan biarkan cookie."""
    b = bff()
    masuk(b)

    async def rusak(*a, **k):
        raise OSError("db mati")
    monkeypatch.setattr(b.store, "ambil", rusak)
    res = b.client.get("/api/v1/auth/sesi")
    assert res.status_code == 503 and res.json() == {"detail": b.ab.PESAN_BELUM_SIAP, "kode": "belum_siap"}
    assert res.headers["cache-control"] == "no-store" and set_cookie(res) == []


# --- keluar ------------------------------------------------------------------------------------

def test_keluar_menghapus_sesi_cookie_dan_mencabut_refresh_token(bff):
    b = bff()
    masuk(b)
    assert len(b.store.sesi) == 1
    res = b.client.post("/api/v1/auth/keluar", headers=ASAL_SENDIRI)
    assert res.status_code == 200
    assert b.store.sesi == {}
    [hapus] = set_cookie(res)
    assert "max-age=0" in hapus.lower()
    [(path, data, _)] = b.auth0.panggilan(path="/oauth/revoke")
    assert data["token"] == "rt-rahasia-uji" and data["client_id"] == "klien-login-uji"
    assert b.client.get("/api/v1/auth/sesi").json() == {"masuk": False}


def test_keluar_tanpa_x_sapa_ditolak(bff):
    b = bff()
    masuk(b)
    assert b.client.post("/api/v1/auth/keluar").status_code == 403
    assert len(b.store.sesi) == 1


def test_keluar_tetap_berhasil_bila_revoke_gagal(bff, monkeypatch):
    b = bff()
    masuk(b)
    asli = b.auth0.__call__

    async def revoke_gagal(path, data, headers=None):
        if path == "/oauth/revoke":
            return 0, None
        return await asli(path, data, headers)
    monkeypatch.setattr(b.ss, "_auth0_post", revoke_gagal)
    res = b.client.post("/api/v1/auth/keluar", headers=ASAL_SENDIRI)
    assert res.status_code == 200 and b.store.sesi == {}


def test_hapus_semua_sesi_user(bff):
    b = bff()
    masuk(b)
    masuk(b, client=browser_lain(b))
    assert asyncio.run(b.ss.hapus_semua_sesi_user("auth0|petugas1")) == 2
    assert b.store.sesi == {}


# --- require_auth lewat cookie -----------------------------------------------------------------

def test_require_auth_lewat_cookie_untuk_get(bff):
    b = bff()
    masuk(b)
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 200


def test_post_lewat_cookie_wajib_x_sapa(bff):
    b = bff()
    masuk(b)
    body = {"to_email": "uji@example.com", "verification_url": "https://sapa-yanfaskes.vercel.app"}
    tanpa = b.client.post("/api/v1/auth/send-verification-email", json=body)
    assert tanpa.status_code == 403
    asing = b.client.post("/api/v1/auth/send-verification-email", json=body,
                          headers={"X-SAPA": "1", "Origin": "https://asing.example"})
    assert asing.status_code == 403
    lintas = b.client.post("/api/v1/auth/send-verification-email", json=body,
                           headers={"X-SAPA": "1", "Sec-Fetch-Site": "cross-site"})
    assert lintas.status_code == 403
    # X-SAPA saja tidak cukup; wajib Origin sendiri atau Sec-Fetch-Site same-origin.
    hanya_x_sapa = b.client.post("/api/v1/auth/send-verification-email", json=body, headers={"X-SAPA": "1"})
    assert hanya_x_sapa.status_code == 403 and hanya_x_sapa.json()["kode"] == "asal_tidak_sah"
    situs_none = b.client.post("/api/v1/auth/send-verification-email", json=body,
                               headers={"X-SAPA": "1", "Sec-Fetch-Site": "none"})
    assert situs_none.status_code == 403
    dengan = b.client.post("/api/v1/auth/send-verification-email", json=body, headers=ASAL_SENDIRI)
    assert dengan.status_code not in (401, 403)
    sama_asal = b.client.post("/api/v1/auth/send-verification-email", json=body,
                              headers={"X-SAPA": "1", "Sec-Fetch-Site": "same-origin"})
    assert sama_asal.status_code not in (401, 403)


def test_bearer_tetap_diterima_selama_transisi(bff):
    b = bff()
    bearer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['viewer']})}"}
    assert b.client.get("/api/v1/akun/status", headers=bearer).status_code == 200
    b_lain = bff(SAPA_TERIMA_BEARER="0")
    assert b_lain.client.get("/api/v1/akun/status", headers=bearer).status_code == 401


def test_sesi_absolut_tanpa_ingat_kedaluwarsa_12_jam(bff):
    b = bff()
    masuk(b, ingat=False)
    for _ in range(11):
        b.jam.maju(hours=1)
        assert b.client.get("/api/v1/akun/status").status_code == 200
    b.jam.maju(hours=1, minutes=1)
    assert b.client.get("/api/v1/akun/status").status_code == 401
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


def test_sesi_ingat_30_hari_disegarkan_lalu_kedaluwarsa(bff):
    b = bff()
    masuk(b, ingat=True)
    b.jam.maju(days=29)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    [(_, data, _)] = b.auth0.panggilan(grant="refresh_token")
    assert data["refresh_token"] == "rt-rahasia-uji" and data["client_secret"] == "rahasia-klien-login-uji"
    b.jam.maju(days=1, minutes=1)
    assert b.client.get("/api/v1/akun/status").status_code == 401


def test_access_token_hampir_habis_disegarkan_di_server(bff):
    b = bff()
    masuk(b)
    b.jam.maju(seconds=550)  # sisa < 60 detik dari expires_in 600
    res = b.client.get("/api/v1/akun/status", headers={"x-vercel-forwarded-for": IP_ASLI, "X-Forwarded-For": IP_PALSU})
    assert res.status_code == 200
    [(_, _, header)] = b.auth0.panggilan(grant="refresh_token")
    # Penyegaran juga membawa IP klien tepercaya, bukan X-Forwarded-For mentah.
    assert header == {"auth0-forwarded-for": IP_ASLI}
    b.jam.maju(seconds=5)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    assert len(b.auth0.panggilan(grant="refresh_token")) == 1


def test_refresh_ditolak_auth0_menghapus_sesi(bff):
    b = bff()
    masuk(b)
    b.auth0.jawaban_segar = (403, {"error": "invalid_grant"})
    b.jam.maju(seconds=590)
    assert b.client.get("/api/v1/akun/status").status_code == 401
    assert b.store.sesi == {}


def test_refresh_gagal_jaringan_menjadi_503(bff):
    b = bff()
    masuk(b)
    b.auth0.jawaban_segar = (0, None)
    b.jam.maju(seconds=700)
    assert b.client.get("/api/v1/akun/status").status_code == 503
    assert len(b.store.sesi) == 1


def test_kunci_lama_masih_bisa_dekripsi(bff, monkeypatch):
    b = bff()
    masuk(b)
    monkeypatch.setenv("SAPA_SESI_KUNCI", KUNCI_B)
    monkeypatch.setenv("SAPA_SESI_KUNCI_LAMA", KUNCI_A)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    # Setelah terbaca dengan kunci lama, token dienkripsi ulang dengan kunci baru.
    monkeypatch.delenv("SAPA_SESI_KUNCI_LAMA")
    assert b.client.get("/api/v1/akun/status").status_code == 200


def test_enkripsi_terikat_pada_id_sesi(bff):
    b = bff()
    masuk(b, client=browser_lain(b))
    masuk(b, username="lain")
    satu, dua = list(b.store.sesi.values())
    satu["token_enc"], dua["token_enc"] = dua["token_enc"], satu["token_enc"]
    # Isi yang tidak bisa dibuka tidak pernah diterima (gagal tertutup, 503).
    assert b.client.get("/api/v1/akun/status").status_code == 503


def test_db_sesi_bermasalah_menjadi_503(bff, monkeypatch):
    b = bff()
    masuk(b)

    async def rusak(*a, **k):
        raise OSError("db mati")
    monkeypatch.setattr(b.store, "ambil", rusak)
    assert b.client.get("/api/v1/akun/status").status_code == 503


# --- /siap -------------------------------------------------------------------------------------

def test_siap_tanpa_login_tanpa_rincian(bff):
    b = bff()
    res = b.client.get("/api/v1/auth/siap")
    assert res.status_code == 200 and res.json() == {"siap": True}


def test_siap_super_admin_melihat_rincian_tanpa_nilai_rahasia(bff):
    b = bff(TURNSTILE_SECRET_KEY=None)
    bearer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['super_admin']})}"}
    res = b.client.get("/api/v1/auth/siap", headers=bearer)
    assert res.status_code == 200
    assert res.json() == {"siap": False, "cek": {"kunci": True, "db": True, "auth0_client": True, "turnstile": False}}
    for rahasia in ("rahasia-klien-login-uji", KUNCI_A, "klien-login-uji", "SAPA-Staging-DB"):
        assert rahasia not in res.text
    viewer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['viewer']})}"}
    assert "cek" not in b.client.get("/api/v1/auth/siap", headers=viewer).json()


# --- audit -------------------------------------------------------------------------------------

def test_masuk_dan_keluar_tercatat_di_audit_tanpa_username(bff, monkeypatch):
    b = bff()
    import audit_log
    tercatat = []

    async def tulis(entry):
        tercatat.append(entry)
    monkeypatch.setattr(audit_log, "write_entry", tulis)
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    masuk(b)
    b.auth0.jawaban_token = None
    masuk(b)
    b.client.post("/api/v1/auth/keluar", headers=ASAL_SENDIRI)
    assert [(e["action"], e["status"]) for e in tercatat] == [
        ("POST /api/v1/auth/masuk", 401), ("POST /api/v1/auth/masuk", 200), ("POST /api/v1/auth/keluar", 200)]
    assert tercatat[1]["actor"] == "auth0|petugas1" and tercatat[1]["ip"] == "198.51.100.0"
    blob = json.dumps(tercatat)
    assert USERNAME not in blob and SANDI not in blob


def test_audit_mencatat_429_dari_masuk_lewat_middleware(bff, monkeypatch):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    for i in range(21):
        masuk(b, username=f"pengguna{i}")
        b.jam.maju(seconds=1)
    assert ("POST /api/v1/auth/masuk", 429) in [(e["action"], e["status"]) for e in tercatat]
    blob = json.dumps(tercatat)
    assert "pengguna20" not in blob and SANDI not in blob


def test_audit_flag_mati_404_auth_tidak_dicatat(bff, monkeypatch):
    b = bff(SAPA_LOGIN_BFF=None)
    tercatat = catat_audit(monkeypatch)
    assert b.client.get("/api/v1/auth/masuk").status_code == 404
    assert b.client.post("/api/v1/auth/keluar").status_code == 404
    assert b.client.post("/api/v1/auth/masuk", json=kredensial()).status_code == 404
    assert tercatat == []


def test_audit_flag_hidup_get_masuk_405_tidak_dicatat(bff, monkeypatch):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    assert b.client.get("/api/v1/auth/masuk").status_code == 405
    assert tercatat == []


def test_audit_flag_hidup_tidak_memakai_x_forwarded_for(bff, monkeypatch):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    b.client.post("/api/v1/auth/masuk", json=kredensial(),
                  headers={"X-SAPA": "1", "Origin": ASAL, "X-Forwarded-For": "203.0.113.77"})
    assert tercatat and tercatat[-1]["ip"] != "203.0.113.0"


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

    async def pool_dilarang(*a, **k):
        raise AssertionError("pool asyncpg tidak dipakai")
    import asyncpg
    monkeypatch.setattr(asyncpg, "connect", sambung)
    monkeypatch.setattr(asyncpg, "create_pool", pool_dilarang)
    monkeypatch.setattr(b.ss, "_store", b.ss.PostgresSesiStore(dsn))

    token_auth0 = {"access_token": "at-mentah-uji", "refresh_token": "rt-mentah-uji", "expires_in": 600}
    cookie = asyncio.run(b.ss.buat_sesi("auth0|x", True, token_auth0))
    assert "CREATE TABLE IF NOT EXISTS sapa_sesi" in kueri[0][0] and "CREATE TABLE IF NOT EXISTS sapa_batas" in kueri[0][0]
    [(_, args)] = [k for k in kueri if k[0].startswith("INSERT INTO sapa_sesi")]
    teks = json.dumps(args, default=str)
    assert cookie not in teks and "at-mentah-uji" not in teks and "rt-mentah-uji" not in teks
    assert args[0] == hashlib.sha256(cookie.encode()).hexdigest() and args[1] == "auth0|x" and args[2] is True
    assert args[6].startswith("v2.")  # penanda versi kunci
    assert asyncio.run(b.ss.hapus_semua_sesi_user("auth0|x")) == 3
    asyncio.run(b.ss.batas("kunci-uji", 60, 5))
    assert asyncio.run(b.ss.ambil_sesi(cookie)) is None
    assert dibuka and len(dibuka) == len(ditutup)


def test_store_dipilih_dari_env(bff, monkeypatch):
    b = bff()
    monkeypatch.setattr(b.ss, "_store", None)
    monkeypatch.delenv("SAPA_SESI_DATABASE_URL", raising=False)
    assert b.ss.store() is None
    monkeypatch.setenv("SAPA_SESI_DATABASE_URL", "postgresql://uji@db.invalid/sapa")
    assert isinstance(b.ss.store(), b.ss.PostgresSesiStore)


# --- DB pembatas, IPv6 /64, HMAC, Turnstile sekali pakai, penyegaran -----------------------------

def test_db_mati_di_pembatas_menjadi_503_dengan_jeda(bff, monkeypatch):
    b = bff()

    async def rusak(*a, **k):
        raise OSError("db mati")
    monkeypatch.setattr(b.store, "tambah_batas", rusak)
    res = masuk(b)
    assert res.status_code == 503 and res.json() == {"detail": b.ab.PESAN_BELUM_SIAP, "kode": "belum_siap"}
    assert res.headers["cache-control"] == "no-store"
    assert b.tidur and b.auth0.panggilan(path="/oauth/token") == []


def test_galat_tak_terduga_di_masuk_tetap_503_seragam(bff, monkeypatch, caplog):
    b = bff()

    async def meledak(*a, **k):
        raise RuntimeError(SANDI)
    monkeypatch.setattr(b.ss, "buat_sesi", meledak)
    caplog.set_level(logging.DEBUG)
    res = masuk(b)
    assert res.status_code == 503 and res.json() == {"detail": b.ab.PESAN_BELUM_SIAP, "kode": "belum_siap"}
    assert res.headers["cache-control"] == "no-store" and b.tidur
    assert SANDI not in "\n".join(r.getMessage() for r in caplog.records)


def test_pembatas_ip_ipv6_dihitung_per_prefiks_64(bff):
    b = bff()
    for i in range(20):
        res = masuk(b, header={"x-vercel-forwarded-for": f"2001:db8::{i + 1:x}"}, username=f"user{i}")
        assert res.status_code == 200
        b.jam.maju(seconds=1)
    assert masuk(b, header={"x-vercel-forwarded-for": "2001:db8::ffff:1"}, username="user-lain").status_code == 429
    # /64 lain tidak ikut terbatas; Turnstile dan Auth0 tetap menerima IP penuh.
    assert masuk(b, header={"x-vercel-forwarded-for": "2001:db8:0:1::1"}, username="user-x").status_code == 200
    assert b.cf.kiriman[-1][1]["remoteip"] == "2001:db8:0:1::1"
    assert b.auth0.panggilan(path="/oauth/token")[-1][2]["auth0-forwarded-for"] == "2001:db8:0:1::1"


def test_kunci_salah_pasang_tidak_menghapus_sesi_maupun_cookie(bff, monkeypatch):
    b = bff()
    masuk(b)
    monkeypatch.setenv("SAPA_SESI_KUNCI", KUNCI_B)
    assert b.client.get("/api/v1/akun/status").status_code == 503
    res = b.client.get("/api/v1/auth/sesi")
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert set_cookie(res) == []
    assert len(b.store.sesi) == 1
    monkeypatch.setenv("SAPA_SESI_KUNCI", KUNCI_A)
    assert b.client.get("/api/v1/akun/status").status_code == 200


def test_jejak_log_dan_pembatas_memakai_hmac_berkunci(bff, monkeypatch):
    b = bff()
    satu = b.ab.ringkas_username(USERNAME)
    assert len(satu) == 12 and satu != hashlib.sha256(USERNAME.encode()).hexdigest()[:12]
    asyncio.run(b.ss.batas("ip:198.51.100.7", 60, 20))
    [(kunci, _)] = b.store.batas
    assert kunci != hashlib.sha256(b"60:ip:198.51.100.7").hexdigest()
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
    bearer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['super_admin']})}"}
    assert "cek" in b.client.get("/api/v1/auth/siap", headers=bearer).json()
    assert len(hitung) == 3


def test_penyegaran_paralel_tidak_mengakhiri_sesi(bff, monkeypatch):
    b = bff()
    cookie = nilai_cookie(masuk(b))
    dipakai, panggilan = set(), []

    async def auth0(path, data, headers=None):
        await asyncio.sleep(0.01)
        panggilan.append(data.get("refresh_token"))
        if data["refresh_token"] in dipakai:  # rotasi: refresh token sekali pakai
            return 403, {"error": "invalid_grant"}
        dipakai.add(data["refresh_token"])
        return 200, {"access_token": b.auth0.token_baru(), "refresh_token": "rt-baru", "expires_in": 600}
    monkeypatch.setattr(b.ss, "_auth0_post", auth0)
    b.jam.maju(seconds=590)

    async def dua():
        return await asyncio.gather(b.ss.ambil_sesi_segar(cookie), b.ss.ambil_sesi_segar(cookie))
    hasil = asyncio.run(dua())
    assert len(panggilan) == 1  # single-flight, satu refresh per baris sesi
    assert all(h is not None for h in hasil)
    assert len(b.store.sesi) == 1
    assert hasil[0].access_token == hasil[1].access_token


def test_post_bearer_tanpa_x_sapa_tetap_jalan_dengan_atau_tanpa_cookie(bff):
    b = bff()
    bearer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['super_admin']})}"}
    assert b.client.post("/api/v1/auth/send-verification-email", json=BODY_EMAIL, headers=bearer).status_code not in (401, 403)
    masuk(b)
    assert b.client.post("/api/v1/auth/send-verification-email", json=BODY_EMAIL, headers=bearer).status_code not in (401, 403)
    # Tanpa Bearer, identitas berasal dari cookie sehingga penanda CSRF tetap wajib.
    assert b.client.post("/api/v1/auth/send-verification-email", json=BODY_EMAIL).status_code == 403


def test_token_turnstile_sekali_pakai_dijamin_sapa(bff):
    b = bff()
    assert masuk(b, turnstile_token="token-sama").status_code == 200
    b.jam.maju(seconds=1)
    res = masuk(b, client=browser_lain(b), turnstile_token="token-sama")
    assert res.status_code == 403
    assert res.json() == {"detail": b.ab.PESAN_TURNSTILE_KEDALUWARSA, "kode": "turnstile_kedaluwarsa"}
    assert len(b.auth0.panggilan(path="/oauth/token")) == 1
    # Hash dicatat SEBELUM siteverify: token yang sudah dipakai tidak dikirim lagi ke Cloudflare.
    assert len(b.cf.kiriman) == 1


def test_token_turnstile_dicatat_sebelum_siteverify_dan_berumur_5_menit(bff):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    assert masuk(b, turnstile_token="token-x").status_code == 403
    b.cf.jawaban = {**b.cf.jawaban, "success": True}
    res = masuk(b, turnstile_token="token-x")
    assert res.json()["kode"] == "turnstile_kedaluwarsa" and len(b.cf.kiriman) == 1
    # Sama dengan masa berlaku token di Cloudflare.
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
    assert b.auth0.panggilan(path="/oauth/token") == [] and b.tidur


@pytest.mark.parametrize("flag,harapan", [(None, False), ("0", False), ("1", True)])
def test_mode_login_selalu_tersedia(bff, flag, harapan):
    b = bff(SAPA_LOGIN_BFF=flag)
    res = b.client.get("/api/v1/auth/mode")
    assert res.status_code == 200 and res.json() == {"bff": harapan}
    assert res.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("selisih,ditolak", [(60, True), (-60, False)])
def test_ganti_sandi_lewat_cookie_membandingkan_waktu_sesi(bff, monkeypatch, selisih, ditolak):
    b = bff()
    b.auth0.peran = ["Petugas RS"]
    diatur = int(b.jam.waktu.timestamp()) + selisih
    monkeypatch.setattr(b.api.pengguna_service, "status_akun", lambda sub, segar=False: {
        "wajib_ganti_sandi": True, "nonaktif": False, "diatur_ulang_pada": diatur, "kode_ppk": ""})
    # Access token hasil penyegaran selalu membawa iat baru, jadi iat tidak boleh jadi pembanding.
    b.auth0.jawaban_token = (200, {"access_token": b.auth0.token_baru(iat=diatur + 600), "refresh_token": "rt",
                                   "expires_in": 600})
    assert masuk(b).status_code == 200
    res = b.client.post("/api/v1/akun/ganti-sandi", json={"sandi_baru": "SandiBaruKuat2026"}, headers=ASAL_SENDIRI)
    sesi_lama = res.status_code == 403 and res.json() == {"detail": b.api.pengguna_service.PESAN_SESI_LAMA}
    assert sesi_lama is ditolak


def test_token_disegarkan_paling_lama_tiap_15_menit(bff):
    b = bff()
    b.auth0.jawaban_token = (200, {"access_token": b.auth0.token_baru(), "refresh_token": "rt-rahasia-uji",
                                   "expires_in": 86400})
    masuk(b)
    b.jam.maju(minutes=14)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    assert b.auth0.panggilan(grant="refresh_token") == []
    b.jam.maju(minutes=1, seconds=1)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    assert len(b.auth0.panggilan(grant="refresh_token")) == 1
    b.jam.maju(minutes=5)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    assert len(b.auth0.panggilan(grant="refresh_token")) == 1


def test_penyegaran_di_vercel_tanpa_ip_klien_tidak_memanggil_auth0(bff):
    """Tanpa IP tepercaya di Vercel tidak ada refresh tanpa auth0-forwarded-for."""
    b = bff()
    masuk(b)
    tanpa_ip = {"x-vercel-forwarded-for": ""}
    b.jam.maju(seconds=550)  # token masih berlaku: dipakai apa adanya
    assert b.client.get("/api/v1/akun/status", headers=tanpa_ip).status_code == 200
    b.jam.maju(seconds=60)  # token sudah habis: 503, sesi tidak diakhiri
    res = b.client.get("/api/v1/akun/status", headers=tanpa_ip)
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert b.auth0.panggilan(grant="refresh_token") == [] and len(b.store.sesi) == 1
    # Dengan IP tepercaya refresh berjalan dan membawa header itu.
    assert b.client.get("/api/v1/akun/status").status_code == 200
    [(_, _, header)] = b.auth0.panggilan(grant="refresh_token")
    assert header == {"auth0-forwarded-for": IP_ASLI}


def test_penyegaran_tanpa_ip_di_luar_vercel_tidak_mengirim_header_ip(bff):
    """Di luar Vercel (dev lokal, ip_wajib=False) refresh tanpa IP sah tetap jalan, tanpa header IP."""
    b = bff()
    cookie = nilai_cookie(masuk(b))
    b.jam.maju(seconds=610)
    sesi = asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=None, ip_wajib=False))
    assert sesi is not None
    [(_, _, header)] = b.auth0.panggilan(grant="refresh_token")
    assert header == {}


def test_penyegaran_ikut_kuota_global_penyegaran(bff):
    b = bff()
    masuk(b)

    def penuhi():
        for _ in range(b.ss.BATAS_GLOBAL_SEGAR[1]):
            asyncio.run(b.ss.batas(b.ss.KUNCI_GLOBAL_SEGAR, *b.ss.BATAS_GLOBAL_SEGAR))
    b.jam.maju(seconds=570)  # sisa 30 detik, token masih berlaku
    penuhi()
    assert b.client.get("/api/v1/akun/status").status_code == 200
    assert b.auth0.panggilan(grant="refresh_token") == []
    b.jam.maju(seconds=40)  # token sudah habis
    penuhi()
    assert b.client.get("/api/v1/akun/status").status_code == 503
    assert b.auth0.panggilan(grant="refresh_token") == []
    assert len(b.store.sesi) == 1


# --- bukti asal, IP tepercaya, dan pembatas -------------------------------------------------------

def test_masuk_asal_tidak_sah_berkode_dan_tertahan_waktu_minimum(bff):
    b = bff()
    res = masuk(b, header={"Origin": "https://asing.example"})
    assert res.status_code == 403 and res.json() == {"detail": b.ab.PESAN_DITOLAK, "kode": "asal_tidak_sah"}
    tanpa = b.client.post("/api/v1/auth/masuk", json=kredensial(), headers={"x-vercel-forwarded-for": IP_ASLI})
    assert tanpa.status_code == 403 and tanpa.json()["kode"] == "asal_tidak_sah"
    assert len(b.tidur) == 2 and b.cf.kiriman == [] and b.auth0.kiriman == []


@pytest.mark.parametrize("body", [{"username": USERNAME, "turnstile_token": "x"}, [SANDI]])
def test_isian_tidak_sah_berkode_tanpa_memantulkan(bff, body):
    b = bff()
    res = b.client.post("/api/v1/auth/masuk", json=body, headers=HEADER)
    assert res.json() == {"detail": b.ab.PESAN_ISIAN, "kode": "isian_tidak_sah"}
    assert SANDI not in res.text and USERNAME not in res.text


def _picu_kode(b, kode):
    """Siapkan kondisi yang membuat /masuk menjawab `kode`; kembalikan respons."""
    if kode == "sandi_salah":
        b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    elif kode == "terlalu_banyak":
        # 429 Auth0 sendiri dijawab sandi_salah; terlalu_banyak datang dari pembatas SAPA.
        b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
        for _ in range(10):
            masuk(b)
            b.jam.maju(seconds=4)
    elif kode == "turnstile_gagal":
        b.cf.jawaban = {**b.cf.jawaban, "success": False}
    elif kode == "turnstile_kedaluwarsa":
        b.cf.jawaban = {"success": False, "error-codes": ["timeout-or-duplicate"]}
    elif kode == "mfa":
        b.auth0.jawaban_token = (403, {"error": "mfa_required"})
    elif kode == "belum_siap":
        b.auth0.jawaban_token = (500, {"error": "server_error"})
    elif kode == "asal_tidak_sah":
        return masuk(b, header={"Origin": "https://asing.example"})
    elif kode == "isian_tidak_sah":
        return b.client.post("/api/v1/auth/masuk", json={"username": USERNAME, "turnstile_token": "x"}, headers=HEADER)
    return masuk(b)


@pytest.mark.parametrize("kode", ["sandi_salah", "terlalu_banyak", "turnstile_gagal", "turnstile_kedaluwarsa", "mfa",
                                  "belum_siap", "asal_tidak_sah", "isian_tidak_sah"])
def test_semua_respons_gagal_masuk_memuat_kode_stabil(bff, kode):
    b = bff()
    res = _picu_kode(b, kode)
    status, pesan = b.ab.KODE[kode]
    assert res.status_code == status and res.json() == {"detail": pesan, "kode": kode}
    assert res.headers["cache-control"] == "no-store" and set_cookie(res) == []


def test_ip_klien_kosong_di_vercel_503_sebelum_turnstile_dan_auth0(bff):
    """Tanpa IP tepercaya di Vercel, login ditolak supaya tidak semua login tampak dari satu IP."""
    b = bff()
    res = b.client.post("/api/v1/auth/masuk", json=kredensial(),
                        headers={"X-SAPA": "1", "Origin": ASAL, "X-Forwarded-For": IP_PALSU, "x-vercel-forwarded-for": ""})
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert b.cf.kiriman == [] and b.auth0.kiriman == [] and b.tidur


def test_durasi_gagal_melewati_minimum_dibulatkan_ke_kelipatan_dan_dicatat(bff, monkeypatch, caplog):
    b = bff()
    waktu = iter([100.0, 101.25])
    monkeypatch.setattr(b.ab, "_monoton", lambda: next(waktu))
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    caplog.set_level(logging.INFO)
    assert masuk(b).status_code == 401
    assert b.tidur == [pytest.approx(0.2)]  # 1250 ms dibulatkan ke 1450 ms (700 + 3 x 250)
    [catatan] = [r for r in caplog.records if "minimum" in r.getMessage()]
    assert catatan.levelno == logging.WARNING and "1250" in catatan.getMessage() and "sandi_salah" in catatan.getMessage()
    assert USERNAME not in catatan.getMessage()


@pytest.mark.parametrize("durasi,total", [(0.1, 0.7), (0.7, 0.7), (0.71, 0.95), (0.95, 0.95), (0.96, 1.2), (2.0, 2.2)])
def test_waktu_tahan_gagal_minimum_lalu_kelipatan_250_ms(bff, durasi, total):
    assert bff().ab.waktu_tahan_gagal(durasi) == pytest.approx(total)


def test_durasi_gagal_di_bawah_minimum_ditunggu_sampai_700_ms(bff, monkeypatch):
    b = bff()
    waktu = iter([100.0, 100.2])
    monkeypatch.setattr(b.ab, "_monoton", lambda: next(waktu))
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    assert masuk(b).status_code == 403
    assert b.tidur == [pytest.approx(0.5)]


def test_audit_masuk_mencatat_hash_username_ip_tersamar_dan_kode(bff, monkeypatch):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    jejak = b.ab.ringkas_username(USERNAME)
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    masuk(b)
    b.auth0.jawaban_token = None
    masuk(b)
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    masuk(b, username="lain.lagi")
    masuk(b, header={"Origin": "https://asing.example"})
    gagal, sukses, turnstile_gagal, asal = tercatat
    assert gagal["target"] == f"/api/v1/auth/masuk u={jejak} hasil=sandi_salah" and gagal["status"] == 401
    assert sukses["target"] == f"/api/v1/auth/masuk u={jejak} hasil=berhasil" and sukses["actor"] == "auth0|petugas1"
    assert turnstile_gagal["target"].endswith("hasil=turnstile_gagal")
    assert asal["target"] == "/api/v1/auth/masuk hasil=asal_tidak_sah"
    assert all(e["ip"] == "198.51.100.0" for e in tercatat)
    assert len(jejak) == 12
    blob = json.dumps(tercatat)
    for rahasia in (USERNAME, "lain.lagi", SANDI, "rt-rahasia-uji", "eyJ", "jawaban-turnstile"):
        assert rahasia not in blob


def test_galat_422_dan_500_tidak_mencetak_body_ke_log(bff, monkeypatch, caplog):
    b = bff()
    caplog.set_level(logging.DEBUG)
    res = b.client.post("/api/v1/verifikasi-manusia", json={"state": SANDI, "lain": USERNAME})
    assert res.status_code == 422 and SANDI not in res.text
    rusak = b.client.post("/api/v1/auth/masuk", content=json.dumps({"username": USERNAME, "password": SANDI}).encode() + b"}",
                          headers={**HEADER, "Content-Type": "application/json"})
    assert rusak.status_code == 400 and SANDI not in rusak.text

    # 500 sungguhan: galat tak tertangkap di rute lain yang pesannya memuat sandi.
    def meledak(*a, **k):
        raise RuntimeError(f"{USERNAME}:{SANDI}")
    monkeypatch.setattr(b.api, "_status_petugas", meledak)
    bearer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['Petugas RS']})}"}
    res = b.client.get("/api/v1/akun/status", headers=bearer)
    assert res.status_code == 500 and SANDI not in res.text and USERNAME not in res.text
    teks = "\n".join(r.getMessage() + str(r.args) + (r.exc_text or "") for r in caplog.records)
    assert SANDI not in teks and USERNAME not in teks


# --- sesi_berakhir --------------------------------------------------------------------------------

def test_401_permintaan_bercookie_berkode_sesi_berakhir(bff):
    b = bff()
    masuk(b)
    asyncio.run(b.ss.hapus_semua_sesi_user("auth0|petugas1"))
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 401 and res.json()["kode"] == "sesi_berakhir"
    assert res.headers["cache-control"] == "no-store"
    # Tanpa cookie sama sekali: perilaku lama (tanpa kode).
    res = browser_lain(b).get("/api/v1/akun/status")
    assert res.status_code == 401 and res.json() == {"detail": "Silakan masuk terlebih dahulu"}


def test_401_sesi_kedaluwarsa_berkode_sesi_berakhir(bff):
    b = bff()
    masuk(b, ingat=False)
    b.jam.maju(hours=13)
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 401 and res.json()["kode"] == "sesi_berakhir"


def test_sesi_sesudah_dicabut_berkode_sesi_berakhir(bff):
    b = bff()
    masuk(b)
    assert b.client.get("/api/v1/auth/sesi").json()["masuk"] is True
    asyncio.run(b.ss.hapus_semua_sesi_user("auth0|petugas1"))
    assert b.client.get("/api/v1/auth/sesi").json() == {"masuk": False, "kode": "sesi_berakhir"}


def test_csrf_dan_keluar_berkode(bff):
    b = bff()
    masuk(b)
    res = b.client.post("/api/v1/auth/send-verification-email", json=BODY_EMAIL)
    assert res.status_code == 403 and res.json()["kode"] == "asal_tidak_sah"
    res = b.client.post("/api/v1/auth/keluar")
    assert res.status_code == 403 and res.json() == {"detail": b.ab.PESAN_DITOLAK, "kode": "asal_tidak_sah"}


def test_flag_mati_401_tetap_tanpa_kode(bff):
    b = bff(SAPA_LOGIN_BFF="0")
    res = b.client.get("/api/v1/akun/status", headers={"Cookie": f"{COOKIE}={'a' * 43}"})
    assert res.status_code == 401 and res.json() == {"detail": "Silakan masuk terlebih dahulu"}


# --- cache sesi dan idle admin -----------------------------------------------------------------

def test_pencabutan_sesi_langsung_berlaku_tanpa_cache(bff):
    b = bff()
    masuk(b)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    asyncio.run(b.ss.hapus_semua_sesi_user("auth0|petugas1"))
    assert b.client.get("/api/v1/akun/status").status_code == 401


def test_idle_admin_disiapkan_tetapi_nonaktif_bila_env_kosong(bff):
    b = bff()
    assert b.ss.IDLE_ADMIN_USULAN_MENIT == 30
    assert b.ss.batas_menganggur_admin() is None
    masuk(b, ingat=True)  # peran super_admin
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
    assert b.store.sesi == {}
    # Peran non-admin tidak terkena batas khusus admin.
    b.auth0.peran = ["viewer"]
    masuk(b, ingat=True)
    b.jam.maju(minutes=45)
    assert b.client.get("/api/v1/akun/status").status_code == 200


# --- bukti asal, JWKS, pembersihan pembatas, bentuk token Turnstile ------------------------------

@pytest.mark.parametrize("header,boleh", [
    ({"Origin": None}, False),                                                   # tanpa Origin dan Sec-Fetch-Site
    ({"Origin": None, "Sec-Fetch-Site": "none"}, False),
    ({"Sec-Fetch-Site": "none"}, False),
    ({"Sec-Fetch-Site": "cross-site"}, False),
    ({"Sec-Fetch-Site": "same-site"}, False),
    ({"Origin": None, "Sec-Fetch-Site": "same-origin"}, True),
    ({"Sec-Fetch-Site": "same-origin"}, True),
    ({}, True),                                                                  # Origin sendiri, browser lama
    ({"Origin": "https://asing.example", "Sec-Fetch-Site": "same-origin"}, False),
    ({"X-SAPA": None}, False),
])
def test_masuk_wajib_bukti_asal_sendiri(bff, header, boleh):
    """Origin cocok atau Sec-Fetch-Site same-origin wajib ada; selain itu 403 asal_tidak_sah."""
    b = bff()
    kirim = {k: v for k, v in {**HEADER, **header}.items() if v is not None}
    res = b.client.post("/api/v1/auth/masuk", json=kredensial(), headers=kirim)
    if boleh:
        assert res.status_code == 200, res.text
    else:
        assert res.status_code == 403 and res.json()["kode"] == "asal_tidak_sah"
        assert b.cf.kiriman == [] and b.auth0.kiriman == []


@pytest.mark.parametrize("vercel_env,boleh", [("production", False), ("preview", True)])
def test_origin_localhost_ditolak_di_production(bff, vercel_env, boleh):
    b = bff(APP_ORIGINS=f"{ASAL},http://localhost:3000", VERCEL_ENV=vercel_env)
    res = masuk(b, header={"Origin": "http://localhost:3000"})
    assert (res.status_code == 200) is boleh
    if not boleh:
        assert res.json()["kode"] == "asal_tidak_sah"
    # CORS (juga dipakai flag 0) tidak ikut berubah.
    assert "http://localhost:3000" in b.api.APP_ORIGINS


def _jwks_tidak_terjangkau(b, monkeypatch):
    import jwt as pyjwt

    def gagal(token):
        raise pyjwt.PyJWKClientConnectionError("Fail to fetch data from the url")
    monkeypatch.setattr(b.api.jwk_client, "get_signing_key_from_jwt", gagal)


def test_jwks_tidak_terjangkau_bukan_sesi_berakhir(bff, monkeypatch):
    b = bff()
    masuk(b)
    _jwks_tidak_terjangkau(b, monkeypatch)
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    sesi = b.client.get("/api/v1/auth/sesi")
    assert sesi.status_code == 503 and sesi.json() == {"detail": b.ab.PESAN_BELUM_SIAP, "kode": "belum_siap"}
    assert set_cookie(sesi) == [] and len(b.store.sesi) == 1


def test_jwks_tidak_terjangkau_bearer_tetap_401_seperti_lama(bff, monkeypatch):
    b = bff()
    _jwks_tidak_terjangkau(b, monkeypatch)
    bearer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['viewer']})}"}
    assert b.client.get("/api/v1/akun/status", headers=bearer).status_code == 401


def test_token_sesi_tidak_sah_tetap_sesi_berakhir(bff, monkeypatch):
    b = bff()
    masuk(b)
    import jwt as pyjwt

    def kedaluwarsa(token):
        raise pyjwt.ExpiredSignatureError("kedaluwarsa")
    monkeypatch.setattr(b.api.jwk_client, "get_signing_key_from_jwt", kedaluwarsa)
    assert b.client.get("/api/v1/akun/status").json()["kode"] == "sesi_berakhir"
    assert b.client.get("/api/v1/auth/sesi").json() == {"masuk": False, "kode": "sesi_berakhir"}


def test_baris_pembatas_kedaluwarsa_dibersihkan_tanpa_login_sukses(bff, monkeypatch):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    for i in range(5):
        masuk(b, header={"x-vercel-forwarded-for": f"2001:db8:{i}::1"})
    assert len(b.store.batas) >= 10  # pembatas per IP dan hash token Turnstile, tanpa login sukses
    b.jam.maju(hours=1)
    monkeypatch.setattr(b.ss, "_acak", lambda: 0.0)
    asyncio.run(b.ss.batas("kunci-uji", 60, 5))
    assert len(b.store.batas) == 1


def test_pembersihan_pembatas_gagal_tidak_menggagalkan_permintaan(bff, monkeypatch):
    b = bff()
    monkeypatch.setattr(b.ss, "_acak", lambda: 0.0)

    async def rusak(*a, **k):
        raise OSError("db mati")
    monkeypatch.setattr(b.store, "bersihkan_batas", rusak)
    assert masuk(b).status_code == 200


@pytest.mark.parametrize("varian", ["token-sama ", " token-sama", "token-sama​", "token sama", "tökén-sama"])
def test_varian_token_turnstile_ditolak_tanpa_siteverify(bff, varian):
    b = bff()
    assert masuk(b, turnstile_token="token-sama").status_code == 200
    res = masuk(b, client=browser_lain(b), turnstile_token=varian)
    assert res.status_code == 403 and res.json()["kode"] == "turnstile_gagal"
    assert len(b.cf.kiriman) == 1 and len(b.auth0.panggilan(path="/oauth/token")) == 1


def test_token_turnstile_berbentuk_base64url_bertitik_diterima(bff):
    b = bff()
    assert masuk(b, turnstile_token="0.AbC_d-9xYz.1f2e3d4c5b6a").status_code == 200


def test_audit_masuk_tanpa_ip_tepercaya_mencatat_ip_kosong(bff, monkeypatch):
    b = bff()
    tercatat = catat_audit(monkeypatch)
    res = b.client.post("/api/v1/auth/masuk", json=kredensial(),
                        headers={"X-SAPA": "1", "Origin": ASAL, "x-vercel-forwarded-for": ""})
    assert res.status_code == 503
    [entry] = tercatat
    assert entry["ip"] == ""  # bukan IP infrastruktur (alamat koneksi)


@pytest.mark.parametrize("flag", [None, "1"])
def test_verifikasi_manusia_remoteip_dari_header_vercel(bff, monkeypatch, flag):
    """Pengerasan sengaja yang juga berlaku saat flag 0: remoteip tidak dari X-Forwarded-For mentah."""
    b = bff(SAPA_LOGIN_BFF=flag, SAPA_VERIFIKASI_SECRET="rahasia-uji-yang-cukup-panjang-untuk-hs256")
    import jwt as pyjwt
    import verifikasi_service as vs
    dikirim = []

    def palsu(token_ts, ip, aksi, **kw):
        dikirim.append(ip)
        raise b.ts.TurnstileGagal(403)
    monkeypatch.setattr(vs.turnstile, "cek_turnstile", palsu)
    st = pyjwt.encode({"sub": "auth0|x", "exp": int(time.time()) + 60, "tujuan": "sapa-verifikasi"},
                      "rahasia-uji-yang-cukup-panjang-untuk-hs256", algorithm="HS256")
    res = b.client.post("/api/v1/verifikasi-manusia", json={"state": "s", "session_token": st, "turnstile_token": "t"},
                        headers={"x-vercel-forwarded-for": IP_ASLI, "X-Forwarded-For": IP_PALSU})
    assert res.status_code == 403 and dikirim == [IP_ASLI]


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


@pytest.mark.parametrize("jawaban,status", [((403, {"error": "invalid_grant"}), 401), (None, 200)])
def test_masuk_memakai_satu_koneksi_db(bff, monkeypatch, jawaban, status):
    b = bff()
    monkeypatch.setattr(b.ss, "_acak", lambda: 0.0)  # pembersihan ikut berjalan di koneksi yang sama
    dibuka, ditutup = _postgres_palsu(b, monkeypatch)
    b.auth0.jawaban_token = jawaban
    assert masuk(b).status_code == status
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
    # Koneksi pertama dihentikan karena galat; yang kedua kembali ke daftar siaga dan ditutup saat loop berakhir.
    assert len(dibuka) == 2 and len(ditutup) == 1


def test_hitungan_geser(bff):
    H = bff().ss.HitunganGeser
    # 10 gagal di jendela lalu, percobaan pertama tepat di awal jendela baru: hampir 11.
    h = H(ini=1, lalu=10, lewat=0, jendela_detik=900, tiket=("k", 1))
    assert h.perkiraan == 11
    assert H(ini=1, lalu=10, lewat=90, jendela_detik=900, tiket=("k", 1)).perkiraan == 10
    assert H(ini=3, lalu=0, lewat=10, jendela_detik=60, tiket=("k", 1)).perkiraan == 3


def test_blokir_akun_auth0_dijawab_seperti_invalid_grant(bff):
    """too_many_attempts dijawab persis seperti invalid_grant; terlalu_banyak hanya datang dari hitungan SAPA."""
    b = bff()
    b.auth0.jawaban_token = (429, {"error": "too_many_attempts", "error_description": "Your account has been blocked"})
    res = masuk(b)
    assert res.status_code == 401 and res.json() == SALAH
    assert "blocked" not in res.text and "retry-after" not in res.headers


def test_aksi_turnstile_login_sama_dengan_widget_halaman_login():
    from api import turnstile
    assert turnstile.AKSI_MASUK == "login"


# --- validasi isian ketat, semua pelanggaran 400 dengan satu pesan ---------------------------------

@pytest.mark.parametrize("ubah", [
    {"lain": "x"},                                   # field tak dikenal
    {"ingat": None},                                 # ingat wajib boolean
    {"ingat": 1},
    {"username": "a" * 255},                         # identitas maks 254
    {"username": "petugas\u0007uji"},               # karakter kontrol
    {"password": "é" * 37},                          # 74 byte UTF-8 > 72: ditolak, tidak dipotong
    {"turnstile_token": "t" * 2049},
])
def test_isian_tidak_sah_ditolak_400_satu_pesan(bff, ubah):
    b = bff()
    body = kredensial(**ubah)
    if ubah.get("ingat", False) is None:
        body.pop("ingat")
    res = b.client.post("/api/v1/auth/masuk", json=body, headers=HEADER)
    assert res.status_code == 400 and res.json() == ISIAN
    assert SANDI not in res.text and "petugas" not in res.text
    assert b.auth0.kiriman == [] and b.cf.kiriman == []


def test_isian_tepat_di_batas_panjang_diterima(bff):
    b = bff()
    res = masuk(b, username="a" * 254, password="é" * 36)  # 72 byte tepat
    assert res.status_code != 400


# --- jawaban seragam untuk akun ada dan tidak ada ---------------------------------------------------

AKUN_ADA, AKUN_KOSONG = "akun.ada.uji", "akun.kosong.uji"
KANARI = "Kanari-Sandi-Uji-77"
DESKRIPSI_AUTH0 = "Wrong email or password. DESKRIPSI-AUTH0-RAHASIA"
TERLALU_BANYAK = {"detail": "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.", "kode": "terlalu_banyak"}
_HEADER_RELEVAN = ("content-type", "content-length", "cache-control", "retry-after", "set-cookie",
                   "www-authenticate", "clear-site-data")


def _jejak_respons(res):
    """Yang terlihat klien: status, body mentah, dan header relevan."""
    return res.status_code, res.content, {h: res.headers.get(h) for h in _HEADER_RELEVAN}


def _auth0_blokir_akun(b, monkeypatch):
    """Auth0 palsu dengan blokir akun per (pengguna + IP): akun yang ADA diblokir setelah
    10 gagal (too_many_attempts); username yang tidak ada selalu invalid_grant."""
    gagal = {}

    async def auth0(path, data, headers=None):
        b.auth0.kiriman.append((path, dict(data), dict(headers or {})))
        if path == "/oauth/token" and data.get("username") == AKUN_ADA:
            kunci = (AKUN_ADA, (headers or {}).get("auth0-forwarded-for"))
            gagal[kunci] = gagal.get(kunci, 0) + 1
            if gagal[kunci] > 10:
                return 429, {"error": "too_many_attempts", "error_description": "Your account has been blocked"}
        return 403, {"error": "invalid_grant", "error_description": "Wrong email or password."}
    monkeypatch.setattr(b.ss, "_auth0_post", auth0)


def test_too_many_attempts_akun_ada_dan_tidak_ada_identik(bff, monkeypatch):
    """Setelah jendela 15 menit lewat, jawaban untuk akun ada (Auth0 too_many_attempts) dan tidak ada
    (invalid_grant) sama: status, body, header, dan waktu."""
    b = bff()
    _auth0_blokir_akun(b, monkeypatch)
    monkeypatch.setattr(b.ab, "_monoton", lambda: 100.0)  # durasi asli 0, jadi tahanan = waktu minimum
    hasil, tidur, ke_auth0 = {}, {}, {}
    for u in (AKUN_ADA, AKUN_KOSONG):
        for _ in range(10):
            b.jam.maju(seconds=20)
            assert masuk(b, username=u).json() == SALAH
        b.jam.maju(seconds=20)
        hasil[u, "dalam"] = _jejak_respons(masuk(b, username=u))
    b.jam.maju(minutes=31)  # perkiraan jendela geser sudah bersih
    for u in (AKUN_ADA, AKUN_KOSONG):
        b.jam.maju(seconds=20)
        n_tidur, n_auth0 = len(b.tidur), len(b.auth0.panggilan(path="/oauth/token"))
        hasil[u, "setelah"] = _jejak_respons(masuk(b, username=u))
        tidur[u] = b.tidur[n_tidur:]
        ke_auth0[u] = len(b.auth0.panggilan(path="/oauth/token")) - n_auth0
    assert hasil[AKUN_ADA, "dalam"] == hasil[AKUN_KOSONG, "dalam"]
    assert hasil[AKUN_ADA, "setelah"] == hasil[AKUN_KOSONG, "setelah"]
    status, body, header = hasil[AKUN_ADA, "setelah"]
    assert status == 429 and json.loads(body) == TERLALU_BANYAK
    assert header["retry-after"] is None and header["set-cookie"] is None
    # Waktu setara: jalur yang sama (satu panggilan Auth0) dan tahanan yang sama.
    assert tidur[AKUN_ADA] == tidur[AKUN_KOSONG] == [b.ab.WAKTU_MINIMUM_GAGAL]
    assert ke_auth0[AKUN_ADA] == ke_auth0[AKUN_KOSONG] == 1


def test_penanda_lengket_bertahan_30_hari_sejak_gagal_terakhir(bff):
    b = bff()
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    for _ in range(10):
        assert masuk(b).status_code == 401
        b.jam.maju(seconds=4)
    b.jam.maju(days=29)
    assert masuk(b).json() == TERLALU_BANYAK  # kegagalan ini memperpanjang penanda
    b.jam.maju(days=29)
    assert masuk(b).json() == TERLALU_BANYAK
    b.jam.maju(days=30, seconds=1)
    assert masuk(b).json() == SALAH
    # Penanda per (username + IP): IP lain tidak ikut tertahan.
    b_lain = bff()
    b_lain.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    for _ in range(10):
        masuk(b_lain)
        b_lain.jam.maju(seconds=4)
    b_lain.jam.maju(minutes=31)
    assert masuk(b_lain).status_code == 429
    assert masuk(b_lain, header={"x-vercel-forwarded-for": "203.0.113.5"}).json() == SALAH


def test_429_sekali_tidak_langsung_menyalakan_penanda(bff):
    """429 dihitung sebagai satu kegagalan, tidak langsung menyalakan penanda lengket. Penanda hanya
    ditentukan hitungan SAPA (lihat test_penanda_tidak_naik_karena_blokir_auth0)."""
    b = bff()
    b.auth0.jawaban_token = (429, {"error": "too_many_requests"})
    assert masuk(b).json() == SALAH
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    b.jam.maju(seconds=4)
    assert masuk(b).json() == SALAH


def test_semua_jawaban_terlalu_banyak_seragam_tanpa_retry_after(bff, monkeypatch):
    """Body dan header terlalu_banyak sama persis, apa pun pembatas yang menolak."""
    jejak = {}

    def kasar(b):
        b.cf.jawaban = {**b.cf.jawaban, "success": False}
        for _ in range(60):
            masuk(b)
        return masuk(b)

    def per_ip(b):
        for i in range(20):
            masuk(b, username=f"user{i}")
            b.jam.maju(seconds=1)
        return masuk(b, username="user-lain")

    def username_ip(b):
        b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
        for _ in range(10):
            masuk(b)
            b.jam.maju(seconds=4)
        return masuk(b)

    def penanda(b):
        username_ip(b)
        b.jam.maju(minutes=31)
        return masuk(b)

    def global_login(b):
        for _ in range(b.ss.BATAS_GLOBAL_LOGIN[1]):
            asyncio.run(b.ss.batas(b.ss.KUNCI_GLOBAL_LOGIN, *b.ss.BATAS_GLOBAL_LOGIN))
        return masuk(b)

    def auth0_akun(b):
        # too_many_attempts (dan 429 lain) sendiri dijawab sandi_salah; terlalu_banyak datang dari
        # hitungan SAPA. Jeda 5 menit masih di dalam umur hitungan pendek (15 menit sejak gagal terakhir).
        b.auth0.jawaban_token = (429, {"error": "too_many_attempts"})
        for _ in range(10):
            masuk(b)
            b.jam.maju(minutes=5)
        return masuk(b)

    def username_unik_ip(b):
        # Username unik ke-51 yang gagal dari satu IP dalam sehari.
        b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
        for i in range(b.ab.BATAS_USERNAME_UNIK_IP[1]):
            masuk(b, username=f"pengguna.{i}")
            b.jam.maju(seconds=4)
        return masuk(b, username="pengguna.baru")

    for picu in (kasar, per_ip, username_ip, penanda, global_login, auth0_akun, username_unik_ip):
        jejak[picu.__name__] = _jejak_respons(picu(bff()))
    pertama = jejak["kasar"]
    assert pertama[0] == 429 and json.loads(pertama[1]) == TERLALU_BANYAK and pertama[2]["retry-after"] is None
    assert all(v == pertama for v in jejak.values()), jejak


KASUS_GALAT_AUTH0 = [
    ("invalid_grant", 403, {"error": "invalid_grant", "error_description": DESKRIPSI_AUTH0}, 401, "sandi_salah"),
    ("blocked", 401, {"error": "unauthorized", "error_description": "user is blocked " + DESKRIPSI_AUTH0}, 401, "sandi_salah"),
    ("access_denied", 403, {"error": "access_denied", "error_description": DESKRIPSI_AUTH0}, 401, "sandi_salah"),
    ("password_leaked", 403, {"error": "password_leaked", "error_description": DESKRIPSI_AUTH0}, 401, "sandi_salah"),
    ("requires_verification", 403, {"error": "requires_verification"}, 401, "sandi_salah"),
    ("too_many_attempts", 429, {"error": "too_many_attempts", "error_description": DESKRIPSI_AUTH0}, 401, "sandi_salah"),
    ("mfa_required", 403, {"error": "mfa_required", "mfa_token": "mfa-rahasia"}, 403, "mfa"),
    ("server_error", 500, {"error": "server_error", "error_description": DESKRIPSI_AUTH0}, 503, "belum_siap"),
    ("502_html", 502, None, 503, "belum_siap"),
    ("timeout", 0, None, 503, "belum_siap"),
    ("invalid_client", 401, {"error": "invalid_client", "error_description": DESKRIPSI_AUTH0}, 503, "belum_siap"),
    ("200_tanpa_token", 200, {"token_type": "Bearer"}, 503, "belum_siap"),
    ("error_bukan_string", 400, {"error": {"x": 1}}, 503, "belum_siap"),
]


@pytest.mark.parametrize("nama,status,body,harap_status,harap_kode", KASUS_GALAT_AUTH0,
                         ids=[k[0] for k in KASUS_GALAT_AUTH0])
def test_peta_galat_auth0_tanpa_bocor(bff, monkeypatch, caplog, nama, status, body, harap_status,
                                                  harap_kode):
    caplog.set_level(logging.DEBUG)
    b = bff()
    audit = catat_audit(monkeypatch)
    b.auth0.jawaban_token = (status, body)
    res = masuk(b, password=KANARI)
    assert (res.status_code, res.json().get("kode")) == (harap_status, harap_kode), res.text
    assert set_cookie(res) == [] and "retry-after" not in res.headers
    assert "DESKRIPSI" not in res.text and "mfa-rahasia" not in res.text
    log = caplog.text
    assert KANARI not in log and USERNAME not in log and "DESKRIPSI" not in log
    assert KANARI not in repr(audit) and USERNAME not in repr(audit)


@pytest.mark.parametrize("ubah", [{"ingat": "ya"}, {"username": 123}, {"turnstile_token": "spasi tidak sah"},
                                  {"password": "a\x00b" + KANARI}, {"password": KANARI * 20}])
def test_galat_isian_tidak_memantulkan_isian(bff, monkeypatch, caplog, ubah):
    caplog.set_level(logging.DEBUG)
    b = bff()
    audit = catat_audit(monkeypatch)
    body = {**kredensial(password=KANARI), **ubah}
    res = b.client.post("/api/v1/auth/masuk", json=body, headers=HEADER)
    assert res.status_code in (400, 403)
    assert KANARI not in res.text and KANARI not in caplog.text and KANARI not in repr(audit)
    assert b.auth0.kiriman == []


# --- single-flight penyegaran -------------------------------------------------------------------

def _auth0_segar_lambat(b, monkeypatch, jawaban=None):
    panggilan = []

    async def auth0(path, data, headers=None):
        await asyncio.sleep(0.01)
        panggilan.append(data.get("grant_type"))
        return jawaban or (200, {"access_token": b.auth0.token_baru(jti=str(len(panggilan))), "expires_in": 600})
    monkeypatch.setattr(b.ss, "_auth0_post", auth0)
    return panggilan


@pytest.mark.parametrize("jumlah", [2, 6])
def test_permintaan_serentak_saat_token_habis_hanya_satu_refresh(bff, monkeypatch, jumlah):
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    panggilan = _auth0_segar_lambat(b, monkeypatch)
    b.jam.maju(hours=3)  # access token (600 detik) habis, sesi ingat masih berlaku

    async def serentak():
        return await asyncio.gather(*[b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI) for _ in range(jumlah)],
                                    return_exceptions=True)
    hasil = asyncio.run(serentak())
    assert panggilan == ["refresh_token"]
    assert all(isinstance(h, b.ss.Sesi) for h in hasil), hasil
    assert len({h.access_token for h in hasil}) == 1
    [baris] = b.store.sesi.values()
    assert baris.get("segar_sampai") is None  # kunci dilepas setelah token baru tersimpan


def test_dua_permintaan_http_serentak_satu_refresh(bff, monkeypatch):
    b = bff()
    masuk(b, ingat=True)
    panggilan = _auth0_segar_lambat(b, monkeypatch)
    b.jam.maju(hours=3)
    import httpx

    async def dua():
        transport = httpx.ASGITransport(app=b.api.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://testserver", cookies=b.client.cookies,
                                     headers={"x-vercel-forwarded-for": IP_ASLI}) as k:
            return await asyncio.gather(k.get("/api/v1/akun/status"), k.get("/api/v1/akun/status"))
    hasil = asyncio.run(dua())
    assert [r.status_code for r in hasil] == [200, 200]
    assert panggilan == ["refresh_token"]


def test_refresh_gagal_saat_menunggu_tidak_diulang_oleh_penunggu(bff, monkeypatch):
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    panggilan = _auth0_segar_lambat(b, monkeypatch, jawaban=(503, None))
    b.jam.maju(hours=3)

    async def serentak():
        return await asyncio.gather(*[b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI) for _ in range(3)],
                                    return_exceptions=True)
    hasil = asyncio.run(serentak())
    assert panggilan == ["refresh_token"]
    assert all(isinstance(h, b.ss.SesiBelumSiap) for h in hasil)
    [baris] = b.store.sesi.values()
    assert baris.get("segar_sampai") is None


def test_kunci_segar_basi_bisa_diambil_alih_setelah_lewat(bff, monkeypatch):
    b = bff()
    masuk(b, ingat=True)
    tunggu = []

    async def tunggu_palsu(detik):
        tunggu.append(detik)
    monkeypatch.setattr(b.ss, "_tunggu", tunggu_palsu)
    b.jam.maju(hours=3)
    [baris] = b.store.sesi.values()
    baris["segar_sampai"] = b.jam.waktu + b.ss.UMUR_KUNCI_SEGAR  # instans lain mati di tengah refresh
    res = b.client.get("/api/v1/akun/status")
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert tunggu and sum(tunggu) <= b.ss.MAKS_TUNGGU_SEGAR + 1e-9
    assert b.auth0.panggilan(grant="refresh_token") == []
    b.jam.maju(seconds=b.ss.UMUR_KUNCI_SEGAR.total_seconds() + 1)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    assert len(b.auth0.panggilan(grant="refresh_token")) == 1


def test_penunggu_memakai_token_lama_bila_masih_berlaku_tanpa_menunggu(bff, monkeypatch):
    b = bff()
    b.auth0.jawaban_token = (200, {"access_token": b.auth0.token_baru(), "refresh_token": "rt", "expires_in": 86400})
    masuk(b)
    tunggu = []

    async def tunggu_palsu(detik):
        tunggu.append(detik)
    monkeypatch.setattr(b.ss, "_tunggu", tunggu_palsu)
    b.jam.maju(minutes=16)  # revalidasi berkala, token masih berlaku
    [baris] = b.store.sesi.values()
    baris["segar_sampai"] = b.jam.waktu + b.ss.UMUR_KUNCI_SEGAR
    assert b.client.get("/api/v1/akun/status").status_code == 200
    assert tunggu == [] and b.auth0.panggilan(grant="refresh_token") == []


def test_postgres_klaim_segar_memakai_update_bersyarat(bff, monkeypatch):
    b = bff()
    kueri = []

    class Koneksi(KoneksiPalsuDasar):
        def __init__(self, hasil):
            self.hasil = hasil

        async def execute(self, sql, *args):
            kueri.append((sql, args))
            return self.hasil

        async def close(self):
            pass
    pg = b.ss.PostgresSesiStore("postgresql://uji@db.invalid/sapa")
    pg._skema_siap = True
    hasil = iter(["UPDATE 1", "UPDATE 0"])

    async def sambung():
        return Koneksi(next(hasil))
    monkeypatch.setattr(pg, "_sambung", sambung)
    sekarang = b.jam.waktu
    sampai = sekarang + b.ss.UMUR_KUNCI_SEGAR
    assert asyncio.run(pg.klaim_segar("id-uji", "v2.lama", sampai, sekarang)) is True
    assert asyncio.run(pg.klaim_segar("id-uji", "v2.lama", sampai, sekarang)) is False
    sql = kueri[0][0]
    assert sql.startswith("UPDATE sapa_sesi SET segar_sampai = $3")
    assert "id_hash = $1 AND token_enc = $2 AND (segar_sampai IS NULL OR segar_sampai < $4)" in sql
    assert "ADD COLUMN IF NOT EXISTS segar_sampai" in b.ss.SCHEMA_SQL


# --- sesi, keluar, dan bukti asal ---------------------------------------------------------------

def test_siteverify_timeout_paling_lama_5_detik(bff):
    b = bff()
    assert masuk(b).status_code == 200
    assert b.cf.timeout and all(t is not None and t <= 5 for t in b.cf.timeout)


def test_keluar_mengirim_clear_site_data(bff):
    b = bff()
    masuk(b)
    ditolak = b.client.post("/api/v1/auth/keluar", headers={"X-SAPA": "1"})  # tanpa bukti asal
    assert ditolak.status_code == 403 and "clear-site-data" not in ditolak.headers and len(b.store.sesi) == 1
    res = b.client.post("/api/v1/auth/keluar", headers=ASAL_SENDIRI)
    assert res.status_code == 200
    assert res.headers["clear-site-data"] == '"cookies", "storage"'


@pytest.mark.parametrize("header,boleh", [
    ({"X-SAPA": "1"}, False),
    ({"X-SAPA": "1", "Sec-Fetch-Site": "none"}, False),
    ({"X-SAPA": "1", "Sec-Fetch-Site": "same-site"}, False),
    ({"X-SAPA": "1", "Origin": "https://asing.example"}, False),
    ({"X-SAPA": "1", "Origin": ASAL, "Sec-Fetch-Site": "cross-site"}, False),
    ({"Origin": ASAL, "Sec-Fetch-Site": "same-origin"}, False),
    ({"X-SAPA": "1", "Origin": ASAL}, True),
    ({"X-SAPA": "1", "Sec-Fetch-Site": "same-origin"}, True),
])
def test_non_get_bercookie_wajib_bukti_asal(bff, header, boleh):
    """X-SAPA dan (Origin sendiri atau Sec-Fetch-Site same-origin)."""
    b = bff()
    masuk(b)
    res = b.client.post("/api/v1/auth/send-verification-email", json=BODY_EMAIL, headers=header)
    if boleh:
        assert res.status_code not in (401, 403), res.text
    else:
        assert res.status_code == 403 and res.json() == {"detail": b.ab.PESAN_DITOLAK, "kode": "asal_tidak_sah"}


def test_token_terenkripsi_membawa_versi_kunci(bff, monkeypatch):
    b = bff()
    masuk(b)
    [baris] = b.store.sesi.values()
    versi_a = b.ss.versi_kunci(base64.b64decode(KUNCI_A))
    assert baris["token_enc"].startswith(f"v2.{versi_a}.")
    assert versi_a != b.ss.versi_kunci(base64.b64decode(KUNCI_B))
    assert KUNCI_A not in baris["token_enc"] and len(versi_a) == 8


def test_dekripsi_memilih_kunci_berdasarkan_versi(bff, monkeypatch):
    b = bff()
    masuk(b)
    monkeypatch.setenv("SAPA_SESI_KUNCI", KUNCI_B)
    monkeypatch.setenv("SAPA_SESI_KUNCI_LAMA", KUNCI_A)
    asli, dicoba = b.ss.AESGCM, []

    class AESGCMHitung:
        def __init__(self, kunci):
            self.kunci, self.isi = kunci, asli(kunci)

        def encrypt(self, nonce, data, aad):
            return self.isi.encrypt(nonce, data, aad)

        def decrypt(self, nonce, data, aad):
            dicoba.append(self.kunci)
            return self.isi.decrypt(nonce, data, aad)
    monkeypatch.setattr(b.ss, "AESGCM", AESGCMHitung)
    assert b.client.get("/api/v1/akun/status").status_code == 200
    assert dicoba == [base64.b64decode(KUNCI_A)]  # langsung kunci lama, tanpa coba-coba kunci baru
    [baris] = b.store.sesi.values()
    assert baris["token_enc"].startswith(f"v2.{b.ss.versi_kunci(base64.b64decode(KUNCI_B))}.")
    # Versi yang tidak dikenal kunci mana pun: gagal tertutup tanpa mencoba dekripsi.
    dicoba.clear()
    monkeypatch.setenv("SAPA_SESI_KUNCI", base64.b64encode(b"c" * 32).decode())
    monkeypatch.delenv("SAPA_SESI_KUNCI_LAMA")
    assert b.client.get("/api/v1/akun/status").status_code == 503
    assert dicoba == [] and len(b.store.sesi) == 1


def test_baris_lama_v1_tetap_terbaca_lalu_ditulis_ulang_v2(bff):
    b = bff()
    masuk(b)
    [baris] = b.store.sesi.values()
    isi, _ = b.ss._dekripsi(baris["token_enc"], baris["id_hash"])
    import os
    nonce = os.urandom(12)
    sandi = b.ss.AESGCM(base64.b64decode(KUNCI_A)).encrypt(nonce, json.dumps(isi).encode(), baris["id_hash"].encode())
    baris["token_enc"] = "v1." + base64.urlsafe_b64encode(nonce + sandi).decode()
    assert b.client.get("/api/v1/akun/status").status_code == 200
    assert b.store.sesi[baris["id_hash"]]["token_enc"].startswith("v2.")


@pytest.mark.parametrize("ingat", [True, False])
def test_offline_access_untuk_semua_login_ingat_hanya_umur(bff, ingat):
    b = bff()
    assert masuk(b, ingat=ingat).status_code == 200
    [(_, data, _)] = b.auth0.panggilan(path="/oauth/token")
    assert data["scope"] == "openid offline_access"
    [baris] = b.store.sesi.values()
    isi, _ = b.ss._dekripsi(baris["token_enc"], baris["id_hash"])
    assert isi["rt"] == "rt-rahasia-uji"  # refresh token juga disimpan tanpa "Ingat saya"
    umur = baris["kedaluwarsa"] - baris["dibuat_pada"]
    assert umur == (timedelta(days=30) if ingat else timedelta(hours=12))


# --- hitungan gagal kumulatif dan tulis ulang token bersyarat --------------------------------------

EMAIL_ADA = "akun.ada.uji@contoh.test"
EMAIL_KOSONG = "akun.kosong.uji@contoh.test"


def _auth0_kumulatif(b, monkeypatch, ambang=10, tolak_pada_ambang=False):
    """Auth0 palsu dengan blokir akun seperti tenant asli: hitungan gagal per (pengguna + IP)
    tanpa jendela waktu (reset hanya saat sukses atau unblock); username dan email pengguna yang sama
    berbagi satu hitungan; ambang bisa diatur. Username yang tidak ada selalu invalid_grant."""
    gagal = {}
    pengguna = {AKUN_ADA: "u1", EMAIL_ADA: "u1"}

    async def auth0(path, data, headers=None):
        b.auth0.kiriman.append((path, dict(data), dict(headers or {})))
        if path == "/oauth/token" and data.get("username") in pengguna:
            kunci = (pengguna[data["username"]], (headers or {}).get("auth0-forwarded-for"))
            gagal[kunci] = gagal.get(kunci, 0) + 1
            if gagal[kunci] > ambang or (tolak_pada_ambang and gagal[kunci] >= ambang):
                return 429, {"error": "too_many_attempts", "error_description": "Your account has been blocked"}
        return 403, {"error": "invalid_grant", "error_description": "Wrong email or password."}
    monkeypatch.setattr(b.ss, "_auth0_post", auth0)


def _deret(b, username, n, jeda_detik):
    hasil = []
    for _ in range(n):
        b.jam.maju(seconds=jeda_detik)
        hasil.append(_jejak_respons(masuk(b, username=username)))
    return hasil


def _kode(deret):
    return [json.loads(body)["kode"] for _, body, _ in deret]


def _bandingkan_akun(bff, monkeypatch, jalankan, **auth0):
    hasil = {}
    for u in (AKUN_ADA, AKUN_KOSONG):
        b = bff()
        _auth0_kumulatif(b, monkeypatch, **auth0)
        hasil[u] = jalankan(b, u)
    return hasil[AKUN_ADA], hasil[AKUN_KOSONG]


def test_akun_ada_dan_tidak_ada_identik_percobaan_berjeda_120_detik(bff, monkeypatch):
    """Jendela geser 15 menit tidak pernah mencapai 10, tetapi Auth0 tetap menghitung kumulatif."""
    ada, kosong = _bandingkan_akun(bff, monkeypatch, lambda b, u: _deret(b, u, 12, 120))
    assert ada == kosong
    assert _kode(ada) == ["sandi_salah"] * 10 + ["terlalu_banyak"] * 2


def test_akun_ada_dan_tidak_ada_identik_9_gagal_jeda_31_menit_lalu_2_gagal(bff, monkeypatch):
    """Di bawah 10 gagal, hitungan hanya hidup 15 menit sejak gagal terakhir. Setelah jeda 31 menit
    hitungan mulai lagi untuk akun ada maupun tidak ada; Auth0 yang sudah memblokir akun ada tetap dijawab
    sandi_salah, jadi jawabannya tetap identik."""
    def jalankan(b, u):
        hasil = _deret(b, u, 9, 4)
        b.jam.maju(minutes=31)
        return hasil + _deret(b, u, 2, 4)
    ada, kosong = _bandingkan_akun(bff, monkeypatch, jalankan)
    assert ada == kosong
    assert _kode(ada) == ["sandi_salah"] * 11


def test_akun_ada_dan_tidak_ada_identik_campuran_email_dan_username(bff, monkeypatch):
    """SAPA menghitung dua kunci (username, email), Auth0 satu pengguna: jawaban tetap identik."""
    def jalankan(b, u):
        email = EMAIL_ADA if u == AKUN_ADA else EMAIL_KOSONG
        return _deret(b, u, 5, 4) + _deret(b, email, 5, 4) + _deret(b, u, 6, 4)
    ada, kosong = _bandingkan_akun(bff, monkeypatch, jalankan)
    assert ada == kosong
    assert _kode(ada) == ["sandi_salah"] * 15 + ["terlalu_banyak"]


@pytest.mark.parametrize("ambang,tolak_pada_ambang", [(10, True), (5, False), (3, True)])
def test_akun_ada_dan_tidak_ada_identik_auth0_memblokir_pada_atau_sebelum_percobaan_ke_10(bff, monkeypatch, ambang, tolak_pada_ambang):
    ada, kosong = _bandingkan_akun(bff, monkeypatch, lambda b, u: _deret(b, u, 11, 4),
                                   ambang=ambang, tolak_pada_ambang=tolak_pada_ambang)
    assert ada == kosong
    assert _kode(ada) == ["sandi_salah"] * 10 + ["terlalu_banyak"]


def test_too_many_attempts_dijawab_seperti_invalid_grant_dan_tetap_dihitung(bff):
    b = bff()
    b.auth0.jawaban_token = (429, {"error": "too_many_attempts", "error_description": "blocked"})
    res = masuk(b)
    assert res.status_code == 401 and res.json() == SALAH and "retry-after" not in res.headers
    jendela = int(b.jam.waktu.timestamp() // 900)
    kunci = b.ss.jejak(f"900:gagal:username:{USERNAME}|ip:{IP_ASLI}")
    assert b.store.batas[(kunci, jendela)] == 1  # slot tidak dikembalikan
    for _ in range(9):
        b.jam.maju(minutes=5)
        assert masuk(b).json() == SALAH  # penanda tidak menyala karena too_many_attempts
    b.jam.maju(minutes=5)
    assert masuk(b).json() == TERLALU_BANYAK  # hanya hitungan SAPA (10) yang menyalakan penanda


def test_hitungan_kumulatif_direset_login_sukses(bff):
    b = bff()
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    for _ in range(9):
        b.jam.maju(minutes=5)
        assert masuk(b).json() == SALAH
    b.auth0.jawaban_token = None
    b.jam.maju(minutes=5)
    assert masuk(b).status_code == 200
    b.auth0.jawaban_token = (403, {"error": "invalid_grant"})
    for _ in range(10):
        b.jam.maju(minutes=5)
        assert masuk(b).json() == SALAH
    b.jam.maju(minutes=5)
    assert masuk(b).json() == TERLALU_BANYAK


def test_postgres_hitungan_kumulatif_reset_bila_kedaluwarsa(bff, monkeypatch):
    b = bff()
    kueri = []

    class Koneksi(KoneksiPalsuDasar):
        async def fetchval(self, sql, *args):
            kueri.append((sql, args))
            return 3

        async def close(self):
            pass
    pg = b.ss.PostgresSesiStore("postgresql://uji@db.invalid/sapa")
    pg._skema_siap = True

    async def sambung():
        return Koneksi()
    monkeypatch.setattr(pg, "_sambung", sambung)
    sekarang = b.jam.waktu
    pendek, lengket = sekarang + timedelta(minutes=15), sekarang + timedelta(days=30)
    assert asyncio.run(pg.tambah_gagal_kumulatif("k", sekarang, pendek, lengket, 10)) == 3
    [(sql, args)] = kueri
    assert "VALUES ($1, -1, 1, $2)" in sql
    # Kedaluwarsa pendek, baru naik ke lengket (30 hari) setelah hitungan mencapai ambang.
    lanjut = "CASE WHEN sapa_batas.kedaluwarsa > $4 THEN sapa_batas.jumlah + 1 ELSE 1 END"
    assert f"jumlah = {lanjut}" in sql
    assert f"kedaluwarsa = CASE WHEN {lanjut} >= $5 THEN $3 ELSE $2 END" in sql
    assert sql.rstrip().endswith("RETURNING jumlah")
    assert args == ("k", pendek, lengket, sekarang, 10)
    kueri.clear()
    assert asyncio.run(pg.ada_gagal_kumulatif("k", sekarang)) is True
    [(sql, args)] = kueri
    assert sql == "SELECT 1 FROM sapa_batas WHERE kunci_hash = $1 AND jendela = -1 AND kedaluwarsa > $2"
    assert args == ("k", sekarang)
    kueri.clear()
    assert asyncio.run(pg.hitung_baris_batas(5)) == 3
    [(sql, args)] = kueri
    # Hitungan dibatasi LIMIT.
    assert sql == "SELECT count(*) FROM (SELECT 1 FROM sapa_batas LIMIT $1) AS t" and args == (5,)


def _tahan_tulis(store, nama_tugas, ambil_event):
    """Bungkus semua penulisan token di store: tulisan milik tugas `nama_tugas` ditahan sampai event diset
    (meniru latensi koneksi Neon baru per operasi di sesi_middleware).

    `ambil_event()` mengembalikan event yang dibuat di dalam loop yang berjalan (di Python 3.9
    asyncio.Event yang dibuat di luar loop terikat ke loop lain)."""
    for nama in ("perbarui_token", "tulis_ulang_token", "simpan_hasil_segar"):
        asli = getattr(store, nama, None)
        if asli is None:
            continue

        def bungkus(asli):
            async def tulis(*args, **kw):
                sampai_event = ambil_event()
                if asyncio.current_task().get_name() == nama_tugas and not sampai_event.is_set():
                    await sampai_event.wait()
                return await asli(*args, **kw)
            return tulis
        setattr(store, nama, bungkus(asli))


def _auth0_rotasi(b, monkeypatch):
    """Auth0 palsu dengan rotasi refresh token: RT yang sudah dipakai ditolak (invalid_grant)."""
    terpakai, urutan = set(), itertools.count(2)

    async def auth0(path, data, headers=None):
        await asyncio.sleep(0.01)
        b.auth0.kiriman.append((path, dict(data), dict(headers or {})))
        if data.get("grant_type") == "refresh_token":
            rt = data["refresh_token"]
            if rt in terpakai:
                return 403, {"error": "invalid_grant"}
            terpakai.add(rt)
            return 200, {"access_token": b.auth0.token_baru(jti=rt), "refresh_token": f"RT{next(urutan)}",
                         "expires_in": 600}
        return 200, {}
    monkeypatch.setattr(b.ss, "_auth0_post", auth0)


def _isi_baris(b):
    [baris] = b.store.sesi.values()
    isi, _ = b.ss._dekripsi(baris["token_enc"], baris["id_hash"])
    return baris, isi


def test_tulis_ulang_rotasi_kunci_tidak_menimpa_hasil_refresh(bff, monkeypatch):
    b = bff()
    b.auth0.jawaban_token = (200, {"access_token": b.auth0.token_baru(), "refresh_token": "RT1", "expires_in": 600})
    cookie = nilai_cookie(masuk(b, ingat=True))
    monkeypatch.setenv("SAPA_SESI_KUNCI", KUNCI_B)  # rotasi: baris masih kunci A
    monkeypatch.setenv("SAPA_SESI_KUNCI_LAMA", KUNCI_A)
    b.jam.maju(hours=3)  # access token habis
    _auth0_rotasi(b, monkeypatch)
    peristiwa = {}  # event dibuat di dalam jalan(), di loop asyncio.run
    asli_ambil = b.store.ambil

    async def ambil(id_hash):
        baris = await asli_ambil(id_hash)
        if asyncio.current_task().get_name() == "B":
            peristiwa["b_sudah_baca"].set()
        return baris
    monkeypatch.setattr(b.store, "ambil", ambil)
    _tahan_tulis(b.store, "B", lambda: peristiwa["a_selesai"])

    async def jalan():
        peristiwa.update(b_sudah_baca=asyncio.Event(), a_selesai=asyncio.Event())

        async def tugas_a():
            await peristiwa["b_sudah_baca"].wait()
            try:
                return await b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI)
            finally:
                peristiwa["a_selesai"].set()
        tb = asyncio.create_task(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI), name="B")
        ta = asyncio.create_task(tugas_a(), name="A")
        return await asyncio.gather(ta, tb, return_exceptions=True)
    hasil = asyncio.run(jalan())
    refresh = [k[1]["refresh_token"] for k in b.auth0.panggilan(grant="refresh_token")]
    assert refresh == ["RT1"]  # RT1 tidak pernah dipakai dua kali
    assert all(isinstance(h, b.ss.Sesi) for h in hasil), hasil
    assert hasil[0].access_token == hasil[1].access_token
    baris, isi = _isi_baris(b)
    assert isi["rt"] == "RT2" and baris.get("segar_sampai") is None
    assert baris["token_enc"].startswith(f"v2.{b.ss.versi_kunci(base64.b64decode(KUNCI_B))}.")


def test_tulis_ulang_v1_bersyarat_token_lama(bff):
    b = bff()
    masuk(b)
    [baris] = b.store.sesi.values()

    async def jalan():
        assert await b.store.tulis_ulang_token(baris["id_hash"], "v1.bukan-token-ini", "v2.x.baru") is False
        assert b.store.sesi[baris["id_hash"]]["token_enc"] == baris["token_enc"]
        baris_kini = b.store.sesi[baris["id_hash"]]
        baris_kini["segar_sampai"] = b.jam.waktu
        assert await b.store.tulis_ulang_token(baris["id_hash"], baris["token_enc"], "v2.x.baru") is True
        assert baris_kini["token_enc"] == "v2.x.baru"
        assert baris_kini["segar_sampai"] == b.jam.waktu  # sewa penyegar lain tidak disentuh
    asyncio.run(jalan())


def _penyegar_ditahan(b, monkeypatch, selagi_auth0):
    """Auth0 palsu yang menjalankan `selagi_auth0(baris)` di tengah panggilan refresh (sewa diambil alih)."""
    async def auth0(path, data, headers=None):
        b.auth0.kiriman.append((path, dict(data), dict(headers or {})))
        if data.get("grant_type") == "refresh_token":
            [baris] = b.store.sesi.values()
            selagi_auth0(baris)
            return 200, {"access_token": b.auth0.token_baru(jti="milik-a"), "refresh_token": "RT-A", "expires_in": 600}
        return 200, {}
    monkeypatch.setattr(b.ss, "_auth0_post", auth0)


def test_simpan_hasil_refresh_tidak_menimpa_token_penyegar_lain(bff, monkeypatch):
    """Sewa A habis, C mengambil alih dan sudah menyimpan token baru: simpanan A tidak boleh menimpanya."""
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    b.jam.maju(hours=3)
    token_c = {}

    def c_mengambil_alih(baris):
        isi, _ = b.ss._dekripsi(baris["token_enc"], baris["id_hash"])
        isi = {**isi, "at": b.auth0.token_baru(jti="milik-c"), "rt": "RT-C"}
        baris["token_enc"] = token_c["enc"] = b.ss._enkripsi(isi, baris["id_hash"])
        baris["token_exp"] = b.jam.waktu + timedelta(minutes=10)
        baris["segar_sampai"] = None
        token_c["at"] = isi["at"]
    _penyegar_ditahan(b, monkeypatch, c_mengambil_alih)
    sesi = asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI))
    baris, isi = _isi_baris(b)
    assert baris["token_enc"] == token_c["enc"] and isi["rt"] == "RT-C"
    assert sesi is not None and sesi.access_token == token_c["at"] and sesi.refresh_token == "RT-C"


def test_simpan_hasil_refresh_tetap_jalan_bila_sewa_diambil_alih_tanpa_token_baru(bff, monkeypatch):
    """Sewa A diambil alih C yang belum menyimpan apa pun: token A (lebih baru) tetap disimpan."""
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    b.jam.maju(hours=3)

    def c_mengambil_sewa(baris):
        baris["segar_sampai"] = b.jam.waktu + timedelta(seconds=99)
    _penyegar_ditahan(b, monkeypatch, c_mengambil_sewa)
    sesi = asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI))
    baris, isi = _isi_baris(b)
    assert isi["rt"] == "RT-A" and baris.get("segar_sampai") is None
    assert sesi.refresh_token == "RT-A"


def test_postgres_tulis_token_bersyarat(bff, monkeypatch):
    b = bff()
    kueri = []

    class Koneksi(KoneksiPalsuDasar):
        async def execute(self, sql, *args):
            kueri.append((sql, args))
            return "UPDATE 0"

        async def close(self):
            pass
    pg = b.ss.PostgresSesiStore("postgresql://uji@db.invalid/sapa")
    pg._skema_siap = True

    async def sambung():
        return Koneksi()
    monkeypatch.setattr(pg, "_sambung", sambung)
    sekarang = b.jam.waktu
    assert asyncio.run(pg.tulis_ulang_token("id-uji", "v1.lama", "v2.baru")) is False
    assert asyncio.run(pg.simpan_hasil_segar("id-uji", "v2.baru", sekarang, sekarang, "v2.lama")) is False
    (sql_tulis, args_tulis), (sql_simpan, args_simpan) = kueri
    assert sql_tulis == "UPDATE sapa_sesi SET token_enc = $3 WHERE id_hash = $1 AND token_enc = $2"
    assert args_tulis == ("id-uji", "v1.lama", "v2.baru")
    assert "segar_sampai" not in sql_tulis
    assert sql_simpan.startswith("UPDATE sapa_sesi SET token_enc = $2, token_exp = $3, segar_sampai = NULL")
    assert sql_simpan.endswith("WHERE id_hash = $1 AND (segar_sampai = $4 OR token_enc = $5)")
    assert not hasattr(pg, "perbarui_token")  # tidak ada lagi penulisan token tanpa syarat


def test_sewa_penyegaran_mencakup_timeout_terburuk(bff):
    ss = bff().ss
    assert ss.WAKTU_TERBURUK_AUTH0 >= 2 * ss.TIMEOUT_AUTH0  # httpx: timeout connect + read
    assert ss.TENGGAT_AUTH0 <= ss.WAKTU_TERBURUK_AUTH0  # tenggat total (wait_for) di dalam sewa
    assert ss.WAKTU_TERBURUK_DB >= 2 * ss.TIMEOUT_DB  # asyncpg: timeout connect + command_timeout
    assert ss.UMUR_KUNCI_SEGAR.total_seconds() >= (ss.BATAS_SEBELUM_AUTH0 + ss.WAKTU_TERBURUK_AUTH0
                                                   + ss.WAKTU_TERBURUK_DB)


def test_penyegar_tidak_memanggil_auth0_bila_sisa_sewa_tidak_cukup(bff, monkeypatch):
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    b.jam.maju(hours=3)
    waktu = iter([100.0, 100.0 + b.ss.BATAS_SEBELUM_AUTH0 + 0.5])
    monkeypatch.setattr(b.ss, "_monoton", lambda: next(waktu))
    with pytest.raises(b.ss.SesiBelumSiap):
        asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI))
    assert b.auth0.panggilan(grant="refresh_token") == []
    [baris] = b.store.sesi.values()
    assert baris.get("segar_sampai") is None  # sewa dilepas


# --- umur hitungan gagal, batas username unik, kuota penanda --------------------------------------

GAGAL = (403, {"error": "invalid_grant"})


def _kunci_penanda(b, username=USERNAME, ip=IP_ASLI):
    return b.ss.jejak(f"kumulatif:gagal:username:{b.ab.normal_username(username)}|ip:{b.ab.kunci_ip(ip)}")


def test_hitungan_gagal_berumur_15_menit_lalu_naik_lengket_pada_gagal_ke_10(bff):
    b = bff()
    assert b.ab.UMUR_HITUNGAN_GAGAL == timedelta(minutes=15) and b.ab.UMUR_PENANDA == timedelta(days=30)
    b.auth0.jawaban_token = GAGAL
    for i in range(9):
        assert masuk(b).json() == SALAH
        assert b.store.penanda[_kunci_penanda(b)] == (i + 1, b.jam.waktu + timedelta(minutes=15))
        b.jam.maju(seconds=4)
    assert masuk(b).json() == SALAH  # kegagalan ke-10 masih sandi_salah, tetapi penanda naik menjadi lengket
    assert b.store.penanda[_kunci_penanda(b)] == (10, b.jam.waktu + timedelta(days=30))
    b.jam.maju(minutes=31)  # jauh melewati umur hitungan pendek dan jendela geser
    assert masuk(b).json() == TERLALU_BANYAK
    assert b.store.penanda[_kunci_penanda(b)] == (11, b.jam.waktu + timedelta(days=30))  # diperpanjang
    # Login sukses dari IP itu memadamkan penanda.
    b.auth0.jawaban_token = None
    b.jam.maju(seconds=4)
    assert masuk(b).status_code == 200 and _kunci_penanda(b) not in b.store.penanda


def test_gagal_sekali_banyak_username_tidak_membuat_baris_30_hari(bff):
    b = bff()
    b.auth0.jawaban_token = GAGAL
    for i in range(40):
        assert masuk(b, username=f"pengguna.{i}").json() == SALAH
        b.jam.maju(seconds=4)
    assert len(b.store.penanda) == 40
    assert all(kedaluwarsa <= b.jam.waktu + timedelta(minutes=15) for _, kedaluwarsa in b.store.penanda.values())
    assert all(v <= b.jam.waktu + timedelta(days=1) for v in b.store.kedaluwarsa_batas.values())
    b.jam.maju(minutes=16)
    asyncio.run(b.store.bersihkan_batas(b.jam.waktu))
    assert b.store.penanda == {}


def test_batas_50_username_unik_gagal_per_ip_per_hari(bff):
    b = bff()
    assert b.ab.BATAS_USERNAME_UNIK_IP == (24 * 60 * 60, 50)
    b.auth0.jawaban_token = GAGAL
    for i in range(b.ab.BATAS_USERNAME_UNIK_IP[1]):
        assert masuk(b, username=f"pengguna.{i}").json() == SALAH
        b.jam.maju(seconds=4)
    ke_auth0, n_tidur = len(b.auth0.panggilan(path="/oauth/token")), len(b.tidur)
    res = masuk(b, username="pengguna.baru")
    assert res.status_code == 429 and res.json() == TERLALU_BANYAK and "retry-after" not in res.headers
    assert b.tidur[n_tidur:] == [pytest.approx(b.ab.WAKTU_MINIMUM_GAGAL, abs=0.05)]  # tetap ditahan 700 ms
    # Percobaan tetap diteruskan ke Auth0, tetapi kegagalannya tidak menulis hitungan per username.
    assert len(b.auth0.panggilan(path="/oauth/token")) == ke_auth0 + 1
    assert _kunci_penanda(b, "pengguna.baru") not in b.store.penanda
    # Hanya slot geser 15 menit (berumur paling lama 30 menit) yang tertulis untuk username ini.
    slot_baru = b.ss.jejak(f"900:gagal:username:pengguna.baru|ip:{IP_ASLI}")
    umur_slot = [v - b.jam.waktu for k, v in b.store.kedaluwarsa_batas.items() if k[0] == slot_baru]
    assert umur_slot and all(u <= timedelta(minutes=30) for u in umur_slot)
    # Hitungan IP hari ini tidak bertambah lewat batas (satu baris, tetap 50).
    kunci_ip_hari = b.ss.jejak(f"86400:unik-gagal:ip:{IP_ASLI}")
    assert [v for k, v in b.store.batas.items() if k[0] == kunci_ip_hari] == [50]
    # Sandi benar dari IP yang sama tetap bisa masuk.
    b.auth0.jawaban_token = None
    b.jam.maju(seconds=4)
    assert masuk(b, username="pengguna.lain").status_code == 200
    # Username yang hitungan gagalnya masih hidup tetap dilayani (tidak menambah baris baru).
    b.auth0.jawaban_token = GAGAL
    b.jam.maju(seconds=4)
    assert masuk(b, username="pengguna.3").json() == SALAH
    b.jam.maju(seconds=4)
    # IP lain tidak ikut tertahan; esok hari hitungan IP ini mulai lagi.
    assert masuk(b, username="pengguna.baru", header={"x-vercel-forwarded-for": "203.0.113.5"}).json() == SALAH
    b.jam.maju(days=1)
    assert masuk(b, username="pengguna.baru").json() == SALAH


def test_batas_username_unik_identik_untuk_akun_ada_dan_tidak_ada(bff, monkeypatch):
    def jalankan(b, u):
        monkeypatch.setattr(b.ab, "_monoton", lambda: 100.0)  # durasi asli 0, jadi tahanan = waktu minimum
        for i in range(b.ab.BATAS_USERNAME_UNIK_IP[1]):
            masuk(b, username=f"pengguna.{i}")
            b.jam.maju(seconds=4)
        n_tidur, n_auth0 = len(b.tidur), len(b.auth0.kiriman)
        hasil = _jejak_respons(masuk(b, username=u))
        return hasil, b.tidur[n_tidur:], len(b.auth0.kiriman) - n_auth0
    ada, kosong = _bandingkan_akun(bff, monkeypatch, jalankan)
    assert ada == kosong
    (status, body, header), tidur, ke_auth0 = ada
    assert status == 429 and json.loads(body) == TERLALU_BANYAK and header["retry-after"] is None
    assert tidur == [0.7] and ke_auth0 == 1  # tetap ke Auth0


def test_lewat_batas_username_unik_identik_termasuk_saat_auth0_memblokir(bff, monkeypatch):
    """Setelah batas 50 username unik penuh, deret percobaan pada akun ada (Auth0 memblokir sesudah 10)
    dan tidak ada tetap identik, dan tidak ada hitungan per username yang ditulis."""
    def jalankan(b, u):
        monkeypatch.setattr(b.ab, "_monoton", lambda: 100.0)
        for i in range(b.ab.BATAS_USERNAME_UNIK_IP[1]):
            masuk(b, username=f"pengguna.{i}")
            b.jam.maju(seconds=4)
        n_tidur = len(b.tidur)
        hasil = _deret(b, u, 12, 120)
        b.jam.maju(minutes=31)
        hasil += _deret(b, u, 3, 4)
        assert _kunci_penanda(b, u) not in b.store.penanda
        return hasil, b.tidur[n_tidur:]
    ada, kosong = _bandingkan_akun(bff, monkeypatch, jalankan)
    assert ada == kosong
    assert _kode(ada[0]) == ["terlalu_banyak"] * 15


def test_kuota_harian_penanda_lengket_membatasi_baris_30_hari(bff, monkeypatch, caplog):
    """Penanda 30 hari baru dari banyak prefiks IPv6 /64 dibatasi kuota harian seluruh SAPA."""
    b = bff()
    caplog.set_level(logging.INFO)
    assert b.ab.BATAS_PENANDA_LENGKET_HARIAN == (24 * 60 * 60, 1000)
    monkeypatch.setattr(b.ab, "BATAS_PENANDA_LENGKET_HARIAN", (24 * 60 * 60, 2))
    b.auth0.jawaban_token = GAGAL
    ip6 = [f"2001:db8:0:{i:x}::1" for i in range(4)]  # empat /64 dalam satu /48
    for ip in ip6:
        for _ in range(10):
            assert masuk(b, header={"x-vercel-forwarded-for": ip}).json() == SALAH
            b.jam.maju(seconds=4)
    umur = [b.store.penanda[_kunci_penanda(b, ip=ip)][1] - b.jam.waktu for ip in ip6]
    lengket = [u for u in umur if u > timedelta(days=29)]
    assert len(lengket) == 2 and all(u <= timedelta(minutes=15) for u in umur if u not in lengket)
    # Kuota penuh dicatat sebagai peringatan, tanpa username.
    kuota = [r.getMessage() for r in caplog.records
             if r.levelno == logging.WARNING and "Kuota penanda lengket harian penuh" in r.getMessage()]
    assert len(kuota) == 2 and not any(USERNAME in m or b.ab.ringkas_username(USERNAME) in m for m in kuota)
    # Hitungan yang mencapai ambang tetap menjawab terlalu_banyak selama hidup (fungsi hitungan SAPA saja).
    for ip in ip6:
        assert masuk(b, header={"x-vercel-forwarded-for": ip}).json() == TERLALU_BANYAK
    # Perpanjangan selama kuota penuh juga tetap pendek; kuota global hanya satu baris per hari.
    assert sum(1 for u in (b.store.penanda[_kunci_penanda(b, ip=ip)][1] - b.jam.waktu for ip in ip6)
               if u > timedelta(days=29)) == 2
    kunci_kuota = b.ss.jejak(f"86400:{b.ab.KUNCI_PENANDA_LENGKET_HARIAN}")
    assert sum(1 for k in b.store.batas if k[0] == kunci_kuota) == 1
    # Esok hari kuota mulai lagi.
    b.jam.maju(days=1)
    for _ in range(10):
        masuk(b, username="pengguna.esok", header={"x-vercel-forwarded-for": ip6[0]})
        b.jam.maju(seconds=4)
    assert b.store.penanda[_kunci_penanda(b, "pengguna.esok", ip6[0])][1] - b.jam.waktu > timedelta(days=29)


def test_kuota_penanda_lengket_penuh_tetap_identik_untuk_akun_ada_dan_tidak_ada(bff, monkeypatch):
    def jalankan(b, u):
        monkeypatch.setattr(b.ab, "BATAS_PENANDA_LENGKET_HARIAN", (24 * 60 * 60, 0))  # kuota sudah penuh
        hasil = _deret(b, u, 12, 4)
        b.jam.maju(minutes=31)  # hitungan yang mencapai ambang hanya hidup 15 menit; slot geser juga bersih
        return hasil + _deret(b, u, 2, 4)
    ada, kosong = _bandingkan_akun(bff, monkeypatch, jalankan)
    assert ada == kosong
    assert _kode(ada) == ["sandi_salah"] * 10 + ["terlalu_banyak"] * 2 + ["sandi_salah"] * 2


def test_ukuran_sapa_batas_terbatas_saat_banyak_username_unik(bff, monkeypatch):
    b = bff()
    b.auth0.jawaban_token = GAGAL
    monkeypatch.setattr(b.ss, "_acak", lambda: 0.0)  # pembersihan berjalan di setiap panggilan pembatas
    ukuran = []
    for i in range(600):  # 600 username unik dari satu IP dalam 5 jam
        masuk(b, username=f"unik.{i}")
        b.jam.maju(seconds=30)
        ukuran.append(len(b.store.batas) + len(b.store.penanda))
    assert len(b.store.penanda) <= b.ab.BATAS_USERNAME_UNIK_IP[1]
    # Lewat batas 50 percobaan tetap ke Auth0 dan hanya menulis baris berumur pendek: hash token Turnstile
    # (5 menit) dan slot geser (paling lama 30 menit), tanpa hitungan peringatan per username.
    batas_atas = b.ab.BATAS_USERNAME_UNIK_IP[1] + (2 * 3600 + 2 * 900) // 30 + 10
    assert max(ukuran) <= batas_atas, max(ukuran)
    assert max(ukuran[300:]) <= (2 * 900 + b.ab.UMUR_TURNSTILE) // 30 + 10, max(ukuran[300:])
    assert all(v <= b.jam.waktu + timedelta(days=1) for v in b.store.kedaluwarsa_batas.values())
    harian = {b.ss.jejak(f"86400:unik-gagal:ip:{IP_ASLI}"), b.ss.jejak(f"86400:{b.ab.KUNCI_PENANDA_LENGKET_HARIAN}"),
              b.ss.jejak(f"86400:peringatan-unik:ip:{IP_ASLI}")}
    assert all(v <= b.jam.waktu + timedelta(minutes=30) for k, v in b.store.kedaluwarsa_batas.items()
               if k[0] not in harian)
    kunci_ip_hari = b.ss.jejak(f"86400:unik-gagal:ip:{IP_ASLI}")
    assert sum(1 for k in b.store.batas if k[0] == kunci_ip_hari) == 1  # satu baris hitungan per IP per hari
    kunci_peringatan = b.ss.jejak(f"86400:peringatan-unik:ip:{IP_ASLI}")
    assert sum(1 for k in b.store.batas if k[0] == kunci_peringatan) == 1  # penanda peringatan juga satu per hari


def test_peringatan_ukuran_sapa_batas_saat_pembersihan(bff, monkeypatch, caplog):
    b = bff()
    assert b.ss.AMBANG_PERINGATAN_BARIS_BATAS == 200_000
    monkeypatch.setattr(b.ss, "_acak", lambda: 0.0)
    caplog.set_level(logging.WARNING, logger="sapa-api")
    masuk(b)
    assert "sapa_batas" not in caplog.text
    monkeypatch.setattr(b.ss, "AMBANG_PERINGATAN_BARIS_BATAS", 3)
    b.jam.maju(seconds=4)
    masuk(b)
    assert "Peringatan: tabel sapa_batas berisi lebih dari 3 baris" in caplog.text


def test_penanda_tidak_naik_karena_blokir_auth0(bff, monkeypatch):
    """Penanda lengket hanya dari hitungan SAPA, jadi blokir Auth0 tidak menaikkannya: sesudah jeda 31 menit
    (jendela geser 15 menit juga sudah bersih) hitungan akun ada dan tidak ada sama-sama mulai lagi."""
    def jalankan(b, u):
        hasil = _deret(b, u, 9, 4)
        b.jam.maju(minutes=31)
        hasil += _deret(b, u, 2, 4)  # Auth0: kegagalan ke-10 dan ke-11, akun ada mulai diblokir
        b.jam.maju(minutes=31)
        return hasil + _deret(b, u, 9, 4)
    ada, kosong = _bandingkan_akun(bff, monkeypatch, jalankan)
    assert ada == kosong
    assert _kode(ada) == ["sandi_salah"] * 20


def test_blokir_auth0_berbentuk_429_lain_identik_untuk_akun_ada_dan_tidak_ada(bff, monkeypatch):
    """Bila Auth0 memblokir akun dengan bentuk 429 yang lain, jawabannya tetap identik."""
    def jalankan(b, u):
        asli = b.ss._auth0_post  # Auth0 palsu kumulatif dari _bandingkan_akun

        async def auth0(path, data, headers=None):
            status, body = await asli(path, data, headers)
            return (429, {"error": "too_many_requests"}) if status == 429 else (status, body)
        monkeypatch.setattr(b.ss, "_auth0_post", auth0)
        return _deret(b, u, 12, 120)
    ada, kosong = _bandingkan_akun(bff, monkeypatch, jalankan, ambang=5)  # Auth0 memblokir mulai percobaan ke-6
    assert ada == kosong
    assert _kode(ada) == ["sandi_salah"] * 10 + ["terlalu_banyak"] * 2


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


# Semua jawaban sesudah Auth0 dipanggil yang tidak pasti ditolak dianggap hasil tidak diketahui.
@pytest.mark.parametrize("jawaban", [(0, None), (502, None), (504, None), (200, None), (200, {"error": "x"}),
                                     (200, {"access_token": None}), (500, None), (520, None), (524, None),
                                     (302, None), (418, None)])
def test_sewa_tidak_dilepas_bila_hasil_refresh_tidak_diketahui(bff, monkeypatch, jawaban):
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    b.jam.maju(hours=3)  # access token habis
    b.auth0.jawaban_segar = jawaban

    async def tunggu_palsu(detik):
        pass
    monkeypatch.setattr(b.ss, "_tunggu", tunggu_palsu)
    with pytest.raises(b.ss.SesiBelumSiap):
        asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI))
    [baris] = b.store.sesi.values()
    assert baris["segar_sampai"] == b.jam.waktu + b.ss.UMUR_KUNCI_SEGAR  # sewa dibiarkan sampai kedaluwarsa
    # Selama sewa berjalan, refresh token yang sama tidak dipakai lagi.
    b.jam.maju(seconds=10)
    with pytest.raises(b.ss.SesiBelumSiap):
        asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI))
    assert len(b.auth0.panggilan(grant="refresh_token")) == 1
    b.auth0.jawaban_segar = None
    b.jam.maju(seconds=b.ss.UMUR_KUNCI_SEGAR.total_seconds())
    assert asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI)) is not None
    assert len(b.auth0.panggilan(grant="refresh_token")) == 2


@pytest.mark.parametrize("jawaban", [(429, {"error": "too_many_requests"}), (503, None),
                                     (400, {"error": "invalid_request"}), (401, {"error": "invalid_client"}),
                                     (403, {"error": "unauthorized_client"}), (404, None)])
def test_sewa_dilepas_hanya_bila_auth0_pasti_tidak_memproses(bff, monkeypatch, jawaban):
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    b.jam.maju(hours=3)
    b.auth0.jawaban_segar = jawaban
    with pytest.raises(b.ss.SesiBelumSiap):
        asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI))
    [baris] = b.store.sesi.values()
    assert baris.get("segar_sampai") is None and len(b.store.sesi) == 1  # sewa dilepas, sesi tetap ada
    assert b.ss._STATUS_PASTI_TIDAK_DIPROSES == {400, 401, 403, 404, 429, 503}


def test_sewa_tidak_dilepas_bila_panggilan_auth0_terputus(bff, monkeypatch):
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    b.jam.maju(hours=3)

    async def putus(path, data, headers=None):
        raise ConnectionResetError("koneksi putus")
    monkeypatch.setattr(b.ss, "_auth0_post", putus)
    with pytest.raises(ConnectionResetError):
        asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI))
    [baris] = b.store.sesi.values()
    assert baris["segar_sampai"] == b.jam.waktu + b.ss.UMUR_KUNCI_SEGAR


def test_sewa_dilepas_bila_gagal_sebelum_auth0_dipanggil(bff, monkeypatch):
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    b.jam.maju(hours=3)

    async def db_mati(*a, **k):
        raise b.ss.SesiBelumSiap()
    monkeypatch.setattr(b.ss, "batas", db_mati)
    with pytest.raises(b.ss.SesiBelumSiap):
        asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI))
    [baris] = b.store.sesi.values()
    assert baris.get("segar_sampai") is None and b.auth0.panggilan(grant="refresh_token") == []


def _http_auth0_palsu(monkeypatch, ss, tunda, terkirim):
    """Klien httpx Auth0 dengan transport palsu: menunggu `tunda` detik (DNS, connect lambat) lalu mencatat
    kiriman dan menjawab 200. Pembatalan oleh tenggat menghentikannya seperti soket sungguhan."""
    import httpx

    async def tangani(permintaan):
        await asyncio.sleep(tunda)
        terkirim.append((permintaan.url.path, permintaan.content.decode(), time.monotonic()))
        return httpx.Response(200, json={"access_token": "at-uji", "expires_in": 600})
    monkeypatch.setattr(ss, "_klien_auth0", lambda: httpx.AsyncClient(transport=httpx.MockTransport(tangani)))


def test_tenggat_total_auth0_menjadi_hasil_tidak_diketahui(monkeypatch):
    import sesi_service as ss
    assert ss.TENGGAT_AUTH0 == ss.WAKTU_TERBURUK_AUTH0 == 16
    monkeypatch.setenv("AUTH0_DOMAIN", "sapa.test.auth0.com")
    _http_auth0_palsu(monkeypatch, ss, 0.3, [])
    monkeypatch.setattr(ss, "TENGGAT_AUTH0", 0.05)

    async def jalan():
        mulai = time.monotonic()
        hasil = await ss._auth0_post("/oauth/token", {})
        return hasil, time.monotonic() - mulai
    hasil, durasi = asyncio.run(jalan())
    assert hasil == (0, None) and durasi < 0.25


def test_tidak_ada_kiriman_refresh_token_sesudah_tenggat(monkeypatch):
    """Klien async dibatalkan bersama tenggat, jadi tidak ada kiriman refresh token sesudah tenggat."""
    import sesi_service as ss
    monkeypatch.setenv("AUTH0_DOMAIN", "sapa.test.auth0.com")
    terkirim = []
    _http_auth0_palsu(monkeypatch, ss, 0.6, terkirim)
    monkeypatch.setattr(ss, "TENGGAT_AUTH0", 0.2)

    async def jalan():
        hasil = await ss._auth0_post("/oauth/token", {"grant_type": "refresh_token", "refresh_token": "RT-uji"})
        await asyncio.sleep(0.8)  # loop tetap hidup jauh melewati waktu kiriman yang tertunda
        return hasil
    assert asyncio.run(jalan()) == (0, None)
    assert terkirim == []


def test_auth0_post_memakai_httpx_dan_memetakan_jawaban(monkeypatch):
    import sesi_service as ss
    monkeypatch.setenv("AUTH0_DOMAIN", "sapa.test.auth0.com")
    terkirim = []
    _http_auth0_palsu(monkeypatch, ss, 0, terkirim)
    hasil = asyncio.run(ss._auth0_post("/oauth/token", {"grant_type": "refresh_token", "refresh_token": "RT-uji"},
                                       {"auth0-forwarded-for": IP_ASLI}))
    assert hasil == (200, {"access_token": "at-uji", "expires_in": 600})
    assert terkirim[0][0] == "/oauth/token" and "refresh_token=RT-uji" in terkirim[0][1]
    import httpx

    def gagal(permintaan):
        raise httpx.ConnectError("putus", request=permintaan)
    monkeypatch.setattr(ss, "_klien_auth0", lambda: httpx.AsyncClient(transport=httpx.MockTransport(gagal)))
    # Koneksi tidak pernah terbentuk, jadi permintaan pasti belum terkirim (bukan hasil tidak diketahui).
    assert asyncio.run(ss._auth0_post("/oauth/token", {})) == (ss.STATUS_TIDAK_TERKIRIM, None)
    monkeypatch.setattr(ss, "_klien_auth0", lambda: httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(500, content=b"<html>bukan json</html>"))))
    assert asyncio.run(ss._auth0_post("/oauth/token", {})) == (500, None)


def test_tenggat_auth0_saat_masuk_menjadi_belum_siap(bff, monkeypatch):
    import sesi_service
    asli = sesi_service._auth0_post
    b = bff()
    assert b.ss is sesi_service
    monkeypatch.setattr(b.ss, "_auth0_post", asli)
    monkeypatch.setattr(b.ss, "TENGGAT_AUTH0", 0.05)
    _http_auth0_palsu(monkeypatch, b.ss, 0.3, [])
    res = masuk(b)
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    jendela = int(b.jam.waktu.timestamp() // 900)
    assert b.store.batas[(b.ss.jejak(f"900:gagal:username:{USERNAME}|ip:{IP_ASLI}"), jendela)] == 0  # slot kembali


def test_tenggat_total_siteverify_503_tanpa_auth0(bff, monkeypatch):
    b = bff()
    assert b.ab.TENGGAT_SITEVERIFY == 5
    pasang_cloudflare(monkeypatch, b.ts, b.cf, tunda=0.3)
    monkeypatch.setattr(b.ab, "TENGGAT_SITEVERIFY", 0.05)
    mulai = time.monotonic()
    res = masuk(b)
    assert time.monotonic() - mulai < 0.25  # tidak ada thread tertinggal yang ditunggu saat loop ditutup
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    assert b.auth0.kiriman == []
    # Jawaban tidak menunggu siteverify 0,3 detik: sisa tahanan 700 ms masih lebih dari 0,6 detik.
    assert b.tidur and b.tidur[-1] > 0.6
    assert b.cf.kiriman == []  # siteverify dibatalkan bersama tenggat, tidak selesai di belakang


def test_siteverify_login_tidak_memakai_executor_thread(bff, monkeypatch):
    """Siteverify login memakai httpx.AsyncClient, bukan asyncio.to_thread di executor bawaan loop."""
    b = bff()

    def dilarang(*a, **k):
        raise AssertionError("siteverify login tidak boleh memakai executor thread")
    monkeypatch.setattr(asyncio, "to_thread", dilarang)
    monkeypatch.setattr(b.ts, "cek_turnstile", dilarang)  # versi sinkron hanya untuk verifikasi manusia
    assert masuk(b).status_code == 200
    assert len(b.cf.kiriman) == 1 and b.cf.kiriman[0][1]["remoteip"] == IP_ASLI
    assert b.cf.kiriman[0][1]["response"].startswith("jawaban-turnstile-")


def test_siteverify_lambat_dibatalkan_tanpa_kerja_tertinggal(bff, monkeypatch):
    """Setelah tenggat siteverify habis tidak ada permintaan ke Cloudflare yang masih berjalan."""
    b = bff()
    pasang_cloudflare(monkeypatch, b.ts, b.cf, tunda=0.6)

    async def jalan():
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(b.ts.cek_turnstile_async("jawaban", IP_ASLI, b.ts.AKSI_MASUK), 0.1)
        await asyncio.sleep(0.8)  # loop tetap hidup melewati waktu jawaban yang tertunda
    asyncio.run(jalan())
    assert b.cf.kiriman == []


def test_siteverify_tidak_terjangkau_tetap_belum_siap_tanpa_auth0(bff, monkeypatch):
    import httpx
    b = bff()

    def gagal(permintaan):
        raise httpx.ConnectTimeout("lambat", request=permintaan)
    monkeypatch.setattr(b.ts, "_klien_siteverify", lambda: httpx.AsyncClient(transport=httpx.MockTransport(gagal)))
    res = masuk(b)
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap" and b.auth0.kiriman == []


def _surat_kontrol_palsu(b, monkeypatch):
    from datetime import date
    from test_surat_kontrol_api import FakeDrive
    api = b.api
    drive = FakeDrive()
    monkeypatch.setattr(api, "_sk_drive_info", drive.info)
    monkeypatch.setattr(api, "_sk_drive_unduh", drive.unduh)
    monkeypatch.setattr(api, "_sk_drive_tulis", drive.tulis)
    monkeypatch.setattr(api, "_sk_simpanan", {"versi": None, "isi": None})
    monkeypatch.setattr(api, "_sk_hari_ini", lambda: date(2026, 11, 19))
    monkeypatch.setattr(api.pengguna_service, "status_akun", lambda sub, segar=False: {
        "wajib_ganti_sandi": False, "nonaktif": False, "diatur_ulang_pada": None, "kode_ppk": ""})
    monkeypatch.setattr(api.pengguna_service, "get_client", lambda: None)
    return drive


@pytest.mark.parametrize("aksi", ["periksa", "integrasikan"])
def test_surat_kontrol_lewat_cookie_admin_wajib_csrf(bff, monkeypatch, aksi):
    from test_surat_kontrol_service import kiriman, sepuluh
    b = bff()
    drive = _surat_kontrol_palsu(b, monkeypatch)
    b.auth0.peran = ["admin"]
    assert masuk(b).status_code == 200
    alamat, isi, gz = f"/api/v1/surat-kontrol/{aksi}?bulan=2026-11", kiriman(sepuluh()), {"Content-Type": "application/gzip"}
    for header in ({}, {"X-SAPA": "1", "Origin": "https://asing.example"}, {"Origin": ASAL}):
        res = b.client.post(alamat, content=isi, headers={**gz, **header})
        assert res.status_code == 403 and res.json()["kode"] == "asal_tidak_sah", header
    assert drive.tulis_dipanggil == 0
    sah = b.client.post(alamat, content=isi, headers={**gz, **ASAL_SENDIRI})
    assert sah.status_code not in (401, 403), sah.text
    assert sah.status_code == 200
    assert drive.tulis_dipanggil == (1 if aksi == "integrasikan" else 0)


def test_info_sewa_penyegaran_32_detik(bff):
    ss = bff().ss
    assert ss.UMUR_KUNCI_SEGAR == timedelta(seconds=32)
    assert ss.BATAS_SEBELUM_AUTH0 + ss.WAKTU_TERBURUK_AUTH0 + ss.WAKTU_TERBURUK_DB == 32


def test_info_menunggu_penyegar_memakai_backoff_dan_satu_koneksi(bff, monkeypatch):
    b = bff()
    tunggu, dibuka, ditutup, dibaca = [], [], [], []

    async def tunggu_palsu(detik):
        tunggu.append(detik)
    monkeypatch.setattr(b.ss, "_tunggu", tunggu_palsu)
    sekarang = b.jam.waktu
    baris = {"id_hash": "id-uji", "sub": "auth0|uji", "ingat": True, "dibuat_pada": sekarang,
             "terakhir_dipakai": sekarang, "kedaluwarsa": sekarang + timedelta(days=1), "token_enc": "v2.lama",
             "token_exp": sekarang, "segar_sampai": sekarang + b.ss.UMUR_KUNCI_SEGAR}

    class Koneksi(KoneksiPalsuDasar):
        async def fetchrow(self, sql, *args):
            dibaca.append(args)
            return dict(baris)

        async def close(self):
            ditutup.append(1)
    pg = b.ss.PostgresSesiStore("postgresql://uji@db.invalid/sapa")
    pg._skema_siap = True

    async def sambung():
        dibuka.append(1)
        return Koneksi()
    monkeypatch.setattr(pg, "_sambung", sambung)
    monkeypatch.setattr(b.ss, "_store", pg)
    sesi = b.ss.Sesi(id_hash="id-uji", sub="auth0|uji", ingat=True, dibuat_pada=sekarang, terakhir_dipakai=sekarang,
                     kedaluwarsa=sekarang + timedelta(days=1), token_exp=sekarang, access_token="at",
                     token_enc="v2.lama")
    assert asyncio.run(b.ss._tunggu_penyegar(sesi)) is None
    assert tunggu == pytest.approx([0.1, 0.2, 0.4, 0.5, 0.5, 0.3])
    assert sum(tunggu) <= b.ss.MAKS_TUNGGU_SEGAR + 1e-9
    assert dibuka == [1] and ditutup == [1] and len(dibaca) == len(tunggu)


def test_menunggu_penyegar_dibatasi_waktu_dinding_termasuk_baca_db(bff, monkeypatch):
    """MAKS_TUNGGU_SEGAR berlaku untuk waktu dinding, bukan hanya jumlah jeda tidur."""
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    sesi_awal = asyncio.run(b.ss.ambil_sesi(cookie))
    [baris] = b.store.sesi.values()
    baris["segar_sampai"] = b.jam.waktu + b.ss.UMUR_KUNCI_SEGAR  # penyegar lain memegang sewa
    monkeypatch.setattr(b.ss, "MAKS_TUNGGU_SEGAR", 0.5)
    asli = b.store.ambil

    async def ambil_lambat(id_hash):
        await asyncio.sleep(0.2)  # latensi DB
        return await asli(id_hash)
    monkeypatch.setattr(b.store, "ambil", ambil_lambat)
    mulai = time.monotonic()
    assert asyncio.run(b.ss._tunggu_penyegar(sesi_awal)) is None
    assert time.monotonic() - mulai < 0.5 + 0.15

    async def ambil_macet(id_hash):
        await asyncio.sleep(5)
    monkeypatch.setattr(b.store, "ambil", ambil_macet)
    mulai = time.monotonic()
    assert asyncio.run(b.ss._tunggu_penyegar(sesi_awal)) is None
    assert time.monotonic() - mulai < 0.5 + 0.15


def test_peringatan_batas_username_unik_sekali_per_ip_per_hari_tanpa_username(bff, caplog):
    """Tiap kali batas 50 username unik tercapai, satu peringatan per /64 per hari,
    dengan IP tersamar dan tanpa username."""
    b = bff()
    caplog.set_level(logging.INFO)
    b.auth0.jawaban_token = GAGAL
    for i in range(b.ab.BATAS_USERNAME_UNIK_IP[1]):
        masuk(b, username=f"pengguna.{i}")
        b.jam.maju(seconds=4)

    def peringatan():
        return [r.getMessage() for r in caplog.records
                if r.levelno == logging.WARNING and "username unik" in r.getMessage()]

    assert peringatan() == []
    for j in range(3):
        assert masuk(b, username=f"lewat.{j}").json() == TERLALU_BANYAK
        b.jam.maju(seconds=4)
    pesan = peringatan()
    assert len(pesan) == 1
    assert "198.51.100.0" in pesan[0] and IP_ASLI not in pesan[0]
    assert "lewat." not in pesan[0] and "pengguna." not in pesan[0]
    b.jam.maju(days=1)
    for i in range(b.ab.BATAS_USERNAME_UNIK_IP[1] + 1):
        masuk(b, username=f"esok.{i}")
        b.jam.maju(seconds=4)
    assert len(peringatan()) == 2


@pytest.mark.parametrize("jawaban, tenant", [((429, {"error": "too_many_requests"}), True),
                                             ((429, None), True),
                                             ((429, {"error": "too_many_attempts"}), False)])
def test_429_batas_tenant_dibedakan_di_log_tanpa_username(bff, caplog, jawaban, tenant):
    """429 batas tenant Auth0 dicatat terpisah di log, tanpa username, sementara
    jawaban ke pengguna tetap sandi_salah."""
    b = bff()
    caplog.set_level(logging.INFO)
    b.auth0.jawaban_token = jawaban
    assert masuk(b).json() == SALAH
    pesan = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING and "tenant" in r.getMessage()]
    assert len(pesan) == (1 if tenant else 0)
    blob = "\n".join(r.getMessage() for r in caplog.records)
    assert USERNAME not in blob and b.ab.ringkas_username(USERNAME) not in "\n".join(pesan)


# --- lewat batas username unik, tenggat jaringan, penutupan koneksi ------------------------------

def _isi_batas_username_unik(b):
    b.auth0.jawaban_token = GAGAL
    for i in range(b.ab.BATAS_USERNAME_UNIK_IP[1]):
        masuk(b, username=f"pengguna.{i}")
        b.jam.maju(seconds=4)


def test_lewat_batas_unik_tidak_menulis_hitungan_per_username(bff):
    """Setelah batas 50 username unik penuh, kegagalan tidak menulis baris gagal-jam per username; per
    percobaan hanya baris berumur pendek (hash token Turnstile dan slot geser)."""
    b = bff()
    _isi_batas_username_unik(b)
    sebelum = set(b.store.kedaluwarsa_batas)
    assert masuk(b, username="pengguna.baru").json() == TERLALU_BANYAK
    # Penanda peringatan batas unik (satu baris per IP per hari) dibuat pada percobaan pertama lewat batas.
    baru = set(b.store.kedaluwarsa_batas) - sebelum - {(b.ss.jejak(f"86400:peringatan-unik:ip:{IP_ASLI}"),
                                                         int(b.jam.waktu.timestamp() // 86400))}
    gagal_jam = b.ss.jejak("3600:gagal-jam:username:pengguna.baru")
    assert not any(k[0] == gagal_jam for k in b.store.batas)
    assert baru and all(b.store.kedaluwarsa_batas[k] - b.jam.waktu <= timedelta(minutes=30) for k in baru)
    # Username di bawah batas tetap dihitung untuk peringatan 30 gagal per jam.
    assert any(k[0] == b.ss.jejak("3600:gagal-jam:username:pengguna.0") for k in b.store.batas)


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


def test_urutan_operasi_store_lewat_batas_unik_identik_untuk_akun_ada_dan_tidak_ada(bff, monkeypatch):
    """Setelah batas username unik penuh, urutan semua operasi store (method publik apa pun, dengan argumen
    dan hasil ternormal, dicatat lewat proxy) dan isi akhir baris pembatas sama untuk akun ada (Auth0
    memblokir) dan tidak ada."""

    def jalankan(b, u):
        monkeypatch.setattr(b.ab, "_monoton", lambda: 100.0)
        monkeypatch.setattr(b.ss, "_acak", lambda: 0.0)  # pembersihan deterministik (bukan 1% acak)
        _isi_batas_username_unik(b)
        urutan = []
        monkeypatch.setattr(b.ss, "_store", _PerekamStore(b.store, urutan, b.jam))
        hasil = _deret(b, u, 12, 120)
        b.jam.maju(minutes=31)
        return hasil + _deret(b, u, 3, 4), urutan, _isi_batas_ternormal(b)
    ada, kosong = _bandingkan_akun(bff, monkeypatch, jalankan)
    assert ada[1], "rekaman operasi store kosong"
    nama = {r[0] for r in ada[1]}
    assert {"tambah_batas", "tambah_batas_geser", "kurangi_batas", "ada_gagal_kumulatif", "bersihkan_batas",
            "hitung_baris_batas"} <= nama
    assert any(isinstance(x, tuple) and x[:1] == ("selisih",) for r in ada[1] for x in r[1])
    assert ada == kosong
    assert "tambah_gagal_kumulatif" not in nama


def test_klien_auth0_dan_siteverify_bertenggat_per_tahap():
    """Tenggat connect dan pool httpx di bawah tenggat total. TCP connect dan TLS handshake masing-masing
    mendapat tenggat connect, jadi yang dibandingkan 2 x connect + pool."""
    import sesi_service as ss
    import turnstile as ts

    async def periksa():
        for klien, tenggat in ((ss._klien_auth0(), ss.TENGGAT_AUTH0), (ts._klien_siteverify(), ts.TENGGAT_SITEVERIFY)):
            async with klien:
                t = klien.timeout
                assert None not in (t.connect, t.pool, t.read, t.write)
                assert 2 * t.connect + t.pool < tenggat and t.read <= tenggat and t.write <= tenggat
                assert klien.follow_redirects is False
    asyncio.run(periksa())
    assert (ss.TIMEOUT_AUTH0_SAMBUNG, ss.TIMEOUT_AUTH0_POOL, ss.TIMEOUT_AUTH0) == (5, 5, 8)
    assert ss.TENGGAT_AUTH0 == 16 and ts.TENGGAT_SITEVERIFY == 5


def test_handshake_tls_macet_ditutup_httpx_dan_belum_terkirim(monkeypatch):
    """Soket sungguhan di loopback: server menerima TCP tetapi tidak pernah menjawab TLS.
    Tenggat connect httpx habis lebih dulu, soket ditutup (server melihat EOF), dan hasilnya pasti belum
    terkirim (bukan hasil tidak diketahui)."""
    import sesi_service as ss
    monkeypatch.setattr(ss, "TIMEOUT_AUTH0_SAMBUNG", 0.2)
    monkeypatch.setattr(ss, "TENGGAT_AUTH0", 3)

    async def jalan():
        tutup = asyncio.get_running_loop().create_future()

        async def terima(reader, writer):
            while await reader.read(4096):  # ClientHello dibaca, tidak pernah dijawab
                pass
            if not tutup.done():
                tutup.set_result(True)
            writer.close()
        server = await asyncio.start_server(terima, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        monkeypatch.setenv("AUTH0_DOMAIN", f"127.0.0.1:{port}")
        async with server:
            mulai = time.monotonic()
            hasil = await ss._auth0_post("/oauth/token", {"grant_type": "refresh_token", "refresh_token": "RT-uji"})
            durasi = time.monotonic() - mulai
            ditutup = await asyncio.wait_for(tutup, 1)
        return hasil, durasi, ditutup
    hasil, durasi, ditutup = asyncio.run(jalan())
    assert hasil == (ss.STATUS_TIDAK_TERKIRIM, None) and durasi < 1.5 and ditutup


@pytest.mark.parametrize("galat,terkirim", [("ConnectError", False), ("ConnectTimeout", False), ("PoolTimeout", False),
                                             ("ReadTimeout", True), ("WriteError", True), ("ReadError", True),
                                             ("RemoteProtocolError", True)])
def test_auth0_post_membedakan_belum_terkirim_dan_tidak_diketahui(monkeypatch, galat, terkirim):
    import httpx
    import sesi_service as ss
    monkeypatch.setenv("AUTH0_DOMAIN", "sapa.test.auth0.com")

    def gagal(permintaan):
        raise getattr(httpx, galat)("uji", request=permintaan)
    monkeypatch.setattr(ss, "_klien_auth0", lambda: httpx.AsyncClient(transport=httpx.MockTransport(gagal)))
    assert asyncio.run(ss._auth0_post("/oauth/token", {})) == ((0 if terkirim else ss.STATUS_TIDAK_TERKIRIM), None)


@pytest.mark.parametrize("galat,dilepas", [("ConnectError", True), ("ConnectTimeout", True), ("ReadTimeout", False),
                                            ("RemoteProtocolError", False)])
def test_sewa_refresh_dilepas_hanya_bila_koneksi_auth0_tidak_terbentuk(bff, monkeypatch, galat, dilepas):
    import httpx
    import sesi_service
    asli = sesi_service._auth0_post
    b = bff()
    cookie = nilai_cookie(masuk(b, ingat=True))
    b.jam.maju(hours=3)  # access token habis
    monkeypatch.setattr(b.ss, "_auth0_post", asli)
    dipanggil = []

    def gagal(permintaan):
        dipanggil.append(permintaan.url.path)
        raise getattr(httpx, galat)("uji", request=permintaan)
    monkeypatch.setattr(b.ss, "_klien_auth0", lambda: httpx.AsyncClient(transport=httpx.MockTransport(gagal)))

    async def tunggu_palsu(detik):
        pass
    monkeypatch.setattr(b.ss, "_tunggu", tunggu_palsu)
    for _ in range(2):
        with pytest.raises(b.ss.SesiBelumSiap):
            asyncio.run(b.ss.ambil_sesi_segar(cookie, ip=IP_ASLI))
    [baris] = b.store.sesi.values()
    if dilepas:
        # Refresh token pasti belum terkirim: sewa dilepas, permintaan berikutnya boleh langsung mencoba lagi.
        assert baris.get("segar_sampai") is None and dipanggil == ["/oauth/token"] * 2
    else:
        # Setelah koneksi terbentuk hasilnya tidak diketahui, sewa dibiarkan sampai kedaluwarsa.
        assert baris["segar_sampai"] == b.jam.waktu + b.ss.UMUR_KUNCI_SEGAR and dipanggil == ["/oauth/token"]


def test_masuk_saat_auth0_tidak_tersambung_belum_siap_dan_slot_kembali(bff, monkeypatch):
    import httpx
    import sesi_service
    asli = sesi_service._auth0_post
    b = bff()
    monkeypatch.setattr(b.ss, "_auth0_post", asli)

    def gagal(permintaan):
        raise httpx.ConnectError("uji", request=permintaan)
    monkeypatch.setattr(b.ss, "_klien_auth0", lambda: httpx.AsyncClient(transport=httpx.MockTransport(gagal)))
    res = masuk(b)
    assert res.status_code == 503 and res.json()["kode"] == "belum_siap"
    jendela = int(b.jam.waktu.timestamp() // 900)
    assert b.store.batas[(b.ss.jejak(f"900:gagal:username:{USERNAME}|ip:{IP_ASLI}"), jendela)] == 0


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


def test_akhir_menunggu_penyegar_tidak_menambah_waktu_di_atas_tenggat_dinding(bff, monkeypatch):
    """Di akhir satu_koneksi() koneksi kembali ke daftar siaga tanpa menunggu server; koneksi siaga baru ditutup
    saat loop berakhir, juga dalam TENGGAT_TUTUP_DB."""
    b = bff()
    sekarang = b.jam.waktu
    baris = {"id_hash": "id-uji", "sub": "auth0|uji", "ingat": True, "dibuat_pada": sekarang,
             "terakhir_dipakai": sekarang, "kedaluwarsa": sekarang + timedelta(days=1), "token_enc": "v2.lama",
             "token_exp": sekarang, "segar_sampai": sekarang + b.ss.UMUR_KUNCI_SEGAR}
    tercatat = _postgres_koneksi_macet(b, monkeypatch, baris)
    monkeypatch.setattr(b.ss, "MAKS_TUNGGU_SEGAR", 0.3)
    sesi = b.ss.Sesi(id_hash="id-uji", sub="auth0|uji", ingat=True, dibuat_pada=sekarang, terakhir_dipakai=sekarang,
                     kedaluwarsa=sekarang + timedelta(days=1), token_exp=sekarang, access_token="at",
                     token_enc="v2.lama")
    monkeypatch.setattr(b.ss, "TENGGAT_TUTUP_DB", 0.1)

    async def jalan():
        mulai = time.monotonic()
        assert await b.ss._tunggu_penyegar(sesi) is None
        assert time.monotonic() - mulai < 0.3 + 0.15
        assert tercatat == {"dibuka": 1, "close": 0, "terminate": 0}
    asyncio.run(jalan())
    assert tercatat == {"dibuka": 1, "close": 1, "terminate": 1}  # close() macet dihentikan sesudah 0,1 detik


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


def test_executor_dns_dipasang_di_jalur_auth0_dan_koneksi_db(monkeypatch):
    import httpx
    import sesi_service as ss
    dipasang = []
    monkeypatch.setattr(ss, "pasang_executor_dns", lambda: dipasang.append("dns"))
    monkeypatch.setenv("AUTH0_DOMAIN", "sapa.test.auth0.com")
    monkeypatch.setattr(ss, "_klien_auth0", lambda: httpx.AsyncClient(
        transport=httpx.MockTransport(lambda permintaan: httpx.Response(200, json={}))))
    assert asyncio.run(ss._auth0_post("/oauth/token", {})) == (200, {})
    assert dipasang == ["dns"]

    import asyncpg

    async def sambung(alamat, **kw):
        return object()
    monkeypatch.setattr(asyncpg, "connect", sambung)
    asyncio.run(ss.PostgresSesiStore("postgresql://uji@db.invalid/sapa")._sambung())
    assert dipasang == ["dns", "dns"]


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


def test_log_loop_sementara_hanya_di_preview(bff, monkeypatch, caplog):
    b = bff()
    caplog.set_level(logging.INFO)
    monkeypatch.delenv("VERCEL_ENV", raising=False)
    masuk(b)
    assert not [r for r in caplog.records if "uji-staging loop=" in r.getMessage()]
    monkeypatch.setenv("VERCEL_ENV", "preview")
    b.jam.maju(seconds=4)
    masuk(b)
    pesan = [r.getMessage() for r in caplog.records if "uji-staging loop=" in r.getMessage()]
    assert len(pesan) == 1 and "pid=" in pesan[0]
