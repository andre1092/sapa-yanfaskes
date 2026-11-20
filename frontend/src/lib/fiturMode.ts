import type { ModeHalaman } from '../auth/useSession';
import { menuBoleh } from './izinPeran';

// Menu yang bergantung pada mode login. Mode bff (akun lokal) belum punya pengelolaan pengguna, jadi menu yang
// memakai layanan akun lama disembunyikan; Pengaturan akun (Ubah password) hanya ada di mode bff. Mode lama
// tidak berubah. Server tetap memeriksa ulang setiap permintaan; berkas ini hanya menentukan menu yang tampil.

type Mode = ModeHalaman | null | undefined;

export const MENU_PENGATURAN_AKUN = 'Pengaturan akun';
export const PESAN_FITUR_BELUM_TERSEDIA = 'Fitur ini belum tersedia di sistem akun baru.';
export const PESAN_HANYA_AKUN_LOKAL = 'Pengaturan akun hanya tersedia di sistem akun baru.';

/** Menu yang memakai layanan akun lama (pengelolaan pengguna); tidak tersedia di mode bff. */
const MENU_LAYANAN_AKUN_LAMA = new Set(['Pengguna FKRTL']);
/** Menu yang hanya ada untuk akun lokal (mode bff). */
const MENU_AKUN_LOKAL = new Set([MENU_PENGATURAN_AKUN]);

export function menuTersedia(menu: string, mode: Mode): boolean {
  if (mode === 'bff') return !MENU_LAYANAN_AKUN_LAMA.has(menu);
  return !MENU_AKUN_LOKAL.has(menu);
}

/** Pesan pengganti isi halaman saat menu dibuka lewat alamat langsung tetapi tidak tersedia di mode ini. */
export function pesanMenuTidakTersedia(menu: string, mode: Mode): string {
  if (mode === 'bff' && MENU_LAYANAN_AKUN_LAMA.has(menu)) return PESAN_FITUR_BELUM_TERSEDIA;
  if (MENU_AKUN_LOKAL.has(menu)) return PESAN_HANYA_AKUN_LOKAL;
  return 'Modul ini belum memiliki data atau fungsi yang dapat digunakan.';
}

/** Bagian menu yang tampil untuk peran dan mode login ini; bagian tanpa item dibuang. */
export function saringBagianMenu<B extends { items: string[][] }>(bagian: B[], peran: string | null | undefined, mode: Mode): B[] {
  return bagian
    .map(b => ({ ...b, items: b.items.filter(([kunci]) => menuBoleh(kunci, peran) && menuTersedia(kunci, mode)) }))
    .filter(b => b.items.length > 0);
}
