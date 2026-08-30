/**
 * Sails Core Implementation Program M8-R (Live Dispatch Retry) — pure,
 * side-effect-free unit tests for dispatch-translation-guard.ts.
 * Constructs REAL PSBTs via bitcoinjs-lib directly (no mocking, no
 * database) — this is exactly the "deterministically inspectable"
 * property mission §18 asks for, proven by literally inspecting one.
 */
import * as bitcoin from 'bitcoinjs-lib'
import {
  validateTranslatedOutputsAgainstOutcome,
  assertTranslationMatchesOutcome,
  TranslationGuardError,
} from '../src/modules/open-settlement/dispatch-translation-guard'
import { buildArbitrationOutcome, buildOutcomeDestinationBinding } from '../src/modules/open-settlement/economic-outcome'
import { buildRulingOutcomeContent } from '../src/modules/open-settlement/dispute-outcome'

const NETWORK = bitcoin.networks.regtest

const FAKE_TXID = 'a'.repeat(64)
const BUYER_ADDRESS = bitcoin.payments.p2wpkh({ pubkey: Buffer.from('021744d7bd3cd8e7f62e7aa8f7db8292680b745d09f8f40377c4bbbc0136d4e299', 'hex'), network: NETWORK }).address!
const SELLER_ADDRESS = bitcoin.payments.p2wpkh({ pubkey: Buffer.from('038e41e2cb09677fd4bde9f232871533925c4b628c25efdb9d572546293850ddd4', 'hex'), network: NETWORK }).address!
const ATTACKER_ADDRESS = bitcoin.payments.p2wpkh({ pubkey: Buffer.from('03a8f0fdc9911d8e33f58b1fced67b769189f2188431515e5171462522cb1be87b', 'hex'), network: NETWORK }).address!

function buildPsbt(inputValue: number, outputs: Array<{ address: string; value: number }>): string {
  const psbt = new bitcoin.Psbt({ network: NETWORK })
  psbt.addInput({
    hash: FAKE_TXID,
    index: 0,
    witnessUtxo: { script: bitcoin.address.toOutputScript(BUYER_ADDRESS, NETWORK), value: BigInt(inputValue) },
  })
  for (const o of outputs) {
    psbt.addOutput({ address: o.address, value: BigInt(o.value) })
  }
  return psbt.toBase64()
}

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

describe('buildRulingOutcomeContent — matches multisig.provider.ts buildUnsignedSplit() convention exactly', () => {
  it('RELEASE: buyer gets 10000bps, remainderBeneficiary is the buyer', () => {
    const content = buildRulingOutcomeContent('RELEASE', '100000', 'BTC', 'buyer-1', 'seller-1', null)
    expect(content.allocations).toEqual([{ beneficiary: 'buyer-1', basisPoints: 10000 }])
    expect(content.remainderBeneficiary).toBe('buyer-1')
  })

  it('REFUND: seller gets 10000bps, remainderBeneficiary is the seller', () => {
    const content = buildRulingOutcomeContent('REFUND', '100000', 'BTC', 'buyer-1', 'seller-1', null)
    expect(content.allocations).toEqual([{ beneficiary: 'seller-1', basisPoints: 10000 }])
    expect(content.remainderBeneficiary).toBe('seller-1')
  })

  it('SPLIT: buyer gets exactly buyerBps, seller gets the remainder — seller is remainderBeneficiary (matches buildUnsignedSplit\'s own buyerValue/sellerBase convention)', () => {
    const content = buildRulingOutcomeContent('SPLIT', '100000', 'BTC', 'buyer-1', 'seller-1', 7000)
    expect(content.allocations).toEqual([
      { beneficiary: 'buyer-1', basisPoints: 7000 },
      { beneficiary: 'seller-1', basisPoints: 3000 },
    ])
    expect(content.remainderBeneficiary).toBe('seller-1')
  })

  it('SPLIT rejects a missing/invalid buyerBps', () => {
    expect(() => buildRulingOutcomeContent('SPLIT', '100000', 'BTC', 'buyer-1', 'seller-1', null)).toThrow(/buyerBps/)
    expect(() => buildRulingOutcomeContent('SPLIT', '100000', 'BTC', 'buyer-1', 'seller-1', 0)).toThrow(/buyerBps/)
    expect(() => buildRulingOutcomeContent('SPLIT', '100000', 'BTC', 'buyer-1', 'seller-1', 10000)).toThrow(/buyerBps/)
  })
})

describe('P30/P31 — a faithful translation passes', () => {
  it('RELEASE: single correct output passes', () => {
    const outcome = releaseOutcome('100000')
    const psbt = buildPsbt(100_500, [{ address: BUYER_ADDRESS, value: 100_000 }]) // 500 sat miner fee
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK)
    expect(result).toEqual({ ok: true, mismatches: [] })
  })

  it('SPLIT: correct bps-exact outputs pass, remainder absorbed by seller', () => {
    const outcome = splitOutcome('100000', 7000)
    // spendable (post-fee) = 99500; buyer = floor(99500*7000/10000) = 69650; seller = 99500-69650 = 29850
    const psbt = buildPsbt(100_000, [
      { address: BUYER_ADDRESS, value: 69_650 },
      { address: SELLER_ADDRESS, value: 29_850 },
    ])
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK)
    expect(result).toEqual({ ok: true, mismatches: [] })
  })

  it('assertTranslationMatchesOutcome does not throw for a faithful translation', () => {
    const outcome = releaseOutcome('100000')
    const psbt = buildPsbt(100_500, [{ address: BUYER_ADDRESS, value: 100_000 }])
    expect(() => assertTranslationMatchesOutcome(psbt, outcome, NETWORK)).not.toThrow()
  })
})

