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

// `DEPIX` is a UI-only addition (2026-07-29, requested directly) — a
// real, BRL-pegged stablecoin issued on the Liquid Network (Blockstream
// sidechain; areabitcoin.com.br/depix, depix.org), not in the real
// prisma `AssetType` enum. Not the same asset as `USDT_LIQUID` above
// (Tether's own USDt issuance on Liquid, USD-pegged) — DePix is BRL-
// pegged, a different issuer and peg currency, both real Liquid-network
// assets. `LIQUID_BTC`/`USDT_LIQUID` above already cover what was asked
// for as "LBTC"/"LUSD" (same request) — no new value needed for those;
// "LUSD" specifically is not this project's asset at all if taken
// literally (that ticker belongs to Liquity Protocol's Ethereum
// stablecoin, unrelated to the Liquid Network this request means).
// Filter/display + PublishOffer's *own* asset-picker in this case (see
// data/mock.ts's `ASSETS` vs `ASSETS_FILTERABLE` and PublishOffer.tsx's
// own comment) — same real-vs-UI-only split as `PaymentMethod` below.
// `LN_BTC` relabeled (2026-07-29, requested directly), not renamed at
// the type level — see ASSET_LABELS in lib/labels.ts. Confirmed against
// lightning-hodl.provider.ts's own header comment: real Lightning
// (plain HTLCs) has no genuine multi-party escrow primitive, so this
// escrow type actually settles via Arkade (Ark protocol, VTXOs) under
// the hood — same production precedent HodlHodl/Lendasat use. The
// asset's stored value is unchanged (still `LN_BTC`); only the label
// shown to a person now says so.
//
// `SPARK` deliberately excluded from `ASSETS` (data/mock.ts) as of the
// same date, requested directly and verified first: grepped the entire
// real backend (`src/`) for "SPARK" and found it only as a bare enum
// value (common/types/index.ts, intentRoutes.ts's validator) — zero
// settlement-provider wiring anywhere, unlike USDT_ERC20's confirmed
// SAFE_GUARD_EVM path. Still a real `AssetType` value here (unchanged),
// just not offered as tradeable in this UI.
export type AssetType =
  | 'BTC' | 'USDT_ERC20' | 'USDT_TRC20' | 'USDT_LIQUID' | 'USDT_LIGHTNING'
  | 'LN_BTC' | 'LIQUID_BTC' | 'SPARK' | 'STACKS' | 'RSK_BTC'
  | 'DEPIX'
  // UI-only additions (2026-07-29, requested directly) — real, named
  // assets, not invented, none in the real prisma `AssetType` enum.
  // ETH/BNB/SOL/LTC are each that chain's own native asset; WBTC
  // defaults to its most common form (ERC-20 on Ethereum) absent a
  // chain being specified; the USDC variants are chain-qualified the
  // same way USDT_ERC20/USDT_TRC20/USDT_LIQUID already are here, since
  // USDC itself isn't chain-specific; SBTC_STACKS/USDCX_STACKS are the
  // Stacks ecosystem's own real assets (stacks.co/sbtc — a trust-
  // minimized BTC peg; Circle's own xReserve-issued USDC on Stacks).
  | 'ETH' | 'BNB' | 'SOL' | 'LTC' | 'WBTC'
  | 'USDC_ERC20' | 'USDC_POLYGON' | 'USDC_BASE'
  | 'SBTC_STACKS' | 'USDCX_STACKS'

export type TradeSide = 'BUY' | 'SELL'

