/**
 * Corrected 2026-08-04 — this header used to claim "no real @sails/sdk
 * or backend call happens anywhere in this UI yet," long since false
 * (README.md's own "What this is not" has the real, dated migration
 * history). Most of what's left here is reference/seed data, not fake
 * user data standing in for a real API: `ASSETS`/`ASSETS_FILTERABLE`,
 * `PAYMENT_METHODS`/`PAYMENT_METHODS_FILTERABLE`, `COUNTRIES` back real
 * pickers/filters. Genuinely still mock: `MOCK_OFFERS` (only
 * `PublishOffer.tsx`'s "suggested price range" helper reads it now —
 * everywhere else moved to `lib/realOffers.ts`'s real `discover()` fan-
 * out). `MOCK_USERS`/`CURRENT_USER`/`MOCK_TRADE` (and `lib/buildTrade.ts`,
 * which consumes it) are dead code, not wired to anything real or
 * shown anywhere — kept here undisturbed rather than deleted as a side
 * effect of an unrelated pass, but not a gap to fill either.
 */
import type { User, Offer, Trade, EscrowEvent } from '../types'

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

// MOCK_TRADE_HISTORY, MOCK_DISPUTES, and CHART_DATA removed 2026-08-04 —
// they existed only to feed pages/admin/Dashboard.tsx's and
// ManageOffers.tsx's fake "operator sees every user's trades/disputes/
// platform-wide volume" view, deleted the same day (see
// feedback_no_platform_operator_visibility, memory: this protocol's
// authorization model has no platform-operator tier, by design — the
// mock data existed only to make that non-existent tier look real).
// TradeHistory.tsx uses real openp2p.getTrades() instead;
// pages/Disputes.tsx uses real settlement.listDisputes(), correctly
// scoped to the caller's own arbiterId, not "every dispute."

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
  // HodlHodl (2026-08-01) — see types.ts's own comment on this same group
  // for why these 8 and not HodlHodl's full bank-name-granular list.
  'UPI', 'INTERAC', 'ALIPAY', 'WECHAT_PAY', 'BIZUM', 'AIRTM', 'ASTROPAY', 'BINANCE_PAY',
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
  // HodlHodl (hodlhodl.com/offers, live filter dropdown checked
  // 2026-08-01 — requested directly, "escolher os mesmos que a HodlHodl
  // tem disponível") — its own country picker is the full ISO-3166 list,
  // not a curated business decision, so skipped here: Antarctica, Bouvet
  // Island, Heard Island and McDonald Islands, French Southern and
  // Antarctic Lands (no permanent population, zero realistic P2P
  // trading relevance). Everything else HodlHodl lists is kept, even
  // small/low-volume territories, since "match HodlHodl" was the direct
  // ask for this list specifically (unlike payment methods above, no
  // "skip inefficient ones" caveat was given for countries).
  { code: 'AF', label: 'Afeganistão' },
  { code: 'AL', label: 'Albânia' },
  { code: 'DZ', label: 'Argélia' },
  { code: 'AD', label: 'Andorra' },
  { code: 'AO', label: 'Angola' },
  { code: 'AI', label: 'Anguila' },
  { code: 'AG', label: 'Antígua e Barbuda' },
  { code: 'AM', label: 'Armênia' },
  { code: 'AW', label: 'Aruba' },
  { code: 'AU', label: 'Austrália' },
  { code: 'AT', label: 'Áustria' },
  { code: 'AZ', label: 'Azerbaijão' },
  { code: 'BH', label: 'Bahrein' },
  { code: 'BD', label: 'Bangladesh' },
  { code: 'BB', label: 'Barbados' },
  { code: 'BE', label: 'Bélgica' },
  { code: 'BZ', label: 'Belize' },
  { code: 'BJ', label: 'Benin' },
  { code: 'BM', label: 'Bermudas' },
  { code: 'BT', label: 'Butão' },
  { code: 'BA', label: 'Bósnia e Herzegovina' },
  { code: 'BW', label: 'Botsuana' },
  { code: 'IO', label: 'Território Britânico do Oceano Índico' },
  { code: 'VG', label: 'Ilhas Virgens Britânicas' },
  { code: 'BN', label: 'Brunei' },
  { code: 'BG', label: 'Bulgária' },
  { code: 'BF', label: 'Burkina Faso' },
  { code: 'BI', label: 'Burundi' },
  { code: 'KH', label: 'Camboja' },
  { code: 'CM', label: 'Camarões' },
  { code: 'CA', label: 'Canadá' },
  { code: 'CV', label: 'Cabo Verde' },
  { code: 'KY', label: 'Ilhas Cayman' },
  { code: 'CF', label: 'República Centro-Africana' },
  { code: 'TD', label: 'Chade' },
  { code: 'CL', label: 'Chile' },
  { code: 'CN', label: 'China' },
  { code: 'CX', label: 'Ilha Christmas' },
  { code: 'CC', label: 'Ilhas Cocos (Keeling)' },
  { code: 'KM', label: 'Comores' },
  { code: 'CK', label: 'Ilhas Cook' },
  { code: 'CR', label: 'Costa Rica' },
  { code: 'CI', label: 'Costa do Marfim' },
  { code: 'HR', label: 'Croácia' },
  { code: 'CU', label: 'Cuba' },
  { code: 'CW', label: 'Curaçao' },
  { code: 'CY', label: 'Chipre' },
  { code: 'CZ', label: 'República Tcheca' },
  { code: 'CD', label: 'República Democrática do Congo' },
  { code: 'DK', label: 'Dinamarca' },
  { code: 'DJ', label: 'Djibuti' },
  { code: 'DM', label: 'Dominica' },
  { code: 'DO', label: 'República Dominicana' },
  { code: 'TL', label: 'Timor-Leste' },
  { code: 'EC', label: 'Equador' },
  { code: 'SV', label: 'El Salvador' },
  { code: 'GQ', label: 'Guiné Equatorial' },
  { code: 'ER', label: 'Eritreia' },
  { code: 'EE', label: 'Estônia' },
  { code: 'ET', label: 'Etiópia' },
  { code: 'FK', label: 'Ilhas Malvinas' },
  { code: 'FO', label: 'Ilhas Faroé' },
  { code: 'FM', label: 'Micronésia' },
  { code: 'FJ', label: 'Fiji' },
  { code: 'FI', label: 'Finlândia' },
  { code: 'FR', label: 'França' },
  { code: 'GF', label: 'Guiana Francesa' },
  { code: 'PF', label: 'Polinésia Francesa' },
  { code: 'GA', label: 'Gabão' },
  { code: 'GE', label: 'Geórgia' },
  { code: 'GH', label: 'Gana' },
  { code: 'GI', label: 'Gibraltar' },
  { code: 'GR', label: 'Grécia' },
  { code: 'GL', label: 'Groenlândia' },
  { code: 'GD', label: 'Granada' },
  { code: 'GP', label: 'Guadalupe' },
  { code: 'GT', label: 'Guatemala' },
  { code: 'GN', label: 'Guiné' },
  { code: 'GW', label: 'Guiné-Bissau' },
  { code: 'GY', label: 'Guiana' },
  { code: 'HT', label: 'Haiti' },
  { code: 'VA', label: 'Vaticano' },
  { code: 'HN', label: 'Honduras' },
  { code: 'HK', label: 'Hong Kong' },
  { code: 'HU', label: 'Hungria' },
  { code: 'IS', label: 'Islândia' },
  { code: 'ID', label: 'Indonésia' },
  { code: 'IR', label: 'Irã' },
  { code: 'IE', label: 'Irlanda' },
  { code: 'IL', label: 'Israel' },
  { code: 'IT', label: 'Itália' },
  { code: 'JM', label: 'Jamaica' },
  { code: 'SJ', label: 'Jan Mayen' },
  { code: 'JP', label: 'Japão' },
  { code: 'JO', label: 'Jordânia' },
  { code: 'KZ', label: 'Cazaquistão' },
  { code: 'KE', label: 'Quênia' },
  { code: 'KI', label: 'Kiribati' },
  { code: 'XK', label: 'Kosovo' },
  { code: 'KW', label: 'Kuwait' },
  { code: 'KG', label: 'Quirguistão' },
  { code: 'LA', label: 'Laos' },
  { code: 'LV', label: 'Letônia' },
  { code: 'LB', label: 'Líbano' },
  { code: 'LS', label: 'Lesoto' },
  { code: 'LR', label: 'Libéria' },
  { code: 'LY', label: 'Líbia' },
  { code: 'LI', label: 'Liechtenstein' },
  { code: 'LT', label: 'Lituânia' },
  { code: 'LU', label: 'Luxemburgo' },
  { code: 'MO', label: 'Macau' },
  { code: 'MK', label: 'Macedônia do Norte' },
  { code: 'MG', label: 'Madagascar' },
  { code: 'MW', label: 'Malawi' },
  { code: 'MY', label: 'Malásia' },
  { code: 'MV', label: 'Maldivas' },
  { code: 'ML', label: 'Mali' },
  { code: 'MT', label: 'Malta' },
  { code: 'MH', label: 'Ilhas Marshall' },
  { code: 'MQ', label: 'Martinica' },
  { code: 'MR', label: 'Mauritânia' },
  { code: 'MU', label: 'Maurício' },
  { code: 'YT', label: 'Mayotte' },
  { code: 'MC', label: 'Mônaco' },
  { code: 'MN', label: 'Mongólia' },
  { code: 'ME', label: 'Montenegro' },
  { code: 'MS', label: 'Montserrat' },
  { code: 'MA', label: 'Marrocos' },
  { code: 'MZ', label: 'Moçambique' },
  { code: 'MM', label: 'Mianmar' },
  { code: 'NA', label: 'Namíbia' },
  { code: 'NR', label: 'Nauru' },
  { code: 'NP', label: 'Nepal' },
  { code: 'NL', label: 'Países Baixos' },
  { code: 'NC', label: 'Nova Caledônia' },
  { code: 'NZ', label: 'Nova Zelândia' },
  { code: 'NI', label: 'Nicarágua' },
  { code: 'NE', label: 'Níger' },
  { code: 'NU', label: 'Niue' },
  { code: 'NF', label: 'Ilha Norfolk' },
  { code: 'NO', label: 'Noruega' },
  { code: 'OM', label: 'Omã' },
  { code: 'PK', label: 'Paquistão' },
  { code: 'PW', label: 'Palau' },
  { code: 'PA', label: 'Panamá' },
  { code: 'PG', label: 'Papua-Nova Guiné' },
  { code: 'PY', label: 'Paraguai' },
  { code: 'PH', label: 'Filipinas' },
  { code: 'PN', label: 'Ilhas Pitcairn' },
  { code: 'PL', label: 'Polônia' },
  { code: 'QA', label: 'Catar' },
  { code: 'MD', label: 'Moldávia' },
  { code: 'CG', label: 'República do Congo' },
  { code: 'RE', label: 'Reunião' },
  { code: 'RO', label: 'Romênia' },
  { code: 'RW', label: 'Ruanda' },
  { code: 'SH', label: 'Santa Helena' },
  { code: 'KN', label: 'São Cristóvão e Névis' },
  { code: 'LC', label: 'Santa Lúcia' },
  { code: 'PM', label: 'Saint-Pierre e Miquelon' },
  { code: 'VC', label: 'São Vicente e Granadinas' },
  { code: 'WS', label: 'Samoa' },
  { code: 'SM', label: 'San Marino' },
  { code: 'ST', label: 'São Tomé e Príncipe' },
  { code: 'SA', label: 'Arábia Saudita' },
  { code: 'SN', label: 'Senegal' },
  { code: 'RS', label: 'Sérvia' },
  { code: 'SC', label: 'Seicheles' },
  { code: 'SL', label: 'Serra Leoa' },
  { code: 'SG', label: 'Cingapura' },
  { code: 'SK', label: 'Eslováquia' },
  { code: 'SI', label: 'Eslovênia' },
  { code: 'SB', label: 'Ilhas Salomão' },
  { code: 'SO', label: 'Somália' },
  { code: 'ZA', label: 'África do Sul' },
  { code: 'GS', label: 'Geórgia do Sul' },
  { code: 'KR', label: 'Coreia do Sul' },
  { code: 'SS', label: 'Sudão do Sul' },
  { code: 'ES', label: 'Espanha' },
  { code: 'LK', label: 'Sri Lanka' },
  { code: 'PS', label: 'Palestina' },
  { code: 'SR', label: 'Suriname' },
  { code: 'SZ', label: 'Essuatíni' },
  { code: 'SE', label: 'Suécia' },
  { code: 'CH', label: 'Suíça' },
  { code: 'TW', label: 'Taiwan' },
  { code: 'TJ', label: 'Tajiquistão' },
  { code: 'TZ', label: 'Tanzânia' },
  { code: 'TH', label: 'Tailândia' },
  { code: 'BS', label: 'Bahamas' },
  { code: 'GM', label: 'Gâmbia' },
  { code: 'TG', label: 'Togo' },
  { code: 'TK', label: 'Tokelau' },
  { code: 'TO', label: 'Tonga' },
  { code: 'TT', label: 'Trindade e Tobago' },
  { code: 'TN', label: 'Tunísia' },
  { code: 'TR', label: 'Turquia' },
  { code: 'TM', label: 'Turcomenistão' },
  { code: 'TC', label: 'Ilhas Turcas e Caicos' },
  { code: 'TV', label: 'Tuvalu' },
  { code: 'UG', label: 'Uganda' },
  { code: 'UA', label: 'Ucrânia' },
  { code: 'AE', label: 'Emirados Árabes Unidos' },
  { code: 'GB', label: 'Reino Unido' },
  { code: 'UY', label: 'Uruguai' },
  { code: 'UZ', label: 'Uzbequistão' },
  { code: 'VU', label: 'Vanuatu' },
  { code: 'VN', label: 'Vietnã' },
  { code: 'WF', label: 'Wallis e Futuna' },
  { code: 'EH', label: 'Saara Ocidental' },
  { code: 'YE', label: 'Iêmen' },
  { code: 'ZM', label: 'Zâmbia' },
  { code: 'ZW', label: 'Zimbábue' },
]

// Threshold for the "somente comerciantes com alta reputação" filter —
// illustrative, not derived from any real scoring rubric.
export const HIGH_REPUTATION_THRESHOLD = 90
