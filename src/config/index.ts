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

  // THREAT_MODEL.md — "no rate limiting exists anywhere" was an explicit,
  // named unmitigated gap (Low severity, becomes higher at scale) until
  // this pass. Two tiers: a general per-IP ceiling for every route, and a
  // much tighter one for the identity challenge/authenticate routes
  // specifically (RED_TEAM_REVIEW.md RT-002's own "this is the field that
  // matters most" — those two routes are what a credential-stuffing/
  // brute-force attempt would actually hit).
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX ?? '10', 10),
    authTimeWindow: process.env.RATE_LIMIT_AUTH_WINDOW ?? '1 minute',
  },

  features: {
    // RED_TEAM_REVIEW.md RT-001: this is the single most important line
    // in this file. Left true, "escrow" is theater — see escrow.service.ts.
    mockEscrow: process.env.MOCK_ESCROW !== 'false',
    mockSettlement: process.env.MOCK_SETTLEMENT !== 'false',
    // Gates common/events/handlers.ts's reaction to openp2p.trade.created,
    // which calls settlement-orchestrator.ts's executeSettlement() —
    // creates escrow, locks funds, and (once PIX is emulated as received)
    // releases a real signed WDK transfer, with no human/dispute-window
    // step in between. Default false deliberately: openp2p.trade.created
    // fires for every real HTTP-driven trade in this codebase, not only
    // agent-driven demo trades, so auto-firing full fund release
    // unconditionally the instant two parties match would silently bypass
    // the negotiation/dispute-window design (Escrow.timelockHours) this
    // protocol otherwise relies on. Same "off by default, explicit opt-in"
    // shape as mockEscrow/mockSettlement above, for the same reason:
    // moving funds automatically is not a safe default.
    autoSettleOnMatch: process.env.AUTO_SETTLE_ON_MATCH === 'true',
    // RFC-014: capability-registry.ts (real since RFC-013) had zero real
    // callers anywhere in the money-moving path — a working permission
    // system nothing ever consults. This flag turns on the two real
    // enforcement points RFC-014 adds (intentEngine.create() for
    // TradeIntent, executeSettlement() before the USDT release). Default
    // false for the same reason autoSettleOnMatch is: a reference
    // deployment with no CapabilityGrants issued yet is a valid,
    // pre-existing state (every test/demo in this repo runs with none
    // issued) — flipping this to true with no grants issued would reject
    // every TradeIntent and settlement, not fail safe silently.
    enforceCapabilities: process.env.ENFORCE_CAPABILITIES === 'true',
    // RFC-015: application-layer two-person control on escrow.service.ts's
    // releaseFunds() — NOT on-chain multisig (WDK's real package is
    // single-owner only, checked before choosing this design). When on,
    // the normal (non-disputed) release path requires both of the
    // trade's own two counterparties (Trade.buyerId, Trade.sellerId) to
    // have separately called POST /v1/settlement/escrow/:id/approve-release
    // first. Default false for the same reason every other
    // behavior-changing flag in this file is: turning it on changes the
    // required calling pattern (the atomic executeSettlement() convenience
    // function will start failing at its release step, by design, since
    // no approval can exist yet within that same synchronous call — see
    // RFC-015's Alternatives Considered). Arbitrated releases
    // (Escrow.status === 'DISPUTED') always bypass this check, regardless
    // of this flag — a dispute existing already means the two-party
    // agreement this control is meant to enforce didn't happen.
    requireDualApprovalForRelease: process.env.REQUIRE_DUAL_APPROVAL_RELEASE === 'true',
    // RFC-017: SocialEngineeringAgent (RFC-007 D7) calls QVAC on every
    // chat message sent through openp2p.message.sent — a real local-LLM
    // call per message, not free. Default false for cost/latency, the
    // same reason autoSettleOnMatch/enforceCapabilities/
    // requireDualApprovalForRelease all default false: a reference
    // deployment that hasn't opted in should not pay for or wait on a
    // local model call on every single chat message.
    socialEngineeringDetection: process.env.SOCIAL_ENGINEERING_DETECTION === 'true',
  },

  trade: {
    defaultTimelockHours: parseInt(process.env.DEFAULT_TIMELOCK_HOURS ?? '24', 10),
  },

  // Sails OpenProof (proof.service.ts) — Fase 1 Task 3(c). Evidence
  // submitted long after the Claim it supports is worth less as proof of
  // anything that happened *at the claimed time*, the same reasoning
  // escrow.timelockHours already applies to fund locks. Verification
  // nonces follow auth.ts's challenge-response TTL pattern exactly.
  proof: {
    submissionWindowHours: parseInt(process.env.PROOF_SUBMISSION_WINDOW_HOURS ?? '72', 10),
    verificationNonceTtlSeconds: parseInt(process.env.PROOF_VERIFICATION_NONCE_TTL ?? '300', 10),
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

  // WDK_USDT_EVM SettlementProvider (wdk-settlement.provider.ts) — real
  // @tetherto/wdk-wallet-evm calls against a public EVM testnet. Empty
  // seed phrase by default, same "surface a clear config error, don't
  // refuse to boot" pattern as settlement.trustedArbitrators above.
  // Sepolia + a placeholder token address are safe, inert defaults — the
  // provider still requires an explicit funded seed before it will send
  // a real (testnet) transaction.
  wdk: {
    seedPhrase: process.env.WDK_SEED_PHRASE ?? '',
    rpcUrl: process.env.WDK_RPC_URL ?? 'https://sepolia.drpc.org',
    usdtContract: process.env.WDK_USDT_CONTRACT ?? '',
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