// Everything from `PAYPAL` onward is a UI-only addition (2026-07-28,
// requested directly, expanded the same day to be exhaustive: "o que
// for repetido... ótimo mas... temos que ter o que cada uma delas já
// tem") — one real, named payment method per platform-specific source,
// not invented. The real prisma `PaymentMethod` enum has none of these —
// same disclosed-gap pattern as this file's `EscrowType` comment below.
// Filter/display contexts only — see data/mock.ts's `PAYMENT_METHODS`
// (real) vs `PAYMENT_METHODS_FILTERABLE` (this full list) and
// PublishOffer.tsx's own comment for why the real submission path stays
// on the narrower list.
export type PaymentMethod =
  | 'PIX' | 'TED' | 'BANK_TRANSFER' | 'CRYPTO_DIRECT' | 'LIGHTNING_DIRECT' | 'CASH' | 'OTHER'
  // HodlHodl (hodlhodl.com/pages/faq; medium.com/@hodlhodl) — SEPA/wire
  // already covered by BANK_TRANSFER/TED above; cash by mail is its own
  // distinct method from in-person CASH.
  | 'PAYPAL' | 'CASH_BY_MAIL'
  // Airtm (help.airtm.com, airtm.com/en/blog/enterprise/payment-methods)
  | 'SKRILL' | 'ADVCASH' | 'NETELLER' | 'PAYEER' | 'PAYONEER' | 'PERFECT_MONEY' | 'WEBMONEY'
  | 'ZELLE' | 'ZINLI' | 'CREDIT_DEBIT_CARD' | 'GIFT_CARD'
  // El Dorado (eldorado.io/en/blog, faq.eldorado.io) — LatAm-specific
  // wallets; MERCADO_PAGO also independently confirmed for Noones.
  | 'MERCADO_PAGO' | 'NEQUI' | 'BANCOLOMBIA' | 'WALLY' | 'YAPE'
  // Noones (blog.noones.com/en/payment-methods) — PAYPAL/GIFT_CARD/
  // MERCADO_PAGO above already cover Noones' own list too.
  | 'MOBILE_MONEY' | 'REVOLUT'
  // Brazil-specific, raised directly (2026-07-29) and confirmed against
  // Binance P2P Brasil's own listed methods (nordinvestimentos.com.br;
  // binance.com/pt-BR/blog) — real, commonly-used local rails distinct
  // from PIX/TED/BANK_TRANSFER already above.
  | 'BOLETO' | 'LOTERICA_DEPOSIT'
  // DePix (2026-07-29, requested alongside the AssetType addition of the
  // same name above) — paying/receiving directly in the DePix stablecoin
  // itself, distinct from using it as a traded asset.
  | 'DEPIX'
  // More wallet-to-wallet apps "like Revolut" (2026-07-29, requested
  // directly) — each independently confirmed as a real Noones payment
  // method (noones.com/buy-bitcoin/{wise-transferwise,venmo,cash-app})
  // except PicPay, confirmed on Binance P2P instead
  // (binance.com/en/support/announcement — "50 New Payment Methods").
  | 'WISE' | 'VENMO' | 'CASH_APP' | 'PICPAY'
  // Peru, confirmed alongside YAPE above on El Dorado's own help center
  // (support.eldorado.gg/en/articles/10213898-payment-methods) — Plin is
  // a different, competing Peruvian instant-transfer app, not a Yape
  // rebrand.
  | 'PLIN'

export type OfferStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'

// UI-side generalization of a real, narrower backend field: Offer.priceBrl
// (prisma/schema.prisma) is the only local-fiat price the real schema
// models today — BRL specifically, nothing else. This type/field exists
// so the Marketplace filter can offer "choose your fiat" the way real
// P2P platforms do, but it's presentation-only until the backend grows
// a genuine multi-fiat price field — see mock.ts's own comment on Offer.
//
// VES/COP/PEN/BOB/EGP added 2026-07-29 (requested directly — "moedas
// dos países que Airtm/El Dorado têm") to match countries those two
// platforms actually cover: Venezuela/Colombia/Peru/Bolivia
// (help.airtm.com's own "top regions" list; El Dorado's Nequi/
// Bancolombia/Yape/Plin support implies COP/PEN, its own blog names BOB
// for Bolivia directly) and Egypt (Airtm's own direct-withdrawals page).
export type FiatCurrency = 'BRL' | 'USD' | 'EUR' | 'GBP' | 'ARS' | 'MXN' | 'NGN' | 'INR' | 'VES' | 'COP' | 'PEN' | 'BOB' | 'EGP'

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

// IMAGE/VIDEO added directly on top of the real backend's Message.msgType
// (prisma/schema.prisma) — that field is a free String, so no migration
// would be needed to accept these values server-side. What IS still
// missing on the real backend is everything around the value: an upload/
// storage endpoint (Message.content is unbounded Postgres text, not a
// place to put a raw video blob) and a Pears event kind carrying media
// (chat.routes.ts's WS->Pears relay only ever sends a MESSAGE_EXCHANGED
// event with plain text `content` today). See ChatWindow's own comment.
// RISK_WARNING mirrors the real backend's WS message type of the same
// name (RFC-017, chat.routes.ts's `agents.social_engineering.risk_detected`
// -> RISK_WARNING broadcast) — not a UI-only invention. What IS UI-only
// here is the detection itself: see lib/socialEngineering.ts's own
// comment for exactly what's simulated vs real.
export type MessageType = 'TEXT' | 'SYSTEM' | 'PAYMENT_PROOF' | 'IMAGE' | 'VIDEO' | 'RISK_WARNING'

export interface Message {
  id: string
  senderId: string | null // null for SYSTEM
  sender: User | null
  content: string
  type: MessageType
  mediaUrl?: string // local blob: URL only in this UI — see ChatWindow's comment
  mediaFileName?: string
  riskPattern?: 'off_channel_migration' | 'payment_instruction_change' // RISK_WARNING only
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
