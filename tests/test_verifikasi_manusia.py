"""Verifikasi Cloudflare Turnstile setelah sandi (Auth0 post-login Action redirect).

Alurnya: Action mengalihkan ke /verifikasi?state=...&session_token=... (token HS256 dari
api.redirect.encodeToken). Halaman itu mengirim jawaban Turnstile ke API, API memeriksanya ke
Cloudflare, lalu menandatangani token balasan yang diperiksa Action lewat validateToken.
"""
import time

import jwt
import pytest
from fastapi.testclient import TestClient

from api import index, verifikasi_service as vs

RAHASIA = "rahasia-uji-yang-cukup-panjang-untuk-hs256"
STATE = "state-dari-auth0-abc123"


@pytest.fixture(autouse=True)
def lingkungan(monkeypatch):
    monkeypatch.setenv("SAPA_VERIFIKASI_SECRET", RAHASIA)
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "kunci-turnstile-uji")
    monkeypatch.setenv("AUTH0_DOMAIN", "sapa-yanfaskes.us.auth0.com")
    monkeypatch.setenv("APP_ORIGINS", "https://sapa-yanfaskes.vercel.app,https://staging.example.vercel.app")


def token_masuk(**ubah):
    klaim = {"sub": "auth0|petugas1", "exp": int(time.time()) + 120, "tujuan": "sapa-verifikasi"}
    klaim.update(ubah)
    return jwt.encode({k: v for k, v in klaim.items() if v is not None}, RAHASIA, algorithm="HS256")


class Cloudflare:
    def __init__(self, jawaban=None, gagal=False):
        self.jawaban = jawaban if jawaban is not None else {
            "success": True, "hostname": "sapa-yanfaskes.vercel.app", "action": vs.AKSI, "cdata": vs.ringkas_state(STATE)}
        self.gagal = gagal
        self.kiriman = []

    def __call__(self, url, data=None, timeout=None):
        self.kiriman.append((url, data))
        if self.gagal:
            raise vs.requests.ConnectionError("tidak terjangkau")

        class Jawaban:
            status_code = 200

            def json(_):
                return self.jawaban
        return Jawaban()


def test_turnstile_lulus_menghasilkan_token_yang_diterima_validatetoken():
    cf = Cloudflare()
    hasil = vs.verifikasi(STATE, token_masuk(), "jawaban-turnstile", "203.0.113.5", post=cf)

    assert hasil["continue_url"] == "https://sapa-yanfaskes.us.auth0.com/continue"
    assert hasil["state"] == STATE
    klaim = jwt.decode(hasil["sapa_token"], RAHASIA, algorithms=["HS256"])
    # Syarat validateToken Auth0: tanda tangan HS256, belum kedaluwarsa, klaim state sama.
    assert klaim["state"] == STATE and klaim["sub"] == "auth0|petugas1" and klaim["turnstile"] is True
    assert 0 < klaim["exp"] - time.time() <= 120 and klaim["jti"]
    url, data = cf.kiriman[0]
    assert url == vs.TURNSTILE_URL
    assert data["secret"] == "kunci-turnstile-uji" and data["response"] == "jawaban-turnstile" and data["remoteip"] == "203.0.113.5"


@pytest.mark.parametrize("ubah", [
    {"success": False},
    {"hostname": "situs-lain.example"},
    {"action": "aksi-lain"},
    {"cdata": "ringkasan-state-lain"},
])
def test_jawaban_cloudflare_yang_tidak_cocok_ditolak(ubah):
    jawaban = {"success": True, "hostname": "sapa-yanfaskes.vercel.app", "action": vs.AKSI, "cdata": vs.ringkas_state(STATE)}
    jawaban.update(ubah)
    with pytest.raises(vs.VerifikasiGagal) as err:
        vs.verifikasi(STATE, token_masuk(), "jawaban", None, post=Cloudflare(jawaban))
    assert err.value.status == 403


def test_hostname_staging_dari_app_origins_diterima():
    jawaban = {"success": True, "hostname": "staging.example.vercel.app", "action": vs.AKSI, "cdata": vs.ringkas_state(STATE)}
    assert vs.verifikasi(STATE, token_masuk(), "jawaban", None, post=Cloudflare(jawaban))["state"] == STATE


