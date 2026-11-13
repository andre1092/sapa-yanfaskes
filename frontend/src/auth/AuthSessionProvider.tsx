import { useEffect, useState, type ReactNode } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { useAuthStore } from '../store/authStore';
import { mapAuth0User, registerAuthSession, safeReturnTo } from './session';
import { alamatSetelahMasuk } from '../lib/halamanAwal';

import { Context } from './useSession';

function SessionBridge({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user, error, loginWithRedirect, getAccessTokenSilently, logout } = useAuth0();
  const [loginError, setLoginError] = useState<string | null>(null);
  useEffect(() => {
    const mappedUser = !isLoading && isAuthenticated && user ? mapAuth0User(user, import.meta.env.VITE_AUTH0_ROLES_CLAIM || 'https://sapa-yanfaskes.com/roles') : null;
    useAuthStore.getState().syncSession(mappedUser);
    if (!mappedUser) return;
    return registerAuthSession(() => getAccessTokenSilently(), () => {
      void logout({ logoutParams: { returnTo: window.location.origin } }).catch(() => {
        setLoginError('Gagal mengakhiri sesi. Coba masuk lalu keluar kembali.');
      });
    });
  }, [isLoading, isAuthenticated, user, getAccessTokenSilently, logout]);
  const login = async () => {
    setLoginError(null);
    try {
      await loginWithRedirect({ appState: { returnTo: safeReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`) } });
    } catch { setLoginError('Tidak dapat membuka layanan masuk. Periksa koneksi lalu coba kembali.'); }
  };
  return <Context.Provider value={{ ready: !isLoading, authenticated: isAuthenticated && Boolean(user?.sub), configured: true, error: loginError || (error ? 'Sesi masuk tidak dapat diverifikasi. Silakan coba masuk kembali.' : null), login }}>{children}</Context.Provider>;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN?.trim();
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID?.trim();
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE?.trim();
  useEffect(() => {
    try { localStorage.removeItem('auth-session'); } catch { /* Storage may be disabled; legacy state is never restored. */ }
  }, []);
  if (!domain || !clientId || !audience) return <Context.Provider value={{ ready: true, authenticated: false, configured: false, error: 'Layanan masuk belum dikonfigurasi. Hubungi administrator SAPA.', login: async () => {} }}>{children}</Context.Provider>;
  return <Auth0Provider domain={domain} clientId={clientId} cacheLocation="memory" authorizationParams={{ redirect_uri: window.location.origin, audience, scope: 'openid profile email' }} onRedirectCallback={state => {
    window.history.replaceState({}, document.title, alamatSetelahMasuk(safeReturnTo(state?.returnTo)));
  }}><SessionBridge>{children}</SessionBridge></Auth0Provider>;
}
