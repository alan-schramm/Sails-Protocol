/**
 * payload-crypto.ts — real cryptography, no network dependency.
 *
 * Unlike PearsTransportProvider (wraps live HyperDHT/Hyperswarm — cannot be
 * verified without a real P2P network, transportFallback.test.ts's own
 * header explains why that file doesn't try), the encrypt/decrypt math
 * here is pure and fully verifiable in this environment: real Ed25519
 * keypairs from HyperDHT's own `keyPair()` (the same call PearNode makes),
 * a real Ed25519->Curve25519 conversion, and a real libsodium sealed box —
 * no mocking, no fakes, no doubles. This is the "database simulation
 * removed" half of wiring direct P2P Intent delivery: the crypto is not
 * simulated and is checked against itself here.
 */
import HyperDHT from 'hyperdht'
import { encryptForPeer, decryptFromPeer } from '../src/infrastructure/p2p/payload-crypto'

describe('payload-crypto (real libsodium, real HyperDHT keypairs)', () => {
  it('round-trips a payload: only the intended recipient keypair can decrypt it', () => {
    const seller = HyperDHT.keyPair()
    const payload = { asset: 'USDT_ERC20', side: 'BUY', maxValue: '20.5', minValue: '0' }

    const sealed = encryptForPeer(payload, seller.publicKey.toString('hex'))
    const opened = decryptFromPeer(sealed, seller)

    expect(opened).toEqual(payload)
  })

  it('produces ciphertext that a different keypair cannot open', () => {
    const seller = HyperDHT.keyPair()
    const eavesdropper = HyperDHT.keyPair()
    const payload = { asset: 'BTC', side: 'SELL' }

    const sealed = encryptForPeer(payload, seller.publicKey.toString('hex'))

    expect(() => decryptFromPeer(sealed, eavesdropper)).toThrow(/failed to open sealed payload/)
  })

  it('rejects tampered ciphertext rather than returning corrupted data', () => {
    const seller = HyperDHT.keyPair()
    const sealed = encryptForPeer({ asset: 'BTC' }, seller.publicKey.toString('hex'))

    const tampered = Buffer.from(sealed, 'base64')
    tampered[tampered.length - 1] ^= 0xff // flip a byte near the end
    const tamperedBase64 = tampered.toString('base64')

    expect(() => decryptFromPeer(tamperedBase64, seller)).toThrow(/failed to open sealed payload/)
  })

  it('works with a 32-byte seed as secretKey, not just the full 64-byte key', () => {
    // Correction, 2026-08-09 — pear.service.ts's PearNode.start() used to
    // store only `secretKey.slice(0, 32)` (the seed half) as
    // `this.keyPair.secretKey`, so this test's own coverage mattered for
    // getKeyPair()'s real output shape at the time. The key-custody fix
    // (that file's own doc comment) switched PearNode to use
    // HyperDHT.keyPair()'s native, unsliced 64-byte form directly —
    // getKeyPair() no longer returns this 32-byte shape. Kept as a real
    // robustness check on decryptFromPeer() itself (a defensive property
    // worth having regardless of what any one caller happens to pass),
    // not because PearNode still produces this shape.
    const full = HyperDHT.keyPair()
    const pearNodeShapedKeyPair = { publicKey: full.publicKey, secretKey: full.secretKey.slice(0, 32) }
    const payload = { intentId: 'intent-1', targetModule: 'openp2p' }

    const sealed = encryptForPeer(payload, full.publicKey.toString('hex'))
    const opened = decryptFromPeer(sealed, pearNodeShapedKeyPair)

    expect(opened).toEqual(payload)
  })
})