@pytest.mark.parametrize("token", [
    "bukan-jwt",
    "kedaluwarsa",
    "kunci-lain",
    "tanpa-sub",
    "tujuan-lain",
])
def test_session_token_dari_auth0_yang_tidak_sah_ditolak_tanpa_memanggil_cloudflare(token):
    tokens = {
        "bukan-jwt": "bukan-jwt",
        "kedaluwarsa": token_masuk(exp=int(time.time()) - 60),
        "kunci-lain": jwt.encode({"sub": "auth0|x", "exp": int(time.time()) + 60, "tujuan": "sapa-verifikasi"},
                                 "kunci-lain-yang-juga-cukup-panjang-abc", algorithm="HS256"),
        "tanpa-sub": token_masuk(sub=None),
        "tujuan-lain": token_masuk(tujuan="lain"),
    }
    cf = Cloudflare()
    with pytest.raises(vs.VerifikasiGagal) as err:
        vs.verifikasi(STATE, tokens[token], "jawaban", None, post=cf)
    assert err.value.status == 400
    assert cf.kiriman == []


@pytest.mark.parametrize("ubah", [{"state": "state-lain"}, {"iss": "https://penyerang.example/"}])
def test_klaim_state_atau_iss_yang_tidak_cocok_ditolak(ubah):
    with pytest.raises(vs.VerifikasiGagal) as err:
        vs.verifikasi(STATE, token_masuk(**ubah), "jawaban", None, post=Cloudflare())
    assert err.value.status == 400


@pytest.mark.parametrize("iss", ["sapa-yanfaskes.us.auth0.com", "https://sapa-yanfaskes.us.auth0.com/"])
def test_iss_domain_auth0_dan_state_yang_sama_diterima(iss):
    assert vs.verifikasi(STATE, token_masuk(iss=iss, state=STATE), "jawaban", None, post=Cloudflare())["state"] == STATE


def test_tidak_mengirim_kunci_idempotensi_palsu():
    cf = Cloudflare()
    vs.verifikasi(STATE, token_masuk(), "jawaban", None, post=cf)
    assert "idempotency_key" not in cf.kiriman[0][1] and "remoteip" not in cf.kiriman[0][1]


def test_cloudflare_tidak_terjangkau_gagal_tertutup():
    with pytest.raises(vs.VerifikasiGagal) as err:
        vs.verifikasi(STATE, token_masuk(), "jawaban", None, post=Cloudflare(gagal=True))
    assert err.value.status == 503


def test_belum_dikonfigurasi_gagal_tertutup(monkeypatch):
    monkeypatch.delenv("TURNSTILE_SECRET_KEY")
    with pytest.raises(vs.VerifikasiGagal) as err:
        vs.verifikasi(STATE, token_masuk(), "jawaban", None, post=Cloudflare())
    assert err.value.status == 503


@pytest.mark.parametrize("state, jawaban", [("", "x"), ("a" * 3000, "x"), (STATE, ""), (STATE, "x" * 3000)])
def test_masukan_kosong_atau_terlalu_panjang_ditolak(state, jawaban):
    with pytest.raises(vs.VerifikasiGagal) as err:
        vs.verifikasi(state, token_masuk(), jawaban, None, post=Cloudflare())
    assert err.value.status == 400


def test_endpoint_tanpa_login_dan_tidak_disimpan_cache(monkeypatch):
    monkeypatch.setattr(vs, "_kirim", Cloudflare())
    res = TestClient(index.app).post("/api/v1/verifikasi-manusia", json={
        "state": STATE, "session_token": token_masuk(), "turnstile_token": "jawaban"})
    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"
    assert res.json()["continue_url"] == "https://sapa-yanfaskes.us.auth0.com/continue"


def test_endpoint_galat_tidak_membocorkan_rincian(monkeypatch):
    monkeypatch.setattr(vs, "_kirim", Cloudflare({"success": False, "error-codes": ["invalid-input-response"]}))
    res = TestClient(index.app).post("/api/v1/verifikasi-manusia", json={
        "state": STATE, "session_token": token_masuk(), "turnstile_token": "jawaban"})
    assert res.status_code == 403
    assert "invalid-input-response" not in res.text and "jawaban" not in res.text
