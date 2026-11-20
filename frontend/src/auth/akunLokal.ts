import { kirimPost, PESAN_JARINGAN, PESAN_UMUM, pesanDariServer, type Hasil, type PenyetelUlang } from './bff';

// Akun lokal (mode bff): halaman Siapkan akun dan Ubah password. Alurnya di sini, terpisah dari komponen,
// supaya bisa diuji tanpa DOM. Semua panggilan same-origin; isian sandi hanya ada di body JSON dan di state
// komponen, tidak pernah di URL atau penyimpanan browser.

export const ALAMAT_AKUN = {
  siapkanAkun: '/api/v1/auth/siapkan-akun',
  ubahSandi: '/api/v1/akun/ubah-sandi',
} as const;

/** Action Turnstile halaman Siapkan akun (diperiksa server). */
export const AKSI_SIAPKAN_AKUN = 'sapa_siapkan_akun';

export const PANJANG_MIN_SANDI = 15;
/** Batas atas sandi dalam byte UTF-8, sama dengan batas form masuk, supaya sandi baru selalu bisa dipakai masuk. */
export const MAKS_SANDI_BYTE = 72;

export const PESAN_UBAH_SANDI_BERHASIL = 'Password berhasil diubah. Perangkat lain sudah dikeluarkan.';
export const PESAN_HIBP_TIDAK_TERSEDIA = 'Pemeriksaan keamanan sandi sedang tidak tersedia. Coba lagi beberapa saat lagi.';

// Cadangan bila server mengirim kode tanpa teks; teks dari server selalu didahulukan.
const PESAN_KODE: Record<string, string> = {
  hibp_tidak_tersedia: PESAN_HIBP_TIDAK_TERSEDIA,
  sandi_lemah: `Sandi baru belum memenuhi syarat. Gunakan minimal ${PANJANG_MIN_SANDI} karakter.`,
  sandi_bocor: 'Sandi ini pernah muncul dalam kebocoran data di internet. Pilih sandi lain.',
  sandi_sama: 'Sandi baru harus berbeda dari sandi lama.',
  sandi_lama_salah: 'Sandi lama salah.',
  kode_salah: 'Kode tidak cocok atau sudah tidak berlaku.',
  isian_tidak_sah: 'Isian belum lengkap atau tidak sesuai. Periksa kembali.',
  turnstile_gagal: 'Verifikasi keamanan gagal. Ulangi centang.',
  turnstile_kedaluwarsa: 'Verifikasi keamanan sudah kedaluwarsa. Ulangi centang.',
};

/** Pesan untuk pengguna: teks server bila ada, selain itu cadangan menurut kode, lalu menurut status. */
export function pesanAkun(hasil: Hasil): string {
  const teksServer = typeof hasil.isi?.pesan === 'string' && hasil.isi.pesan.trim()
    || (typeof hasil.isi?.kode === 'string' && typeof hasil.isi?.detail === 'string' && hasil.isi.detail.trim());
  if (teksServer) return hasil.pesan;
  return (hasil.kode && PESAN_KODE[hasil.kode]) || hasil.pesan;
}

// ---------------------------------------------------------------- syarat sandi baru

export type SyaratSandiBaru = { kunci: 'panjang' | 'maks' | 'beda' | 'sama'; label: string; terpenuhi: boolean };

const panjangKarakter = (s: string) => [...s].length;
const panjangByte = (s: string) => new TextEncoder().encode(s).length;

/**
 * Syarat sandi baru yang bisa dicek di browser: minimal 15 karakter, tidak melebihi batas masuk, berbeda dari
 * pembanding (sandi lama atau kode penyiapan), dan ulangan sama persis. Pemeriksaan kebocoran dilakukan server.
 */
