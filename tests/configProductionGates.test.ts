/**
 * config/index.ts — production boot gates (Missão 06.5).
 *
 * Real behavioral tests: each scenario re-requires the actual config
 * module fresh (jest.resetModules() + require('../src/config')), the
 * same env-vars-before-import discipline tests/cors.test.ts/
 * tests/rateLimit.test.ts already establish, since these guards run as
 * real top-level code at module load time — a config-shape assertion
 * would prove nothing about whether the module actually throws.
 *
 * dotenv/config is mocked out entirely so these tests never depend on
 * whatever a local, gitignored .env file happens to contain — a real
 * risk found while writing this file: this repo's own .env already sets
 * ENFORCE_CAPABILITIES=false, which would have silently masked the
 * exact "unset in production" scenario Fase 2's guard exists to catch.
 * CI (and any fresh checkout) has no .env at all, so a test that passed
 * only because of a local .env would be a false negative waiting to
 * happen the first time this ran somewhere else.
 *
 * Covers the pre-existing MOCK_ESCROW guard (RT-001) too — found during
 * Fase 1's audit to have zero test coverage before this file, despite
 * being the exact pattern the two new gates below deliberately mirror.
 */
jest.mock('dotenv/config', () => ({}))

const REQUIRED_PROD_ENV = {
  NODE_ENV: 'production',
  MOCK_ESCROW: 'false',
  ENFORCE_CAPABILITIES: 'false',
  DATABASE_URL: 'postgresql://real-host/sails_protocol',
  REDIS_URL: 'redis://real-host:6379',
}

describe('config/index.ts — production boot gates (Missão 06.5)', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = {}
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  function loadConfig(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    return () => require('../src/config').config
  }

  describe('MOCK_ESCROW (RT-001, pre-existing — newly covered here)', () => {
    it('refuses to boot in production when MOCK_ESCROW is unset', () => {
      const load = loadConfig({ ...REQUIRED_PROD_ENV, MOCK_ESCROW: undefined })
      expect(load).toThrow(/MOCK_ESCROW/)
    })

    it('refuses to boot in production when MOCK_ESCROW=true', () => {
      const load = loadConfig({ ...REQUIRED_PROD_ENV, MOCK_ESCROW: 'true' })
      expect(load).toThrow(/MOCK_ESCROW/)
    })

    it('boots in production when MOCK_ESCROW=false explicitly', () => {
      const load = loadConfig(REQUIRED_PROD_ENV)
      expect(load).not.toThrow()
    })

    it('boots in development regardless of MOCK_ESCROW', () => {
      const load = loadConfig({ NODE_ENV: 'development', DATABASE_URL: undefined, REDIS_URL: undefined, ENFORCE_CAPABILITIES: undefined, MOCK_ESCROW: undefined })
      expect(load).not.toThrow()
    })
  })

  describe('ENFORCE_CAPABILITIES gate (Missão 06.5)', () => {
    it('refuses to boot in production when ENFORCE_CAPABILITIES is unset', () => {
      const load = loadConfig({ ...REQUIRED_PROD_ENV, ENFORCE_CAPABILITIES: undefined })
      expect(load).toThrow(/ENFORCE_CAPABILITIES/)
    })

    it('boots in production when ENFORCE_CAPABILITIES=false explicitly — this mission does not mandate enforcement on', () => {
      const load = loadConfig({ ...REQUIRED_PROD_ENV, ENFORCE_CAPABILITIES: 'false' })
      expect(load).not.toThrow()
      expect(load().features.enforceCapabilities).toBe(false)
    })

    it('boots in production when ENFORCE_CAPABILITIES=true explicitly', () => {
      const load = loadConfig({ ...REQUIRED_PROD_ENV, ENFORCE_CAPABILITIES: 'true' })
      expect(load).not.toThrow()
      expect(load().features.enforceCapabilities).toBe(true)
    })

    it('boots in development with ENFORCE_CAPABILITIES unset — preserves today\'s dev/test ergonomics', () => {
      const load = loadConfig({ NODE_ENV: 'development', DATABASE_URL: undefined, REDIS_URL: undefined, ENFORCE_CAPABILITIES: undefined, MOCK_ESCROW: undefined })
      expect(load).not.toThrow()
      expect(load().features.enforceCapabilities).toBe(false)
    })

    it('boots in test (NODE_ENV=test, Jest\'s own default) with ENFORCE_CAPABILITIES unset', () => {
      const load = loadConfig({ NODE_ENV: 'test', DATABASE_URL: undefined, REDIS_URL: undefined, ENFORCE_CAPABILITIES: undefined, MOCK_ESCROW: undefined })
      expect(load).not.toThrow()
    })
  })

  describe('DATABASE_URL gate (Missão 06.5)', () => {
    it('refuses to boot in production when DATABASE_URL is unset — no silent localhost fallback', () => {
      const load = loadConfig({ ...REQUIRED_PROD_ENV, DATABASE_URL: undefined })
      expect(load).toThrow(/DATABASE_URL/)
    })

    it('boots in production when DATABASE_URL is explicitly set to a real host', () => {
      const load = loadConfig(REQUIRED_PROD_ENV)
      expect(load).not.toThrow()
      expect(load().database.url).toBe('postgresql://real-host/sails_protocol')
    })

    it('an explicit production DATABASE_URL pointing at localhost is still accepted — the gate blocks the silent FALLBACK, not a deliberate operator choice', () => {
      const load = loadConfig({ ...REQUIRED_PROD_ENV, DATABASE_URL: 'postgresql://postgres:password@localhost:5432/sails_protocol' })
      expect(load).not.toThrow()
    })

    it('development preserves the localhost/default-credential fallback when DATABASE_URL is unset', () => {
      const load = loadConfig({ NODE_ENV: 'development', DATABASE_URL: undefined, REDIS_URL: undefined, ENFORCE_CAPABILITIES: undefined, MOCK_ESCROW: undefined })
      expect(load).not.toThrow()
      expect(load().database.url).toBe('postgresql://postgres:password@localhost:5432/sails_protocol')
    })
  })

  describe('REDIS_URL gate (Missão 06.5 — same fallback pattern found alongside DATABASE_URL)', () => {
    it('refuses to boot in production when REDIS_URL is unset', () => {
      const load = loadConfig({ ...REQUIRED_PROD_ENV, REDIS_URL: undefined })
      expect(load).toThrow(/REDIS_URL/)
    })

    it('boots in production when REDIS_URL is explicitly set', () => {
      const load = loadConfig(REQUIRED_PROD_ENV)
      expect(load).not.toThrow()
      expect(load().redis.url).toBe('redis://real-host:6379')
    })

    it('development preserves the localhost fallback when REDIS_URL is unset', () => {
      const load = loadConfig({ NODE_ENV: 'development', DATABASE_URL: undefined, REDIS_URL: undefined, ENFORCE_CAPABILITIES: undefined, MOCK_ESCROW: undefined })
      expect(load).not.toThrow()
      expect(load().redis.url).toBe('redis://localhost:6379')
    })
  })

  describe('a fully correct production configuration boots cleanly', () => {
    it('every gate satisfied at once — no throw, all values reflect what was set', () => {
      const load = loadConfig(REQUIRED_PROD_ENV)
      const cfg = load()
      expect(cfg.isProduction).toBe(true)
      expect(cfg.features.mockEscrow).toBe(false)
      expect(cfg.features.enforceCapabilities).toBe(false)
      expect(cfg.database.url).toBe('postgresql://real-host/sails_protocol')
      expect(cfg.redis.url).toBe('redis://real-host:6379')
    })
  })
})
