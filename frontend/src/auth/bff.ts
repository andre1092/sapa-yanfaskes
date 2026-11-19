import { HEADER_SAPA, type IsiSesi, type ModeSesi } from './session';

// Panggilan HTTP login satu halaman (mode bff). Semua same-origin: cookie sesi HttpOnly dikirim browser,
// token tidak pernah dibaca atau disimpan di sini. Isian (username, sandi) hanya ada di body JSON.

export const ALAMAT_AUTH = {
  mode: '/api/v1/auth/mode',
  sesi: '/api/v1/auth/sesi',
  masuk: '/api/v1/auth/masuk',
  keluar: '/api/v1/auth/keluar',
} as const;

const PESAN_JARINGAN = 'Tidak dapat terhubung ke server SAPA. Periksa koneksi internet lalu coba lagi.';
const PESAN_BELUM_ADA = 'Layanan ini belum tersedia. Hubungi administrator SAPA.';
const PESAN_UMUM = 'Permintaan belum berhasil. Coba lagi beberapa saat lagi.';
const PESAN_SESI_GAGAL = 'Sesi belum dapat dibaca. Coba muat ulang halaman.';
// Cadangan bila server (atau proksi di depannya) tidak memberi teks: pesan umum terlalu samar untuk dua status ini.
const PESAN_STATUS: Partial<Record<number, string>> = {
  429: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
  503: 'Layanan SAPA sedang tidak tersedia. Coba beberapa saat lagi.',
};

/** Batas waktu pembacaan mode login; lewat batas berarti galat (dengan tombol "Coba lagi"), bukan pemuat tanpa akhir. */
export const BATAS_MODE_MS = 10_000;

type IsiJson = Record<string, unknown> | null;
export type Hasil = { ok: boolean; status: number; isi: IsiJson; kode?: string; pesan: string };

/** Kendali widget Turnstile yang cukup untuk alur kirim: token lama dibuang setelah dipakai. */
export type PenyetelUlang = { reset: () => void } | null | undefined;

async function bacaJson(res: Response): Promise<IsiJson> {
  try {
    const isi: unknown = await res.json();
    return isi && typeof isi === 'object' && !Array.isArray(isi) ? isi as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * Pesan untuk pengguna. Teks server dipakai bila jawabannya berbentuk kontrak SAPA ({kode, pesan} atau
 * {kode, detail}); jawaban lain (misalnya 404 bawaan) diganti pesan umum supaya tidak membingungkan.
 */
export function pesanDariServer(isi: IsiJson, status: number, cadangan = PESAN_UMUM): string {
  const teks = (nilai: unknown) => (typeof nilai === 'string' && nilai.trim() ? nilai.trim().slice(0, 300) : '');
  const pesan = teks(isi?.pesan) || (typeof isi?.kode === 'string' ? teks(isi?.detail) : '');
  if (pesan) return pesan;
  if (status === 0) return PESAN_JARINGAN;
  if (status === 404 || status === 405) return PESAN_BELUM_ADA;
  return PESAN_STATUS[status] ?? cadangan;
}

async function kirim(alamat: string, body?: Record<string, unknown>): Promise<Hasil> {
  let res: Response;
  try {
    res = await fetch(alamat, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...HEADER_SAPA },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, isi: null, pesan: PESAN_JARINGAN };
  }
  const isi = await bacaJson(res);
  const kode = typeof isi?.kode === 'string' ? isi.kode : undefined;
  return { ok: res.ok, status: res.status, isi, kode, pesan: res.ok ? (typeof isi?.pesan === 'string' ? isi.pesan : '') : pesanDariServer(isi, res.status) };
}

/** Sinyal yang batal setelah `ms`; AbortSignal.timeout bila ada, selain itu AbortController dengan setTimeout. */
function sinyalBatas(ms: number): { sinyal: AbortSignal; lepas: () => void } {
  if (typeof AbortSignal.timeout === 'function') return { sinyal: AbortSignal.timeout(ms), lepas: () => {} };
  const pengendali = new AbortController();
  const jam = setTimeout(() => pengendali.abort(), ms);
  return { sinyal: pengendali.signal, lepas: () => clearTimeout(jam) };
}

/**
 * GET /api/v1/auth/mode. Gagal (jaringan, bukan 200, bentuk salah, lewat batas waktu) dilempar: pemanggil
 * tidak menebak mode. Batas berlaku untuk seluruh pembacaan termasuk badan jawaban, juga bila fetch
 * tidak menghiraukan sinyal pembatalan.
 */
export async function bacaMode(batasMs = BATAS_MODE_MS): Promise<ModeSesi> {
  const { sinyal, lepas } = sinyalBatas(batasMs);
  const lewatBatas = new Promise<never>((_, gagal) => {
    sinyal.addEventListener('abort', () => gagal(new Error('mode')), { once: true });
  });
  const baca = async (): Promise<ModeSesi> => {
    const res = await fetch(ALAMAT_AUTH.mode, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: sinyal });
    if (!res.ok) throw new Error('mode');
    const isi = await bacaJson(res);
    if (typeof isi?.bff !== 'boolean') throw new Error('mode');
    return isi.bff ? 'bff' : 'auth0';
  };
  try {
    return await Promise.race([baca(), lewatBatas]);
  } finally {
    lepas();
  }
}

export type HasilSesi = { status: 'masuk'; isi: IsiSesi } | { status: 'keluar'; kode?: string } | { status: 'galat'; pesan: string };

/** GET /api/v1/auth/sesi. 503 dan galat jaringan bukan berarti keluar: cookie dibiarkan. */
export async function bacaSesi(): Promise<HasilSesi> {
  let res: Response;
  try {
    res = await fetch(ALAMAT_AUTH.sesi, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch {
    return { status: 'galat', pesan: PESAN_JARINGAN };
  }
  const isi = await bacaJson(res);
  if (!res.ok) return { status: 'galat', pesan: pesanDariServer(isi, res.status, PESAN_SESI_GAGAL) };
  if (isi?.masuk === true) return { status: 'masuk', isi };
  return { status: 'keluar', kode: typeof isi?.kode === 'string' ? isi.kode : undefined };
}

export type IsianMasuk = { username: string; password: string; ingat: boolean; token: string };

/** POST /api/v1/auth/masuk. Setiap kegagalan menyetel ulang widget, karena token Turnstile sekali pakai. */
export async function ajukanMasuk(isian: IsianMasuk, widget?: PenyetelUlang): Promise<Hasil> {
  const hasil = await kirim(ALAMAT_AUTH.masuk, {
    // ingat selalu boolean: nilai lain (misalnya "on" dari kotak centang) tidak memperpanjang sesi.
    username: isian.username, password: isian.password, ingat: isian.ingat === true, turnstile_token: isian.token,
  });
  if (hasil.ok && hasil.isi?.masuk === true) return hasil;
  widget?.reset();
  return hasil.ok ? { ...hasil, ok: false, pesan: PESAN_UMUM } : hasil;
}

/** POST /api/v1/auth/keluar. */
export async function keluarSesi(): Promise<Hasil> {
  return kirim(ALAMAT_AUTH.keluar);
}
