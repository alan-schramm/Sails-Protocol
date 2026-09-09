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
   * verified `revision` for a `logicalOfferId` wins. An envelope whose
   * revision does not strictly exceed the highest one already stored
   * is rejected outright — this is also the replay-protection
   * mechanism (ADR-001 §3), not a separate check.
   *
   * **CTO Gate correction (2026-09-09), Property A — owner continuity.**
   * `verifyOfferEnvelope()` only proves an envelope is self-consistent:
   * that its signature matches whichever `ownerPublicKey` it itself
   * claims. It has no notion of history, so on its own it cannot catch
   * an attacker who owns a real keypair, signs their own envelope
   * correctly, and simply claims someone else's already-established
   * `logicalOfferId` at a higher revision. Demonstrated directly against
   * this exact code path before this fix: given an already-accepted
   * revision 1 owned by key A, a distinct, validly self-signed revision
   * 2 owned by key B for the SAME `logicalOfferId` was accepted.
   *
   * Once a `logicalOfferId` has an accepted owner, every later revision
   * or tombstone for it MUST come from that same owner. A higher
   * revision number does not, by itself, grant authority — revision
   * precedence and ownership authority are two different questions,
   * checked here as two separate, sequential gates. There is no
   * ownership-rotation mechanism (deliberately out of scope for v1):
   * once established, `ownerPublicKey` is immutable for the lifetime of
   * a `logicalOfferId`. The very first accepted envelope for a given
   * `logicalOfferId` establishes its owner (first-writer-wins), exactly
   * like the very first commit in this repository establishing initial
   * authorship.
   */
  async ingest(envelope: SignedOfferEnvelope): Promise<IngestResult> {
    const verdict = verifyOfferEnvelope(envelope)
    if (!verdict.valid) {
      return { accepted: false, reason: verdict.reason }
    }

    const highest = await prisma.offerEnvelope.findFirst({
      where: { logicalOfferId: envelope.logicalOfferId },
      orderBy: { revision: 'desc' },
    })

    if (highest && envelope.ownerPublicKey !== highest.ownerPublicKey) {
      return {
        accepted: false,
        reason: `owner continuity violation: logicalOfferId ${envelope.logicalOfferId} is already owned by a different key; a higher revision does not grant authority to a new key`,
      }
    }

    if (highest && envelope.revision <= highest.revision) {
      return {
        accepted: false,
        reason: `revision ${envelope.revision} does not supersede already-stored revision ${highest.revision} for logicalOfferId ${envelope.logicalOfferId}`,
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

  /** The current, highest-revision envelope this node has stored for a logical offer. */
  async getLatest(logicalOfferId: string) {
    return prisma.offerEnvelope.findFirst({
      where: { logicalOfferId },
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
