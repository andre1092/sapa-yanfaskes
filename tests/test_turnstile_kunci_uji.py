"""Kunci uji Cloudflare sementara di staging: hanya diterima di preview dengan secret uji persis."""
import pytest

from api import turnstile

UJI = turnstile.SECRET_UJI_CLOUDFLARE
JAWABAN_UJI = {"success": True, "hostname": "example.com", "error-codes": []}


class _Res:
    status_code = 200

    def __init__(self, isi):
        self._isi = isi

    def json(self):
        return self._isi


def _post(isi):
    return lambda url, data=None, timeout=None: _Res(isi)


def _atur(monkeypatch, env, secret):
    if env is None:
        monkeypatch.delenv("VERCEL_ENV", raising=False)
    else:
        monkeypatch.setenv("VERCEL_ENV", env)
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", secret)
    monkeypatch.setenv("APP_ORIGINS", "https://sapa.contoh.test")


def test_preview_dengan_secret_uji_menerima_jawaban_uji(monkeypatch, caplog):
    _atur(monkeypatch, "preview", UJI)
    assert turnstile.cek_turnstile("tok", None, "login", cdata="x", post=_post(JAWABAN_UJI)) == JAWABAN_UJI
    assert "Kunci uji Turnstile aktif" in caplog.text


@pytest.mark.parametrize("env", ["production", "development", None])
def test_secret_uji_di_luar_preview_ditolak_503(monkeypatch, env):
    _atur(monkeypatch, env, UJI)
    with pytest.raises(turnstile.TurnstileGagal) as e:
        turnstile.cek_turnstile("tok", None, "login", post=_post(JAWABAN_UJI))
    assert e.value.status == 503


def test_preview_dengan_secret_lain_tetap_menolak_example_com(monkeypatch):
    _atur(monkeypatch, "preview", "secret-asli-bukan-uji")
    with pytest.raises(turnstile.TurnstileGagal) as e:
        turnstile.cek_turnstile("tok", None, "login", post=_post(JAWABAN_UJI))
    assert e.value.status == 403


def test_mode_uji_tetap_menolak_jawaban_gagal_atau_action_lain(monkeypatch):
    _atur(monkeypatch, "preview", UJI)
    for isi in ({"success": False, "hostname": "example.com"},
                {"success": True, "hostname": "example.com", "action": "lain"},
                {"success": True, "hostname": "jahat.example"}):
        with pytest.raises(turnstile.TurnstileGagal) as e:
            turnstile.cek_turnstile("tok", None, "login", post=_post(isi))
        assert e.value.status == 403
