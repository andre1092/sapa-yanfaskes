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

    def __call__(self, url, data=None, timeout=None):
        self.kiriman.append((url, dict(data or {})))
        if self.gagal:
            raise self.ts.requests.ConnectionError("tidak terjangkau")
        jawaban = self.jawaban

        class Jawaban:
            status_code = 200

            def json(_):
                return jawaban
        return Jawaban()


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
        monkeypatch.setattr(ts, "_kirim", cf)
        tidur = []

        async def tidur_palsu(detik):
            tidur.append(detik)
        monkeypatch.setattr(ab, "_tidur", tidur_palsu)
        client = TestClient(api.app, base_url="https://testserver", raise_server_exceptions=False)
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


def browser_lain(b):
    return TestClient(b.api.app, base_url="https://testserver", raise_server_exceptions=False)


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
    # Field sisipan (realm/audience/client_id) kini ditolak seluruhnya (AUTH-5), dan Auth0 tidak dipanggil.
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
                        headers={"X-SAPA": "1", "Origin": ASAL, "x-real-ip": "203.0.113.9", "X-Forwarded-For": IP_PALSU})
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


@pytest.mark.parametrize("jawaban", [(429, {"error": "too_many_requests"}), (429, None)])
def test_auth0_rate_limit_global_menjadi_terlalu_banyak(bff, jawaban):
    b = bff()
    b.auth0.jawaban_token = jawaban
    res = masuk(b)
    assert res.status_code == 429 and res.json() == {"detail": b.ab.PESAN_TERLALU_BANYAK, "kode": "terlalu_banyak"}
    assert res.headers["retry-after"] == "60"


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
                                  {"hostname": "penyerang.example"}, {"action": "sapa_login"},
                                  {"action": "lupa_sandi"}])
def test_turnstile_ditolak_tidak_memanggil_auth0(bff, ubah):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, **ubah}
    res = masuk(b)
    # Turnstile tidak bergantung akun, jadi boleh punya kode sendiri (bukan oracle).
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


def test_cek_turnstile_menolak_localhost_di_produksi(bff, monkeypatch):
    b = bff(APP_ORIGINS="https://sapa-yanfaskes.vercel.app,http://localhost:3000")
    b.cf.jawaban = {**b.cf.jawaban, "hostname": "localhost"}
    b.ts.cek_turnstile("jawaban", None, b.ts.AKSI_MASUK)
    monkeypatch.setenv("VERCEL_ENV", "production")
    with pytest.raises(b.ts.TurnstileGagal) as err:
        b.ts.cek_turnstile("jawaban", None, b.ts.AKSI_MASUK)
    assert err.value.status == 403


def test_cek_turnstile_kunci_idempotensi_opsional(bff):
    b = bff()
    b.ts.cek_turnstile("jawaban", "198.51.100.7", b.ts.AKSI_MASUK)
    assert "idempotency_key" not in b.cf.kiriman[-1][1]
    b.ts.cek_turnstile("jawaban", None, b.ts.AKSI_MASUK, idempotency_key="kunci-1")
    assert b.cf.kiriman[-1][1]["idempotency_key"] == "kunci-1" and "remoteip" not in b.cf.kiriman[-1][1]


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
    assert res.headers["retry-after"] == "40"  # jam sudah maju 20 detik dalam jendela 1 menit
    # Batas 20/menit dihitung setelah siteverify, jadi Auth0 tidak dipanggil untuk percobaan ke-21.
    assert len(b.cf.kiriman) == 21 and len(b.auth0.panggilan(path="/oauth/token")) == 20
    b.jam.maju(minutes=1, seconds=1)
    assert masuk(b, username="user-lain").status_code == 200


def test_turnstile_sembarang_dari_ip_sama_tidak_mengunci_pengguna_lain_di_nat(bff):
    """BF-6: tanpa menyelesaikan Turnstile, penyerang di NAT yang sama tidak bisa mengunci login IP itu."""
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    for _ in range(25):
        assert masuk(b, username="penyerang").status_code == 403
    b.cf.jawaban = {**b.cf.jawaban, "success": True}
    assert masuk(b).status_code == 200


def test_pembatas_kasar_per_ip_menahan_banjir_sebelum_turnstile(bff):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    for _ in range(60):
        assert masuk(b, username="penyerang").status_code == 403
    res = masuk(b, username="penyerang")
    assert res.status_code == 429 and res.json()["kode"] == "terlalu_banyak" and res.headers["retry-after"] == "60"
    assert len(b.cf.kiriman) == 60  # percobaan ke-61 tidak sampai ke Cloudflare


