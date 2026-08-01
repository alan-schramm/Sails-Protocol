import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    // Real bug found while getting a browser to actually render this
    // app (not caught by `tsc`/`vite build` — a pure runtime error):
    // bitcoinjs-lib/@bitcoinerlab's ECC init path
    // (escrow-key.ts's `bitcoin.initEccLib(ecc)`, run at module load,
    // reachable from every page via @sails/sdk's eager optimizeDeps
    // bundle below) calls into Node's global `Buffer`, which doesn't
    // exist in a browser and isn't polyfilled by Vite/esbuild
    // automatically (unlike Webpack). Uncaught, this crashes the whole
    // React tree with no console output beyond a raw `pageerror` — the
    // entire app rendered a permanently empty `#root` on every single
    // page, not just Trade (where the escrow-key code is actually
    // used). Scoped to just `Buffer` (the one global actually missing)
    // rather than this plugin's default full Node-globals shim.
    nodePolyfills({ globals: { Buffer: true, global: false, process: false } }),
  ],
  resolve: {
    alias: {
      // shadcn/ui convention — matches the tsconfig.json "@/*" path so
      // both the type-checker and the actual dev-server/build resolve
      // the same way (tsconfig "paths" alone only affects tsc, not Vite).
      '@': path.resolve(__dirname, './src'),
      // Real, pre-existing bug (unrelated to any UI work) found while
      // trying to start this dev server: @sails/sdk's escrow-key.ts
      // imports '@noble/curves/secp256k1' (extensionless) and is
      // deliberately pinned to @noble/curves@1.2.0 (see that file's own
      // header comment — 2.x lacks a real CJS entry for this subpath).
      // A different transitive dependency chain (@arkade-os/sdk ->
      // @bitcoinerlab/descriptors-scure) needs @noble/curves@2.2.0, and
      // npm's hoisting nests THAT version directly at
      // packages/sails-sdk/node_modules — shadowing the intended 1.2.0
      // for every resolution rooted there (`npm ls @noble/curves` flags
      // this nested copy as literally invalid: doesn't satisfy
      // sails-sdk's own declared ^1.2.0). Vite's dev-server dependency
      // optimizer eagerly pre-bundles all of @sails/sdk's compiled dist
      // (which keeps this import external, unresolved, exactly as
      // written) and fails hard on it; `vite build` doesn't hit this
      // because Rollup tree-shakes escrow-key.ts away when no visited
      // page uses it. Fixing this at the root (npm overrides) touches
      // the whole workspace's lockfile and collides with an unrelated,
      // in-progress `contracts` workspace's own peer-dependency
      // conflict — out of scope here. This alias forces the one
      // specifier back to the version this repo actually intended,
      // without touching any shared dependency file.
      '@noble/curves/secp256k1': path.resolve(__dirname, '../../node_modules/@noble/curves/secp256k1.js'),
    },
  },
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
    // Falls back to 5173 for a plain `npm run dev -w @sails/ui` (no env
    // set) — reads PORT when set so multiple concurrent instances of
    // this same dev server (e.g. two Claude Code sessions on this repo)
    // don't collide on a hardcoded port.
    port: Number(process.env.PORT) || 5173,
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
