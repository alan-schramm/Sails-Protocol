/**
 * Dispute Service — Sails OpenSettlement
 * 04-Deepseek Review.md Task 2: raiseDispute()/resolveDispute().
 *
 * First real implementation of the Dispute primitive
 * (PROTOCOL_SPECIFICATION.md §1.9) — the primitive itself isn't new, only
 * its persistence and the escalation flow RFC-007 D4 already specified
 * (Trusted Arbitrator, not a protocol-native role).
 *
 * Deliberately built on the existing Postgres + EventStore (RFC-010)
 * architecture, not a CRDT document — reconciled directly with the user
 * before writing this file: a CRDT-based dispute state would create a
 * second, potentially divergent source of truth alongside `Trade`/
 * `Escrow`, exactly the risk RFC-011 was built to close for Postgres/P2P
 * consistency. "Freeze the trade and notify the arbitrator via pubsub"
 * (the task's own words) is achieved here without introducing CRDTs:
 * freezing = escrowService.openDispute() (already real code, transitions
 * Escrow to DISPUTED); pubsub = eventBus.emit('dispute.opened', ...)
 * (RFC-010's EventStore, already real).
 */
import { prisma } from '../../common/database'
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors'
import { eventBus } from '../../common/events/event-bus'
import { escrowService } from './escrow.service'
import { config } from '../../config'
import { TrustedArbitratorProvider, type ArbitrationProvider } from './arbitration-provider'
import { marketArbitrationProvider } from './market-arbitration.provider'
import { escrowRepository, type EscrowRepository } from './escrow-repository'
import { tradeRepository } from '../open-p2p/trade-repository'
import { isPartyOrAgent, asTrustedActor } from './escrow-lifecycle'
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../common/pagination'
import type { AssetType } from '../../common/types'
import type { EvidenceDescriptor, DisputeRuling } from '@satsails/p2p-schemas'
import type { DisputeStatus } from '@prisma/client'
import {
  verifyAuthorityDecisionSignature,
  assertExecutionMatchesAuthorization,
  type AuthorityDecisionPayload,
} from './arbitration-authority'

// RFC-021 D6 — appeal fee, PROTOCOL_ECONOMY.md §4.4's own arbitration-fee
// baseline (1-2% of the disputed amount, charged as Escrow.feeCharged by
// escrow.service.ts's Phase 0 fee collection) multiplied per round, the
// same "escalating cost discourages frivolous appeals" reasoning Kleros
// uses for its own appeal rounds.
//
// Real charge as of 2026-08-01 (BACKLOG.md P0, closed) — appeal() now
// persists this as a real DisputeAppealFee row, and resolveDispute()
// settles its outcome (FORFEITED on a denied/frivolous appeal, REFUNDED
// on an overturn). Same "computed and persisted, not actually routed
// on-chain" realness as the Protocol Fee accounting foundation already
// has (no SettlementProvider here has a real configured treasury/
// arbitrator-reserve address to send anything to). A real on-chain
// appeal-fee lock (the appellant actually posting collateral before the
// panel convenes) is a separate, larger undertaking blocked on the same
// missing treasury infrastructure the Protocol Fee itself already is —
// not attempted here.
export const APPEAL_FEE_MULTIPLIER = 2

export class DisputeService {
  constructor(private readonly arbitrationProvider: ArbitrationProvider, private readonly repo: EscrowRepository = escrowRepository) {}

  // Missão 11 Fase 7.3.1 §B — real P0 closed (Fase 7.3 audit): for an
  // escrow type whose settlement script immutably commits to a SPECIFIC
  // arbiter identity at creation time (MULTISIG today —
  // EscrowParticipantKey{role:'arbiter'}, write-once and DB-trigger-
  // protected, see that model's own migration), no OTHER identity is ever
  // cryptographically capable of executing a ruling on that script. Which
  // arbiter mode is configured (trusted-list round-robin, or market's
  // collateral-weighted draw) is irrelevant once a script commitment
  // exists — respecting it is not a policy choice, it is the only
  // outcome that can ever actually work. escrowParticipantKey is
  // deliberately NOT wrapped by EscrowRepository (a satellite table,
  // same deferred-scope decision documented in escrow-repository.ts's own
  // header), so this reads it directly, matching how this file already
  // reads Dispute/DisputeAppealFee via `prisma` rather than a repository.
  private async findCommittedArbiterId(escrowId: string): Promise<string | null> {
    const key = await prisma.escrowParticipantKey.findUnique({
      where: { escrowId_role: { escrowId, role: 'arbiter' } },
    })
    return key?.participantId ?? null
  }

