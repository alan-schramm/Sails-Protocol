/**
 * DistributionPolicyService — Missão 11 Fase 6.3A economic accounting
 * foundation.
 *
 * STRUCTURAL FOUNDATION ONLY, same discipline as FeePolicyService's own
 * header: this service does not choose, and must never be read as
 * recommending, any real recipient set or weight split — every policy
 * created by this codebase's own tests is an explicitly-labeled fixture.
 * It does not activate any real distribution and does not select
 * production Node/Wallet percentages.
 *
 * Validation split, mirroring fee-policy.service.ts exactly:
 *   STRUCTURAL (this file):  each weightPct >= 0 (a real reason must exist
 *                            to permit exactly 0 — Missão 11 Fase 6.3A §E
 *                            requires "> 0 unless there is a strong schema
 *                            reason to permit zero"; no such reason has
 *                            been identified, so 0 is rejected too); the
 *                            recipient set's weights sum to EXACTLY 100
 *                            (Decimal equality, zero tolerance, no
 *                            normalization, no remainder added to another
 *                            recipient — Phase 6.2.1 §D6/E11's own rule);
 *                            at least one recipient must be present.
 *   GOVERNANCE (NOT this file, NOT this phase): WHICH classes are active,
 *                            and what weight each receives. A caller may
 *                            construct any structurally-valid policy;
 *                            choosing 100% SAILS_PROTOCOL vs. any other
 *                            split is a decision for whoever calls
 *                            createDraft()/addRecipient(), never this file.
 *
 * publish() is the ONLY place that performs structural validation — a
 * DRAFT's recipient rows may be freely added/removed right up until the
 * moment publish() is called, at which point they become permanently
 * locked in via the repository's narrow surface + the database's own
 * BEFORE INSERT/UPDATE/DELETE trigger.
 */
import { Prisma } from '@prisma/client'
import { ValidationError } from '../../common/errors'
import {
  distributionPolicyRepository,
  type DistributionPolicyRepository,
  type CreateDraftDistributionPolicyData,
} from './distribution-policy-repository'

const HUNDRED = new Prisma.Decimal(100)
const ZERO = new Prisma.Decimal(0)

export class DistributionPolicyService {
  constructor(private readonly repo: DistributionPolicyRepository = distributionPolicyRepository) {}

  async createDraft(input: CreateDraftDistributionPolicyData) {
    return this.repo.createDraft(input)
  }

  async addRecipient(policyVersionId: string, recipientId: string, weightPct: Prisma.Decimal | string) {
    return this.repo.addRecipient({ policyVersionId, recipientId, weightPct })
  }

  /**
   * Structural validation only (see this file's own header for the exact
   * boundary). Throws ValidationError, never silently normalizes or
   * corrects a caller-supplied weight set — a policy that fails validation
   * must be corrected (add/remove/edit DRAFT recipient rows) and
   * re-submitted, never "fixed up" on publish.
   */
  async publish(id: string) {
    const policy = await this.repo.findById(id)
    if (!policy) {
      throw new ValidationError(`DistributionPolicyVersion not found: ${id}`)
    }
    if (policy.status !== 'DRAFT') {
      throw new ValidationError(
        `DistributionPolicyVersion ${id} cannot be published from status ${policy.status} — only a DRAFT policy may be published.`
      )
    }
    if (policy.recipients.length === 0) {
      throw new ValidationError(`DistributionPolicyVersion ${id} has no recipients — cannot publish an empty policy (no implicit Treasury fallback).`)
    }

    let total = ZERO
    for (const recipient of policy.recipients) {
      const weight = new Prisma.Decimal(recipient.weightPct)
      if (weight.isNegative() || weight.isZero()) {
        throw new ValidationError(
          `DistributionPolicyVersion ${id}: recipient ${recipient.recipientId} has weightPct=${weight.toString()} — every recipient weight must be strictly greater than 0 (no schema reason has been identified to permit a zero-weight recipient; omit the recipient entirely instead).`,
          { recipientId: recipient.recipientId, weightPct: weight.toString() }
        )
      }
      total = total.plus(weight)
    }
    if (!total.equals(HUNDRED)) {
      throw new ValidationError(
        `DistributionPolicyVersion ${id}: recipient weights sum to ${total.toString()}, not exactly 100 — no tolerance, no silent normalization, no remainder added to any recipient.`,
        { total: total.toString() }
      )
    }

    return this.repo.publish(id)
  }

  async retire(id: string) {
    const policy = await this.repo.findById(id)
    if (!policy) {
      throw new ValidationError(`DistributionPolicyVersion not found: ${id}`)
    }
    if (policy.status !== 'PUBLISHED') {
      throw new ValidationError(
        `DistributionPolicyVersion ${id} cannot be retired from status ${policy.status} — only a PUBLISHED policy may be retired.`
      )
    }
    return this.repo.retire(id)
  }

  /** The one currently-live policy, or null if none is published — callers
   *  must treat null exactly like "no policy exists" (no implicit Treasury
   *  fallback, Missão 11 Fase 6.3A §D7/D8 — fail closed on allocation, never
   *  fabricate a default). */
  async findLivePolicy() {
    const [latest] = await this.repo.findPublished()
    return latest ?? null
  }
}

export const distributionPolicyService = new DistributionPolicyService()
