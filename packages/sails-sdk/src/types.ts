/**
 * @sails/sdk — response types
 *
 * Mirrors the actual JSON shapes the reference implementation's routes
 * return today (verified against `prisma/schema.prisma` and each route
 * handler directly, not against the aspirational shapes in
 * `SDK_GUIDE.md`/`API_REFERENCE.md`, which predate several real
 * implementation decisions). Deliberately NOT built on `@sails/p2p-schemas`
 * for v0.1 — that package's `OfferSchema` (`assetSell`/`assetBuy`,
 * single `amount`) already documents real, named divergences from what
 * `liquidity.service.ts` actually persists and returns (see that file's
 * own "Reconciliation against the real Offer model" section); forcing
 * every SDK response through an unreconciled conversion would hide real
 * shape information a caller may need. Reconciling the two is real,
 * separate follow-up work (BACKLOG.md), not done silently here.
 *
 * Decimal fields (Prisma `Decimal`) serialize as decimal strings over
 * JSON (RFC-009, `rfcs/RFC-009-decimal-precision-for-financial-fields.md`)
 * — typed `string` below, never `number`. `DateTime` fields serialize as
 * ISO 8601 strings.
 */

export type AssetType =
  | 'BTC' | 'USDT_ERC20' | 'USDT_TRC20' | 'USDT_LIQUID' | 'USDT_LIGHTNING'
  | 'LN_BTC' | 'LIQUID_BTC' | 'SPARK' | 'STACKS' | 'RSK_BTC'

export type TradeSide = 'BUY' | 'SELL'
export type OfferStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
export type TradeStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'DISPUTED' | 'CANCELLED'
export type EscrowType = 'MULTISIG' | 'LIGHTNING_HODL' | 'LIQUID_COVENANT' | 'WDK_USDT_EVM' | 'SAFE_GUARD_EVM' | 'MOCK'
export type EscrowStatus = 'CREATED' | 'FUNDS_LOCKED' | 'PAYMENT_PENDING' | 'COMPLETED' | 'DISPUTED' | 'REFUNDED' | 'SPLIT'
export type PaymentMethod = 'PIX' | 'TED' | 'BANK_TRANSFER' | 'CRYPTO_DIRECT' | 'LIGHTNING_DIRECT' | 'CASH' | 'OTHER'
export type DisputeStatus = 'OPENED' | 'EVIDENCE_SUBMITTED' | 'ARBITRATED' | 'RESOLVED' | 'APPEALED' | 'AUTO_PROPOSED'
export type DisputeRuling = 'RELEASE' | 'REFUND' | 'SPLIT'

// RFC-012 (rfcs/RFC-012-intent-validation-and-coordination.md) — the
// current, real IntentStatus vocabulary (common/types/intent.ts).
export type IntentStatus =
  | 'CREATED' | 'VALIDATED' | 'COORDINATED' | 'DISCOVERING' | 'MATCHED'
  | 'NEGOTIATING' | 'COMMITTED' | 'SETTLING' | 'FULFILLED' | 'EXPIRED'
  | 'CANCELLED' | 'FAILED'

export interface Participant {
  id: string
  publicKey: string
  displayName: string | null
  peerId: string | null
  reputationScore: number
  totalTrades: number
  disputeCount: number
  totalVolumeBtc: string
  verified: boolean
  createdAt: string
  updatedAt: string
}

export interface Offer {
  id: string
  userId: string
  asset: AssetType
  side: TradeSide
  priceUsd: string
  priceBrl: string | null
  minAmount: string
  maxAmount: string
  paymentMethod: PaymentMethod
  paymentDetails: string | null
  status: OfferStatus
  network: string | null
  description: string | null
  requiresKyc: boolean
  createdAt: string
  updatedAt: string
}

export interface Trade {
  id: string
  offerId: string
  buyerId: string
  sellerId: string
  asset: AssetType
  amount: string
  priceUsd: string
  totalUsd: string
  status: TradeStatus
  escrowId: string | null
  network: string | null
  completedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  // Only populated by openp2p.getTrade() (GET /v1/openp2p/trades/:id) —
  // the Offer this Trade was accepted from, so a caller mid-trade can
  // still see paymentMethod/paymentDetails (where to actually send fiat)
  // without having to have kept the OfferDetail page's own fetch around.
  // Optional because trade()'s create response doesn't include it.
  offer?: Offer
}

