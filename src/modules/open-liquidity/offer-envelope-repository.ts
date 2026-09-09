/**
 * Sails OpenLiquidity — OfferEnvelope local persistence
 *
 * ADR-001 §3/§21(a) (docs/PORTABLE_SIGNED_OFFERS_EVIDENCE.md). Local,
 * non-authoritative storage of independently-verified OfferEnvelopes —
 * this table is a cache of facts this node has itself re-derived from
 * raw envelope bytes, never a source of trust on its own ("não
 * transformar o banco local em protocol truth"). `ingest()` always
 * re-verifies the signature before writing anything; nothing here ever
 * stores a "trusted: true" flag in place of the real signature.
 *
 * No propagation, bootstrap, or cross-node transport is implemented or
 * called here — this module only accepts an envelope already in hand
 * (however it arrived) and decides, locally, whether to keep it.
 */
import { prisma } from '../../common/database'
import {
  verifyOfferEnvelope,
  formatCanonicalDecimal,
  formatCanonicalTimestamp,
  type SignedOfferEnvelope,
  type OfferEnvelopeContent,
} from './offer-envelope'

export type IngestResult = { accepted: true; id: string } | { accepted: false; reason: string }

export class OfferEnvelopeRepository {
  /**
   * Verify, then apply the convergence rule (ADR-001 §5): the highest
   * verified `revision` for an **offer identity** wins. An envelope
   * whose revision does not strictly exceed the highest one already
   * stored for that identity is rejected outright — this is also the
   * replay-protection mechanism (ADR-001 §3), not a separate check.
   *
   * **CTO Gate correction (2026-09-09), Property H — offer identity is
   * (ownerPublicKey, logicalOfferId), not logicalOfferId alone.** An
   * earlier version of this fix (Property A, same date) tried to solve
   * a takeover attack by rejecting any envelope whose `ownerPublicKey`
   * didn't match whichever owner had *already been accepted* for a bare
   * `logicalOfferId` — "first accepted envelope wins." That is itself a
   * defect for a multi-operator network: **arrival order determined
   * economic ownership.** Reproduced directly: Node A ingesting
   * Alice-then-Mallory (both independently valid, self-signed revision-0
   * envelopes for the identical `logicalOfferId`) converged on Alice as
   * owner; Node B ingesting the identical two envelopes in the opposite
   * order (Mallory-then-Alice) converged on Mallory. Two nodes that saw
   * the exact same two valid facts, in a different order, disagreed
   * about who owned the object — a `logicalOfferId` is only ever
   * creator-local, so two different owners choosing the same string
   * were never actually making a competing claim over one object; they
   * were describing two distinct objects that this code incorrectly
   * treated as one.
   *
   * The fix: `highest` is looked up scoped to the pair
   * `(ownerPublicKey, logicalOfferId)`, matching the DB's own
   * `@@unique([ownerPublicKey, logicalOfferId, revision])` constraint
   * (`prisma/schema.prisma`). Alice/X and Mallory/X are now, by
   * construction, two entirely separate row-sets — there is no shared
   * "highest" for them to race over, no first-writer to privilege, and
   * therefore nothing left to check about "which owner got there
   * first." Owner continuity (Property A's original concern — a
   * *different* key superseding an *already-established* owner) falls
   * out of this identity model for free: every row this query can ever
   * return for a given `(ownerPublicKey, logicalOfferId)` already has
   * that exact `ownerPublicKey`, so there is no separate continuity
   * check left to write, and no first-seen trust flag anywhere in this
   * logic — the property emerges from the signed object identity
   * itself, not from a rule bolted on top of it.
   *
   * **Property I — `createdAt` immutability.** ADR-001 states
   * `createdAt` does not change across an offer's own revisions (it is
   * advisory-only for cross-node ordering, but it is still part of what
   * a single offer object *is* — an offer cannot retroactively change
   * when it was created). Enforced here: once a `highest` row exists for
   * this identity, a new revision must carry the identical `createdAt`
   * as that row: rejected, not silently normalized, if it does not.
   */
  async ingest(envelope: SignedOfferEnvelope): Promise<IngestResult> {
    const verdict = verifyOfferEnvelope(envelope)
    if (!verdict.valid) {
      return { accepted: false, reason: verdict.reason }
    }

    const highest = await prisma.offerEnvelope.findFirst({
      where: { ownerPublicKey: envelope.ownerPublicKey, logicalOfferId: envelope.logicalOfferId },
      orderBy: { revision: 'desc' },
    })

    if (highest && envelope.revision <= highest.revision) {
      return {
        accepted: false,
        reason: `revision ${envelope.revision} does not supersede already-stored revision ${highest.revision} for offer (${envelope.ownerPublicKey}, ${envelope.logicalOfferId})`,
      }
    }

    if (highest && envelope.createdAt !== formatCanonicalTimestamp(highest.createdAt)) {
      return {
        accepted: false,
        reason: `createdAt is immutable across revisions of the same offer identity: expected ${formatCanonicalTimestamp(highest.createdAt)}, got ${envelope.createdAt}`,
      }
    }

    const created = await prisma.offerEnvelope.create({
      data: {
        logicalOfferId: envelope.logicalOfferId,
        ownerPublicKey: envelope.ownerPublicKey,
        asset: envelope.asset,
        side: envelope.side,
        priceUsd: envelope.priceUsd,
        minAmount: envelope.minAmount,
        maxAmount: envelope.maxAmount,
        paymentMethod: envelope.paymentMethod,
        revision: envelope.revision,
        createdAt: new Date(envelope.createdAt),
        revisedAt: new Date(envelope.revisedAt),
        expiresAt: new Date(envelope.expiresAt),
        status: envelope.status,
        signature: envelope.signature,
      },
    })

    return { accepted: true, id: created.id }
  }

