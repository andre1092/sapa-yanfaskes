// Worker sapa-akun: satu-satunya pintu ke tabel akun SAPA di Cloudflare D1 (binding DB).
//
// Hanya operasi tetap di bawah ini yang tersedia (POST JSON, tanpa SQL bebas). Path atau metode lain, dan query
// string apa pun, dijawab 404 sebelum hal lain diperiksa.
//
//   /akun/ambil-username  baca  {username}                 -> {akun: baris | null}  (baris memuat hash)
//   /akun/ambil-id        baca  {id}                       -> {akun: baris | null}  (baris memuat hash)
//   /akun/jumlah          baca  {}                         -> {jumlah}
//   /kode/terpakai        baca  {hash_kode}                -> {terpakai}
//   /akun/sisip-pertama   tulis {akun, hash_kode}          -> {ok}  INSERT hanya bila tabel kosong, sekaligus
//                                                                    menandai kode penyiapan terpakai
//   /akun/ganti-hash      tulis {id, versi_lama, versi_baru, hash, mac, hash_kode, jenis}
//                                                          -> {ok}  UPDATE bersyarat versi_sandi lama; bila
//                                                                    hash_kode diisi, kode ditandai terpakai
//
// Autentikasi setiap permintaan, diperiksa PALING AWAL sebelum D1 disentuh (crypto.subtle.verify, waktu-konstan):
//   X-Sapa-Waktu  detik Unix (10 digit)
//   X-Sapa-Nonce  32 hex, wajib untuk operasi tulis; kosong atau tidak dikirim untuk operasi baca
//   X-Sapa-Tanda  hex(HMAC-SHA256(kunci, kanonik))
//   kanonik = ["sapa-akun-v1", METODE, PATH, WAKTU, NONCE, hex(SHA-256(body mentah))].join("\n")
//   kunci   = base64-decode(secret SAPA_AKUN_HMAC); nilai yang sama ada di env Vercel Production SAPA_AKUN_HMAC.
// Jendela waktu: tulis 60 detik, baca 15 detik. Nonce tulis disimpan sekali pakai di nonce_terpakai (umur 120
// detik) dalam db.batch yang sama dengan operasinya; nonce ganda membatalkan seluruh batch. Nonce yang sudah
// kedaluwarsa dihapus di batch yang sama. Vektor uji bersama: test/vektor-tanda.json.
//
// Jawaban galat seragam tanpa rincian: 401 untuk tanda tangan, waktu, atau nonce yang tidak sah; 400 isian tidak
// sah; 409 kode sudah terpakai; 503 secret belum dipasang. Log hanya metadata (path, status, durasi).
// Worker tidak memegang pepper, kunci MAC, maupun kunci kode: MAC baris dihitung dan diperiksa server SAPA.

const AWALAN = "sapa-akun-v1";
const JENDELA_TULIS = 60;
const JENDELA_BACA = 15;
const UMUR_NONCE = 120;
const MAKS_BODY = 8192;
const PERAN = new Set(["super_admin", "admin", "viewer", "petugas_rs"]);
const POLA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POLA_USERNAME = /^[a-z0-9][a-z0-9._%+@-]{2,253}$/;
const POLA_HASH = /^\$argon2id\$v=19\$m=\d{1,7},t=\d{1,3},p=\d{1,3}\$[A-Za-z0-9+/]{8,64}\$[A-Za-z0-9+/]{16,128}$/;
const POLA_HEX64 = /^[0-9a-f]{64}$/;
const KOLOM = "id, username, hash, versi_sandi, peran, aktif, mac";

const enkoder = new TextEncoder();

class Galat extends Error {
  constructor(status, kode) {
    super(kode);
    this.status = status;
    this.kode = kode;
  }
}

