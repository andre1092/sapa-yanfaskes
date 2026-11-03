"""Privacy and security scan for SAPA YANFASKES, the work of the security office agent.

Reads the repository and the production site, writes one JSON report. It never
changes code, never authenticates and never sends repository content anywhere:
the only network calls are to the production site and to the public OSV API
(package names and versions only). Evidence is masked before it is written.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TARGET = "https://sapa-yanfaskes.vercel.app"
REPORT_DIR = Path(__file__).resolve().parent / "reports"
SEVERITIES = ("critical", "high", "medium", "low", "info")
SKIP_PARTS = ("node_modules", "/dist/", "package-lock.json", "bun.lock", ".agents/skills/", "graphify-out/", "design-reference/")
TEXT_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".toml", ".env", ".html", ".css", ".sql", ".txt", ".sh"}

SECRET_PATTERNS = [
    ("critical", "Private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----")),
    ("critical", "AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("critical", "GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("high", "Google API key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")),
    ("high", "Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("high", "Stripe live key", re.compile(r"\bsk_live_[A-Za-z0-9]{20,}\b")),
    ("medium", "Hardcoded credential", re.compile(r"""(?i)\b(?:password|passwd|secret|api[_-]?key|client[_-]?secret|access[_-]?token)\b\s*[:=]\s*['"]([^'"\s]{12,})['"]""")),
]
# Isi yang mirip kredensial tetapi jelas contoh atau placeholder.
PLACEHOLDER = re.compile(r"(?i)(•{4}|example|placeholder|changeme|your[_-]|xxxx|dummy|test|fake|sample|official-browser-token|\$\{|process\.env|os\.environ)")

CODE_PATTERNS = [
    ("high", "cors", "CORS menerima semua origin bersama credentials", re.compile(r"allow_origins\s*=\s*\[\s*['\"]\*['\"]\s*\][\s\S]{0,120}allow_credentials\s*=\s*True"),
     "Batasi allow_origins ke domain SAPA dan matikan allow_credentials bila tidak perlu."),
    ("critical", "auth", "Token tidak valid atau kosong tetap diterima sebagai pengguna", re.compile(r"def require_auth\([\s\S]{0,900}?return default_user"),
     "Kembalikan 401 saat token tidak ada atau tidak valid; jangan beri peran default."),
    ("high", "auth", "Pesan galat token membocorkan audience/issuer yang diharapkan", re.compile(r"Invalid (?:audience|issuer)\. Expected"),
     "Kembalikan pesan 401/403 generik; catat detailnya hanya di log server."),
    ("high", "tls", "Verifikasi TLS dimatikan", re.compile(r"verify\s*=\s*False"), "Hapus verify=False."),
    ("high", "injection", "SQL dibangun dengan f-string", re.compile(r"""execute\(\s*f['"]"""), "Gunakan parameter terikat SQLAlchemy."),
    ("high", "injection", "eval/exec pada data dinamis", re.compile(r"(?<![\w.])(?:eval|exec)\((?!\s*['\"])"), "Hindari eval/exec."),
    ("medium", "xss", "dangerouslySetInnerHTML", re.compile(r"dangerouslySetInnerHTML"), "Pastikan HTML disanitasi atau render sebagai teks."),
    ("medium", "session", "Token disimpan di localStorage", re.compile(r"localStorage\.setItem\([^)]*(?:token|jwt|access)", re.I),
     "Simpan token di memori atau cookie HttpOnly."),
    ("low", "privacy", "Log memuat alamat email penerima", re.compile(r"logger\.\w+\(f['\"][^'\"]*\{(?:recipient|email|user_email)\}"),
     "Samarkan email di log (mis. a***@domain)."),
]

REQUIRED_HEADERS = {
    "strict-transport-security": "high",
    "content-security-policy": "high",
    "x-content-type-options": "medium",
    "x-frame-options": "medium",
    "referrer-policy": "low",
    "permissions-policy": "low",
}
# NIK: 16 digit, dua digit awal kode provinsi 11-94, tanggal lahir (01-71) di digit 7-8.
NIK = re.compile(r"(?<!\d)(?:1[1-9]|[2-8]\d|9[1-4])\d{4}(?:[0-6]\d|7[01])(?:0[1-9]|1[0-2])\d{2}\d{4}(?!\d)")
EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE = re.compile(r"(?<!\d)(?:\+62|62|0)8[1-9]\d{7,10}(?!\d)")
ALLOWED_EMAIL = re.compile(r"(?i)@(example\.com|anthropic\.com|users\.noreply\.github\.com)$|no-?reply")


def mask(value: str) -> str:
    value = value.strip()
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}…{value[-2:]} ({len(value)} karakter)"


