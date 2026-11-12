// Halaman pengguna hanya menyimpan data tampilan di peramban; proses masuk dikelola Auth0.
// Kolom kata sandi tidak boleh ada di data ini, termasuk yang tersisa dari versi lama.
type Rekaman = Record<string, unknown>;

function tanpaKolomKataSandi(nilai: unknown): unknown {
  if (!nilai || typeof nilai !== 'object') return nilai;
  const salinan = { ...(nilai as Rekaman) };
  delete salinan.password;
  return salinan;
}

export function buangKataSandi<T>(state: T): T {
  if (!state || typeof state !== 'object') return state;
  const data = state as Rekaman;
  return {
    ...data,
    profile: tanpaKolomKataSandi(data.profile),
    users: Array.isArray(data.users) ? data.users.map(tanpaKolomKataSandi) : data.users,
  } as T;
}