export function periksaSandiBaru(baru: string, ulang: string, pembanding?: { nilai: string; label: string }): { syarat: SyaratSandiBaru[]; siap: boolean } {
  const syarat: SyaratSandiBaru[] = [
    { kunci: 'panjang', label: `Minimal ${PANJANG_MIN_SANDI} karakter`, terpenuhi: panjangKarakter(baru) >= PANJANG_MIN_SANDI },
  ];
  // Batas atas jarang tercapai; butir ini hanya muncul saat terlampaui supaya daftar tidak ramai. Satuannya byte,
  // bukan karakter: huruf beraksen dan emoji memakan dua sampai empat byte, jadi labelnya menyebut itu.
  if (panjangByte(baru) > MAKS_SANDI_BYTE) syarat.push({ kunci: 'maks', label: `Terlalu panjang: maksimal ${MAKS_SANDI_BYTE} byte (huruf beraksen dan emoji dihitung lebih dari satu)`, terpenuhi: false });
  if (pembanding) syarat.push({ kunci: 'beda', label: `Berbeda dari ${pembanding.label}`, terpenuhi: baru.length > 0 && baru !== pembanding.nilai });
  syarat.push({ kunci: 'sama', label: 'Ulangi sandi baru sama persis', terpenuhi: baru.length > 0 && baru === ulang });
  return { syarat, siap: syarat.every(s => s.terpenuhi) };
}

/** Isian form Siapkan akun yang menentukan apakah tombol Simpan aktif. */
export type IsianFormSiapkan = { username: string; kode: string; sandi: string; ulang: string; token: string | null };

/**
 * Syarat form Siapkan akun: username dan kode terisi, token Turnstile ada, dan syarat sandi baru terpenuhi
 * dengan kode sebagai pembanding (sandi baru tidak boleh sama dengan kode).
 */
export function periksaIsianSiapkan(isian: IsianFormSiapkan, labelKode: string): { syarat: SyaratSandiBaru[]; siap: boolean } {
  const { syarat, siap: sandiSiap } = periksaSandiBaru(isian.sandi, isian.ulang, { nilai: isian.kode, label: labelKode });
  return { syarat, siap: Boolean(isian.username.trim() && isian.kode && isian.token) && sandiSiap };
}

export const KETERANGAN_SANDI = `Minimal ${PANJANG_MIN_SANDI} karakter. Gunakan frasa panjang yang mudah Anda ingat, misalnya beberapa kata acak. Sandi yang pernah bocor di internet akan ditolak.`;

// ---------------------------------------------------------------- pengirim tunggal

/** Kiriman kedua selama kiriman pertama berjalan (klik ganda, Enter berulang) diabaikan dan mengembalikan null. */
export function buatPengirimTunggal<A extends unknown[], R>(fungsi: (...args: A) => Promise<R>) {
  let berjalan = false;
  return {
    sibuk: () => berjalan,
    async kirim(...args: A): Promise<R | null> {
      if (berjalan) return null;
      berjalan = true;
      try { return await fungsi(...args); } finally { berjalan = false; }
    },
  };
}

// ---------------------------------------------------------------- Siapkan akun

export type JenisSiapkan = 'penyiapan' | 'pemulihan';
export type KetersediaanSiapkan = { status: 'tersedia'; jenis: JenisSiapkan } | { status: 'tidak_ada' } | { status: 'galat'; pesan: string };

export const BATAS_PERIKSA_MS = 10_000;

/**
 * GET /api/v1/auth/siapkan-akun. Hanya 200 dengan tersedia=true yang membuka form. 404 dan jawaban lain yang
 * bukan galat layanan berarti halaman tidak ada, tanpa alasan. 429 dan 5xx (layanan akun belum siap, batas
 * percobaan) menjadi galat dengan tombol Coba lagi, supaya tidak tertukar dengan kode yang tidak aktif; status
 * itu sudah terlihat di HTTP, jadi membedakannya tidak membuka informasi baru. Server yang tidak terjangkau
 * menjadi galat jaringan.
 */
