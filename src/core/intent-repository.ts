/**
 * IntentRepository — Sails Protocol Core Component
 *
 * ARCHITECTURE_AUDIT_REPORT.md recommendation #3 ("Introduzir
 * repositórios: IntentRepository, CapabilityGrantRepository,
 * TradeRepository, EscrowRepository — dependência via injeção no
 * construtor"), step 2 of the incremental rollout (step 1 was
 * `CapabilityGrantRepository`), closed 2026-08-08. Wraps every
 * `prisma.intent.*`/`prisma.intentEvent.*` call previously inline in
 * `intent-engine.ts`/`coordination-engine.ts` — moved verbatim, no
 * behavior change, same discipline used for the escrow.service.ts
 * decomposition and step 1.
 *
 * Unlike `CapabilityGrantRepository` (which introduced a real
 * Prisma-row -> domain-shape mapping function, `toCapabilityGrant`),
 * `intent-engine.ts` never had one — it already treats the raw Prisma
 * `Intent` row as the domain `Intent` type via `as unknown as Intent`
 * casts throughout. This repository preserves that exact shape (no new
 * mapping invented) — its return types are derived directly from
 * Prisma's own inferred row type (`IntentRow` below), not the frozen
 * `common/types/intent.ts` `Intent` interface.
 *
 * `claimTransition()` is the one method worth reading carefully before
 * changing anything: it's the exact atomic-conditional-update race
 * protection intent-engine.ts's own `transition()` comment documents
 * (the 2026-07-20 robustness-audit fix, the same `updateMany` + `WHERE
 * status` idiom escrow.service.ts's `claimEscrowTransition()` uses) —
 * returning the raw affected-row count (0 = a concurrent caller won the
 * race) rather than a boolean keeps the caller's own error message
 * ("was already transitioned by a concurrent request") unchanged.
 */
import { prisma } from '../common/database'
import type { IntentType } from '../common/types/intent'

type IntentRow = NonNullable<Awaited<ReturnType<typeof prisma.intent.findUnique>>>
type IntentEventRow = NonNullable<Awaited<ReturnType<typeof prisma.intentEvent.findFirst>>>

export interface CreateIntentInput {
  type: IntentType
  participantId: string
  agentId?: string
  moduleId: string
  payload: object
  status: string
  metadata: object
}

export interface CreateIntentEventInput {
  intentId: string
  fromStatus: string | null
  toStatus: string
  triggeredBy: string
  note?: string
  prevHash: string
  entryHash: string
}

export interface IntentRepository {
  create(input: CreateIntentInput): Promise<IntentRow>
  findById(intentId: string): Promise<IntentRow | null>
  /** Atomic conditional update — returns the affected-row count (0 means a concurrent caller already transitioned this Intent). */
  claimTransition(intentId: string, fromStatus: string, toStatus: string): Promise<number>
  findLastEvent(intentId: string): Promise<IntentEventRow | null>
  createEvent(input: CreateIntentEventInput): Promise<void>
}

class PrismaIntentRepository implements IntentRepository {
  async create(input: CreateIntentInput): Promise<IntentRow> {
    return prisma.intent.create({
      data: {
        type: input.type,
        participantId: input.participantId,
        agentId: input.agentId,
        moduleId: input.moduleId,
        payload: input.payload,
        status: input.status as any,
        metadata: input.metadata,
      },
    })
  }

  async findById(intentId: string): Promise<IntentRow | null> {
    return prisma.intent.findUnique({ where: { id: intentId } })
  }

  async claimTransition(intentId: string, fromStatus: string, toStatus: string): Promise<number> {
    const claim = await prisma.intent.updateMany({
      where: { id: intentId, status: fromStatus as any },
      data: { status: toStatus as any },
    })
    return claim.count
  }

  async findLastEvent(intentId: string): Promise<IntentEventRow | null> {
    return prisma.intentEvent.findFirst({
      where: { intentId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createEvent(input: CreateIntentEventInput): Promise<void> {
    await prisma.intentEvent.create({
      data: {
        intentId: input.intentId,
        fromStatus: input.fromStatus ?? undefined,
        toStatus: input.toStatus,
        triggeredBy: input.triggeredBy,
        note: input.note,
        prevHash: input.prevHash,
        entryHash: input.entryHash,
      },
    })
  }
}

export const intentRepository: IntentRepository = new PrismaIntentRepository()
