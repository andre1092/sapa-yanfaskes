-- Skema DB sesi Neon untuk login lokal (SAPA_LOGIN_BFF=1): sesi, pembatas, dan jangkar versi sandi.
--
-- Dijalankan pemilik sendiri di konsol SQL Neon sebagai owner database (bukan oleh aplikasi), lalu env Vercel
-- Production SAPA_SKEMA_MANUAL=1 membuat aplikasi tidak menjalankan DDL sama sekali. Aman dijalankan ulang
-- (IF NOT EXISTS). Tidak ada sandi di berkas ini. Role aplikasi dibuat lewat SQL (bukan tombol Add role, yang
-- memberi keanggotaan neon_superuser): CREATE ROLE sapa_aplikasi WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
-- NOREPLICATION NOBYPASSRLS; sandinya diatur ulang lewat halaman Roles di konsol Neon (lihat runbook).
-- Tabel akun sendiri ada di Cloudflare D1 (workers/sapa-akun/migrations/0001_akun.sql), bukan di sini.

CREATE TABLE IF NOT EXISTS sapa_sesi (
    id_hash TEXT PRIMARY KEY,
    sub TEXT NOT NULL,
    ingat BOOLEAN NOT NULL,
    dibuat_pada TIMESTAMPTZ NOT NULL,
    terakhir_dipakai TIMESTAMPTZ NOT NULL,
    kedaluwarsa TIMESTAMPTZ NOT NULL,
    token_enc TEXT NOT NULL,
    token_exp TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sapa_sesi_sub_idx ON sapa_sesi (sub);
CREATE INDEX IF NOT EXISTS sapa_sesi_kedaluwarsa_idx ON sapa_sesi (kedaluwarsa);

CREATE TABLE IF NOT EXISTS sapa_batas (
    kunci_hash TEXT NOT NULL,
    jendela BIGINT NOT NULL,
    jumlah INTEGER NOT NULL DEFAULT 0,
    kedaluwarsa TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (kunci_hash, jendela)
);
CREATE INDEX IF NOT EXISTS sapa_batas_kedaluwarsa_idx ON sapa_batas (kedaluwarsa);

-- Jangkar anti-rollback: versi_sandi terendah yang masih diterima untuk setiap akun. Hanya pernah naik.
CREATE TABLE IF NOT EXISTS akun_jangkar (
    akun_id TEXT PRIMARY KEY,
    versi_sandi_min INTEGER NOT NULL
);

-- Contoh hak role aplikasi (nama contoh: sapa_aplikasi; sesuaikan dengan role yang dipakai DSN
-- SAPA_SESI_DSN_APLIKASI, bukan SAPA_SESI_DATABASE_URL milik integrasi). Tanpa DDL, tanpa TRUNCATE, dan tanpa DELETE pada jangkar.
-- Sesi dan pembatas butuh DELETE (keluar, pencabutan sesi, pembersihan baris kedaluwarsa).
GRANT SELECT, INSERT, UPDATE, DELETE ON sapa_sesi TO sapa_aplikasi;
GRANT SELECT, INSERT, UPDATE, DELETE ON sapa_batas TO sapa_aplikasi;
GRANT SELECT, INSERT, UPDATE ON akun_jangkar TO sapa_aplikasi;
