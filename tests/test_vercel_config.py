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
    assert not pattern.match("/assets/tidak-ada-abc123.js")
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
