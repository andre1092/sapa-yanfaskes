import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import './index.css'
import { BerryThemeProvider } from './berry/BerryThemeProvider'
import App from './App.tsx'
import { AuthSessionProvider } from './auth/AuthSessionProvider'
import { useThemeStore } from './store/themeStore.ts'
import { VerifikasiManusia } from './components/VerifikasiManusia'
import { HalamanSiapkanAkun } from './components/HalamanSiapkanAkun'
import { diHalamanSiapkanAkun } from './lib/halamanAwal'

// Log aktivitas contoh dari versi lama dibuang dari penyimpanan browser.
try {
  localStorage.removeItem('sapa-audit-logs');
} catch {
  // Penyimpanan browser tidak tersedia.
}

// Inisialisasi preferensi tema (Light/Dark/System)
useThemeStore.getState().initTheme()

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* /verifikasi dibuka di tengah login Auth0, sebelum ada sesi SAPA: tanpa AuthSessionProvider,
          supaya tidak memicu silent auth yang akan ditolak Action. /siapkan-akun (akun lokal) juga dibuka
          tanpa sesi; halaman itu sendiri menanyakan ke server apakah penyiapan tersedia. */}
      <BerryThemeProvider>{window.location.pathname === '/verifikasi' ? <VerifikasiManusia />
        : diHalamanSiapkanAkun(window.location.pathname) ? <HalamanSiapkanAkun />
        : <AuthSessionProvider><App /></AuthSessionProvider>}</BerryThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
