"""Riwayat aktivitas (audit log) di Postgres Neon, hanya bisa ditambah.

Yang dicatat: akses ditolak (401/403) dan tindakan admin (sinkronisasi, muat ulang,
ekspor, email verifikasi, membuka log). Tidak mencatat email, token, atau isi data.
Kegagalan menulis log tidak pernah menggagalkan permintaan pengguna.
"""
import logging
import os
import re
from typing import Optional

logger = logging.getLogger("sapa-api")

DSN_ENV = "AUDIT_DB_DATABASE_URL"
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    status INTEGER NOT NULL,
    ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC);
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log hanya bisa ditambah';
END
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
"""

_ACTION_PATHS = re.compile(r"^/api/v1/(fkrtl-antrol-sync|fktp-antrol-sync|fkrtl-kepatuhan-sync|fkrtl-export|auth/send-verification-email|audit-log)$")
_schema_ready = False


def should_record(method: str, path: str, status: int, query: str) -> bool:
    if not path.startswith("/api/"):
        return False
    if status in (401, 403):
        return True
    if _ACTION_PATHS.match(path):
        return True
    return "refresh=true" in query.lower() or "refresh=1" in query.lower()


def mask_ip(forwarded: Optional[str], fallback: Optional[str]) -> str:
    raw = (forwarded or "").split(",")[0].strip() or (fallback or "")
    if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", raw):
        return ".".join(raw.split(".")[:3] + ["0"])
    if ":" in raw:
        return ":".join(raw.split(":")[:3]) + "::"
    return ""


def build_entry(method: str, path: str, status: int, claims: Optional[dict], role: str, forwarded: Optional[str], client_ip: Optional[str]) -> dict:
    sub = claims.get("sub", "") if isinstance(claims, dict) else ""
    return {
        "actor": str(sub)[:200],
        "role": role,
        "action": f"{method} {path}"[:300],
        "target": path[:300],
        "status": int(status),
        "ip": mask_ip(forwarded, client_ip),
    }


async def _connect():
    import asyncpg

    dsn = os.environ.get(DSN_ENV)
    if not dsn:
        return None
    return await asyncpg.connect(dsn, timeout=5, statement_cache_size=0)


async def _ensure_schema(conn):
    global _schema_ready
    if not _schema_ready:
        await conn.execute(SCHEMA_SQL)
        _schema_ready = True


async def write_entry(entry: dict) -> None:
    conn = await _connect()
    if conn is None:
        logger.warning("Audit log belum dikonfigurasi (%s kosong)", DSN_ENV)
        return
    try:
        await _ensure_schema(conn)
        await conn.execute(
            "INSERT INTO audit_log (actor, role, action, target, status, ip) VALUES ($1, $2, $3, $4, $5, $6)",
            entry["actor"], entry["role"], entry["action"], entry["target"], entry["status"], entry["ip"],
        )
    finally:
        await conn.close()


async def read_entries(*, limit: int = 100, before_id: Optional[int] = None, actor: str = "", action: str = "") -> list:
    conn = await _connect()
    if conn is None:
        return []
    try:
        await _ensure_schema(conn)
        rows = await conn.fetch(
            "SELECT id, at, actor, role, action, target, status, ip FROM audit_log "
            "WHERE ($1::bigint IS NULL OR id < $1) AND ($2 = '' OR actor = $2) AND ($3 = '' OR action ILIKE '%' || $3 || '%') "
            "ORDER BY id DESC LIMIT $4",
            before_id, actor, action, limit,
        )
        return [{**dict(r), "at": r["at"].isoformat()} for r in rows]
    finally:
        await conn.close()


async def record(entry: dict) -> None:
    try:
        await write_entry(entry)
    except Exception as exc:  # jangan pernah menggagalkan permintaan pengguna
        logger.error("Gagal menulis audit log: %s", type(exc).__name__)
