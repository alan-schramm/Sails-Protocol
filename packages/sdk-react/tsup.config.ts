import { defineConfig } from 'tsup'

// Same dual CJS/ESM shape as @sails/sdk's own tsup.config.ts — see that
// file's comment for why the CJS output keeps the `main`/`types`
// filenames this package.json declares. `react`/`react-dom`/`@sails/sdk`
// stay external (peer/regular deps, never bundled) so a consuming app
// doesn't get a second React copy or a second @sails/sdk instance.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  target: 'es2020',
  splitting: false,
  external: ['react', 'react-dom', '@sails/sdk', '@tanstack/react-query'],
})
