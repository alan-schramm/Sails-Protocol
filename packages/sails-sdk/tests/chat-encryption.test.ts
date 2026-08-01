/**
 * chat-encryption.ts — real cryptography (tweetnacl + @noble/curves' real
 * X25519 conversion), no mocking of the crypto itself. The property that
 * distinguishes this from payload-crypto.ts's sealed box (server-side,
 * used for Intent delivery) is exercised directly: the original sender
 * can decrypt their own sent message later, not just the recipient.
 */
import { generateKeypair } from '../src/modules/identity'
import { bytesToHex } from '../src/encoding'
import { encryptChatMessage, decryptChatMessage } from '../src/chat-encryption'

describe('chat-encryption', () => {
  it('the recipient can decrypt a message encrypted for them', () => {
    const alice = generateKeypair()
    const bob = generateKeypair()
    const bobPublicKeyHex = bytesToHex(bob.publicKey)
    const alicePublicKeyHex = bytesToHex(alice.publicKey)

    const encrypted = encryptChatMessage('sending payment now', bobPublicKeyHex, alice)
    const decrypted = decryptChatMessage(encrypted, alicePublicKeyHex, bob)

    expect(decrypted).toBe('sending payment now')
  })

  // The actual reason this file exists instead of reusing
  // payload-crypto.ts's crypto_box_seal: a sealed box can only ever be
  // opened by its recipient, not the original sender — wrong for a
  // stored, re-readable chat history (GET .../messages). This proves
  // the real property a sealed box does not have.
  it('the original sender can also decrypt their own sent message later', () => {
    const alice = generateKeypair()
    const bob = generateKeypair()
    const bobPublicKeyHex = bytesToHex(bob.publicKey)
    const alicePublicKeyHex = bytesToHex(alice.publicKey)

    const encrypted = encryptChatMessage('nova chave pix: 123', bobPublicKeyHex, alice)
    // Alice, re-reading her own sent message from history — same call
    // shape as Bob's, just with the roles of "self"/"counterparty" swapped.
    const decrypted = decryptChatMessage(encrypted, bobPublicKeyHex, alice)

    expect(decrypted).toBe('nova chave pix: 123')
  })

  it('rejects decryption with the wrong keypair', () => {
    const alice = generateKeypair()
    const bob = generateKeypair()
    const mallory = generateKeypair()
    const bobPublicKeyHex = bytesToHex(bob.publicKey)

    const encrypted = encryptChatMessage('confidential', bobPublicKeyHex, alice)

    expect(() => decryptChatMessage(encrypted, bytesToHex(alice.publicKey), mallory)).toThrow(/failed to open/)
  })

  it('rejects decryption against the wrong counterparty public key', () => {
    const alice = generateKeypair()
    const bob = generateKeypair()
    const mallory = generateKeypair()
    const bobPublicKeyHex = bytesToHex(bob.publicKey)

    const encrypted = encryptChatMessage('confidential', bobPublicKeyHex, alice)

    // Bob has the right keypair, but is checking against the wrong
    // claimed sender — must not succeed just because the private key
    // side is correct.
    expect(() => decryptChatMessage(encrypted, bytesToHex(mallory.publicKey), bob)).toThrow(/failed to open/)
  })

  it('rejects tampered ciphertext', () => {
    const alice = generateKeypair()
    const bob = generateKeypair()
    const bobPublicKeyHex = bytesToHex(bob.publicKey)
    const alicePublicKeyHex = bytesToHex(alice.publicKey)

    const encrypted = encryptChatMessage('sending payment now', bobPublicKeyHex, alice)
    const tampered = { ...encrypted, ciphertext: Buffer.from('not the real ciphertext').toString('base64') }

    expect(() => decryptChatMessage(tampered, alicePublicKeyHex, bob)).toThrow(/failed to open/)
  })

  it('produces different ciphertext for the same content each time (fresh nonce)', () => {
    const alice = generateKeypair()
    const bob = generateKeypair()
    const bobPublicKeyHex = bytesToHex(bob.publicKey)

    const first = encryptChatMessage('same message', bobPublicKeyHex, alice)
    const second = encryptChatMessage('same message', bobPublicKeyHex, alice)

    expect(first.nonce).not.toBe(second.nonce)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  })
})
