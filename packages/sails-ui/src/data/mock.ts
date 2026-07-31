/**
 * Mocked data for this skeleton pass — no real @sails/sdk or backend
 * call happens anywhere in this UI yet (docs/TODO.md section 11). Every
 * screen that will eventually read this from a real API call has a
 * `// TODO: replace with @sails/sdk call` comment at the read site, not
 * just here, so the swap-in points are easy to find later.
 */
import type { User, Offer, Trade, TradeHistoryEntry, Dispute, EscrowEvent } from '../types'

export const MOCK_USERS: User[] = [
  {
    id: 'u1', publicKey: 'K3x8mNpQ2rTvBfYhWcUiLsAoGjEkDnZq7XwP0mN1oA=',
    displayName: 'alice_btc', peerId: 'peer-alice-abc123',
    reputationScore: 95.5, totalTrades: 42, disputeCount: 0, totalVolumeBtc: 3.21,
    verified: true, createdAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'u2', publicKey: 'B9y7kLqR3sTuCgZiVdXjMnPoEfHwKaYb6WvN2mO4pB=',
    displayName: 'bob_sats', peerId: 'peer-bob-def456',
    reputationScore: 87.0, totalTrades: 18, disputeCount: 1, totalVolumeBtc: 1.05,
    verified: false, createdAt: '2024-03-20T00:00:00Z',
  },
  {
    id: 'u3', publicKey: 'C2z4lMsT5uVwDhAjQeYkRnBpGiJxKbZc8XoO6nP3qC=',
    displayName: 'carol_hodl', peerId: 'peer-carol-ghi789',
    reputationScore: 72.0, totalTrades: 7, disputeCount: 0, totalVolumeBtc: 0.44,
    verified: false, createdAt: '2024-06-10T00:00:00Z',
  },
]

// Whoever is "logged in" for this mocked prototype — a real deployment
// derives this from an Ed25519 session (common/middleware/auth.ts), not
// a hardcoded array index. See LoginPage's own comment.
export const CURRENT_USER = MOCK_USERS[1]

