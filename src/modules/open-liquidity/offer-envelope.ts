/**
 * Sails OpenLiquidity — Portable Signed Offers
 *
 * ADR-001 Day-0 Multi-Operator Sails Network (docs/adr/ADR-001-day0-multi-operator-network.md
 * §3), Implementation Sequence step (a). Full evidence:
 * docs/PORTABLE_SIGNED_OFFERS_EVIDENCE.md.
 *
 * An `OfferEnvelope` is a self-authenticating, portable economic
 * advertisement — deliberately separate from the existing `Offer`
 * model (liquidity.service.ts), which remains this node's own local
 * OpenLiquidity bookkeeping, completely untouched. `logicalOfferId` is
 * the key move: today's `Offer.id` is a node-local DB primary key;
 * `logicalOfferId` is chosen by the offer's own owner and decouples
 * "this is the same offer" from "which node's row it happens to be."
 *
 * Object authority (ADR-001 §2): the only entity that may authorize an
 * envelope's creation, update, cancellation, or expiry is whoever holds
 * the private key for `ownerPublicKey` — this module never signs
 * anything on a caller's behalf (no secret key ever passes through it
 * server-side); `signOfferEnvelope()` below is a reference utility for
 * an offer owner's own client / a future reference SDK, not something
 * this backend calls with a caller-supplied secret.
 */
import nacl from 'tweetnacl'
import { createHash } from 'crypto'
import type { AssetType, TradeSide, PaymentMethod, OfferEnvelopeStatus } from '@prisma/client'

/**
 * Domain-separation tag, the first field of every canonical
 * serialization. Prevents a signature produced for one message class
 * (a different protocol, or a future v2 of this same envelope shape)
 * from ever being replayed as a valid OfferEnvelope signature.
 */
export const OFFER_ENVELOPE_DOMAIN_TAG = 'sails-offer-envelope-v1'

/**
 * ASCII Unit Separator (0x1F) — never appears in any of the fields
 * below (enums, UUIDs, ISO-8601 timestamps, decimal-string amounts),
 * so it cannot be used to forge a field boundary via a crafted value.
 * Plain string concatenation with a fixed field order and a fixed
 * separator — not JSON — because JSON object key ordering is not a
 * cross-language, cross-implementation guarantee; this repository's
 * own IntentEvent/EscrowEvent `entryHash` precedent
 * (`sha256(fromStatus+toStatus+triggeredBy+prevHash)`) already avoids
 * JSON for exactly this reason.
 */
const FIELD_SEPARATOR = '\x1f'

/**
 * The signed content of an OfferEnvelope — every field a verifier
 * needs to recompute the canonical bytes and check the signature.
 * Amounts are decimal strings, never floats — this repo's own
 * `decimalAmountsEqual()`/`normalizeDecimalString()` precedent
 * (`wdk-execution-truth.ts`) already establishes why: floating-point
 * round-tripping of money amounts is unsafe. Timestamps are ISO-8601
 * UTC strings (`toISOString()`), a fixed, unambiguous format across
 * any conformant implementation.
 */
export interface OfferEnvelopeContent {
  logicalOfferId: string
  ownerPublicKey: string
  asset: AssetType
  side: TradeSide
  priceUsd: string
  minAmount: string
  maxAmount: string
  paymentMethod: PaymentMethod
  /**
   * Strictly increasing per `logicalOfferId`, chosen by the owner —
   * both the convergence rule (highest revision wins, no central
   * arbiter needed, ADR-001 §5) and replay protection (ADR-001 §3) in
   * one field.
   */
  revision: number
  /** Owner-supplied, immutable across revisions, advisory only. */
  createdAt: string
  /** Owner-supplied per revision, advisory only. */
  revisedAt: string
  /**
   * Self-enforcing: a verifier checks this against its own clock — no
   * action or central authority is needed to "expire" an offer
   * (ADR-001 §2/§3).
   */
  expiresAt: string
  /**
   * CANCELLED is a signed tombstone at a higher revision, not a row
   * deletion — cancellation is portable via the exact same
   * signature/revision mechanism as any other update (ADR-001 §3).
   */
  status: OfferEnvelopeStatus
}

export interface SignedOfferEnvelope extends OfferEnvelopeContent {
  /** Ed25519 signature, hex-encoded, over `hashOfferEnvelope(content)`. */
  signature: string
}

