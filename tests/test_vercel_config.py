import json
import re
from pathlib import Path

CONFIG = json.loads((Path(__file__).resolve().parents[1] / "vercel.json").read_text(encoding="utf-8"))
SECURITY_HEADERS = {"X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Content-Security-Policy"}


def vercel_regex(source):
    # Pola Vercel memakai sintaks path-to-regexp; untuk pola di berkas ini cukup dianggap regex berjangkar.
    return re.compile("^" + source + "$")


def header_blocks():
    return [(block["source"], {h["key"]: h["value"] for h in block["headers"]}) for block in CONFIG["headers"]]


def test_missing_asset_is_not_answered_with_the_app_page():
    fallback = CONFIG["rewrites"][-1]
    assert fallback["destination"] == "/frontend/index.html"
    pattern = vercel_regex(fallback["source"])
    # Vercel menerapkan rewrite berantai: /assets/x menjadi /frontend/assets/x, lalu dicocokkan lagi.
    for missing in ("/assets/tidak-ada-abc123.js", "/frontend/assets/tidak-ada-abc123.js"):
        assert not pattern.match(missing), missing
    for route in ("/", "/kepatuhanfkrtl", "/monitoring-laras", "/user"):
        assert pattern.match(route), route


def test_hashed_assets_are_cached_for_a_year_and_keep_security_headers():
    blocks = header_blocks()
    sources = [source for source, _ in blocks]
    assert "/(.*)" in sources and "/assets/(.*)" in sources
    assert sources.index("/assets/(.*)") > sources.index("/(.*)"), "blok aset harus setelah blok keamanan"
    assets = dict(blocks)["/assets/(.*)"]
    assert assets == {"Cache-Control": "public, max-age=31536000, immutable"}
    assert SECURITY_HEADERS <= set(dict(blocks)["/(.*)"])


def test_app_page_is_not_cached_long():
    for source, headers in header_blocks():
        if source != "/assets/(.*)":
            assert "Cache-Control" not in headers, source


def csp(key):
    for block in CONFIG["headers"]:
        for header in block["headers"]:
            if header["key"] == key:
                return {part.split()[0]: part.split()[1:] for part in header["value"].strip().rstrip(";").split(";") if part.strip()}
    return None


def inline_script_hash():
    import base64
    import hashlib

    html = (Path(__file__).resolve().parents[1] / "frontend" / "index.html").read_text(encoding="utf-8")
    body = re.search(r"<script>(.*?)</script>", html, re.S).group(1)
    return "'sha256-" + base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode() + "'"


def test_enforced_policy_drops_local_addresses_and_adds_basic_guards():
    policy = csp("Content-Security-Policy")
    assert not any("127.0.0.1" in v or "localhost" in v for values in policy.values() for v in values)
    assert policy["object-src"] == ["'none'"]
    assert policy["base-uri"] == ["'self'"]
    assert policy["frame-ancestors"] == ["'self'"]


def test_strict_policy_is_enforced():
    policy = csp("Content-Security-Policy")
    assert "'unsafe-inline'" not in policy["script-src"] and "'unsafe-eval'" not in policy["script-src"]
    assert inline_script_hash() in policy["script-src"]
    assert "https:" not in policy["connect-src"] and "https:" not in policy.get("img-src", [])
    assert policy["form-action"] == ["'self'"]


def test_jpeg_export_can_embed_google_fonts():
    policy = csp("Content-Security-Policy")
    assert {"https://fonts.googleapis.com", "https://fonts.gstatic.com"} <= set(policy["connect-src"])


def test_report_only_policy_is_removed_once_enforced():
    assert csp("Content-Security-Policy-Report-Only") is None


def test_every_public_file_is_served_as_itself():
    public = Path(__file__).resolve().parents[1] / "frontend" / "public"
    for name in sorted(p.name for p in public.iterdir() if p.is_file()):
        first = next(r for r in CONFIG["rewrites"] if vercel_regex(r["source"]).match("/" + name))
        assert first["destination"] == "/frontend/" + name, name
