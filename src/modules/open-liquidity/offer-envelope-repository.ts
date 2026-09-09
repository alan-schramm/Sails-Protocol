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
  isOfferEnvelopeEconomicallyActive,
  type SignedOfferEnvelope,
  type OfferEnvelopeContent,
} from './offer-envelope'

export type IngestResult =
  | { accepted: true; id: string; equivocationDetected?: true }
  | { accepted: false; reason: string }

/** Shape common to a Prisma `OfferEnvelope` row and this file's own in-memory test doubles. */
export interface OfferEnvelopeRow {
  id: string
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
}

/**
 * The result of asking "what is this offer identity's current state?"
 * (CTO Gate correction 2026-09-09, Property J.) Deliberately NOT just
 * "a row or null" — a single, unconditionally-winning "latest" row
 * cannot express owner equivocation without either (a) silently picking
 * an arbitrary winner (the exact defect this correction closes) or
 * (b) hiding that a conflict exists. `RESOLVED` is the normal case;
 * `EQUIVOCATED` means the owner produced two-or-more genuinely
 * different signed envelopes at the identical, currently-highest
 * revision for this identity — every conflicting row is returned, and
 * NONE of them should be treated as economically authoritative until a
 * later, unambiguous revision arrives (see `getLatest()` below).
 */
export type LatestOfferState =
  | { status: 'NOT_FOUND' }
  | { status: 'RESOLVED'; row: OfferEnvelopeRow }
  | { status: 'EQUIVOCATED'; revision: number; rows: OfferEnvelopeRow[] }

