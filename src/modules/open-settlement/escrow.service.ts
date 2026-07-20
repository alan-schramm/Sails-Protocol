import { prisma } from '../../common/database'
import { NotFoundError, EscrowError, ForbiddenError } from '../../common/errors'
import { AssetType } from '../../common/types'
import { EscrowStatus, EscrowType } from '../../common/types/trade'
import { config } from '../../config'
import { eventBus } from '../../common/events/event-bus'
import { randomUUID as uuidv4 } from 'crypto'
import { wdkSettlementProvider } from './wdk-settlement.provider'
import { capabilityRegistry, CAPABILITY_IMPLEMENTATIONS } from '../../core/capability-registry'

/**
 * Sails OpenSettlement — Reference Implementation
 *
 * Owns: escrow state machine, SettlementProvider abstraction.
 * Does NOT own: Trade, User. This service must never write to those
 * tables directly — it only emits settlement.escrow.* events. The
 * modules that own Trade (OpenP2P) and User/reputation (OpenReputation)
 * subscribe to those events and update their own domain.
 *
 * This boundary was violated in the previous version of this file
 * (direct prisma.trade.update / prisma.user.update calls). Fixed here —
 * see /common/events/handlers.ts for the listeners that now do that work.
 */

type EscrowRecord = {
  id: string
  tradeId: string
  type: string
  status: string
  lockedAmount: string   // decimal string — RFC-009, never a JS number
  asset: string
  network: string | null
  multisigAddr: string | null
  redeemScript: string | null
  txLockId: string | null
  txReleaseId: string | null
  timelockHours: number
  lockedAt: Date | null
  expiresAt: Date | null
  releasedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['FUNDS_LOCKED', 'REFUNDED'],
  FUNDS_LOCKED: ['PAYMENT_PENDING', 'DISPUTED', 'REFUNDED'],
  PAYMENT_PENDING: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  DISPUTED: ['COMPLETED', 'REFUNDED'],
  REFUNDED: [],
}

// ─── SettlementProvider — the protocol interface (Sails Protocol Spec) ────────
export interface SettlementProvider {
  name: string
  lockFunds(escrow: EscrowRecord): Promise<{ txId: string; address: string }>
  releaseFunds(escrow: EscrowRecord, toAddress: string): Promise<{ txId: string }>
  refundFunds(escrow: EscrowRecord): Promise<{ txId: string }>
  verifyLock(escrow: EscrowRecord): Promise<boolean>
}

class MockSettlementProvider implements SettlementProvider {
  name = 'MOCK'
  async lockFunds(escrow: EscrowRecord) {
    await new Promise((r) => setTimeout(r, 100))
    return { txId: `mock-lock-${uuidv4()}`, address: `mock-addr-${escrow.id.slice(0, 8)}` }
  }
  async releaseFunds(_escrow: EscrowRecord, toAddress: string) {
    await new Promise((r) => setTimeout(r, 100))
    return { txId: `mock-release-${uuidv4()}-to-${toAddress.slice(0, 8)}` }
  }
  async refundFunds(_escrow: EscrowRecord) {
    await new Promise((r) => setTimeout(r, 100))
    return { txId: `mock-refund-${uuidv4()}` }
  }
  async verifyLock(_escrow: EscrowRecord) {
    return true
  }
}

class LightningHodlProvider implements SettlementProvider {
  name = 'LIGHTNING_HODL'
  async lockFunds(_e: EscrowRecord): Promise<{ txId: string; address: string }> {
    throw new EscrowError('Lightning HODL escrow not yet implemented. Use MOCK type.')
  }
  async releaseFunds(_e: EscrowRecord, _a: string): Promise<{ txId: string }> {
    throw new EscrowError('Lightning HODL escrow not yet implemented.')
  }
  async refundFunds(_e: EscrowRecord): Promise<{ txId: string }> {
    throw new EscrowError('Lightning HODL escrow not yet implemented.')
  }
  async verifyLock(_e: EscrowRecord) {
    return false
  }
}

const PROVIDERS: Record<string, SettlementProvider> = {
  MOCK: new MockSettlementProvider(),
  LIGHTNING_HODL: new LightningHodlProvider(),
  // Real @tetherto/wdk-wallet-evm USDT settlement — wdk-settlement.provider.ts's
  // own doc comment has the full custody-model caveat (single-seed
  // two-hop escrow, testnet only).
  WDK_USDT_EVM: wdkSettlementProvider,
}

export interface CreateEscrowInput {
  tradeId: string
  type?: EscrowType
  lockedAmount: string   // decimal string — RFC-009, never a JS number
  asset: AssetType
  network?: string
  timelockHours?: number
}

