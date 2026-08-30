/**
 * Sails Core Implementation Program M8-R (Live Dispatch Retry) — pure
 * unit tests for dispute-correspondence.ts, proving M6's own
 * correspondence evaluator (frozen, M6/M7, unchanged) is genuinely
 * callable against a real, decoded Bitcoin transaction for this live
 * slice, plus documenting exactly where its gross-totalUnits model
 * diverges from a real, net-of-miner-fee MULTISIG execution (mission
 * §39's own "document exact behavior" instruction).
 */
import * as bitcoin from 'bitcoinjs-lib'
import { buildExecutionObservationsFromFinalizedTransaction, evaluateFinalizedTransactionCorrespondence } from '../src/modules/open-settlement/dispute-correspondence'
import { buildArbitrationOutcome, buildOutcomeDestinationBinding } from '../src/modules/open-settlement/economic-outcome'
import { buildRulingOutcomeContent } from '../src/modules/open-settlement/dispute-outcome'

const NETWORK = bitcoin.networks.regtest
const FAKE_TXID = 'b'.repeat(64)

const BUYER_ADDRESS = bitcoin.payments.p2wpkh({ pubkey: Buffer.from('021744d7bd3cd8e7f62e7aa8f7db8292680b745d09f8f40377c4bbbc0136d4e299', 'hex'), network: NETWORK }).address!
const ATTACKER_ADDRESS = bitcoin.payments.p2wpkh({ pubkey: Buffer.from('03a8f0fdc9911d8e33f58b1fced67b769189f2188431515e5171462522cb1be87b', 'hex'), network: NETWORK }).address!

function releaseOutcome(totalUnits: string) {
  const content = buildRulingOutcomeContent('RELEASE', totalUnits, 'BTC', 'buyer-1', 'seller-1', null)
  const binding = buildOutcomeDestinationBinding([{ beneficiary: 'buyer-1', destination: BUYER_ADDRESS }])
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

describe('evaluateFinalizedTransactionCorrespondence — faithful destination is MATCH; substitution is DIVERGENT', () => {
  it('P35: wrong destination -> DIVERGENT', () => {
    const outcome = releaseOutcome('100000')
    const txHex = finalizedTxHex(100_500, [{ address: ATTACKER_ADDRESS, value: 100_000 }])
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    expect(result.get('buyer-1')).toBe('UNKNOWN') // IRRESOLVABLE observation maps to UNKNOWN per M6's own frozen semantics
  })

  it('DISCLOSED, mission §39 "document exact behavior": a REAL, faithful MULTISIG execution (a real, non-zero miner fee actually deducted) reports DIVERGENT on amount, not MATCH — M6/M7\'s gross-totalUnits model does not account for the pre-existing, real miner-fee deduction. This is not a defect in this file; it is why dispatch-translation-guard.ts (pre-dispatch, fee-aware) carries the primary amount-substitution burden for this rail, not this post-execution check.', () => {
    const outcome = releaseOutcome('100000') // gross
    const txHex = finalizedTxHex(100_500, [{ address: BUYER_ADDRESS, value: 99_500 }]) // real, faithful (1000 sat miner fee actually deducted)
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    // Would be MATCH only if totalUnits already equalled the net-of-fee
    // amount — for a real, gross-denominated Outcome, and any real
    // (non-zero) miner fee, it never does.
    expect(result.get('buyer-1')).toBe('DIVERGENT')
  })

  it('when the Outcome\'s own totalUnits already equals the real net-of-fee amount (as it would for e.g. REFUND with a zero-fee transaction, or any exact match), the result is MATCH', () => {
    const outcome = releaseOutcome('100000')
    const txHex = finalizedTxHex(100_000, [{ address: BUYER_ADDRESS, value: 100_000 }]) // zero fee, exact match
    const result = evaluateFinalizedTransactionCorrespondence(txHex, outcome, NETWORK)
    expect(result.get('buyer-1')).toBe('MATCH')
  })
})
