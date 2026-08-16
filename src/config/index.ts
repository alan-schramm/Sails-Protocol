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

function requiredInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = parseInt(raw, 10)
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer, got: ${raw}`)
  }
  return parsed
}

// Missão 06.5 — computed once, before the object literal, so the
// database/redis fallback logic below can read it (a field can't
// reference `config.isProduction` from inside `config`'s own literal —
// it doesn't exist yet during its own construction).
const isProductionEnv = process.env.NODE_ENV === 'production'

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: isProductionEnv,

  // Matches what app.ts (the pre-existing Fastify bootstrap) actually
  // reads — found via a real `tsc --noEmit` run, not assumed.
  app: {
    port: requiredInt('PORT', 3000),
    host: process.env.HOST ?? '0.0.0.0',
    env: process.env.NODE_ENV ?? 'development',
    logLevel: process.env.LOG_LEVEL ?? 'info',
  },

  // Missão 06.5 — the `localhost`/default-credential fallback stays for
  // development/test ergonomics (unchanged local-onboarding experience,
  // same value docker-compose.yml's own `app` service still overrides
  // explicitly anyway) but is withheld in production: `required()` then
  // has no fallback to fall back to, so a production boot with no real
  // DATABASE_URL/REDIS_URL set throws immediately at config load —
  // before a single query or connection is attempted — rather than
  // silently talking to `localhost` with a well-known default password.
  // Same "structural, not someone-remembering-to-check" posture RT-001
  // (mockEscrow, below) already established for this file.
  database: {
    url: isProductionEnv
      ? required('DATABASE_URL')
      : required('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/sails_protocol'),
  },

  redis: {
    url: isProductionEnv
      ? required('REDIS_URL')
      : required('REDIS_URL', 'redis://localhost:6379'),
  },

  auth: {
    // RED_TEAM_REVIEW.md RT-002: this is the field that matters most in
    // this whole file. Challenge tokens expire fast on purpose.
    challengeTtlSeconds: requiredInt('AUTH_CHALLENGE_TTL', 120),
    sessionTtlSeconds: requiredInt('AUTH_SESSION_TTL', 3600),
    // Security review finding, 2026-08-15 (P1): chat.routes.ts/relay.routes.ts's
    // WS upgrade auth used to put the raw, long-lived session token in
    // `?token=` — logged in full by any proxy/LB (pino's own request-log
    // redact only masks named object fields, never a substring inside
    // req.url). Replaced with a single-use ticket, deliberately short-
    // lived: a ticket that leaks into a log is worthless within seconds
    // and can never be replayed a second time even before it expires.
    wsTicketTtlSeconds: requiredInt('AUTH_WS_TICKET_TTL', 30),
  },

  pear: {
    bootstrapNodes: (process.env.HYPERDHT_BOOTSTRAP ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  },

  // CTO_DUE_DILIGENCE_REPORT.md B-SEC-01, closed 2026-08-08 — `origin: true`
  // (reflect any Origin header) was a real, live gap: any site could call
  // this API using a logged-in user's own session/token. Comma-separated
  // allowlist, same `.split(',').filter(Boolean)` pattern already used for
  // `HYPERDHT_BOOTSTRAP` above. Empty by default — `app.ts` decides what an
  // empty list means per environment (permissive in dev so onboarding stays
  // `docker compose up` simple, deny-by-default in production).
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
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
    max: requiredInt('RATE_LIMIT_MAX', 100),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
    authMax: requiredInt('RATE_LIMIT_AUTH_MAX', 10),
    authTimeWindow: process.env.RATE_LIMIT_AUTH_WINDOW ?? '1 minute',
    // CTO_DUE_DILIGENCE_REPORT.md A-SEC-05, closed 2026-08-08 — the
    // global ceiling above covers every route generically, but disputes/
    // arbitration and capability revocation are real-money/real-authority
    // actions a spammer would specifically target (each dispute costs a
    // real arbiter's time; each revoke is a real authority change) —
    // tighter than the global default, looser than the auth tier (these
    // routes need `requireAuth` first, which already raises the bar).
    criticalMax: requiredInt('RATE_LIMIT_CRITICAL_MAX', 20),
    criticalTimeWindow: process.env.RATE_LIMIT_CRITICAL_WINDOW ?? '1 minute',
    // 2026-08-15 security review: the two tiers above are @fastify/rate-limit,
    // which only fires on the HTTP request/response lifecycle — a WebSocket
    // upgrade is one HTTP request, then the connection stays open and every
    // later SEND_MESSAGE arrives as a `message` frame, never a new HTTP
    // request, so neither tier ever sees it. chat.routes.ts's SEND_MESSAGE
    // handler writes to Postgres and emits an event on every call — a
    // connected client with a valid ws-ticket-derived session could otherwise
    // flood both with no ceiling at all. Same in-memory, single-instance,
    // deliberate-simplification precedent as the HTTP tiers above (no shared
    // Redis store yet); see ws-message-rate-limiter.ts.
    wsMessageMax: requiredInt('RATE_LIMIT_WS_MESSAGE_MAX', 20),
    wsMessageWindowMs: requiredInt('RATE_LIMIT_WS_MESSAGE_WINDOW_MS', 10000),
  },

  // 2026-08-15 security review — common/security/suspicious-activity.ts.
  // A volume rate limiter (the tiers above) never catches a slow, patient
  // probe; this is a separate, threshold-based detection layer, not
  // another rate limit — it never blocks anything, only logs + emits an
  // event once an identity crosses its threshold within the window. 401
  // gets the highest bar (a real user mistyping a password looks
  // identical for one or two attempts); 404 clustering (ID enumeration)
  // gets the lowest, since it's the cheapest pattern for an attacker to
  // generate. The three numbers below are reasoned starting points, not
  // measured ones — this deployment has no real production traffic yet
  // to calibrate a false-positive rate against. Env-var overridable for
  // exactly that reason: tune them once real traffic exists, don't
  // treat the defaults as validated.
  suspiciousActivity: {
    authFailureMax: requiredInt('SUSPICIOUS_AUTH_FAILURE_MAX', 8),
    authFailureWindowMs: requiredInt('SUSPICIOUS_AUTH_FAILURE_WINDOW_MS', 5 * 60 * 1000),
    notFoundClusterMax: requiredInt('SUSPICIOUS_NOT_FOUND_MAX', 15),
    notFoundClusterWindowMs: requiredInt('SUSPICIOUS_NOT_FOUND_WINDOW_MS', 5 * 60 * 1000),
    rateLimitedMax: requiredInt('SUSPICIOUS_RATE_LIMITED_MAX', 3),
    rateLimitedWindowMs: requiredInt('SUSPICIOUS_RATE_LIMITED_WINDOW_MS', 5 * 60 * 1000),
  },

  // 2026-08-15 security review — escrow-circuit-breaker.ts. Deliberately
  // scoped per-escrowId, never global: pausing the whole exchange because
  // of anomalous activity on ONE trade would turn the circuit breaker
  // itself into a denial-of-service lever (an attacker triggers a few
  // conflicts on their own trade, every other user's trading grinds to a
  // halt). Auto-resets after cooldownMs — this protocol has no
  // operator/admin tier to manually reset it (no-platform-operator-
  // visibility is a deliberate architectural choice, not an oversight),
  // so a manual-reset design would leave a tripped breaker stuck open
  // forever with nobody able to clear it. Same disclosure as
  // suspiciousActivity above: these three numbers are a reasoned
  // starting point (real concurrent conflicts on one escrow should be
  // rare in normal use — a handful per escrow's whole lifetime, not
  // per minute — so this threshold has room before it risks a false
  // trip), not something measured against real traffic.
  escrowCircuitBreaker: {
    failureThreshold: requiredInt('ESCROW_BREAKER_FAILURE_THRESHOLD', 5),
    windowMs: requiredInt('ESCROW_BREAKER_WINDOW_MS', 30 * 1000),
    cooldownMs: requiredInt('ESCROW_BREAKER_COOLDOWN_MS', 2 * 60 * 1000),
  },

  features: {
    // RED_TEAM_REVIEW.md RT-001: this is the single most important line
    // in this file. Left true, "escrow" is theater — see escrow.service.ts.
    mockEscrow: process.env.MOCK_ESCROW?.toLowerCase() !== 'false',
    mockSettlement: process.env.MOCK_SETTLEMENT?.toLowerCase() !== 'false',
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
    // BACKLOG.md P0, "Escrow timelock proactive sweeper" — was a real,
    // named gap: escrow.service.ts's lockFunds() always computed and
    // stored a real Escrow.expiresAt, but nothing ever read it back, so
    // a FUNDS_LOCKED escrow whose counterparty never returned stayed
    // locked forever. Default false for the same reason every other
    // flag in this file defaults false: no test or deployment in this
    // repo's history has ever run a background process that moves funds
    // on a timer, and turning this on is a real behavior change (an
    // abandoned trade now auto-refunds instead of staying stuck) that a
    // deployment should opt into deliberately, not inherit silently.
    escrowTimelockSweeper: process.env.ESCROW_TIMELOCK_SWEEPER === 'true',
    // RFC-021 D8 — off by default, same reasoning as escrowTimelockSweeper
    // above: a real background process applying real dispute rulings on a
    // timer is a real behavior change a deployment opts into deliberately.
    // Only meaningful when qvacAutoResolutionEnabled (settlement config,
    // below) is also true — otherwise no dispute is ever AUTO_PROPOSED for
    // this to find.
    disputeAutoResolutionSweeper: process.env.DISPUTE_AUTO_RESOLUTION_SWEEPER === 'true',
  },

  trade: {
    defaultTimelockHours: requiredInt('DEFAULT_TIMELOCK_HOURS', 24),
    // How often the sweeper above (when enabled) checks for expired
    // FUNDS_LOCKED escrows. 5 minutes by default — frequent enough that
    // a real abandoned trade doesn't sit stuck for hours, infrequent
    // enough that it's not a meaningful query load on its own.
    timelockSweepIntervalMs: requiredInt('ESCROW_TIMELOCK_SWEEP_INTERVAL_MS', 300000),
    // How often the RFC-021 D8 sweeper (when enabled) checks for
    // AUTO_PROPOSED disputes past their contest deadline. Same 5-minute
    // default as the escrow sweeper above, same reasoning.
    disputeAutoResolutionSweepIntervalMs: requiredInt('DISPUTE_AUTO_RESOLUTION_SWEEP_INTERVAL_MS', 300000),
  },

  // Sails OpenProof (proof.service.ts) — Fase 1 Task 3(c). Evidence
  // submitted long after the Claim it supports is worth less as proof of
  // anything that happened *at the claimed time*, the same reasoning
  // escrow.timelockHours already applies to fund locks. Verification
  // nonces follow auth.ts's challenge-response TTL pattern exactly.
  proof: {
    submissionWindowHours: requiredInt('PROOF_SUBMISSION_WINDOW_HOURS', 72),
    verificationNonceTtlSeconds: requiredInt('PROOF_VERIFICATION_NONCE_TTL', 300),
    // RFC-007 D2 — LocalFilesystemEvidenceProvider's storage root
    // (evidence-provider.ts). A real, working default for a single-server
    // reference deployment; a real S3/R2/IPFS EvidenceProvider is a
    // separate, still-unbuilt implementation of the same interface (see
    // that file's own header comment) for a multi-instance deployment.
    evidenceStorageDir: process.env.PROOF_EVIDENCE_STORAGE_DIR ?? './data/evidence',
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
    // RFC-021 Phase 0 — real Protocol Fee rate (PROTOCOL_ECONOMY.md §3/§6.2:
    // "Protocol Fee is OFF (0%)" is the documented bootstrap-phase default,
    // activating later "at a default of 0.40%" (revised 2026-08-11 from
    // the original 0.05%-0.15% planning range — see PROTOCOL_ECONOMY.md
    // §3/§6.2 for the competitive reasoning). Default 0 here matches the
    // bootstrap phase exactly — a deployment opts in by setting a real
    // rate, e.g. PROTOCOL_FEE_RATE=0.004 for 0.40%. escrow.service.ts's
    // releaseFunds() is the only place this is read.
    protocolFeeRate: parseFloat(process.env.PROTOCOL_FEE_RATE ?? '0'),
    // RFC-021 D2 — which ArbitrationProvider settlement.routes.ts's
    // getDisputeService() constructs. 'trusted-list' (default) preserves
    // RFC-007 D4's exact original behavior for every existing deployment;
    // 'market' opts into the new permissionless registry
    // (MarketArbitrationProvider). Not a boolean flag — a third mode
    // could exist later without a breaking rename.
    arbitrationMode: (process.env.ARBITRATION_MODE ?? 'trusted-list') as 'trusted-list' | 'market',
    // RFC-021 D8 — QVAC-assisted automated first-pass dispute resolution.
    // Off by default, same "opt-in per deployment" pattern arbitrationMode
    // itself uses — a fresh deployment keeps today's exact behavior
    // (every dispute goes straight to the assigned human arbiter) until
    // this is explicitly turned on. Payment-method-agnostic by design —
    // nothing about this config is PIX-specific or rail-specific.
    qvacAutoResolutionEnabled: process.env.QVAC_AUTO_RESOLUTION_ENABLED === 'true',
    // Only a recommendation at or above this confidence (0-1) is even
    // proposed — anything lower falls straight through to the human
    // arbiter, unchanged. Starting conservative (high bar), tunable per
    // deployment as real-world calibration data accumulates.
    qvacAutoResolutionConfidenceThreshold: parseFloat(process.env.QVAC_AUTO_RESOLUTION_CONFIDENCE_THRESHOLD ?? '0.85'),
    // How long either trade party has to contest a proposed automated
    // ruling before sweepExpiredAutoResolutions() applies it.
    qvacAutoResolutionWindowHours: parseFloat(process.env.QVAC_AUTO_RESOLUTION_WINDOW_HOURS ?? '24'),
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

  // MULTISIG SettlementProvider (multisig.provider.ts) — real 2-of-3
  // Bitcoin P2WSH script/PSBT construction against a public block-explorer
  // API. Empty seed by default, same "surface a clear config error, don't
  // refuse to boot" pattern as wdk.seedPhrase above — this provider's own
  // header comment has the full custody-model disclosure (server-derived
  // keys, single-arbiter limitation).
  multisig: {
    seed: process.env.MULTISIG_SEED ?? '',
    network: process.env.MULTISIG_NETWORK ?? 'testnet',
    explorerApiUrl: process.env.MULTISIG_EXPLORER_API_URL ?? 'https://mempool.space/testnet/api',
  },

  // LIGHTNING_HODL SettlementProvider (lightning-hodl.provider.ts) — real
  // Arkade (Ark protocol) VTXO/Taproot script construction and signing.
  // Empty seed by default, same pattern as wdk.seedPhrase/multisig.seed
  // above. Defaults point at Ark Labs' own public mutinynet deployment —
  // confirmed reachable (real getInfo()/getVtxos() responses) before this
  // config was added, not assumed. See that file's own header comment for
  // the full custody-model and release/refund verification-scope
  // disclosure.
  arkade: {
    seed: process.env.ARKADE_SEED ?? '',
    asp: process.env.ARKADE_ASP_URL ?? 'https://mutinynet.arkade.sh',
    explorerApiUrl: process.env.ARKADE_EXPLORER_API_URL ?? 'https://mempool.mutinynet.arkade.sh/api',
  },

  // SAFE_GUARD_EVM SettlementProvider (safe-guard-evm.provider.ts, RFC-020)
  // — a Safe Transaction Guard + ERC-4337 escrow whose arbiter co-signer
  // key lives in AWS KMS, never in this process. Empty kmsKeyId by
  // default, same "surface a clear config error, don't refuse to boot"
  // pattern as wdk.seedPhrase/multisig.seed/arkade.seed above — without a
  // real AWS_KMS_KEY_ID the disputed-release/refund path throws a real
  // AWS auth/network error the first time it's actually exercised, not a
  // fabricated one. chainId/entryPointAddress default to Sepolia + the
  // real, well-known canonical ERC-4337 v0.7 EntryPoint address (same one
  // used throughout `packages/sails-sdk/src/custody/evm-4337.ts`'s own
  // tests) — inert public values, safe to ship as defaults.
  // rpcUrl defaults to the same public Sepolia RPC `wdk.rpcUrl` already
  // uses, for the same reason. bundlerUrl has no project precedent to
  // match (ERC-4337 bundlers are their own distinct infra, not served by
  // a plain RPC) — empty by default, same "clear config error, don't
  // refuse to boot" pattern, surfaced only when broadcast() is actually
  // reached. The four contract addresses below are real, canonical,
  // chain-agnostic deployments (Safe v1.4.1 / Safe4337Module v0.3.0) —
  // verified live against Sepolia (`eth_getCode`, all five non-empty)
  // before being hardcoded here, and `safeProxy.creationCode` (used for
  // CREATE2 address prediction) was verified byte-for-byte identical to
  // the real deployed factory's own `proxyCreationCode()` return value
  // via a live `eth_call`, not merely copied from the installed npm
  // package on trust. `deterministicDeployer` is the well-known
  // Arachnid/EIP-2470-style singleton factory (same address on every EVM
  // chain that has it deployed, including Sepolia — also verified live)
  // used to deploy `SailsEscrowSafe` itself deterministically, so its
  // address can be predicted off-chain before the Safe exists and baked
  // into the Safe's own guard-setup step later.
  safeGuardEvm: {
    chainId: BigInt(process.env.SAFE_GUARD_EVM_CHAIN_ID ?? '11155111'),
    entryPointAddress: process.env.SAFE_GUARD_EVM_ENTRY_POINT ?? '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    kmsKeyId: process.env.AWS_KMS_KEY_ID ?? '',
    kmsRegion: process.env.AWS_REGION ?? 'us-east-1',
    rpcUrl: process.env.SAFE_GUARD_EVM_RPC_URL ?? 'https://sepolia.drpc.org',
    bundlerUrl: process.env.SAFE_GUARD_EVM_BUNDLER_URL ?? '',
    safeProxyFactory: process.env.SAFE_GUARD_EVM_PROXY_FACTORY ?? '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
    safeSingleton: process.env.SAFE_GUARD_EVM_SINGLETON ?? '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',
    safe4337Module: process.env.SAFE_GUARD_EVM_4337_MODULE ?? '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226',
    safeModuleSetup: process.env.SAFE_GUARD_EVM_MODULE_SETUP ?? '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47',
    multiSendCallOnly: process.env.SAFE_GUARD_EVM_MULTISEND_CALL_ONLY ?? '0x9641d764fc13c8B624c04430C7356C1C7C8102e2',
    deterministicDeployer: process.env.SAFE_GUARD_EVM_DETERMINISTIC_DEPLOYER ?? '0x4e59b44847b379578588920ca78fbf26c0b4956c',
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

// Missão 06.5 — structural guard against ENFORCE_CAPABILITIES silently
// resolving to "no enforcement" in production. Deliberately narrower
// than RT-001's rule above: Missão 02.5 already found automatic
// CapabilityGrant issuance isn't ready for real users yet, so this does
// NOT mandate enforceCapabilities=true in production (that would invent
// a policy this mission was explicitly told not to invent, and would
// break every deployment that hasn't done capability onboarding). It
// mandates only that the operator set the variable EXPLICITLY — 'true'
// once grants are issued, or 'false' to consciously acknowledge running
// without capability enforcement — rather than a production boot
// silently inheriting the exact same unset-default a forgotten .env
// file would give a throwaway dev environment. Reads
// `process.env.ENFORCE_CAPABILITIES` directly, not
// `config.features.enforceCapabilities` — that field has already
// collapsed "unset" and "explicitly false" into the same `false`,
// which is precisely the distinction this guard exists to preserve.
if (config.isProduction && process.env.ENFORCE_CAPABILITIES === undefined) {
  throw new Error(
    'FATAL: NODE_ENV=production but ENFORCE_CAPABILITIES is not set. ' +
    'Refusing to boot — see docs/rfcs/RFC-014-capability-registry-enforcement.md. ' +
    "Set ENFORCE_CAPABILITIES=true once this deployment's participants have " +
    'real CapabilityGrants issued, or explicitly set ENFORCE_CAPABILITIES=false ' +
    'to acknowledge running without capability enforcement for now.'
  )
}

// Warn if mockEscrow is disabled but mockSettlement is enabled — this
// combination means real funds are locked but settlement never releases them.
// Stays console.warn on purpose, not childLogger('config') — common/logger.ts
// reads config.app at module-load time, so importing it here would be a real
// circular import (config -> logger -> config), not just a style choice.
if (config.isProduction && !config.features.mockEscrow && config.features.mockSettlement) {
  console.warn(
    'WARNING: MOCK_ESCROW=false but MOCK_SETTLEMENT=true. ' +
    'This combination will lock real funds but settlement will be a no-op. ' +
    'Set MOCK_SETTLEMENT=false for production.'
  )
}
