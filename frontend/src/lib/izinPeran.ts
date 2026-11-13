// Matriks peran yang disetujui CEO (2026-11-13). Server tetap memeriksa ulang setiap permintaan;
// berkas ini hanya menentukan menu dan tombol yang ditampilkan.
export type Aksi = 'lihat' | 'ekspor' | 'sinkron' | 'pengaturan';

const PERINGKAT: Record<string, number> = { viewer: 1, Admin: 2, 'Super Admin': 3 };
const MINIMUM: Record<Aksi, number> = { lihat: 1, ekspor: 2, sinkron: 2, pengaturan: 3 };
const AKSI_MENU: Record<string, Aksi> = { Integration: 'sinkron', 'Validation Rules': 'pengaturan' };

export function bolehMelakukan(peran: string | null | undefined, aksi: Aksi): boolean {
  return (PERINGKAT[peran || ''] || 0) >= MINIMUM[aksi];
}

export function menuBoleh(menu: string, peran: string | null | undefined): boolean {
  const aksi = AKSI_MENU[menu];
  return aksi ? bolehMelakukan(peran, aksi) : true;
}
