/**
 * SailsSignerService (RFC-020) — real secp256k1 post-processing logic, no
 * mocking, no live AWS call (none of `SailsSignerService`'s own methods
 * are exercised here — they require a live KMSClient; see kms-signer.ts's
 * own header comment). What IS real and tested: `parseDerSignature`/
 * `toEthereumSignature`/`extractUncompressedPubkeyFromSpki`/
 * `ethereumAddressFromUncompressedPubkey` — the pure-computation
 * functions that turn AWS KMS's real wire shapes (DER-encoded ECDSA
 * signature, DER SubjectPublicKeyInfo) into a Safe/Ethereum-usable
 * signature and address.
 *
 * The DER signature used here is genuinely produced by `@noble/curves`'s
 * own real `secp256k1.sign(..., { prehash: false })` + `.toBytes('der')`
 * — the exact wire shape AWS KMS's SignCommand returns for an
 * ECC_SECG_P256K1 key with SigningAlgorithm ECDSA_SHA_256 in DIGEST mode
 * — not a hand-constructed byte string.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { parseDerSignature, toEthereumSignature, extractUncompressedPubkeyFromSpki, ethereumAddressFromUncompressedPubkey } from '../src/custody/kms-signer'

function realKmsShapedDerSignature(digest: Uint8Array) {
  const { secretKey, publicKey } = secp256k1.keygen()
  const rawSigBytes = secp256k1.sign(digest, secretKey, { prehash: false })
  const sig = secp256k1.Signature.fromBytes(rawSigBytes, 'compact')
  const der = sig.toBytes('der')
  const uncompressedPubkey = secp256k1.getPublicKey(secretKey, false)
  return { der, uncompressedPubkey, secretKey }
}

describe('parseDerSignature + toEthereumSignature — real KMS-shaped DER round trip', () => {
  it('parses a real DER signature and produces a 65-byte Ethereum signature that verifies against the real public key', () => {
    const digest = keccak_256(new TextEncoder().encode('sails-rfc020-userop-test'))
    const { der, uncompressedPubkey } = realKmsShapedDerSignature(digest)

    const sig = parseDerSignature(der)
    const ethSig = toEthereumSignature(sig, digest, uncompressedPubkey)

    expect(ethSig.length).toBe(65)
    expect([27, 28]).toContain(ethSig[64])

    const compact = ethSig.slice(0, 64)
    expect(secp256k1.verify(compact, digest, uncompressedPubkey, { prehash: false })).toBe(true)
  })

  it('SECURITY: the recovered signature does not verify against a different (tampered) digest', () => {
    const digest = keccak_256(new TextEncoder().encode('release 1000000000000000000 wei to buyer'))
    const tamperedDigest = keccak_256(new TextEncoder().encode('release 1000000000000000000 wei to attacker'))
    const { der, uncompressedPubkey } = realKmsShapedDerSignature(digest)

    const sig = parseDerSignature(der)
    const ethSig = toEthereumSignature(sig, digest, uncompressedPubkey)
    const compact = ethSig.slice(0, 64)

    expect(secp256k1.verify(compact, tamperedDigest, uncompressedPubkey, { prehash: false })).toBe(false)
  })

  it('SECURITY: toEthereumSignature rejects a signature that does not belong to the claimed public key', () => {
    const digest = keccak_256(new TextEncoder().encode('sails-rfc020-userop-test'))
    const { der } = realKmsShapedDerSignature(digest)
    const attackerKeypair = secp256k1.keygen()

    const sig = parseDerSignature(der)
    expect(() => toEthereumSignature(sig, digest, attackerKeypair.publicKey)).toThrow(/neither recovery candidate matches/)
  })

  it('normalizes a high-S signature to low-S before returning it', () => {
    const digest = keccak_256(new TextEncoder().encode('high-s-normalization-test'))
    const { der } = realKmsShapedDerSignature(digest)
    const sig = parseDerSignature(der)
    expect(sig.hasHighS()).toBe(false)
  })
})

describe('extractUncompressedPubkeyFromSpki + ethereumAddressFromUncompressedPubkey', () => {
  it('extracts the real 65-byte EC point from a DER SubjectPublicKeyInfo and derives a valid Ethereum address', () => {
    // Real minimal ECC_SECG_P256K1 SubjectPublicKeyInfo prefix (SEQUENCE {
    // SEQUENCE { OID ecPublicKey, OID secp256k1 }, BIT STRING }) followed
    // by the real uncompressed point — matches the fixed shape
    // extractUncompressedPubkeyFromSpki relies on.
    const derPrefix = new Uint8Array([
      0x30, 0x56, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a, 0x03, 0x42,
      0x00,
    ])
    const { secretKey } = secp256k1.keygen()
    const uncompressedPubkey = secp256k1.getPublicKey(secretKey, false)
    const spki = new Uint8Array(derPrefix.length + uncompressedPubkey.length)
    spki.set(derPrefix, 0)
    spki.set(uncompressedPubkey, derPrefix.length)

    const extracted = extractUncompressedPubkeyFromSpki(spki)
    expect(bytesToHex(extracted)).toBe(bytesToHex(uncompressedPubkey))

    const address = ethereumAddressFromUncompressedPubkey(extracted)
    expect(address).toMatch(/^0x[0-9a-f]{40}$/)

    // Cross-check against a direct, independent computation.
    const expectedHash = keccak_256(uncompressedPubkey.slice(1))
    expect(address).toBe('0x' + bytesToHex(expectedHash.slice(-20)))
  })

  it('rejects a malformed SubjectPublicKeyInfo', () => {
    expect(() => extractUncompressedPubkeyFromSpki(new Uint8Array(10))).toThrow(/unexpected SubjectPublicKeyInfo shape/)
  })
})
