/**
 * EscrowRepository — Sails OpenSettlement Component
 *
 * ARCHITECTURE_AUDIT_REPORT.md recommendation #3, step 4 (final step) of
 * the incremental rollout (step 1: CapabilityGrantRepository, step 2:
 * IntentRepository, step 3: TradeRepository). Real fund-moving code
 * (Bitcoin multisig / EVM Safe-guard settlement) — every method here is
 * a verbatim 1:1 move of an existing Prisma call, no behavior change.
 *
 * Scope, deliberately narrow: wraps `prisma.escrow.*` only, plus one
 * bundled-in read no other repository owns — findDisputeByTradeAndArbiter()
 * (isSellerOrAssignedArbiter()'s fallback check) — same "bundle in the
 * one extra read a consumer needs" precedent TradeRepository already set
 * with findOfferById(). Escrow's own satellite/child tables
 * (escrowParticipantKey, escrowEvent, feeDistribution,
 * escrowReleaseApproval, escrowPendingTransaction,
 * escrowTransactionSignature) are deliberately NOT wrapped here — they're
 * already fully confined to open-settlement's own files (never a
 * cross-module violation, the actual problem this rollout exists to
 * fix), so including them would roughly double this step's size without
 * closing any new architectural violation. Deferred, disclosed, not
 * silently dropped.
 *
 * claimTransition() returns the raw affected-row count — no EscrowError/
 * VALID_TRANSITIONS logic lives here. Both stay exactly where they are
 * today: escrow-lifecycle.ts's claimEscrowTransition() keeps its own
 * VALID_TRANSITIONS pre-check + throw; escrow.service.ts's
 * markPaymentSent() keeps its own separate, pre-existing, undeduplicated
 * throw (it never had the VALID_TRANSITIONS gate — this pass does not
 * add one as a side effect of moving the persistence call). Mirrors
 * IntentRepository.claimTransition()'s own precedent exactly.
 */
import { prisma } from '../../common/database'
import type { Prisma } from '@prisma/client'
import type { AssetType } from '../../common/types'
import type { EscrowType } from '../../common/types/trade'
import { EscrowError } from '../../common/errors'

type EscrowRow = NonNullable<Awaited<ReturnType<typeof prisma.escrow.findUnique>>>
type EscrowWithDetailsRow = Prisma.EscrowGetPayload<{ include: { events: true; disputes: true } }>
type DisputeRow = NonNullable<Awaited<ReturnType<typeof prisma.dispute.findFirst>>>

export interface CreateEscrowData {
  tradeId: string
  type: EscrowType
  lockedAmount: string
  asset: AssetType
  network: string | undefined
  timelockHours: number
  // Missão 11 Fase 4.1 §4 — the fee-policy snapshot, computed BEFORE this
  // escrow exists (escrow-fee-snapshot.service.ts's computeSnapshotFields())
  // and folded into this SAME insert rather than a separate update
  // afterward. Optional/undefined for every legacy escrow (no PUBLISHED
  // policy for this rail) — identical to today's behavior in that case.
  feeSnapshot?: {
    feePolicyVersionId: string
    snapshotProtocolFeeRate: Prisma.Decimal
    snapshotPayerModel: Prisma.EscrowCreateInput['snapshotPayerModel']
    snapshotEconomicBasis: Prisma.EscrowCreateInput['snapshotEconomicBasis']
    snapshotFeeCollectionAddress: string | null
    snapshotFeeCollectionWaivedPreFunding: boolean
  }
}

export interface EscrowRepository {
  create(input: CreateEscrowData): Promise<EscrowRow>

  /** Bare row, no relations — the one shape behind every read in this module that just needs the current escrow before deciding what to do next. */
  findById(escrowId: string): Promise<EscrowRow | null>

  /** events(createdAt asc) + disputes — getEscrow()'s own shape. */
  findByIdWithDetails(escrowId: string): Promise<EscrowWithDetailsRow | null>

