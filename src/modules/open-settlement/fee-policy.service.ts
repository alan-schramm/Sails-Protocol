/**
 * FeePolicyService — Missão 11 Fase 2.2 economic accounting foundation.
 *
 * STRUCTURAL FOUNDATION ONLY. This service does not choose, and must never
 * be read as recommending, any real economic parameter — every rate,
 * ceiling, and bucket split passed to createDraft()/publish() in this
 * codebase's own tests is an explicitly-labeled fixture. It does not wire
 * into any real settlement flow, does not activate fee collection, and does
 * not change PROTOCOL_FEE_RATE/chargeProtocolFee() (RFC-021 Phase 0,
 * escrow-lifecycle.ts), which remain the only LIVE fee mechanism until a
 * future, separately-authorized phase.
 *
 * Validation split (Fase 2.1 §4 / Fase 2.2 §4), enforced here:
 *   STRUCTURAL (this file):    rate >= 0; each bucket percentage >= 0; the
 *                              four percentages sum to exactly 100; a
 *                              FeeObligation may only ever snapshot a
 *                              PUBLISHED policy, never a DRAFT one.
 *   GOVERNANCE (NOT this file, NOT this phase): the actual rate value, any
 *                              commercial rate ceiling, the actual bucket
 *                              split values, small-trade threshold numbers,
 *                              confirmation-depth N. None of these are
 *                              chosen or bounded here — a caller may pass
 *                              any structurally-valid value.
 *
 * publish() is the ONLY place that performs structural validation — a
 * DRAFT's economic fields can be anything (including nonsensical values)
 * right up until the moment publish() is called, at which point it becomes
 * permanently locked in via the repository's narrow surface + the
 * database's own BEFORE UPDATE trigger (see fee-policy-repository.ts's own
 * header and the migration file).
 */
import { Prisma } from '@prisma/client'
import { ValidationError } from '../../common/errors'
import {
  feePolicyVersionRepository,
  type FeePolicyVersionRepository,
  type CreateDraftFeePolicyVersionData,
} from './fee-policy-repository'
import { assertRailCanActivateFeeCollection } from './escrow-providers'

const HUNDRED = new Prisma.Decimal(100)
const ZERO = new Prisma.Decimal(0)

export class FeePolicyService {
  constructor(private readonly repo: FeePolicyVersionRepository = feePolicyVersionRepository) {}

  async createDraft(input: CreateDraftFeePolicyVersionData) {
    return this.repo.create(input)
  }

  /**
   * Structural validation only (see this file's own header for the exact
   * boundary). Throws ValidationError, never silently clamps or rounds a
   * caller-supplied value — a policy that fails validation must be
   * corrected and re-submitted as a new/edited DRAFT, never "fixed up" on
   * publish.
   */
  async publish(id: string) {
    const policy = await this.repo.findById(id)
    if (!policy) {
      throw new ValidationError(`FeePolicyVersion not found: ${id}`)
    }
    if (policy.status !== 'DRAFT') {
      throw new ValidationError(
        `FeePolicyVersion ${id} cannot be published from status ${policy.status} — only a DRAFT policy may be published.`
      )
    }

    const rate = new Prisma.Decimal(policy.protocolFeeRate)
    if (rate.isNegative()) {
      throw new ValidationError('protocolFeeRate must be >= 0', { protocolFeeRate: rate.toString() })
    }

    const shares = {
      nodeOperatorPct: new Prisma.Decimal(policy.nodeOperatorPct),
      treasuryPct: new Prisma.Decimal(policy.treasuryPct),
      walletRebatePct: new Prisma.Decimal(policy.walletRebatePct),
      arbitratorReservePct: new Prisma.Decimal(policy.arbitratorReservePct),
    }
    for (const [name, value] of Object.entries(shares)) {
      if (value.isNegative()) {
        throw new ValidationError(`${name} must be >= 0`, { [name]: value.toString() })
      }
    }

    const total = shares.nodeOperatorPct
      .plus(shares.treasuryPct)
      .plus(shares.walletRebatePct)
      .plus(shares.arbitratorReservePct)
    if (!total.equals(HUNDRED)) {
      throw new ValidationError(
        'nodeOperatorPct + treasuryPct + walletRebatePct + arbitratorReservePct must sum to exactly 100',
        { total: total.toString() }
      )
    }

    // Missão 11 Fase 5 §3 — structural validation only, same discipline as
    // the percentage-sum check above: a real confirmation depth is never
    // chosen here, but publish() refuses to activate a policy with no
    // depth (or a non-positive one) set at all. Fixture values (1, 2) are
    // exactly what this codebase's own tests use — this only rejects the
    // absence of a real decision, never picks one.
    if (policy.requiredConfirmations === null || policy.requiredConfirmations === undefined || policy.requiredConfirmations <= 0) {
      throw new ValidationError(
        'requiredConfirmations must be a positive integer before a policy can be published — the collection-recognition job has no confirmation-depth rule to apply otherwise',
        { requiredConfirmations: String(policy.requiredConfirmations) }
      )
    }

    // Missão 11 Fase 5 §10 — the real activation gate (Fase 4.2 Activation
    // Blocker B): a rail with no real, atomic fee-aware construction must
    // never have a policy go live, regardless of how structurally valid
    // its rate/bucket-split/confirmation-depth fields are.
    assertRailCanActivateFeeCollection(policy.railScope)

    return this.repo.publish(id)
  }

  async retire(id: string) {
    const policy = await this.repo.findById(id)
    if (!policy) {
      throw new ValidationError(`FeePolicyVersion not found: ${id}`)
    }
    if (policy.status !== 'PUBLISHED') {
      throw new ValidationError(
        `FeePolicyVersion ${id} cannot be retired from status ${policy.status} — only a PUBLISHED policy may be retired.`
      )
    }
    return this.repo.retire(id)
  }

  /** The one currently-live policy for a rail, or null if none is
   *  published — callers must treat null exactly like "no policy exists"
   *  (Fase 2.2 §5: no hidden default policy, ever). */
  async findLivePolicyForRail(railScope: string) {
    const [latest] = await this.repo.findPublishedForRail(railScope)
    return latest ?? null
  }

  /** Structural guard used by escrow-fee-snapshot.service.ts (Fase 2.2 §4's
   *  "a FeeObligation/snapshot may only reference a PUBLISHED policy, never
   *  a DRAFT one" rule) — throws rather than silently refusing, since a
   *  caller reaching this with a non-PUBLISHED id is a programming error,
   *  not a normal/expected runtime condition (unlike findLivePolicyForRail's
   *  null-is-expected contract above). */
  async assertPublished(id: string) {
    const policy = await this.repo.findById(id)
    if (!policy || policy.status !== 'PUBLISHED') {
      throw new ValidationError(`FeePolicyVersion ${id} is not PUBLISHED — cannot be snapshotted.`)
    }
    return policy
  }
}

export const feePolicyService = new FeePolicyService()
