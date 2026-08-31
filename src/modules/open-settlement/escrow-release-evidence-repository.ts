/**
 * EscrowReleaseEvidenceRepository — Sails Core Implementation Program
 * M9-F (Release-Leg Finality & Reorg Closure).
 *
 * The durable, append-only release-side counterpart of
 * EscrowFundingEvidenceRepository (escrow-funding-evidence-repository.ts),
 * closing the M9-R report's own disclosed C18 gap: the main MULTISIG
 * release/refund/split payout (Escrow.txReleaseId) had zero reorg
 * monitoring at all — only its FEE sub-output did
 * (FeeCollectionEvidence/multisig-fee-reorg-sweep.ts), which never
 * covers a REFUND (no fee output exists) or a fee-waived RELEASE/SPLIT.
 *
 * Append-only by design, identical discipline to
 * EscrowFundingEvidenceRepository: this interface exposes create() and
 * reads only. A later observation (reorg, reconfirmation) is always a
 * NEW row, never an edit to a prior one — the historical fact "T was
 * observed confirmed at height H" is never erased merely because a later
 * sweep found it gone.
 */
import { prisma } from '../../common/database'
import type { Prisma, EscrowFundingEvidenceKind } from '@prisma/client'

type EscrowReleaseEvidenceRow = NonNullable<Awaited<ReturnType<typeof prisma.escrowReleaseEvidence.findFirst>>>

export interface RecordReleaseEvidenceInput {
  escrowId: string
  kind: EscrowFundingEvidenceKind
  txid?: string
  observedAtHeight?: number
  tipHeightAtObservation?: number
  note?: string
}

export interface EscrowReleaseEvidenceRepository {
  record(input: RecordReleaseEvidenceInput, tx?: Prisma.TransactionClient): Promise<EscrowReleaseEvidenceRow>
  listForEscrow(escrowId: string, tx?: Prisma.TransactionClient): Promise<EscrowReleaseEvidenceRow[]>
}

class PrismaEscrowReleaseEvidenceRepository implements EscrowReleaseEvidenceRepository {
  async record(input: RecordReleaseEvidenceInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma
    return client.escrowReleaseEvidence.create({
      data: {
        escrowId: input.escrowId,
        kind: input.kind,
        txid: input.txid,
        observedAtHeight: input.observedAtHeight,
        tipHeightAtObservation: input.tipHeightAtObservation,
        note: input.note,
      },
    })
  }

  async listForEscrow(escrowId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma
    return client.escrowReleaseEvidence.findMany({
      where: { escrowId },
      orderBy: { recordedAt: 'asc' },
    })
  }
}

export const escrowReleaseEvidenceRepository: EscrowReleaseEvidenceRepository = new PrismaEscrowReleaseEvidenceRepository()