export const MOCK_OFFERS: Offer[] = [
  {
    id: 'o1', userId: 'u1', user: MOCK_USERS[0],
    asset: 'BTC', side: 'SELL', priceUsd: 67500, fiatCurrency: 'BRL', priceFiat: 340000,
    minAmount: 0.001, maxAmount: 0.05, paymentMethod: 'PIX', status: 'ACTIVE',
    network: 'bitcoin', description: 'Fast PIX settlement. No KYC < 0.01 BTC. Online 24/7.',
    requiresKyc: false, createdAt: '2026-07-01T00:00:00Z',
    country: 'BR', tradedWithCurrentUser: true, blockedRelationship: false,
  },
  {
    id: 'o2', userId: 'u2', user: MOCK_USERS[1],
    asset: 'BTC', side: 'BUY', priceUsd: 66800, fiatCurrency: 'BRL', priceFiat: 336000,
    minAmount: 0.001, maxAmount: 0.02, paymentMethod: 'PIX', status: 'ACTIVE',
    network: 'bitcoin', description: 'Looking for BTC. Instant PIX payment.',
    requiresKyc: false, createdAt: '2026-07-02T00:00:00Z',
    country: 'BR', tradedWithCurrentUser: false, blockedRelationship: false,
  },
  {
    id: 'o3', userId: 'u1', user: MOCK_USERS[0],
    asset: 'LN_BTC', side: 'SELL', priceUsd: 67200, fiatCurrency: 'BRL', priceFiat: 338000,
    minAmount: 0.0001, maxAmount: 0.005, paymentMethod: 'PIX', status: 'ACTIVE',
    network: 'lightning', description: 'Lightning sats via PIX. Instant settlement.',
    requiresKyc: false, createdAt: '2026-07-03T00:00:00Z',
    country: 'BR', tradedWithCurrentUser: true, blockedRelationship: false,
  },
  {
    id: 'o4', userId: 'u3', user: MOCK_USERS[2],
    asset: 'USDT_LIQUID', side: 'SELL', priceUsd: 1.0, fiatCurrency: 'BRL', priceFiat: 5.05,
    minAmount: 50, maxAmount: 5000, paymentMethod: 'PIX', status: 'ACTIVE',
    network: 'liquid', description: 'USDT on Liquid Network. PIX BRL.',
    requiresKyc: false, createdAt: '2026-07-04T00:00:00Z',
    country: 'BR', tradedWithCurrentUser: false, blockedRelationship: false,
  },
  {
    id: 'o5', userId: 'u2', user: MOCK_USERS[1],
    asset: 'USDT_ERC20', side: 'BUY', priceUsd: 0.99, fiatCurrency: 'USD', priceFiat: 0.99,
    minAmount: 100, maxAmount: 10000, paymentMethod: 'TED', status: 'ACTIVE',
    network: 'ethereum', description: 'Buying USDT ERC20. Bank transfer (USD).',
    requiresKyc: false, createdAt: '2026-07-05T00:00:00Z',
    country: 'US', tradedWithCurrentUser: false, blockedRelationship: false,
  },
  {
    id: 'o6', userId: 'u3', user: MOCK_USERS[2],
    asset: 'LIQUID_BTC', side: 'SELL', priceUsd: 67100, fiatCurrency: 'BRL', priceFiat: 337500,
    minAmount: 0.005, maxAmount: 0.1, paymentMethod: 'CRYPTO_DIRECT', status: 'ACTIVE',
    network: 'liquid', description: 'L-BTC on Liquid Network.',
    requiresKyc: false, createdAt: '2026-07-06T00:00:00Z',
    country: 'BR', tradedWithCurrentUser: false, blockedRelationship: true,
  },
  {
    id: 'o7', userId: 'u1', user: MOCK_USERS[0],
    asset: 'USDT_TRC20', side: 'SELL', priceUsd: 1.0, fiatCurrency: 'EUR', priceFiat: 0.92,
    minAmount: 50, maxAmount: 8000, paymentMethod: 'BANK_TRANSFER', status: 'ACTIVE',
    network: 'tron', description: 'USDT TRC20 for EUR bank transfer.',
    requiresKyc: false, createdAt: '2026-07-07T00:00:00Z',
    country: 'DE', tradedWithCurrentUser: false, blockedRelationship: false,
  },
  {
    id: 'o8', userId: 'u3', user: MOCK_USERS[2],
    asset: 'STACKS', side: 'BUY', priceUsd: 1.8, fiatCurrency: 'BRL', priceFiat: 9.1,
    minAmount: 100, maxAmount: 20000, paymentMethod: 'PIX', status: 'ACTIVE',
    network: 'stacks', description: 'Comprando STX. PIX apenas.',
    requiresKyc: false, createdAt: '2026-07-08T00:00:00Z',
    country: 'BR', tradedWithCurrentUser: false, blockedRelationship: false,
  },
]

const escrowEvents: EscrowEvent[] = [
  { status: 'CREATED', timestamp: '2026-07-18T09:00:00Z', actor: 'system', note: 'Escrow initialized' },
  { status: 'FUNDS_LOCKED', timestamp: '2026-07-18T09:01:00Z', actor: 'alice_btc', note: 'Funds locked by seller' },
]

export const MOCK_TRADE: Trade = {
  id: 'trade-a1b2c3d4',
  offerId: 'o1',
  offer: MOCK_OFFERS[0],
  buyer: MOCK_USERS[1],
  seller: MOCK_USERS[0],
  asset: 'BTC',
  amount: 0.005,
  priceUsd: 67500,
  totalUsd: 337.5,
  totalBrl: 1700,
  status: 'ACTIVE',
  network: 'bitcoin',
  createdAt: '2026-07-18T09:00:00Z',
  escrow: {
    id: 'esc-001',
    tradeId: 'trade-a1b2c3d4',
    type: 'MOCK',
    status: 'FUNDS_LOCKED',
    lockedAmount: 0.005,
    asset: 'BTC',
    timelockHours: 24,
    txLockId: 'mock-lock-abc123def456789',
    txReleaseId: null,
    expiresAt: '2026-07-19T09:01:00Z',
    events: escrowEvents,
  },
  messages: [
    { id: 'm1', senderId: null, sender: null, content: '🔒 Trade started. Escrow activated. 0.005 BTC locked by seller.', type: 'SYSTEM', createdAt: '2026-07-18T09:01:30Z' },
    { id: 'm2', senderId: 'u1', sender: MOCK_USERS[0], content: 'Hi! Funds are in escrow. Please send PIX to key: 11999887766 — Exact amount: R$ 1.700,00', type: 'TEXT', createdAt: '2026-07-18T09:10:00Z' },
    { id: 'm3', senderId: 'u2', sender: MOCK_USERS[1], content: 'Got it! Sending now.', type: 'TEXT', createdAt: '2026-07-18T09:15:00Z' },
    { id: 'm4', senderId: 'u2', sender: MOCK_USERS[1], content: 'Payment of R$ 1.700,00 sent via PIX. Please check your account.', type: 'PAYMENT_PROOF', createdAt: '2026-07-18T09:40:00Z' },
  ],
}

