import { alamatHalamanMasuk, alamatSetelahMasuk, tujuanSetelahMasuk } from '../lib/halamanAwal';
import { sandiTerlaluPanjang } from './batasSandi';
import { ajukanMasuk, type IsianMasuk, type PenyetelUlang } from './bff';
import { safeReturnTo } from './session';

// Alur kirim form masuk (mode bff), terpisah dari komponen supaya bisa diuji tanpa DOM.

const lokasiSekarang = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

/** Kendali form yang disentuh alur kirim: isian sandi, token Turnstile, pesan galat, dan fokus. */
export type KendaliForm = {
  kosongkanPassword: () => void;
  /** Kembalikan tombol lihat password ke keadaan tersembunyi (type=password). */
  sembunyikanPassword: () => void;
  buangToken: () => void;
  tampilkanGalat: (pesan: string) => void;
  fokusPassword: () => void;
};

/** Setter state komponen form masuk yang dibungkus menjadi KendaliForm. */
export type SetelanForm = {
  setPassword: (nilai: string) => void;
  setLihat: (nilai: boolean) => void;
  setToken: (nilai: string | null) => void;
  setGalat: (nilai: string | null) => void;
  fokus: () => void;
};

/** Bangun KendaliForm dari setter useState komponen, supaya pemetaannya bisa diuji tanpa DOM. */
export function buatKendaliForm({ setPassword, setLihat, setToken, setGalat, fokus }: SetelanForm): KendaliForm {
  return {
    kosongkanPassword: () => setPassword(''),
    sembunyikanPassword: () => setLihat(false),
    buangToken: () => setToken(null),
    tampilkanGalat: pesan => setGalat(pesan),
    fokusPassword: fokus,
  };
}

/**
 * Syarat tombol Masuk: username, password, dan token Turnstile ada, dan password tidak melebihi batas byte.
 * Bila melebihi, form menampilkan pesan di bawah isian password.
 */
export function periksaIsianMasuk({ username, password, token }: { username: string; password: string; token: string | null }): { siap: boolean; sandiTerlaluPanjang: boolean } {
  const terlaluPanjang = sandiTerlaluPanjang(password);
  return { siap: Boolean(username.trim() && password && token) && !terlaluPanjang, sandiTerlaluPanjang: terlaluPanjang };
}

export const PESAN_SESI_BELUM_TERBUKA = 'Sesi belum dapat dibuka. Coba masuk kembali.';

/**
 * Alur kirim form masuk. Sandi dikosongkan dan disembunyikan lagi setelah setiap jawaban. Bila gagal, token lama dibuang
 * (widget sudah disetel ulang oleh ajukanMasuk) dan fokus kembali ke kolom password. Bila berhasil,
 * alamat tujuan dipasang sebelum sesi dimuat, supaya dasbor langsung terbuka di halaman yang benar.
 * Mengembalikan true bila sesi sudah terbuka.
 */
export async function kirimMasuk(isian: IsianMasuk, widget: PenyetelUlang, muatUlang: () => Promise<boolean>, form: KendaliForm): Promise<boolean> {
  const hasil = await ajukanMasuk(isian, widget);
  form.kosongkanPassword();
  form.sembunyikanPassword();
  if (!hasil.ok) {
    form.buangToken();
    form.tampilkanGalat(hasil.pesan);
    form.fokusPassword();
    return false;
  }
  const tujuan = alamatSetelahMasuk(safeReturnTo(tujuanSetelahMasuk(lokasiSekarang())));
  window.history.replaceState(null, '', tujuan);
  if (await muatUlang()) return true;
  window.history.replaceState(null, '', alamatHalamanMasuk(tujuan));
  widget?.reset();
  form.buangToken();
  form.tampilkanGalat(PESAN_SESI_BELUM_TERBUKA);
  return false;
}

/**
 * Pengirim form masuk untuk satu komponen: kiriman kedua selama kiriman pertama berjalan (klik ganda,
 * Enter berulang sebelum tombol dinonaktifkan) diabaikan dan mengembalikan null, jadi hanya satu POST.
 */
export function buatPengirimMasuk() {
  let berjalan = false;
  return {
    sibuk: () => berjalan,
    async kirim(...args: Parameters<typeof kirimMasuk>): Promise<boolean | null> {
      if (berjalan) return null;
      berjalan = true;
      try { return await kirimMasuk(...args); } finally { berjalan = false; }
    },
  };
}
