/**
 * DistributionPolicyRepository — Missão 11 Fase 6.3A economic accounting
 * foundation.
 *
 * Mirrors FeePolicyVersionRepository's own narrow, one-named-method-per-
 * mutation discipline exactly (Fase 2.1 §1 / Fase 2.2 §2 decision): no
 * generic update() exists anywhere here. `createDraft()`/`addRecipient()`
 * only ever touch a DRAFT policy; `publish()`/`retire()` only ever touch
 * status + their own timestamp column. Economic content (which recipients,
 * what weight) lives on the CHILD DistributionPolicyRecipient rows, not
 * inline here — see that model's own schema comment for why.
 *
 * Two independent immutability layers, same pattern as FeePolicyVersion:
 * (1) this repository's own narrow surface — no method here can mutate a
 * recipient row once the parent is not DRAFT; (2) a real PostgreSQL
 * trigger (distribution_policy_recipients_immutability_guard, this
 * migration's own raw SQL) rejecting the same, independent of this
 * application entirely.
 *
 * DistributionPolicyVersion is protocol-level (no railScope) — Phase 6.2
 * D4's own decision: distribution percentages are not rail-specific
 * economics, unlike fee-collection mechanics.
 */
import { prisma } from '../../common/database'
import type { Prisma } from '@prisma/client'

type DistributionPolicyVersionRow = NonNullable<Awaited<ReturnType<typeof prisma.distributionPolicyVersion.findUnique>>>
type DistributionPolicyRecipientRow = NonNullable<Awaited<ReturnType<typeof prisma.distributionPolicyRecipient.findFirst>>>
type DistributionPolicyVersionWithRecipients = DistributionPolicyVersionRow & { recipients: DistributionPolicyRecipientRow[] }

export interface CreateDraftDistributionPolicyData {
  label: string
  createdBy: string
}

export interface AddDistributionPolicyRecipientData {
  policyVersionId: string
  recipientId: string
  weightPct: Prisma.Decimal | string
}

export interface DistributionPolicyRepository {
  /** Always writes status = DRAFT. */
  createDraft(input: CreateDraftDistributionPolicyData): Promise<DistributionPolicyVersionRow>

  /** DRAFT-only in practice — the DB trigger rejects this the moment the
   *  parent is not DRAFT; this method itself does not pre-check (matching
   *  FeePolicyVersionRepository's own "business logic stays in the
   *  service, persistence stays here" split). */
  addRecipient(input: AddDistributionPolicyRecipientData): Promise<DistributionPolicyRecipientRow>

  findById(id: string): Promise<DistributionPolicyVersionWithRecipients | null>

  /** The currently PUBLISHED version(s), most-recent first — callers
   *  needing "the one live policy" take index 0, mirroring
   *  FeePolicyVersionRepository.findPublishedForRail()'s own shape
   *  exactly (protocol-level here, no rail parameter). */
  findPublished(): Promise<DistributionPolicyVersionWithRecipients[]>

  /** DRAFT -> PUBLISHED. Touches status + publishedAt only. Caller
   *  (distribution-policy.service.ts) is responsible for the sum-to-100
   *  structural validation BEFORE calling this. */
  publish(id: string): Promise<DistributionPolicyVersionRow>

  /** PUBLISHED -> RETIRED. Touches status + retiredAt only. */
  retire(id: string): Promise<DistributionPolicyVersionRow>
}

class PrismaDistributionPolicyRepository implements DistributionPolicyRepository {
  async createDraft(input: CreateDraftDistributionPolicyData) {
    return prisma.distributionPolicyVersion.create({
      data: { label: input.label, status: 'DRAFT', createdBy: input.createdBy },
    })
  }

  async addRecipient(input: AddDistributionPolicyRecipientData) {
    return prisma.distributionPolicyRecipient.create({
      data: {
        policyVersionId: input.policyVersionId,
        recipientId: input.recipientId,
        weightPct: input.weightPct,
      },
    })
  }

  async findById(id: string) {
    return prisma.distributionPolicyVersion.findUnique({
      where: { id },
      include: { recipients: true },
    })
  }

  async findPublished() {
    return prisma.distributionPolicyVersion.findMany({
      where: { status: 'PUBLISHED' },
      include: { recipients: true },
      orderBy: { publishedAt: 'desc' },
    })
  }

  async publish(id: string) {
    return prisma.distributionPolicyVersion.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    })
  }

  async retire(id: string) {
    return prisma.distributionPolicyVersion.update({
      where: { id },
      data: { status: 'RETIRED', retiredAt: new Date() },
    })
  }
}

export const distributionPolicyRepository: DistributionPolicyRepository = new PrismaDistributionPolicyRepository()
