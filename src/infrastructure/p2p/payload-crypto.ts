/**
 * Payload Crypto — Sails Protocol Infrastructure Layer
 * RFC-002 (rfcs/RFC-002-transport-provider.md); closes a real gap flagged
 * while wiring direct Intent delivery over Pears: `websocket-relay.service.ts`
 * has claimed since it was written that "Secretstream/E2E encryption already
 * happens above this layer" — true only in the sense that Hyperswarm's own
 * Noise_XX handshake (via the official `@hyperswarm/secret-stream`,
 * transitive through `hyperdht`) encrypts the wire transport between two
 * connected peers. Nothing in this codebase encrypted a *payload* before
 * handing it to `sendToPeer`/`broadcast` — this file is that missing piece,
 * an explicit application-layer encryption step, not a redundant one: it
 * means a payload is confidential to its intended recipient even if a
 * future transport (the WebSocket relay fallback, or any TransportProvider
 * yet to be written per RFC-002) has weaker or no transport-level
 * encryption of its own.
 *
 * Built entirely on `sodium-native` — the same official libsodium binding
 * `hyperdht`/`hyperswarm` already depend on transitively, not a new/foreign
 * crypto library. `PearNode`'s identity keypair (`HyperDHT.keyPair()`'s
 * output, RFC-002 Decision) is Ed25519 (signing), not Curve25519
 * (encryption) — `crypto_box_seal` needs the latter, so every peer's
 * public identity key is converted via libsodium's own standard
 * Ed25519→Curve25519 birational map (`crypto_sign_ed25519_*_to_curve25519`)
 * before use. This conversion is deterministic and lossless in both
 * directions for the keypair itself — verified locally with a real
 * generated HyperDHT keypair (encrypt with the converted public key,
 * decrypt with the converted secret key, byte-identical roundtrip) before
 * this file was written, since a live two-node network to verify the
 * *transport* half of this feature isn't available in this environment
 * (the same limitation `transport-provider.ts`'s own tests already
 * disclose for `PearsTransportProvider`) — but pure cryptographic math has
 * no such dependency, so it doesn't inherit that limitation and is unit
 * tested for real in `tests/payloadCrypto.test.ts`.
 *
 * `crypto_box_seal` (anonymous sealed box) is deliberately the primitive
 * used, not an authenticated `crypto_box_easy` with a persistent nonce —
 * sealed boxes need only the recipient's public key to encrypt, matching
 * `sendToPeer(targetParticipantId, payload)`'s existing shape exactly (the
 * caller already knows who they're sending to; they don't need to separately
 * manage a nonce or announce their own key out of band). Sender
 * authentication of an Intent's origin is a different, already-solved
 * problem — `Participant`/RFC-001 identity plus the Ed25525 DHT keypair
 * that authenticated the underlying Hyperswarm connection already tells the
 * recipient who they're connected to; this layer only needs to keep the
 * payload's *contents* opaque to anything that isn't that specific peer.
 */
import sodium from 'sodium-native'

export interface Ed25519KeyPair {
  publicKey: Buffer
  secretKey: Buffer // may be the 32-byte seed (PearNode's stored form) or the full 64-byte key — see toCurve25519SecretKey
}

function ed25519PublicKeyToCurve25519(edPublicKey: Buffer): Buffer {
  const curvePublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES)
  sodium.crypto_sign_ed25519_pk_to_curve25519(curvePublicKey, edPublicKey)
  return curvePublicKey
}

// PearNode stores only the 32-byte seed half of the Ed25519 secret key
// (pear.service.ts's PearNode.start(): `secretKey.slice(0, 32)`) — libsodium's
// Ed25519→Curve25519 conversion needs the full 64-byte form (seed +
// public key). Reconstructing it by concatenation is not a workaround: it
// is the standard Ed25519 secret-key layout (verified byte-for-byte against
// HyperDHT.keyPair()'s own un-split output before this file was written),
// so the reconstructed key derives the identical Curve25519 secret key
// as the original, unsplit 64-byte key would.
function ed25519SecretKeyToCurve25519(edSecretKeyOrSeed: Buffer, edPublicKey: Buffer): Buffer {
  const full = edSecretKeyOrSeed.length === 64
    ? edSecretKeyOrSeed
    : Buffer.concat([edSecretKeyOrSeed, edPublicKey])
  const curveSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES)
  sodium.crypto_sign_ed25519_sk_to_curve25519(curveSecretKey, full)
  return curveSecretKey
}

/**
 * Encrypts `payload` so that only the holder of `recipientEd25519PublicKeyHex`
 * (a peer's real HyperDHT/Hyperswarm identity public key — the same hex
 * string PearNode calls a "peerId" everywhere else in this codebase) can
 * read it. Returns a base64 string safe to hand directly to
 * `TransportProvider.sendToPeer()`.
 */
export function encryptForPeer(payload: unknown, recipientEd25519PublicKeyHex: string): string {
  const recipientCurvePublicKey = ed25519PublicKeyToCurve25519(Buffer.from(recipientEd25519PublicKeyHex, 'hex'))
  const message = Buffer.from(JSON.stringify(payload))
  const sealed = Buffer.alloc(message.length + sodium.crypto_box_SEALBYTES)
  sodium.crypto_box_seal(sealed, message, recipientCurvePublicKey)
  return sealed.toString('base64')
}

/**
 * Decrypts a payload produced by `encryptForPeer`, using the receiving
 * node's own Ed25519 keypair (`PearNode`'s own identity — the sealed box
 * can only be opened by whoever `encryptForPeer` targeted).
 */
export function decryptFromPeer<T = unknown>(sealedBase64: string, ownKeyPair: Ed25519KeyPair): T {
  const sealed = Buffer.from(sealedBase64, 'base64')
  const ownCurvePublicKey = ed25519PublicKeyToCurve25519(ownKeyPair.publicKey)
  const ownCurveSecretKey = ed25519SecretKeyToCurve25519(ownKeyPair.secretKey, ownKeyPair.publicKey)

  const opened = Buffer.alloc(sealed.length - sodium.crypto_box_SEALBYTES)
  const ok = sodium.crypto_box_seal_open(opened, sealed, ownCurvePublicKey, ownCurveSecretKey)
  if (!ok) {
    throw new Error('decryptFromPeer: failed to open sealed payload — wrong keypair or corrupted/tampered data')
  }
  return JSON.parse(opened.toString()) as T
}
