import { defineConfig } from 'tsup'

// Dual CJS/ESM build — same reason and same config shape as
// @satsails/p2p-trading-sdk's own tsup.config.ts (PRODUCTION_READINESS_FIXES.md item
// 5, closed 2026-08-08): a bundler can't meaningfully tree-shake a
// CommonJS-only package. `main`/`types` keep pointing at
// `dist/index.js`/`dist/index.d.ts`, same as before this migration —
// additive packaging, not a change to what this package exports.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  target: 'es2020',
  splitting: false,
})
