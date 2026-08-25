import React, { Suspense, useEffect, useState } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { useDashboardData } from './hooks/useDashboardData';
import { apiClient } from './lib/apiClient';
import { resilientLazy } from './lib/resilientLazy';
import { useChartPrefetch } from './hooks/useChartPrefetch';
import { ChartSkeleton } from './components/ChartSkeleton';

const LazyModularPlot = resilientLazy(() =>
  import(/* webpackChunkName: "vendor-plotly", webpackPrefetch: true */ './components/ModularPlot')
);

// --- Auth0 Config ---
const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN || "";
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID || "";
const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE || "";

function Dashboard() {
  const { getAccessTokenSilently } = useAuth0();
  const [authHeaderReady, setAuthHeaderReady] = useState(false);

  useEffect(() => {
    // Intercept API calls to attach Auth0 Access Token
    const interceptor = apiClient.interceptors.request.use(async (config) => {
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: AUTH0_AUDIENCE,
          }
        });
        config.headers.Authorization = `Bearer ${token}`;
      } catch (e) {
        console.error("Auth0 Token Error", e);
      }
      return config;
    });
    
    setAuthHeaderReady(true);
    return () => apiClient.interceptors.request.eject(interceptor);
  }, [getAccessTokenSilently]);

  const { data, isLoading, error } = useDashboardData(authHeaderReady);
  const trendPrefetchRef = useChartPrefetch(300);
  const faskesPrefetchRef = useChartPrefetch(300);

  if (!authHeaderReady || isLoading) return <div className="flex items-center justify-center h-screen bg-slate-900 text-cyan-400">Loading Dashboard Data...</div>;
  if (error) return <div className="flex items-center justify-center h-screen bg-slate-900 text-red-400">Error loading data.</div>;
  if (!data) return null;

  return (
    <div className="p-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-6 rounded-2xl shadow-xl">
          <h3 className="text-slate-400 text-sm font-medium">Total Records</h3>
          <p className="text-3xl font-bold text-white mt-2">{data.total_records.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-6 rounded-2xl shadow-xl">
          <h3 className="text-slate-400 text-sm font-medium">Capaian Nasional</h3>
          <p className="text-3xl font-bold text-cyan-400 mt-2">{data.overall_avg_capaian}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div 
          ref={trendPrefetchRef}
          className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-4 rounded-2xl shadow-xl min-h-[400px]"
        >
          <h3 className="text-lg font-semibold text-white mb-4 ml-2">Tren Pemanfaatan per Bulan</h3>
          <Suspense fallback={<ChartSkeleton height={350} />}>
            <LazyModularPlot data={data} type="trend" />
          </Suspense>
        </div>

        <div 
          ref={faskesPrefetchRef}
          className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-4 rounded-2xl shadow-xl min-h-[400px]"
        >
          <h3 className="text-lg font-semibold text-white mb-4 ml-2">Top 10 Faskes (Capaian Tertinggi)</h3>
          <Suspense fallback={<ChartSkeleton height={350} />}>
            <LazyModularPlot data={data} type="bar" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, user } = useAuth0();

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-950 text-cyan-400 font-medium">Authenticating Securely...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="bg-slate-900 p-10 rounded-3xl shadow-2xl border border-slate-800 text-center max-w-md w-full">
          <div className="w-16 h-16 mx-auto bg-cyan-900/50 rounded-2xl border border-cyan-500/30 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">SAPA YANFASKES</h1>
          <p className="text-slate-400 text-sm mb-8">Federated Identity Gateway</p>
          
          <button 
            onClick={() => loginWithRedirect()}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl px-4 py-4 transition-all shadow-lg hover:shadow-cyan-500/25"
          >
            Continue with Single Sign-On (SSO)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <span className="text-slate-900 font-bold text-xs">SY</span>
              </div>
              <span className="font-bold text-xl tracking-tight text-white">SAPA <span className="text-cyan-400">Enterprise</span></span>
            </div>
            
            <div className="flex items-center gap-6">
              <span className="text-sm font-medium text-slate-300 hidden md:block">
                {user?.email}
              </span>
              <button 
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                className="text-sm px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>
      
      <main className="max-w-7xl mx-auto">
        <Dashboard />
      </main>
    </div>
  );
}

export default function App() {
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
    return <div className="text-red-500 p-8 text-center bg-slate-950 min-h-screen">Misconfiguration: Missing Auth0 Environment Variables (VITE_AUTH0_DOMAIN or VITE_AUTH0_CLIENT_ID)</div>;
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
      <MainApp />
    </Auth0Provider>
  );
}
