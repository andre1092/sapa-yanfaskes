import { useState } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { useAuthStore } from './store/authStore';
import { LoginPage } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import type { NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { BlankContentArea } from './components/BlankContentArea';
import { PemanfaatanAntrolDashboard } from './components/PemanfaatanAntrolDashboard';
import { FktpAntrolDashboard } from './components/FktpAntrolDashboard';
import { LaporanKepatuhanDashboard } from './components/LaporanKepatuhanDashboard';
import { AdminSettings } from './components/AdminSettings';
import { InsightTracerDashboard } from './components/InsightTracerDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';

// Environment Variables
const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN || '';
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE || '';

// Komponen Tampilan Dashboard Utama
function DashboardLayout() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="relative min-h-screen flex flex-row overflow-x-hidden">
      {/* Dynamic Ambient Background Aura (BPJS Green & Blue Lighting Refractions) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-20 w-[650px] h-[650px] bg-[#44853b]/15 dark:bg-[#44853b]/25 rounded-full blur-[140px]" />
        <div className="absolute top-1/4 -right-32 w-[650px] h-[650px] bg-[#2b4390]/15 dark:bg-[#2b4390]/25 rounded-full blur-[150px]" />
        <div className="absolute -bottom-40 left-1/3 w-[700px] h-[550px] bg-[#6573a1]/10 dark:bg-[#83a67e]/15 rounded-full blur-[160px]" />
      </div>

      {/* Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area Wrapper (Offset by icon-rail width w-20) */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 lg:pl-20 transition-all duration-300">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
        />

        {/* Dynamic Content View with Error Boundary */}
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary key={activeTab} fallbackTitle={`Gagal memuat modul ${activeTab.toUpperCase()}`}>
            {activeTab === 'insight-tracer' ? (
              <InsightTracerDashboard />
            ) : activeTab === 'fkrtl' || activeTab === 'fkrtl-antrol' ? (
              <PemanfaatanAntrolDashboard />
            ) : activeTab === 'fkrtl-kepatuhan' ? (
              <LaporanKepatuhanDashboard />
            ) : activeTab === 'fktp' || activeTab === 'fktp-antrol' ? (
              <FktpAntrolDashboard />
            ) : activeTab === 'admin' ? (
              <AdminSettings />
            ) : (
              <BlankContentArea activeTab={activeTab} onNavigate={(tab) => setActiveTab(tab)} />
            )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

// Wrapper jika Auth0 dikonfigurasi
function Auth0MainLayout() {
  const { isLoading } = useAuth0();
  const { isAuthenticated: isStoreAuth } = useAuthStore();

  if (isLoading && !isStoreAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 relative overflow-hidden">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#009B4D] via-[#10B981] to-[#00529C] animate-spin opacity-60 blur-sm" />
          <div className="absolute w-12 h-12 rounded-xl bg-slate-900 border border-emerald-500/50 flex items-center justify-center shadow-lg shadow-emerald-950/50">
            <div className="w-4 h-4 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>
        <p className="mt-6 text-sm font-semibold tracking-wide text-emerald-300">
          Memverifikasi Sesi Keamanan SSO...
        </p>
        <span className="text-xs text-slate-400 mt-1">SAPA YANFASKES • Zero-Trust IAM Gateway</span>
      </div>
    );
  }

  return <DashboardLayout />;
}

export default function App() {
  const { isAuthenticated: isStoreAuth } = useAuthStore();

  // 1. Jika belum login (sesi authStore tidak aktif), tampilkan LoginPage resmi dengan pengamanan Cloudflare
  if (!isStoreAuth) {
    return <LoginPage />;
  }

  // 2. Jika sudah terautentikasi dan ada URL query preview=insight-tracer, render InsightTracerDashboard
  if (typeof window !== 'undefined' && window.location.search.includes('preview=insight-tracer')) {
    return <InsightTracerDashboard />;
  }

  // 3. Jika Auth0 belum terkonfigurasi, render DashboardLayout langsung
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
    return <DashboardLayout />;
  }

  return (
    <Auth0Provider
      domain={AUTH0_DOMAIN}
      clientId={AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: AUTH0_AUDIENCE,
      }}
      cacheLocation="localstorage"
    >
      <Auth0MainLayout />
    </Auth0Provider>
  );
}
