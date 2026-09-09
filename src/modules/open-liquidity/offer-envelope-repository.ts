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
import { verifyOfferEnvelope, type SignedOfferEnvelope } from './offer-envelope'

export type IngestResult = { accepted: true; id: string } | { accepted: false; reason: string }

export class OfferEnvelopeRepository {
  /**
   * Verify, then apply the convergence rule (ADR-001 §5): the highest
   * verified `revision` for a `logicalOfferId` wins. An envelope whose
   * revision does not strictly exceed the highest one already stored
   * is rejected outright — this is also the replay-protection
   * mechanism (ADR-001 §3), not a separate check.
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
}

export const offerEnvelopeRepository = new OfferEnvelopeRepository()