// Fase 2 (SDK React) — GET /v1/openp2p/trades (trade.service.ts's
// getTrades()), the "list my trades" endpoint that didn't exist before
// useSailsTrades() needed one. Each Trade here does NOT include
// messages/offer the way getTrade()'s single-trade response does — a
// list view has no use for a full message history per row, and
// including it would make a page-of-10 response N+1 query the size of
// ten separate getTrade() calls for no reason.
export interface PaginatedTrades {
  trades: Trade[]
  total: number
  hasMore: boolean
}

// GET /v1/settlement/disputes (dispute.service.ts's listForArbiter()) —
// same shape/pagination convention as PaginatedTrades above, scoped to
// the calling participant's own arbiterId server-side (never a
// client-supplied filter — see that method's own doc comment).
export interface PaginatedDisputes {
  disputes: Dispute[]
  total: number
  hasMore: boolean
}

export interface Escrow {
  id: string
  tradeId: string
  type: EscrowType
  status: EscrowStatus
  lockedAmount: string
  asset: AssetType
  network: string | null
  txLockId: string | null
  txReleaseId: string | null
  timelockHours: number
  lockedAt: string | null
  expiresAt: string | null
  releasedAt: string | null
  createdAt: string
  updatedAt: string
  // Added 2026-08-03 (UI-audit follow-up) — `escrow.service.ts`'s
  // `getEscrow()` now includes this: the only way a trade party who
  // didn't open a dispute could ever learn its disputeId before was the
  // dispute-opener's own POST response. At most one entry in practice
  // (`Dispute`'s `@@unique([tradeId])`), but real Prisma `include` shape,
  // so this stays an array rather than `Dispute | null`.
  disputes?: Dispute[]
}

// Sails OpenProof (RFC-006, PROTOCOL_SPECIFICATION.md §1.8) — real as of
// proof.service.ts (2026-07-21). Mirrors the persisted Proof row exactly
// (prisma/schema.prisma's Proof model): `evidenceHash` is always the
// server's own sha256(canonicalize(evidence)), never client-supplied
// (proof.service.ts's own submitProof() doc comment has the full
// forgery-resistance reasoning) — that field is real proof integrity,
// not decoration.
export interface Proof {
  id: string
  claimId: string
  evidence: unknown
  evidenceHash: string
  submittedBy: string
  submittedAt: string
}

export interface Verification {
  id: string
  proofId: string
  verifiedBy: string
  verdict: 'ACCEPTED' | 'REJECTED'
  reason: string | null
  verifiedAt: string
}

// Phase 2 (2026-07-27) — the in-flight signature-collection round for a
// MULTISIG release/refund (escrow.service.ts's initiateRelease()/
// initiateRefund()/submitTransactionSignature()). Mirrors
// EscrowPendingTransaction/EscrowTransactionSignature (prisma/schema.prisma)
// directly.
export interface EscrowTransactionSignature {
  id: string
  pendingTxId: string
  participantId: string
  signedPsbtBase64: string
  createdAt: string
}

export interface EscrowPendingTransaction {
  id: string
  escrowId: string
  kind: 'release' | 'refund' | 'split'
  toAddress: string
  // Only set for kind: 'split' — the seller's payout address, alongside
  // toAddress (buyer's) above.
  toAddressSecondary?: string
  unsignedPsbtBase64: string
  requiredSigners: string[]
  triggeredBy: string
  createdAt: string
  // Only present on getPendingTransaction() — initiateRelease()/
  // initiateRefund()'s own create response doesn't include it (no
  // signatures can exist yet at that point).
  signatures?: EscrowTransactionSignature[]
}

