import { useState } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { Sidebar } from './components/Sidebar';
import type { NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { BlankContentArea } from './components/BlankContentArea';
import { PemanfaatanAntrolDashboard } from './components/PemanfaatanAntrolDashboard';
import { AdminSettings } from './components/AdminSettings';

// Environment Variables
const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN || '';
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE || '';

function MainLayout() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // 1. Loading Authentication State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-400 animate-spin opacity-40 blur-sm" />
          <div className="absolute w-12 h-12 rounded-xl bg-slate-900 border border-cyan-500/40 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-cyan-400 animate-pulse" />
          </div>
        </div>
        <p className="mt-6 text-sm font-semibold tracking-wide text-cyan-300">
          Memverifikasi Sesi Keamanan SSO...
        </p>
        <span className="text-xs text-slate-500 mt-1">Zero-Trust IAM Gateway</span>
      </div>
    );
  }

  // 2. Unauthenticated SSO Login Screen
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 p-4 relative overflow-hidden">
        {/* Background ambient lighting */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-cyan-600/10 via-teal-500/10 to-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 bg-slate-900/90 backdrop-blur-2xl p-8 sm:p-10 rounded-3xl shadow-2xl border border-slate-800 text-center max-w-md w-full">
          {/* Logo Badge */}
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-cyan-500 via-teal-500 to-blue-600 p-[1px] shadow-xl shadow-cyan-500/20 mb-6">
            <div className="w-full h-full bg-slate-950 rounded-[15px] flex items-center justify-center">
              <svg
                className="w-8 h-8 text-cyan-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            SAPA <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-300">YANFASKES</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1.5 mb-8">
            Portal Layanan & Analitik Fasilitas Kesehatan
          </p>

          <button
            onClick={() => loginWithRedirect()}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold rounded-xl px-5 py-4 transition-all duration-200 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 active:scale-[0.99] cursor-pointer"
          >
            <svg className="w-5 h-5 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            <span>Continue with Single Sign-On (SSO)</span>
          </button>

          <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-slate-400">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Protected by Enterprise Auth0 Zero-Trust</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. Authenticated Dashboard with Left Sidebar Layout
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-row">
      {/* Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area Wrapper (Offset by icon-rail width w-20) */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-20 transition-all duration-300">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
        />

        {/* Dynamic Content View */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'fkrtl' || activeTab === 'fkrtl-antrol' ? (
            <PemanfaatanAntrolDashboard />
          ) : activeTab === 'admin' ? (
            <AdminSettings />
          ) : (
            <BlankContentArea activeTab={activeTab} />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 p-6 text-center">
        <div className="bg-slate-900 border border-rose-500/30 p-8 rounded-2xl max-w-lg">
          <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">Konfigurasi Auth0 Belum Lengkap</h2>
          <p className="text-sm text-slate-400 mt-2">
            Environment variable <code className="text-rose-300">VITE_AUTH0_DOMAIN</code> atau <code className="text-rose-300">VITE_AUTH0_CLIENT_ID</code> belum terpasang.
          </p>
        </div>
      </div>
    );
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
      <MainLayout />
    </Auth0Provider>
  );
}
