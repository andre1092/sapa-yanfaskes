// Ringkasan dan penyaring daftar akun petugas RS di menu Pengguna FKRTL.
export type FaskesRef = { kode_ppk: string; nama_ppk: string; kabupaten: string; kelas_ppk?: string };
export type PenggunaFkrtl = {
  user_id: string; nama: string; email: string; aktif: boolean; wajib_ganti_sandi: boolean; kode_ppk: string;
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
  const kata = saring.cari.trim().toLocaleLowerCase('id');
  return pengguna.filter(p =>
    (!kata || [p.nama, p.email, p.faskes.nama_ppk, p.kode_ppk].join(' ').toLocaleLowerCase('id').includes(kata))
    && (!saring.kabupaten || p.faskes.kabupaten === saring.kabupaten)
    && (!saring.status || statusPengguna(p) === saring.status));
}
