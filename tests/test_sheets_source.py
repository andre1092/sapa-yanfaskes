import csv
import importlib
import io
import sys
from pathlib import Path
from urllib.parse import unquote

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

import kepatuhan_service  # noqa: E402
import laras_service  # noqa: E402
import sheets_source  # noqa: E402

SHEET_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd"
TABS = [
    {"properties": {"sheetId": 861718582, "title": "DB LAP's", "index": 1}},
    {"properties": {"sheetId": 0, "title": "Utama", "index": 0}},
]
VALUES = {
    "'Utama'": [["kode", "nama", "catatan"], ["0114R001", "RS A, B", 'kata "kutip"'], ["0114R002"]],
    "'DB LAP''s'": [["kode_faskes", "nilai"], ["0114R001", "93,5"]],
}


class FakeResponse:
    def __init__(self, status, payload=None):
        self.status_code = status
        self._payload = payload or {}

    def json(self):
        return self._payload


class FakeSession:
    """Meniru sesi bertoken; mencatat alamat yang diminta dan tidak memakai jaringan."""

    def __init__(self, status=200):
        self.status = status
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append(url)
        if self.status != 200:
            return FakeResponse(self.status)
        if "/values/" in url:
            return FakeResponse(200, {"values": VALUES[unquote(url.rsplit("/values/", 1)[1])]})
        return FakeResponse(200, {"sheets": TABS})


@pytest.fixture
def session(monkeypatch):
    fake = FakeSession()
    sheets_source._titles.clear()
    monkeypatch.setattr(sheets_source, "_get_session", lambda: fake)
    return fake


def rows(content):
    return list(csv.reader(io.StringIO(content.decode("utf-8"))))


def test_without_credentials_nothing_is_read(monkeypatch):
    for name in ("GCP_SA_CREDENTIALS_BASE64", "GCP_SA_CREDENTIALS_JSON"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(sheets_source, "_credentials", None)
    assert sheets_source._get_session() is None
    assert sheets_source.read_sheet_csv(SHEET_ID) is None


def test_first_tab_is_read_when_gid_is_absent(session):
    content = sheets_source.read_sheet_csv(SHEET_ID)
    assert rows(content) == [["kode", "nama", "catatan"], ["0114R001", "RS A, B", 'kata "kutip"'], ["0114R002", "", ""]]
    assert all(url.startswith("https://sheets.googleapis.com/v4/spreadsheets/" + SHEET_ID) for url in session.calls)


@pytest.mark.parametrize("gid", [861718582, "861718582"])
def test_tab_is_chosen_by_gid(session, gid):
    assert rows(sheets_source.read_sheet_csv(SHEET_ID, gid)) == [["kode_faskes", "nilai"], ["0114R001", "93,5"]]


def test_tab_list_is_fetched_once_per_spreadsheet(session):
    sheets_source.read_sheet_csv(SHEET_ID)
    sheets_source.read_sheet_csv(SHEET_ID, 861718582)
    assert sum("/values/" not in url for url in session.calls) == 1


@pytest.mark.parametrize("gid", [12345, "bukan-angka"])
def test_unknown_tab_returns_nothing(session, gid):
    assert sheets_source.read_sheet_csv(SHEET_ID, gid) is None


@pytest.mark.parametrize("spreadsheet_id", ["", "../../feeds", "pendek", SHEET_ID + "/edit", None])
def test_malformed_spreadsheet_id_is_never_requested(session, spreadsheet_id):
    assert sheets_source.read_sheet_csv(spreadsheet_id) is None
    assert session.calls == []


def test_refused_access_returns_nothing(monkeypatch):
    sheets_source._titles.clear()
    monkeypatch.setattr(sheets_source, "_get_session", lambda: FakeSession(status=403))
    assert sheets_source.read_sheet_csv(SHEET_ID) is None


def forbid_legacy_fetch(monkeypatch, module):
    def fail(*args, **kwargs):
        raise AssertionError("jalur lama tidak boleh dipakai saat akun layanan berhasil")

    if hasattr(module, "urllib"):
        monkeypatch.setattr(module.urllib.request, "urlopen", fail)
    if hasattr(module, "requests"):
        monkeypatch.setattr(module.requests, "get", fail)


def test_kepatuhan_reads_through_service_account(session, monkeypatch):
    kepatuhan_service._SERVICE_CACHE.clear()
    forbid_legacy_fetch(monkeypatch, kepatuhan_service)
    records = kepatuhan_service.fetch_sheet_csv(SHEET_ID, "UJI")
    assert records[0] == {"kode": "0114R001", "nama": "RS A, B", "catatan": 'kata "kutip"'}


def test_laras_reads_through_service_account(session, monkeypatch):
    forbid_legacy_fetch(monkeypatch, laras_service)
    assert laras_service._read_csv(SHEET_ID, 861718582, {"kode_faskes"}) == [{"kode_faskes": "0114R001", "nilai": "93,5"}]


def test_api_fetchers_read_through_service_account(session, monkeypatch):
    sys.modules.pop("index", None)
    api = importlib.import_module("index")
    api._SHEETS_CACHE.clear()
    forbid_legacy_fetch(monkeypatch, api)
    assert api.fetch_csv_records(SHEET_ID, "UJI", "861718582") == [{"kode_faskes": "0114R001", "nilai": "93,5"}]
    name, frame = api.fetch_single_sheet_csv(SHEET_ID, "UJI_DF", "0", force_refresh=True)
    assert (name, frame.columns, frame.height) == ("UJI_DF", ["kode", "nama", "catatan"], 2)

    seen = []

    def fake_read(spreadsheet_id, gid=None, label=""):
        seen.append(spreadsheet_id)
        if spreadsheet_id == api.FKTP_ANTROL_SPREADSHEET_ID:
            return b"kode_fktp,sumber_antrean_cf,sumber_antrean_total_transaksi,total_transaksi\r\n0114U001,1,2,3\r\n"
        return b"kode_fktp,kabupaten,jenis_fktp\r\n0114U001,KAB. JEMBER,PUSKESMAS\r\n"

    monkeypatch.setattr(api, "read_sheet_csv", fake_read)
    merged = api.fetch_fktp_antrol_dfs(force_refresh=True)
    assert (merged.height, merged["jenis_fktp"][0]) == (1, "PUSKESMAS")
    assert seen == [api.FKTP_ANTROL_SPREADSHEET_ID, api.FKTP_REF_SPREADSHEET_ID]


def test_legacy_path_still_serves_when_service_account_is_unavailable(monkeypatch):
    monkeypatch.setattr(sheets_source, "_get_session", lambda: None)
    kepatuhan_service._SERVICE_CACHE.clear()

    class Legacy(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(kepatuhan_service.urllib.request, "urlopen", lambda *a, **k: Legacy(b"kode,nama\r\n0114R009,RS LAMA\r\n"))
    assert kepatuhan_service.fetch_sheet_csv(SHEET_ID, "UJI_LAMA") == [{"kode": "0114R009", "nama": "RS LAMA"}]