  async raiseDispute(
    tradeId: string,
    raisedBy: string,
    reason: string,
    evidence: EvidenceDescriptor[] = []
  ) {
    const trade = await tradeRepository.findById(tradeId)
    if (!trade) throw new NotFoundError('Trade', tradeId)
    if (!trade.escrowId) throw new ValidationError(`Trade ${tradeId} has no escrow to dispute`)

    // CISO Byzantine Rule, applied here too: only the two actual
    // counterparties may raise a dispute on their own trade.
    if (raisedBy !== trade.buyerId && raisedBy !== trade.sellerId) {
      throw new ForbiddenError(`${raisedBy} is not a party to trade ${tradeId}`)
    }

    // Freezes the trade — escrow.service.ts's real, existing state
    // transition (Escrow -> DISPUTED), not new logic written here.
    await escrowService.openDispute(trade.escrowId, raisedBy, reason)

    // Security-validation round (2026-07-19, "disputa dupla" scenario):
    // this create() reads-then-writes across two calls (this one and
    // openDispute() above) with no locking — buyer and seller calling
    // raiseDispute() concurrently could both pass every check above
    // before either write lands. The schema's new @@unique([tradeId])
    // on Dispute (see that model's own comment) is the actual guard: the
    // loser of the race hits a real P2002 here, caught and turned into a
    // clean rejection instead of a second, corrupting Dispute row —
    // same pattern reputation.service.ts's rate() already established
    // for its own unique-constraint race.
    let dispute
    try {
      dispute = await prisma.dispute.create({
        data: {
          tradeId,
          escrowId: trade.escrowId,
          openedBy: raisedBy,
          reason,
          evidence: evidence as unknown as object,
          status: 'OPENED',
        },
      })
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ValidationError(`A dispute has already been raised for trade ${tradeId}`)
      }
      throw err
    }

    // Fase 7.3.1 §B — a script-committed arbiter identity always wins
    // over the configured ArbitrationProvider's own independent pick;
    // assign() is only ever consulted for an escrow type with no such
    // commitment (see findCommittedArbiterId()'s own comment above).
    const committedArbiterId = await this.findCommittedArbiterId(trade.escrowId)
    const arbiterId = committedArbiterId ?? (await this.arbitrationProvider.assign(dispute.id, tradeId))
    const updated = await prisma.dispute.update({
      where: { id: dispute.id },
      data: { arbiterId },
    })

    // Notification via pubsub (EventStore, RFC-010) — correlationId =
    // tradeId, the established convention for trade-lifecycle events.
    await eventBus.emit('dispute.opened', {
      disputeId: dispute.id,
      settlementId: trade.escrowId,
      tradeId,
      arbiterId,
      reason,
      triggeredBy: raisedBy,
    }, tradeId)