  /** Same include shape as findByIdWithDetails(), keyed by tradeId — getEscrowByTrade()'s own shape. */
  findByTradeIdWithDetails(tradeId: string): Promise<EscrowWithDetailsRow | null>

  /** status = FUNDS_LOCKED and expiresAt in the past — sweepExpiredEscrows()'s own shape. */
  findExpiredFundsLocked(now: Date): Promise<EscrowRow[]>

  /** isSellerOrAssignedArbiter()'s fallback existence check — the one Dispute-by-this-shape read nobody else owns. */
  findDisputeByTradeAndArbiter(tradeId: string, arbiterId: string): Promise<DisputeRow | null>

  /** submitParticipantKey()'s own write, once both buyer/seller keys exist. */
  updateMultisigAddr(escrowId: string, multisigAddr: string): Promise<EscrowRow>

  /** lockFunds()'s own write. txLockVout is null for providers with no
   *  Bitcoin-style outpoint (everything but MULTISIG) — the DB's
   *  @@unique([txLockId, txLockVout]) constraint only ever fires when
   *  BOTH columns are non-null for two different rows (Missão 10).
   *  fundedAmount (Missão 11 Fase 4) is purely observational — undefined
   *  for legacy escrows and any provider that doesn't report it, keeping
   *  the column NULL exactly as it already is for every existing row. */
  updateLockResult(escrowId: string, data: { txLockId: string; txLockVout: number | null; multisigAddr: string; lockedAt: Date; expiresAt: Date; fundedAmount?: number }): Promise<EscrowRow>

  /** Atomic conditional update — returns the affected-row count (0 = a concurrent caller already transitioned this Escrow). */
  claimTransition(escrowId: string, fromStatus: string, toStatus: string): Promise<number>

  /** releaseFunds()'s own write. */
  updateReleaseResult(escrowId: string, data: { txReleaseId: string; releasedAt: Date; feeCharged: Prisma.Decimal | null }): Promise<EscrowRow>

  /** refundFunds()'s own write — no releasedAt/feeCharged (PROTOCOL_ECONOMY.md §3: the Protocol Fee never attaches to a refund). */
  updateRefundResult(escrowId: string, txReleaseId: string): Promise<EscrowRow>

  /** splitFunds()'s own write — txReleaseId is the joined multi-tx-id string. */
  updateSplitResult(escrowId: string, data: { txReleaseId: string; releasedAt: Date }): Promise<EscrowRow>

  /** submitTransactionSignature()'s own write (escrow-pending-tx.ts) — releasedAt present for release/split, absent for refund; the caller decides which, exactly as today. */
  updateSignatureCollectionResult(escrowId: string, data: { txReleaseId: string; releasedAt?: Date }): Promise<EscrowRow>

  /** revertEscrowStatus()'s own write — a plain update, not the conditional claimTransition() above. Caller keeps its own .catch(() => {}). */
  revertStatus(escrowId: string, status: string): Promise<EscrowRow>
}

class PrismaEscrowRepository implements EscrowRepository {
  async create(input: CreateEscrowData) {
    return prisma.escrow.create({
      data: {
        tradeId: input.tradeId,
        type: input.type as any,
        status: 'CREATED',
        lockedAmount: input.lockedAmount,
        asset: input.asset as any,
        network: input.network,
        timelockHours: input.timelockHours,
        ...(input.feeSnapshot ? {
          feePolicyVersionId: input.feeSnapshot.feePolicyVersionId,
          snapshotProtocolFeeRate: input.feeSnapshot.snapshotProtocolFeeRate,
          snapshotPayerModel: input.feeSnapshot.snapshotPayerModel,
          snapshotEconomicBasis: input.feeSnapshot.snapshotEconomicBasis,
          snapshotFeeCollectionAddress: input.feeSnapshot.snapshotFeeCollectionAddress,
          snapshotFeeCollectionWaivedPreFunding: input.feeSnapshot.snapshotFeeCollectionWaivedPreFunding,
        } : {}),
      },
    })
  }

