"""Pemilihan DSN DB sesi: role terbatas lewat env sendiri, bukan env yang dikelola integrasi Neon–Vercel.

SAPA_SESI_DATABASE_URL dibuat dan bisa ditimpa ulang oleh integrasi (role bawaan pemilik database). Role aplikasi
yang terbatas memakai SAPA_SESI_DSN_APLIKASI. Saat SAPA_SKEMA_MANUAL=1, aplikasi menolak memakai DSN integrasi,
sehingga role bawaan tidak pernah dipakai diam-diam.
"""
import pytest

import test_api_auth  # noqa: F401  (menambahkan api/ ke sys.path)
import sesi_service as ss  # noqa: E402

DSN_INTEGRASI = "postgresql://pemilik:x@ep-uji-pooler.invalid/sesi"
DSN_APLIKASI = "postgresql://sapa_aplikasi:y@ep-uji-pooler.invalid/sesi"


@pytest.fixture
def env(monkeypatch):
    for nama in ("SAPA_SESI_DATABASE_URL", "SAPA_SESI_DSN_APLIKASI", "SAPA_SKEMA_MANUAL"):
        monkeypatch.delenv(nama, raising=False)
    monkeypatch.setattr(ss, "_store", None)
    monkeypatch.setattr(ss, "_store_pg", {})

    def atur(**nilai):
        for nama, isi in nilai.items():
            monkeypatch.setenv(nama, isi)
    return atur


def _dsn():
    s = ss.store()
    return None if s is None else s.dsn


def test_tanpa_skema_manual_memakai_dsn_integrasi(env):
    env(SAPA_SESI_DATABASE_URL=DSN_INTEGRASI)
    assert _dsn() == DSN_INTEGRASI


def test_dsn_aplikasi_didahulukan_dari_dsn_integrasi(env):
    env(SAPA_SESI_DATABASE_URL=DSN_INTEGRASI, SAPA_SESI_DSN_APLIKASI=DSN_APLIKASI)
    assert _dsn() == DSN_APLIKASI


def test_skema_manual_dengan_dsn_aplikasi(env):
    env(SAPA_SESI_DATABASE_URL=DSN_INTEGRASI, SAPA_SESI_DSN_APLIKASI=DSN_APLIKASI, SAPA_SKEMA_MANUAL="1")
    assert _dsn() == DSN_APLIKASI


def test_skema_manual_menolak_dsn_integrasi_role_bawaan(env):
    env(SAPA_SESI_DATABASE_URL=DSN_INTEGRASI, SAPA_SKEMA_MANUAL="1")
    assert _dsn() is None
    with pytest.raises(ss.SesiBelumSiap):
        ss._store_wajib()


def test_tanpa_dsn_sama_sekali(env):
    assert _dsn() is None
