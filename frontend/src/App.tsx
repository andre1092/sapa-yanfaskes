import { useEffect } from 'react';
import { perluAlamatMasuk, pilihTampilan } from './auth/tampilanSesi';
import { alamatHalamanMasuk } from './lib/halamanAwal';
import { useSession } from './auth/useSession';
import { useAuthStore } from './store/authStore';
import { LayarKeluar, LoginPage } from './components/LoginPage';
import { InsightTracerDashboard } from './components/InsightTracerDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const { isAuthenticated: isStoreAuth } = useAuthStore();
  const session = useSession();
  const tampilan = pilihTampilan(session, isStoreAuth);

  // Pengunjung yang belum masuk selalu melihat alamat /login; tujuan semula disimpan di ?kembali=.
  // Menunggu session.ready supaya callback Auth0 (/?code=…&state=…) tidak terganggu; saat mode login
  // gagal dibaca, alamat juga dibiarkan sampai "Coba lagi" berhasil.
  const keMasuk = perluAlamatMasuk(session, isStoreAuth);
  useEffect(() => {
    if (!keMasuk) return;
    const sekarang = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const tujuan = alamatHalamanMasuk(sekarang);
    if (tujuan !== sekarang) window.history.replaceState(null, '', tujuan);
  }, [keMasuk]);

  // 1. Jika belum login (sesi belum aktif), tampilkan Halaman Login Resmi
  if (tampilan === 'masuk') return <LoginPage />;
  // Keluar sedang diproses atau gagal (mode bff): sesi masih aktif, dasbor tidak ditampilkan.
  if (tampilan === 'keluar') return <LayarKeluar />;

  // 2. Saat berhasil login, LANGSUNG tampilkan UI/UX Baru (SAPA Yanfaskes) secara tunggal dan utuh
  // Menghapus total UI/UX lama (tanpa sidebar ganda, tanpa header ganda yang saling bertumpuk)
  return (
    <ErrorBoundary fallbackTitle="Gagal memuat modul SAPA Yanfaskes">
      <InsightTracerDashboard />
    </ErrorBoundary>
  );
}
