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
export type EscrowType = 'MULTISIG' | 'LIGHTNING_HODL' | 'LIQUID_COVENANT' | 'WDK_USDT_EVM' | 'MOCK'
export type EscrowStatus = 'CREATED' | 'FUNDS_LOCKED' | 'PAYMENT_PENDING' | 'COMPLETED' | 'DISPUTED' | 'REFUNDED'
export type PaymentMethod = 'PIX' | 'TED' | 'BANK_TRANSFER' | 'CRYPTO_DIRECT' | 'LIGHTNING_DIRECT' | 'CASH' | 'OTHER'
export type DisputeStatus = 'OPENED' | 'EVIDENCE_SUBMITTED' | 'ARBITRATED' | 'RESOLVED'
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
  totalTrades: number
  disputeCount: number
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
export interface CapabilityGrant {
  grantId: string
  grantedTo: string
  capabilityName: string
  scope: string[]
  constraints?: Record<string, unknown>
  issuedBy: string
}
