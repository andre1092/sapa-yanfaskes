// Matriks peran yang disetujui CEO (2026-11-13). Server tetap memeriksa ulang setiap permintaan;
// berkas ini hanya menentukan menu dan tombol yang ditampilkan.
export type Aksi = 'lihat' | 'ekspor' | 'sinkron' | 'pengaturan';

const PERINGKAT: Record<string, number> = { 'Petugas RS': 1, viewer: 1, Admin: 2, 'Super Admin': 3 };
const MINIMUM: Record<Aksi, number> = { lihat: 1, ekspor: 2, sinkron: 2, pengaturan: 3 };
const AKSI_MENU: Record<string, Aksi> = { Integration: 'sinkron', Logs: 'pengaturan', 'Pengguna FKRTL': 'pengaturan', 'Validation Rules': 'pengaturan' };
// Petugas RS (akun rumah sakit): lihat dan unduh data FKRTL saja; data FKTP disembunyikan.
const MENU_TERTUTUP_PETUGAS = new Set(['Capaian Kepatuhan FKTP']);

export function bolehMelakukan(peran: string | null | undefined, aksi: Aksi): boolean {
  if (peran === 'Petugas RS' && aksi === 'ekspor') return true;
  return (PERINGKAT[peran || ''] || 0) >= MINIMUM[aksi];
}

export function menuBoleh(menu: string, peran: string | null | undefined): boolean {
  if (peran === 'Petugas RS' && MENU_TERTUTUP_PETUGAS.has(menu)) return false;
  const aksi = AKSI_MENU[menu];
  return aksi ? bolehMelakukan(peran, aksi) : true;
}
