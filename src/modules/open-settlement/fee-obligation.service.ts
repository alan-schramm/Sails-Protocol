/**
 * FeeObligationService — Missão 11 Fase 2.2 economic accounting foundation.
 *
 * STRUCTURAL FOUNDATION ONLY. Implements the primitive that decides, given a
 * settlement outcome and the CTO-approved economic basis (Fase 1.2 §1 —
 * "fee on value economically delivered to the seller"), whether a
 * FeeObligation is OWED or NOT_APPLICABLE, and drives the collectionStatus
 * lifecycle for OWED obligations.
 *
 * Deliberately NOT connected to escrow.service.ts's real
 * releaseFunds()/refundFunds()/splitFunds() in this pass (Fase 2.2 §6 —
 * "NÃO conecte isso ainda aos fluxos reais... implemente a primitive/service
 * e seus testes isoladamente"). No real fee is computed here in a way that
 * could ever be mistaken for production output — every `computedFee` this
 * service ever writes is exactly what the caller passes in; this service
 * performs no fee arithmetic of its own (that remains
 * chargeProtocolFee()'s job, unchanged, RFC-021 Phase 0).
 */
import {
  feeObligationRepository,
  VALID_COLLECTION_TRANSITIONS,
  type FeeObligationRepository,
  type FeeCollectionStatus,
} from './fee-obligation-repository'
import { EscrowError } from '../../common/errors'
import type { Prisma } from '@prisma/client'
import type { AssetType } from '../../common/types'

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

export class FeeObligationService {
  constructor(private readonly repo: FeeObligationRepository = feeObligationRepository) {}

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
}

export const feeObligationService = new FeeObligationService()
