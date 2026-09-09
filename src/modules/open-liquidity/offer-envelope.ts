/**
 * Sails OpenLiquidity — Portable Signed Offers
 *
 * ADR-001 Day-0 Multi-Operator Sails Network (docs/adr/ADR-001-day0-multi-operator-network.md
 * §3), Implementation Sequence step (a). Full evidence:
 * docs/PORTABLE_SIGNED_OFFERS_EVIDENCE.md (includes a 2026-09-09 CTO
 * Gate correction section — read it before extending this file).
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
 *
 * **CTO Gate correction (2026-09-09).** This file now performs strict
 * shape validation on every field *before* any cryptographic check —
 * a malformed field is rejected deterministically, never reaches
 * Prisma, and never causes an uncontrolled persistence exception
 * (Property G). Every signed field has exactly one accepted canonical
 * lexical form (Properties B/C/D) — non-canonical input is REJECTED,
 * never silently renormalized after the fact, so the bytes that get
 * signed are always the bytes a verifier reconstructs. Owner
 * continuity (Property A) is enforced one layer up, in
 * `offer-envelope-repository.ts`'s `ingest()` — this module has no
 * notion of "history," only of "is this one envelope internally
 * well-formed and validly signed."
 */
import nacl from 'tweetnacl'
import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import type { AssetType, TradeSide, PaymentMethod, OfferEnvelopeStatus } from '@prisma/client'

/**
 * Domain-separation tag, the first field of every canonical
 * serialization. Prevents a signature produced for one message class
 * (a different protocol, or a future v2 of this same envelope shape)
 * from ever being replayed as a valid OfferEnvelope signature.
 */
export const OFFER_ENVELOPE_DOMAIN_TAG = 'sails-offer-envelope-v1'

/**
 * ASCII Unit Separator (0x1F). Property B correction (2026-09-09): the
 * original implementation claimed, only in a comment, that this
 * character "never appears" in any field — never actually validated.
 * Demonstrated directly (not assumed) that this was false: two
 * distinct field tuples, one with `\x1f` embedded inside
 * `logicalOfferId` and the corresponding bytes shifted into the next
 * field, produced byte-identical canonical output — the join is not
 * injective over an unvalidated input domain. `validateOfferEnvelopeFields()`
 * below now rejects `FIELD_SEPARATOR` (and all other control
 * characters) in every free-form string field, closing this — the
 * separator's absence is now an enforced invariant, not a comment.
 */
const FIELD_SEPARATOR = '\x1f'

/** Ed25519 public key / signature hex-encoding, matching `User.publicKey`'s own existing format elsewhere in this schema. */
const HEX_64_BYTES = /^[0-9a-f]{64}$/ // 32-byte Ed25519 public key
const HEX_128_BYTES = /^[0-9a-f]{128}$/ // 64-byte Ed25519 signature

/**
 * Property C: exactly one accepted lexical form for a decimal amount —
 * matching `@db.Decimal(24, 8)`'s own declared scale (8 fractional
 * digits) and precision (24 total significant digits, so at most 16
 * integer digits). Digits only, no sign, no exponent, no whitespace,
 * exactly 8 fractional digits (never "1" or "1.0" — always
 * "1.00000000"), strictly greater than zero (no negative or zero
 * economic amounts). Non-canonical input is REJECTED, never
 * renormalized — the bytes a signer signs are always exactly the bytes
 * a verifier reconstructs.
 */
const CANONICAL_DECIMAL = /^(0|[1-9]\d{0,15})\.\d{8}$/

/**
 * Property D: exactly one accepted lexical form for a signed
 * timestamp — `Date.prototype.toISOString()`'s own exact output shape,
 * always UTC (`Z`), always millisecond-padded. A timezone-offset
 * representation of the identical instant (e.g. `...+00:00`) is a
 * different byte string and is REJECTED, not accepted as equivalent —
 * exactly one canonical representation per instant.
 */
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** Property F: Postgres `INTEGER` (INT4) range — the same storage this field lands in (`revision Int`, `prisma/schema.prisma`). */
const MAX_REVISION = 2147483647 // 2^31 - 1