class Report:
    def __init__(self, target: str):
        self.target = target
        self.findings: list[dict] = []
        self.checks: list[dict] = []

    def add(self, severity, category, title, location, evidence, recommendation, check):
        key = hashlib.sha1(f"{check}|{title}|{location}".encode()).hexdigest()[:12]
        if any(f["id"] == key for f in self.findings):
            return
        self.findings.append({"id": key, "severity": severity, "category": category, "check": check, "title": title,
                              "location": location, "evidence": evidence, "recommendation": recommendation})

    def run(self, check_id, name, fn):
        start = time.monotonic()
        before = len(self.findings)
        try:
            fn(self)
            status, note = "ok", ""
        except Exception as exc:  # satu pemeriksaan gagal tidak menghentikan yang lain
            status, note = "error", f"{type(exc).__name__}: {exc}"[:300]
        self.checks.append({"id": check_id, "name": name, "status": status, "note": note,
                            "findings": len(self.findings) - before, "seconds": round(time.monotonic() - start, 2)})

    def to_json(self):
        order = {s: i for i, s in enumerate(SEVERITIES)}
        self.findings.sort(key=lambda f: (order[f["severity"]], f["category"], f["location"]))
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        return {
            "schema": 1,
            "agent": "Penjaga Privasi & Keamanan",
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "commit": commit,
            "target": self.target,
            "summary": {s: sum(1 for f in self.findings if f["severity"] == s) for s in SEVERITIES},
            "checks": self.checks,
            "findings": self.findings,
        }


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-co", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    for rel in out.splitlines():
        path = ROOT / rel
        if any(part in f"/{rel}" for part in SKIP_PARTS) or path.suffix.lower() not in TEXT_SUFFIXES or not path.is_file():
            continue
        if path.stat().st_size > 2_000_000:
            continue
        yield rel, path.read_text(encoding="utf-8", errors="ignore")


def line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def check_secrets(report: Report):
    for rel, text in tracked_files():
        for severity, label, pattern in SECRET_PATTERNS:
            for match in pattern.finditer(text):
                value = match.group(match.lastindex or 0)
                line = text[text.rfind("\n", 0, match.start()) + 1:text.find("\n", match.end())]
                if PLACEHOLDER.search(line) or "/tests/" in f"/{rel}" or rel.startswith("tests/"):
                    continue
                # Kode frontend ikut terkirim ke browser, jadi kredensial di sana terbaca siapa pun.
                if rel.startswith("frontend/src/") and severity == "medium":
                    severity = "high"
                report.add(severity, "secrets", f"{label} tersimpan di repositori", f"{rel}:{line_of(text, match.start())}",
                           mask(value), "Cabut/rotasi kredensial ini, pindahkan ke environment variable Vercel, hapus dari riwayat git.", "secrets")


def check_code(report: Report):
    for rel, text in tracked_files():
        if not rel.startswith(("api/", "frontend/src/")) or "/tests/" in rel or rel.endswith(".test.mjs"):
            continue
        for severity, category, title, pattern, fix in CODE_PATTERNS:
            for match in pattern.finditer(text):
                report.add(severity, category, title, f"{rel}:{line_of(text, match.start())}",
                           text[match.start():match.start() + 90].split("\n")[0].strip(), fix, "code")
    # Endpoint tanpa dependensi auth sama sekali, kecuali health check.
    text = (ROOT / "api/index.py").read_text(encoding="utf-8")
    for match in re.finditer(r'@app\.(get|post|put|patch|delete)\("([^"]+)"\)\s*\n((?:@app\.\w+\("[^"]+"\)\s*\n)*)(?:async )?def \w+\(([\s\S]*?)\)\s*(?:->[^:\n]+)?:\s*\n', text):
        method, route, _, params = match.groups()
        # Endpoint dengan token layanan sendiri (mis. SCIM) membandingkannya di badan fungsi.
        if "compare_digest" in text[match.end():match.end() + 600]:
            continue
        if "Depends(require_auth)" in params or "require_auth" in params or route in ("/", "/api", "/api/index.py", "/api/v1/health", "/health"):
            continue
        report.add("high" if method != "get" else "medium", "auth", f"Endpoint {method.upper()} {route} tanpa pemeriksaan login",
                   f"api/index.py:{line_of(text, match.start())}", f"{method.upper()} {route}",
                   "Tambahkan Depends(require_auth) atau token khusus layanan (mis. SCIM bearer).", "code")


def run_json(cmd, cwd):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=180)
    return json.loads(proc.stdout or "{}")


