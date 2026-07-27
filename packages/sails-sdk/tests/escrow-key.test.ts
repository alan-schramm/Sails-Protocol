/**
 * generateEscrowKeypair() — real secp256k1 cryptography (@noble/curves,
 * no mocking), same "real crypto, no mocking" discipline
 * tests/identity.test.ts already established for the Ed25519 keypair.
 *
 * Cross-checked directly against `bitcoinjs-lib` (the same library
 * `multisig.provider.ts` uses server-side) to prove the produced
 * `publicKeyHex` is a real, usable compressed secp256k1 pubkey, not just
 * a plausible-looking byte string — this SDK package must never depend
 * on the server's source tree, so bitcoinjs-lib is used here directly as
 * an independent verification tool, the same role it plays in the
 * backend's own multisig.provider.ts experiment this test mirrors.
 */
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from 'tiny-secp256k1'
import { generateEscrowKeypair, signEscrowPsbt } from '../src/modules/escrow-key'

bitcoin.initEccLib(ecc)

describe('generateEscrowKeypair', () => {
  it('produces a real 32-byte private key and 33-byte compressed public key', () => {
    const kp = generateEscrowKeypair()
    expect(kp.privateKey.length).toBe(32)
    expect(kp.publicKey.length).toBe(33)
    expect(kp.publicKeyHex.length).toBe(66)
    expect(kp.publicKeyHex).toMatch(/^0[23][0-9a-f]{64}$/)
  })

  it('generates a different keypair on every call', () => {
    const a = generateEscrowKeypair()
    const b = generateEscrowKeypair()
    expect(a.publicKeyHex).not.toBe(b.publicKeyHex)
  })

  it('the produced pubkey is a real, valid secp256k1 point — bitcoinjs-lib accepts it in a 2-of-2 P2WSH multisig script', () => {
    const buyer = generateEscrowKeypair()
    const seller = generateEscrowKeypair()
    const pubkeys = [Buffer.from(buyer.publicKey), Buffer.from(seller.publicKey)].sort(Buffer.compare)

    const p2ms = bitcoin.payments.p2ms({ m: 2, pubkeys, network: bitcoin.networks.testnet })
    const p2wsh = bitcoin.payments.p2wsh({ redeem: p2ms, network: bitcoin.networks.testnet })

    expect(p2wsh.address).toMatch(/^tb1/)
  })

  it('the private key correctly signs for its own public key — a real ECPair round trip', () => {
    const { ECPairFactory } = require('ecpair')
    const ECPair = ECPairFactory(ecc)
    const kp = generateEscrowKeypair()
    const keyPair = ECPair.fromPrivateKey(Buffer.from(kp.privateKey), { network: bitcoin.networks.testnet })
    expect(Buffer.from(keyPair.publicKey).toString('hex')).toBe(kp.publicKeyHex)
  })
})

/**
 * Phase 2 (2026-07-27) — signEscrowPsbt(), real @bitcoinerlab/secp256k1
 * signing cross-checked against a tiny-secp256k1-backed combine/finalize
 * (the backend's own ECC library, multisig.provider.ts) — proves the two
 * ECC implementations genuinely interoperate on the same PSBT bytes, the
 * actual requirement (client signs with one library, server finalizes
 * with another). Mirrors the experimental verification
 * (bitcoinerlab-experiment.js) done before this function was written.
 */
describe('signEscrowPsbt', () => {
  function buildUnsigned2of2Psbt(buyerPubkey: Uint8Array, sellerPubkey: Uint8Array) {
    const network = bitcoin.networks.testnet
    const pubkeys = [Buffer.from(buyerPubkey), Buffer.from(sellerPubkey)].sort(Buffer.compare)
    const p2ms = bitcoin.payments.p2ms({ m: 2, pubkeys, network })
    const p2wsh = bitcoin.payments.p2wsh({ redeem: p2ms, network })

    const psbt = new bitcoin.Psbt({ network })
    psbt.addInput({
      hash: 'c'.repeat(64),
      index: 0,
      witnessUtxo: { script: p2wsh.output!, value: 100000n },
      witnessScript: p2ms.output!,
    })
    psbt.addOutput({ address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', value: 90000n })
    return psbt.toBase64()
  }

  it('signs input 0 of an unsigned PSBT, producing a base64 PSBT with a real partial signature', () => {
    const buyer = generateEscrowKeypair()
    const seller = generateEscrowKeypair()
    const unsignedBase64 = buildUnsigned2of2Psbt(buyer.publicKey, seller.publicKey)

    const signedBase64 = signEscrowPsbt(unsignedBase64, buyer.privateKey)
    expect(typeof signedBase64).toBe('string')
    expect(signedBase64).not.toBe(unsignedBase64)
  })

  it('two independently-signed copies combine and finalize with tiny-secp256k1 (the backend\'s own ECC library) — real cross-library interop', () => {
    const buyer = generateEscrowKeypair()
    const seller = generateEscrowKeypair()
    const unsignedBase64 = buildUnsigned2of2Psbt(buyer.publicKey, seller.publicKey)

    const buyerSignedBase64 = signEscrowPsbt(unsignedBase64, buyer.privateKey)
    const sellerSignedBase64 = signEscrowPsbt(unsignedBase64, seller.privateKey)

    // The "server" side — same eccLib multisig.provider.ts actually uses.
    bitcoin.initEccLib(ecc)
    const merged = bitcoin.Psbt.fromBase64(unsignedBase64, { network: bitcoin.networks.testnet })
    merged.combine(bitcoin.Psbt.fromBase64(buyerSignedBase64, { network: bitcoin.networks.testnet }))
    merged.combine(bitcoin.Psbt.fromBase64(sellerSignedBase64, { network: bitcoin.networks.testnet }))
    merged.finalizeAllInputs()
    const tx = merged.extractTransaction()
    expect(tx.toHex().length).toBeGreaterThan(0)
  })

  it('a single signed copy alone correctly fails to finalize a 2-of-2 script', () => {
    const buyer = generateEscrowKeypair()
    const seller = generateEscrowKeypair()
    const unsignedBase64 = buildUnsigned2of2Psbt(buyer.publicKey, seller.publicKey)
    const buyerSignedBase64 = signEscrowPsbt(unsignedBase64, buyer.privateKey)

    bitcoin.initEccLib(ecc)
    const onlyBuyer = bitcoin.Psbt.fromBase64(buyerSignedBase64, { network: bitcoin.networks.testnet })
    expect(() => onlyBuyer.finalizeAllInputs()).toThrow()
  })
})
