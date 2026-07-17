/**
 * @sails/sdk — Sails OpenIdentity module
 *
 * Real Ed25519 challenge-response, matching `src/common/middleware/auth.ts`
 * byte-for-byte — verified by reading that file directly before writing
 * this one, not assumed from `API_REFERENCE.md`'s prose. The subtle part:
 * `auth.ts`'s `verifySignedChallenge()` does not sign the raw 32 random
 * bytes the server generated — it re-encodes the challenge (already a hex
 * *string*) through `Buffer.from(storedChallenge).toString('hex')` before
 * verifying, which is UTF-8-encoding the literal hex *text* and hex-encoding
 * *that* — net effect, the actual signed message is the UTF-8 byte
 * representation of the challenge string itself, not the 32 bytes that
 * string represents. `sign()` below reproduces that exactly
 * (`utf8ToBytes(challenge)`), or authentication would fail against the
 * real server despite looking correct.
 *
 * Uses `tweetnacl` — pure JS, the same package `auth.ts` itself uses
 * server-side (not a different Ed25519 implementation that happens to be
 * compatible), and browser-safe (SDK_GUIDE.md section 6), unlike the
 * reference implementation's other crypto dependency (`sodium-native`,
 * a native Node addon used for P2P payload encryption — infrastructure,
 * not identity, and correctly not something this SDK needs).
 */
import nacl from 'tweetnacl'
import type { SailsTransport } from '../transport'
import type { Participant } from '../types'
import { bytesToHex, hexToBytes, utf8ToBytes } from '../encoding'

export interface Ed25519Keypair {
  publicKey: Uint8Array
  secretKey: Uint8Array
}

export interface AuthenticateResult {
  participantId: string
  sessionToken: string
}

export function generateKeypair(): Ed25519Keypair {
  return nacl.sign.keyPair()
}

function sign(challenge: string, secretKey: Uint8Array): string {
  const signature = nacl.sign.detached(utf8ToBytes(challenge), secretKey)
  return bytesToHex(signature)
}

export class SailsIdentityModule {
  constructor(private readonly transport: SailsTransport) {}

  /**
   * Registers a new Participant for `keypair` (generates one if omitted —
   * SDK_GUIDE.md section 6: "sane defaults for everything else"). Returns
   * both the registered Participant and the keypair used, since a caller
   * who didn't supply one needs it back to ever authenticate again — the
   * SDK never silently generates and discards key material.
   */
  async create(keypair?: Ed25519Keypair, displayName?: string): Promise<{ participant: Participant; keypair: Ed25519Keypair }> {
    const kp = keypair ?? generateKeypair()
    const publicKey = bytesToHex(kp.publicKey)
    const participant = await this.transport.post<Participant>('/v1/identity/participants', { publicKey, displayName })
    return { participant, keypair: kp }
  }

  async get(participantId: string): Promise<Participant> {
    return this.transport.get<Participant>(`/v1/identity/participants/${participantId}`)
  }

  /** Requires an active session (see authenticate()). */
  async me(): Promise<Participant> {
    return this.transport.get<Participant>('/v1/identity/me', undefined, true)
  }

  async challenge(publicKeyHex: string): Promise<{ challenge: string; expiresIn: number }> {
    return this.transport.post<{ challenge: string; expiresIn: number }>('/v1/identity/challenge', { publicKey: publicKeyHex })
  }

  /**
   * The full challenge-response flow in one call: requests a challenge for
   * `keypair.publicKey`, signs it correctly, submits it, and stores the
   * returned session token on this client's transport so every subsequent
   * authenticated call just works — matching `SailsClient`'s "one typed
   * client" promise (SDK_GUIDE.md section 1) rather than making every
   * caller wire the three HTTP calls together by hand.
   */
  async authenticate(keypair: Ed25519Keypair): Promise<AuthenticateResult> {
    const publicKey = bytesToHex(keypair.publicKey)
    const { challenge } = await this.challenge(publicKey)
    const signature = sign(challenge, keypair.secretKey)
    const result = await this.transport.post<AuthenticateResult>('/v1/identity/authenticate', { publicKey, signature })
    this.transport.setSessionToken(result.sessionToken)
    return result
  }
}

// Re-exported for callers who want to manage key material themselves
// (e.g. a wallet's own secure-storage layer) without going through
// identity.create()'s convenience path.
export { hexToBytes }
