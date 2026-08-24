/**
 * Escrow-specific enums — DATABASE.md §2. Kept in their own file
 * (trade.ts) rather than folded into common/types/index.ts because
 * escrow.service.ts is the only current consumer — matches the file
 * layout TODO.md already documented as expected.
 */
export type EscrowType = 'MULTISIG' | 'LIGHTNING_HODL' | 'LIQUID_COVENANT' | 'WDK_USDT_EVM' | 'SAFE_GUARD_EVM' | 'MOCK'

// Missão 11 Fase 7.3 (cumulative audit) — EXPIRED added: real Prisma
// EscrowStatus enum value (prisma/schema.prisma) this mirror had drifted
// behind. Genuinely unused today (no real import of this named type
// exists anywhere in src/, confirmed by direct search) but fixed for
// consistency — an omission caused directly by adding EXPIRED, not
// speculative additional scope.
export type EscrowStatus =
  | 'CREATED' | 'FUNDS_LOCKED' | 'PAYMENT_PENDING' | 'COMPLETED' | 'DISPUTED' | 'REFUNDED' | 'SPLIT' | 'EXPIRED'