// Found during a general gap audit (not tied to any single RFC): none of
// this class's mutating methods verified `triggeredBy` was actually a
// party to the trade before this fix — any authenticated participant on
// the platform could lock/confirm/release/refund/dispute *any* other
// trade's escrow, not just their own (an IDOR, the same class of bug
// RT-002 already fixed once for raw-userId-in-body — this was the same
// gap one layer deeper, at the service boundary rather than the auth
// boundary). `triggeredBy` may be a participant's own id, or an agent
// acting on their behalf (`agent:{label}:{participantId}`,
// `wallet-agent.ts`) — that string shape only ever originates from
// trusted internal callers (settlement-orchestrator.ts), never from an
// HTTP request body, so accepting it here doesn't reopen the hole this
// fix closes.
function isPartyOrAgent(triggeredBy: string, participantId: string): boolean {
  return triggeredBy === participantId || new RegExp(`^agent:[^:]+:${participantId}$`).test(triggeredBy)
}

export class EscrowService {
  private getProvider(type: string): SettlementProvider {
    if (config.features.mockEscrow || type === 'MOCK') return PROVIDERS['MOCK']
    return PROVIDERS[type] ?? PROVIDERS['MOCK']
  }

  // Shared by releaseFunds()/refundFunds() below — both are legitimately
  // triggered by either the seller (the normal path) or the arbiter
  // assigned to an open dispute on this trade (dispute.service.ts's
  // resolveDispute(), which validates the arbiter match itself *before*
  // calling into this class — this is a second, defense-in-depth check,
  // not the only one). Only queries Dispute when the cheaper seller
  // check already failed.
  private async isSellerOrAssignedArbiter(tradeId: string, sellerId: string, triggeredBy: string): Promise<boolean> {
    if (isPartyOrAgent(triggeredBy, sellerId)) return true
    const dispute = await prisma.dispute.findFirst({ where: { tradeId, arbiterId: triggeredBy } })
    return dispute !== null
  }

  private async transition(
    escrowId: string,
    tradeId: string,
    from: string,
    to: string,
    triggeredBy: string,
    eventName: Parameters<typeof eventBus.emit>[0],
    eventExtra: Record<string, unknown> = {},
    note?: string
  ) {
    await prisma.escrowEvent.create({
      data: { escrowId, fromStatus: from as any, toStatus: to as any, triggeredBy, note },
    })
    // correlationId = tradeId (RFC-010) — stand-in for intentId until Intent
    // persistence exists; Trade already IS the concrete TradeIntent (§2.3).
    await eventBus.emit(eventName as any, {
      escrowId,
      tradeId,
      from,
      to,
      triggeredBy,
      ...eventExtra,
    }, tradeId)
  }

  private assertTransition(current: string, next: string) {
    const allowed = VALID_TRANSITIONS[current] ?? []
    if (!allowed.includes(next)) {
      throw new EscrowError(
        `Invalid escrow transition: ${current} → ${next}. Allowed: ${allowed.join(', ') || 'none'}`
      )
    }
  }

  async createEscrow(input: CreateEscrowInput) {
    // Reads Trade only to validate existence — this is a read, not a write,
    // so it does not violate the module boundary (OpenSettlement may read
    // cross-module state; it must never WRITE to another module's tables).
    const trade = await prisma.trade.findUnique({ where: { id: input.tradeId } })
    if (!trade) throw new NotFoundError('Trade', input.tradeId)
    if (trade.escrowId) throw new EscrowError('Trade already has an escrow')

    const type = input.type ?? (config.features.mockEscrow ? 'MOCK' : 'MULTISIG')

    const escrow = await prisma.escrow.create({
      data: {
        tradeId: input.tradeId,
        type: type as any,
        status: 'CREATED',
        lockedAmount: input.lockedAmount,
        asset: input.asset as any,
        network: input.network,
        timelockHours: input.timelockHours ?? config.trade.defaultTimelockHours,
      },
    })

    await eventBus.emit('settlement.escrow.created', {
      escrowId: escrow.id,
      tradeId: escrow.tradeId,
      type: escrow.type,
      lockedAmount: escrow.lockedAmount.toString(),   // RFC-009 — Decimal -> decimal string at the event boundary
      asset: escrow.asset,
    }, escrow.tradeId)   // correlationId = tradeId (RFC-010)

    return escrow
  }

