/**
 * Fase 6 — re-exports `@sails/sdk-react`'s real, already-tested
 * `TradeCard` (`packages/sdk-react/src/components/trade/TradeCard.tsx`)
 * rather than rebuilding a second copy. Kept as its own file (not just
 * "import from @sails/sdk-react directly everywhere") so this starter's
 * own `app/` pages have one obvious local import path to customize
 * later — e.g. wrapping it with project-specific styling — without
 * having to first go find where the real component lives.
 */
export { TradeCard, type TradeCardProps, type TradeCardVariant } from '@sails/sdk-react'
