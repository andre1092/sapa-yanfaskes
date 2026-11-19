import type { User } from '@auth0/auth0-react';
import type { AuthUser } from '../store/authStore';

export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || (value.includes('\\') || [...value].some(char => char.charCodeAt(0) < 32))) return '/';
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch { return '/'; }
}

export function mapAuth0User(user: User, rolesClaim?: string): AuthUser | null {
  if (!user.sub) return null;
  const trustedClaim = rolesClaim && /^https:\/\//.test(rolesClaim) ? user[rolesClaim] : undefined;
  const roles: string[] = Array.isArray(trustedClaim) ? trustedClaim.filter((role): role is string => typeof role === 'string') : [];
  const role = roles.some(value => ['super_admin', 'Super Admin'].includes(value)) ? 'Super Admin'
    : roles.some(value => ['admin', 'Admin'].includes(value)) ? 'Admin'
    // Akun rumah sakit hanya mendapat peran Petugas RS bila tidak punya peran lain.
    : roles.some(value => ['viewer', 'Viewer'].includes(value)) ? 'viewer'
    : roles.some(value => ['petugas_rs', 'Petugas RS'].includes(value)) ? 'Petugas RS' : 'viewer';
  return {
    id: user.sub, sub: user.sub, username: user.nickname || user.email || user.sub,
    name: user.name || user.nickname || 'Pengguna SAPA', email: user.email || '', role,
  };
}

type TokenGetter = () => Promise<string>;
let tokenGetter: TokenGetter | null = null;
let logoutHandler: (() => void) | null = null;
export function registerAuthSession(getToken: TokenGetter, logout: () => void): () => void {
  tokenGetter = getToken;
  logoutHandler = logout;
  return () => { if (tokenGetter === getToken) { tokenGetter = null; logoutHandler = null; } };
}
export async function getSessionToken(): Promise<string> {
  if (!tokenGetter) throw new Error('Sesi Auth0 belum siap. Silakan masuk kembali.');
  return tokenGetter();
}
export function logoutSession(): void { logoutHandler?.(); }

/**
 * Mode login dari GET /api/v1/auth/mode: 'auth0' (SPA lama, token Bearer di memori) atau 'bff'
 * (cookie sesi HttpOnly; browser tidak memegang token). null selama mode belum diketahui.
 */
export type ModeSesi = 'auth0' | 'bff';
let modeAktif: ModeSesi | null = null;
export function aturModeSesi(mode: ModeSesi | null): void { modeAktif = mode; }
export function modeSesi(): ModeSesi | null { return modeAktif; }

/** Penanda permintaan aplikasi SAPA; server BFF menolak POST bercookie tanpa header ini. */
export const HEADER_SAPA = { 'X-SAPA': '1' } as const;

/**
 * Sesi cookie (mode bff): hanya pengendali keluar yang didaftarkan, karena tidak ada token di browser.
 * getSessionToken tetap gagal tertutup di mode ini.
 */
let sesiCookieAktif = false;
export function registerCookieSession(logout: () => void): () => void {
  sesiCookieAktif = true;
  logoutHandler = logout;
  return () => { if (logoutHandler === logout) { sesiCookieAktif = false; logoutHandler = null; } };
}

/** Gagal bila tidak ada sesi aktif, di mode apa pun. */
export async function pastikanSesi(): Promise<void> {
  if (modeAktif === 'bff') {
    if (!sesiCookieAktif) throw new Error('Sesi berakhir. Silakan masuk kembali.');
    return;
  }
  await getSessionToken();
}

/** Isi GET /api/v1/auth/sesi. */
export type IsiSesi = { masuk?: unknown; peran?: unknown; nama?: unknown; kode?: unknown };

// label_peran server (api/index.py role_label) -> label peran di antarmuka (sama dengan mapAuth0User).
const PERAN_SESI: Record<string, string> = { super_admin: 'Super Admin', admin: 'Admin', viewer: 'viewer', petugas_rs: 'Petugas RS' };

/** Proyeksi sesi cookie ke AuthUser. Peran tak dikenal menjadi 'viewer'; server tetap penentu hak. */
export function mapSesiBff(isi: IsiSesi | null | undefined): AuthUser | null {
  if (!isi || isi.masuk !== true) return null;
  const peran = typeof isi.peran === 'string' && Object.hasOwn(PERAN_SESI, isi.peran) ? PERAN_SESI[isi.peran] : 'viewer';
  const nama = typeof isi.nama === 'string' && isi.nama.trim() ? isi.nama.trim().slice(0, 100) : 'Pengguna SAPA';
  // Sesi tidak mengirim sub atau email; id tetap per sesi, dan keluar selalu memuat ulang halaman.
  return { id: 'sesi', sub: 'sesi', username: nama, name: nama, email: '', role: peran };
}