  /**
   * The current, highest-revision envelope this node has stored for a
   * given offer identity. Takes `ownerPublicKey` explicitly (not just
   * `logicalOfferId`) for the same reason `ingest()`'s own lookup does
   * (Property H) — `logicalOfferId` alone does not name a unique offer.
   */
  async getLatest(ownerPublicKey: string, logicalOfferId: string) {
    return prisma.offerEnvelope.findFirst({
      where: { ownerPublicKey, logicalOfferId },
      orderBy: { revision: 'desc' },
    })
  }

  /**
   * Property E — persistence round-trip. Reconstructs a `SignedOfferEnvelope`
   * from a stored row, re-deriving the exact canonical lexical form for
   * every amount/timestamp field rather than trusting Prisma's own
   * `.toString()` (which strips trailing zeros off a `Decimal` and would
   * silently break signed-byte identity — confirmed directly:
   * `new Prisma.Decimal('1.00000000').toString()` returns `"1"`, while
   * `.toFixed(8)` returns `"1.00000000"`). A row that was stored via
   * `ingest()` — which only ever stores an already-verified envelope —
   * must always reconstruct to bytes whose signature still verifies;
   * `tests/integration/offerEnvelopePersistenceRoundTrip.test.ts` checks
   * exactly this against a real database, not a mock.
   */
  reconstructSignedEnvelope(row: {
    logicalOfferId: string
    ownerPublicKey: string
    asset: OfferEnvelopeContent['asset']
    side: OfferEnvelopeContent['side']
    priceUsd: Parameters<typeof formatCanonicalDecimal>[0]
    minAmount: Parameters<typeof formatCanonicalDecimal>[0]
    maxAmount: Parameters<typeof formatCanonicalDecimal>[0]
    paymentMethod: OfferEnvelopeContent['paymentMethod']
    revision: number
    createdAt: Date
    revisedAt: Date
    expiresAt: Date
    status: OfferEnvelopeContent['status']
    signature: string
  }): SignedOfferEnvelope {
    return {
      logicalOfferId: row.logicalOfferId,
      ownerPublicKey: row.ownerPublicKey,
      asset: row.asset,
      side: row.side,
      priceUsd: formatCanonicalDecimal(row.priceUsd),
      minAmount: formatCanonicalDecimal(row.minAmount),
      maxAmount: formatCanonicalDecimal(row.maxAmount),
      paymentMethod: row.paymentMethod,
      revision: row.revision,
      createdAt: formatCanonicalTimestamp(row.createdAt),
      revisedAt: formatCanonicalTimestamp(row.revisedAt),
      expiresAt: formatCanonicalTimestamp(row.expiresAt),
      status: row.status,
      signature: row.signature,
    }
  }
}

export const offerEnvelopeRepository = new OfferEnvelopeRepository()
