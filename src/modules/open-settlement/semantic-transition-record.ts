/**
 * semantic-transition-record.ts — Sails Core Implementation Program,
 * Bridge Phase M3.5 (Durable Semantic Transition Record).
 *
 * Exists solely to satisfy docs/CORE_IMPLEMENTATION_ARCHITECTURE.md
 * §12: "No semantic decision becomes Core-authoritative before a
 * durable Transition Record exists for that decision class." See
 * docs/CORE_TRANSITION_RECORD.md for the full design rationale.
 *
 * NOT WIRED INTO ANY LIVE PATH. No production call site invokes
 * `commitAuthoritativeEscrowTimelockExpiry` yet — Core remains
 * non-authoritative; the M3 shadow observer (expiry-shadow.ts) is still
 * the only live Core-adjacent code running in sweepExpiredEscrows().
 * This module exists to be proven correct in isolation
 * (tests/semanticTransitionRecord.test.ts) ahead of a future M4 retry,
 * per mission §37 ("Testability before authority").
 *
 * Maps `@sails/core`'s `TransitionRecord` (packages/sails-core/src/transition.ts)
 * — a pure, database-agnostic type — onto this Reference Implementation's
 * Postgres/Prisma storage. Core itself never imports Prisma, never opens
 * a transaction, and never generates a database id; this file is the
 * Runtime persistence adapter, one layer below the (not-yet-built) M4
 * orchestration.
 */
import { prisma } from '../../common/database'
import type { Prisma } from '@prisma/client'
import { TransitionRecord } from '@sails/core'
import { escrowRepository } from './escrow-repository'

type SemanticTransitionRecordRow = NonNullable<Awaited<ReturnType<typeof prisma.semanticTransitionRecord.findUnique>>>

/**
 * This slice's own CandidateTransition payload shape — Core's
 * `CandidateTransition.payload` is deliberately opaque/Runtime-defined
 * (transition.ts's own header), the correct place for this specific
 * transition's committed semantic inputs to travel, rather than a
 * bolted-on parameter elsewhere. `deadlineMs`/`evaluationTimeMs` are
 * plain numbers here (not the branded `EvaluationTime`) because this is
 * a Runtime-level shape, never imported back into Core.
 */
export interface EscrowTimelockExpiryPayload {
  readonly fromState: string
  readonly toState: string
  readonly deadlineMs: number
  readonly evaluationTimeMs: number
}

/**
 * Pure: maps a Core `TransitionRecord` to this Reference
 * Implementation's persisted row shape. Never invents a value Core
 * didn't actually supply — every column traces to a real field on the
 * frozen `TransitionRecord`/`SemanticHistoryPosition`/`RulesetRef` types.
 */
export function toSemanticTransitionRecordRow(
  record: TransitionRecord<EscrowTimelockExpiryPayload>,
): Prisma.SemanticTransitionRecordCreateInput {
  const priorPosition = record.priorPosition
  const isLegacyUnverified = priorPosition === 'LEGACY_UNVERIFIED'

  if (record.attribution) {
    throw new Error('semantic-transition-record.ts: this slice never carries discretionary attribution (K2 does not apply) — refusing to silently drop it')
  }
  if (record.outcome) {
    throw new Error('semantic-transition-record.ts: this slice never carries an economic Outcome (K3 does not apply) — refusing to silently drop it')
  }

  return {
    interactionId: record.interaction,
    transitionType: record.transition.type,
    fromState: record.transition.payload.fromState,
    toState: record.transition.payload.toState,
    priorPositionKind: isLegacyUnverified ? 'LEGACY_UNVERIFIED' : 'RESOLVED',
    priorPositionReference: isLegacyUnverified ? null : JSON.stringify(priorPosition.reference),
    rulesetName: record.rulesetRef.name,
    rulesetIdentity: record.rulesetRef.identity,
    rulesetVersion: record.rulesetRef.version,
    rulesetCommitment: String(record.rulesetRef.commitment),
    rulesetExpectedEvaluatorName: record.rulesetRef.expectedEvaluatorIdentity.name,
    rulesetExpectedEvaluatorVersion: record.rulesetRef.expectedEvaluatorIdentity.version,
    rulesetExpectedProfileName: record.rulesetRef.expectedProfileIdentity.name,
    rulesetExpectedProfileVersion: record.rulesetRef.expectedProfileIdentity.version,
    evaluatorIdentityName: record.evaluatorIdentity.name,
    evaluatorIdentityVersion: record.evaluatorIdentity.version,
    profileIdentityName: record.profileIdentity.name,
    profileIdentityVersion: record.profileIdentity.version,
    deadlineMs: BigInt(record.transition.payload.deadlineMs),
    evaluationTimeMs: BigInt(record.transition.payload.evaluationTimeMs),
    conditionResult: record.conditionResult,
  }
}

export interface SemanticTransitionRecordRepository {
  create(data: Prisma.SemanticTransitionRecordCreateInput, tx?: Prisma.TransactionClient): Promise<SemanticTransitionRecordRow>
  findByInteractionAndTransitionType(interactionId: string, transitionType: string): Promise<SemanticTransitionRecordRow | null>
}

class PrismaSemanticTransitionRecordRepository implements SemanticTransitionRecordRepository {
  async create(data: Prisma.SemanticTransitionRecordCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma
    return client.semanticTransitionRecord.create({ data })
  }

  async findByInteractionAndTransitionType(interactionId: string, transitionType: string) {
    return prisma.semanticTransitionRecord.findUnique({
      where: { interactionId_transitionType: { interactionId, transitionType } },
    })
  }
}

export const semanticTransitionRecordRepository: SemanticTransitionRecordRepository = new PrismaSemanticTransitionRecordRepository()

export type AuthoritativeCommitResult =
  | { readonly committed: true; readonly record: SemanticTransitionRecordRow }
  | { readonly committed: false; readonly reason: 'STATE_TRANSITION_LOST_RACE' }

/**
 * The atomic unit a future M4 retry must call: State transition claim
 * and durable Transition Record insert commit together, in one Postgres
 * transaction, or neither commits (mission §14/§15, proofs P1/P2).
 *
 * If `claimTransition` claims 0 rows (a concurrent caller already
 * transitioned this escrow, or it was never in `fromStatus` to begin
 * with), the Record is never created and the transaction is a safe,
 * effect-free no-op — a Record must never claim a transition that did
 * not actually happen. If the Record insert then fails for any reason
 * (e.g. the replay-resistance unique constraint on
 * (interactionId, transitionType)), Postgres rolls back the whole
 * transaction, undoing the State claim too — a transition must never
 * exist without its required Record.
 *
 * This function does NOT call emitEscrowTransition() — event emission
 * remains a separate step after this atomic unit succeeds, unchanged
 * from how claimEscrowTransition()/emitEscrowTransition() already
 * compose today (mission §49's own target sketch).
 */
export async function commitAuthoritativeEscrowTimelockExpiry(
  escrowId: string,
  fromStatus: string,
  toStatus: string,
  record: TransitionRecord<EscrowTimelockExpiryPayload>,
): Promise<AuthoritativeCommitResult> {
  const row = toSemanticTransitionRecordRow(record)

  return prisma.$transaction(async (tx) => {
    const claimedCount = await escrowRepository.claimTransition(escrowId, fromStatus, toStatus, tx)
    if (claimedCount === 0) {
      return { committed: false, reason: 'STATE_TRANSITION_LOST_RACE' } as const
    }
    const created = await semanticTransitionRecordRepository.create(row, tx)
    return { committed: true, record: created } as const
  })
}