  async findById(escrowId: string) {
    return prisma.escrow.findUnique({ where: { id: escrowId } })
  }

  async findByIdWithDetails(escrowId: string) {
    return prisma.escrow.findUnique({
      where: { id: escrowId },
      // Missão 10, Fase 6.10 — participantKeys added so escrow.service.ts's
      // getEscrow() can expose registered public keys to this escrow's own
      // authorized readers (same GET route, same authorization gate as
      // events/disputes above — no new query, no new auth logic). The
      // relation itself already existed on Escrow (schema.prisma), unused
      // by any query until now — zero migration.
      include: { events: { orderBy: { createdAt: 'asc' } }, disputes: true, participantKeys: true },
    })
  }

  async findByTradeIdWithDetails(tradeId: string) {
    return prisma.escrow.findUnique({
      where: { tradeId },
      include: { events: { orderBy: { createdAt: 'asc' } }, disputes: true, participantKeys: true },
    })
  }

  async findExpiredFundsLocked(now: Date) {
    return prisma.escrow.findMany({ where: { status: 'FUNDS_LOCKED', expiresAt: { lt: now } } })
  }

  async findDisputeByTradeAndArbiter(tradeId: string, arbiterId: string) {
    return prisma.dispute.findFirst({ where: { tradeId, arbiterId } })
  }

  async updateMultisigAddr(escrowId: string, multisigAddr: string) {
    return prisma.escrow.update({ where: { id: escrowId }, data: { multisigAddr } })
  }

  async updateLockResult(escrowId: string, data: { txLockId: string; txLockVout: number | null; multisigAddr: string; lockedAt: Date; expiresAt: Date; fundedAmount?: number }) {
    try {
      return await prisma.escrow.update({ where: { id: escrowId }, data })
    } catch (err: any) {
      // Missão 10 — the @@unique([txLockId, txLockVout]) constraint
      // firing here means another escrow already claimed this exact
      // outpoint (only possible when data.txLockVout is non-null — see
      // that column's own schema comment for why legacy/null-vout rows
      // never trigger this). Same P2002-to-EscrowError wrap
      // escrow-pending-tx.ts's initiateSignatureCollectionCore() already
      // uses for its own unique-constraint race.
      if (err?.code === 'P2002') {
        throw new EscrowError(
          `Funding outpoint ${data.txLockId}:${data.txLockVout} is already claimed by another escrow — refusing to double-assign the same Bitcoin UTXO.`
        )
      }
      throw err
    }
  }

  async claimTransition(escrowId: string, fromStatus: string, toStatus: string): Promise<number> {
    const claim = await prisma.escrow.updateMany({
      where: { id: escrowId, status: fromStatus as any },
      data: { status: toStatus as any },
    })
    return claim.count
  }

  async updateReleaseResult(escrowId: string, data: { txReleaseId: string; releasedAt: Date; feeCharged: Prisma.Decimal | null }) {
    return prisma.escrow.update({ where: { id: escrowId }, data })
  }

  async updateRefundResult(escrowId: string, txReleaseId: string) {
    return prisma.escrow.update({ where: { id: escrowId }, data: { txReleaseId } })
  }

  async updateSplitResult(escrowId: string, data: { txReleaseId: string; releasedAt: Date }) {
    return prisma.escrow.update({ where: { id: escrowId }, data })
  }

  async updateSignatureCollectionResult(escrowId: string, data: { txReleaseId: string; releasedAt?: Date }) {
    return prisma.escrow.update({ where: { id: escrowId }, data })
  }

  async revertStatus(escrowId: string, status: string) {
    return prisma.escrow.update({ where: { id: escrowId }, data: { status: status as any } })
  }
}

export const escrowRepository: EscrowRepository = new PrismaEscrowRepository()