/**
 * ADR-001 §3's canonical serialization — fixed field order, fixed
 * separator, no ambiguity. Two conformant implementations given the
 * same `OfferEnvelopeContent` MUST produce byte-identical output here;
 * `tests/offerEnvelope.test.ts` carries a hardcoded, deterministic
 * test vector proving this, not merely asserting internal consistency
 * against itself.
 */
export function canonicalizeOfferEnvelope(content: OfferEnvelopeContent): Buffer {
  const fields = [
    OFFER_ENVELOPE_DOMAIN_TAG,
    content.logicalOfferId,
    content.ownerPublicKey,
    content.asset,
    content.side,
    content.priceUsd,
    content.minAmount,
    content.maxAmount,
    content.paymentMethod,
    String(content.revision),
    content.createdAt,
    content.revisedAt,
    content.expiresAt,
    content.status,
  ]
  return Buffer.from(fields.join(FIELD_SEPARATOR), 'utf8')
}

/**
 * The actual bytes that get signed — the sha256 digest of the
 * canonical serialization, not the raw canonical bytes directly. Same
 * "sign the digest, not the payload" shape this repo's own
 * `proof.service.ts#attachEvidence()` already uses for
 * `EvidenceReference.signature` (sign over the media's own sha256 hex
 * digest, not the raw media bytes) — reused here for the identical
 * reason: a fixed-size, unambiguous signing target regardless of how
 * large any individual field might get.
 */
export function hashOfferEnvelope(content: OfferEnvelopeContent): Buffer {
  return createHash('sha256').update(canonicalizeOfferEnvelope(content)).digest()
}

/**
 * Reference signing utility — what a real offer owner's own client
 * does locally, with their own secret key, never sent to any server.
 * Exported for deterministic test-vector generation and any future
 * reference client/SDK implementation of this same envelope format —
 * this backend never calls this function with a caller-supplied secret
 * key; the server side only ever verifies (`verifyOfferEnvelope`
 * below).
 */
export function signOfferEnvelope(content: OfferEnvelopeContent, secretKeyHex: string): string {
  const digest = hashOfferEnvelope(content)
  const secretKey = new Uint8Array(Buffer.from(secretKeyHex, 'hex'))
  const signature = nacl.sign.detached(digest, secretKey)
  return Buffer.from(signature).toString('hex')
}

export type OfferEnvelopeVerdict = { valid: true } | { valid: false; reason: string }

/**
 * Independent verification (ADR-001 §3/§9): any conformant node, given
 * only the envelope's own public fields, re-derives the exact same
 * verdict — no trust in whichever party (origin node or relay)
 * delivered these bytes. A relay that alters ANY field (price, amount,
 * payment method, expiry, revision, owner, or logical id) invalidates
 * the signature, because that field is part of what got hashed and
 * signed — never stored as a cached "trusted" boolean; every call here
 * re-verifies from the raw `signature` field, exactly as COBRA
 * discipline requires.
 */
export function verifyOfferEnvelope(envelope: SignedOfferEnvelope): OfferEnvelopeVerdict {
  if (!Number.isInteger(envelope.revision) || envelope.revision < 0) {
    return { valid: false, reason: 'revision must be a non-negative integer' }
  }

  let signatureValid = false
  try {
    const digest = hashOfferEnvelope(envelope)
    signatureValid = nacl.sign.detached.verify(
      new Uint8Array(digest),
      new Uint8Array(Buffer.from(envelope.signature, 'hex')),
      new Uint8Array(Buffer.from(envelope.ownerPublicKey, 'hex'))
    )
  } catch {
    return { valid: false, reason: 'malformed signature or public key encoding' }
  }

  if (!signatureValid) {
    return { valid: false, reason: "signature does not verify against the envelope's own ownerPublicKey" }
  }

  return { valid: true }
}

/**
 * Whether an envelope is economically active *right now* — a separate
 * question from whether its signature verifies. A genuinely,
 * correctly-signed envelope can still be expired or cancelled; expiry
 * in particular must be checked against the caller's own clock every
 * time (ADR-001 §2/§3), never cached as a one-time verdict, since an
 * envelope that was active an hour ago may not be active now even
 * though nothing about it has changed.
 */
export function isOfferEnvelopeEconomicallyActive(
  envelope: Pick<SignedOfferEnvelope, 'status' | 'expiresAt'>,
  now: Date = new Date()
): boolean {
  if (envelope.status !== 'ACTIVE') return false
  return new Date(envelope.expiresAt).getTime() > now.getTime()
}