def test_tidak_ada_blokir_per_username_lintas_ip(bff):
    """Clara: penyerang tidak boleh bisa mengunci akun korban dari banyak IP."""
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
    # Jendela geser: sisa 860 detik jendela ini, lalu 90 detik sampai porsi jendela lalu menyusut ke 9.
    assert int(res.headers["retry-after"]) == (15 * 60 - 40) + 90
    assert len(b.auth0.panggilan(path="/oauth/token")) == 10
    # IP lain dan username lain dari IP yang sama tidak ikut tertahan.
    assert masuk(b, header={"x-vercel-forwarded-for": "203.0.113.5"}).status_code == 401
    assert masuk(b, username="petugas.lain").status_code == 401
    b.jam.maju(seconds=int(res.headers["retry-after"]) - 1)
    assert masuk(b).status_code == 429
    b.jam.maju(seconds=1)
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
    assert res.headers["retry-after"] == "1"
    assert len(b.auth0.panggilan(path="/oauth/token")) == maks


def test_banjir_login_tidak_menunda_penyegaran_sesi(bff):
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
    assert masuk(b, header={"Origin": "https://penyerang.example"}).status_code == 403
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


def test_sesi_db_bermasalah_tetap_200(bff, monkeypatch):
    b = bff()
    masuk(b)

    async def rusak(*a, **k):
        raise OSError("db mati")
    monkeypatch.setattr(b.store, "ambil", rusak)
    res = b.client.get("/api/v1/auth/sesi")
    assert res.status_code == 200 and res.json()["masuk"] is False


# --- keluar ------------------------------------------------------------------------------------

def test_keluar_menghapus_sesi_cookie_dan_mencabut_refresh_token(bff):
    b = bff()
    masuk(b)
    assert len(b.store.sesi) == 1
    res = b.client.post("/api/v1/auth/keluar", headers={"X-SAPA": "1"})
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
    res = b.client.post("/api/v1/auth/keluar", headers={"X-SAPA": "1"})
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
                          headers={"X-SAPA": "1", "Origin": "https://penyerang.example"})
    assert asing.status_code == 403
    lintas = b.client.post("/api/v1/auth/send-verification-email", json=body,
                           headers={"X-SAPA": "1", "Sec-Fetch-Site": "cross-site"})
    assert lintas.status_code == 403
    dengan = b.client.post("/api/v1/auth/send-verification-email", json=body, headers={"X-SAPA": "1"})
    assert dengan.status_code not in (401, 403)


def test_bearer_tetap_diterima_selama_transisi(bff):
    b = bff()
    bearer = {"Authorization": f"Bearer {token(b.api, **{b.api.ROLES_CLAIM: ['viewer']})}"}
    assert b.client.get("/api/v1/akun/status", headers=bearer).status_code == 200
    b2 = bff(SAPA_TERIMA_BEARER="0")
    assert b2.client.get("/api/v1/akun/status", headers=bearer).status_code == 401


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
    # BF-1/BF-2: penyegaran juga membawa IP klien tepercaya, bukan X-Forwarded-For mentah.
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
    b.client.post("/api/v1/auth/keluar", headers={"X-SAPA": "1"})
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

def test_postgres_store_menyimpan_hash_dan_menutup_setiap_koneksi(bff, monkeypatch):
    b = bff()
    dsn = "postgresql://uji@db.invalid/sapa"
    kueri, dibuka, ditutup = [], [], []

    class Koneksi:
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
    assert args[6].startswith("v1.")
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


# --- temuan peninjau -----------------------------------------------------------------------------

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
    assert res.status_code == 200 and res.json() == {"masuk": False}
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
    assert len(panggilan) == 2
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


def test_token_turnstile_dicatat_sebelum_siteverify_dan_berumur_10_menit(bff):
    b = bff()
    b.cf.jawaban = {**b.cf.jawaban, "success": False}
    assert masuk(b, turnstile_token="token-x").status_code == 403
    b.cf.jawaban = {**b.cf.jawaban, "success": True}
    res = masuk(b, turnstile_token="token-x")
    assert res.json()["kode"] == "turnstile_kedaluwarsa" and len(b.cf.kiriman) == 1
    assert b.ab.UMUR_TURNSTILE == 600
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
    res = b.client.post("/api/v1/akun/ganti-sandi", json={"sandi_baru": "SandiBaruKuat2026"}, headers={"X-SAPA": "1"})
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


def test_penyegaran_tanpa_ip_klien_tidak_mengirim_header_ip(bff):
    b = bff()
    masuk(b)
    b.jam.maju(seconds=550)
    assert b.client.get("/api/v1/akun/status").status_code == 200  # di Vercel tanpa header IP tepercaya
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


# --- tambahan PR 1 (Clara, Kim, 2026-11-19) -----------------------------------------------------

