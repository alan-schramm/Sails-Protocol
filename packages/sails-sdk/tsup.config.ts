import { defineConfig } from 'tsup'

// Dual CJS/ESM build — closes the gap TECHNICAL_WHITEPAPER.md disclosed
// ("The SDK ships CommonJS only... A bundler cannot meaningfully
// tree-shake a CommonJS-only package"). `main`/`types` keep pointing at
// the same `dist/index.js`/`dist/index.d.ts` this package always shipped
// (tsup names the ESM output `.mjs` when both formats are requested and
// no `"type": "module"` is set here, so the CJS file's name and
// resolution don't change) — this is additive packaging, not a change
// to the frozen v1.0.0-rc1 public API surface (docs/API_STABLE.md).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  target: 'es2020',
  splitting: false,
})
