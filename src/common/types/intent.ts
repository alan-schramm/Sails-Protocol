/**
 * Intent types — PROTOCOL_SPECIFICATION.md §1.2 and §2 (Intent Engine).
 * Frozen shape (Protocol Freeze, v8.8). Do not change without RFC-006+.
 * IntentStatus specifically: RFC-012 (rfcs/RFC-012-intent-validation-and-
 * coordination.md) added VALIDATED/COORDINATED — the RFC process this
 * comment already asked for, not a silent edit.
 *
 * This file was missing — referenced by src/core/intent-engine.ts but
 * never created. Found during a verification pass before dev handoff.
 *
 * IntentStatus is the single declaration as of RFC-012 — it used to be
 * independently re-declared in core/state-machine.ts too (identical
 * today by coincidence, not by shared reference, a real drift risk if
 * one had ever been edited without the other). state-machine.ts imports
 * it from here now.
 */

export type IntentType =
  | 'TradeIntent'    // Sails OpenP2P — ✅ implemented
  | 'PaymentIntent'  // Sails OpenFinance — 📋 future
  | 'SwapIntent'     // Sails OpenFinance — 📋 future
  | 'LoanIntent'     // Sails OpenFinance — 📋 future
  | 'EarnIntent'     // Sails OpenFinance — 📋 future
  | 'AgentIntent'    // Sails OpenAgents — 📋 future, can spawn sub-intents

// VALIDATED/COORDINATED sit between CREATED and DISCOVERING — RFC-012.
// See core/state-machine.ts's VALID_TRANSITIONS for the enforced order;
// this is only the vocabulary, not the transition rules.
export type IntentStatus =
  | 'CREATED' | 'VALIDATED' | 'COORDINATED' | 'DISCOVERING' | 'MATCHED'
  | 'NEGOTIATING' | 'COMMITTED' | 'SETTLING' | 'FULFILLED' | 'EXPIRED'
  | 'CANCELLED' | 'FAILED'

export interface IntentPayload {
  [key: string]: unknown
}

export interface Intent<T extends IntentPayload = IntentPayload> {
  id: string
  type: IntentType
  version: string
  participantId: string          // a Participant, per RFC-001
  agentId?: string
  parentIntentId?: string
  moduleId: string
  payload: T
  status: IntentStatus
  createdAt: Date
  updatedAt: Date
  expiresAt?: Date
  fulfilledBy?: string
  metadata: Record<string, unknown>
}

export interface IntentHandler<T extends IntentPayload = IntentPayload> {
  moduleId: string
  intentTypes: IntentType[]
  validate(payload: T): { valid: boolean; errors?: string[] }
  onCreated(intent: Intent<T>): Promise<void>
  discover?(intent: Intent<T>): Promise<unknown[]>
  onFulfilled(intent: Intent<T>, settlement: unknown): Promise<void>
  onExpired(intent: Intent<T>): Promise<void>
}

// Concrete payload shapes — PROTOCOL_SPECIFICATION.md §2.3
export interface TradeIntentPayload extends IntentPayload {
  asset: string
  side: 'BUY' | 'SELL'
  // maxValue/minValue: decimal strings, never number (RFC-009,
  // rfcs/RFC-009-decimal-precision-for-financial-fields.md §2.3's own
  // forward-looking convention for financial amount fields, applied here
  // as of the 03-implementation_plan.md MVP work — this is the first real
  // Intent persistence implementation, so it's the first point these
  // fields cross into a Prisma-backed JSON payload where the convention
  // matters). Was `number` before this pass.
  maxValue?: string
  minValue?: string
  currency?: string
  fiatMethod?: string
  network?: string
  slippageTolerance?: number
  // RFC-013 (rfcs/RFC-013-capability-registry-and-wallet-adapter.md) —
  // additive counterparty-matching constraints. minReputationRating
  // mirrors ReputationScore's 0-5 scale (reputation.service.ts); a plain
  // number, not a decimal string, since it's a threshold/filter value,
  // never summed or transferred the way maxValue/minValue are.
  // kycRequired declares whether the counterparty must have passed KYC.
  // Neither is enforced against a real counterparty yet — OpenLiquidity
  // reading these during matching is separate follow-up work (that RFC's
  // Reference Implementation Plan); this only adds the vocabulary and its
  // structural bounds check (intent-engine.ts's validateStructure()).
  minReputationRating?: number
  kycRequired?: boolean
}
