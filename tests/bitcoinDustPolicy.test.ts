/**
 * Missão 10, Fase 4 — bitcoin-dust-policy.ts pure unit tests.
 *
 * dustThresholdSats() mirrors Bitcoin Core's real GetDustThreshold()
 * formula. Verified here against real, valid mainnet addresses of every
 * script type this policy currently classifies — including the exact
 * real addresses this repo already broadcast against in Missão 09
 * (bc1q7mrv...404xk, the real buyer payout; bc1q3jyc5...ans03s, the real
 * multisig P2WSH address) — not synthetic fixtures, so the computed
 * thresholds are provably about the real scripts Sails actually built.
 */
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from 'tiny-secp256k1'
bitcoin.initEccLib(ecc)
import { dustThresholdSats, classifyOutputScript, validateOutput, UnsupportedOutputScriptError } from '../src/modules/open-settlement/bitcoin-dust-policy'

const network = bitcoin.networks.bitcoin

const REAL_ADDRESSES = {
  P2WPKH: 'bc1q7mrvhs3xxzg9jyesd60nvda26ueukn9nc404xk', // real Missão 09 buyer payout address
  P2WSH: 'bc1q3jyc5pm43z4m8tyl8zyunlkp3a44rmxex2kmcym2wsnjq4x8znhqans03s', // real Missão 09 multisig address
  P2TR: 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
  P2PKH: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Satoshi's genesis address
  P2SH: '3P14159f73E4gFr7JterCCQh9QjiTjiZrG',
}

function scriptFor(address: string): Buffer {
  return Buffer.from(bitcoin.address.toOutputScript(address, network))
}

describe('classifyOutputScript — real address decoding, every currently-relevant script type', () => {
  it.each(Object.entries(REAL_ADDRESSES))('classifies %s correctly', (kind, address) => {
    expect(classifyOutputScript(scriptFor(address))).toBe(kind)
  })
})

describe('dustThresholdSats — matches Bitcoin Core real default relay-policy values exactly', () => {
  it('P2WPKH: 294 sats (the real figure independently confirmed for this repo\'s own Missão 09 release)', () => {
    expect(dustThresholdSats(scriptFor(REAL_ADDRESSES.P2WPKH))).toBe(294n)
  })
  it('P2WSH: 330 sats', () => {
    expect(dustThresholdSats(scriptFor(REAL_ADDRESSES.P2WSH))).toBe(330n)
  })
  it('P2TR: 330 sats (same output-script length as P2WSH — identical threshold, correctly derived from size, not a lookup table)', () => {
    expect(dustThresholdSats(scriptFor(REAL_ADDRESSES.P2TR))).toBe(330n)
  })
  it('P2PKH: 546 sats (the well-known legacy figure)', () => {
    expect(dustThresholdSats(scriptFor(REAL_ADDRESSES.P2PKH))).toBe(546n)
  })
  it('P2SH: 540 sats', () => {
    expect(dustThresholdSats(scriptFor(REAL_ADDRESSES.P2SH))).toBe(540n)
  })

  it('rejects an oversized (>252 byte) script rather than mis-sizing the compactsize prefix', () => {
    const huge = Buffer.alloc(300, 0x51)
    expect(() => dustThresholdSats(huge)).toThrow(UnsupportedOutputScriptError)
  })
})

describe('validateOutput — the real pre-signature gate', () => {
  it('D1: allows a P2WPKH output clearly above its dust threshold', () => {
    const result = validateOutput(REAL_ADDRESSES.P2WPKH, 100_000n, network)
    expect(result.kind).toBe('P2WPKH')
    expect(result.dustThreshold).toBe(294n)
  })

  it('exactly-at-threshold is ALLOWED — Bitcoin Core\'s own IsDust() is strict less-than, not <=', () => {
    expect(() => validateOutput(REAL_ADDRESSES.P2WPKH, 294n, network)).not.toThrow()
  })

  it('one satoshi below threshold is REJECTED', () => {
    expect(() => validateOutput(REAL_ADDRESSES.P2WPKH, 293n, network)).toThrow(/below the 294-sat dust threshold/)
  })

  it('P2WSH: exactly-at-330 allowed, 329 rejected', () => {
    expect(() => validateOutput(REAL_ADDRESSES.P2WSH, 330n, network)).not.toThrow()
    expect(() => validateOutput(REAL_ADDRESSES.P2WSH, 329n, network)).toThrow(/below the 330-sat dust threshold/)
  })

  it('D2: rejects an address that does not decode for the configured network (mainnet address on testnet)', () => {
    expect(() => validateOutput(REAL_ADDRESSES.P2WPKH, 100_000n, bitcoin.networks.testnet)).toThrow(/invalid or does not match the configured network/)
  })

  it('D2: rejects a syntactically invalid address', () => {
    expect(() => validateOutput('not-a-real-bitcoin-address', 100_000n, network)).toThrow(/invalid or does not match the configured network/)
  })

  it('error message clearly separates dust-relay policy from this transaction\'s own miner fee (no field name collision)', () => {
    try {
      validateOutput(REAL_ADDRESSES.P2WPKH, 1n, network)
      fail('expected to throw')
    } catch (err: any) {
      expect(err.message).toMatch(/relay-policy check/)
      expect(err.message).toMatch(/separate.*miner fee/)
    }
  })
})
