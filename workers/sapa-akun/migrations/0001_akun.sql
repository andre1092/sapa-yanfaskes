-- Migrasi D1 Worker sapa-akun: tabel akun SAPA, penanda kode sekali pakai, dan nonce sekali pakai.
-- Dijalankan pemilik sendiri dengan wrangler (lihat README). Aman dijalankan ulang (IF NOT EXISTS).

-- Akun login lokal. username sudah dinormalkan (NFKC, huruf kecil) oleh server SAPA. mac = HMAC-SHA256 atas
-- id, username, hash, peran, versi_sandi, aktif dengan kunci yang hanya ada di server SAPA (bukan di Worker).
CREATE TABLE IF NOT EXISTS akun_sapa (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 254 AND username = lower(username)),
    hash TEXT NOT NULL CHECK (hash GLOB '$argon2id$*'),
    versi_sandi INTEGER NOT NULL CHECK (versi_sandi >= 1),
    peran TEXT NOT NULL CHECK (peran IN ('super_admin', 'admin', 'viewer', 'petugas_rs')),
    aktif INTEGER NOT NULL CHECK (aktif IN (0, 1)),
    mac TEXT NOT NULL CHECK (length(mac) = 64),
    dibuat_pada TEXT NOT NULL,
    diubah_pada TEXT NOT NULL
) STRICT;

-- Hash berkunci kode penyiapan/pemulihan yang sudah dipakai (nilai kode tidak pernah disimpan).
CREATE TABLE IF NOT EXISTS kode_terpakai (
    hash_kode TEXT PRIMARY KEY CHECK (length(hash_kode) = 64),
    jenis TEXT NOT NULL CHECK (jenis IN ('penyiapan', 'pemulihan')),
    dipakai_pada TEXT NOT NULL
) STRICT;

-- Nonce operasi tulis yang sudah dipakai (detik Unix kedaluwarsa); dibersihkan di setiap batch tulis.
CREATE TABLE IF NOT EXISTS nonce_terpakai (
    nonce TEXT PRIMARY KEY CHECK (length(nonce) = 32),
    kedaluwarsa INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS nonce_terpakai_kedaluwarsa_idx ON nonce_terpakai (kedaluwarsa);