describe('§19/§46 — translator attacks are caught pre-dispatch', () => {
  it('wrong destination (correct amount, D3 instead of D1) is DIVERGENT and blocked', () => {
    const outcome = releaseOutcome('100000')
    const psbt = buildPsbt(100_500, [{ address: ATTACKER_ADDRESS, value: 100_000 }])
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK)
    expect(result.ok).toBe(false)
    expect(result.mismatches[0]).toMatch(/no such output exists/)
    expect(() => assertTranslationMatchesOutcome(psbt, outcome, NETWORK)).toThrow(TranslationGuardError)
  })

  it('disclosed limit: for a SINGLE-beneficiary ruling, a self-consistent skim with no declared-fee anchor is NOT caught by ratio/destination checks alone (documented in this file\'s own header)', () => {
    const outcome = releaseOutcome('100000')
    const psbt = buildPsbt(100_500, [{ address: BUYER_ADDRESS, value: 90_000 }]) // claims a 10500 sat "fee"
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK) // no declaredMinerFeeSats anchor supplied
    expect(result.ok).toBe(true) // tautological for a single beneficiary — see header comment
  })

  it('closes the adjacent, genuinely catchable case: a translator whose declared minerFeeSats disagrees with what it actually built is caught', () => {
    const outcome = releaseOutcome('100000')
    const psbt = buildPsbt(100_500, [{ address: BUYER_ADDRESS, value: 90_000 }]) // implies a 10500 sat fee
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK, 500) // but claims only 500
    expect(result.ok).toBe(false)
    expect(result.mismatches[0]).toMatch(/internally inconsistent/)
  })

  it('a translator whose declared minerFeeSats DOES match its own PSBT passes the fee-consistency check', () => {
    const outcome = releaseOutcome('100000')
    const psbt = buildPsbt(100_500, [{ address: BUYER_ADDRESS, value: 100_000 }])
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK, 500)
    expect(result).toEqual({ ok: true, mismatches: [] })
  })

  it('SPLIT: swapped outputs (buyer\'s share sent to seller\'s address and vice versa) is caught', () => {
    const outcome = splitOutcome('100000', 7000)
    const psbt = buildPsbt(100_000, [
      { address: BUYER_ADDRESS, value: 29_850 }, // swapped
      { address: SELLER_ADDRESS, value: 69_650 }, // swapped
    ])
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK)
    expect(result.ok).toBe(false)
    expect(result.mismatches.length).toBeGreaterThan(0)
  })

  it('SPLIT: 70/30 shifted to 60/40 is caught even though destinations are both correct', () => {
    const outcome = splitOutcome('100000', 7000)
    // 60/40 of 99500 instead of 70/30
    const psbt = buildPsbt(100_000, [
      { address: BUYER_ADDRESS, value: 59_700 },
      { address: SELLER_ADDRESS, value: 39_800 },
    ])
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK)
    expect(result.ok).toBe(false)
  })

  it('added unauthorized output is caught (output count mismatch)', () => {
    const outcome = releaseOutcome('100000')
    const psbt = buildPsbt(150_500, [
      { address: BUYER_ADDRESS, value: 100_000 },
      { address: ATTACKER_ADDRESS, value: 50_000 },
    ])
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK)
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.includes('output(s), expected exactly'))).toBe(true)
  })

  it('omitted output (missing beneficiary in a SPLIT) is caught', () => {
    const outcome = splitOutcome('100000', 7000)
    const psbt = buildPsbt(100_000, [{ address: BUYER_ADDRESS, value: 99_500 }]) // seller's leg entirely missing
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK)
    expect(result.ok).toBe(false)
  })

  it('outputs exceeding input (negative implied fee) is caught', () => {
    const outcome = releaseOutcome('100000')
    const psbt = buildPsbt(90_000, [{ address: BUYER_ADDRESS, value: 100_000 }])
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK)
    expect(result.ok).toBe(false)
    expect(result.mismatches[0]).toMatch(/exceed its own declared input/)
  })

  it('a malformed/undecodable PSBT is caught, never thrown as an uncaught exception', () => {
    const outcome = releaseOutcome('100000')
    const result = validateTranslatedOutputsAgainstOutcome('not-a-real-psbt', outcome, NETWORK)
    expect(result.ok).toBe(false)
    expect(result.mismatches[0]).toMatch(/failed to decode/)
  })

  it('an Outcome with no destination binding at all is refused, never silently passed', () => {
    const content = buildRulingOutcomeContent('RELEASE', '100000', 'BTC', 'buyer-1', 'seller-1', null)
    // Bypass buildArbitrationOutcome()'s own construction-time guard by
    // constructing the Outcome shape directly, to prove THIS function's
    // own independent fail-closed check (defense in depth).
    const outcome = { content, destinationBinding: { reference: [] } }
    const psbt = buildPsbt(100_500, [{ address: BUYER_ADDRESS, value: 100_000 }])
    const result = validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK)
    expect(result.ok).toBe(false)
    expect(result.mismatches[0]).toMatch(/no destination binding/)
  })
})

describe('Determinism', () => {
  it('the same PSBT and Outcome produce the identical verdict across repeated calls', () => {
    const outcome = splitOutcome('100000', 7000)
    const psbt = buildPsbt(100_000, [
      { address: BUYER_ADDRESS, value: 69_650 },
      { address: SELLER_ADDRESS, value: 29_850 },
    ])
    const results = Array.from({ length: 5 }, () => JSON.stringify(validateTranslatedOutputsAgainstOutcome(psbt, outcome, NETWORK)))
    expect(new Set(results).size).toBe(1)
  })
})
