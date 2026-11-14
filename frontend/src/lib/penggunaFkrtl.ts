import { pencocokCari } from './cocokCari';
// Ringkasan dan penyaring daftar akun petugas RS di menu Pengguna FKRTL.
export type FaskesRef = { kode_ppk: string; nama_ppk: string; kabupaten: string; kelas_ppk?: string };
export type PenggunaFkrtl = {
  user_id: string; nama: string; email: string; username?: string; aktif: boolean; wajib_ganti_sandi: boolean; kode_ppk: string;
  faskes: { kode_ppk: string; nama_ppk: string; kabupaten: string };
  login_terakhir?: string | null; dibuat?: string | null;
};
export type StatusPengguna = 'aktif' | 'wajib_ganti' | 'nonaktif';
export type SaringanPengguna = { cari: string; kabupaten: string; status: '' | StatusPengguna };

export const statusPengguna = (p: PenggunaFkrtl): StatusPengguna =>
  !p.aktif ? 'nonaktif' : p.wajib_ganti_sandi ? 'wajib_ganti' : 'aktif';

export function ringkasPengguna(pengguna: readonly PenggunaFkrtl[], faskes: readonly { kode_ppk: string }[]) {
  const rs = new Set(pengguna.filter(p => p.aktif).map(p => p.kode_ppk));
  return {
    rsBerakun: rs.size, totalRs: faskes.length,
    wajibGanti: pengguna.filter(p => statusPengguna(p) === 'wajib_ganti').length,
    nonaktif: pengguna.filter(p => !p.aktif).length,
  };
}

export function saringPengguna(pengguna: readonly PenggunaFkrtl[], saring: SaringanPengguna): PenggunaFkrtl[] {
  const cocok = pencocokCari(saring.cari);
  return pengguna.filter(p =>
    cocok(p.nama, p.username || '', p.email, p.faskes.nama_ppk, p.kode_ppk)
    && (!saring.kabupaten || p.faskes.kabupaten === saring.kabupaten)
    && (!saring.status || statusPengguna(p) === saring.status));
}

const FORMAT_WIB = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Waktu login terakhir dari Auth0 (UTC) dalam WIB: "dd/mm/yyyy hh:mm". */
export function formatLoginTerakhir(iso: string | null | undefined): string {
  const waktu = iso ? new Date(iso) : null;
  if (!waktu || Number.isNaN(waktu.getTime())) return 'Belum pernah';
  return FORMAT_WIB.format(waktu).replace(',', '');
}
