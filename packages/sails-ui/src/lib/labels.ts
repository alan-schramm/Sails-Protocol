/**
 * Human-friendly display labels for raw backend enum values
 * (AssetType/PaymentMethod, prisma/schema.prisma) — found missing during
 * a cold-start UX walkthrough (asked directly: "consegue perceber a UX
 * na prática?"): `USDT_ERC20`, `BANK_TRANSFER`, `CRYPTO_DIRECT` etc. were
 * showing up verbatim in offer cards, filters, and forms — code
 * identifiers, not interface copy. The underlying value is unchanged
 * everywhere (still what's stored/filtered/submitted); only what's
 * rendered to a person changes.
 */
import type { AssetType, PaymentMethod } from '../types'

export const ASSET_LABELS: Record<AssetType, string> = {
  BTC: 'Bitcoin',
  LN_BTC: 'Bitcoin (Lightning)',
  LIQUID_BTC: 'Bitcoin (Liquid)',
  RSK_BTC: 'Bitcoin (RSK)',
  USDT_ERC20: 'USDT (ERC-20)',
  USDT_TRC20: 'USDT (TRC-20)',
  USDT_LIQUID: 'USDT (Liquid)',
  USDT_LIGHTNING: 'USDT (Lightning)',
  SPARK: 'Spark',
  STACKS: 'Stacks (STX)',
}

// Compact form for space-constrained spots (an input's inline unit
// suffix, a chart axis) where the full parenthetical label
// ("USDT (ERC-20)") would overlap typed digits.
export const ASSET_SHORT_LABELS: Record<AssetType, string> = {
  BTC: 'BTC',
  LN_BTC: 'BTC-LN',
  LIQUID_BTC: 'L-BTC',
  RSK_BTC: 'RSK-BTC',
  USDT_ERC20: 'USDT',
  USDT_TRC20: 'USDT',
  USDT_LIQUID: 'USDT',
  USDT_LIGHTNING: 'USDT',
  SPARK: 'SPARK',
  STACKS: 'STX',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  TED: 'TED',
  BANK_TRANSFER: 'Transferência bancária',
  CRYPTO_DIRECT: 'Cripto direto',
  LIGHTNING_DIRECT: 'Lightning direto',
  CASH: 'Dinheiro em espécie',
  OTHER: 'Outro',
}
