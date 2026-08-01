/**
 * @sails/sdk — chat/negotiation message encryption.
 *
 * Closes a real, named gap (docs/BACKLOG.md's OpenP2P row,
 * `src/infrastructure/p2p/payload-crypto.ts`'s own header comment):
 * Intent payloads sent over Pears get real application-layer sealed-box
 * encryption; chat messages (`chat.routes.ts`'s WS route,
 * `HumanChatChannel`) still send plain JSON — the server, and anyone
 * relaying it, can read every message. This file is the client-side
 * primitive that closes that gap for chat specifically. Deliberately
 * NOT wired into `openp2p.chat()`'s default send/receive path in this
 * pass — `content` stays a free-form string server-side
 * (`chat.routes.ts`'s zod schema already accepts any non-empty string,
 * no server change needed to opt in), and making encryption the
 * unconditional default would be a real behavioural change affecting
 * every existing plaintext message in every deployment's history, not
 * a decision to make silently inside an SDK patch. A caller opts in by
 * calling `encryptChatMessage()` before `chat(tradeId).send()` and
 * `decryptChatMessage()` inside `onMessage()` — exposed here as real,
 * tested, ready-to-use primitives (`packages/sails-ui`'s `ChatWindow`
 * is the natural place to wire this in next, tracked separately from
 * this SDK change).
 *
 * Deliberately a different primitive than `payload-crypto.ts`'s
 * `crypto_box_seal` (anonymous sealed box): a sealed box is designed so
 * only the *recipient* can ever open it — not even the sender can
 * decrypt their own sealed message afterward, which is fine for a
 * one-shot Intent delivery but wrong for a stored, re-readable chat
 * history (`GET /v1/openp2p/chat/:tradeId/messages` — the sender needs
 * to read their own sent messages back too). Uses a real X25519
 * Diffie-Hellman shared key instead (`nacl.box.before`, precomputing the
 * same shared key `crypto_box`/`crypto_box_open` derive internally) —
 * the same key is derivable by either party from their own secret key +
 * the other's public key, so both the recipient AND the original sender
 * can decrypt the same message later. `ed2curve` (the standard
 * `tweetnacl` companion for exactly this, by the same author,
 * dependency-free) converts each side's existing Ed25519 identity
 * keypair to Curve25519 first — the same conversion `payload-crypto.ts`
 * does with `sodium-native` server-side; done here with `tweetnacl`'s
 * own ecosystem instead since this package must run in both Node and
 * the browser, unlike the Node-only reference implementation.
 * `@noble/curves` (already a dependency, used elsewhere in this
 * package) was tried first and deliberately rejected here: this
 * monorepo has two conflicting major versions of it in play
 * (`escrow-key.ts`'s own header comment documents the same fight) whose
 * Ed25519->X25519 conversion API isn't stable across them — `ed2curve`
 * sidesteps that entirely.
 */
import nacl from 'tweetnacl'
import ed2curve from 'ed2curve'
import { bytesToBase64, base64ToBytes, hexToBytes, utf8ToBytes } from './encoding'
import type { Ed25519Keypair } from './modules/identity'

export interface EncryptedChatMessage {
  ciphertext: string // base64
  nonce: string // base64
}

// A fresh Diffie-Hellman shared-key derivation per call rather than a
// cached session key — chat messages are small and infrequent enough
// (unlike, say, per-keystroke traffic) that re-deriving costs nothing
// worth optimising away, and it means there's no session-key lifecycle
// to get wrong (rotation, invalidation on keypair change, etc.).
function deriveSharedKey(myEd25519SecretKey: Uint8Array, counterpartyEd25519PublicKey: Uint8Array): Uint8Array {
  const myX25519SecretKey = ed2curve.convertSecretKey(myEd25519SecretKey)
  const counterpartyX25519PublicKey = ed2curve.convertPublicKey(counterpartyEd25519PublicKey)
  if (!counterpartyX25519PublicKey) {
    throw new Error('deriveSharedKey: counterparty public key is not a valid Ed25519 point')
  }
  return nacl.box.before(counterpartyX25519PublicKey, myX25519SecretKey)
}

/**
 * Encrypts `content` so that only the two parties to this conversation
 * — the caller (`myKeypair`) and `counterpartyEd25519PublicKeyHex` (the
 * other trade party's real identity public key, e.g. from
 * `identity.get(counterpartyId)`) — can read it back, at any point
 * (unlike a sealed box). Returns a small JSON-serialisable object, not
 * a bare string — a caller sends `JSON.stringify(encryptChatMessage(...))`
 * as `content` on the existing `SEND_MESSAGE`/`chat(tradeId).send()`
 * shape, no protocol change needed.
 */
export function encryptChatMessage(
  content: string,
  counterpartyEd25519PublicKeyHex: string,
  myKeypair: Ed25519Keypair
): EncryptedChatMessage {
  const key = deriveSharedKey(myKeypair.secretKey, hexToBytes(counterpartyEd25519PublicKeyHex))
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const ciphertext = nacl.secretbox(utf8ToBytes(content), nonce, key)
  return { ciphertext: bytesToBase64(ciphertext), nonce: bytesToBase64(nonce) }
}

/**
 * Decrypts a message produced by `encryptChatMessage` — callable by
 * either party to that original call (the recipient reading it for the
 * first time, or the original sender reading their own sent message
 * back later from history), since both sides of an X25519 exchange
 * derive the identical shared secret.
 */
export function decryptChatMessage(
  encrypted: EncryptedChatMessage,
  counterpartyEd25519PublicKeyHex: string,
  myKeypair: Ed25519Keypair
): string {
  const key = deriveSharedKey(myKeypair.secretKey, hexToBytes(counterpartyEd25519PublicKeyHex))
  const nonce = base64ToBytes(encrypted.nonce)
  const ciphertext = base64ToBytes(encrypted.ciphertext)
  const opened = nacl.secretbox.open(ciphertext, nonce, key)
  if (!opened) {
    throw new Error(
      'decryptChatMessage: failed to open — wrong keypair, wrong counterparty public key, or corrupted/tampered data'
    )
  }
  return new TextDecoder().decode(opened)
}
