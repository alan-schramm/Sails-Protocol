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
    asset: 'BTC', side: 'SELL', priceUsd: 67500, priceBrl: 340000,
    minAmount: 0.001, maxAmount: 0.05, paymentMethod: 'PIX', status: 'ACTIVE',
    network: 'bitcoin', description: 'Fast PIX settlement. No KYC < 0.01 BTC. Online 24/7.',
    requiresKyc: false, createdAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'o2', userId: 'u2', user: MOCK_USERS[1],
    asset: 'BTC', side: 'BUY', priceUsd: 66800, priceBrl: 336000,
    minAmount: 0.001, maxAmount: 0.02, paymentMethod: 'PIX', status: 'ACTIVE',
    network: 'bitcoin', description: 'Looking for BTC. Instant PIX payment.',
    requiresKyc: false, createdAt: '2026-07-02T00:00:00Z',
  },
  {
    id: 'o3', userId: 'u1', user: MOCK_USERS[0],
    asset: 'LN_BTC', side: 'SELL', priceUsd: 67200, priceBrl: 338000,
    minAmount: 0.0001, maxAmount: 0.005, paymentMethod: 'PIX', status: 'ACTIVE',
    network: 'lightning', description: 'Lightning sats via PIX. Instant settlement.',
    requiresKyc: false, createdAt: '2026-07-03T00:00:00Z',
  },
  {
    id: 'o4', userId: 'u3', user: MOCK_USERS[2],
    asset: 'USDT_LIQUID', side: 'SELL', priceUsd: 1.0, priceBrl: 5.05,
    minAmount: 50, maxAmount: 5000, paymentMethod: 'PIX', status: 'ACTIVE',
    network: 'liquid', description: 'USDT on Liquid Network. PIX BRL.',
    requiresKyc: false, createdAt: '2026-07-04T00:00:00Z',
  },
  {
    id: 'o5', userId: 'u2', user: MOCK_USERS[1],
    asset: 'USDT_ERC20', side: 'BUY', priceUsd: 0.99, priceBrl: 4.99,
    minAmount: 100, maxAmount: 10000, paymentMethod: 'TED', status: 'ACTIVE',
    network: 'ethereum', description: 'Buying USDT ERC20. TED bank transfer.',
    requiresKyc: false, createdAt: '2026-07-05T00:00:00Z',
  },
  {
    id: 'o6', userId: 'u3', user: MOCK_USERS[2],
    asset: 'LIQUID_BTC', side: 'SELL', priceUsd: 67100, priceBrl: 337500,
    minAmount: 0.005, maxAmount: 0.1, paymentMethod: 'CRYPTO_DIRECT', status: 'ACTIVE',
    network: 'liquid', description: 'L-BTC on Liquid Network.',
    requiresKyc: false, createdAt: '2026-07-06T00:00:00Z',
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

export const ASSETS = ['BTC', 'LN_BTC', 'LIQUID_BTC', 'USDT_ERC20', 'USDT_TRC20', 'USDT_LIQUID', 'USDT_LIGHTNING', 'SPARK', 'STACKS', 'RSK_BTC'] as const
export const PAYMENT_METHODS = ['PIX', 'TED', 'BANK_TRANSFER', 'CRYPTO_DIRECT', 'LIGHTNING_DIRECT', 'CASH', 'OTHER'] as const
