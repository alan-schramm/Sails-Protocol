// Tailwind v4 (Dependabot major-version bump, 2026-07-19) split its
// PostCSS plugin out into its own package — `tailwindcss` itself is no
// longer usable directly as a PostCSS plugin.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
}
