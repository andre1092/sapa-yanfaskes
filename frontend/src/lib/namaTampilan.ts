/** Nama dan peran untuk ditampilkan saja; data sesi dan log tidak diubah. */
export function namaTampilan(user: { name?: string; username?: string } | null | undefined): string {
  const mentah = (user?.name || user?.username || '').trim();
  if (!mentah) return 'Pengguna';
  if (!mentah.includes('@')) return mentah;
  const kata = mentah.split('@')[0].split(/[._-]+/).filter(Boolean);
  return kata.map(k => k[0].toUpperCase() + k.slice(1)).join(' ') || 'Pengguna';
}

const LABEL_PERAN: Record<string, string> = {
  viewer: 'Pengguna',
  User: 'Pengguna',
  Admin: 'Admin',
  'Super Admin': 'Super Admin',
};

export function peranTampilan(role: string | null | undefined): string {
  return LABEL_PERAN[role || ''] || role || 'Pengguna';
}
