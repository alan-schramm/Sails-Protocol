/**
 * EntitlementLedgerRepository — Missão 11 Fase 6.3A economic accounting
 * foundation.
 *
 * Read-only by design: writing an entitlement entry requires the same
 * atomic, transactional read-then-write sequence
 * entitlement-allocation.service.ts's allocate()/reverseEntry() implement
 * directly (mirroring FeeDistributionRepository.addObligationToBatch()'s
 * own proven pattern, Fase 2.2 — see that service's own header comment for
 * why a separate, non-transactional write method here would have been
 * unable to close the same TOCTOU race). This repository exists purely for
 * the read-side queries every caller (reconciliation, reporting, tests)
 * actually needs, matching FeeCollectionEvidenceRepository's own
 * append-only discipline (Fase 2.2 §7): no update()/delete() exists here,
 * by design, matching this migration's own DB-level append-only trigger
 * (entitlement_ledger_entries_append_only_guard), which would reject any
 * such call anyway.
 *
 * No mutable balance table exists here or anywhere in this foundation
 * (Phase 6.2 §G/§20's own decision) — sumBalance() below is a pure,
 * deterministic SUM query over this table, never a cached/materialized
 * value, so it is always exactly reconstructible from first principles
 * (Phase 6.2 E13).
 */
import { prisma } from '../../common/database'
import { Prisma } from '@prisma/client'
import type { AssetType } from '@prisma/client'

type EntitlementLedgerEntryRow = NonNullable<Awaited<ReturnType<typeof prisma.entitlementLedgerEntry.findFirst>>>

export type EntitlementLedgerEntryKind = 'ALLOCATION' | 'REVERSAL'

export interface EntitlementLedgerRepository {
  findById(id: string): Promise<EntitlementLedgerEntryRow | null>

  listForObligation(feeObligationId: string): Promise<EntitlementLedgerEntryRow[]>

  listForGeneration(confirmationEvidenceId: string): Promise<EntitlementLedgerEntryRow[]>

  /** Deterministic balance reconstruction — Phase 6.2 E13. Never a cached
   *  value; always a live SUM over the append-only ledger. */
  sumBalance(recipientId: string, asset: AssetType, rail: string): Promise<Prisma.Decimal>
}

class PrismaEntitlementLedgerRepository implements EntitlementLedgerRepository {
  async findById(id: string) {
    return prisma.entitlementLedgerEntry.findUnique({ where: { id } })
  }

  async listForObligation(feeObligationId: string) {
    return prisma.entitlementLedgerEntry.findMany({ where: { feeObligationId }, orderBy: { createdAt: 'asc' } })
  }

  async listForGeneration(confirmationEvidenceId: string) {
    return prisma.entitlementLedgerEntry.findMany({ where: { confirmationEvidenceId }, orderBy: { createdAt: 'asc' } })
  }

  async sumBalance(recipientId: string, asset: AssetType, rail: string) {
    const result = await prisma.entitlementLedgerEntry.aggregate({
      where: { recipientId, asset, rail },
      _sum: { amount: true },
    })
    return result._sum.amount ?? new Prisma.Decimal(0)
  }
}

export const entitlementLedgerRepository: EntitlementLedgerRepository = new PrismaEntitlementLedgerRepository()