export const MOCK_TRADE_HISTORY: TradeHistoryEntry[] = [
  { id: 'th1', tradeId: 'trade-001', asset: 'BTC', amount: 0.01, totalBrl: 3400, status: 'COMPLETED', counterpart: 'alice_btc', role: 'BUYER', date: '2026-06-01' },
  { id: 'th2', tradeId: 'trade-002', asset: 'LN_BTC', amount: 0.002, totalBrl: 676, status: 'COMPLETED', counterpart: 'carol_hodl', role: 'SELLER', date: '2026-05-22' },
  { id: 'th3', tradeId: 'trade-003', asset: 'USDT_ERC20', amount: 500, totalBrl: 2495, status: 'DISPUTED', counterpart: 'bob_sats', role: 'BUYER', date: '2026-05-10' },
  { id: 'th4', tradeId: 'trade-004', asset: 'BTC', amount: 0.005, totalBrl: 1680, status: 'COMPLETED', counterpart: 'alice_btc', role: 'BUYER', date: '2026-04-30' },
]

export const MOCK_DISPUTES: Dispute[] = [
  {
    id: 'd1', tradeId: 'trade-003', asset: 'USDT_ERC20', amount: 500,
    buyer: MOCK_USERS[1], seller: MOCK_USERS[2],
    reason: 'Payment sent but seller claims not received. PIX receipt attached.',
    status: 'OPENED', openedAt: '2026-07-16T12:00:00Z', openedBy: 'u2',
  },
  {
    id: 'd2', tradeId: 'trade-009', asset: 'BTC', amount: 0.02,
    buyer: MOCK_USERS[0], seller: MOCK_USERS[1],
    reason: 'Seller unresponsive for 6 hours after funds locked.',
    status: 'ARBITRATED', openedAt: '2026-07-17T18:00:00Z', openedBy: 'u1',
  },
]

export const CHART_DATA = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.now() - (29 - i) * 86400000)
  return {
    date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    volume: Number((Math.random() * 2 + 0.5).toFixed(2)),
    trades: Math.floor(Math.random() * 20 + 5),
  }
})

// The real AssetType enum (prisma/schema.prisma) — not a fictional
// list. Alphabetical order (2026-07-29, requested directly) — by the
// asset *code* itself, since AssetPicker renders the raw code, not
// ASSET_LABELS' friendly name.
//
// USDT_ERC20 briefly removed from this list (2026-07-28) on a wrong
// assumption that it had no multisig escrow path — reverted the same
// day after checking settlement.routes.ts directly: `SAFE_GUARD_EVM`
// (SailsEscrowSafe, RFC-020) is a real, registered EscrowType, a 2-of-3
// Safe multisig (buyer + seller + KMS co-signer) that's asset-agnostic
// within EVM, not restricted to native ETH — it covers USDT_ERC20 the
// same as `MultisigProvider` covers the Bitcoin-family assets here.
//
// SPARK removed 2026-07-29 (requested directly, verified before acting
// this time — see types.ts's own comment) — genuinely has zero
// settlement-provider wiring anywhere in the real backend, unlike
// USDT_ERC20's confirmed path above.
export const ASSETS = ['BTC', 'LIQUID_BTC', 'LN_BTC', 'RSK_BTC', 'STACKS', 'USDT_ERC20', 'USDT_LIGHTNING', 'USDT_LIQUID', 'USDT_TRC20'] as const

