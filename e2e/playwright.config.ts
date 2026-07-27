import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * Sails Protocol — E2E config (originally added 2026-07-20, CTO-directed
 * hardening pass: "testes E2E automatizados, prioridade máxima"; moved
 * from repo root to e2e/ and extended for Fase 3, "Testes E2E com
 * Playwright").
 *
 * `__dirname` is now `e2e/`, not the repo root — both `webServer.cwd`
 * paths below account for that (they didn't need to when this file
 * lived at the repo root).
 *
 * Prerequisites this config assumes are already running (documented in
 * HANDOFF.md, not orchestrated here): `npm run db:local:start` and
 * `npm run redis:local:start`. globalSetup below verifies both are
 * actually reachable (not just that the Node process started — see its
 * own header comment) before any spec runs.
 */
const repoRoot = path.resolve(__dirname, '..')

export default defineConfig({
  testDir: '.',
  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),
  fullyParallel: false, // several flows drive two real identities against one shared backend — order matters, no benefit to parallelizing within a run
  // Real finding from running this suite: 2 default workers running
  // different PROJECTS concurrently (e.g. webkit + mobile-safari at the
  // same time) caused one real browser context to be torn down mid-test
  // ("Target page, context or browser has been closed") — reproduced
  // once, gone when re-run alone. Forcing a single worker trades some
  // wall-clock time for not fighting itself over one shared real
  // backend + one real rate limiter, consistent with `fullyParallel:
  // false`'s own reasoning above.
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // chromium runs the full functional suite (every flow) — the
    // primary coverage. The other 4 browser engines only re-run the
    // one cross-browser-sensitive smoke path (a real UI compatibility
    // check), not the entire flows/ directory: several of those specs
    // mutate real shared backend state and/or hit RT-002's real rate
    // limiter (see webServer's own comment below) — running all of them
    // 5x across 5 engines would multiply that load for no proportional
    // benefit, since concurrency.spec.ts/timeout-flow.spec.ts exercise
    // pure API/DB behavior with zero browser-rendering surface anyway.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testDir: './flows' },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testDir: './flows', testMatch: 'p2p-trade-happy-path.spec.ts' },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testDir: './flows', testMatch: 'p2p-trade-happy-path.spec.ts' },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] }, testDir: './flows', testMatch: 'p2p-trade-happy-path.spec.ts' },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] }, testDir: './flows', testMatch: 'p2p-trade-happy-path.spec.ts' },
    { name: 'accessibility', use: { ...devices['Desktop Chrome'] }, testDir: './accessibility' },
    { name: 'visual', use: { ...devices['Desktop Chrome'] }, testDir: './visual' },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: repoRoot,
      url: 'http://localhost:3000/health',
      reuseExistingServer: true,
      timeout: 30_000,
      // Real finding from first running this spec (docs/TODO.md §22):
      // RT-002's real rate limiter (10 auth-tier requests/min/IP by
      // default) is tight enough that a full run across every project
      // below — several real identities each re-authenticating on every
      // full page reload — legitimately exceeds it. Raised here, for e2e
      // runs specifically, not as a change to the app's real defaults
      // (`src/config/index.ts` still defaults to 10/100 unless
      // overridden).
      // TRUSTED_ARBITRATORS: dispute.routes.ts throws ValidationError
      // ("No trusted arbitrators configured") on every real dispute
      // open/resolve call unless this is set (RFC-007 D4 — empty by
      // default so a reference deployment with no disputes yet still
      // boots). dispute-flow.spec.ts only opens disputes, never resolves
      // one, so this placeholder id never needs to be a real
      // authenticated participant.
      env: { RATE_LIMIT_AUTH_MAX: '500', RATE_LIMIT_MAX: '2000', TRUSTED_ARBITRATORS: 'e2e-test-arbiter' },
    },
    {
      command: 'npm run dev',
      cwd: path.join(repoRoot, 'packages', 'sails-ui'),
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
