import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // @sails/sdk (packages/sails-sdk) compiles to CommonJS (dist/index.js)
  // — fine for its Node-side consumers (tests, demo scripts), but Vite
  // resolves this npm-workspace-linked package through its real
  // filesystem path (@fs/.../packages/sails-sdk/dist/index.js) rather
  // than treating it as a node_modules dependency, which skips the
  // esbuild CJS->ESM pre-bundling step every other CJS dependency gets
  // automatically — the browser's native ESM loader then can't find
  // named exports like `SailsClient` in what's actually a
  // `exports.SailsClient = ...` CJS module. Found the hard way wiring
  // the first real @sails/sdk import into this UI. optimizeDeps.include
  // forces the same esbuild pre-bundling path every other dependency
  // already gets.
  optimizeDeps: {
    include: ['@sails/sdk'],
  },
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
