import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The real backend (src/main.ts) listens on 3000 (config.server.port) —
    // proxy so fetch('/api/...')/('/v1/...') calls work in dev without a
    // hardcoded absolute URL. Not wired to any real call yet in this pass
    // (everything reads mock data, see src/data/mock.ts) — this exists so
    // swapping in real @sails/sdk calls later doesn't also require touching
    // this config.
    proxy: {
      '/v1': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
    },
  },
})
