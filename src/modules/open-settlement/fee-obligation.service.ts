/**
 * FeeObligationService — Missão 11 Fase 2.2 (foundation) / Fase 3
 * (settlement-lifecycle integration).
 *
 * STILL NO REAL COLLECTION. recordObligationForEscrowSettlement() below is
 * the ONE centralized function every real settlement path (direct-call
 * releaseFunds()/refundFunds()/splitFunds() in escrow.service.ts, AND the
 * signature-collection finalize path submitTransactionSignature() in
 * escrow-pending-tx.ts) now calls — Fase 3 §7's explicit requirement: one
 * economic semantics, not two implementations that could silently diverge.
 * It only ever computes and PERSISTS an economic determination
 * (OWED/NOT_APPLICABLE) and, for OWED, a basisAmount/computedFee — it never
 * deducts anything from a payout, never touches a transaction output, never
 * moves funds, and never sets collectionStatus past PENDING_COLLECTION (or
 * WAIVED, for a fixture-only test rule — see evaluateSmallTradeRuleFixtureOnly
 * below). config.settlement.protocolFeeRate and chargeProtocolFee()
 * (RFC-021 Phase 0) are completely unrelated and untouched — see this
 * module's own Fase 3 report for the full old/new-mechanism coexistence
 * analysis.
 *
 * Legacy rule (Fase 3 §2): an escrow with Escrow.feePolicyVersionId === null
 * gets no FeeObligation at all — recordObligationForEscrowSettlement() is a
 * silent, safe no-op for these, not an error. This is also, today, the
 * REAL, unconditional behavior for every escrow in production: nothing yet
 * calls escrow-fee-snapshot.service.ts's snapshotEscrowFeePolicy() from
 * createEscrow() (that wiring is explicitly not part of this phase either),
 * so `escrow.feePolicyVersionId` is null for every escrow that exists today
 * outside this module's own isolated tests.
 */
import {
  feeObligationRepository,
  VALID_COLLECTION_TRANSITIONS,
  type FeeObligationRepository,
  type FeeCollectionStatus,
} from './fee-obligation-repository'
import { feePolicyVersionRepository, type FeePolicyVersionRepository } from './fee-policy-repository'
import { computeProtocolFee } from './fee-reserve-math'
import { EscrowError } from '../../common/errors'
import { Prisma } from '@prisma/client'
import type { AssetType } from '../../common/types'
import { childLogger } from '../../common/logger'

const log = childLogger('fee-obligation')

// Fase 1.2 §1 (CTO-approved) / Fase 2.2 §1 — the accepted trigger semantics:
// a settlement outcome that delivers value to the seller is OWED; one that
// returns capital to the buyer is NOT_APPLICABLE. Kept as an explicit,
// named type here (not inferred from a boolean) so a future outcome this
// mapping doesn't yet cover fails loudly rather than defaulting silently.
export type SettlementOutcome =
  | 'RELEASE'
  | 'FULL_REFUND'
  | 'SPLIT'
  | 'DISPUTE_SELLER_WINS'
  | 'DISPUTE_BUYER_WINS'

const OWED_OUTCOMES: ReadonlySet<SettlementOutcome> = new Set(['RELEASE', 'SPLIT', 'DISPUTE_SELLER_WINS'])

export interface CreateObligationInput {
  escrowId: string
  feePolicyVersionId: string
  outcome: SettlementOutcome
  /** The seller-delivered value this outcome represents — ignored/absent for
   *  NOT_APPLICABLE outcomes. Caller-supplied, never computed here. */
  basisAmount?: Prisma.Decimal | string
  computedFee?: Prisma.Decimal | string
  asset?: AssetType
}

/** The minimal Escrow shape this module needs — matches the fields already
 *  loaded at every real call site (escrow.service.ts/escrow-pending-tx.ts
 *  both already have the full Escrow row in hand). */
