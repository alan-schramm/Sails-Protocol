import { defineConfig, devices } from '@playwright/test'

/**
 * Sails Protocol — E2E config (added 2026-07-20, CTO-directed hardening
 * pass: "testes E2E automatizados, prioridade máxima").
 *
 * Prerequisites this config assumes are already running (documented in
 * HANDOFF.md, not orchestrated here — same reasoning `docs/TODO.md` §18
 * already gives for keeping DB startup a separate, explicit step rather
 * than folding it into a test runner's own lifecycle):
 *   npm run db:local:start
 *   npm run redis:local:start
 *
 * The two `webServer` entries below start the real backend and the real
 * UI dev server if they aren't already running (`reuseExistingServer`
 * skips relaunching them in local dev, where they're often already up —
 * always fresh-started in CI). Every request in these specs goes through
 * the real HTTP/WS stack — no mocked fetch, no mocked WebSocket, the
 * same discipline `tests/fullTradeLifecycle.test.ts` established for the
 * service layer, extended here to the actual browser + real network.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // golden-path spec drives two real identities against one shared backend — order matters, no benefit to parallelizing within a single run
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: __dirname,
      url: 'http://localhost:3000/health',
      reuseExistingServer: true,
      timeout: 30_000,
      // Real finding from first running this spec (docs/TODO.md §22):
      // RT-002's real rate limiter (10 auth-tier requests/min/IP by
      // default) is tight enough that one full golden-path run — two
      // real identities, each re-authenticating on every full page
      // reload, amplified by React StrictMode double-invoking effects
      // in dev mode — legitimately exceeds it, turning a passing run
      // into a 429 a couple of runs later. Raised here, for e2e runs
      // specifically, not as a change to the app's real defaults
      // (`src/config/index.ts` still defaults to 10/100 unless
      // overridden) — this is the correct place for that override, the
      // same way a load-testing pass would tune it for its own traffic
      // shape rather than editing the shipped default.
      env: { RATE_LIMIT_AUTH_MAX: '500', RATE_LIMIT_MAX: '2000' },
    },
    {
      command: 'npm run dev',
      cwd: `${__dirname}/packages/sails-ui`,
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
