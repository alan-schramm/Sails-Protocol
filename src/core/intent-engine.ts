/**
 * Intent Engine — Sails Protocol Core Component
 * PROTOCOL_SPECIFICATION.md section 2 (full spec)
 *
 * First real implementation (03-implementation_plan.md MVP happy path,
 * approved by CISO + CTO). Routes Intents by type via registered
 * IntentHandlers (section 2.7 — the plugin pattern). Never imports a
 * module directly; modules register themselves at boot.
 *
 * Governance note (03-implementation_plan.md's own disclaimer): this file
 * implements against src/core/ under the MVP sandbox exemption — real,
 * working logic, but not itself a claim that any shape here is frozen
 * protocol specification until it goes through Protocol Freeze + RFC.
 */
import { createHash } from 'crypto'
import { prisma } from '../common/database'
import { ValidationError, NotFoundError } from '../common/errors'
import { eventBus } from '../common/events/event-bus'
import type { SailsEventName, SailsEventMap } from '../common/events/event-bus'
import { assertValidTransition, isExpired, type IntentStatus } from './state-machine'
import { validateFinancialSanity } from './policy-engine'
import { coordinationEngine } from './coordination-engine'
import type {
  Intent, IntentType, IntentHandler, IntentPayload, TradeIntentPayload,
} from '../common/types/intent'

export interface IntentEngine {
  registerHandler<T extends IntentPayload>(handler: IntentHandler<T>): void
  // agentId is optional and was already part of Intent's frozen shape
  // (common/types/intent.ts, Protocol Freeze v8.8) but never threaded
  // through create() until modules/open-agents/wallet-agent.ts's
  // BuyerAgent/SellerAgent needed to record which agent produced an
  // Intent on a participant's behalf — filling in an already-specified
  // field, not introducing new protocol surface.
  create<T extends IntentPayload>(type: IntentType, payload: T, participantId: string, agentId?: string): Promise<Intent<T>>
  cancel(intentId: string): Promise<void>
  // Advances an Intent's status, writing the hash-chained audit trail and
  // emitting the caller-supplied typed event — the generic mechanism
  // create()/cancel() below both use, and what modules reacting to an
  // Intent (e.g. modules/open-settlement/lightspark.service.ts) call to
  // move it forward (e.g. → SETTLING) without duplicating this logic.
  transition<K extends SailsEventName>(
    intentId: string,
    toStatus: IntentStatus,
    triggeredBy: string,
    eventName: K,
    eventPayload: SailsEventMap[K],
    note?: string
  ): Promise<Intent>
}

const handlers = new Map<IntentType, IntentHandler>()

