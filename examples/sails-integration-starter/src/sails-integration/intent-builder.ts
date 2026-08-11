/**
 * Fase 6 — real helpers for building `TradeIntentPayload` objects for
 * `SailsClient.createIntent('TradeIntent', payload)` — the real,
 * working entry point of the six-verb intent facade
 * (`packages/sails-sdk/src/intent-facade.ts`). Deliberately no helpers
 * for `negotiate()`/`submitProof()`/`releaseAsset()` — those three
 * throw `SailsNotImplementedError` unconditionally today (verified by
 * reading `intent-facade.ts` directly before writing this file); a
 * "builder" for calls that always fail would be dishonest scaffolding,
 * not a real integration helper.
 *
 * `TradeIntentPayload`'s real shape (`packages/sails-sdk/src/types.ts`)
 * has only `asset`/`side` as required — everything else is optional.
 */
import type { TradeIntentPayload, AssetType, TradeSide } from '@satsails/p2p-trading-sdk'

export interface BuildTradeIntentInput {
  asset: AssetType | string
  side: TradeSide
  maxValue?: string
  minValue?: string
  currency?: string
  fiatMethod?: string
  network?: string
  slippageTolerance?: number
  minReputationRating?: number
}

// RFC-009 — priceUsd/amount/lockedAmount/maxValue/minValue must always
// be decimal strings, never a JS `number`, to avoid float precision
// loss once these values cross a JSON boundary and get persisted. This
// runtime check exists specifically so a caller passing a number by
// mistake fails loudly here, not silently 400s (or worse, silently
// rounds) three network hops away inside the real server.
function assertDecimalString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a decimal string (e.g. "100.00"), never a number — RFC-009. Got: ${typeof value}`)
  }
}

export function buildTradeIntentPayload(input: BuildTradeIntentInput): TradeIntentPayload {
  if (input.maxValue !== undefined) assertDecimalString(input.maxValue, 'maxValue')
  if (input.minValue !== undefined) assertDecimalString(input.minValue, 'minValue')

  const payload: TradeIntentPayload = { asset: input.asset, side: input.side }
  if (input.maxValue !== undefined) payload.maxValue = input.maxValue
  if (input.minValue !== undefined) payload.minValue = input.minValue
  if (input.currency !== undefined) payload.currency = input.currency
  if (input.fiatMethod !== undefined) payload.fiatMethod = input.fiatMethod
  if (input.network !== undefined) payload.network = input.network
  if (input.slippageTolerance !== undefined) payload.slippageTolerance = input.slippageTolerance
  if (input.minReputationRating !== undefined) payload.minReputationRating = input.minReputationRating
  return payload
}

export function buildBuyIntent(asset: AssetType | string, opts: Omit<BuildTradeIntentInput, 'asset' | 'side'> = {}): TradeIntentPayload {
  return buildTradeIntentPayload({ ...opts, asset, side: 'BUY' })
}

export function buildSellIntent(asset: AssetType | string, opts: Omit<BuildTradeIntentInput, 'asset' | 'side'> = {}): TradeIntentPayload {
  return buildTradeIntentPayload({ ...opts, asset, side: 'SELL' })
}
