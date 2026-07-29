// Tailwind v4's real setup — a separate `@tailwindcss/postcss` plugin
// package (v4 dropped the old `tailwindcss` package's own PostCSS-plugin
// role), configured entirely via CSS `@import "tailwindcss"` in
// src/app/globals.css, not a JS tailwind.config.js content-globs file —
// confirmed against the installed `@tailwindcss/postcss@4.3.3` before
// writing this, not assumed from v3-era memory.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