function jawab(status, isi) {
  return new Response(JSON.stringify(isi), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function dariHex(teks) {
  const hasil = new Uint8Array(teks.length / 2);
  for (let i = 0; i < hasil.length; i++) hasil[i] = parseInt(teks.slice(i * 2, i * 2 + 2), 16);
  return hasil;
}

function dariBase64(teks) {
  const biner = atob(teks);
  return Uint8Array.from(biner, (c) => c.charCodeAt(0));
}

export async function kanonik(metode, path, waktu, nonce, body) {
  const sidik = hex(await crypto.subtle.digest("SHA-256", body));
  return [AWALAN, metode, path, waktu, nonce, sidik].join("\n");
}

async function verifikasiTanda(env, metode, path, waktu, nonce, tanda, body) {
  let kunci;
  try {
    const mentah = dariBase64(String(env.SAPA_AKUN_HMAC || ""));
    if (mentah.length < 32) throw new Error("kunci");
    kunci = await crypto.subtle.importKey("raw", mentah, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  } catch {
    throw new Galat(503, "belum_siap");
  }
  const data = enkoder.encode(await kanonik(metode, path, waktu, nonce, body));
  if (!(await crypto.subtle.verify("HMAC", kunci, dariHex(tanda), data))) throw new Galat(401, "tidak_sah");
}

function teks(nilai, maks) {
  if (typeof nilai !== "string" || nilai.length < 1 || nilai.length > maks) throw new Galat(400, "isian_tidak_sah");
  return nilai;
}

function cocok(nilai, pola) {
  if (typeof nilai !== "string" || !pola.test(nilai)) throw new Galat(400, "isian_tidak_sah");
  return nilai;
}

function bulat(nilai, min) {
  if (!Number.isSafeInteger(nilai) || nilai < min) throw new Galat(400, "isian_tidak_sah");
  return nilai;
}

function bentuk(isi, kunciSah) {
  if (!isi || typeof isi !== "object" || Array.isArray(isi)) throw new Galat(400, "isian_tidak_sah");
  if (Object.keys(isi).some((k) => !kunciSah.includes(k))) throw new Galat(400, "isian_tidak_sah");
  return isi;
}

function barisAkun(akun) {
  bentuk(akun, ["id", "username", "hash", "versi_sandi", "peran", "aktif", "mac"]);
  if (!PERAN.has(akun.peran) || (akun.aktif !== 0 && akun.aktif !== 1)) throw new Galat(400, "isian_tidak_sah");
  return [cocok(akun.id, POLA_ID), cocok(akun.username, POLA_USERNAME), cocok(akun.hash, POLA_HASH),
    bulat(akun.versi_sandi, 1), akun.peran, akun.aktif, cocok(akun.mac, POLA_HEX64)];
}

function sekarangIso(detik) {
  return new Date(detik * 1000).toISOString();
}

// Pernyataan pembuka setiap batch tulis: buang nonce kedaluwarsa, lalu simpan nonce ini (PRIMARY KEY).
function pembukaTulis(db, nonce, detik) {
  return [
    db.prepare("DELETE FROM nonce_terpakai WHERE kedaluwarsa < ?").bind(detik),
    db.prepare("INSERT INTO nonce_terpakai (nonce, kedaluwarsa) VALUES (?, ?)").bind(nonce, detik + UMUR_NONCE),
  ];
}

async function batchTulis(db, pernyataan) {
  try {
    return await db.batch(pernyataan);
  } catch (galat) {
    const pesan = String(galat && galat.message);
    if (pesan.includes("nonce_terpakai")) throw new Galat(401, "tidak_sah");
    if (pesan.includes("kode_terpakai")) throw new Galat(409, "kode_terpakai");
    throw galat;
  }
}

function perubahan(hasil) {
  return Number(hasil && hasil.meta && hasil.meta.changes) || 0;
}

const OPERASI = {
  "/akun/ambil-username": {
    tulis: false,
    async jalankan(db, isi) {
      bentuk(isi, ["username"]);
      const akun = await db.prepare(`SELECT ${KOLOM} FROM akun_sapa WHERE username = ?`)
        .bind(teks(isi.username, 254)).first();
      return { akun: akun || null };
    },
  },
  "/akun/ambil-id": {
    tulis: false,
    async jalankan(db, isi) {
      bentuk(isi, ["id"]);
      const akun = await db.prepare(`SELECT ${KOLOM} FROM akun_sapa WHERE id = ?`).bind(teks(isi.id, 64)).first();
      return { akun: akun || null };
    },
  },
  "/akun/jumlah": {
    tulis: false,
    async jalankan(db, isi) {
      bentuk(isi, []);
      const baris = await db.prepare("SELECT COUNT(*) AS jumlah FROM akun_sapa").first();
      return { jumlah: Number(baris.jumlah) };
    },
  },
  "/kode/terpakai": {
    tulis: false,
    async jalankan(db, isi) {
      bentuk(isi, ["hash_kode"]);
      const baris = await db.prepare("SELECT 1 AS ada FROM kode_terpakai WHERE hash_kode = ?")
        .bind(cocok(isi.hash_kode, POLA_HEX64)).first();
      return { terpakai: Boolean(baris) };
    },
  },
  "/akun/sisip-pertama": {
    tulis: true,
    async jalankan(db, isi, nonce, detik) {
      bentuk(isi, ["akun", "hash_kode"]);
      const kolom = barisAkun(isi.akun);
      if (isi.akun.versi_sandi !== 1) throw new Galat(400, "isian_tidak_sah");
      const hashKode = cocok(isi.hash_kode, POLA_HEX64);
      const waktu = sekarangIso(detik);
      const hasil = await batchTulis(db, [
        ...pembukaTulis(db, nonce, detik),
        db.prepare("INSERT INTO kode_terpakai (hash_kode, jenis, dipakai_pada) SELECT ?, 'penyiapan', ? "
          + "WHERE NOT EXISTS (SELECT 1 FROM akun_sapa)").bind(hashKode, waktu),
        db.prepare("INSERT INTO akun_sapa (id, username, hash, versi_sandi, peran, aktif, mac, dibuat_pada, diubah_pada) "
          + "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM akun_sapa)").bind(...kolom, waktu, waktu),
      ]);
      return { ok: perubahan(hasil[hasil.length - 1]) === 1 };
    },
  },
  "/akun/ganti-hash": {
    tulis: true,
    async jalankan(db, isi, nonce, detik) {
      bentuk(isi, ["id", "versi_lama", "versi_baru", "hash", "mac", "hash_kode", "jenis"]);
      const id = cocok(isi.id, POLA_ID);
      const lama = bulat(isi.versi_lama, 1);
      if (isi.versi_baru !== lama + 1) throw new Galat(400, "isian_tidak_sah");
      const hash = cocok(isi.hash, POLA_HASH);
      const mac = cocok(isi.mac, POLA_HEX64);
      const waktu = sekarangIso(detik);
      const pernyataan = pembukaTulis(db, nonce, detik);
      if (isi.hash_kode !== null && isi.hash_kode !== undefined) {
        if (isi.jenis !== "pemulihan") throw new Galat(400, "isian_tidak_sah");
        // Kode ditandai terpakai hanya bila baris yang akan diganti memang ada pada versi itu.
        pernyataan.push(db.prepare("INSERT INTO kode_terpakai (hash_kode, jenis, dipakai_pada) SELECT ?, 'pemulihan', ? "
          + "WHERE EXISTS (SELECT 1 FROM akun_sapa WHERE id = ? AND versi_sandi = ?)")
          .bind(cocok(isi.hash_kode, POLA_HEX64), waktu, id, lama));
      } else if (isi.jenis !== null && isi.jenis !== undefined) {
        throw new Galat(400, "isian_tidak_sah");
      }
      pernyataan.push(db.prepare("UPDATE akun_sapa SET hash = ?, versi_sandi = ?, mac = ?, diubah_pada = ? "
        + "WHERE id = ? AND versi_sandi = ?").bind(hash, lama + 1, mac, waktu, id, lama));
      const hasil = await batchTulis(db, pernyataan);
      return { ok: perubahan(hasil[hasil.length - 1]) === 1 };
    },
  },
};

async function bacaBody(request) {
  const panjang = request.headers.get("content-length");
  if (panjang !== null && (!/^\d+$/.test(panjang) || Number(panjang) > MAKS_BODY)) throw new Galat(401, "tidak_sah");
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAKS_BODY) throw new Galat(401, "tidak_sah");
  return body;
}

export async function tangani(request, env, sekarang = () => Math.floor(Date.now() / 1000)) {
  const url = new URL(request.url);
  const operasi = Object.hasOwn(OPERASI, url.pathname) ? OPERASI[url.pathname] : null;
  if (request.method !== "POST" || !operasi || url.search) throw new Galat(404, "tidak_ada");
  const waktu = request.headers.get("x-sapa-waktu") || "";
  const nonce = request.headers.get("x-sapa-nonce") || "";
  const tanda = request.headers.get("x-sapa-tanda") || "";
  if (!/^\d{10}$/.test(waktu) || !POLA_HEX64.test(tanda)) throw new Galat(401, "tidak_sah");
  if (operasi.tulis ? !/^[0-9a-f]{32}$/.test(nonce) : nonce !== "") throw new Galat(401, "tidak_sah");
  const body = await bacaBody(request);
  // Tanda tangan diperiksa sebelum isi dibaca dan sebelum D1 disentuh.
  await verifikasiTanda(env, request.method, url.pathname, waktu, nonce, tanda, body);
  const detik = sekarang();
  if (Math.abs(detik - Number(waktu)) > (operasi.tulis ? JENDELA_TULIS : JENDELA_BACA)) throw new Galat(401, "tidak_sah");
  let isi;
  try {
    isi = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new Galat(400, "isian_tidak_sah");
  }
  return jawab(200, await operasi.jalankan(env.DB, isi, nonce, detik));
}

export default {
  async fetch(request, env) {
    const mulai = Date.now();
    const jalur = Object.hasOwn(OPERASI, new URL(request.url).pathname) ? new URL(request.url).pathname : "lain";
    let status = 500;
    try {
      const res = await tangani(request, env);
      status = res.status;
      return res;
    } catch (galat) {
      status = galat instanceof Galat ? galat.status : 500;
      return jawab(status, { galat: galat instanceof Galat ? galat.kode : "internal" });
    } finally {
      // Hanya metadata. Body, hash, username, kode, dan header tanda tangan tidak pernah dicatat.
      console.log(JSON.stringify({ path: jalur, status, durasi_ms: Date.now() - mulai }));
    }
  },
};
