/**
 * signEscrowSafeUserOp() — real secp256k1 signing, no mocking, same
 * discipline `escrow-key.test.ts`/`custody-kms-signer.test.ts` already
 * established for this SDK's other client-signing helpers. Verifies the
 * produced 65-byte Ethereum signature independently via
 * `secp256k1.verify()` (this SDK's own already-installed crypto
 * dependency, not the server's source tree — this package must never
 * depend on `src/`, per `escrow-key.test.ts`'s own comment) rather than
 * importing the backend's `recoverSignerAddress()`. A real, live
 * cross-check of both sides (this signature recovering to the correct
 * address via the actual backend recovery code) was run manually before
 * this file was written — `src/modules/open-settlement/safe-guard-evm.provider.ts`'s
 * `recoverSignerAddress()` recovered the exact expected address from a
 * signature this function produced.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { generateEscrowKeypair } from '../src/modules/escrow-key'
import { signEscrowSafeUserOp } from '../src/modules/escrow-safe-signing'

function fakeBundle(userOpHash: string): string {
  return JSON.stringify({
    path: 'COOPERATIVE',
    userOpHash,
    toAddress: '0x' + '11'.repeat(20),
    guardAddress: '0x' + '22'.repeat(20),
    guardDeployment: { to: '0x' + '33'.repeat(20), data: '0x' },
  })
}

describe('signEscrowSafeUserOp', () => {
  it('produces a real 65-byte (r,s,v) Ethereum signature that verifies against the signer\'s own public key', () => {
    const keys = generateEscrowKeypair()
    const uncompressedPubkey = secp256k1.getPublicKey(keys.privateKey, false)
    const digest = keccak_256(new TextEncoder().encode('sails-safe-guard-evm-test-userop'))
    const bundle = fakeBundle('0x' + bytesToHex(digest))

    const signature = signEscrowSafeUserOp(bundle, keys.privateKey)

    expect(signature).toMatch(/^0x[0-9a-f]{130}$/)
    const sigBytes = Buffer.from(signature.slice(2), 'hex')
    const v = sigBytes[64]
    expect([27, 28]).toContain(v)

    const compact = sigBytes.slice(0, 64)
    expect(secp256k1.verify(compact, digest, uncompressedPubkey, { prehash: false })).toBe(true)
  })

  it('the recovery byte actually recovers the correct public key (not just any valid signature)', () => {
    const keys = generateEscrowKeypair()
    const uncompressedPubkey = secp256k1.getPublicKey(keys.privateKey, false)
    const digest = keccak_256(new TextEncoder().encode('recovery-bit-test'))
    const bundle = fakeBundle('0x' + bytesToHex(digest))

    const signature = signEscrowSafeUserOp(bundle, keys.privateKey)
    const sigBytes = Buffer.from(signature.slice(2), 'hex')
    const v = sigBytes[64]

    const sig = secp256k1.Signature.fromBytes(sigBytes.slice(0, 64), 'compact').addRecoveryBit(v - 27)
    const recovered = sig.recoverPublicKey(digest).toBytes(false)
    expect(bytesToHex(recovered)).toBe(bytesToHex(uncompressedPubkey))
  })

  it('SECURITY: the signature does not verify against a tampered userOpHash', () => {
    const keys = generateEscrowKeypair()
    const uncompressedPubkey = secp256k1.getPublicKey(keys.privateKey, false)
    const digest = keccak_256(new TextEncoder().encode('release 1000000000000000000 wei to buyer'))
    const tamperedDigest = keccak_256(new TextEncoder().encode('release 1000000000000000000 wei to attacker'))
    const bundle = fakeBundle('0x' + bytesToHex(digest))

    const signature = signEscrowSafeUserOp(bundle, keys.privateKey)
    const compact = Buffer.from(signature.slice(2, 2 + 128), 'hex')

    expect(secp256k1.verify(compact, tamperedDigest, uncompressedPubkey, { prehash: false })).toBe(false)
  })

  it('produces a low-S signature (no manual normalization needed, per @noble/curves ECDSA default)', () => {
    const keys = generateEscrowKeypair()
    const digest = keccak_256(new TextEncoder().encode('low-s-test'))
    const bundle = fakeBundle('0x' + bytesToHex(digest))

    const signature = signEscrowSafeUserOp(bundle, keys.privateKey)
    const sigBytes = Buffer.from(signature.slice(2), 'hex')
    const sig = secp256k1.Signature.fromBytes(sigBytes.slice(0, 64), 'compact')
    expect(sig.hasHighS()).toBe(false)
  })

  it('throws a clear error for a non-SAFE_GUARD_EVM bundle (e.g. a MULTISIG PSBT base64 string)', () => {
    const keys = generateEscrowKeypair()
    expect(() => signEscrowSafeUserOp('cHNidP8BAAA=', keys.privateKey)).toThrow(/not valid JSON|not a SAFE_GUARD_EVM bundle/)
  })

  it('a different private key produces a different, non-interchangeable signature for the same bundle', () => {
    const keys1 = generateEscrowKeypair()
    const keys2 = generateEscrowKeypair()
    const digest = keccak_256(new TextEncoder().encode('shared-bundle-test'))
    const bundle = fakeBundle('0x' + bytesToHex(digest))

    const sig1 = signEscrowSafeUserOp(bundle, keys1.privateKey)
    const sig2 = signEscrowSafeUserOp(bundle, keys2.privateKey)
    expect(sig1).not.toBe(sig2)

    const pubkey1 = secp256k1.getPublicKey(keys1.privateKey, false)
    const compact2 = Buffer.from(sig2.slice(2, 2 + 128), 'hex')
    expect(secp256k1.verify(compact2, digest, pubkey1, { prehash: false })).toBe(false)
  })
})
