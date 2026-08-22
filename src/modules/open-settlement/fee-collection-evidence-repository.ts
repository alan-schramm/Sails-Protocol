/**
 * FeeCollectionEvidenceRepository — Missão 11 Fase 2.2 economic accounting
 * foundation.
 *
 * Append-only, mirroring EscrowEvent's own discipline exactly (Fase 2.1 §8 /
 * Fase 2.2 §7): this interface exposes create() and reads only — there is
 * no update()/delete() method anywhere here, by design, not by omission. A
 * correction (RBF replacement, reorg, drop) is always recorded as a NEW row
 * referencing the same feeObligationId, never an edit to a prior one, so
 * the full forensic history of what was believed true at each point in time
 * is permanently preserved.
 *
 * No blockchain watcher, no polling, no external calls — this is pure
 * persistence of caller-supplied facts (Fase 2.2 §7's explicit scope).
 */
import { prisma } from '../../common/database'
import type { Prisma } from '@prisma/client'

type FeeCollectionEvidenceRow = NonNullable<Awaited<ReturnType<typeof prisma.feeCollectionEvidence.findFirst>>>

export type FeeCollectionEvidenceKind = 'BROADCAST' | 'CONFIRMED' | 'REPLACED' | 'DROPPED' | 'REORGED_OUT' | 'ALTERNATE_SPEND'

export interface RecordEvidenceInput {
  feeObligationId: string
  kind: FeeCollectionEvidenceKind
  txid?: string
  vout?: number
  scriptPubKey?: string
  amount?: Prisma.Decimal | string
  confirmedAtHeight?: number
  note?: string
}

export interface FeeCollectionEvidenceRepository {
  record(input: RecordEvidenceInput): Promise<FeeCollectionEvidenceRow>
  listForObligation(feeObligationId: string): Promise<FeeCollectionEvidenceRow[]>
}

class PrismaFeeCollectionEvidenceRepository implements FeeCollectionEvidenceRepository {
  async record(input: RecordEvidenceInput) {
    return prisma.feeCollectionEvidence.create({
      data: {
        feeObligationId: input.feeObligationId,
        kind: input.kind,
        txid: input.txid,
        vout: input.vout,
        scriptPubKey: input.scriptPubKey,
        amount: input.amount,
        confirmedAtHeight: input.confirmedAtHeight,
        note: input.note,
      },
    })
  }

  async listForObligation(feeObligationId: string) {
    return prisma.feeCollectionEvidence.findMany({
      where: { feeObligationId },
      orderBy: { recordedAt: 'asc' },
    })
  }
}

export const feeCollectionEvidenceRepository: FeeCollectionEvidenceRepository = new PrismaFeeCollectionEvidenceRepository()
