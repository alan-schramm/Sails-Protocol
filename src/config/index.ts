/**
 * Config — Sails Protocol reference implementation
 * The first bootstrap file (TODO.md §2 "Immediate Priority").
 * Every other file that imports 'config' depends on this existing.
 */
import 'dotenv/config'

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (v === undefined) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return v
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Matches what app.ts (the pre-existing Fastify bootstrap) actually
  // reads — found via a real `tsc --noEmit` run, not assumed.
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    host: process.env.HOST ?? '0.0.0.0',
    env: process.env.NODE_ENV ?? 'development',
    logLevel: process.env.LOG_LEVEL ?? 'info',
  },

  server: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    host: process.env.HOST ?? '0.0.0.0',
  },

  database: {
    url: required('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/sails_protocol'),
  },

  redis: {
    url: required('REDIS_URL', 'redis://localhost:6379'),
  },

  auth: {
    // RED_TEAM_REVIEW.md RT-002: this is the field that matters most in
    // this whole file. Challenge tokens expire fast on purpose.
    challengeTtlSeconds: parseInt(process.env.AUTH_CHALLENGE_TTL ?? '120', 10),
    sessionTtlSeconds: parseInt(process.env.AUTH_SESSION_TTL ?? '3600', 10),
  },

  pear: {
    bootstrapNodes: (process.env.HYPERDHT_BOOTSTRAP ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  },

  features: {
    // RED_TEAM_REVIEW.md RT-001: this is the single most important line
    // in this file. Left true, "escrow" is theater — see escrow.service.ts.
    mockEscrow: process.env.MOCK_ESCROW !== 'false',
    mockSettlement: process.env.MOCK_SETTLEMENT !== 'false',
  },

  trade: {
    defaultTimelockHours: parseInt(process.env.DEFAULT_TIMELOCK_HOURS ?? '24', 10),
  },

  settlement: {
    // RFC-007 D4 — "each wallet/application registers its own Trusted
    // Arbitrators," not a protocol-wide list. Empty by default — dispute
    // routes surface a clear config error rather than the app refusing to
    // boot, since a reference deployment with no disputes yet is valid.
    trustedArbitrators: (process.env.TRUSTED_ARBITRATORS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
}

// RT-001's fix, made structural instead of relying on someone remembering
// to check .env before deploying: refuse to boot with mock settlement in
// production. This is not a warning — it is a hard stop.
if (config.isProduction && config.features.mockEscrow) {
  throw new Error(
    'FATAL: NODE_ENV=production but MOCK_ESCROW is not explicitly false. ' +
    'Refusing to boot — see RED_TEAM_REVIEW.md RT-001. Set MOCK_ESCROW=false ' +
    'in your production environment once a real SettlementProvider is wired in.'
  )
}
