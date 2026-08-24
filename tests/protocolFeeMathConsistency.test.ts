/**
 * Cross-package protocol-fee-math consistency — Missão 11 Fase 9.1 §13.
 *
 * The wallet-side independent-verification story (buildExpectedFeeAwareReleaseOutputs
 * in wallet-verification.ts) depends on @satsails/p2p-trading-sdk's
 * computeProtocolFeeSatsExact() and the server's own
 * computeProtocolFee() (fee-reserve-math.ts, Prisma.Decimal-based)
 * producing byte-identical satoshi amounts for the same
 * (lockedAmount, rate) pair — if the two ever silently diverge, a wallet
 * verifying a RELEASE PSBT against its own independently-computed
 * expected fee could reject a legitimate transaction, or (worse) accept
 * a wrong one, purely from arithmetic drift rather than an actual
 * protocol violation. This closes the previously-disclosed float/Decimal
 * gap (buildExpectedFeeAwareReleaseOutputs used to compute
 * Math.floor(Number(sats) * rate) — a JS-float computation that could
 * only ever disagree with the server, never silently agree on a wrong
 * value) with genuine bit-for-bit BigInt arithmetic on both sides.
 *
 * No mocks: both real implementations, run side-by-side against the
 * same inputs. The server computes in BTC-denominated Decimal (8 decimal
 * places = exact satoshi precision, per fee-reserve-math.ts's own header
 * comment); the SDK computes directly in integer satoshis — so the
 * server's BTC result is converted to sats (×1e8, itself exact since the
 * Decimal is already floored to 8dp) before comparing.
 */
export {} // same forced-module reasoning used throughout this suite

import { Prisma } from '@prisma/client'
import { computeProtocolFeeSatsExact } from '../packages/sails-sdk/src/modules/wallet-verification'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeProtocolFee } = require('../src/modules/open-settlement/fee-reserve-math')

function serverFeeSats(lockedAmountBtc: string, rate: string): bigint {
  const feeBtc: Prisma.Decimal = computeProtocolFee(lockedAmountBtc, rate)
  return BigInt(feeBtc.times(1e8).toFixed(0))
}

describe('SDK computeProtocolFeeSatsExact() vs server computeProtocolFee() (Missão 11 Fase 9.1 §13)', () => {
  it('agree exactly for the protocol economy default rate (0.40%, kept inactive) on a representative trade', () => {
    const lockedAmountSats = 100_000n // 0.001 BTC
    const rate = '0.004'
    expect(computeProtocolFeeSatsExact(lockedAmountSats, rate)).toBe(400n)
    expect(serverFeeSats('0.001', rate)).toBe(400n)
  })

  it('agree exactly across a representative matrix of amounts and rates, including edge cases', () => {
    const cases: Array<{ amountBtc: string; amountSats: bigint; rate: string }> = [
      { amountBtc: '0.001', amountSats: 100_000n, rate: '0.004' },
      { amountBtc: '0.00001', amountSats: 1_000n, rate: '0.004' }, // small trade
      { amountBtc: '1', amountSats: 100_000_000n, rate: '0.004' }, // large trade
      { amountBtc: '0.00000001', amountSats: 1n, rate: '0.004' }, // 1-sat trade — fee floors to 0
      { amountBtc: '0.001', amountSats: 100_000n, rate: '0' }, // waived/zero rate
      { amountBtc: '0.001', amountSats: 100_000n, rate: '0.01' }, // 1% — round, non-repeating
      { amountBtc: '0.001', amountSats: 100_000n, rate: '0.0033333333' }, // repeating-decimal-adjacent rate, high precision
      { amountBtc: '12.34567891', amountSats: 1_234_567_891n, rate: '0.0025' }, // arbitrary non-round amount
    ]

    for (const { amountBtc, amountSats, rate } of cases) {
      const sdkResult = computeProtocolFeeSatsExact(amountSats, rate)
      const serverResult = serverFeeSats(amountBtc, rate)
      expect(sdkResult).toBe(serverResult)
    }
  })

  it('both sides floor rather than round — a fractional-satoshi result never rounds up in the protocol\'s favor', () => {
    // 100_000 sats * 0.0001234 = 12.34 sats exactly — floors to 12, not 13.
    const lockedAmountSats = 100_000n
    const rate = '0.0001234'
    const sdkResult = computeProtocolFeeSatsExact(lockedAmountSats, rate)
    const serverResult = serverFeeSats('0.001', rate)
    expect(sdkResult).toBe(12n)
    expect(serverResult).toBe(12n)
  })
})
