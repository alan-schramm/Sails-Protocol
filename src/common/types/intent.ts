/**
 * Intent types — PROTOCOL_SPECIFICATION.md §1.2 and §2 (Intent Engine).
 * Frozen shape (Protocol Freeze, v8.8). Do not change without RFC-006+.
 *
 * This file was missing — referenced by src/core/intent-engine.ts but
 * never created. Found during a verification pass before dev handoff.
 */

export type IntentType =
  | 'TradeIntent'    // Sails OpenP2P — ✅ implemented
  | 'PaymentIntent'  // Sails OpenFinance — 📋 future
  | 'SwapIntent'     // Sails OpenFinance — 📋 future
  | 'LoanIntent'     // Sails OpenFinance — 📋 future
  | 'EarnIntent'     // Sails OpenFinance — 📋 future
  | 'AgentIntent'    // Sails OpenAgents — 📋 future, can spawn sub-intents

export type IntentStatus =
  | 'CREATED' | 'DISCOVERING' | 'MATCHED' | 'NEGOTIATING'
  | 'COMMITTED' | 'SETTLING' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED' | 'FAILED'

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
}
