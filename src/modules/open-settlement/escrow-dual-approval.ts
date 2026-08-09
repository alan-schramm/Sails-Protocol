import { prisma } from '../../common/database'
import { NotFoundError, ForbiddenError } from '../../common/errors'
import { escrowRepository } from './escrow-repository'
import { tradeRepository } from '../open-p2p/trade-repository'

/**
 * Sails OpenSettlement — RFC-015 two-person control for escrow release
 * (ARCHITECTURE_AUDIT_REPORT.md §2's escrow.service.ts finding,
 * recommendation #1, closed 2026-08-08 — see escrow-providers.ts's
 * identical header comment for the full context).
 *
 * Moved verbatim from escrow.service.ts's approveRelease()/
 * getReleaseApprovals()/hasDualApproval() (no behavior change) — this is
 * a genuinely standalone concern: none of these three functions ever
 * calls a SettlementProvider or touches Escrow.status directly, they
 * only read/write EscrowReleaseApproval.
 */

// Reads Trade only to validate the approver is actually one of this
// trade's own two counterparties (the same "read is fine, write is not"
// boundary escrow.service.ts's createEscrow() relies on) — never writes
// to it. Idempotent: the same approver calling twice just returns the
// existing row rather than erroring, since re-confirming isn't
// meaningfully different from confirming once.
export async function approveRelease(escrowId: string, approverId: string) {
  const escrow = await escrowRepository.findById(escrowId)
  if (!escrow) throw new NotFoundError('Escrow', escrowId)

  const trade = await tradeRepository.findById(escrow.tradeId)
  if (!trade) throw new NotFoundError('Trade', escrow.tradeId)

  if (approverId !== trade.buyerId && approverId !== trade.sellerId) {
    throw new ForbiddenError(`${approverId} is not a counterparty (buyer or seller) of trade ${trade.id}`)
  }

  return prisma.escrowReleaseApproval.upsert({
    where: { escrowId_approverId: { escrowId, approverId } },
    update: {},
    create: { escrowId, approverId },
  })
}

export async function getReleaseApprovals(escrowId: string) {
  return prisma.escrowReleaseApproval.findMany({ where: { escrowId }, orderBy: { approvedAt: 'asc' } })
}

// Distinct-approver count >= 2 — the @@unique([escrowId, approverId])
// constraint (schema.prisma) already guarantees no approver is counted
// twice, so a plain count is sufficient.
export async function hasDualApproval(escrowId: string): Promise<boolean> {
  const count = await prisma.escrowReleaseApproval.count({ where: { escrowId } })
  return count >= 2
}
