import { defineConfig } from 'tsup'

// Same dual CJS/ESM shape as @satsails/p2p-trading-sdk's own tsup.config.ts — see that
// file's comment for why the CJS output keeps the `main`/`types`
// filenames this package.json declares. `react`/`react-dom`/`@satsails/p2p-trading-sdk`
// stay external (peer/regular deps, never bundled) so a consuming app
// doesn't get a second React copy or a second @satsails/p2p-trading-sdk instance.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  target: 'es2020',
  splitting: false,
  external: ['react', 'react-dom', '@satsails/p2p-trading-sdk', '@tanstack/react-query'],
})
