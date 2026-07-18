/**
 * Domain types for this UI — deliberately mirroring the real backend
 * enums (prisma/schema.prisma) rather than inventing UI-only values, so
 * swapping mock.ts for real @sails/sdk calls later doesn't also require
 * rewriting every component's prop types. Checked against the real
 * schema before writing (AssetType, PaymentMethod, TradeStatus,
 * EscrowStatus, EscrowType, IntentStatus) — not assumed from the
 * pasted design brief, which used values that don't exist in the real
 * code (e.g. an intent status called "LIQUIDATED").
 */

export type AssetType =
  | 'BTC' | 'USDT_ERC20' | 'USDT_TRC20' | 'USDT_LIQUID' | 'USDT_LIGHTNING'
  | 'LN_BTC' | 'LIQUID_BTC' | 'SPARK' | 'STACKS' | 'RSK_BTC'

export type TradeSide = 'BUY' | 'SELL'

export type PaymentMethod =
  | 'PIX' | 'TED' | 'BANK_TRANSFER' | 'CRYPTO_DIRECT' | 'LIGHTNING_DIRECT' | 'CASH' | 'OTHER'

export type OfferStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'

// UI-side generalization of a real, narrower backend field: Offer.priceBrl
// (prisma/schema.prisma) is the only local-fiat price the real schema
// models today — BRL specifically, nothing else. This type/field exists
// so the Marketplace filter can offer "choose your fiat" the way real
// P2P platforms do, but it's presentation-only until the backend grows
// a genuine multi-fiat price field — see mock.ts's own comment on Offer.
export type FiatCurrency = 'BRL' | 'USD' | 'EUR' | 'GBP' | 'ARS' | 'MXN' | 'NGN' | 'INR'

export type TradeStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'DISPUTED' | 'CANCELLED'

// Only MOCK and WDK_USDT_EVM are real settlement providers as of this
// writing (escrow.service.ts's PROVIDERS map) — MULTISIG/LIGHTNING_HODL/
// LIQUID_COVENANT exist as enum values but throw "not yet implemented."
// The UI still lists all five (an escrow can reference any of them) but
// see EscrowTypeBadge for how the not-yet-real ones are labeled.
export type EscrowType = 'MULTISIG' | 'LIGHTNING_HODL' | 'LIQUID_COVENANT' | 'WDK_USDT_EVM' | 'MOCK'

export type EscrowStatus = 'CREATED' | 'FUNDS_LOCKED' | 'PAYMENT_PENDING' | 'COMPLETED' | 'DISPUTED' | 'REFUNDED'

export type DisputeStatus = 'OPENED' | 'EVIDENCE_SUBMITTED' | 'ARBITRATED' | 'RESOLVED'
export type DisputeRuling = 'RELEASE' | 'REFUND' | 'SPLIT'

// RFC-012's real Intent lifecycle — not used by the mocked trade flow
// below directly (that's TradeStatus/EscrowStatus, the OpenP2P/
// OpenSettlement primitives this UI's screens map onto 1:1), included
// here since AgentIntentionPanel-style QVAC UI is a real, named 📋
// future piece (docs/SDK_usecases.md) this UI will eventually need.
export type IntentStatus =
  | 'CREATED' | 'VALIDATED' | 'COORDINATED' | 'DISCOVERING' | 'MATCHED'
  | 'NEGOTIATING' | 'COMMITTED' | 'SETTLING' | 'FULFILLED' | 'EXPIRED'
  | 'CANCELLED' | 'FAILED'

export interface User {
  id: string
  publicKey: string
  displayName: string | null
  peerId: string | null
  reputationScore: number
  totalTrades: number
  disputeCount: number
  totalVolumeBtc: number
  verified: boolean
  createdAt: string
}

export interface Offer {
  id: string
  userId: string
  user: User
  asset: AssetType
  side: TradeSide
  priceUsd: number // always real (Offer.priceUsd, required in the real schema)
  fiatCurrency: FiatCurrency // generalizes the real Offer.priceBrl field — see this type's own comment above
  priceFiat: number
  minAmount: number
  maxAmount: number
  paymentMethod: PaymentMethod
  paymentDetails?: string
  status: OfferStatus
  network?: string
  description?: string
  requiresKyc: boolean
  country: string // ISO 3166-1 alpha-2 — UI-only field for the country/region filter, not in the real schema yet
  tradedWithCurrentUser: boolean // UI-only demonstration flag for the "already traded with" filter — a real version needs a real trade-history join
  blockedRelationship: boolean // UI-only demonstration flag for "apenas anúncios negociáveis" — a real version needs a real block-list model, which doesn't exist in the backend yet either
  createdAt: string
}

export interface EscrowEvent {
  status: EscrowStatus
  timestamp: string
  actor: string
  note?: string
}

export interface Escrow {
  id: string
  tradeId: string
  type: EscrowType
  status: EscrowStatus
  lockedAmount: number
  asset: AssetType
  timelockHours: number
  txLockId: string | null
  txReleaseId: string | null
  expiresAt: string | null
  events: EscrowEvent[]
}

export type MessageType = 'TEXT' | 'SYSTEM' | 'PAYMENT_PROOF'

export interface Message {
  id: string
  senderId: string | null // null for SYSTEM
  sender: User | null
  content: string
  type: MessageType
  createdAt: string
}

export interface Trade {
  id: string
  offerId: string
  offer: Offer
  buyer: User
  seller: User
  asset: AssetType
  amount: number
  priceUsd: number
  totalUsd: number
  totalBrl: number
  status: TradeStatus
  network?: string
  createdAt: string
  escrow: Escrow
  messages: Message[]
}

export interface TradeHistoryEntry {
  id: string
  tradeId: string
  asset: AssetType
  amount: number
  totalBrl: number
  status: TradeStatus
  counterpart: string
  role: 'BUYER' | 'SELLER'
  date: string
}

export interface Dispute {
  id: string
  tradeId: string
  asset: AssetType
  amount: number
  buyer: User
  seller: User
  reason: string
  status: DisputeStatus
  openedAt: string
  openedBy: string
}

export type PaymentTimeLimit = 'Todos' | '15' | '30' | '45' | '60' | '24h'
export type MarketplaceSort = 'price' | 'trades' | 'reputation'

// Advanced filter state — Binance P2P-style, requested directly.
// negotiableOnly/highReputationOnly/previouslyTradedOnly filter against
// the UI-only demonstration fields on Offer (see that type's own
// comments) — a real implementation needs a real block-list and a real
// trade-history join, neither of which exist in the backend yet.
export interface MarketplaceFilters {
  saveForNext: boolean
  negotiableOnly: boolean
  highReputationOnly: boolean
  previouslyTradedOnly: boolean
  amount: string
  paymentTimeLimit: PaymentTimeLimit
  paymentMethods: PaymentMethod[]
  country: string // 'Todos' or a COUNTRIES code (data/mock.ts)
  sortBy: MarketplaceSort
}

export const DEFAULT_FILTERS: MarketplaceFilters = {
  saveForNext: false,
  negotiableOnly: false,
  highReputationOnly: false,
  previouslyTradedOnly: false,
  amount: '',
  paymentTimeLimit: 'Todos',
  paymentMethods: [],
  country: 'Todos',
  sortBy: 'price',
}
