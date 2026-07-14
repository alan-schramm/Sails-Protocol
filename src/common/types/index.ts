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