// ─── CISO Byzantine Rule: reject and drop malformed intents at the entry
// boundary — never persisted, never handed to a handler. ─────────────────────
function validateStructure(type: IntentType, payload: IntentPayload): { valid: boolean; errors?: string[] } {
  if (type !== 'TradeIntent') {
    // PaymentIntent/SwapIntent/LoanIntent/EarnIntent/AgentIntent are 📋
    // future per PROTOCOL_SPECIFICATION.md §2.3 — no handler can exist for
    // them yet, so any attempt to create one is malformed by definition,
    // not a gap in this validator.
    return { valid: false, errors: [`Unsupported intent type: ${type} (no handler registered yet)`] }
  }

  const p = payload as TradeIntentPayload
  const errors: string[] = []
  if (!p.asset || typeof p.asset !== 'string') errors.push('asset is required')
  if (p.side !== 'BUY' && p.side !== 'SELL') errors.push("side must be 'BUY' or 'SELL'")
  if (p.maxValue !== undefined && typeof p.maxValue !== 'string') errors.push('maxValue must be a decimal string, not a number (RFC-009)')
  if (p.minValue !== undefined && typeof p.minValue !== 'string') errors.push('minValue must be a decimal string, not a number (RFC-009)')
  // RFC-013 — minReputationRating mirrors ReputationScore's 0-5 scale
  // (reputation.service.ts), not a decimal string: it's a threshold, not
  // a transferred amount, so RFC-009's decimal-string rule doesn't apply.
  if (p.minReputationRating !== undefined) {
    if (typeof p.minReputationRating !== 'number' || !Number.isFinite(p.minReputationRating)) {
      errors.push('minReputationRating must be a finite number')
    } else if (p.minReputationRating < 0 || p.minReputationRating > 5) {
      errors.push('minReputationRating must be between 0 and 5')
    }
  }
  if (p.kycRequired !== undefined && typeof p.kycRequired !== 'boolean') {
    errors.push('kycRequired must be a boolean')
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

// Hash-chains IntentEvent the same way this pattern will eventually apply
// to EscrowEvent/ReputationEvent too (RFC-008 D2, still 🔲 in BACKLOG.md) —
// implemented here first since Intent persistence is being built from
// scratch in this pass, not retrofitted onto rows that already exist.
async function writeIntentEvent(
  intentId: string,
  fromStatus: string | null,
  toStatus: string,
  triggeredBy: string,
  note?: string
): Promise<void> {
  const last = await prisma.intentEvent.findFirst({
    where: { intentId },
    orderBy: { createdAt: 'desc' },
  })
  const prevHash = last?.entryHash ?? 'genesis'
  const entryHash = createHash('sha256')
    .update(`${fromStatus ?? ''}|${toStatus}|${triggeredBy}|${prevHash}`)
    .digest('hex')

  await prisma.intentEvent.create({
    data: { intentId, fromStatus: fromStatus ?? undefined, toStatus, triggeredBy, note, prevHash, entryHash },
  })
}

async function transition<K extends SailsEventName>(
  intentId: string,
  toStatus: IntentStatus,
  triggeredBy: string,
  eventName: K,
  eventPayload: SailsEventMap[K],
  note?: string
): Promise<Intent> {
  const record = await prisma.intent.findUnique({ where: { id: intentId } })
  if (!record) throw new NotFoundError('Intent', intentId)

  const currentStatus = record.status as IntentStatus

  // CISO Byzantine Rule, applied to lifecycle too: an Intent whose window
  // has closed is EXPIRED regardless of what transition was requested —
  // this is the hard-timeout enforcement (state-machine.ts's isExpired()).
  if (isExpired({ status: currentStatus, expiresAt: record.expiresAt }) && toStatus !== 'EXPIRED') {
    await transition(intentId, 'EXPIRED', 'system:expiry-check', 'intent.expired', {
      intentId,
      reason: 'expiresAt window closed before this transition was requested',
    })
    throw new ValidationError(`Intent ${intentId} expired before transitioning to ${toStatus}`)
  }

  assertValidTransition(currentStatus, toStatus)

  const updated = await prisma.intent.update({
    where: { id: intentId },
    data: { status: toStatus },
  })
  await writeIntentEvent(intentId, currentStatus, toStatus, triggeredBy, note)
  await eventBus.emit(eventName, eventPayload, intentId) // correlationId = intentId (RFC-010)

  return updated as unknown as Intent
}

export const intentEngine: IntentEngine = {
  registerHandler(handler) {
    for (const type of handler.intentTypes) {
      handlers.set(type, handler as IntentHandler)
    }
  },

  async create<T extends IntentPayload>(type: IntentType, payload: T, participantId: string, agentId?: string) {
    const structural = validateStructure(type, payload)
    if (!structural.valid) {
      throw new ValidationError('Malformed Intent rejected at entry boundary', structural.errors)
    }

    const sanity = validateFinancialSanity(payload as unknown as TradeIntentPayload)
    if (!sanity.valid) {
      throw new ValidationError('Intent failed financial sanity check', sanity.errors)
    }

    const record = await prisma.intent.create({
      data: {
        type,
        participantId,
        agentId,
        moduleId: 'openp2p', // TradeIntent's owning module — generalize once other IntentTypes are real
        payload: payload as object,
        status: 'CREATED' satisfies IntentStatus,
        metadata: {},
      },
    })

    await writeIntentEvent(record.id, null, 'CREATED', participantId)
    await eventBus.emit('intent.created', {
      intentId: record.id,
      type,
      participantId,
      moduleId: record.moduleId,
      agentId,
    }, record.id) // correlationId = intentId (RFC-010)

    // RFC-012 (rfcs/RFC-012-intent-validation-and-coordination.md):
    // CREATED -> VALIDATED -> COORDINATED, formal transitions recorded
    // through the same hash-chained transition() mechanism cancel() uses
    // below — not a bare status overwrite. Deterministic today: the CISO
    // Byzantine/Economic checks above already gated persistence, so a
    // persisted CREATED row has, by construction, already passed them —
    // VALIDATED formalizes that as an observable, audited state instead
    // of an implicit pre-persistence gate. This is also the receive path
    // for an agent-generated Intent (modules/open-agents/buyer-agent.ts's
    // QVAC-produced TradeIntentPayload) — agentId, threaded through
    // above, needs no special-cased handling here: it's just data that
    // flows through the same validate/coordinate pipeline every Intent does.
    const validated = await transition(
      record.id, 'VALIDATED', participantId, 'intent.validated',
      { intentId: record.id, participantId }
    )

    const decision = await coordinationEngine.decide(record.id)
    const handler = handlers.get(type)
    if (handler) await handler.onCreated(validated as unknown as Intent)

    const coordinated = await transition(
      record.id, 'COORDINATED', participantId, 'intent.coordinated',
      { intentId: record.id, targetModule: decision.targetModule }
    )

    return coordinated as unknown as Intent<T>
  },

  async cancel(intentId) {
    const record = await prisma.intent.findUnique({ where: { id: intentId } })
    if (!record) throw new NotFoundError('Intent', intentId)

    if (isExpired({ status: record.status as IntentStatus, expiresAt: record.expiresAt })) {
      await transition(intentId, 'EXPIRED', 'system:expiry-check', 'intent.expired', {
        intentId,
        reason: 'expiresAt window closed before cancellation was processed',
      })
      return
    }

    await transition(intentId, 'CANCELLED', record.participantId, 'intent.cancelled', {
      intentId,
      cancelledBy: record.participantId,
    })
  },

  transition,
}
