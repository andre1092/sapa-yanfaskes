import type { AuthUser } from '../store/authStore';
import { bacaSesi, keluarSesi, type HasilSesi } from './bff';
import { mapSesiBff, registerCookieSession } from './session';
import type { KeadaanKeluar } from './useSession';

// Inti penyedia sesi cookie (mode bff) tanpa React, supaya alurnya bisa diuji langsung:
// pembacaan sesi berurutan, keluar yang baru mengosongkan sesi setelah server berhasil, dan kanal antartab.

export const KANAL_SESI = 'sapa-sesi';
const PESAN_KANAL_KELUAR = 'keluar';
const PESAN_KELUAR_CADANGAN = 'Sesi belum dapat diakhiri. Coba lagi.';
const TANPA_KELUAR: KeadaanKeluar = { menunggu: false, galat: null };

export type KeadaanSesiCookie = { ready: boolean; user: AuthUser | null; error: string | null; keluar: KeadaanKeluar };

export type KanalSesi = { kirim: (pesan: string) => void; tutup: () => void };

export type LingkunganSesiCookie = {
  /** Proyeksi sesi ke authStore. */
  sinkronkan: (user: AuthUser | null) => void;
  /** Kosongkan cache kueri; dipanggil setiap kali pengguna sesi berganti dan setelah keluar. */
  bersihkanCache: () => void;
  /** Muat ulang penuh ke halaman masuk. */
  keHalamanMasuk: () => void;
  /** Kanal antartab; null bila browser tidak mendukungnya. */
  bukaKanal: (terima: (pesan: unknown) => void) => KanalSesi | null;
};

function samaPengguna(a: AuthUser | null, b: AuthUser | null): boolean {
  if (!a || !b) return a === b;
  return a.role === b.role && a.name === b.name;
}

export function buatSesiCookie(ling: LingkunganSesiCookie) {
  let keadaan: KeadaanSesiCookie = { ready: false, user: null, error: null, keluar: TANPA_KELUAR };
  const pendengar = new Set<() => void>();
  let aktif = false;
  // Nomor pembacaan terakhir: jawaban /sesi yang dikirim lebih dulu tidak boleh menimpa jawaban yang lebih baru.
  let nomor = 0;
  let lepasPengendali: (() => void) | null = null;
  let kanal: KanalSesi | null = null;
  let keluarBerjalan: Promise<void> | null = null;

  const ubah = (sebagian: Partial<KeadaanSesiCookie>) => {
    keadaan = { ...keadaan, ...sebagian };
    for (const f of pendengar) f();
  };

  // Pengendali keluar terdaftar selama ada pengguna, termasuk setelah keluar gagal (cookie masih berlaku).
  const aturPengendali = () => {
    const perlu = aktif && Boolean(keadaan.user);
    if (perlu && !lepasPengendali) lepasPengendali = registerCookieSession(() => { void keluar(); });
    if (!perlu && lepasPengendali) { lepasPengendali(); lepasPengendali = null; }
  };

  function terapkan(hasil: HasilSesi): boolean {
    const user = hasil.status === 'masuk' ? mapSesiBff(hasil.isi) : null;
    if (!samaPengguna(keadaan.user, user)) ling.bersihkanCache();
    ling.sinkronkan(user);
    ubah({ ready: true, user, error: hasil.status === 'galat' ? hasil.pesan : null, keluar: TANPA_KELUAR });
    aturPengendali();
    return Boolean(user);
  }

  async function muatUlang(): Promise<boolean> {
    const ini = ++nomor;
    const hasil = await bacaSesi();
    if (ini !== nomor || !aktif) return Boolean(keadaan.user);
    return terapkan(hasil);
  }

  function keluar(): Promise<void> {
    if (keluarBerjalan) return keluarBerjalan;
    nomor += 1;
    ubah({ keluar: { menunggu: true, galat: null } });
    keluarBerjalan = keluarSesi().then(hasil => {
      keluarBerjalan = null;
      if (hasil.ok) {
        ling.bersihkanCache();
        kanal?.kirim(PESAN_KANAL_KELUAR);
        ling.keHalamanMasuk();
        return;
      }
      // Server belum mengakhiri sesi: pengguna, pengendali keluar, dan proyeksi authStore tetap ada.
      ling.sinkronkan(keadaan.user);
      ubah({ keluar: { menunggu: false, galat: hasil.pesan || PESAN_KELUAR_CADANGAN } });
    });
    return keluarBerjalan;
  }

  // Keluar di tab lain: tab ini ikut ke halaman masuk.
  const terimaKanal = (pesan: unknown) => {
    if (pesan === PESAN_KANAL_KELUAR && keadaan.user) ling.keHalamanMasuk();
  };

  function mulai(): () => void {
    aktif = true;
    kanal = ling.bukaKanal(terimaKanal);
    aturPengendali();
    void muatUlang();
    return () => {
      aktif = false;
      nomor += 1;
      kanal?.tutup();
      kanal = null;
      aturPengendali();
    };
  }

  return {
    ambil: () => keadaan,
    langganan: (f: () => void) => { pendengar.add(f); return () => { pendengar.delete(f); }; },
    mulai,
    muatUlang,
    keluar,
    tutupGalatKeluar: () => ubah({ keluar: TANPA_KELUAR }),
  };
}

export type SesiCookieInti = ReturnType<typeof buatSesiCookie>;
