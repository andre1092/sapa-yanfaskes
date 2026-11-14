"""Username akun petugas RS: [kode_ppk]-[nama_faskes]-[2 digit nomor urut per faskes] (keputusan CEO).

Username dibuat server. Pengiriman ke Auth0 baru aktif setelah koneksi database diberi atribut
username (AUTH0_PAKAI_USERNAME=1), supaya pembuatan akun tidak gagal sebelum itu.
"""
import pytest

from test_pengguna_fkrtl import REF, api, call  # noqa: F401  (fixture api dipakai ulang)

from api import pengguna_service as ps

ADMIN = ["super_admin"]


@pytest.mark.parametrize("nama, slug", [
    ("RSD dr Soebandi", "rsd-dr-soebandi"),
    ("RS. Bina Sehat (Jember)", "rs-bina-sehat-jember"),
    ("  RSU   Kaliwates  ", "rsu-kaliwates"),
    ("Rumah Sakit Umum Daerah dr. H. Koesnadi Bondowoso Jawa Timur", "rumah-sakit-umum-daerah-dr-h-koesnadi"),
    ("!!!", "faskes"),
])
def test_nama_faskes_jadi_slug_huruf_kecil_maksimal_40(nama, slug):
    hasil = ps.slug_faskes(nama)
    assert hasil == slug and len(hasil) <= 40


def test_nomor_urut_terkecil_yang_belum_dipakai():
    assert ps.buat_username("0114R001", "RSD dr Soebandi", set()) == "0114r001-rsd-dr-soebandi-01"
    dipakai = {"0114r001-rsd-dr-soebandi-01", "0114r001-rsd-dr-soebandi-03"}
    assert ps.buat_username("0114R001", "RSD dr Soebandi", dipakai) == "0114r001-rsd-dr-soebandi-02"


def test_nomor_habis_ditolak():
    dipakai = {f"0114r001-rsd-dr-soebandi-{n:02d}" for n in range(1, 100)}
    with pytest.raises(ValueError):
        ps.buat_username("0114R001", "RSD dr Soebandi", dipakai)


@pytest.mark.parametrize("username, sah", [
    ("0114r001-rsd-dr-soebandi-01", True),
    ("andreasdwi", True),
    ("ab", False),
    ("a" * 65, False),
    ("Huruf-Besar", False),
    ("pakai@email.com", False),
    ("spasi di tengah", False),
    ("admin", False), ("root", False), ("support", False), ("sapa", False), ("bpjs", False),
])
def test_aturan_username(username, sah):
    assert (ps.cek_username(username) is None) is sah


def test_buat_akun_mengirim_username_bila_diaktifkan(api, monkeypatch):
    monkeypatch.setenv("AUTH0_PAKAI_USERNAME", "1")
    res = call(api, "post", "/api/v1/pengguna-fkrtl", ADMIN, body={"nama": "Budi", "email": "budi@rs.test", "kode_ppk": "0114R001"})
    assert res.status_code == 201
    kiriman = next(j for m, p, j in api.fake.calls if m == "POST" and p == "/api/v2/users")
    assert kiriman["username"] == "0114r001-rsd-dr-soebandi-01"
    assert res.json()["pengguna"]["username"] == "0114r001-rsd-dr-soebandi-01"


def test_nomor_urut_mengikuti_akun_yang_sudah_ada_di_faskes_itu(api, monkeypatch):
    monkeypatch.setenv("AUTH0_PAKAI_USERNAME", "1")
    api.fake.users["auth0|petugas"]["username"] = "0114r001-rsd-dr-soebandi-01"
    res = call(api, "post", "/api/v1/pengguna-fkrtl", ADMIN, body={"nama": "Ani", "email": "ani@rs.test", "kode_ppk": "0114R001"})
    assert res.json()["pengguna"]["username"] == "0114r001-rsd-dr-soebandi-02"


def test_sebelum_diaktifkan_akun_dibuat_tanpa_username(api, monkeypatch):
    monkeypatch.delenv("AUTH0_PAKAI_USERNAME", raising=False)
    res = call(api, "post", "/api/v1/pengguna-fkrtl", ADMIN, body={"nama": "Budi", "email": "budi@rs.test", "kode_ppk": "0114R001"})
    assert res.status_code == 201
    kiriman = next(j for m, p, j in api.fake.calls if m == "POST" and p == "/api/v2/users")
    assert "username" not in kiriman


def test_daftar_menampilkan_username(api):
    api.fake.users["auth0|petugas"]["username"] = "0114r001-rsd-dr-soebandi-01"
    data = call(api, "get", "/api/v1/pengguna-fkrtl", ADMIN).json()
    assert data["pengguna"][0]["username"] == "0114r001-rsd-dr-soebandi-01"
    assert data["pakai_username"] in (True, False)


def test_isi_username_akun_lama(api, monkeypatch):
    monkeypatch.setenv("AUTH0_PAKAI_USERNAME", "1")
    res = call(api, "post", "/api/v1/pengguna-fkrtl/auth0|petugas/username", ADMIN)
    assert res.status_code == 200
    assert res.json()["pengguna"]["username"] == "0114r001-rsd-dr-soebandi-01"
    patch = next(j for m, p, j in api.fake.calls if m == "PATCH" and p.endswith("auth0%7Cpetugas"))
    assert patch == {"username": "0114r001-rsd-dr-soebandi-01", "connection": "Username-Password-Authentication"}


def test_isi_username_tidak_menimpa_yang_sudah_ada(api, monkeypatch):
    monkeypatch.setenv("AUTH0_PAKAI_USERNAME", "1")
    api.fake.users["auth0|petugas"]["username"] = "0114r001-rsd-dr-soebandi-01"
    assert call(api, "post", "/api/v1/pengguna-fkrtl/auth0|petugas/username", ADMIN).status_code == 409


def test_isi_username_sebelum_diaktifkan_ditolak(api, monkeypatch):
    monkeypatch.delenv("AUTH0_PAKAI_USERNAME", raising=False)
    assert call(api, "post", "/api/v1/pengguna-fkrtl/auth0|petugas/username", ADMIN).status_code == 409


@pytest.mark.parametrize("roles", [None, ["admin"], ["Petugas RS"]])
def test_isi_username_hanya_super_admin(api, monkeypatch, roles):
    monkeypatch.setenv("AUTH0_PAKAI_USERNAME", "1")
    assert call(api, "post", "/api/v1/pengguna-fkrtl/auth0|petugas/username", roles).status_code in (401, 403)


def test_isi_username_bukan_untuk_akun_non_petugas(api, monkeypatch):
    monkeypatch.setenv("AUTH0_PAKAI_USERNAME", "1")
    assert call(api, "post", "/api/v1/pengguna-fkrtl/auth0|ceo/username", ADMIN).status_code == 404