    return updated
  }

  /**
   * Missão 11 Fase 7.3.3 §D (CTO-selected: Model C + Model A) — the
   * explicit, guided participant recovery action for a MULTISIG escrow
   * whose timelock has genuinely expired (EscrowStatus.EXPIRED — see
   * schema.prisma's own comment and escrow.service.ts's
   * sweepExpiredEscrows()). Deliberately a THIN wrapper around the
   * already-existing raiseDispute() — invents no new authority, no new
   * signature, no new settlement mechanism. Its only real job is the
   * scenario-specific guard raiseDispute() itself doesn't have: requiring
   * the escrow to actually BE expired, and narrowing WHO may invoke it
   * for that specific reason.
   *
   * Authority (Fase 7.3.3 §C's own audit, not assumed): in the EXPIRED
   * state, the SELLER is the only party with real locked collateral at
   * stake — the buyer never paid on-chain and has no completed
   * obligation to enforce yet, so they have no legitimate expiry-recovery
   * claim (the general raiseDispute() endpoint remains available to
   * either party for any OTHER reason, unchanged). This does not
   * apply to a PAYMENT_PENDING escrow (a genuine payment dispute, where
   * the buyer may have the stronger claim) — VALID_TRANSITIONS never
   * lets a PAYMENT_PENDING escrow reach EXPIRED, so that state can never
   * reach this method at all.
   *
   * NO SERVER IMPERSONATION: raisedBy is always the real, authenticated
   * caller — never a fabricated or borrowed identity. NO SERVER CUSTODY
   * OF KEYS: this call persists a Dispute row and assigns an arbiter,
   * exactly like raiseDispute() always has — it never touches a
   * signature or a private key.
   */
  async initiateExpiryRecovery(escrowId: string, raisedBy: string) {
    const escrow = await this.repo.findById(escrowId)
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    if (escrow.status !== 'EXPIRED') {
      throw new ValidationError(
        `Escrow ${escrowId} is not in EXPIRED status (current: ${escrow.status}) — expiry recovery is only available once this escrow's own timelock has genuinely passed with no cooperative resolution.`
      )
    }

    const trade = await tradeRepository.findById(escrow.tradeId)
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!isPartyOrAgent(asTrustedActor(raisedBy), trade.sellerId)) {
      throw new ForbiddenError(
        `${raisedBy} is not the seller of trade ${trade.id} — expiry recovery for an EXPIRED escrow is a seller-only action, since the seller is the only party with locked collateral at stake in this state.`
      )
    }

    return this.raiseDispute(
      trade.id,
      raisedBy,
      'Escrow timelock expired with no cooperative resolution — seller-initiated expiry recovery (Missão 11 Fase 7.3.3).'
    )
  }

  async getDispute(disputeId: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)
    return dispute
  }

  // UI-audit gap (2026-08-03, sails-ui SLC audit relayed via the parallel
  // UI session): every existing read path here was scoped to a trade
  // party (getDispute by id above still has no participant check, same
  // "escrow.service.ts's getEscrow() is a public read" precedent), but
  // nothing let an arbiter discover which disputes are actually assigned
  // to them — the resolve/appeal/evidence/contest actions above were all
  // real and callable, they just had no corresponding fetch to find a
  // disputeId to call them with. This is that fetch: scoped to the
  // calling participant's own arbiterId only (never an arbitrary
  // `?arbiterId=` from the query string — same "scoped to whoever is
  // actually authenticated, not whoever the caller claims to be" rule
  // trade.service.ts's getTrades()/liquidity.service.ts's getMyOffers()
  // already follow), so this can't be used to enumerate another
  // arbiter's caseload.
  async listForArbiter(arbiterId: string, pagination?: { limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(pagination?.limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT)
    const offset = Math.max(pagination?.offset ?? 0, 0)

    const where = { arbiterId }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.dispute.count({ where }),
    ])

    return { disputes, total, hasMore: offset + disputes.length < total }
  }

  // Extracted from resolveDispute() (RFC-021 D8, 2026-08-02) so
  // sweepExpiredAutoResolutions() below can reuse the exact same
  // mechanical release/refund + revert-on-failure logic — including the
  // hard-won ordering fix in its own comment — without duplicating it.
  // Shared by both the human-ruling path and the QVAC auto-resolution
  // path; slashing/recordRuling/appeal-fee settlement are NOT here — those
  // are specific to a human arbiter's own track record and stay in
  // resolveDispute() itself.
  private async applyRuling(
    dispute: { id: string; escrowId: string; tradeId: string; status: string },
    ruling: DisputeRuling,
    releaseToAddress: string | undefined,
    triggeredBy: string,
    refundToAddress?: string,
    splitBuyerBps?: number,
    // Missão 13 Fase 2 — present only for a caller that has already
    // independently verified an authority decision (resolveDispute()).
    // Never populated by anything else — in particular,
    // sweepExpiredAutoResolutions() (below) no longer calls this method
    // at all, exactly because it has no verified authority to attach.
    authority?: { authoritySignature: string; authorityIssuedAt: Date; authorityBuyerBps: number | null }
  ) {
    // Real bug found by tests/fullTradeLifecycle.test.ts (end-to-end
    // chain, added investigating the CTO-role "validate the full flow"
    // follow-up): this used to call escrowService.releaseFunds()/
    // refundFunds() BEFORE marking the Dispute RESOLVED below. Those
    // calls emit settlement.escrow.released/refunded, which
    // common/events/handlers.ts reacts to with RFC-007 D8/D9's
    // dispute-aware branch — a query for a Dispute row with
    // `status: 'RESOLVED'` on this exact tradeId. That query always
    // raced this function's own not-yet-run update() below and lost:
    // every disputed resolution was silently scored as an ordinary
    // no-dispute outcome (both parties POSITIVE/NEUTRAL) instead of the
    // asymmetric win/loss RFC-007 D8/D9 specifies. Fixed by marking
    // RESOLVED first; if the fund movement then fails, the ruling is
    // reverted rather than left claiming a resolution that never
    // actually moved funds.
    const updated = await prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: 'RESOLVED',
        ruling,
        resolvedAt: new Date(),
        ...(authority
          ? {
              authoritySignature: authority.authoritySignature,
              authorityIssuedAt: authority.authorityIssuedAt,
              authorityBuyerBps: authority.authorityBuyerBps,
            }
          : {}),
      },
    })

    try {
      // Second real bug found while building SPLIT (RFC-021 D9,
      // 2026-08-02) — see escrowService.isSignatureCollectionType()'s own
      // comment for the full story: MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM
      // escrows need the client-signature-collection flow
      // (initiateRelease/initiateRefund/initiateSplit), not the direct
      // releaseFunds()/refundFunds()/splitFunds() calls those types'
      // providers throw "not directly callable" from. Applies uniformly to
      // all three rulings now, not just the new one.
      const escrow = await this.repo.findById(dispute.escrowId)
      if (!escrow) throw new NotFoundError('Escrow', dispute.escrowId)
      const needsSignatureCollection = escrowService.isSignatureCollectionType(escrow.type)

      if (ruling === 'RELEASE') {
        if (needsSignatureCollection) {
          await escrowService.initiateRelease(dispute.escrowId, releaseToAddress, triggeredBy)
        } else {
          await escrowService.releaseFunds(dispute.escrowId, releaseToAddress, triggeredBy)
        }
      } else if (ruling === 'REFUND') {
        if (needsSignatureCollection) {
          await escrowService.initiateRefund(dispute.escrowId, triggeredBy)
        } else {
          await escrowService.refundFunds(dispute.escrowId, triggeredBy)
        }
      } else if (ruling === 'SPLIT') {
        // RFC-021 D9 — the third §1.9 option finally has a real settlement
        // action, for the escrow types that can actually represent a
        // partial payout (MOCK, WDK_USDT_EVM, MULTISIG). SAFE_GUARD_EVM's
        // immutable Guard contract and LIGHTNING_HODL's fixed-leaf
        // VtxoScript each have a real, provider-specific reason they
        // can't — see their own buildUnsignedSplit() overrides — surfaced
        // here as a normal thrown error (reverting this ruling below), not
        // silently no-op'd. releaseToAddress/refundToAddress are no longer
        // validated here (2026-08-04) — escrowService.initiateSplit()/
        // splitFunds() resolve missing addresses against each party's own
        // registered PayoutAddress and throw their own clear error only if
        // that also comes up empty.
        if (splitBuyerBps === undefined) {
          throw new ValidationError('SPLIT requires splitBuyerBps')
        }
        if (needsSignatureCollection) {
          await escrowService.initiateSplit(dispute.escrowId, releaseToAddress, refundToAddress, splitBuyerBps, triggeredBy)
        } else {
          await escrowService.splitFunds(dispute.escrowId, releaseToAddress, refundToAddress, splitBuyerBps, triggeredBy)
        }
      }
    } catch (err) {
      await prisma.dispute.update({
        where: { id: dispute.id },
        data: {
          status: dispute.status as DisputeStatus,
          ruling: null,
          resolvedAt: null,
          // Missão 13 Fase 2 — a reverted ruling never leaves a verified
          // authority decision attached to a dispute that in fact never
          // settled; the arbiter must re-submit (their real decision may
          // legitimately change once the underlying failure is understood).
          ...(authority ? { authoritySignature: null, authorityIssuedAt: null, authorityBuyerBps: null } : {}),
        },
      })
      throw err
    }

    await eventBus.emit('dispute.resolved', {
      disputeId: dispute.id,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      ruling,
      triggeredBy,
    }, dispute.tradeId)

    return updated
  }

  async resolveDispute(
    disputeId: string,
    arbiterId: string,
    ruling: DisputeRuling,
    // Buyer's payout address for RELEASE/SPLIT. Optional as of
    // 2026-08-04 (BACKLOG.md's "Participant payout address" gap,
    // closed): if omitted, escrowService.releaseFunds()/splitFunds()'s
    // own resolvePayoutAddress() falls back to the buyer's registered
    // PayoutAddress for the escrow's asset, throwing its own clear error
    // only if neither exists — this method no longer pre-validates
    // presence, since "missing" is no longer necessarily an error.
    releaseToAddress: string | undefined,
    // RFC-021 D9 (2026-08-02) — seller's payout address for SPLIT only
    // (mirrors releaseToAddress's buyer role), same fallback as above.
    // splitBuyerBps has no such fallback — it's a ruling decision, not an
    // address, so it's still required up front for SPLIT.
    refundToAddress: string | undefined,
    splitBuyerBps: number | undefined,
    // Missão 13 Fase 2 — INV-12 closure. Required, never optional: the
    // caller-supplied `arbiterId` above is only an identity CLAIM,
    // authenticated no more strongly than the session token that made
    // this HTTP request — exactly the gap Missão 12/13 found (the
    // "record of decision" lived only in this server's own database,
    // never independently checkable). `authoritySignature` must verify
    // against `arbiterId`'s own already-registered `User.publicKey`
    // (arbitration-authority.ts, the same Ed25519 identity every
    // participant already has — no new key type) over the EXACT economic
    // disposition being requested here. `authorityIssuedAt` is the
    // client-signed timestamp bound into that same signature — passed
    // separately because it must be supplied verbatim to reconstruct the
    // canonical string that was actually signed.
    authoritySignature: string,
    authorityIssuedAt: string
  ) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)
    if (dispute.status === 'RESOLVED') {
      throw new ValidationError(`Dispute ${disputeId} is already resolved`)
    }
    if (dispute.arbiterId !== arbiterId) {
      throw new ForbiddenError(`${arbiterId} is not the arbiter assigned to dispute ${disputeId}`)
    }

    if (ruling === 'SPLIT' && splitBuyerBps === undefined) {
      throw new ValidationError('splitBuyerBps is required when ruling is SPLIT')
    }

    // FAIL CLOSED — no path below this point ever falls back to trusting
    // the bare `ruling`/`arbiterId` request body on its own. Missão 13
    // Fase 2 Task 12's own explicit prohibition: "no fallback to DB
    // assertion... if signature missing, trust stored outcome" is exactly
    // the violation this closes.
    const authority = await prisma.user.findUnique({ where: { id: arbiterId } })
    if (!authority) throw new NotFoundError('User', arbiterId)

    const payload: AuthorityDecisionPayload = {
      disputeId,
      escrowId: dispute.escrowId,
      appealRound: dispute.appealRound,
      authorityId: arbiterId,
      outcome: ruling,
      buyerBps: ruling === 'SPLIT' ? splitBuyerBps! : null,
      issuedAt: authorityIssuedAt,
    }
    const sigValid = verifyAuthorityDecisionSignature(payload, authoritySignature, authority.publicKey)
    if (!sigValid) {
      throw new ForbiddenError(
        `Authority decision signature does not verify against ${arbiterId}'s registered public key for dispute ${disputeId} — ` +
        'refusing to execute a discretionary settlement attributed to an authorization that cannot be independently verified (INV-12).'
      )
    }
    // Execution-correspondence boundary (Missão 13 Fase 2 Task 13) — the
    // single place every path that attributes a disposition to a
    // discretionary authority checks it, before any settlement call.
    // Here `payload` IS `requested` (they were built from the same
    // values) — the check still runs so this remains the one function
    // every caller goes through, not a special-cased inline comparison.
    assertExecutionMatchesAuthorization(payload, payload)

    const updated = await this.applyRuling(
      dispute,
      ruling,
      releaseToAddress,
      arbiterId,
      refundToAddress,
      splitBuyerBps,
      { authoritySignature, authorityIssuedAt: new Date(authorityIssuedAt), authorityBuyerBps: payload.buyerBps }
    )

    // RFC-021 D6/D4 — feeds the arbiter's track record on every real
    // resolution, correct or not (optional: only market mode has an
    // ArbiterProfile to update; trusted-list mode silently skips this).
    // feeObserved reads the escrow fresh — a RELEASE ruling's
    // escrowService.releaseFunds() call above has already computed and
    // persisted Escrow.feeCharged (Phase 0) by this point; REFUND never
    // charges a fee, so this is correctly undefined for those.
    if (this.arbitrationProvider.recordRuling) {
      const resolvedEscrow = await this.repo.findById(dispute.escrowId)
      const feeObserved = resolvedEscrow?.feeCharged ? String(resolvedEscrow.feeCharged) : undefined
      await this.arbitrationProvider.recordRuling(arbiterId, feeObserved)
    }

    // RFC-021 D6 — an appeal round reversing the ruling being appealed is
    // real evidence the original arbiter got it wrong; slash them.
    // `dispute` here is the pre-update fetch at the top of this method,
    // so previousRuling/previousArbiterId still reflect whatever appeal()
    // set them to before this resolution — untouched by the RESOLVED
    // write above. If the appeal panel reaches the SAME ruling, the
    // appeal is denied and nothing is slashed (the requester's already-
    // computed appealFeeRequired was the real cost of a frivolous
    // appeal).
    if (
      dispute.previousRuling &&
      dispute.previousRuling !== ruling &&
      dispute.previousArbiterId &&
      this.arbitrationProvider.slash
    ) {
      await this.arbitrationProvider.slash(dispute.previousArbiterId)
    }

    // RFC-021 D6 — real appeal-fee settlement, closing the "computed and
    // returned but never collected" gap (appeal()'s own doc comment,
    // BACKLOG.md). Only appealed disputes (appealRound > 0) have a fee
    // row to settle at all. Same comparison the slashing check above
    // already makes: the appeal panel reaching the SAME ruling means the
    // appeal was denied (frivolous) — FORFEITED, the real cost this fee
    // exists to impose; a different ruling means the appellant was right
    // to appeal — REFUNDED. Real bookkeeping, not a simulated one — same
    // "computed and persisted, not actually routed on-chain" precedent
    // the Protocol Fee accounting foundation already established: no
    // SettlementProvider here has a real configured treasury/arbitrator-
    // reserve address to move anything to.
    if (dispute.appealRound > 0) {
      const outcome = dispute.previousRuling && dispute.previousRuling !== ruling ? 'REFUNDED' : 'FORFEITED'
      await prisma.disputeAppealFee.updateMany({
        where: { disputeId, appealRound: dispute.appealRound, outcome: null },
        data: { outcome, settledAt: new Date() },
      })
    }

    return updated
  }

  /**
   * RFC-021 D6 — reopens a RESOLVED dispute for a new arbiter, drawn from
   * a reputation-weighted appeal panel (assignAppealPanel(), growing with
   * round count). Only meaningful under ARBITRATION_MODE=market — the
   * configured provider must implement assignAppealPanel(); a
   * TrustedArbitratorProvider deployment gets a clear config error
   * instead of a silent no-op.
   */
  async appeal(disputeId: string, requestedBy: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)
    if (dispute.status !== 'RESOLVED') {
      throw new ValidationError(
        `Dispute ${disputeId} cannot be appealed from status ${dispute.status} — only a RESOLVED dispute can be appealed`
      )
    }

    const trade = await tradeRepository.findById(dispute.tradeId)
    if (!trade) throw new NotFoundError('Trade', dispute.tradeId)
    if (requestedBy !== trade.buyerId && requestedBy !== trade.sellerId) {
      throw new ForbiddenError(`${requestedBy} is not a party to trade ${dispute.tradeId}`)
    }

    // Fase 7.3.1 §B — an escrow whose script committed one specific
    // arbiter identity at creation time cannot ever be reassigned to a
    // different one: no signature from any other identity will validate
    // against that script, appeal panel or not. This is a cryptographic
    // fact, not an arbitration-mode setting, so it is checked before (and
    // independently of) the assignAppealPanel/market-mode check below.
    const committedArbiterId = await this.findCommittedArbiterId(dispute.escrowId)
    if (committedArbiterId) {
      throw new ValidationError(
        `Dispute ${disputeId}'s escrow has an immutable, script-committed arbiter identity (${committedArbiterId}) — ` +
        'this settlement rail cannot reassign arbitration authority to a different identity after the fact, so no ' +
        'appeal panel could ever produce a ruling capable of executing. Appeals are only supported for escrow types ' +
        'with no pre-committed signing arbiter.'
      )
    }

    if (!this.arbitrationProvider.assignAppealPanel) {
      throw new ValidationError(
        `Appeals require ARBITRATION_MODE=market — ${this.arbitrationProvider.name} does not support appeal panels`
      )
    }

    const nextRound = dispute.appealRound + 1
    const newArbiterId = await this.arbitrationProvider.assignAppealPanel(
      disputeId,
      dispute.tradeId,
      nextRound,
      dispute.arbiterId ?? undefined
    )

    const escrow = await this.repo.findById(dispute.escrowId)
    const baseFee = escrow?.feeCharged ? Number(escrow.feeCharged) : 0
    const appealFeeRequired = (baseFee * APPEAL_FEE_MULTIPLIER).toFixed(8)

    // Real charge, not just a computed-and-returned number — closes the
    // gap this file's own header comment on APPEAL_FEE_MULTIPLIER used
    // to disclose ("this service does not itself collect payment").
    // resolveDispute() settles this row's outcome (FORFEITED/REFUNDED)
    // once the appeal panel rules. @@unique([disputeId, appealRound]) on
    // the model means a concurrent double-appeal for the same round
    // fails here with a real P2002 rather than double-charging.
    await prisma.disputeAppealFee.create({
      data: {
        disputeId,
        appealRound: nextRound,
        requestedBy,
        amount: appealFeeRequired,
        asset: (escrow?.asset ?? 'BTC') as AssetType,
      },
    })

    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'APPEALED',
        appealRound: nextRound,
        previousRuling: dispute.ruling,
        previousArbiterId: dispute.arbiterId,
        arbiterId: newArbiterId,
        ruling: null,
        resolvedAt: null,
      },
    })

    await eventBus.emit('dispute.appealed', {
      disputeId,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      round: nextRound,
      newArbiterId,
      previousArbiterId: dispute.arbiterId,
      triggeredBy: requestedBy,
    }, dispute.tradeId)

    return { dispute: updated, appealFeeRequired }
  }

  /**
   * RFC-021 D8 — either trade party may attach more evidence to their own
   * open dispute after it's been raised (raiseDispute()'s own `evidence`
   * param only covers what existed at open time). Finally makes
   * `DisputeStatus.EVIDENCE_SUBMITTED` reachable — it has existed in the
   * schema since the Dispute primitive was first built but no code path
   * ever produced it before this. Emits `dispute.evidence_submitted`,
   * which `common/events/handlers.ts` reacts to by attempting a QVAC
   * auto-resolution pass (config-gated, `qvacAutoResolutionEnabled`) —
   * this method itself has no QVAC dependency, matching this codebase's
   * module-boundary convention of reacting to events rather than one
   * module calling into another's service directly.
   */
  async submitEvidence(disputeId: string, submittedBy: string, descriptor: Pick<EvidenceDescriptor, 'type' | 'uri' | 'note'>) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)

    const trade = await tradeRepository.findById(dispute.tradeId)
    if (!trade) throw new NotFoundError('Trade', dispute.tradeId)
    if (submittedBy !== trade.buyerId && submittedBy !== trade.sellerId) {
      throw new ForbiddenError(`${submittedBy} is not a party to trade ${dispute.tradeId}`)
    }

    if (dispute.status !== 'OPENED' && dispute.status !== 'EVIDENCE_SUBMITTED') {
      throw new ValidationError(`Dispute ${disputeId} cannot accept new evidence from status ${dispute.status}`)
    }

    const entry: EvidenceDescriptor = { ...descriptor, submittedBy, submittedAt: new Date().toISOString() }
    const existing = Array.isArray(dispute.evidence) ? (dispute.evidence as unknown as EvidenceDescriptor[]) : []

    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: { evidence: [...existing, entry] as unknown as object, status: 'EVIDENCE_SUBMITTED' },
    })

    await eventBus.emit('dispute.evidence_submitted', {
      disputeId,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      triggeredBy: submittedBy,
    }, dispute.tradeId)

    return updated
  }

  /**
   * RFC-021 D8 — called by the `dispute.evidence_submitted` event handler
   * once QVAC has produced a confident recommendation. Never called with
   * `recommendation: 'INCONCLUSIVE'` or below-threshold confidence — the
   * event handler filters those out before reaching here, so a dispute
   * simply stays on its normal human-arbiter path with no trace of a
   * failed automation attempt. The atomic claim below (same idiom
   * escrow.service.ts's lockFunds() established) means a human arbiter
   * who already resolved or appealed this dispute always wins the race —
   * this never overwrites a real decision, it can only ever act on a
   * dispute still genuinely open.
   */
  async proposeAutoResolution(disputeId: string, recommendation: 'RELEASE' | 'REFUND', confidence: number, reasoning: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)

    const deadline = new Date(Date.now() + config.settlement.qvacAutoResolutionWindowHours * 3600 * 1000)

    const claim = await prisma.dispute.updateMany({
      where: { id: disputeId, status: { in: ['OPENED', 'EVIDENCE_SUBMITTED'] }, ruling: null },
      data: {
        status: 'AUTO_PROPOSED',
        autoResolutionRecommendation: recommendation,
        autoResolutionConfidence: confidence,
        autoResolutionReasoning: reasoning,
        autoResolutionDeadline: deadline,
      },
    })
    if (claim.count === 0) return null // lost the race to a real human decision — not an error

    await eventBus.emit('dispute.auto_resolution_proposed', {
      disputeId,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      recommendation,
      confidence,
      deadline: deadline.toISOString(),
      triggeredBy: 'qvac-auto',
    }, dispute.tradeId)

    return prisma.dispute.findUnique({ where: { id: disputeId } })
  }

  /**
   * RFC-021 D8 — either trade party can reject a proposed automated
   * ruling at any point before its deadline, forcing the dispute back
   * onto its already-assigned human arbiter (assigned back at
   * raiseDispute() time and never touched by the auto-resolution
   * attempt) — no new arbiter assignment needed, matching D1's "the
   * market/parties decide, not software unilaterally" framing.
   */
  async contestAutoResolution(disputeId: string, contestedBy: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundError('Dispute', disputeId)

    const trade = await tradeRepository.findById(dispute.tradeId)
    if (!trade) throw new NotFoundError('Trade', dispute.tradeId)
    if (contestedBy !== trade.buyerId && contestedBy !== trade.sellerId) {
      throw new ForbiddenError(`${contestedBy} is not a party to trade ${dispute.tradeId}`)
    }

    if (dispute.status !== 'AUTO_PROPOSED') {
      throw new ValidationError(`Dispute ${disputeId} has no pending automated resolution to contest (status: ${dispute.status})`)
    }
    if (dispute.autoResolutionDeadline && dispute.autoResolutionDeadline.getTime() < Date.now()) {
      throw new ValidationError(`Dispute ${disputeId}'s contest window has already closed`)
    }

    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'EVIDENCE_SUBMITTED',
        autoResolutionRecommendation: null,
        autoResolutionConfidence: null,
        autoResolutionReasoning: null,
        autoResolutionDeadline: null,
      },
    })

    await eventBus.emit('dispute.auto_resolution_contested', {
      disputeId,
      settlementId: dispute.escrowId,
      tradeId: dispute.tradeId,
      contestedBy,
      triggeredBy: contestedBy,
    }, dispute.tradeId)

    return updated
  }

  /**
   * RFC-021 D8, DOWNGRADED TO ADVISORY-ONLY — Missão 13 Fase 2, INV-12.
   *
   * Before this phase, an uncontested QVAC recommendation was applied
   * automatically via `applyRuling()`, using the already-assigned human
   * arbiter's own slot/execution key — with no cryptographic record that
   * the arbiter personally authorized THIS specific automated outcome.
   * Missão 12/13 found this to be exactly the failure `INV-12` (Attributed
   * Authority Integrity) exists to close: the settlement it produced was
   * indistinguishable on-chain from a real human ruling, attributed to an
   * arbiter who never actually signed anything for that instance.
   *
   * `resolveDispute()` now REQUIRES a verified signature from the
   * assigned arbiter's own identity key for every execution — a bar this
   * function has no way to satisfy on its own (there is, by construction,
   * no human present at the moment an uncontested window expires; that
   * was the entire point of automating it). Rather than fabricate an
   * attribution (having the server sign "on the arbiter's behalf" would
   * reproduce the identical violation under a different name — explicitly
   * forbidden, Missão 13 Fase 2 Task 16), this sweep no longer executes
   * ANY settlement. It reverts an expired, uncontested `AUTO_PROPOSED`
   * dispute back to `EVIDENCE_SUBMITTED` — the same transition
   * `contestAutoResolution()` already performs — so the already-assigned
   * arbiter reviews and produces a real, verifiable decision. The
   * recommendation/confidence/reasoning QVAC already computed are left in
   * place as context for that arbiter, not erased.
   *
   * A future, separate pass may reintroduce automated EXECUTION under a
   * genuine scoped, signed delegation from the human arbiter (Missão 13
   * Fase 1's Q2 model) — deliberately not attempted here per this
   * mission's own QVAC STOP GATE ("acceptable to downgrade QVAC to
   * ADVISORY... correct attribution is more important than preserving
   * automation").
   */
  async sweepExpiredAutoResolutions(): Promise<{ revertedToHuman: string[]; failed: Array<{ disputeId: string; error: string }> }> {
    const expired = await prisma.dispute.findMany({
      where: { status: 'AUTO_PROPOSED', autoResolutionDeadline: { lt: new Date() } },
    })

    const revertedToHuman: string[] = []
    const failed: Array<{ disputeId: string; error: string }> = []
    for (const dispute of expired) {
      try {
        await prisma.dispute.update({
          where: { id: dispute.id },
          data: { status: 'EVIDENCE_SUBMITTED', autoResolutionDeadline: null },
        })
        await eventBus.emit('dispute.auto_resolution_contested', {
          disputeId: dispute.id,
          settlementId: dispute.escrowId,
          tradeId: dispute.tradeId,
          contestedBy: 'window-expired-advisory-only',
          triggeredBy: 'window-expired-advisory-only',
        }, dispute.tradeId)
        revertedToHuman.push(dispute.id)
      } catch (err) {
        failed.push({ disputeId: dispute.id, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return { revertedToHuman, failed }
  }
}

// Lazy singleton — constructed on first use, not at module load, so a
// deployment with neither arbitration mode configured can still boot and
// serve every other route/handler; only dispute-touching code paths fail,
// with a clear config error instead of the whole process refusing to
// start. Moved here (2026-08-02, RFC-021 D8) from settlement.routes.ts,
// which held the only previous copy — common/events/handlers.ts's new
// dispute.evidence_submitted reaction and app.ts's new sweeper interval
// both need the exact same instance a route handler would get, not a
// second, independently-constructed one.
//
// RFC-021 D2 — config.settlement.arbitrationMode picks between the two
// real ArbitrationProvider implementations: 'trusted-list' (RFC-007 D4's
// original, curated TRUSTED_ARBITRATORS allowlist) and 'market' (RFC-021's
// permissionless, collateral-and-reputation-weighted registry).
let disputeServiceInstance: DisputeService | null = null
export function getDisputeService(): DisputeService {
  if (!disputeServiceInstance) {
    if (config.settlement.arbitrationMode === 'market') {
      disputeServiceInstance = new DisputeService(marketArbitrationProvider)
    } else {
      if (config.settlement.trustedArbitrators.length === 0) {
        throw new ValidationError('No trusted arbitrators configured — set TRUSTED_ARBITRATORS (RFC-007 D4)')
      }
      disputeServiceInstance = new DisputeService(new TrustedArbitratorProvider(config.settlement.trustedArbitrators))
    }
  }
  return disputeServiceInstance
}
