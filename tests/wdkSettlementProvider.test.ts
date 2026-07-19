/**
 * WdkSettlementProvider — the pure, deterministic helpers.
 *
 * The real wallet calls (lockFunds/releaseFunds/refundFunds/verifyLock)
 * need a live testnet + a funded seed to verify for real — the same
 * "cannot be verified without live infrastructure" limitation this
 * codebase already declines to fake for PearsTransportProvider and
 * RedisStreamsEventStore. What IS safely, fully verifiable without any
 * of that: toBaseUnits() (decimal-string -> on-chain integer conversion)
 * and escrowIndexFor() (deterministic per-trade account derivation) —
 * both pure functions, tested directly here.
 *
 * @tetherto/wdk-wallet-evm ships pure ESM with no CJS build, so it's
 * mocked out the same way tests/routes.test.ts already does — this file
 * never needs the real wallet class to test the pure helpers below.
 */
jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))

import { toBaseUnits, escrowIndexFor, buyerIndexFor, wdkSettlementProvider } from '../src/modules/open-settlement/wdk-settlement.provider'

// RFC-019 Phase 1 (rfcs/RFC-019-settlement-custody-reference-vs-normative.md)
// — the introspectable custody-model flag needs no live wallet, so it's
// verified directly here alongside the other pure/constructor-time checks.
describe('WdkSettlementProvider.custodyModel (RFC-019 Phase 1)', () => {
  it('declares itself a server-custodial reference implementation', () => {
    expect(wdkSettlementProvider.custodyModel).toBe('server-custodial-reference-implementation')
  })
})

describe('toBaseUnits (decimal string -> on-chain integer, USDT 6 decimals)', () => {
  it('converts a whole-number amount', () => {
    expect(toBaseUnits('5', 6)).toBe(5_000_000n)
  })

  it('converts a fractional amount', () => {
    expect(toBaseUnits('0.01', 6)).toBe(10_000n)
  })

  it('converts an amount with no leading whole part', () => {
    expect(toBaseUnits('.5', 6)).toBe(500_000n)
  })

  it('truncates (never rounds up) precision beyond the token decimals — schema.prisma stores 8 decimals, USDT only has 6', () => {
    // 0.0000001234 truncated to 6 decimals is 0.000000 — must not round to 0.000001
    expect(toBaseUnits('0.0000001234', 6)).toBe(0n)
    expect(toBaseUnits('1.1234567', 6)).toBe(1_123_456n) // 7th digit (7) dropped, not rounded
  })

  it('handles a plain integer with no decimal point at all', () => {
    expect(toBaseUnits('1000', 6)).toBe(1_000_000_000n)
  })
})

describe('escrowIndexFor (deterministic per-trade escrow account derivation)', () => {
  it('is deterministic — same tradeId always derives the same index', () => {
    const a = escrowIndexFor('trade-abc-123')
    const b = escrowIndexFor('trade-abc-123')
    expect(a).toBe(b)
  })

  it('produces different indexes for different trades (no accidental collision on these inputs)', () => {
    expect(escrowIndexFor('trade-1')).not.toBe(escrowIndexFor('trade-2'))
  })

  it('always stays within the valid BIP-44 non-hardened index range', () => {
    for (const tradeId of ['t1', 'a-very-long-trade-id-uuid-like-string-1234567890', '']) {
      const index = escrowIndexFor(tradeId)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(0x80000000)
    }
  })
})

describe('buyerIndexFor (deterministic per-buyer receiving-address derivation)', () => {
  it('is deterministic — same buyerId always derives the same index', () => {
    expect(buyerIndexFor('buyer-1')).toBe(buyerIndexFor('buyer-1'))
  })

  it('produces different indexes for different buyers', () => {
    expect(buyerIndexFor('buyer-1')).not.toBe(buyerIndexFor('buyer-2'))
  })

  it('never collides with escrowIndexFor for the same raw id (distinct salt)', () => {
    // Same input string used as both a tradeId and a buyerId would derive
    // from genuinely different byte sequences (the buyer: prefix), not
    // just coincidentally different hashes of the same bytes.
    expect(buyerIndexFor('shared-id')).not.toBe(escrowIndexFor('shared-id'))
  })

  it('always stays within the valid BIP-44 non-hardened index range', () => {
    for (const buyerId of ['u1', 'a-very-long-user-id-uuid-like-string-1234567890', '']) {
      const index = buyerIndexFor(buyerId)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(0x80000000)
    }
  })
})
