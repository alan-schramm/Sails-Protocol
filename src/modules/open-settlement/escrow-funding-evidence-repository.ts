/**
 * EscrowFundingEvidenceRepository — Missão 11 Fase 9.1 §1.
 *
 * The durable, append-only funding-side counterpart to
 * FeeCollectionEvidenceRepository (fee-collection-evidence-repository.ts),
 * closing the Phase 9.0 audit's own "INV-07F" finding: escrow FUNDING
 * reorg detection previously produced only a log line, with no
 * queryable, durable evidence trail. Canonically reconciled (Missão 11
 * Fase 9.3.3, docs/PROTOCOL_INVARIANTS.md's "Canonical Hierarchy") —
 * this closes INV-05 (Historical Meaning Is Immutable) / INV-07
 * (Explicit Failure & Recovery), Level 2 DP-1/DP-2. The old
 * "INV-07F"/"DP-03"/"DP-05"/"DP-07" labels are non-canonical; see that
 * document for why they could not be reconstructed.
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
  // Missão 11 Fase 9.3 — optional tx, same shape as record() above, so a
  // caller holding escrow-funding-lock.ts's per-escrow advisory lock can
  // read the LATEST evidence through the same locked transaction instead
  // of a separate, unlocked connection (which is exactly the TOCTOU gap
  // that let a lifecycle transition act on stale "funding is fine"
  // evidence a concurrent reorg-sweep write had already superseded).
  listForEscrow(escrowId: string, tx?: Prisma.TransactionClient): Promise<EscrowFundingEvidenceRow[]>
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

  async listForEscrow(escrowId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma
    return client.escrowFundingEvidence.findMany({
      where: { escrowId },
      orderBy: { recordedAt: 'asc' },
    })
  }
}

export const escrowFundingEvidenceRepository: EscrowFundingEvidenceRepository = new PrismaEscrowFundingEvidenceRepository()
