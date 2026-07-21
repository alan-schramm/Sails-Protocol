/**
 * Shared enums — must match DATABASE.md §2 exactly, since Prisma generates
 * its own TypeScript types from schema.prisma with these same names.
 */
export type AssetType =
  | 'BTC' | 'USDT_ERC20' | 'USDT_TRC20' | 'USDT_LIQUID' | 'USDT_LIGHTNING'
  | 'LN_BTC' | 'LIQUID_BTC' | 'SPARK' | 'STACKS' | 'RSK_BTC'

export type TradeSide = 'BUY' | 'SELL'

export type OfferStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'

export type TradeStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'DISPUTED' | 'CANCELLED'

export type PaymentMethod =
  | 'PIX' | 'TED' | 'BANK_TRANSFER' | 'CRYPTO_DIRECT' | 'LIGHTNING_DIRECT' | 'CASH' | 'OTHER'

// Same list packages/sails-ui/src/types.ts's FiatCurrency already
// declares (AMOUNT_PRESETS/ILLUSTRATIVE_FX_TO_USD in that package's
// currency.ts are keyed to exactly these 8) — declared here too so the
// backend has its own real enum to validate against instead of an open
// `string`. Fase 1 Red Team finding: TradeIntentPayload.currency/
// fiatMethod were `z.string()` with no restriction at
// tradeIntentPayloadSchema (routes/intentRoutes.ts), letting adversarial
// free text reach QvacAgentProvider.assessIntentRisk()'s prompt
// unsanitized (tests/qvac-prompt-injection.test.ts) — this closes that
// vector at its root, not just at the prompt-construction layer.
export type FiatCurrency = 'BRL' | 'USD' | 'EUR' | 'GBP' | 'ARS' | 'MXN' | 'NGN' | 'INR'
