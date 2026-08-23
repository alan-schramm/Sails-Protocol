/**
 * DistributionRecipientRepository — Missão 11 Fase 6.3A economic
 * accounting foundation.
 *
 * A stable, permanent economic IDENTITY (WHO owns entitlement) —
 * deliberately holds no payout address (Phase 6.2 §8's proof: recipient
 * identity and payout destination are separate concepts). `class` is a
 * free string, same precedent as FeePolicyVersion.railScope — 'SAILS_PROTOCOL'
 * is the only class this pass ever creates a real row for; 'NODE'/'WALLET'/
 * 'ARBITER' require zero schema change to add later (Phase 6.1 §7/§8: no
 * Sybil-resistant proof-of-contribution mechanism exists yet for either).
 *
 * `identityKey` is null for a singleton class (SAILS_PROTOCOL) and would be
 * a stable external identity string for a future multi-instance class — the
 * migration's own hand-written partial unique index
 * (distribution_recipients_singleton_class_key) enforces "at most one
 * NULL-identityKey row per class" at the database level, not just here.
 */
import { prisma } from '../../common/database'

type DistributionRecipientRow = NonNullable<Awaited<ReturnType<typeof prisma.distributionRecipient.findUnique>>>

export interface CreateDistributionRecipientData {
  class: string
  identityKey?: string | null
  label: string
}

export interface DistributionRecipientRepository {
  create(input: CreateDistributionRecipientData): Promise<DistributionRecipientRow>
  findById(id: string): Promise<DistributionRecipientRow | null>
  /** The one singleton identity for a class (identityKey IS NULL) — the
   *  intended lookup for SAILS_PROTOCOL. Returns null if none exists yet;
   *  callers must never fabricate one (Phase 6.2 §8's "no implicit identity"
   *  discipline, mirroring "no implicit Treasury fallback" at the policy layer). */
  findSingletonByClass(recipientClass: string): Promise<DistributionRecipientRow | null>
}

class PrismaDistributionRecipientRepository implements DistributionRecipientRepository {
  async create(input: CreateDistributionRecipientData) {
    return prisma.distributionRecipient.create({
      data: {
        class: input.class,
        identityKey: input.identityKey ?? null,
        label: input.label,
      },
    })
  }

  async findById(id: string) {
    return prisma.distributionRecipient.findUnique({ where: { id } })
  }

  async findSingletonByClass(recipientClass: string) {
    return prisma.distributionRecipient.findFirst({
      where: { class: recipientClass, identityKey: null },
    })
  }
}

export const distributionRecipientRepository: DistributionRecipientRepository = new PrismaDistributionRecipientRepository()