export interface EscrowForFeeObligation {
  id: string
  lockedAmount: Prisma.Decimal | string
  asset: AssetType
  feePolicyVersionId: string | null
  snapshotProtocolFeeRate: Prisma.Decimal | string | null
}

// Fase 3 §4 — the infrastructure must be ABLE to represent WAIVED, but no
// real policy may activate it while real economic parameters (Fmin,
// dust-safety anchoring, etc. — Fase 1.2 §5) haven't been chosen. This
// evaluator recognizes exactly ONE clearly-fictional shape
// (`{ fixtureOnlyMinimum: "<decimal string>" }`) purely so this module's own
// tests can exercise the WAIVED transition — any other shape, including the
// real default `{}`, NEVER waives. This is not a commercial floor design;
// see Fase 1.2 §5 for that (still-undecided) real design.
function evaluateSmallTradeRuleFixtureOnly(smallTradeRule: unknown, computedFee: Prisma.Decimal): 'APPLY' | 'WAIVE' {
  if (
    smallTradeRule &&
    typeof smallTradeRule === 'object' &&
    'fixtureOnlyMinimum' in (smallTradeRule as Record<string, unknown>) &&
    typeof (smallTradeRule as Record<string, unknown>).fixtureOnlyMinimum === 'string'
  ) {
    const minimum = new Prisma.Decimal((smallTradeRule as Record<string, string>).fixtureOnlyMinimum)
    if (computedFee.lessThan(minimum)) return 'WAIVE'
  }
  return 'APPLY'
}

export class FeeObligationService {
  constructor(
    private readonly repo: FeeObligationRepository = feeObligationRepository,
    private readonly policyRepo: FeePolicyVersionRepository = feePolicyVersionRepository
  ) {}

  async createObligationForSettlement(input: CreateObligationInput) {
    if (OWED_OUTCOMES.has(input.outcome)) {
      if (input.basisAmount === undefined || input.computedFee === undefined || input.asset === undefined) {
        throw new EscrowError(`createObligationForSettlement: OWED outcome ${input.outcome} requires basisAmount, computedFee, and asset.`)
      }
      return this.repo.createOwed({
        escrowId: input.escrowId,
        feePolicyVersionId: input.feePolicyVersionId,
        economicDetermination: 'OWED',
        basisAmount: input.basisAmount,
        computedFee: input.computedFee,
        asset: input.asset,
      })
    }

    return this.repo.createNotApplicable({
      escrowId: input.escrowId,
      feePolicyVersionId: input.feePolicyVersionId,
      economicDetermination: 'NOT_APPLICABLE',
    })
  }

  async findByEscrowId(escrowId: string) {
    return this.repo.findByEscrowId(escrowId)
  }

  /**
   * Validates the transition against VALID_COLLECTION_TRANSITIONS BEFORE
   * attempting the atomic repository-level claim — a transition not present
   * in the graph fails fast with a clear error rather than silently
   * returning "0 rows affected" indistinguishable from a lost race.
   */
  async transitionCollectionStatus(id: string, fromStatus: FeeCollectionStatus, toStatus: FeeCollectionStatus): Promise<void> {
    const allowed = VALID_COLLECTION_TRANSITIONS[fromStatus] ?? []
    if (!allowed.includes(toStatus)) {
      throw new EscrowError(`Invalid FeeObligation collectionStatus transition: ${fromStatus} -> ${toStatus}`)
    }
    const affected = await this.repo.claimCollectionStatusTransition(id, fromStatus, toStatus)
    if (affected === 0) {
      throw new EscrowError(`FeeObligation ${id} was not in status ${fromStatus} — a concurrent transition already moved it.`)
    }
  }

