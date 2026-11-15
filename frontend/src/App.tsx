import { useEffect } from 'react';
import { useSession } from './auth/useSession';
import { alamatHalamanMasuk } from './lib/halamanAwal';
import { useAuthStore } from './store/authStore';
import { LoginPage } from './components/LoginPage';
import { InsightTracerDashboard } from './components/InsightTracerDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const { isAuthenticated: isStoreAuth } = useAuthStore();
  const session = useSession();
  const belumMasuk = session.ready && (!session.authenticated || !isStoreAuth);

  // Pengunjung yang belum masuk selalu melihat alamat /login; tujuan semula disimpan di ?kembali=.
  // Menunggu session.ready supaya callback Auth0 (/?code=…&state=…) tidak terganggu.
  useEffect(() => {
    if (!belumMasuk) return;
    const sekarang = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const tujuan = alamatHalamanMasuk(sekarang);
    if (tujuan !== sekarang) window.history.replaceState(null, '', tujuan);
  }, [belumMasuk]);

  // 1. Jika belum login (sesi belum aktif), tampilkan Halaman Login Resmi
  if (!session.ready || !session.authenticated || !isStoreAuth) {
    return <LoginPage />;
  }

  // 2. Saat berhasil login, LANGSUNG tampilkan UI/UX Baru (SAPA Yanfaskes) secara tunggal dan utuh
  // Menghapus total UI/UX lama (tanpa sidebar ganda, tanpa header ganda yang saling bertumpuk)
  return (
    <ErrorBoundary fallbackTitle="Gagal memuat modul SAPA Yanfaskes">
      <InsightTracerDashboard />
    </ErrorBoundary>
  );
}
