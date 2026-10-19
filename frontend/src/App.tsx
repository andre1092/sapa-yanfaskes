import { useAuthStore } from './store/authStore';
import { LoginPage } from './components/LoginPage';
import { InsightTracerDashboard } from './components/InsightTracerDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const { isAuthenticated: isStoreAuth } = useAuthStore();

  // 1. Jika belum login (sesi belum aktif), tampilkan Halaman Login Resmi
  if (!isStoreAuth) {
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
