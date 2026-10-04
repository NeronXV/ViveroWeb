import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { backendProxyTarget } from './backend-proxy'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '^/api/v1(?:/|$)': {
        target: backendProxyTarget(loadEnv(mode, '.', 'BACKEND_PROXY_TARGET').BACKEND_PROXY_TARGET),
        changeOrigin: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@supabase/')) return 'supabase'
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router')) return 'react-vendor'
        },
      },
    },
  },
}))
