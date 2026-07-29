/**
 * Fase 6 — re-exports `@sails/sdk-react`'s real, already-tested
 * `TradeStatusBadge`/`EscrowStatusBadge`
 * (`packages/sdk-react/src/components/trade/StatusBadge.tsx`) rather
 * than rebuilding fresh copies. Same reasoning as `./TradeCard.tsx`.
 */
export { TradeStatusBadge, EscrowStatusBadge, type TradeStatusBadgeProps, type EscrowStatusBadgeProps } from '@sails/sdk-react'
