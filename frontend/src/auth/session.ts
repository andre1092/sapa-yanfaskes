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