  async lockFunds(escrowId: string, triggeredBy: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    this.assertTransition(escrow.status, 'FUNDS_LOCKED')

    // Locking collateral is the seller's own action — see this file's
    // isPartyOrAgent() doc comment for why an IDOR check was missing here.
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!isPartyOrAgent(triggeredBy, trade.sellerId)) {
      throw new ForbiddenError(`${triggeredBy} is not the seller of trade ${trade.id} — only the seller may lock escrow funds`)
    }

    // ─── Robustness-audit fix (2026-07-20): claim the transition
    // atomically BEFORE calling the external provider, not after. The
    // old code read `escrow.status`, checked it in memory
    // (assertTransition above), then called the real, side-effecting
    // provider — two concurrent lockFunds() calls for the same escrow
    // (double-click, a retried request after a timeout) would both pass
    // that in-memory check before either write landed, so both would go
    // on to call provider.lockFunds(). For WDK_USDT_EVM that means two
    // real on-chain calls for one escrow. `updateMany`'s `WHERE status:`
    // clause makes Postgres itself the arbiter: only the request whose
    // WHERE still matches the row's *current* status affects a row —
    // the loser gets `count: 0` and is rejected before ever touching the
    // provider, not after. ────────────────────────────────────────────
    const claim = await prisma.escrow.updateMany({
      where: { id: escrowId, status: escrow.status },
      data: { status: 'FUNDS_LOCKED' },
    })
    if (claim.count === 0) {
      throw new EscrowError(`Escrow ${escrowId} was already transitioned by a concurrent request`)
    }