/**
 * The signed content of an OfferEnvelope — every field a verifier
 * needs to recompute the canonical bytes and check the signature.
 * Amounts and timestamps are strings in their one canonical lexical
 * form (see `CANONICAL_DECIMAL`/`CANONICAL_TIMESTAMP` above) — never
 * floats, never Date objects, precisely so "the bytes that were
 * signed" and "the bytes a verifier reconstructs" can never silently
 * diverge through an intermediate numeric/date representation.
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
  revision: number
  createdAt: string
  revisedAt: string
  expiresAt: string
  status: OfferEnvelopeStatus
}

export interface SignedOfferEnvelope extends OfferEnvelopeContent {
  /** Ed25519 signature, hex-encoded, over `hashOfferEnvelope(content)`. */
  signature: string
}

const VALID_ASSETS: readonly AssetType[] = [
  'BTC', 'USDT_ERC20', 'USDT_TRC20', 'USDT_LIQUID', 'USDT_LIGHTNING',
  'LN_BTC', 'LIQUID_BTC', 'SPARK', 'STACKS', 'RSK_BTC',
]
const VALID_SIDES: readonly TradeSide[] = ['BUY', 'SELL']
const VALID_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'PIX', 'TED', 'BANK_TRANSFER', 'CRYPTO_DIRECT', 'LIGHTNING_DIRECT', 'CASH', 'OTHER',
]
const VALID_STATUSES: readonly OfferEnvelopeStatus[] = ['ACTIVE', 'CANCELLED']

/** No control characters (0x00-0x1F, 0x7F) anywhere — `FIELD_SEPARATOR` is one of these, but every control character is excluded on principle, not just the one this implementation happens to use as a delimiter today. */
// eslint-disable-next-line no-control-regex
const CONTAINS_CONTROL_CHAR = /[\x00-\x1f\x7f]/

export type ShapeVerdict = { valid: true } | { valid: false; reason: string }

/**
 * Property G: shape validation, run *before* any cryptographic check
 * or database access. Distinguishes "malformed envelope" from
 * "invalid signature" as two genuinely different rejection classes
 * (`verifyOfferEnvelope()` below calls this first and returns its
 * reason directly, unchanged, if it fails) — no malformed field ever
 * reaches Prisma to cause an uncontrolled persistence exception; it is
 * rejected here, deterministically, with a specific, named reason.
 */
export function validateOfferEnvelopeFields(envelope: Partial<SignedOfferEnvelope>): ShapeVerdict {
  if (typeof envelope.logicalOfferId !== 'string' || envelope.logicalOfferId.length < 1 || envelope.logicalOfferId.length > 200) {
    return { valid: false, reason: 'logicalOfferId must be a string of 1-200 characters' }
  }
  if (CONTAINS_CONTROL_CHAR.test(envelope.logicalOfferId)) {
    return { valid: false, reason: 'logicalOfferId must not contain control characters (including the canonical field separator)' }
  }
  if (typeof envelope.ownerPublicKey !== 'string' || !HEX_64_BYTES.test(envelope.ownerPublicKey)) {
    return { valid: false, reason: 'ownerPublicKey must be exactly 64 lowercase hex characters (a 32-byte Ed25519 public key)' }
  }
  if (typeof envelope.asset !== 'string' || !VALID_ASSETS.includes(envelope.asset as AssetType)) {
    return { valid: false, reason: `asset must be one of: ${VALID_ASSETS.join(', ')}` }
  }
  if (typeof envelope.side !== 'string' || !VALID_SIDES.includes(envelope.side as TradeSide)) {
    return { valid: false, reason: `side must be one of: ${VALID_SIDES.join(', ')}` }
  }
  if (typeof envelope.paymentMethod !== 'string' || !VALID_PAYMENT_METHODS.includes(envelope.paymentMethod as PaymentMethod)) {
    return { valid: false, reason: `paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` }
  }
  if (typeof envelope.status !== 'string' || !VALID_STATUSES.includes(envelope.status as OfferEnvelopeStatus)) {
    return { valid: false, reason: `status must be one of: ${VALID_STATUSES.join(', ')}` }
  }
  for (const [name, value] of [
    ['priceUsd', envelope.priceUsd],
    ['minAmount', envelope.minAmount],
    ['maxAmount', envelope.maxAmount],
  ] as const) {
    if (typeof value !== 'string' || !CANONICAL_DECIMAL.test(value) || /^0\.0{8}$/.test(value)) {
      return {
        valid: false,
        reason: `${name} must be a canonical positive decimal string with exactly 8 fractional digits, no sign, no exponent, no whitespace, and strictly greater than zero (e.g. "1.00000000") — got ${JSON.stringify(value)}`,
      }
    }
  }
  for (const [name, value] of [
    ['createdAt', envelope.createdAt],
    ['revisedAt', envelope.revisedAt],
    ['expiresAt', envelope.expiresAt],
  ] as const) {
    if (typeof value !== 'string' || !CANONICAL_TIMESTAMP.test(value)) {
      return {
        valid: false,
        reason: `${name} must be a canonical UTC ISO-8601 timestamp with millisecond precision (e.g. "2026-09-09T00:00:00.000Z") — got ${JSON.stringify(value)}`,
      }
    }
    // Reject shapes that match the regex but are not real calendar
    // dates (e.g. "2026-13-45T00:00:00.000Z") by round-tripping
    // through Date and requiring an exact match against the original
    // string — a real date's own toISOString() is always this exact
    // canonical form, so any mismatch means the input wasn't real.
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
      return { valid: false, reason: `${name} is not a real, canonically-formatted UTC instant: ${JSON.stringify(value)}` }
    }
  }
  if (
    typeof envelope.revision !== 'number' ||
    !Number.isInteger(envelope.revision) ||
    envelope.revision < 0 ||
    envelope.revision > MAX_REVISION
  ) {
    return { valid: false, reason: `revision must be an integer between 0 and ${MAX_REVISION} inclusive` }
  }
  if (typeof envelope.signature !== 'string' || !HEX_128_BYTES.test(envelope.signature)) {
    return { valid: false, reason: 'signature must be exactly 128 lowercase hex characters (a 64-byte Ed25519 signature)' }
  }
  return { valid: true }
}

