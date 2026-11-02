import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("scan", ROOT / "automation/security_agent/scan.py")
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)


def test_mask_never_returns_the_value():
    assert scan.mask("SuperSecret2026#") == "Supe…6# (16 karakter)"
    assert scan.mask("short") == "*****"


def test_nik_pattern_needs_province_and_birth_date():
    assert scan.NIK.search("NIK 3509014507890001 tercatat")
    assert not scan.NIK.search("3509019999890001")  # tanggal lahir 99 tidak valid
    assert not scan.NIK.search("0009014507890001")  # kode provinsi 00 tidak ada
    assert not scan.NIK.search("135090145078900012")  # bagian dari angka yang lebih panjang


def test_pii_skips_noreply_and_masks_evidence():
    report = scan.Report("https://example.test")
    scan.check_pii(report, "dari no-reply@bpjs.go.id ke andi@rs.co.id, HP 081234567890", "x", "auth_probe", "Respons memuat")
    titles = {f["title"]: f for f in report.findings}
    assert "Respons memuat email (1 kemunculan)" in titles
    assert titles["Respons memuat nomor HP (1 kemunculan)"]["evidence"] == "0812…90 (12 karakter)"
    assert all("andi@" not in f["evidence"] for f in report.findings)


def test_protected_routes_read_multiline_signatures():
    routes = set(scan.protected_routes())
    assert "/api/v1/monitoring-laras" in routes
    assert "/api/v1/health" not in routes


def test_findings_are_deduplicated_and_sorted():
    report = scan.Report("https://example.test")
    report.add("low", "headers", "A", "loc", "-", "fix", "headers")
    report.add("critical", "auth", "B", "loc", "-", "fix", "auth_probe")
    report.add("low", "headers", "A", "loc", "-", "fix", "headers")
    data = report.to_json()
    assert [f["title"] for f in data["findings"]] == ["B", "A"]
    assert data["summary"]["critical"] == 1 and data["summary"]["low"] == 1


def test_one_failing_check_does_not_stop_the_scan():
    report = scan.Report("https://example.test")
    report.run("boom", "Gagal", lambda r: 1 / 0)
    report.run("fine", "Lancar", lambda r: None)
    assert [c["status"] for c in report.checks] == ["error", "ok"]
