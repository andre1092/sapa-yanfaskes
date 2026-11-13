// Syarat kata sandi baru petugas RS; sama dengan pemeriksaan server (api/pengguna_service.py).
export type SyaratSandi = { kunci: 'panjang' | 'besar' | 'kecil' | 'angka' | 'sama'; label: string; terpenuhi: boolean };

export function periksaSandi(sandi: string, ulang: string): { syarat: SyaratSandi[]; siap: boolean } {
  const syarat: SyaratSandi[] = [
    { kunci: 'panjang', label: 'Minimal 12 karakter', terpenuhi: sandi.length >= 12 },
    { kunci: 'besar', label: 'Memuat huruf besar', terpenuhi: /[A-Z]/.test(sandi) },
    { kunci: 'kecil', label: 'Memuat huruf kecil', terpenuhi: /[a-z]/.test(sandi) },
    { kunci: 'angka', label: 'Memuat angka', terpenuhi: /[0-9]/.test(sandi) },
    { kunci: 'sama', label: 'Ketik ulang sama persis', terpenuhi: sandi.length > 0 && sandi === ulang },
  ];
  return { syarat, siap: syarat.every(s => s.terpenuhi) && sandi.length <= 128 };
}
