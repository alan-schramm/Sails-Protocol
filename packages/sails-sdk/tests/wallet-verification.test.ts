/**
 * Missão 10, Fase 6-9 — pre-signature PSBT verification adversarial
 * matrix (A-N). Every tampered PSBT must fail verifySigningIntent() AND
 * must never reach signEscrowPsbt() via verifyAndSignEscrowPsbt(). Builds
 * real PSBTs with bitcoinjs-lib directly in this test file — this
 * package must never depend on `src/` (the backend's own tree), same
 * rule escrow-safe-signing.test.ts's own header already established.
 */
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import {
  verifySigningIntent,
  verifyAndSignEscrowPsbt,
  SigningIntentVerificationError,
} from '../src/modules/wallet-verification'
import type { ExpectedSigningIntent } from '../src/modules/wallet-verification'

bitcoin.initEccLib(ecc)
const network = bitcoin.networks.testnet

function keypair() {
  const privateKey = secp256k1.utils.randomSecretKey()
  const publicKey = Buffer.from(secp256k1.getPublicKey(privateKey, true))
  return { privateKey, publicKey }
}

const buyer = keypair()
const seller = keypair()
const arbiter = keypair()
const pubkeys = [buyer.publicKey, seller.publicKey, arbiter.publicKey].sort(Buffer.compare)
const p2ms = bitcoin.payments.p2ms({ m: 2, pubkeys, network })
const p2wsh = bitcoin.payments.p2wsh({ redeem: p2ms, network })
const multisigAddress = p2wsh.address!

const REAL_TXID = 'a'.repeat(64)
const REAL_VOUT = 0
const INPUT_VALUE = 100_000n
const RELEASE_ADDR = bitcoin.payments.p2wpkh({ pubkey: buyer.publicKey, network }).address!
const SELLER_ADDR = bitcoin.payments.p2wpkh({ pubkey: seller.publicKey, network }).address!
const FEE = 164n
const OUTPUT_VALUE = INPUT_VALUE - FEE

interface BuildOpts {
  txid?: string
  vout?: number
  inputValue?: bigint
  witnessScript?: Uint8Array
  outputs?: Array<{ address?: string; value: bigint; opReturn?: boolean }>
}

function buildPsbt(opts: BuildOpts = {}): string {
  const psbt = new bitcoin.Psbt({ network })
  psbt.addInput({
    hash: opts.txid ?? REAL_TXID,
    index: opts.vout ?? REAL_VOUT,
    witnessUtxo: { script: p2wsh.output!, value: opts.inputValue ?? INPUT_VALUE },
    witnessScript: opts.witnessScript ?? p2ms.output!,
  })
  const outputs = opts.outputs ?? [{ address: RELEASE_ADDR, value: OUTPUT_VALUE }]
  for (const out of outputs) {
    if (out.opReturn) {
      const script = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from('unexpected', 'utf8')])
      psbt.addOutput({ script, value: out.value })
    } else {
      psbt.addOutput({ address: out.address!, value: out.value })
    }
  }
  return psbt.toBase64()
}

function baseExpected(): ExpectedSigningIntent {
  return {
    operation: 'RELEASE',
    network: 'testnet',
    escrowId: 'escrow-1',
    input: { txid: REAL_TXID, vout: REAL_VOUT, value: INPUT_VALUE, multisigAddress },
    outputs: [{ address: RELEASE_ADDR, value: OUTPUT_VALUE }],
    minerFee: FEE,
    threshold: 2,
    participantPubkeys: pubkeys.map((p) => p.toString('hex')),
    requiredSigners: ['buyer-id', 'seller-id'],
  }
}