  /**
   * THE single centralized settlement-economic-outcome function (Fase 3
   * §7). Every real settlement finalization path — direct-call
   * (escrow.service.ts) and signature-collection (escrow-pending-tx.ts) —
   * calls this exact method with the exact same outcome vocabulary, so a
   * dispute-driven RELEASE and a happy-path RELEASE (both already dispatch
   * to the identical releaseFunds()/initiateRelease() code, confirmed by
   * direct reading of dispute.service.ts's applyRuling()) produce the
   * identical economic determination without this function needing to
   * know or care which one it was.
   *
   * basisAmount rule (CTO-decided, Fase 3 kickoff): a valuation of the
   * trade's settled notional value, independent of which wallet address
   * physically receives the escrowed asset —
   *   RELEASE / DISPUTE_SELLER_WINS -> full lockedAmount
   *   SPLIT                          -> lockedAmount × (10000 − buyerBps) / 10000
   *   FULL_REFUND / DISPUTE_BUYER_WINS -> not computed (NOT_APPLICABLE)
   *
   * Safety decision (Fase 3 §6/§9): by the time this is called, the real
   * settlement (fund movement) has ALREADY happened — this function's own
   * job is strictly secondary accounting. A duplicate-obligation error
   * (the expected shape of "retry after a already-successful settlement")
   * is caught and treated as an idempotent no-op. Any OTHER unexpected
   * error is logged and swallowed, never thrown — this deliberately never
   * risks aborting/reverting a settlement whose real funds already moved,
   * for the sake of a still non-collecting, secondary accounting write.
   * (See escrow-fee-obligation-reconciliation.ts, Fase 3 §5, for how a
   * write that silently failed here gets detected later — on purpose, not
   * silently auto-corrected.)
   */
  async recordObligationForEscrowSettlement(
    escrow: EscrowForFeeObligation,
    outcome: 'RELEASE' | 'FULL_REFUND' | 'SPLIT',
    splitBuyerBps?: number,
    // Missão 11 Fase 4 §J — when a real settlement path already computed
    // and built a concrete fee decision into an actual transaction
    // (multisig.provider.ts's buildUnsignedRelease()/buildUnsignedSplit(),
    // via escrow-pending-tx.ts), pass it here so the recorded obligation
    // is guaranteed to match what was physically constructed, rather than
    // an independent second computation that could theoretically diverge.
    // Absent for the direct-call providers (MOCK/WDK_USDT_EVM), which have
    // no Bitcoin-style dust/collection-address concept — those fall back
    // to the generic, fixture-only small-trade rule below, unchanged from
    // Fase 3.
    actualCollection?: { feeSats: number; waived: boolean } | null
  ): Promise<void> {
    if (!escrow.feePolicyVersionId) return // legacy — no policy regime, no obligation, ever (Fase 3 §2/§8)

    try {
      const existing = await this.repo.findByEscrowId(escrow.id)
      if (existing) {
        log.info({ msg: 'FeeObligation already exists for escrow — idempotent no-op (retry-safe)', escrowId: escrow.id })
        return
      }

      if (outcome === 'FULL_REFUND') {
        await this.createObligationForSettlement({
          escrowId: escrow.id,
          feePolicyVersionId: escrow.feePolicyVersionId,
          outcome: 'FULL_REFUND',
        })
        return
      }

      if (!escrow.snapshotProtocolFeeRate) {
        // Structurally shouldn't happen — feePolicyVersionId and the
        // scalar snapshot are written together, atomically, by
        // escrow-fee-snapshot.service.ts, and the DB trigger enforces they
        // can never diverge afterward. Logged loudly rather than guessed at.
        log.error({ msg: 'Escrow has feePolicyVersionId but no snapshotProtocolFeeRate — refusing to guess a rate', escrowId: escrow.id })
        return
      }

      const lockedAmount = new Prisma.Decimal(escrow.lockedAmount)
      const rate = new Prisma.Decimal(escrow.snapshotProtocolFeeRate)

      // Missão 11 Fase 3.4 — seller's bps-portion of T only; buyer's own
      // share is never part of the fee basis (frozen conservation
      // equations). Deliberately floors via BigInt-equivalent truncation
      // (matching multisig.provider.ts's own integer bps arithmetic) rather
      // than Decimal division, so this Decimal-level accounting figure and
      // the sats-level PSBT construction can never disagree on the basis
      // itself, only (harmlessly) on trailing sub-satoshi precision this
      // truncation already eliminates.
      const basisAmount =
        outcome === 'SPLIT'
          ? lockedAmount.times(10000 - (splitBuyerBps ?? 0)).dividedBy(10000).toDecimalPlaces(8, Prisma.Decimal.ROUND_DOWN)
          : lockedAmount

      // Fase 4 — computed via the SAME shared function multisig.provider.ts
      // uses for its own sats-level construction (fee-reserve-math.ts),
      // never a second independent reimplementation — this is what
      // guarantees the obligation amount and the actual on-chain output
      // cannot silently diverge (Fase 4 §J), independent of whether
      // actualCollection is also supplied below (it's a cross-check /
      // authoritative override, not a replacement for computing this).
      const computedFee = computeProtocolFee(basisAmount, rate)

      // Fase 4 §J — if the real transaction construction already decided
      // (waived-or-not, against the REAL collection address's REAL dust
      // threshold), that decision is authoritative. Otherwise, fall back to
      // the generic, fixture-only small-trade rule (Fase 3, unchanged) —
      // the only option for a provider with no Bitcoin-style dust concept.
      let waived: boolean
      if (actualCollection) {
        waived = actualCollection.waived
        // Sanity cross-check, logged loudly rather than silently trusted:
        // the independently-computed fee and the amount actually built
        // into the transaction should agree exactly (both derive from the
        // same shared fee-reserve-math.ts function against the same
        // snapshot) — a mismatch here would mean the two computations
        // used different inputs somewhere, a real bug worth surfacing.
        const builtFeeBtc = new Prisma.Decimal(actualCollection.feeSats).dividedBy(1e8)
        if (!waived && !builtFeeBtc.equals(computedFee)) {
          log.error({
            msg: 'FeeObligation computedFee disagrees with the amount actually built into the settlement transaction — recording the ACTUAL on-chain amount, not the independently recomputed one',
            escrowId: escrow.id, computedFee: computedFee.toString(), actualCollectionFeeSats: actualCollection.feeSats,
          })
        }
      } else {
        const policy = await this.policyRepo.findById(escrow.feePolicyVersionId)
        waived = evaluateSmallTradeRuleFixtureOnly(policy?.smallTradeRule, computedFee) === 'WAIVE'
      }

      // The obligation always records the amount actually collected on-chain
      // when we have one (never the possibly-disagreeing recomputation) —
      // falls back to the independently-computed figure only when no real
      // construction happened (MOCK/WDK_USDT_EVM, or the waived case, where
      // the collected amount is definitionally 0 either way).
      const recordedFee = actualCollection && !waived
        ? new Prisma.Decimal(actualCollection.feeSats).dividedBy(1e8)
        : computedFee

      const obligation = await this.createObligationForSettlement({
        escrowId: escrow.id,
        feePolicyVersionId: escrow.feePolicyVersionId,
        outcome: outcome === 'SPLIT' ? 'SPLIT' : 'RELEASE',
        basisAmount,
        computedFee: recordedFee,
        asset: escrow.asset,
      })

      if (waived) {
        await this.transitionCollectionStatus(obligation.id, 'PENDING_COLLECTION', 'WAIVED')
      }
    } catch (err: any) {
      if (err instanceof EscrowError && /already exists for escrow/.test(err.message)) {
        log.info({ msg: 'FeeObligation creation raced a concurrent caller — idempotent no-op', escrowId: escrow.id })
        return
      }
      log.error({ msg: 'recordObligationForEscrowSettlement failed — settlement itself already completed, not aborting', escrowId: escrow.id, err: err instanceof Error ? err.message : err })
    }
  }
}

export const feeObligationService = new FeeObligationService()