    try {
      const provider = this.getProvider(escrow.type)
      const result = await provider.lockFunds(escrow as unknown as EscrowRecord)

      const now = new Date()
      const expiresAt = new Date(now.getTime() + escrow.timelockHours * 3600 * 1000)

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txLockId: result.txId, multisigAddr: result.address, lockedAt: now, expiresAt },
      })

      // NOTE: previously this method also called prisma.trade.update(...) to set
      // Trade.status = 'ACTIVE'. That write belonged to OpenP2P, not here. The
      // OpenP2P trade handler now does this in reaction to the event below.
      await this.transition(escrowId, escrow.tradeId, 'CREATED', 'FUNDS_LOCKED', triggeredBy, 'settlement.escrow.locked', {
        txId: result.txId,
      })

      return updated
    } catch (err) {
      // Revert the claim — an escrow left claiming FUNDS_LOCKED with no
      // real lock behind it (the provider call failed) would otherwise
      // block every future lockFunds() attempt via assertTransition,
      // with no way to retry. Same revert-on-failure idiom
      // dispute.service.ts's resolveDispute() already established.
      await prisma.escrow.update({ where: { id: escrowId }, data: { status: escrow.status } }).catch(() => {})
      throw err
    }
  }

  async markPaymentSent(escrowId: string, triggeredBy: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    this.assertTransition(escrow.status, 'PAYMENT_PENDING')

    // Claiming fiat was sent is the buyer's own claim — see isPartyOrAgent()'s doc comment.
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!isPartyOrAgent(triggeredBy, trade.buyerId)) {
      throw new ForbiddenError(`${triggeredBy} is not the buyer of trade ${trade.id} — only the buyer may confirm payment sent`)
    }

    // No external provider call here, but still atomic (robustness audit,
    // 2026-07-20) — a double-click could otherwise write the same
    // transition twice, emitting settlement.escrow.payment_pending
    // twice for one real event.
    const claim = await prisma.escrow.updateMany({
      where: { id: escrowId, status: escrow.status },
      data: { status: 'PAYMENT_PENDING' },
    })
    if (claim.count === 0) {
      throw new EscrowError(`Escrow ${escrowId} was already transitioned by a concurrent request`)
    }
    const updated = await prisma.escrow.findUnique({ where: { id: escrowId } })

    await this.transition(
      escrowId,
      escrow.tradeId,
      'FUNDS_LOCKED',
      'PAYMENT_PENDING',
      triggeredBy,
      'settlement.escrow.payment_pending'
    )

    return updated
  }

  async releaseFunds(escrowId: string, toAddress: string, triggeredBy: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    this.assertTransition(escrow.status, 'COMPLETED')

    // Gap-audit fix: the seller (normal path) or the assigned arbiter of
    // an open dispute (dispute.service.ts's resolveDispute()) — see
    // isPartyOrAgent()/isSellerOrAssignedArbiter()'s doc comments above.
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!(await this.isSellerOrAssignedArbiter(trade.id, trade.sellerId, triggeredBy))) {
      throw new ForbiddenError(`${triggeredBy} is neither the seller of trade ${trade.id} nor its assigned dispute arbiter`)
    }

    // RFC-014: the real capability check. Lives here, not in
    // settlement-orchestrator.ts (where it originally shipped) — found
    // while implementing RFC-015 that this is the actual single choke
    // point every real release goes through (settlement-orchestrator.ts's
    // executeSettlement(), settlement.routes.ts's direct
    // POST /v1/settlement/escrow/:id/release, and dispute.service.ts's
    // arbitrated resolveDispute()); a check placed only in the
    // orchestrator silently missed the other two. Off by default
    // (config.features.enforceCapabilities) — see that flag's own doc
    // comment in config/index.ts.
    if (config.features.enforceCapabilities) {
      const capabilityName = CAPABILITY_IMPLEMENTATIONS.opensettlement
      const allowed = await capabilityRegistry.check(triggeredBy, capabilityName, 'settlement.escrow.released')
      if (!allowed) {
        throw new ForbiddenError(
          `${triggeredBy} has no active '${capabilityName}' capability grant covering 'settlement.escrow.released'`
        )
      }
    }

    // RFC-015: two-person control. Only on the normal (non-disputed)
    // path — escrow.status is still the pre-transition value here
    // (PAYMENT_PENDING for a normal release, DISPUTED for an arbitrated
    // one, both allowed by assertTransition above). An arbitrated release
    // already went through dispute.service.ts's own authorization
    // (only the assigned, TRUSTED_ARBITRATORS-configured arbiter may
    // call resolveDispute()) — requiring the original two counterparties
    // to *also* agree would defeat the point of arbitration existing at
    // all (if they could still agree, there'd be no dispute). Off by
    // default (config.features.requireDualApprovalForRelease) — see that
    // flag's own doc comment in config/index.ts.
    if (config.features.requireDualApprovalForRelease && escrow.status === 'PAYMENT_PENDING') {
      const dual = await this.hasDualApproval(escrowId)
      if (!dual) {
        throw new EscrowError(
          `Release blocked: both counterparties must call POST /v1/settlement/escrow/${escrowId}/approve-release ` +
          'before funds can be released (RFC-015 two-person control).'
        )
      }
    }

    // ─── Robustness-audit fix (2026-07-20), the highest-severity finding
    // of this pass: this is the one call in the entire codebase that can
    // move real money (WDK_USDT_EVM signs and broadcasts a real on-chain
    // USDT transfer). The old code called `provider.releaseFunds()`
    // straight after the in-memory `assertTransition` check above, with
    // no DB-level guard before it — two concurrent releaseFunds() calls
    // for the same escrow (a double-click, a client retrying after a
    // timeout that actually succeeded server-side, or a race between
    // executeSettlement()'s auto-settle path and a manual API call)
    // would both pass assertTransition before either write landed, and
    // both would go on to sign and broadcast a real transfer — an actual
    // double-payment, not a theoretical one. Fixed the same way
    // lockFunds() above now is: atomically claim COMPLETED via a
    // conditional `updateMany` *before* ever calling the provider, so a
    // concurrent loser is rejected before touching real funds, not after.
    const claim = await prisma.escrow.updateMany({
      where: { id: escrowId, status: escrow.status },
      data: { status: 'COMPLETED' },
    })
    if (claim.count === 0) {
      throw new EscrowError(`Escrow ${escrowId} was already transitioned by a concurrent request`)
    }

    try {
      const provider = this.getProvider(escrow.type)
      const result = await provider.releaseFunds(escrow as unknown as EscrowRecord, toAddress)

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txReleaseId: result.txId, releasedAt: new Date() },
      })

      // NOTE: previously this method also updated Trade.status/completedAt AND
      // incremented User.totalTrades/totalVolumeBtc directly (reaching into
      // OpenP2P's and OpenReputation's domains). Both writes are now owned by
      // their respective modules, triggered by the event emitted below.
      await this.transition(escrowId, escrow.tradeId, escrow.status, 'COMPLETED', triggeredBy, 'settlement.escrow.released', {
        txId: result.txId,
      })

      return updated
    } catch (err) {
      // Revert the claim — see lockFunds()'s identical comment. Critical
      // here specifically: without this, a failed release (provider
      // threw, e.g. RPC error) would leave the escrow permanently stuck
      // claiming COMPLETED with `txReleaseId: null` — funds neither
      // released nor recoverable through this service again.
      await prisma.escrow.update({ where: { id: escrowId }, data: { status: escrow.status } }).catch(() => {})
      throw err
    }
  }

  async openDispute(escrowId: string, triggeredBy: string, reason: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    this.assertTransition(escrow.status, 'DISPUTED')

    // Defense in depth: dispute.service.ts's raiseDispute() already makes
    // this exact check before ever calling here (its only real caller
    // today) — kept here too so this method is safe to call directly if
    // a second caller is ever added, consistent with the "the real check
    // belongs at the actual choke point" lesson from RFC-014/015.
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!isPartyOrAgent(triggeredBy, trade.buyerId) && !isPartyOrAgent(triggeredBy, trade.sellerId)) {
      throw new ForbiddenError(`${triggeredBy} is not a party to trade ${trade.id}`)
    }

    // Atomic conditional update — see lockFunds()'s comment. No external
    // provider call here, but dispute.service.ts's raiseDispute() itself
    // already has its own @@unique([tradeId]) guard at the Dispute-row
    // level (2026-07-19 security round); this closes the same race one
    // layer down, at the Escrow row this method actually mutates.
    const claim = await prisma.escrow.updateMany({
      where: { id: escrowId, status: escrow.status },
      data: { status: 'DISPUTED' },
    })
    if (claim.count === 0) {
      throw new EscrowError(`Escrow ${escrowId} was already transitioned by a concurrent request`)
    }
    const updated = await prisma.escrow.findUnique({ where: { id: escrowId } })

    await this.transition(
      escrowId,
      escrow.tradeId,
      escrow.status,
      'DISPUTED',
      triggeredBy,
      'settlement.escrow.disputed',
      {},
      reason
    )

    return updated
  }

  async refundFunds(escrowId: string, triggeredBy: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    this.assertTransition(escrow.status, 'REFUNDED')

    // Same shape as releaseFunds() above: the seller getting their own
    // collateral back (the normal, non-disputed path — REFUNDED is
    // reachable directly from CREATED/FUNDS_LOCKED, e.g. a trade
    // cancelled before payment) or the assigned arbiter of an open
    // dispute (dispute.service.ts's resolveDispute() with a REFUND ruling).
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!(await this.isSellerOrAssignedArbiter(trade.id, trade.sellerId, triggeredBy))) {
      throw new ForbiddenError(`${triggeredBy} is neither the seller of trade ${trade.id} nor its assigned dispute arbiter`)
    }

    // Same fix as releaseFunds() above, same reason: claim REFUNDED
    // atomically before ever calling the real, side-effecting provider.
    const claim = await prisma.escrow.updateMany({
      where: { id: escrowId, status: escrow.status },
      data: { status: 'REFUNDED' },
    })
    if (claim.count === 0) {
      throw new EscrowError(`Escrow ${escrowId} was already transitioned by a concurrent request`)
    }

    try {
      const provider = this.getProvider(escrow.type)
      const result = await provider.refundFunds(escrow as unknown as EscrowRecord)

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txReleaseId: result.txId },
      })

      await this.transition(escrowId, escrow.tradeId, escrow.status, 'REFUNDED', triggeredBy, 'settlement.escrow.refunded', {
        txId: result.txId,
      })

      return updated
    } catch (err) {
      await prisma.escrow.update({ where: { id: escrowId }, data: { status: escrow.status } }).catch(() => {})
      throw err
    }
  }

  // RFC-015 — the two-person control's write path. Reads Trade only to
  // validate the approver is actually one of this trade's own two
  // counterparties (the same "read is fine, write is not" boundary
  // createEscrow() above already relies on) — never writes to it.
  // Idempotent: the same approver calling twice just returns the
  // existing row rather than erroring, since re-confirming isn't
  // meaningfully different from confirming once.
  async approveRelease(escrowId: string, approverId: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)

    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
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

  async getReleaseApprovals(escrowId: string) {
    return prisma.escrowReleaseApproval.findMany({ where: { escrowId }, orderBy: { approvedAt: 'asc' } })
  }

  // Distinct-approver count >= 2 — the @@unique([escrowId, approverId])
  // constraint (schema.prisma) already guarantees no approver is counted
  // twice, so a plain count is sufficient.
  async hasDualApproval(escrowId: string): Promise<boolean> {
    const count = await prisma.escrowReleaseApproval.count({ where: { escrowId } })
    return count >= 2
  }

  async getEscrow(escrowId: string) {
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    return escrow
  }

  async getEscrowByTrade(tradeId: string) {
    const escrow = await prisma.escrow.findUnique({
      where: { tradeId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })
    if (!escrow) throw new NotFoundError('Escrow for trade', tradeId)
    return escrow
  }
}

export const escrowService = new EscrowService()
