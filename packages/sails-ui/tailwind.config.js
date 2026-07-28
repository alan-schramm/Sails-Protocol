// Satsails brand identity (2026-07-18): black + orange, both a dark and
// a light theme, orange constant across both — matches the pasted
// design brief's own palette (WDK-inspired dark surfaces, Binance
// P2P-inspired information density), with a light counterpart added
// since the light theme wasn't in the original brief. Values are CSS
// custom properties defined in src/index.css's `:root`/`.dark` blocks,
// not hardcoded here, so a future white-label partner (docs/TODO.md's
// "roupagem" plan) swaps one file, not every component. Vars are stored
// as "R G B" triplets (not hex) specifically so Tailwind's opacity
// modifier syntax (`bg-brand-orange/15`, `border-brand-orange/25`)
// works — found while building this: a plain `var(--x)` string doesn't
// support `<alpha-value>` substitution, `rgb(var(--x) / <alpha-value>)`
// does.
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-surface) / <alpha-value>)',
          elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          'border-hover': 'rgb(var(--color-border-hover) / <alpha-value>)',
          text: 'rgb(var(--color-text) / <alpha-value>)',
          'text-secondary': 'rgb(var(--color-text-secondary) / <alpha-value>)',
          'text-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
          orange: 'rgb(var(--color-orange) / <alpha-value>)',
          'orange-hover': 'rgb(var(--color-orange-hover) / <alpha-value>)',
          // Separate from `orange` above: that token is contrast-locked for
          // white-text-on-orange (buttons) in both themes. This one is for
          // orange-as-text/icon/accent on a brand SURFACE (never behind
          // white body text), so dark mode can use the fuller vibrant hue
          // — see src/index.css's own comment on `--color-orange-accent`.
          'orange-accent': 'rgb(var(--color-orange-accent) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Display face for headlines/wordmark only — body text stays on
        // the fast, dense-legible system stack (see index.css's `body`
        // rule); this is the one place asked to carry brand personality.
        display: ['"Space Grotesk"', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
