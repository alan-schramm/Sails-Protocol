/**
 * Sails OpenAgents — QVAC Risk Service
 *
 * The first real OpenAgents capability (previously 📋 Aspirational, zero
 * code — PROJECT_CONTEXT.md §4). Uses the real `@qvac/sdk` — a local LLM
 * inference SDK (llama.cpp-based, GPU-accelerated via Vulkan/Metal), not
 * a cloud API — matching ARCHITECTURE.md's description of OpenAgents:
 * "Any module can request matching, fraud detection, or risk analysis
 * locally, without cloud dependency." QVAC's role label per
 * PROJECT_CONTEXT.md §3 is "Agent Infrastructure" — this service is the
 * thin integration layer on top of it that section already anticipated.
 *
 * Scope: a structural risk read on a TradeIntent's shape (amount range,
 * asset, fiat method) before it enters negotiation — not fraud detection
 * on live Timeline events (RFC-007 D7's Social Engineering Agent, still
 * 🔲 Not started, BACKLOG.md P3). This is the first, narrower slice.
 *
 * Model: LLAMA_3_2_1B_INST_Q4_0 (~737MB, downloaded once via QVAC's own
 * registry on first loadModel() call, then cached locally) — the
 * smallest instruction-tuned model in QVAC's registry, chosen because
 * risk-flagging from a handful of structured fields doesn't need a
 * larger model, and this keeps the first-run download and memory
 * footprint minimal.
 */
import { loadModel, completion, unloadModel, LLAMA_3_2_1B_INST_Q4_0 } from '@qvac/sdk'

export type RiskLevel = 'low' | 'medium' | 'high'
export type RiskRecommendation = 'proceed' | 'hold' | 'reject'

export interface IntentRiskAssessment {
  risk: RiskLevel
  reasoning: string
  recommendation: RiskRecommendation
}

export interface AssessableIntent {
  asset: string
  side: 'BUY' | 'SELL'
  maxValue?: string
  minValue?: string
  currency?: string
  fiatMethod?: string
}

const RISK_ASSESSMENT_SCHEMA = {
  type: 'object',
  properties: {
    risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    reasoning: { type: 'string' },
    recommendation: { type: 'string', enum: ['proceed', 'hold', 'reject'] },
  },
  required: ['risk', 'reasoning', 'recommendation'],
} as const

// Deliberately plain, jargon-free language — an earlier version referenced
// "RFC-007 D7" directly in the prompt sent to the model (meant as a code
// comment for humans, not model input) and the 1B model latched onto that
// token instead of reasoning about the trade, producing a degenerate
// "reasoning": "D7" response. Verified against the real model after this
// fix — see the smoke test note in this module's tests.
const SYSTEM_PROMPT =
  'You assess trade requests for red flags before they proceed. Look at ' +
  'the amount, currency, and payment method below. Flag anything unusual: ' +
  'an implausibly large amount, a missing amount range, or a payment ' +
  'method that does not match the currency. Reply only with the ' +
  'requested JSON. Write one short, plain sentence for "reasoning" that ' +
  'explains your risk level in plain language.'

export class QvacRiskService {
  private modelId: string | null = null
  private loading: Promise<string> | null = null

  private async ensureModel(onProgress?: (p: unknown) => void): Promise<string> {
    if (this.modelId) return this.modelId
    if (!this.loading) {
      this.loading = loadModel({
        modelSrc: LLAMA_3_2_1B_INST_Q4_0,
        onProgress,
      }).then((id) => {
        this.modelId = id
        return id
      })
    }
    return this.loading
  }

  async assessIntent(intent: AssessableIntent, onProgress?: (p: unknown) => void): Promise<IntentRiskAssessment> {
    const modelId = await this.ensureModel(onProgress)

    const prompt = `Trade intent to assess:
- asset: ${intent.asset}
- side: ${intent.side}
- amount range: ${intent.minValue ?? 'unspecified'} to ${intent.maxValue ?? 'unspecified'}
- currency: ${intent.currency ?? 'unspecified'}
- fiat method: ${intent.fiatMethod ?? 'unspecified'}

Respond with your risk assessment as JSON matching the requested schema.`

    const run = completion({
      modelId,
      history: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      stream: false,
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'intent_risk_assessment', schema: RISK_ASSESSMENT_SCHEMA },
      },
    })

    const final = await run.final
    // The model is constrained to this schema server-side (llama.cpp GBNF
    // grammar, per @qvac/sdk's responseFormat docs) — a parse failure here
    // means the constraint itself broke, not that the model wandered off
    // schema, so this is deliberately not wrapped in a try/catch that
    // silently falls back to a fake assessment.
    return JSON.parse(final.contentText) as IntentRiskAssessment
  }

  // Frees the model's memory (GPU/CPU) — call when done with a batch of
  // assessments, not after every single call, since loadModel() is the
  // expensive step (first call downloads ~737MB; every call after that
  // just re-uses the already-loaded model until this is called).
  async dispose(): Promise<void> {
    if (!this.modelId) return
    const modelId = this.modelId
    this.modelId = null
    this.loading = null
    await unloadModel({ modelId })
  }
}

export const qvacRiskService = new QvacRiskService()
