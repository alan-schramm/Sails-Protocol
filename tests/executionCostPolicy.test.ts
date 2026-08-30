/**
 * Sails Core Implementation Program M8.6 (Execution Cost Semantics &
 * Live Correspondence Closure) — pure unit tests for
 * execution-cost-policy.ts, the narrow, deterministic, non-oracle model
 * this mission derives for how a Bitcoin MULTISIG rail's real miner fee
 * relates to an authorized economic Outcome.
 */
import { estimatedVBytesForOutputCount, maxExecutionCostSats, deriveDistributableTotal } from '../src/modules/open-settlement/execution-cost-policy'

describe('estimatedVBytesForOutputCount — deterministic, matches multisig.provider.ts\'s own real formula exactly', () => {
  it('1 output (RELEASE/REFUND)', () => {
    expect(estimatedVBytesForOutputCount(1)).toBe(11 + 110 + 43)
  })
  it('2 outputs (SPLIT)', () => {
    expect(estimatedVBytesForOutputCount(2)).toBe(11 + 110 + 86)
  })
})

describe('maxExecutionCostSats — the SMALLER of the rate bound and the proportional bound (P9/P10/P12)', () => {
  it('for a LARGE escrow, the rate bound is smaller (dominant, legitimately permissive)', () => {
    const grossSats = 100_000_000n // 1 BTC
    const rateBound = BigInt(Math.ceil(200 * estimatedVBytesForOutputCount(1))) // default config: 200 sat/vB
    const proportionalBound = (grossSats * 2000n) / 10000n // default: 20%
    expect(rateBound).toBeLessThan(proportionalBound)
    expect(maxExecutionCostSats(1, grossSats)).toBe(rateBound)
  })

  it('for a SMALL escrow, the proportional bound is smaller (dominant, protective) — this is the exact fix for the pure-rate-ceiling gap found while testing dispatch-translation-guard.ts', () => {
    const grossSats = 100_000n
    const rateBound = BigInt(Math.ceil(200 * estimatedVBytesForOutputCount(1))) // 32,800
    const proportionalBound = (grossSats * 2000n) / 10000n // 20% of 100,000 = 20,000
    expect(proportionalBound).toBeLessThan(rateBound)
    expect(maxExecutionCostSats(1, grossSats)).toBe(proportionalBound)
  })

  it('is deterministic — repeated calls with the same input produce the identical result', () => {
    const results = new Set(Array.from({ length: 5 }, () => maxExecutionCostSats(2, 250_000n).toString()))
    expect(results.size).toBe(1)
  })

  it('for a NEAR-DUST escrow, the absolute floor dominates — a real, honest, minimal fee is never rejected merely because it is a large PERCENTAGE of a tiny total (found directly while validating against this repo\'s own dust-policy test fixtures)', () => {
    const grossSats = 1_000n // near-dust-sized, as real dust-policy tests use
    const proportionalBound = (grossSats * 2000n) / 10000n // 20% of 1,000 = 200
    expect(proportionalBound).toBeLessThan(10_000n) // the default floor
    expect(maxExecutionCostSats(1, grossSats)).toBe(10_000n) // floor wins, not the tiny proportional bound
  })
})

describe('deriveDistributableTotal — the central execution-cost check', () => {
  it('COST-1: legitimate miner fee, well within both ceilings -> ok', () => {
    const result = deriveDistributableTotal(100_000n, 99_500n, 1) // 500 sat fee
    expect(result).toEqual({ ok: true, distributable: 99_500n, impliedFeeSats: 500n })
  })

  it('COST-2: zero miner fee (exact match) -> ok', () => {
    const result = deriveDistributableTotal(100_000n, 100_000n, 1)
    expect(result).toEqual({ ok: true, distributable: 100_000n, impliedFeeSats: 0n })
  })

  it('COST-3: excessive fee (exceeds both ceilings) -> rejected', () => {
    const result = deriveDistributableTotal(100_000n, 50_000n, 1) // "50,000 sat fee"
    expect(result.ok).toBe(false)
  })

  it('a fee exceeding ONLY the proportional ceiling (small escrow) is rejected even though the rate alone would look plausible', () => {
    const result = deriveDistributableTotal(100_000n, 75_000n, 1) // 25,000 sats implied fee: ~152 sat/vB (under the 200 sat/vB rate ceiling) but 25% of gross (over the 20% proportional ceiling)
    expect(result.ok).toBe(false)
  })

  it('conservation violation: delivered total exceeding gross entitlement is rejected with its own distinct reason (never silently treated as "negative fee")', () => {
    const result = deriveDistributableTotal(100_000n, 150_000n, 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/exceeds the authorized gross entitlement/)
  })

  it('a fee exactly AT the ceiling boundary is accepted (inclusive)', () => {
    const grossSats = 100_000n
    const ceiling = maxExecutionCostSats(1, grossSats)
    const result = deriveDistributableTotal(grossSats, grossSats - ceiling, 1)
    expect(result.ok).toBe(true)
  })

  it('a fee one sat ABOVE the ceiling boundary is rejected', () => {
    const grossSats = 100_000n
    const ceiling = maxExecutionCostSats(1, grossSats)
    const result = deriveDistributableTotal(grossSats, grossSats - ceiling - 1n, 1)
    expect(result.ok).toBe(false)
  })

  it('SPLIT (outputCount=2) uses the 2-output vsize/ceiling, not the 1-output one', () => {
    const grossSats = 100_000_000n // large enough that the rate bound dominates for both counts
    const oneOutputCeiling = maxExecutionCostSats(1, grossSats)
    const twoOutputCeiling = maxExecutionCostSats(2, grossSats)
    expect(twoOutputCeiling).toBeGreaterThan(oneOutputCeiling)
  })
})
