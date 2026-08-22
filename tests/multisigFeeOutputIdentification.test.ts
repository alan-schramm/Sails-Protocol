// tests/multisigFeeOutputIdentification.test.ts
//
// Missão 11 Fase 5 §5/§15 (G/H/I/J) — identifyFeeOutput() must identify the
// Sails fee output deterministically, by frozen destination + expected
// amount, and fail closed on every ambiguous or wrong case: zero matching
// outputs, more than one matching output, and an amount mismatch. Pure
// unit tests, no database, no network.

import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from 'tiny-secp256k1'
import { ECPairFactory } from 'ecpair'
import { createHash } from 'crypto'
import { identifyFeeOutput } from '../src/modules/open-settlement/multisig.provider'

bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)
const network = bitcoin.networks.testnet

function p2wpkhAddressFor(seed: string): string {
  const key = ECPair.fromPrivateKey(createHash('sha256').update(seed).digest(), { network })
  return bitcoin.payments.p2wpkh({ pubkey: Buffer.from(key.publicKey), network }).address!
}

const COLLECTION_ADDRESS = p2wpkhAddressFor('fase5-identify-collection')
const BUYER_ADDRESS = p2wpkhAddressFor('fase5-identify-buyer')
const OTHER_ADDRESS = p2wpkhAddressFor('fase5-identify-other')

function buildPsbt(outputs: Array<{ address: string; value: number }>): string {
  const psbt = new bitcoin.Psbt({ network })
  const dummyScript = bitcoin.address.toOutputScript(BUYER_ADDRESS, network)
  psbt.addInput({
    hash: 'ff'.repeat(32),
    index: 0,
    witnessUtxo: { script: dummyScript, value: BigInt(outputs.reduce((s, o) => s + o.value, 0) + 500) },
  })
  for (const o of outputs) {
    psbt.addOutput({ address: o.address, value: BigInt(o.value) })
  }
  return psbt.toBase64()
}

describe('identifyFeeOutput() — deterministic, fail-closed Sails-output identification', () => {
  it('identifies the correct output by frozen destination + expected amount', () => {
    const psbtBase64 = buildPsbt([
      { address: BUYER_ADDRESS, value: 90_000 },
      { address: COLLECTION_ADDRESS, value: 4_000 },
    ])
    const evidence = identifyFeeOutput(psbtBase64, COLLECTION_ADDRESS, 4_000, network)
    expect(evidence.vout).toBe(1)
    expect(evidence.amountSats).toBe(4_000)
    expect(evidence.address).toBe(COLLECTION_ADDRESS)
    expect(evidence.scriptPubKeyHex).toBe(Buffer.from(bitcoin.address.toOutputScript(COLLECTION_ADDRESS, network)).toString('hex'))
  })

  it('works identically regardless of output order (SPLIT can put the fee leg last)', () => {
    const psbtBase64 = buildPsbt([
      { address: BUYER_ADDRESS, value: 50_000 },
      { address: OTHER_ADDRESS, value: 40_000 },
      { address: COLLECTION_ADDRESS, value: 5_000 },
    ])
    const evidence = identifyFeeOutput(psbtBase64, COLLECTION_ADDRESS, 5_000, network)
    expect(evidence.vout).toBe(2)
    expect(evidence.amountSats).toBe(5_000)
  })

  it('H: fails closed when zero outputs pay the expected destination', () => {
    const psbtBase64 = buildPsbt([{ address: BUYER_ADDRESS, value: 90_000 }])
    expect(() => identifyFeeOutput(psbtBase64, COLLECTION_ADDRESS, 4_000, network)).toThrow(/no output pays the expected frozen collection destination/)
  })

  it('J: fails closed when MORE THAN ONE output pays the expected destination (ambiguous)', () => {
    const psbtBase64 = buildPsbt([
      { address: COLLECTION_ADDRESS, value: 2_000 },
      { address: COLLECTION_ADDRESS, value: 2_000 },
    ])
    expect(() => identifyFeeOutput(psbtBase64, COLLECTION_ADDRESS, 2_000, network)).toThrow(/outputs pay the expected frozen collection destination.*ambiguous/)
  })

  it('G: fails closed on an amount mismatch, even when the destination is correct', () => {
    const psbtBase64 = buildPsbt([
      { address: BUYER_ADDRESS, value: 90_000 },
      { address: COLLECTION_ADDRESS, value: 3_999 }, // one sat short of expected
    ])
    expect(() => identifyFeeOutput(psbtBase64, COLLECTION_ADDRESS, 4_000, network)).toThrow(/refusing to record collection evidence for a mismatched amount/)
  })

  it('never guesses from output position — the fee output can be at vout 0', () => {
    const psbtBase64 = buildPsbt([
      { address: COLLECTION_ADDRESS, value: 4_000 },
      { address: BUYER_ADDRESS, value: 90_000 },
    ])
    const evidence = identifyFeeOutput(psbtBase64, COLLECTION_ADDRESS, 4_000, network)
    expect(evidence.vout).toBe(0)
  })

  it('throws clearly for a malformed expected address rather than silently failing to match', () => {
    const psbtBase64 = buildPsbt([{ address: BUYER_ADDRESS, value: 90_000 }])
    expect(() => identifyFeeOutput(psbtBase64, 'not-a-real-address', 4_000, network)).toThrow(/is invalid for the configured network/)
  })
})