def check_npm(report: Report):
    for folder in ("frontend", "api"):
        if not (ROOT / folder / "package-lock.json").exists():
            continue
        data = run_json(["npm", "audit", "--json", "--omit=dev"], ROOT / folder)
        for name, vuln in (data.get("vulnerabilities") or {}).items():
            severity = {"moderate": "medium"}.get(vuln.get("severity"), vuln.get("severity", "low"))
            via = [v.get("title") for v in vuln.get("via", []) if isinstance(v, dict) and v.get("title")]
            fix = vuln.get("fixAvailable")
            report.add(severity if severity in SEVERITIES else "low", "dependencies", f"Paket npm {name} rentan",
                       f"{folder}/package-lock.json", "; ".join(via[:3]) or f"via {', '.join(map(str, vuln.get('via', [])[:3]))}",
                       "Jalankan npm audit fix" + (f" (perbaikan: {fix.get('name')}@{fix.get('version')})" if isinstance(fix, dict) else "") + " lalu uji build.",
                       "npm")


def check_python(report: Report):
    pip = ROOT / ".venv/bin/pip"
    if not pip.exists():
        raise RuntimeError(".venv tidak ditemukan; dependensi Python tidak diperiksa")
    wanted = set()
    for req in ("api/requirements.txt", "requirements.txt"):
        path = ROOT / req
        if path.exists():
            wanted |= {re.split(r"[<>=\[ ;]", line.strip())[0].lower().replace("_", "-") for line in path.read_text().splitlines() if line.strip() and not line.startswith("#")}
    installed = json.loads(subprocess.run([str(pip), "list", "--format", "json"], capture_output=True, text=True, check=True).stdout)
    packages = [p for p in installed if p["name"].lower().replace("_", "-") in wanted]
    body = json.dumps({"queries": [{"package": {"name": p["name"], "ecosystem": "PyPI"}, "version": p["version"]} for p in packages]}).encode()
    request = urllib.request.Request("https://api.osv.dev/v1/querybatch", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        results = json.load(response)["results"]
    for package, result in zip(packages, results):
        ids = [v["id"] for v in result.get("vulns", [])]
        if ids:
            report.add("high" if len(ids) > 2 else "medium", "dependencies", f"Paket Python {package['name']} {package['version']} rentan",
                       "requirements.txt (.venv)", ", ".join(ids[:6]), "Naikkan versi minimum di requirements.txt ke rilis yang sudah diperbaiki.", "python")


def fetch(url: str, method="GET", headers=None):
    request = urllib.request.Request(url, method=method, headers={"User-Agent": "sapa-security-agent/1", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}, response.read(200_000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as err:
        return err.code, {k.lower(): v for k, v in err.headers.items()}, err.read(200_000).decode("utf-8", "ignore")


def check_headers(report: Report):
    status, headers, _ = fetch(report.target)
    if status >= 400:
        raise RuntimeError(f"Situs produksi menjawab HTTP {status}")
    for name, severity in REQUIRED_HEADERS.items():
        if name not in headers:
            report.add(severity, "headers", f"Header {name} tidak ada", report.target, "-", f"Tambahkan {name} di vercel.json.", "headers")
    csp = headers.get("content-security-policy", "")
    script_src = re.search(r"script-src([^;]*)", csp)
    if script_src and "'unsafe-eval'" in script_src.group(1):
        report.add("medium", "headers", "CSP mengizinkan 'unsafe-eval' pada script-src", report.target, script_src.group(0).strip()[:120],
                   "Hapus 'unsafe-eval' bila tidak ada pustaka yang membutuhkannya.", "headers")
    if script_src and "'unsafe-inline'" in script_src.group(1):
        report.add("medium", "headers", "CSP mengizinkan 'unsafe-inline' pada script-src", report.target, script_src.group(0).strip()[:120],
                   "Ganti skrip inline dengan berkas atau nonce/hash.", "headers")
    if "http://127.0.0.1" in csp or "http://localhost" in csp:
        report.add("low", "headers", "CSP produksi masih mengizinkan alamat localhost", report.target, "connect-src … http://127.0.0.1:8000",
                   "Pisahkan CSP pengembangan dari produksi.", "headers")
    if headers.get("access-control-allow-origin") == "*":
        report.add("low", "headers", "Halaman utama mengirim Access-Control-Allow-Origin: *", report.target, "access-control-allow-origin: *",
                   "Hapus header CORS dari aset statis jika tidak dibutuhkan.", "headers")


def protected_routes():
    text = (ROOT / "api/index.py").read_text(encoding="utf-8")
    for match in re.finditer(r'@app\.get\("(/api/v1/[^"{]+)"\)\s*\n(?:@app\.\w+\("[^"]+"\)\s*\n)*(?:async )?def \w+\(([\s\S]*?)\)\s*(?:->[^:\n]+)?:\s*\n', text):
        if "require_auth" in match.group(2):
            yield match.group(1)


def check_auth_probe(report: Report):
    probes = 0
    for route in protected_routes():
        probes += 1
        status, _, body = fetch(report.target.rstrip("/") + route)
        if status < 300:
            report.add("critical", "auth", f"GET {route} menjawab {status} tanpa login", report.target + route,
                       f"HTTP {status}, {len(body)} byte", "Endpoint wajib menolak permintaan tanpa token (401).", "auth_probe")
            check_pii(report, body, report.target + route, "auth_probe", "Respons tanpa login memuat")
        time.sleep(0.2)
    if not probes:
        raise RuntimeError("Tidak ada route terlindungi yang ditemukan di api/index.py")


def check_pii(report: Report, text: str, location: str, check: str, prefix: str):
    for label, pattern, severity in (("NIK", NIK, "critical"), ("nomor HP", PHONE, "high"), ("email", EMAIL, "medium" if check != "privacy" else "low")):
        hits = [m.group(0) for m in pattern.finditer(text) if not (label == "email" and ALLOWED_EMAIL.search(m.group(0)))]
        if hits:
            report.add(severity, "privacy", f"{prefix} {label} ({len(hits)} kemunculan)", location, mask(hits[0]),
                       f"Hapus atau samarkan {label} sebelum data disajikan atau disimpan.", check)


def check_privacy_repo(report: Report):
    for rel, text in tracked_files():
        if rel.endswith((".md",)) or rel.startswith(("tests/", "api/tests/")):
            continue
        check_pii(report, text, rel, "privacy", "Berkas di repositori memuat")


def check_vercel_logs(path: Path):
    def run(report: Report):
        entries = json.loads(path.read_text(encoding="utf-8"))
        entries = entries.get("logs", entries) if isinstance(entries, dict) else entries
        text = "\n".join(json.dumps(e, ensure_ascii=False) for e in entries)
        errors = sum(1 for e in entries if str(e.get("level", e.get("statusCode", ""))).lower() in ("error", "500", "502", "503"))
        if errors:
            report.add("medium" if errors < 20 else "high", "runtime", f"{errors} galat runtime di log Vercel", str(path.name), f"{errors} entri error/5xx",
                       "Tinjau stack trace; pastikan galat tidak membocorkan detail internal.", "vercel_logs")
        unauthorized = len(re.findall(r'"(?:statusCode|status)":\s*40[13]', text))
        if unauthorized > 50:
            report.add("medium", "runtime", f"{unauthorized} respons 401/403 — kemungkinan percobaan akses", str(path.name), f"{unauthorized} entri",
                       "Periksa IP sumber dan pertimbangkan rate limit di Vercel Firewall.", "vercel_logs")
        if "Traceback" in text:
            report.add("medium", "runtime", "Log produksi memuat Python traceback", str(path.name), "Traceback (most recent call last)",
                       "Tangkap galat dan kembalikan pesan generik.", "vercel_logs")
        check_pii(report, text, str(path.name), "vercel_logs", "Log Vercel memuat")
    return run


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--target", default=DEFAULT_TARGET)
    parser.add_argument("--offline", action="store_true", help="lewati pemeriksaan yang butuh jaringan")
    parser.add_argument("--vercel-logs", type=Path, help="JSON log runtime yang diambil agen lewat Vercel MCP")
    parser.add_argument("--out", type=Path, default=REPORT_DIR / "latest.json")
    args = parser.parse_args(argv)

    report = Report(args.target)
    report.run("secrets", "Rahasia di repositori", check_secrets)
    report.run("code", "Pola kode rawan", check_code)
    report.run("privacy", "Data pribadi di repositori", check_privacy_repo)
    if not args.offline:
        report.run("npm", "Dependensi npm", check_npm)
        report.run("python", "Dependensi Python (OSV)", check_python)
        report.run("headers", "Header keamanan produksi", check_headers)
        report.run("auth_probe", "Akses API tanpa login", check_auth_probe)
    if args.vercel_logs:
        report.run("vercel_logs", "Log runtime Vercel", check_vercel_logs(args.vercel_logs))

    data = report.to_json()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    stamp = data["generated_at"].replace(":", "").replace("-", "")[:15]
    (args.out.parent / f"scan-{stamp}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"out": str(args.out), "summary": data["summary"],
                      "checks": {c["id"]: c["status"] for c in data["checks"]}}, ensure_ascii=False))
    return 1 if data["summary"]["critical"] else 0


if __name__ == "__main__":
    sys.exit(main())
