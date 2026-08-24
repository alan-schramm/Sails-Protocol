/**
 * CustodyAttestationRepository — Missão 11 Fase 7.3.2 §3 (CTO-approved
 * design: Option 2, append-only custody attestation).
 *
 * Records an ATTESTED ASSOCIATION between a DistributionRecipient (an
 * economic identity — "who is owed") and a rail-specific custody
 * descriptor (where that recipient's collected funds are operationally
 * understood to be held). This is deliberately NOT cryptographic proof of
 * control — see CustodyAttestationAuthority's own doc comment in
 * schema.prisma. This repository never moves funds, never activates
 * distribution, never generates a key/address, and never implements a
 * payout/claim path.
 *
 * "Rotation" (recording a NEW custody descriptor for a recipient+asset
 * that already has one) is implemented as: within one transaction,
 * supersede the currently-active row (set its supersededAt, the ONLY
 * mutation the DB trigger permits), then insert the new one. The real
 * Postgres partial unique index (custody_attestations_single_active_per_recipient_asset_key,
 * this model's own migration) makes "at most one active row per
 * (recipientId, asset)" a database-enforced fact, not just an assumption
 * this method makes — if two callers race, the loser's insert fails the
 * unique constraint and the whole transaction rolls back cleanly.
 */
import { prisma } from '../../common/database'
import type { Prisma, CustodyAttestationAuthority } from '@prisma/client'

type CustodyAttestationRow = NonNullable<Awaited<ReturnType<typeof prisma.custodyAttestation.findUnique>>>

export interface CreateCustodyAttestationData {
  recipientId: string
  asset: string
  descriptor: Prisma.InputJsonValue
  attestedBy: string
  // Defaults to BOOTSTRAP_OPERATOR_ATTESTED (the only kind this codebase
  // actually produces today) — never chosen automatically to mean
  // CRYPTOGRAPHIC_PROOF; a caller must explicitly assert that stronger
  // claim if a real mechanism for it is ever built.
  attestationAuthority?: CustodyAttestationAuthority
}

export interface CustodyAttestationRepository {
  /** Supersedes any currently-active attestation for the same
   *  (recipientId, asset) and inserts the new one, atomically. */
  create(input: CreateCustodyAttestationData): Promise<CustodyAttestationRow>

  /** The single ACTIVE (supersededAt IS NULL) attestation for a
   *  recipient+asset, or null if none has ever been recorded. */
  findActive(recipientId: string, asset: string): Promise<CustodyAttestationRow | null>

  /** Deterministic historical lookup: whichever attestation was active
   *  AT the given instant (attestedAt <= at AND (supersededAt IS NULL OR
   *  supersededAt > at)) — never "whatever happens to be active now." */
  findActiveAt(recipientId: string, asset: string, at: Date): Promise<CustodyAttestationRow | null>

  /** Full history for a recipient+asset, most recent first — the real,
   *  auditable "what did we ever attest" trail. */
  listHistory(recipientId: string, asset: string): Promise<CustodyAttestationRow[]>
}

class PrismaCustodyAttestationRepository implements CustodyAttestationRepository {
  async create(input: CreateCustodyAttestationData) {
    return prisma.$transaction(async (tx) => {
      await tx.custodyAttestation.updateMany({
        where: { recipientId: input.recipientId, asset: input.asset, supersededAt: null },
        data: { supersededAt: new Date() },
      })
      return tx.custodyAttestation.create({
        data: {
          recipientId: input.recipientId,
          asset: input.asset,
          descriptor: input.descriptor,
          attestedBy: input.attestedBy,
          attestationAuthority: input.attestationAuthority ?? 'BOOTSTRAP_OPERATOR_ATTESTED',
        },
      })
    })
  }

  async findActive(recipientId: string, asset: string) {
    return prisma.custodyAttestation.findFirst({ where: { recipientId, asset, supersededAt: null } })
  }

  async findActiveAt(recipientId: string, asset: string, at: Date) {
    return prisma.custodyAttestation.findFirst({
      where: {
        recipientId,
        asset,
        attestedAt: { lte: at },
        OR: [{ supersededAt: null }, { supersededAt: { gt: at } }],
      },
      orderBy: { attestedAt: 'desc' },
    })
  }

  async listHistory(recipientId: string, asset: string) {
    return prisma.custodyAttestation.findMany({
      where: { recipientId, asset },
      orderBy: { attestedAt: 'desc' },
    })
  }
}

export const custodyAttestationRepository: CustodyAttestationRepository = new PrismaCustodyAttestationRepository()
