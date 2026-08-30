/**
 * Sails Core Implementation Program M8.6 (Execution Cost Semantics &
 * Live Correspondence Closure) — pure unit tests for
 * dispute-correspondence.ts, proving the execution-cost-aware
 * correspondence evaluator (`evaluateOutcomeCorrespondenceWithExecutionCost`,
 * economic-outcome.ts) correctly closes the gap M8-R itself disclosed:
 * a faithful, real, non-zero-miner-fee MULTISIG execution now produces
 * MATCH, not a spurious DIVERGENT, while a genuine skim/substitution
 * still correctly produces DIVERGENT.
 */
import * as bitcoin from 'bitcoinjs-lib'
import { buildExecutionObservationsFromFinalizedTransaction, evaluateFinalizedTransactionCorrespondence } from '../src/modules/open-settlement/dispute-correspondence'
import { buildArbitrationOutcome, buildOutcomeDestinationBinding } from '../src/modules/open-settlement/economic-outcome'
import { buildRulingOutcomeContent } from '../src/modules/open-settlement/dispute-outcome'

const NETWORK = bitcoin.networks.regtest
const FAKE_TXID = 'b'.repeat(64)

const BUYER_ADDRESS = bitcoin.payments.p2wpkh({ pubkey: Buffer.from('021744d7bd3cd8e7f62e7aa8f7db8292680b745d09f8f40377c4bbbc0136d4e299', 'hex'), network: NETWORK }).address!
const SELLER_ADDRESS = bitcoin.payments.p2wpkh({ pubkey: Buffer.from('038e41e2cb09677fd4bde9f232871533925c4b628c25efdb9d572546293850ddd4', 'hex'), network: NETWORK }).address!
const ATTACKER_ADDRESS = bitcoin.payments.p2wpkh({ pubkey: Buffer.from('03a8f0fdc9911d8e33f58b1fced67b769189f2188431515e5171462522cb1be87b', 'hex'), network: NETWORK }).address!

function releaseOutcome(totalUnits: string) {
  const content = buildRulingOutcomeContent('RELEASE', totalUnits, 'BTC', 'buyer-1', 'seller-1', null)
  const binding = buildOutcomeDestinationBinding([{ beneficiary: 'buyer-1', destination: BUYER_ADDRESS }])
  return buildArbitrationOutcome(content, binding)
}

function splitOutcome(totalUnits: string, buyerBps: number) {
  const content = buildRulingOutcomeContent('SPLIT', totalUnits, 'BTC', 'buyer-1', 'seller-1', buyerBps)
  const binding = buildOutcomeDestinationBinding([
    { beneficiary: 'buyer-1', destination: BUYER_ADDRESS },
    { beneficiary: 'seller-1', destination: SELLER_ADDRESS },
  ])
  return buildArbitrationOutcome(content, binding)
}

function finalizedTxHex(inputValue: number, outputs: Array<{ address: string; value: number }>): string {
  const tx = new bitcoin.Transaction()
  tx.addInput(Buffer.from(FAKE_TXID, 'hex').reverse(), 0)
  for (const o of outputs) {
    tx.addOutput(bitcoin.address.toOutputScript(o.address, NETWORK), BigInt(o.value))
  }
  return tx.toHex()
}

describe('buildExecutionObservationsFromFinalizedTransaction', () => {
  it('a real output paying the authorized destination is OBSERVED with the matching amount', () => {
    const outcome = releaseOutcome('100000')
    const txHex = finalizedTxHex(100_500, [{ address: BUYER_ADDRESS, value: 100_000 }])
    const observations = buildExecutionObservationsFromFinalizedTransaction(txHex, outcome, NETWORK)
    expect(observations.get('buyer-1')).toEqual({ status: 'OBSERVED', destinationReference: BUYER_ADDRESS, amount: '100000', asset: 'BTC' })
  })

  it('a missing beneficiary output is IRRESOLVABLE, never silently treated as a match', () => {
    const outcome = releaseOutcome('100000')
    const txHex = finalizedTxHex(100_500, [{ address: ATTACKER_ADDRESS, value: 100_000 }])
    const observations = buildExecutionObservationsFromFinalizedTransaction(txHex, outcome, NETWORK)
    expect(observations.get('buyer-1')).toEqual({ status: 'IRRESOLVABLE' })
  })

  it('an undecodable transaction produces IRRESOLVABLE for every beneficiary rather than throwing', () => {
    const outcome = releaseOutcome('100000')
    const observations = buildExecutionObservationsFromFinalizedTransaction('not-real-hex', outcome, NETWORK)
    expect(observations.get('buyer-1')).toEqual({ status: 'IRRESOLVABLE' })
  })
})