export interface Dispute {
  id: string
  tradeId: string
  escrowId: string
  openedBy: string
  reason: string
  evidence: unknown[]
  arbiterId: string | null
  status: DisputeStatus
  ruling: DisputeRuling | null
  resolvedAt: string | null
  // RFC-021 D6 — appeal state.
  appealRound: number
  previousRuling: DisputeRuling | null
  previousArbiterId: string | null
  // RFC-021 D8 — QVAC-assisted automated first-pass resolution state.
  // Populated only while status is AUTO_PROPOSED (or after, for audit —
  // see autoResolved).
  autoResolutionRecommendation: DisputeRuling | null
  autoResolutionConfidence: number | null
  autoResolutionReasoning: string | null
  autoResolutionDeadline: string | null
  autoResolved: boolean
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  tradeId: string
  senderId: string
  content: string
  msgType: string
  readAt: string | null
  createdAt: string
}

export interface ReputationScore {
  id: string
  publicKey: string
  displayName: string | null
  reputationScore: number
  total: number
  tradeScore: number
  volumeScore: number
  settlementScore: number
  disputeRate: number
  totalTrades: number
  disputeCount: number
  cumulativeFeesObserved: string
}

// GET /v1/reputation/leaderboard's real Prisma `select` (reputation.service.ts's
// getLeaderboard()) only ever returns these 4 fields — never the full
// ReputationScore shape (no publicKey/tradeScore/volumeScore/settlementScore/
// disputeRate/disputeCount/cumulativeFeesObserved on a leaderboard row).
export interface LeaderboardEntry {
  id: string
  displayName: string | null
  reputationScore: number
  totalTrades: number
}

// Same pagination convention as PaginatedTrades/PaginatedDisputes above,
// plus nextOffset (the real value getLeaderboard() computes) for a caller
// that wants to page without re-deriving offset + items.length itself.
export interface LeaderboardResult {
  items: LeaderboardEntry[]
  total: number
  hasMore: boolean
  nextOffset: number | null
}

// RFC-021 D7 — real peer vouching, not a KYC/identity-linking primitive.
export interface Vouch {
  id: string
  voucherId: string
  voucheeId: string
  createdAt: string
  burnedAt: string | null
}

export interface Intent<T = Record<string, unknown>> {
  id: string
  type: string
  version: string
  participantId: string
  agentId?: string
  parentIntentId?: string
  moduleId: string
  payload: T
  status: IntentStatus
  createdAt: string
  updatedAt: string
  expiresAt?: string
  fulfilledBy?: string
  metadata: Record<string, unknown>
}

// PROTOCOL_SPECIFICATION.md §2.3 — the only IntentType with a real
// handler today (RFC-012's Alternatives Considered note); the others
// are 📋 future.
export interface TradeIntentPayload {
  asset: string
  side: TradeSide
  maxValue?: string // decimal string, RFC-009 — never number
  minValue?: string
  currency?: string
  fiatMethod?: string
  network?: string
  slippageTolerance?: number
  // RFC-013 (rfcs/RFC-013-capability-registry-and-wallet-adapter.md) —
  // counterparty-matching constraints, not yet enforced during matching
  // (that's OpenLiquidity follow-up work) — this is the vocabulary.
  minReputationRating?: number // 0-5, mirrors ReputationScore's scale
  kycRequired?: boolean
}

export interface PeerStatus {
  userId: string
  started: boolean
  peerId: string | null
  connectedPeers: number
  activeTopics: string[]
  peers: Array<{ userId: string; peerId: string; connectedAt: string }>
}

// RFC-005 (rfcs/RFC-005-capability-model.md) — the permission-grant side
// of the Capability model; RFC-013 gives it a real backing route.
//
// Checked 2026-08-01 against docs/PROTOCOL_SPECIFICATION.md's own
// "spec-vs-implementation drift" note (2026-07-19), which claims the
// real API returns `id`, not `grantId` — traced directly against
// src/core/capability-registry.ts and that claim is false: `grant()`/
// `listGrants()` both return through `toCapabilityGrant()`, which
// explicitly maps the Prisma row's `id` column to `grantId` in the
// response (`src/common/types/capability.ts`'s own `CapabilityGrant`
// type confirms `grantId` is the real, intentional public field name —
// the Prisma column name is an internal storage detail, not the API
// contract). `grantId` below was already correct; left unchanged. See
// that doc's note for the correction.
export interface CapabilityGrant {
  grantId: string
  grantedTo: string
  capabilityName: string
  scope: string[]
  constraints?: Record<string, unknown>
  issuedBy: string
}
