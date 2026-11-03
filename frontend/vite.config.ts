import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Laporan agen keamanan hanya disajikan oleh server dev lokal, tidak ikut build produksi.
const securityReport = (): Plugin => ({
  name: 'sapa-security-report',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__security-agent/report', (_req, res) => {
      const file = path.resolve(__dirname, '../automation/security_agent/reports/latest.json')
      if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return }
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      fs.createReadStream(file).pipe(res)
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), securityReport()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api/heroui-agent': {
        target: 'http://127.0.0.1:3101',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_API_URL || 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('zustand') || id.includes('@tanstack')) {
              return 'vendor-core';
            }
          }
        }
      }
    }
  },
})
