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
import { generateEscrowKeypair } from '../src/modules/escrow-key'

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