// Adds the UI-only assets (types.ts's own comment has the full sourcing)
// on top of the real list above, alphabetically merged in (not
// appended) — filter/display + Marketplace's own discover() fan-out
// (lib/realOffers.ts), never PublishOffer.tsx's real submission (that
// page deliberately keeps importing `ASSETS`, not this). Note
// `LIQUID_BTC`/`USDT_LIQUID` above already are "L-BTC"/the real Liquid-
// network USD stablecoin — no separate value was needed for those.
export const ASSETS_FILTERABLE = [
  'BNB', 'BTC', 'DEPIX', 'ETH', 'LIQUID_BTC', 'LN_BTC', 'LTC', 'RSK_BTC',
  'SBTC_STACKS', 'SOL', 'STACKS', 'USDC_BASE', 'USDC_ERC20', 'USDC_POLYGON', 'USDCX_STACKS',
  'USDT_ERC20', 'USDT_LIGHTNING', 'USDT_LIQUID', 'USDT_TRC20', 'WBTC',
] as const

// The real backend `PaymentMethod` enum (prisma/schema.prisma) exactly —
// used anywhere a value round-trips to a real @sails/sdk call
// (PublishOffer.tsx's `liquidity.publish()`, a live POST). Alphabetical
// by the friendly label (PAYMENT_METHOD_LABELS), matching what
// PaymentMethodPicker/FilterPanel/PublishOffer's own <select> actually
// render, not by this array's own raw key spelling.
export const PAYMENT_METHODS = ['CRYPTO_DIRECT', 'CASH', 'LIGHTNING_DIRECT', 'OTHER', 'PIX', 'TED', 'BANK_TRANSFER'] as const

// Adds the UI-only payment methods (see types.ts's own comment for the
// full per-platform sourcing) on top of the real list above, alphabetized
// by friendly label across the *whole* merged set (not real-then-extra) —
// filter/display contexts only (Marketplace's PaymentMethodPicker,
// FilterPanel), never PublishOffer.tsx's real submission (that page's own
// comment on why). Exhaustive per the direct request: every method
// actually listed by at least one of HodlHodl, Airtm, El Dorado, Noones,
// or Binance P2P (PicPay specifically), not just the ones repeated across
// all of them.
export const PAYMENT_METHODS_FILTERABLE = [
  'ADVCASH', 'BANCOLOMBIA', 'BOLETO', 'CREDIT_DEBIT_CARD', 'CASH_APP', 'CRYPTO_DIRECT',
  'DEPIX', 'LOTERICA_DEPOSIT', 'CASH', 'MOBILE_MONEY', 'CASH_BY_MAIL', 'LIGHTNING_DIRECT',
  'MERCADO_PAGO', 'NETELLER', 'NEQUI', 'OTHER', 'PAYEER', 'PAYONEER', 'PAYPAL', 'PERFECT_MONEY',
  'PICPAY', 'PIX', 'PLIN', 'REVOLUT', 'SKRILL', 'TED', 'BANK_TRANSFER', 'GIFT_CARD', 'VENMO', 'WALLY',
  'WEBMONEY', 'WISE', 'YAPE', 'ZELLE', 'ZINLI',
] as const

export const COUNTRIES: { code: string; label: string }[] = [
  { code: 'BR', label: 'Brasil' },
  { code: 'US', label: 'Estados Unidos' },
  { code: 'DE', label: 'Alemanha' },
  { code: 'AR', label: 'Argentina' },
  { code: 'MX', label: 'México' },
  { code: 'NG', label: 'Nigéria' },
  { code: 'IN', label: 'Índia' },
  { code: 'PT', label: 'Portugal' },
  // Added 2026-07-29 alongside FiatCurrency's own VES/COP/PEN/BOB/EGP —
  // see that type's comment in types.ts for the Airtm/El Dorado sourcing.
  { code: 'VE', label: 'Venezuela' },
  { code: 'CO', label: 'Colômbia' },
  { code: 'PE', label: 'Peru' },
  { code: 'BO', label: 'Bolívia' },
  { code: 'EG', label: 'Egito' },
]

// Threshold for the "somente comerciantes com alta reputação" filter —
// illustrative, not derived from any real scoring rubric.
export const HIGH_REPUTATION_THRESHOLD = 90