export class OfferEnvelopeRepository {
  /**
   * Verify, then apply the convergence rule (ADR-001 §5): the highest
   * verified `revision` for an **offer identity** `(ownerPublicKey,
   * logicalOfferId)` wins (Property H, CTO Gate correction 2026-09-09).
   * An envelope whose revision is strictly lower than the highest one
   * already stored for that identity is rejected outright — this is
   * also the replay-protection mechanism (ADR-001 §3), not a separate
   * check.
   *
   * **CTO Gate correction (2026-09-09), Property J — owner
   * equivocation.** The same owner can sign two genuinely different
   * envelopes at the identical `(ownerPublicKey, logicalOfferId,
   * revision)` — nothing in the crypto layer prevents an owner (buggy
   * or malicious) from doing this. Reproduced directly, before this
   * fix: given Alice's two independently-valid envelopes E1 (price A)
   * and E2 (price B), both at revision 5 for the same `logicalOfferId`,
   * a node ingesting E1-then-E2 ended up with price A as "the" offer;
   * a node ingesting E2-then-E1 ended up with price B. **Two nodes,
   * given the identical two facts, disagreed about the offer's actual
   * economic terms — purely because of arrival order.** The prior
   * behavior (treat "revision does not strictly exceed the highest
   * already stored" as a uniform rejection) was itself the bug: it
   * silently discarded whichever of the two equally-valid, conflicting
   * envelopes happened to arrive second, which is exactly
   * "arrival-order-determines-truth" restated for revisions instead of
   * for ownership (Property H's original defect, one layer up).
   *
   * The fix, deliberately fail-CLOSED rather than another
   * first-writer-wins race: an envelope whose revision exactly equals
   * the current highest is either (a) a byte-identical resend of an
   * already-stored fact (its `signature` matches exactly — idempotent,
   * a no-op, not stored again), or (b) genuinely different signed
   * content at that revision — equivocation. Case (b) is stored as a
   * SECOND row (the DB's own `@@unique([ownerPublicKey, logicalOfferId,
   * revision, signature])` constraint, `prisma/schema.prisma`,
   * deliberately includes `signature` so this is possible) — never
   * silently dropped, never used to overwrite the first. `getLatest()`
   * below is what surfaces this as `EQUIVOCATED`, order-independently:
   * regardless of whether E1 or E2 was stored first, once BOTH have
   * been ingested, both nodes' `getLatest()` returns the identical
   * `EQUIVOCATED` verdict naming both rows — this is the actual
   * convergence property: not "the same one wins everywhere," but "the
   * same TRUTH (including the fact of a conflict) is visible
   * everywhere once the same facts have arrived."
   *
   * **`createdAt` immutability — retracted (CTO Gate correction
   * 2026-09-09, Property K).** An earlier pass (Property I) rejected
   * any new revision whose `createdAt` didn't match the previously
   * -*observed* `highest` row's `createdAt`. Reproduced directly, this
   * was itself order-dependent and non-convergent: a node that happens
   * to observe revision 2 before ever seeing revision 0 has no
   * `createdAt` to compare against and accepts revision 2 unconditionally
   * — such a node would then *reject* a later-arriving, genuinely
   * legitimate revision 0 (or a further revision carrying the TRUE
   * original `createdAt`) purely because its own locally-first-observed
   * value differs from what a node that saw the facts in the true
   * historical order would have used as the baseline. Two nodes given
   * the same eventual set of facts converged on different accepted
   * histories — a second, independent instance of the exact defect this
   * whole correction pass exists to close. There is no order-independent
   * mechanism to enforce `createdAt` immutability using only a node's
   * own locally-first-observed reference point, and step (a) does not
   * replicate full history between nodes (that is a later, unauthorized
   * step). Rather than invent additional machinery (a global minimum,
   * a required full-history replay) to preserve a claim that isn't
   * load-bearing for any of the seven frozen ADR-001 §3 properties,
   * `createdAt` immutability is **retracted as an enforced protocol
   * rule** and narrowed to what it always structurally was: signed
   * (tamper-evident — no relay can alter it without invalidating the
   * signature) and advisory (never used for ordering, already true).
   * Property first, mechanism second: no correct order-independent
   * mechanism exists, so the property is narrowed, not forced.
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

    if (highest && envelope.revision < highest.revision) {
      return {
        accepted: false,
        reason: `revision ${envelope.revision} is stale — already-stored revision ${highest.revision} exists for offer (${envelope.ownerPublicKey}, ${envelope.logicalOfferId})`,
      }
    }

    if (highest && envelope.revision === highest.revision) {
      const rowsAtThisRevision = await prisma.offerEnvelope.findMany({
        where: {
          ownerPublicKey: envelope.ownerPublicKey,
          logicalOfferId: envelope.logicalOfferId,
          revision: envelope.revision,
        },
      })
      const identicalExisting = rowsAtThisRevision.find((row) => row.signature === envelope.signature)
      if (identicalExisting) {
        // Byte-identical resend of an already-known fact (e.g. a relay
        // retransmit) — idempotent, not stored again, not equivocation.
        return { accepted: true, id: identicalExisting.id }
      }

      // A different, genuinely valid signature at the identical
      // (ownerPublicKey, logicalOfferId, revision) — Ed25519 signing is
      // deterministic, so a different signature necessarily means
      // different signed content. Stored as durable equivocation
      // evidence; never silently discarded, never used to overwrite
      // what is already stored.
      const created = await prisma.offerEnvelope.create({ data: this.toRowData(envelope) })
      return { accepted: true, id: created.id, equivocationDetected: true }
    }

    // envelope.revision > highest.revision (or no highest exists at all).
    const created = await prisma.offerEnvelope.create({ data: this.toRowData(envelope) })
    return { accepted: true, id: created.id }
  }

  private toRowData(envelope: SignedOfferEnvelope) {
    return {
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
    }
  }

  /**
   * The current state of a given offer identity `(ownerPublicKey,
   * logicalOfferId)` — `Property H` (2026-09-09) explains why both
   * parameters are required (`logicalOfferId` alone does not name a
   * unique offer). As of `Property J` (2026-09-09), this can no longer
   * be a single row-or-null: if the owner equivocated at the current
   * highest revision, EVERY conflicting row is returned, tagged
   * `EQUIVOCATED` — a caller MUST treat that state as economically
   * inactive (fail-closed), never pick one of the rows arbitrarily.
   * This verdict is order-independent by construction: it is computed
   * fresh from whatever the identity's full stored history currently
   * contains, not from which fact happened to be ingested most
   * recently.
   */
  async getLatest(ownerPublicKey: string, logicalOfferId: string): Promise<LatestOfferState> {
    const highest = await prisma.offerEnvelope.findFirst({
      where: { ownerPublicKey, logicalOfferId },
      orderBy: { revision: 'desc' },
    })
    if (!highest) {
      return { status: 'NOT_FOUND' }
    }

    const rowsAtHighestRevision = await prisma.offerEnvelope.findMany({
      where: { ownerPublicKey, logicalOfferId, revision: highest.revision },
    })
    const distinctBySignature = new Map(rowsAtHighestRevision.map((row) => [row.signature, row]))

    if (distinctBySignature.size > 1) {
      return { status: 'EQUIVOCATED', revision: highest.revision, rows: [...distinctBySignature.values()] }
    }
    return { status: 'RESOLVED', row: [...distinctBySignature.values()][0] }
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

/**
 * Property J's fail-closed rule made concrete and testable: an
 * `EQUIVOCATED` or `NOT_FOUND` offer state is never economically
 * active, full stop — regardless of what `expiresAt` any of the
 * conflicting rows might individually claim. Only `RESOLVED` (a single,
 * unambiguous signed fact at the current highest revision) can ever be
 * active, and only if that one row also passes the ordinary
 * `isOfferEnvelopeEconomicallyActive()` check (Property, unchanged).
 * Step (a) has no HTTP route yet to call this from, but the property
 * itself — equivocation must never resolve to picking one of the
 * conflicting prices — needs to be an actual, testable function now,
 * not a claim left implicit.
 */
export function isOfferStateEconomicallyActive(state: LatestOfferState, now: Date = new Date()): boolean {
  if (state.status !== 'RESOLVED') {
    return false
  }
  return isOfferEnvelopeEconomicallyActive(
    { status: state.row.status, expiresAt: formatCanonicalTimestamp(state.row.expiresAt) },
    now
  )
}

export const offerEnvelopeRepository = new OfferEnvelopeRepository()