describe('CORR — faithful execution is MATCH; substitution/skim is DIVERGENT (M8.6, execution-cost-aware)', () => {
  it('CORR-1/P24: a REAL, faithful execution with a real, non-zero miner fee produces MATCH — the exact gap M8-R disclosed as open, now closed', () => {
    const outcome = releaseOutcome('100000') // gross
    const txHex = finalizedTxHex(100_500, [{ address: BUYER_ADDRESS, value: 99_500 }]) // real, faithful, 1000 sat fee (~1% of gross, well within both ceilings)
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    expect(result.get('buyer-1')).toBe('MATCH')
  })

  it('a zero-fee, exact-match execution is also MATCH (the trivial case still works)', () => {
    const outcome = releaseOutcome('100000')
    const txHex = finalizedTxHex(100_000, [{ address: BUYER_ADDRESS, value: 100_000 }])
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    expect(result.get('buyer-1')).toBe('MATCH')
  })

  it('CORR-2/P25: wrong destination -> UNKNOWN (IRRESOLVABLE observation, per M6\'s own frozen semantics) — never MATCH', () => {
    const outcome = releaseOutcome('100000')
    const txHex = finalizedTxHex(100_500, [{ address: ATTACKER_ADDRESS, value: 100_000 }])
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    expect(result.get('buyer-1')).toBe('UNKNOWN')
  })

  it('COST-18/P26: an extreme single-beneficiary skim disguised as "fee" is DIVERGENT, not MATCH — the central case M8.6 exists to close', () => {
    const outcome = releaseOutcome('100000')
    const txHex = finalizedTxHex(100_500, [{ address: BUYER_ADDRESS, value: 50_000 }]) // "50,000 sat fee"
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    expect(result.get('buyer-1')).toBe('DIVERGENT')
  })

  it('CORR-5/P26: a delivered-value shortfall beyond both cost ceilings is DIVERGENT', () => {
    const outcome = releaseOutcome('100000')
    const txHex = finalizedTxHex(100_500, [{ address: BUYER_ADDRESS, value: 75_000 }]) // 25,000 sat gap — over the 20% proportional ceiling, under the rate ceiling
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    expect(result.get('buyer-1')).toBe('DIVERGENT')
  })

  it('COST-19/CORR-19: SPLIT skim — a legitimate proportional fee split still MATCHes both legs', () => {
    const outcome = splitOutcome('100000', 7000)
    // real fee 500 sats, distributable 99,500: buyer=floor(99500*7000/10000)=69650, seller=29850
    const txHex = finalizedTxHex(100_500, [
      { address: BUYER_ADDRESS, value: 69_650 },
      { address: SELLER_ADDRESS, value: 29_850 },
    ])
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    expect(result.get('buyer-1')).toBe('MATCH')
    expect(result.get('seller-1')).toBe('MATCH')
  })

  it('COST-19: SPLIT — 70/30 shifted to 60/40 under a legitimate total is DIVERGENT on both legs (ratio substitution survives the fee-aware fix)', () => {
    const outcome = splitOutcome('100000', 7000)
    const txHex = finalizedTxHex(100_500, [
      { address: BUYER_ADDRESS, value: 59_700 }, // 60% of 99,500
      { address: SELLER_ADDRESS, value: 39_800 }, // 40% of 99,500
    ])
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    expect(result.get('buyer-1')).toBe('DIVERGENT')
    expect(result.get('seller-1')).toBe('DIVERGENT')
  })

  it('CORR-9: an incomplete observation (one beneficiary not yet observed) never triggers the execution-cost total check prematurely — falls back to plain per-leg destination/PENDING semantics', () => {
    const outcome = splitOutcome('100000', 7000)
    // Only the buyer's leg is present in this transaction — seller's leg unobserved (e.g. querying a partial view)
    const txHex = finalizedTxHex(69_650, [{ address: BUYER_ADDRESS, value: 69_650 }])
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    expect(result.get('seller-1')).toBe('UNKNOWN') // IRRESOLVABLE — no output at seller's address at all
  })
})
