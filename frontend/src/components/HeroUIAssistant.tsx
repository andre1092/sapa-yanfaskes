import { useCallback, useEffect, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { HeroUIAgent, createToolHelper, useAgent, type GetAuthToken } from '@heroui/agent';
import { z } from '@heroui/agent/zod';
import { useMediaQuery, useTheme } from '@mui/material';
import { useAuthStore } from '../store/authStore';
import { resolveAssistantReport } from '../lib/assistantNavigation';
import { getSessionToken } from '../auth/session';

type AssistantContext = {
  openReport: (report: unknown) => Promise<{ path: string; label: string }>;
  page: () => { route: string };
};

const tool = createToolHelper<AssistantContext>();
const tools = [tool({
  name: 'open_sapa_report',
  displayName: 'Buka laporan SAPA',
  description: 'Membuka laporan SAPA pilihan pengguna: kepatuhan FKRTL, antrean online FKRTL, kepatuhan FKTP, atau monitoring LARAS. Tidak membaca data pasien atau mengubah data.',
  icon: 'navigate',
  parameters: z.object({ report: z.enum(['kepatuhan_fkrtl', 'antrol_fkrtl', 'kepatuhan_fktp', 'monitoring_laras']) }),
  execute: ({ report }, context) => context.openReport(report),
})];

/** Mounted within the Auth0 session; the workspace key stays on the server. */
export function HeroUIAssistant({ onNavigate }: { onNavigate: (menu: string) => void }) {
  const agentId = import.meta.env.VITE_HEROUI_AGENT_ID?.trim();
  if (!agentId) return null;
  return <ConnectedAssistant agentId={agentId} onNavigate={onNavigate} />;
}

function ConnectedAssistant({ agentId, onNavigate }: { agentId: string; onNavigate: (menu: string) => void }) {
  const { getAccessTokenSilently } = useAuth0();
  const { shutdown } = useAgent(agentId);
  const theme = useTheme();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const getAuthToken = useCallback<GetAuthToken>(async ({ agentId: requestedAgentId, signal }) => {
    const accessToken = await getAccessTokenSilently();
    const response = await fetch('/api/heroui-agent/auth-token', {
      method: 'POST', signal, credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ agentId: requestedAgentId }),
    });
    if (!response.ok) {
      throw new Error(response.status === 401
        ? 'Sesi SAPA berakhir. Silakan masuk kembali.'
        : response.status === 429
          ? 'Asisten sedang menerima banyak permintaan. Coba kembali sebentar lagi.'
          : 'Asisten belum dapat terhubung. Silakan coba kembali.');
    }
    const credential: unknown = await response.json();
    if (!credential || typeof credential !== 'object' || !('token' in credential) ||
      typeof credential.token !== 'string' || !credential.token || !('expiresAt' in credential) ||
      typeof credential.expiresAt !== 'number' || !Number.isFinite(credential.expiresAt) || credential.expiresAt <= Date.now()) {
      throw new Error('Kredensial asisten tidak valid. Silakan coba kembali.');
    }
    return { token: credential.token, expiresAt: credential.expiresAt };
  }, [getAccessTokenSilently]);

  useEffect(() => useAuthStore.subscribe((state, previous) => {
    if (!state.isAuthenticated || state.user?.sub !== previous.user?.sub) shutdown();
  }), [shutdown]);

  const context = useMemo<AssistantContext>(() => ({
    page: () => ({ route: window.location.pathname }),
    openReport: async (report) => {
      await getSessionToken();
      const target = resolveAssistantReport(report, useAuthStore.getState());
      onNavigate(target.menu);
      if (window.location.pathname !== target.path) throw new Error('Laporan belum terbuka. Coba kembali.');
      return { path: target.path, label: target.label };
    },
  }), [onNavigate]);

  return <HeroUIAgent
    agentId={agentId} getAuthToken={getAuthToken} context={context} tools={tools}
    locale="id" preload={false}
    appearance={{
      viewMode: 'floating', zIndex: theme.zIndex.drawer + 1,
      theme: {
        colorScheme: theme.palette.mode, radius: 'soft',
        typography: { fontFamily: theme.typography.fontFamily },
        colors: {
          accent: theme.palette.primary.main, background: theme.palette.background.paper,
          foreground: theme.palette.text.primary, surface: theme.palette.background.paper,
          surfaceSecondary: theme.palette.background.default, overlay: theme.palette.background.paper,
        },
      },
      panel: { mobile: { presentation: 'fullscreen' } },
    }}
    markdown={{ animated: !reducedMotion, caret: reducedMotion ? false : 'block' }}
    composer={{ attachments: false, dictation: false, placeholder: 'Tanyakan panduan atau buka laporan…' }}
    permissions={{ defaultMode: 'auto', showPicker: false }}
  />;
}