def test_masuk_asal_tidak_sah_berkode_dan_tertahan_waktu_minimum(bff):
    b = bff()
    res = masuk(b, header={"Origin": "https://penyerang.example"})
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
        b.auth0.jawaban_token = (429, None)
    elif kode == "turnstile_gagal":
        b.cf.jawaban = {**b.cf.jawaban, "success": False}
    elif kode == "turnstile_kedaluwarsa":
        b.cf.jawaban = {"success": False, "error-codes": ["timeout-or-duplicate"]}
    elif kode == "mfa":
        b.auth0.jawaban_token = (403, {"error": "mfa_required"})
    elif kode == "belum_siap":
        b.auth0.jawaban_token = (500, {"error": "server_error"})
    elif kode == "asal_tidak_sah":
        return masuk(b, header={"Origin": "https://penyerang.example"})
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
    """BF-1: tanpa IP tepercaya di Vercel, jangan sampai semua login tampak dari satu IP (penguncian massal)."""
    b = bff()
    res = b.client.post("/api/v1/auth/masuk", json=kredensial(),
                        headers={"X-SAPA": "1", "Origin": ASAL, "X-Forwarded-For": IP_PALSU})
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
    masuk(b, header={"Origin": "https://penyerang.example"})
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


# --- temuan tinjauan kedua (2026-11-19) ----------------------------------------------------------

@pytest.mark.parametrize("header,boleh", [
    ({"Origin": None}, False),                                                   # tanpa Origin dan Sec-Fetch-Site
    ({"Origin": None, "Sec-Fetch-Site": "none"}, False),
    ({"Sec-Fetch-Site": "none"}, False),
    ({"Sec-Fetch-Site": "cross-site"}, False),
    ({"Sec-Fetch-Site": "same-site"}, False),
    ({"Origin": None, "Sec-Fetch-Site": "same-origin"}, True),
    ({"Sec-Fetch-Site": "same-origin"}, True),
    ({}, True),                                                                  # Origin sendiri, browser lama
    ({"Origin": "https://penyerang.example", "Sec-Fetch-Site": "same-origin"}, False),
    ({"X-SAPA": None}, False),
])
def test_masuk_wajib_bukti_asal_sendiri(bff, header, boleh):
    """R5/CSRF-2: Origin cocok atau Sec-Fetch-Site same-origin wajib ada; selain itu 403 asal_tidak_sah."""
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
    res = b.client.post("/api/v1/auth/masuk", json=kredensial(), headers={"X-SAPA": "1", "Origin": ASAL})
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

    class Koneksi:
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
    assert len(dibuka) == 2 and len(ditutup) == 2


def test_hitungan_geser_dan_coba_lagi(bff):
    H = bff().ss.HitunganGeser
    # 10 gagal di jendela lalu, percobaan pertama tepat di awal jendela baru: hampir 11.
    h = H(ini=1, lalu=10, lewat=0, jendela_detik=900, tiket=("k", 1))
    assert h.perkiraan == 11 and h.coba_lagi(10) == 90
    assert H(ini=1, lalu=10, lewat=90, jendela_detik=900, tiket=("k", 1)).perkiraan == 10
    assert H(ini=3, lalu=0, lewat=10, jendela_detik=60, tiket=("k", 1)).perkiraan == 3


def test_blokir_brute_force_auth0_sama_dengan_pembatas_sapa(bff):
    """Koreksi Clara 2026-11-19: too_many_attempts menjadi terlalu_banyak (L6), sama dengan pembatas SAPA."""
    b = bff()
    b.auth0.jawaban_token = (429, {"error": "too_many_attempts", "error_description": "Your account has been blocked"})
    res = masuk(b)
    assert res.status_code == 429
    assert res.json()["kode"] == "terlalu_banyak"
    assert "blocked" not in res.text


def test_aksi_turnstile_login_sesuai_spek_kim():
    from api import turnstile
    assert turnstile.AKSI_MASUK == "login"


# --- AUTH-5 (Clara): validasi isian ketat, semua pelanggaran 400 dengan satu pesan -----------------

@pytest.mark.parametrize("ubah", [
    {"lain": "x"},                                   # field tak dikenal
    {"ingat": None},                                 # ingat wajib boolean
    {"ingat": 1},
    {"username": "a" * 255},                         # identitas maks 254
    {"username": "petugas\u0007uji"},               # karakter kontrol
    {"password": "é" * 37},                          # 74 byte UTF-8 > 72: ditolak, tidak dipotong
    {"turnstile_token": "t" * 2049},
])
def test_auth5_isian_ditolak_400_satu_pesan(bff, ubah):
    b = bff()
    body = kredensial(**ubah)
    if ubah.get("ingat", False) is None:
        body.pop("ingat")
    res = b.client.post("/api/v1/auth/masuk", json=body, headers=HEADER)
    assert res.status_code == 400 and res.json() == ISIAN
    assert SANDI not in res.text and "petugas" not in res.text
    assert b.auth0.kiriman == [] and b.cf.kiriman == []


def test_auth5_batas_tepat_diterima(bff):
    b = bff()
    res = masuk(b, username="a" * 254, password="é" * 36)  # 72 byte tepat
    assert res.status_code != 400