/**
 * Property C's canonical formatter — the one place a `Prisma.Decimal`
 * (or a plain numeric string) is turned into the exact signed lexical
 * form. Used both to validate a caller-supplied amount (indirectly, via
 * the regex above) and, critically, to reconstruct a canonical amount
 * string from a value read back out of Postgres — `Prisma.Decimal`'s
 * own `.toString()` strips trailing zeros ("1" instead of
 * "1.00000000"), which would silently break signed-byte round-trip
 * identity (Property E) if used directly. Always emits exactly 8
 * fractional digits, matching `CANONICAL_DECIMAL` above.
 */
export function formatCanonicalDecimal(value: Prisma.Decimal | string | number): string {
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
  return decimal.toFixed(8)
}

/**
 * Property D's canonical formatter for the DB round-trip case —
 * `Date.prototype.toISOString()` already always produces exactly
 * `CANONICAL_TIMESTAMP`'s own shape, so this is a thin, explicit
 * wrapper naming that guarantee at the call site rather than relying
 * on every caller remembering it independently.
 */
export function formatCanonicalTimestamp(value: Date): string {
  return value.toISOString()
}

/**
 * ADR-001 §3's canonical serialization — fixed field order, fixed
 * separator, no ambiguity *given validated input* (see
 * `validateOfferEnvelopeFields()` above, which every call site in this
 * module runs first). Two conformant implementations given the same,
 * already-validated `OfferEnvelopeContent` MUST produce byte-identical
 * output here; `tests/offerEnvelope.test.ts` carries a hardcoded,
 * deterministic test vector proving this.
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
 * `EvidenceReference.signature` — reused here for the identical
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
 * below). Does not itself validate field shape — a real client is
 * expected to construct already-canonical fields; `verifyOfferEnvelope()`
 * is the actual trust boundary, and always validates.
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
 *
 * **CTO Gate correction (2026-09-09), Property G:** shape validation
 * now runs first — a malformed envelope is rejected with a specific
 * reason distinct from "signature does not verify," and never reaches
 * the cryptographic check or any database call.
 *
 * **Note on scope (Property A):** this function checks only that the
 * envelope is internally well-formed and validly signed by whichever
 * key it itself claims as `ownerPublicKey`. It has no notion of
 * *prior* history — whether that claimed owner is the *same* owner
 * already accepted for this `logicalOfferId` is a continuity question
 * checked one layer up, by `OfferEnvelopeRepository.ingest()`, not
 * here. A malicious actor's own envelope, self-signed by their own
 * key, passes this function's checks every time — that is expected and
 * correct; it is `ingest()`'s job to then reject it for lacking
 * continuity with the accepted owner.
 */
export function verifyOfferEnvelope(envelope: SignedOfferEnvelope): OfferEnvelopeVerdict {
  const shapeVerdict = validateOfferEnvelopeFields(envelope)
  if (!shapeVerdict.valid) {
    return shapeVerdict
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
