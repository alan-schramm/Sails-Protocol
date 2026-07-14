/**
 * Escrow-specific enums — DATABASE.md §2. Kept in their own file
 * (trade.ts) rather than folded into common/types/index.ts because
 * escrow.service.ts is the only current consumer — matches the file
 * layout TODO.md already documented as expected.
 */
export type EscrowType = 'MULTISIG' | 'LIGHTNING_HODL' | 'LIQUID_COVENANT' | 'MOCK'

export type EscrowStatus =
  | 'CREATED' | 'FUNDS_LOCKED' | 'PAYMENT_PENDING' | 'COMPLETED' | 'DISPUTED' | 'REFUNDED'
