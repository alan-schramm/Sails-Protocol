import { prisma } from '../../common/database'
import { NotFoundError, EscrowError, ForbiddenError, ValidationError } from '../../common/errors'
import { AssetType } from '../../common/types'
import { EscrowType } from '../../common/types/trade'
import { config } from '../../config'
import { eventBus } from '../../common/events/event-bus'
import { capabilityRegistry, CAPABILITY_IMPLEMENTATIONS } from '../../core/capability-registry'
import {
  EscrowRecord,
  SettlementProvider,
  NON_CUSTODIAL_PROVIDERS,
  SIGNATURE_COLLECTION_PROVIDERS,
  PUBKEY_HEX_PATTERN,
  recommendedEscrowType,
  getSettlementProvider,
} from './escrow-providers'
import {
  isPartyOrAgent,
  isSellerOrAssignedArbiter,
  loadEscrowWithAuthorization,
  loadParticipantPubkeys,
  claimEscrowTransition,
  revertEscrowStatus,
  assertEscrowTransition,
  emitEscrowTransition,
  chargeProtocolFee,
  resolvePayoutAddress,
} from './escrow-lifecycle'
import * as dualApproval from './escrow-dual-approval'
import * as pendingTx from './escrow-pending-tx'

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
 *
 * ARCHITECTURE_AUDIT_REPORT.md §2's "escrow.service.ts — 1,257 linhas
 * (CRITICAL)" finding, closed 2026-08-08: this file used to also contain
 * the SettlementProvider registry, RFC-015 dual-approval, and the
 * client-signature-collection pending-transaction flow inline — 6 mixed
 * responsibilities in one 1,264-line file per that audit's own count.
 * Extracted into 4 focused modules (the audit's own recommendation #1,
 * "extrair em pelo menos 4 módulos focados: ciclo de vida, registry de
 * providers, dual-approval, transações pendentes"):
 *   - escrow-providers.ts    — SettlementProvider registry/dispatch
 *   - escrow-lifecycle.ts    — shared atomic-claim + authorization helpers
 *   - escrow-dual-approval.ts — RFC-015 two-person control
 *   - escrow-pending-tx.ts   — client-signature-collection flow
 * This file keeps the escrow lifecycle state machine itself (create/
 * lock/mark-paid/release/dispute/refund/split) plus the `EscrowService`
 * class and `escrowService` singleton every other module imports —
 * pure internal reorganization, zero behavior change, zero public-API
 * change. Every method on `EscrowService` below has the exact same
 * name/signature/behavior it always did; only the internal `this.x()`
 * calls that used to reach a private class method now call an imported
 * function instead (none of those methods ever touched instance state —
 * this class was always a stateless orchestrator, so the two are
 * behaviorally identical).
 */

export type { EscrowRecord, SettlementProvider }
export { recommendedEscrowType }

export interface CreateEscrowInput {
  tradeId: string
  type?: EscrowType
  lockedAmount: string   // decimal string — RFC-009, never a JS number
  asset: AssetType
  network?: string
  timelockHours?: number
}

export class EscrowService {
  // RFC-021 D9 — exposed so dispute.service.ts's applyRuling() can route a
  // ruling to the right fund-movement mechanism. Bug found while building
  // SPLIT (2026-08-02): applyRuling() previously called releaseFunds()/
  // refundFunds() unconditionally for every escrow type, but those throw
  // "not directly callable" for MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM
  // (client-held keys — see each provider's own releaseFunds() stub) —
  // meaning a disputed RELEASE/REFUND on those three escrow types could
  // never actually resolve through resolveDispute() at all; the dispute
  // row's RESOLVED status got written then immediately reverted by
  // applyRuling()'s own catch block. Never caught before because no test
  // exercised resolveDispute() against a non-MOCK/WDK escrow. Fixed here,
  // for all three rulings uniformly, not just SPLIT: a signature-collection
  // type now routes through initiateRelease()/initiateRefund()/
  // initiateSplit() instead, which is consistent with how the *cooperative*
  // (non-disputed) path already works for these types — funds finish
  // moving once the winning party submits their own signature, not
  // synchronously inside resolveDispute() itself.
  isSignatureCollectionType(type: string): boolean {
    return type in SIGNATURE_COLLECTION_PROVIDERS
  }

  // Shared by releaseFunds()/refundFunds() below — both are legitimately
  // triggered by either the seller (the normal path) or the arbiter
  // assigned to an open dispute on this trade (dispute.service.ts's
  // resolveDispute(), which validates the arbiter match itself *before*
  // calling into this class — this is a second, defense-in-depth check,
  // not the only one). Thin delegate to escrow-lifecycle.ts's free
  // function — kept as a public method here since it's the documented
  // call surface other modules already reach for.
  async isSellerOrAssignedArbiter(tradeId: string, sellerId: string, triggeredBy: string): Promise<boolean> {
    return isSellerOrAssignedArbiter(tradeId, sellerId, triggeredBy)
  }

  // SECURITY_AUDIT_REPORT.md §9 ("Escrow Bypass"), closed 2026-08-08 — this
  // method had NO membership check at all: any authenticated participant
  // could create an escrow against ANY trade, not just their own. Beyond
  // exposing the trade to attacker-chosen `type`/`lockedAmount`/`asset`
  // values, it was a real griefing vector — `trade.escrowId` being set
  // permanently blocks the real parties' own createEscrow() call below
  // (`EscrowError('Trade already has an escrow')`), so a stranger could
  // brick any trade they could merely guess the id of. `participantId`
  // required now — same "buyer or seller of the trade" bar every other
  // trade-mutating method in this file already enforces (see e.g.
  // submitParticipantKey()'s identical check a few lines below).
  async createEscrow(input: CreateEscrowInput, participantId: string) {
    // Reads Trade only to validate existence — this is a read, not a write,
    // so it does not violate the module boundary (OpenSettlement may read
    // cross-module state; it must never WRITE to another module's tables).
    const trade = await prisma.trade.findUnique({ where: { id: input.tradeId } })
    if (!trade) throw new NotFoundError('Trade', input.tradeId)
    if (participantId !== trade.buyerId && participantId !== trade.sellerId) {
      throw new ForbiddenError(`${participantId} is not a counterparty (buyer or seller) of trade ${trade.id}`)
    }
    if (trade.escrowId) throw new EscrowError('Trade already has an escrow')

    const type = input.type ?? (config.features.mockEscrow ? 'MOCK' : recommendedEscrowType(input.asset))

    // MULTISIG/LIGHTNING_HODL's buyer/seller keys are now client-held
    // (each provider's own header comment) — the deposit address
    // genuinely cannot be derived yet at creation time, only once both
    // parties have submitted their pubkey via submitParticipantKey()
    // below. Escrow.multisigAddr stays null until then.
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

  // The client-held-keys write path (2026-07-27) — buyer/seller each call
  // this once, from their own client, submitting only their public key
  // (their private key never leaves the browser; see multisig.provider.ts's
  // and lightning-hodl.provider.ts's own header comments for the full
  // custody-model disclosure). Idempotent per role: a party resubmitting
  // overwrites their own row (upsert), same shape as approveRelease()
  // above. Once both buyer and seller rows exist, derives and persists
  // the real deposit address — this is the only place that now happens,
  // replacing createEscrow()'s old immediate-population branch.
  async submitParticipantKey(escrowId: string, participantId: string, pubkey: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)

    const provider = NON_CUSTODIAL_PROVIDERS[escrow.type]
    if (!provider) {
      throw new EscrowError(`Escrow type '${escrow.type}' does not use client-submitted keys — nothing to submit`)
    }

    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)

    let role: 'buyer' | 'seller'
    if (participantId === trade.buyerId) role = 'buyer'
    else if (participantId === trade.sellerId) role = 'seller'
    else throw new ForbiddenError(`${participantId} is not a counterparty (buyer or seller) of trade ${trade.id}`)

    if (!PUBKEY_HEX_PATTERN.test(pubkey)) {
      throw new EscrowError('pubkey must be a 33-byte compressed secp256k1 public key, hex-encoded (66 hex characters, starting with 02 or 03)')
    }

    await prisma.escrowParticipantKey.upsert({
      where: { escrowId_role: { escrowId, role } },
      update: { participantId, pubkey },
      create: { escrowId, role, participantId, pubkey },
    })

    const keys = await prisma.escrowParticipantKey.findMany({ where: { escrowId } })
    const buyerKey = keys.find((k: { role: string }) => k.role === 'buyer')
    const sellerKey = keys.find((k: { role: string }) => k.role === 'seller')

    let updatedEscrow = escrow
    if (buyerKey && sellerKey && !escrow.multisigAddr && !config.features.mockEscrow) {
      const address = await provider.getDepositAddress(trade.id, buyerKey.pubkey, sellerKey.pubkey)
      updatedEscrow = await prisma.escrow.update({ where: { id: escrowId }, data: { multisigAddr: address } })
    }

    return { escrow: updatedEscrow, buyerKeySubmitted: !!buyerKey, sellerKeySubmitted: !!sellerKey }
  }

  async lockFunds(escrowId: string, triggeredBy: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    assertEscrowTransition(escrow.status, 'FUNDS_LOCKED')

    // Locking collateral is the seller's own action — see isPartyOrAgent()'s
    // doc comment (escrow-lifecycle.ts) for why an IDOR check was missing here.
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!isPartyOrAgent(triggeredBy, trade.sellerId)) {
      throw new ForbiddenError(`${triggeredBy} is not the seller of trade ${trade.id} — only the seller may lock escrow funds`)
    }

    // ─── Robustness-audit fix (2026-07-20): claim the transition
    // atomically BEFORE calling the external provider, not after. The
    // old code read `escrow.status`, checked it in memory
    // (assertEscrowTransition above), then called the real, side-effecting
    // provider — two concurrent lockFunds() calls for the same escrow
    // (double-click, a retried request after a timeout) would both pass
    // that in-memory check before either write landed, so both would go
    // on to call provider.lockFunds(). For WDK_USDT_EVM that means two
    // real on-chain calls for one escrow. The shared claimEscrowTransition
    // helper makes Postgres itself the arbiter: only the request whose
    // WHERE still matches the row's *current* status affects a row —
    // the loser gets `count: 0` and is rejected before ever touching the
    // provider, not after. ────────────────────────────────────────────
    await claimEscrowTransition(escrowId, escrow.status, 'FUNDS_LOCKED')

    try {
      const provider = getSettlementProvider(escrow.type)
      // MULTISIG/LIGHTNING_HODL need the client-submitted pubkeys
      // (EscrowParticipantKey) to re-derive the same script lockFunds()
      // verifies against — every other provider ignores these extra
      // fields, same "optional, only two providers care" shape as
      // buyerId/sellerId below.
      const { buyerPubkey, sellerPubkey } = NON_CUSTODIAL_PROVIDERS[escrow.type]
        ? await loadParticipantPubkeys(escrowId)
        : { buyerPubkey: undefined, sellerPubkey: undefined }
      const result = await provider.lockFunds({
        ...escrow, buyerId: trade.buyerId, sellerId: trade.sellerId, buyerPubkey, sellerPubkey,
      } as unknown as EscrowRecord)

      const now = new Date()
      const expiresAt = new Date(now.getTime() + escrow.timelockHours * 3600 * 1000)

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txLockId: result.txId, multisigAddr: result.address, lockedAt: now, expiresAt },
      })

      // NOTE: previously this method also called prisma.trade.update(...) to set
      // Trade.status = 'ACTIVE'. That write belonged to OpenP2P, not here. The
      // OpenP2P trade handler now does this in reaction to the event below.
      await emitEscrowTransition(escrowId, escrow.tradeId, 'CREATED', 'FUNDS_LOCKED', triggeredBy, 'settlement.escrow.locked', {
        txId: result.txId,
      })

      return updated
    } catch (err) {
      // Revert the claim — an escrow left claiming FUNDS_LOCKED with no
      // real lock behind it (the provider call failed) would otherwise
      // block every future lockFunds() attempt via assertEscrowTransition,
      // with no way to retry. Same revert-on-failure idiom
      // dispute.service.ts's resolveDispute() already established.
      await revertEscrowStatus(escrowId, escrow.status)
      throw err
    }
  }

  async markPaymentSent(escrowId: string, triggeredBy: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    assertEscrowTransition(escrow.status, 'PAYMENT_PENDING')

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

    await emitEscrowTransition(
      escrowId,
      escrow.tradeId,
      'FUNDS_LOCKED',
      'PAYMENT_PENDING',
      triggeredBy,
      'settlement.escrow.payment_pending'
    )

    return updated
  }

  async releaseFunds(escrowId: string, toAddress: string | undefined, triggeredBy: string) {
    const { escrow, trade } = await loadEscrowWithAuthorization(escrowId, triggeredBy)
    assertEscrowTransition(escrow.status, 'COMPLETED')
    const resolvedToAddress = await resolvePayoutAddress(toAddress, trade.buyerId, escrow.asset)

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
    // one, both allowed by assertEscrowTransition above). An arbitrated release
    // already went through dispute.service.ts's own authorization
    // (only the assigned, TRUSTED_ARBITRATORS-configured arbiter may
    // call resolveDispute()) — requiring the original two counterparties
    // to *also* agree would defeat the point of arbitration existing at
    // all (if they could still agree, there'd be no dispute). Off by
    // default (config.features.requireDualApprovalForRelease) — see that
    // flag's own doc comment in config/index.ts.
    if (config.features.requireDualApprovalForRelease && escrow.status === 'PAYMENT_PENDING') {
      const dual = await dualApproval.hasDualApproval(escrowId)
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
    // straight after the in-memory `assertEscrowTransition` check above, with
    // no DB-level guard before it — two concurrent releaseFunds() calls
    // for the same escrow (a double-click, a client retrying after a
    // timeout that actually succeeded server-side, or a race between
    // executeSettlement()'s auto-settle path and a manual API call)
    // would both pass assertEscrowTransition before either write landed, and
    // both would go on to sign and broadcast a real transfer — an actual
    // double-payment, not a theoretical one. Fixed the same way
    // lockFunds() above now is: atomically claim COMPLETED via a
    // conditional `updateMany` *before* ever calling the provider, so a
    // concurrent loser is rejected before touching real funds, not after.
    await claimEscrowTransition(escrowId, escrow.status, 'COMPLETED')

    try {
      const provider = getSettlementProvider(escrow.type)
      const result = await provider.releaseFunds(
        { ...escrow, buyerId: trade.buyerId, sellerId: trade.sellerId, triggeredBy } as unknown as EscrowRecord,
        resolvedToAddress
      )

      // RFC-021 Phase 0 — real Protocol Fee (PROTOCOL_ECONOMY.md §3/§6.2).
      // "Only ever attaches to a completed Settlement" — computed here,
      // not in refundFunds() below, deliberately. config.settlement.
      // protocolFeeRate defaults to 0 (the documented bootstrap-phase
      // default), in which case feeCharged stays null and no
      // FeeDistribution row is created — a deployment that hasn't opted
      // into fees yet persists nothing extra.
      const feeCharged = await chargeProtocolFee(escrow)

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txReleaseId: result.txId, releasedAt: new Date(), feeCharged },
      })

      // NOTE: previously this method also updated Trade.status/completedAt AND
      // incremented User.totalTrades/totalVolumeBtc directly (reaching into
      // OpenP2P's and OpenReputation's domains). Both writes are now owned by
      // their respective modules, triggered by the event emitted below.
      await emitEscrowTransition(escrowId, escrow.tradeId, escrow.status, 'COMPLETED', triggeredBy, 'settlement.escrow.released', {
        txId: result.txId,
      })

      return updated
    } catch (err) {
      // Revert the claim — see lockFunds()'s identical comment. Critical
      // here specifically: without this, a failed release (provider
      // threw, e.g. RPC error) would leave the escrow permanently stuck
      // claiming COMPLETED with `txReleaseId: null` — funds neither
      // released nor recoverable through this service again.
      await revertEscrowStatus(escrowId, escrow.status)
      throw err
    }
  }

  async openDispute(escrowId: string, triggeredBy: string, reason: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    assertEscrowTransition(escrow.status, 'DISPUTED')

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
    await claimEscrowTransition(escrowId, escrow.status, 'DISPUTED')
    const updated = await prisma.escrow.findUnique({ where: { id: escrowId } })

    await emitEscrowTransition(
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
    const { escrow, trade } = await loadEscrowWithAuthorization(escrowId, triggeredBy)
    assertEscrowTransition(escrow.status, 'REFUNDED')

    // Same fix as releaseFunds() above, same reason: claim REFUNDED
    // atomically before ever calling the real, side-effecting provider.
    await claimEscrowTransition(escrowId, escrow.status, 'REFUNDED')

    try {
      const provider = getSettlementProvider(escrow.type)
      const result = await provider.refundFunds(
        { ...escrow, buyerId: trade.buyerId, sellerId: trade.sellerId, triggeredBy } as unknown as EscrowRecord
      )

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txReleaseId: result.txId },
      })

      await emitEscrowTransition(escrowId, escrow.tradeId, escrow.status, 'REFUNDED', triggeredBy, 'settlement.escrow.refunded', {
        txId: result.txId,
      })

      return updated
    } catch (err) {
      await revertEscrowStatus(escrowId, escrow.status)
      throw err
    }
  }

  // RFC-021 D9 (2026-08-02) — the direct-call half of SPLIT's real
  // settlement action, for providers in PROVIDERS that move funds
  // synchronously in one call (MOCK, WDK_USDT_EVM this pass). Mirrors
  // releaseFunds()/refundFunds() above exactly (same authorization check,
  // same atomic-claim-before-provider-call race protection) — only
  // reachable from DISPUTED (VALID_TRANSITIONS), since SPLIT has no
  // non-disputed happy path. See initiateSplit() (escrow-pending-tx.ts)
  // for the client-signature-collection equivalent (MULTISIG).
  async splitFunds(escrowId: string, buyerAddress: string | undefined, sellerAddress: string | undefined, buyerBps: number, triggeredBy: string) {
    if (!(buyerBps > 0 && buyerBps < 10000)) {
      throw new ValidationError('buyerBps must be strictly between 0 and 10000 for a real split — use release/refund for an all-or-nothing outcome')
    }
    const { escrow, trade } = await loadEscrowWithAuthorization(escrowId, triggeredBy)
    assertEscrowTransition(escrow.status, 'SPLIT')
    const resolvedBuyerAddress = await resolvePayoutAddress(buyerAddress, trade.buyerId, escrow.asset)
    const resolvedSellerAddress = await resolvePayoutAddress(sellerAddress, trade.sellerId, escrow.asset)

    const provider = getSettlementProvider(escrow.type)
    if (!provider.splitFunds) {
      throw new EscrowError(
        `Escrow type '${escrow.type}' does not support a SPLIT settlement action — see that provider's own splitFunds()/buildUnsignedSplit() comment for the specific reason (contract/protocol limitation, not a missing wire-up).`
      )
    }

    await claimEscrowTransition(escrowId, escrow.status, 'SPLIT')

    try {
      const result = await provider.splitFunds(
        { ...escrow, buyerId: trade.buyerId, sellerId: trade.sellerId, triggeredBy } as unknown as EscrowRecord,
        resolvedBuyerAddress,
        resolvedSellerAddress,
        buyerBps
      )

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txReleaseId: result.txIds.join(','), releasedAt: new Date() },
      })

      // Joined into the shared txId?: string field (SettlementEscrowStatusChangedEvent)
      // rather than widening that event's payload for the one settlement
      // action that can produce two transaction hashes instead of one.
      await emitEscrowTransition(escrowId, escrow.tradeId, escrow.status, 'SPLIT', triggeredBy, 'settlement.escrow.split', {
        txId: result.txIds.join(','),
      })

      return updated
    } catch (err) {
      await revertEscrowStatus(escrowId, escrow.status)
      throw err
    }
  }

  // ─── RFC-015 two-person control — thin delegates to escrow-dual-approval.ts ──
  async approveRelease(escrowId: string, approverId: string) {
    return dualApproval.approveRelease(escrowId, approverId)
  }

  async getReleaseApprovals(escrowId: string) {
    return dualApproval.getReleaseApprovals(escrowId)
  }

  async hasDualApproval(escrowId: string): Promise<boolean> {
    return dualApproval.hasDualApproval(escrowId)
  }

  // ─── Client-signature-collection flow — thin delegates to escrow-pending-tx.ts ──
  async initiateRelease(escrowId: string, toAddress: string | undefined, triggeredBy: string) {
    return pendingTx.initiateRelease(escrowId, toAddress, triggeredBy)
  }

  async initiateRefund(escrowId: string, triggeredBy: string) {
    return pendingTx.initiateRefund(escrowId, triggeredBy)
  }

  async initiateSplit(escrowId: string, buyerAddress: string | undefined, sellerAddress: string | undefined, buyerBps: number, triggeredBy: string) {
    return pendingTx.initiateSplit(escrowId, buyerAddress, sellerAddress, buyerBps, triggeredBy)
  }

  async submitTransactionSignature(escrowId: string, participantId: string, signedPsbtBase64: string) {
    return pendingTx.submitTransactionSignature(escrowId, participantId, signedPsbtBase64)
  }

  async getPendingTransaction(escrowId: string) {
    return pendingTx.getPendingTransaction(escrowId)
  }

  // `disputes` — real gap found while closing the arbiter's own dispute-
  // discovery gap (settlement.routes.ts's new GET /v1/settlement/disputes):
  // whoever CALLS raiseDispute() gets the created Dispute row directly in
  // that response, but the OTHER trade party — who didn't open it — had no
  // way to ever learn the disputeId at all. No listener reacts to
  // `dispute.opened` to push it over the trade's WebSocket room either.
  // `Escrow.disputes` (schema.prisma) already existed as a relation; this
  // just includes it, so the same public GET a trade party already polls
  // for escrow status now also answers "is there a dispute, and what's its
  // id" — no schema change, no new route needed.
  async getEscrow(escrowId: string) {
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { events: { orderBy: { createdAt: 'asc' } }, disputes: true },
    })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    return escrow
  }

  async getEscrowByTrade(tradeId: string) {
    const escrow = await prisma.escrow.findUnique({
      where: { tradeId },
      include: { events: { orderBy: { createdAt: 'asc' } }, disputes: true },
    })
    if (!escrow) throw new NotFoundError('Escrow for trade', tradeId)
    return escrow
  }

  // Real gap found (BACKLOG.md P0, "Escrow timelock proactive sweeper"):
  // lockFunds() computes and stores a real Escrow.expiresAt, but nothing
  // ever read it back — a FUNDS_LOCKED escrow whose counterparty never
  // returns stayed locked forever, with no automatic path back to
  // REFUNDED. This is the "notice time has passed" trigger that row
  // said was the only missing piece; refundFunds() itself already
  // existed and is reused unchanged below.
  //
  // triggeredBy is always the trade's own sellerId, never a fabricated
  // "system" actor — isSellerOrAssignedArbiter() only accepts the real
  // seller or an assigned arbiter (INV-OP-1), and a timelock refund
  // returns the seller their own locked collateral, the same effect the
  // seller could trigger themselves by calling this route directly once
  // expiresAt has passed. This mirrors settlement-orchestrator.ts's own
  // `sellerTriggeredBy` precedent for automated, non-human-initiated
  // calls into this same method.
  //
  // Per-escrow try/catch, same "one failure must not stop the rest"
  // shape as getAggregatedOffers() (liquidity.service.ts) — a single
  // stuck/already-transitioning escrow must not block every other
  // legitimately expired one in the same sweep.
  async sweepExpiredEscrows(): Promise<{ refunded: string[]; failed: Array<{ escrowId: string; error: string }> }> {
    const expired = await prisma.escrow.findMany({
      where: { status: 'FUNDS_LOCKED', expiresAt: { lt: new Date() } },
    })

    const refunded: string[] = []
    const failed: Array<{ escrowId: string; error: string }> = []

    for (const escrow of expired) {
      try {
        const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
        if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
        await this.refundFunds(escrow.id, trade.sellerId)
        refunded.push(escrow.id)
      } catch (err) {
        failed.push({ escrowId: escrow.id, error: err instanceof Error ? err.message : String(err) })
      }
    }

    return { refunded, failed }
  }
}

export const escrowService = new EscrowService()
