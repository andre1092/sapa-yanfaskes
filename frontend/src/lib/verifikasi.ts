// Logika halaman /verifikasi (Cloudflare Turnstile di tengah login Auth0). Tanpa impor runtime,
// supaya bisa diuji langsung dengan node --test.

export type Keadaan = 'memuat' | 'siap' | 'memeriksa' | 'berhasil' | 'gagal' | 'kedaluwarsa' | 'tautan' | 'layanan';

const MAKS_STATE = 2048;
const MAKS_TOKEN = 4096;

export function bacaParameter(search: string): { state: string; sessionToken: string } | null {
  const q = new URLSearchParams(search);
  const state = q.get('state') || '';
  const sessionToken = q.get('session_token') || '';
  if (!state || !sessionToken || state.length > MAKS_STATE || sessionToken.length > MAKS_TOKEN) return null;
  return { state, sessionToken };
}

/** Sama dengan ringkas_state di api/verifikasi_service.py; dipakai sebagai cData Turnstile. */
export async function ringkasState(state: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export function keadaanDariStatus(status: number): Keadaan {
  if (status === 400) return 'tautan';
  if (status === 403) return 'gagal';
  return 'layanan';
}

/** Pertahanan tambahan: hanya /continue di domain Auth0 SAPA, walau alamatnya dari server sendiri. */
export function alamatLanjutSah(alamat: string, domainAuth0: string): boolean {
  if (!domainAuth0) return false;
  try {
    const url = new URL(alamat);
    return url.protocol === 'https:' && url.host === domainAuth0 && url.pathname === '/continue';
  } catch {
    return false;
  }
}

/**
 * Alamat lanjut ke Auth0 lewat GET (navigasi biasa). POST lintas situs tidak membawa cookie
 * transaksi Auth0 (SameSite), sehingga Auth0 menolak dengan "invalid state parameter".
 * Token balasan berumur 2 menit dan terikat ke state, yang hanya bisa dipakai sekali.
 */
export function alamatContinue(alamat: string, state: string, token: string): string {
  const url = new URL(alamat);
  url.searchParams.set('state', state);
  url.searchParams.set('sapa_token', token);
  return url.toString();
}