describe('verifySigningIntent — golden path', () => {
  it('a correctly-built PSBT verifies OK, zero mismatches', () => {
    const psbtBase64 = buildPsbt()
    const result = verifySigningIntent(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(true)
    expect(result.mismatches).toEqual([])
  })

  it('verifyAndSignEscrowPsbt() signs successfully when verification passes', () => {
    const psbtBase64 = buildPsbt()
    const signed = verifyAndSignEscrowPsbt(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'], buyer.privateKey)
    expect(typeof signed).toBe('string')
    expect(signed.length).toBeGreaterThan(0)
  })
})

describe('verifySigningIntent — adversarial matrix A-N: every tampered PSBT fails, sign is never reached', () => {
  const cases: Array<[string, BuildOpts, string[]]> = [
    ['A. different txid', { txid: 'b'.repeat(64) }, ['input.txid']],
    ['B. different vout', { vout: 1 }, ['input.vout']],
    ['C. different input value', { inputValue: INPUT_VALUE + 1000n }, ['input.value', 'minerFee']],
    ['D. different payout destination', { outputs: [{ address: SELLER_ADDR, value: OUTPUT_VALUE }] }, ['outputs[0].address']],
    ['E. different payout amount', { outputs: [{ address: RELEASE_ADDR, value: OUTPUT_VALUE - 500n }] }, ['outputs[0].value', 'minerFee']],
    ['F. different miner fee (via output value shift)', { outputs: [{ address: RELEASE_ADDR, value: OUTPUT_VALUE + 50n }] }, ['outputs[0].value', 'minerFee']],
    [
      'G. unexpected second output',
      { outputs: [{ address: RELEASE_ADDR, value: OUTPUT_VALUE - 1000n }, { address: SELLER_ADDR, value: 900n }] },
      ['outputs.count', 'outputs[0].value', 'minerFee'],
    ],
    [
      'H. unexpected OP_RETURN output',
      { outputs: [{ address: RELEASE_ADDR, value: OUTPUT_VALUE - 1000n }, { value: 0n, opReturn: true }] },
      ['outputs.count', 'outputs[0].value', 'minerFee'],
    ],
  ]

  it.each(cases)('%s', (_name, opts, expectedFields) => {
    const psbtBase64 = buildPsbt(opts)
    const result = verifySigningIntent(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    for (const field of expectedFields) {
      expect(result.mismatches.some((m) => m.field === field)).toBe(true)
    }
    expect(() => verifyAndSignEscrowPsbt(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'], buyer.privateKey)).toThrow(
      SigningIntentVerificationError
    )
  })

  it('I. network incompatible — PSBT built for one network, verified against a different one', () => {
    // A mainnet address supplied as the expected output while the PSBT
    // itself is testnet-encoded: toOutputScript() for the expected
    // address under the (wrong) testnet network either throws or
    // produces a script that cannot match the real testnet output.
    const mainnetAddr = bitcoin.payments.p2wpkh({ pubkey: buyer.publicKey, network: bitcoin.networks.bitcoin }).address!
    const psbtBase64 = buildPsbt()
    const expected = { ...baseExpected(), outputs: [{ address: mainnetAddr, value: OUTPUT_VALUE }] }
    const result = verifySigningIntent(psbtBase64, expected, ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'outputs[0].address')).toBe(true)
  })

  it('J. different witnessScript (different quorum entirely)', () => {
    const otherArbiter = keypair()
    const otherPubkeys = [buyer.publicKey, seller.publicKey, otherArbiter.publicKey].sort(Buffer.compare)
    const otherP2ms = bitcoin.payments.p2ms({ m: 2, pubkeys: otherPubkeys, network })
    const otherP2wsh = bitcoin.payments.p2wsh({ redeem: otherP2ms, network })
    const psbt = new bitcoin.Psbt({ network })
    psbt.addInput({
      hash: REAL_TXID,
      index: REAL_VOUT,
      witnessUtxo: { script: otherP2wsh.output!, value: INPUT_VALUE },
      witnessScript: otherP2ms.output!,
    })
    psbt.addOutput({ address: RELEASE_ADDR, value: OUTPUT_VALUE })
    const result = verifySigningIntent(psbt.toBase64(), baseExpected(), ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'input.multisigAddress' || m.field === 'participantPubkeys')).toBe(true)
  })

  it('K. different threshold (2-of-3 tampered to look like 1-of-3)', () => {
    const tamperedP2ms = bitcoin.payments.p2ms({ m: 1, pubkeys, network })
    const psbtBase64 = buildPsbt({ witnessScript: tamperedP2ms.output! })
    const result = verifySigningIntent(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    // The witness script no longer matches this escrow's own known
    // deposit address's script bytes either way (a 1-of-3 script hashes
    // to a different P2WSH address) — caught at the input.multisigAddress
    // layer before threshold is even separately inspected, which is the
    // stronger, more literal check.
    expect(result.mismatches.some((m) => m.field === 'input.multisigAddress' || m.field === 'threshold')).toBe(true)
  })

  it('L. different participant pubkeys (same threshold, swapped signer)', () => {
    const impostor = keypair()
    const tamperedPubkeys = [buyer.publicKey, impostor.publicKey, arbiter.publicKey].sort(Buffer.compare)
    const tamperedP2ms = bitcoin.payments.p2ms({ m: 2, pubkeys: tamperedPubkeys, network })
    const psbtBase64 = buildPsbt({ witnessScript: tamperedP2ms.output! })
    const result = verifySigningIntent(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'input.multisigAddress' || m.field === 'participantPubkeys')).toBe(true)
  })

  it('M. unexpected required signer', () => {
    const psbtBase64 = buildPsbt()
    const result = verifySigningIntent(psbtBase64, baseExpected(), ['buyer-id', 'an-unexpected-third-party'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'requiredSigners')).toBe(true)
    expect(() => verifyAndSignEscrowPsbt(psbtBase64, baseExpected(), ['buyer-id', 'an-unexpected-third-party'], buyer.privateKey)).toThrow(
      SigningIntentVerificationError
    )
  })

  it('N. tampered split percentages/outputs (2-output SPLIT case)', () => {
    const buyerSplit = 6000n
    const sellerSplit = OUTPUT_VALUE - buyerSplit
    const psbtBase64 = buildPsbt({ outputs: [{ address: RELEASE_ADDR, value: buyerSplit }, { address: SELLER_ADDR, value: sellerSplit }] })
    const expected: ExpectedSigningIntent = {
      ...baseExpected(),
      operation: 'SPLIT',
      // Wallet expected a different split ratio than what the PSBT
      // actually encodes — e.g. expected 50/50, PSBT gives buyer 60/40.
      outputs: [
        { address: RELEASE_ADDR, value: (OUTPUT_VALUE * 5000n) / 10000n },
        { address: SELLER_ADDR, value: OUTPUT_VALUE - (OUTPUT_VALUE * 5000n) / 10000n },
      ],
    }
    const result = verifySigningIntent(psbtBase64, expected, ['buyer-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'outputs[0].value')).toBe(true)
  })
})
