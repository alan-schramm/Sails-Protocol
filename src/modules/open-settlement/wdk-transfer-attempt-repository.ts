/**
 * WdkTransferAttemptRepository — Bounded Remediation (WDK Fund-Moving
 * Safety, 2026-09-08).
 *
 * Persistence for WdkTransferAttempt (schema.prisma's own header comment
 * has the full rationale). One row per attempt generation, append-only —
 * a new row is only ever created via create() once a prior row for the
 * same (escrowId, operationType) reached a state
 * wdk-execution-truth.ts's own state machine has determined is safe to
 * retry from. This repository has no opinion on that decision — it only
 * persists what the caller decides.
 */
import { prisma } from '../../common/database'
import type { WdkTransferOperationType, WdkTransferAttemptStatus } from '@prisma/client'

type WdkTransferAttemptRow = NonNullable<Awaited<ReturnType<typeof prisma.wdkTransferAttempt.findFirst>>>

export interface CreateWdkTransferAttemptInput {
  escrowId: string
  operationType: WdkTransferOperationType
  destination: string
  amount: string
}

export interface WdkTransferAttemptRepository {
  /** Most recent attempt for this exact logical operation, or null if none was ever started. */
  findLatest(escrowId: string, operationType: WdkTransferOperationType): Promise<WdkTransferAttemptRow | null>
  create(input: CreateWdkTransferAttemptInput): Promise<WdkTransferAttemptRow>
  updateStatus(id: string, status: WdkTransferAttemptStatus, extra?: { txHash?: string; chainId?: number }): Promise<WdkTransferAttemptRow>
}

class PrismaWdkTransferAttemptRepository implements WdkTransferAttemptRepository {
  async findLatest(escrowId: string, operationType: WdkTransferOperationType) {
    return prisma.wdkTransferAttempt.findFirst({
      where: { escrowId, operationType },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(input: CreateWdkTransferAttemptInput) {
    return prisma.wdkTransferAttempt.create({
      data: {
        escrowId: input.escrowId,
        operationType: input.operationType,
        destination: input.destination,
        amount: input.amount,
      },
    })
  }

  async updateStatus(id: string, status: WdkTransferAttemptStatus, extra?: { txHash?: string; chainId?: number }) {
    return prisma.wdkTransferAttempt.update({
      where: { id },
      data: { status, ...(extra?.txHash !== undefined ? { txHash: extra.txHash } : {}), ...(extra?.chainId !== undefined ? { chainId: extra.chainId } : {}) },
    })
  }
}

export const wdkTransferAttemptRepository: WdkTransferAttemptRepository = new PrismaWdkTransferAttemptRepository()
