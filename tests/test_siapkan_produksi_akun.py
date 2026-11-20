"""Bagian murni skrip scripts/siapkan-produksi-akun.py (tanpa jaringan, tanpa wrangler)."""
import ast
import base64
import importlib.util
from pathlib import Path

import pytest

BERKAS = Path(__file__).resolve().parent.parent / "scripts" / "siapkan-produksi-akun.py"
_spec = importlib.util.spec_from_file_location("siapkan_produksi_akun", BERKAS)
sp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sp)

WRANGLER_CONTOH = (Path(__file__).resolve().parent.parent / "workers" / "sapa-akun" / "wrangler.toml").read_text()
ID_UJI = "12345678-9abc-4def-8123-456789abcdef"


def test_konfigurasi_sementara_hanya_mengganti_database_id():
    baru = sp.konfigurasi_sementara(WRANGLER_CONTOH, ID_UJI)
    assert f'database_id = "{ID_UJI}"' in baru
    lama = [b for b in WRANGLER_CONTOH.splitlines() if not b.startswith("database_id")]
    assert [b for b in baru.splitlines() if not b.startswith("database_id")] == lama


@pytest.mark.parametrize("nilai", ["", "bukan-uuid", ID_UJI + '"\nname = "lain'])
def test_konfigurasi_sementara_menolak_id_tidak_sah(nilai):
    with pytest.raises(sp.Gagal):
        sp.konfigurasi_sementara(WRANGLER_CONTOH, nilai)


def test_konfigurasi_sementara_menolak_bila_baris_tidak_tepat_satu():
    with pytest.raises(sp.Gagal):
        sp.konfigurasi_sementara('name = "sapa-akun"\n', ID_UJI)


def test_cari_url_worker():
    keluaran = "Uploaded sapa-akun\nDeployed sapa-akun triggers\n  https://sapa-akun.tim-uji.workers.dev\nVersion ID: x"
    assert sp.cari_url_worker(keluaran) == "https://sapa-akun.tim-uji.workers.dev"
    with pytest.raises(sp.Gagal):
        sp.cari_url_worker("https://contoh.invalid")


def test_cari_id_d1():
    daftar = f'[{{"name": "lain", "uuid": "x"}}, {{"name": "sapa-akun", "uuid": "{ID_UJI}"}}]'
    assert sp.cari_id_d1(daftar) == ID_UJI
    assert sp.cari_id_d1("[]") is None
    with pytest.raises(sp.Gagal):
        sp.cari_id_d1("bukan json")


def test_jumlah_akun_dari_json():
    assert sp.jumlah_akun_dari_json('[{"results": [{"n": 0}], "success": true}]') == 0
    assert sp.jumlah_akun_dari_json('[{"results": [{"n": 1}]}]') == 1
    with pytest.raises(sp.Gagal):
        sp.jumlah_akun_dari_json('[{"results": []}]')


def test_isian_env_vercel_hanya_production():
    assert sp.isian_env_vercel("SAPA_AKUN_PEPPER", "nilai-uji", True) == {
        "key": "SAPA_AKUN_PEPPER", "value": "nilai-uji", "type": "sensitive", "target": ["production"]}
    assert sp.isian_env_vercel("SAPA_AKUN_WORKER_URL", "https://sapa-akun.tim-uji.workers.dev", False)["type"] == "plain"


def test_kunci_baru_32_byte_acak():
    a, b = sp.kunci_baru(), sp.kunci_baru()
    assert a != b and len(base64.b64decode(a)) == 32


def test_skrip_tidak_pernah_mencetak_kunci_atau_token():
    """Tidak ada print/f-string yang memuat variabel kunci, nilai, atau token."""
    pohon = ast.parse(BERKAS.read_text())
    terlarang = {"kunci", "nilai", "token_cf", "token_vc", "token", "isi"}
    for simpul in ast.walk(pohon):
        if isinstance(simpul, ast.Call) and getattr(simpul.func, "id", None) == "print":
            for argumen in simpul.args:
                nama = {n.id for n in ast.walk(argumen) if isinstance(n, ast.Name)}
                assert not nama & terlarang, f"print memuat {nama & terlarang} di baris {simpul.lineno}"


def test_konfigurasi_sementara_diabaikan_git():
    abaikan = (Path(__file__).resolve().parent.parent / "workers" / "sapa-akun" / ".gitignore").read_text()
    assert "wrangler.produksi.toml" in abaikan.split()


def test_kunci_tidak_disimpan_di_keychain_atau_berkas():
    sumber = BERKAS.read_text()
    assert '"security"' not in sumber and "add-generic-password" not in sumber
    assert "write_text(" in sumber  # hanya konfigurasi sementara berisi database_id
    pohon = ast.parse(sumber)
    for simpul in ast.walk(pohon):
        if isinstance(simpul, ast.Call) and getattr(simpul.func, "attr", None) == "write_text":
            nama = {n.id for a in simpul.args for n in ast.walk(a) if isinstance(n, ast.Name)}
            assert not nama & {"kunci", "token_cf", "token_vc"}