export async function bacaSiapkanAkun(batasMs = BATAS_PERIKSA_MS): Promise<KetersediaanSiapkan> {
  let res: Response;
  try {
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(batasMs) : undefined;
    res = await fetch(ALAMAT_AKUN.siapkanAkun, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  } catch {
    return { status: 'galat', pesan: PESAN_JARINGAN };
  }
  if (res.status === 429 || res.status >= 500) {
    let isiGalat: Record<string, unknown> | null = null;
    try {
      const isi: unknown = await res.json();
      if (isi && typeof isi === 'object' && !Array.isArray(isi)) isiGalat = isi as Record<string, unknown>;
    } catch { /* bukan JSON: pesan cadangan menurut status */ }
    return { status: 'galat', pesan: pesanDariServer(isiGalat, res.status) };
  }
  if (res.status !== 200) return { status: 'tidak_ada' };
  let isi: unknown = null;
  try { isi = await res.json(); } catch { /* bentuk salah: tidak ada */ }
  if (!isi || typeof isi !== 'object' || (isi as { tersedia?: unknown }).tersedia !== true) return { status: 'tidak_ada' };
  return { status: 'tersedia', jenis: (isi as { jenis?: unknown }).jenis === 'pemulihan' ? 'pemulihan' : 'penyiapan' };
}

export type IsianSiapkan = { username: string; kode: string; passwordBaru: string; token: string };

/** POST /api/v1/auth/siapkan-akun. Setiap kegagalan menyetel ulang widget, karena token Turnstile sekali pakai. */
export async function ajukanSiapkanAkun(isian: IsianSiapkan, widget?: PenyetelUlang): Promise<Hasil> {
  const hasil = await kirimPost(ALAMAT_AKUN.siapkanAkun, {
    username: isian.username, kode: isian.kode, password_baru: isian.passwordBaru, turnstile_token: isian.token,
  });
  if (hasil.ok && hasil.isi?.siap === true) return hasil;
  widget?.reset();
  if (hasil.ok) return { ...hasil, ok: false, pesan: PESAN_UMUM };
  return { ...hasil, pesan: pesanAkun(hasil) };
}

/** Kendali form Siapkan akun yang disentuh alur kirim. */
export type KendaliSiapkan = {
  /** Kosongkan kode dan kedua isian sandi. */
  kosongkanRahasia: () => void;
  sembunyikanKode: () => void;
  buangToken: () => void;
  tampilkanGalat: (pesan: string) => void;
  fokusKode: () => void;
  berhasil: () => void;
};

/**
 * Alur kirim form Siapkan akun. Kode dan sandi dikosongkan setelah setiap jawaban. Bila gagal, token lama
 * dibuang (widget sudah disetel ulang), pesan server tampil, dan fokus ke kolom kode. Mengembalikan true bila berhasil.
 */
export async function kirimSiapkanAkun(isian: IsianSiapkan, widget: PenyetelUlang, form: KendaliSiapkan): Promise<boolean> {
  const hasil = await ajukanSiapkanAkun(isian, widget);
  form.kosongkanRahasia();
  form.sembunyikanKode();
  if (!hasil.ok) {
    form.buangToken();
    form.tampilkanGalat(hasil.pesan);
    form.fokusKode();
    return false;
  }
  form.berhasil();
  return true;
}

// ---------------------------------------------------------------- Ubah password

export type IsianUbahSandi = { passwordLama: string; passwordBaru: string };

/** POST /api/v1/akun/ubah-sandi (butuh cookie sesi). */
export async function ajukanUbahSandi(isian: IsianUbahSandi): Promise<Hasil> {
  const hasil = await kirimPost(ALAMAT_AKUN.ubahSandi, { password_lama: isian.passwordLama, password_baru: isian.passwordBaru });
  if (hasil.ok && hasil.isi?.diubah === true) return hasil;
  if (hasil.ok) return { ...hasil, ok: false, pesan: PESAN_UMUM };
  return { ...hasil, pesan: pesanAkun(hasil) };
}

/** Kendali form Ubah password yang disentuh alur kirim. */
export type KendaliUbahSandi = {
  kosongkanSandi: () => void;
  tampilkanGalat: (pesan: string) => void;
  tampilkanBerhasil: (pesan: string) => void;
  fokusSandiLama: () => void;
};

/**
 * Alur kirim Ubah password. Ketiga isian sandi dikosongkan setelah setiap jawaban. Berhasil: pesan tampil lalu
 * sesi dibaca ulang (server sudah memasang cookie sesi baru). 401 selain sandi lama salah berarti sesi sudah
 * berakhir: sesi dibaca ulang supaya aplikasi kembali ke halaman masuk. Mengembalikan true bila berhasil.
 */
export async function kirimUbahSandi(isian: IsianUbahSandi, muatUlang: () => Promise<boolean>, form: KendaliUbahSandi): Promise<boolean> {
  const hasil = await ajukanUbahSandi(isian);
  form.kosongkanSandi();
  if (hasil.ok) {
    form.tampilkanBerhasil(PESAN_UBAH_SANDI_BERHASIL);
    await muatUlang();
    return true;
  }
  form.tampilkanGalat(hasil.pesan);
  if (hasil.status === 401 && hasil.kode !== 'sandi_lama_salah') {
    await muatUlang();
    return false;
  }
  form.fokusSandiLama();
  return false;
}
