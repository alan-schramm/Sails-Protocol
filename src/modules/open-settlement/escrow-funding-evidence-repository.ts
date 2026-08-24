/**
 * EscrowFundingEvidenceRepository — Missão 11 Fase 9.1 §1.
 *
 * The durable, append-only funding-side counterpart to
 * FeeCollectionEvidenceRepository (fee-collection-evidence-repository.ts),
 * closing the Phase 9.0 audit's own INV-07F finding: escrow FUNDING reorg
 * detection previously produced only a log line, with no queryable,
 * durable evidence trail.
 *
 * Append-only, mirroring FeeCollectionEvidenceRepository's own discipline
 * exactly: this interface exposes create() and reads only — there is no
 * update()/delete() method anywhere here, by design, not by omission. A
 * later observation (reorg, reconfirmation, replacement) is always a NEW
 * row referencing the same escrowId, never an edit to a prior one.
 */
import { prisma } from '../../common/database'
import type { Prisma, EscrowFundingEvidenceKind } from '@prisma/client'

type EscrowFundingEvidenceRow = NonNullable<Awaited<ReturnType<typeof prisma.escrowFundingEvidence.findFirst>>>

export interface RecordFundingEvidenceInput {
  escrowId: string
  kind: EscrowFundingEvidenceKind
  txid?: string
  vout?: number
  amountSats?: bigint
  observedAtHeight?: number
  tipHeightAtObservation?: number
  note?: string
}

export interface EscrowFundingEvidenceRepository {
  record(input: RecordFundingEvidenceInput, tx?: Prisma.TransactionClient): Promise<EscrowFundingEvidenceRow>
  listForEscrow(escrowId: string): Promise<EscrowFundingEvidenceRow[]>
}

class PrismaEscrowFundingEvidenceRepository implements EscrowFundingEvidenceRepository {
  async record(input: RecordFundingEvidenceInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma
    return client.escrowFundingEvidence.create({
      data: {
        escrowId: input.escrowId,
        kind: input.kind,
        txid: input.txid,
        vout: input.vout,
        amountSats: input.amountSats,
        observedAtHeight: input.observedAtHeight,
        tipHeightAtObservation: input.tipHeightAtObservation,
        note: input.note,
      },
    })
  }

  async listForEscrow(escrowId: string) {
    return prisma.escrowFundingEvidence.findMany({
      where: { escrowId },
      orderBy: { recordedAt: 'asc' },
    })
  }
}

export const escrowFundingEvidenceRepository: EscrowFundingEvidenceRepository = new PrismaEscrowFundingEvidenceRepository()
