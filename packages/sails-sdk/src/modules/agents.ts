/**
 * @sails/sdk — Sails OpenAgents module (verified against
 * src/modules/open-agents/agent.routes.ts directly).
 *
 * Wraps `QvacAgentProvider`'s structured-generation/risk capabilities
 * (real local LLM inference, LLAMA_3_2_1B_INST_Q4_0, no cloud
 * dependency) — previously only reachable from the reference
 * BuyerAgent/SellerAgent implementations and the demo script, never over
 * HTTP. Requires an active session: each call runs real inference, a
 * genuinely more expensive operation than a typical read/write, so the
 * server gates it the same way it gates real-authority actions
 * elsewhere (a different reason, same mechanism).
 */
import type { SailsTransport } from '../transport'
import type { AssetType, PaymentMethod, TradeSide } from '../types'

// Field types mirror the real provider's actual return shape exactly
// (qvac-agent.provider.ts's GeneratedTradeIntent/GeneratedOfferIntent) —
// `asset`/`currency`/`fiatMethod`/`paymentMethod` are plain strings
// there too, not narrowed to AssetType/PaymentMethod, since the model's
// own JSON-schema constraint on `currency` has no enum (asset/fiatMethod
// do) and this SDK type should describe what the server can actually
// return, not a stricter shape it doesn't guarantee.
export interface GeneratedTradeIntent {
  asset: string
  side: TradeSide
  maxValue: string
  minValue: string
  currency: string
  fiatMethod: string
}

export interface GeneratedOfferIntent {
  asset: string
  side: TradeSide
  minAmount: string
  maxAmount: string
  paymentMethod: string
}

export type IntentRiskLevel = 'low' | 'medium' | 'high'
export type IntentRiskRecommendation = 'proceed' | 'hold' | 'reject'

export interface IntentRiskAssessment {
  risk: IntentRiskLevel
  reasoning: string
  recommendation: IntentRiskRecommendation
}

// Mirrors qvac-agent.provider.ts's AssessableIntent exactly — the same
// restricted asset/currency/fiatMethod enums the server's zod schema and
// prompt-injection hardening (Fase 1 Red Team pass) already apply.
export interface AssessableIntent {
  asset: AssetType
  side: TradeSide
  maxValue?: string
  minValue?: string
  currency?: string
  fiatMethod?: PaymentMethod
}

export class SailsAgentsModule {
  constructor(private readonly transport: SailsTransport) {}

  /** Requires an active session. Runs real local LLM inference server-side. */
  async generateTradeIntent(goal: string): Promise<GeneratedTradeIntent> {
    return this.transport.post<GeneratedTradeIntent>('/v1/agents/generate-trade-intent', { goal }, true)
  }

  /** Requires an active session. Runs real local LLM inference server-side. */
  async generateOfferIntent(goal: string): Promise<GeneratedOfferIntent> {
    return this.transport.post<GeneratedOfferIntent>('/v1/agents/generate-offer-intent', { goal }, true)
  }

  /** Requires an active session. Runs real local LLM inference server-side. */
  async assessIntentRisk(intent: AssessableIntent): Promise<IntentRiskAssessment> {
    return this.transport.post<IntentRiskAssessment>('/v1/agents/assess-intent-risk', intent, true)
  }
}
