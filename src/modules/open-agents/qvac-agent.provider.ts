/**
 * Sails OpenAgents — QvacAgentProvider
 *
 * The single QVAC integration point for this module — previously
 * 📋 Aspirational, zero code (`PROJECT_CONTEXT.md` §4). Uses the real
 * `@qvac/sdk` — a local LLM inference SDK (llama.cpp-based, GPU-accelerated
 * via Vulkan/Metal), not a cloud API — matching `ARCHITECTURE.md`'s
 * description of OpenAgents: "Any module can request matching, fraud
 * detection, or risk analysis locally, without cloud dependency." QVAC's
 * role label per `PROJECT_CONTEXT.md` §3 is "Agent Infrastructure" — this
 * class is the thin integration layer on top of it that section already
 * anticipated.
 *
 * Consolidated from the earlier `qvac-risk.service.ts` (one narrow
 * capability, its own model-lifecycle plumbing) into one class that every
 * agent capability shares a model load/dispose cycle through —
 * `assessIntentRisk()` (unchanged behavior, moved here) plus the new
 * `generateTradeIntent()`/`generateOfferIntent()` structured-generation
 * capabilities `wallet-agent.ts`'s `BuyerAgent`/`SellerAgent` call into.
 *
 * Model: LLAMA_3_2_1B_INST_Q4_0 (~737MB, downloaded once via QVAC's own
 * registry on first loadModel() call, then cached locally) — the
 * smallest instruction-tuned model in QVAC's registry. Live-verified in
 * this environment: first call ~167s (download included), cached calls
 * ~8-9s. Same model handles every capability below — one load, shared
 * across risk assessment and structured generation, since none of these
 * tasks need a larger model to produce a schema-constrained JSON object
 * from a handful of fields.
 *
 * Safety property worth stating explicitly: nothing this class produces
 * is trusted blindly downstream. A `BuyerAgent`-generated `TradeIntent`
 * still passes through `core/intent-engine.ts`'s CISO Byzantine/Economic
 * rules (`validateStructure`/`validateFinancialSanity`) before it's ever
 * persisted — an LLM producing a malformed or financially insane payload
 * gets rejected at that boundary the same way a malicious or buggy human
 * client would be, not specially trusted because an "agent" produced it.
 *
 * Crypto-Native Agent boundary (RFC-016,
 * rfcs/RFC-016-qvac-crypto-native-agent-boundary.md, architectural, not a
 * Satsails-only choice): this class and everything built on it only ever
 * produces structured data about digital assets (asset/side/amount/
 * currency labels) — it never calls a banking API and never touches PIX
 * or any other fiat rail. `fiatMethod` values like `'PIX'` below are
 * opaque labels describing what a human counterparty is expected to do
 * outside this protocol, the same as every other `PaymentMethod` value
 * in `prisma/schema.prisma` — never an instruction this code executes
 * against a bank.
 */
import { loadModel, completion, unloadModel, LLAMA_3_2_1B_INST_Q4_0 } from '@qvac/sdk'

// ─── Risk assessment (moved from qvac-risk.service.ts, unchanged behavior) ──
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
// "reasoning": "D7" response. Verified against the real model after the
// fix — see tests/wdkSettlementProvider.test.ts's sibling note in TODO.md §5B.
const RISK_SYSTEM_PROMPT =
  'You assess trade requests for red flags before they proceed. Look at ' +
  'the amount, currency, and payment method below. Flag anything unusual: ' +
  'an implausibly large amount, a missing amount range, or a payment ' +
  'method that does not match the currency. Reply only with the ' +
  'requested JSON. Write one short, plain sentence for "reasoning" that ' +
  'explains your risk level in plain language.'

// ─── Structured Intent generation (new) — a BuyerAgent's own goal, turned
// into the protocol's real TradeIntentPayload shape (common/types/intent.ts,
// frozen since Protocol Freeze v8.8) ─────────────────────────────────────────
export interface GeneratedTradeIntent {
  asset: string
  side: 'BUY' | 'SELL'
  maxValue: string
  minValue: string
  currency: string
  fiatMethod: string
}

// Enum values kept in sync with common/types/index.ts's AssetType/
// PaymentMethod string-literal unions by hand, not by importing them —
// the QVAC json_schema constraint needs plain string arrays at the call
// site, and duplicating a short, stable list here is simpler than a
// runtime transform of a TS type into a JSON Schema enum.
const TRADE_INTENT_SCHEMA = {
  type: 'object',
  properties: {
    asset: {
      type: 'string',
      enum: ['BTC', 'USDT_ERC20', 'USDT_TRC20', 'USDT_LIQUID', 'USDT_LIGHTNING', 'LN_BTC', 'LIQUID_BTC'],
    },
    side: { type: 'string', enum: ['BUY', 'SELL'] },
    // Decimal strings, never numbers (RFC-009) — the schema type is
    // "string" specifically so the model can't emit a JSON number here;
    // core/intent-engine.ts's own validateStructure() rejects a
    // non-string maxValue/minValue at the entry boundary regardless, so
    // this is belt-and-suspenders, not the only enforcement point.
    maxValue: { type: 'string' },
    minValue: { type: 'string' },
    currency: { type: 'string' },
    fiatMethod: { type: 'string', enum: ['PIX', 'TED', 'BANK_TRANSFER', 'CRYPTO_DIRECT', 'LIGHTNING_DIRECT', 'CASH', 'OTHER'] },
  },
  required: ['asset', 'side', 'maxValue', 'minValue', 'currency', 'fiatMethod'],
} as const

const BUYER_INTENT_SYSTEM_PROMPT =
  'You are an autonomous wallet agent acting for a buyer. Given the ' +
  "buyer's goal in plain language, produce a structured trade request: " +
  'which asset to buy, the minimum and maximum amount as plain decimal ' +
  'numbers written as strings (e.g. "20.5", never a JSON number), the ' +
  'fiat currency, and the fiat payment method. Reply only with the ' +
  'requested JSON.'

// ─── Structured Offer generation (new) — a SellerAgent's symmetric
// capability, matching modules/open-liquidity/liquidity.service.ts's
// CreateOfferInput shape ────────────────────────────────────────────────────
export interface GeneratedOfferIntent {
  asset: string
  side: 'BUY' | 'SELL'
  minAmount: string
  maxAmount: string
  paymentMethod: string
}

const OFFER_INTENT_SCHEMA = {
  type: 'object',
  properties: {
    asset: {
      type: 'string',
      enum: ['BTC', 'USDT_ERC20', 'USDT_TRC20', 'USDT_LIQUID', 'USDT_LIGHTNING', 'LN_BTC', 'LIQUID_BTC'],
    },
    side: { type: 'string', enum: ['BUY', 'SELL'] },
    minAmount: { type: 'string' },
    maxAmount: { type: 'string' },
    paymentMethod: { type: 'string', enum: ['PIX', 'TED', 'BANK_TRANSFER', 'CRYPTO_DIRECT', 'LIGHTNING_DIRECT', 'CASH', 'OTHER'] },
  },
  required: ['asset', 'side', 'minAmount', 'maxAmount', 'paymentMethod'],
} as const

const SELLER_OFFER_SYSTEM_PROMPT =
  "You are an autonomous wallet agent acting for a seller. Given the seller's " +
  'goal in plain language, produce a structured sell offer: which asset to ' +
  'sell, the minimum and maximum amount as plain decimal numbers written as ' +
  'strings (e.g. "20.5", never a JSON number), and the fiat payment method ' +
  'the seller accepts. Reply only with the requested JSON.'

export class QvacAgentProvider {
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

  private async structuredCompletion<T>(
    systemPrompt: string,
    userPrompt: string,
    schemaName: string,
    schema: Record<string, unknown>,
    onProgress?: (p: unknown) => void
  ): Promise<T> {
    const modelId = await this.ensureModel(onProgress)

    const run = completion({
      modelId,
      history: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      responseFormat: { type: 'json_schema', json_schema: { name: schemaName, schema } },
    })

    const final = await run.final
    // The model is constrained to this schema server-side (llama.cpp GBNF
    // grammar, per @qvac/sdk's responseFormat docs) — a parse failure here
    // means the constraint itself broke, not that the model wandered off
    // schema, so this is deliberately not wrapped in a try/catch that
    // silently falls back to a fake result.
    return JSON.parse(final.contentText) as T
  }

  async assessIntentRisk(intent: AssessableIntent, onProgress?: (p: unknown) => void): Promise<IntentRiskAssessment> {
    const prompt = `Trade intent to assess:
- asset: ${intent.asset}
- side: ${intent.side}
- amount range: ${intent.minValue ?? 'unspecified'} to ${intent.maxValue ?? 'unspecified'}
- currency: ${intent.currency ?? 'unspecified'}
- fiat method: ${intent.fiatMethod ?? 'unspecified'}

Respond with your risk assessment as JSON matching the requested schema.`

    return this.structuredCompletion<IntentRiskAssessment>(
      RISK_SYSTEM_PROMPT,
      prompt,
      'intent_risk_assessment',
      RISK_ASSESSMENT_SCHEMA,
      onProgress
    )
  }

  async generateTradeIntent(goal: string, onProgress?: (p: unknown) => void): Promise<GeneratedTradeIntent> {
    return this.structuredCompletion<GeneratedTradeIntent>(
      BUYER_INTENT_SYSTEM_PROMPT,
      goal,
      'trade_intent',
      TRADE_INTENT_SCHEMA,
      onProgress
    )
  }

  async generateOfferIntent(goal: string, onProgress?: (p: unknown) => void): Promise<GeneratedOfferIntent> {
    return this.structuredCompletion<GeneratedOfferIntent>(
      SELLER_OFFER_SYSTEM_PROMPT,
      goal,
      'offer_intent',
      OFFER_INTENT_SCHEMA,
      onProgress
    )
  }

  // Frees the model's memory (GPU/CPU) — call when done with a batch of
  // calls across every capability above, not after each individual one,
  // since loadModel() is the expensive step (first call downloads
  // ~737MB; every call after that just re-uses the already-loaded model
  // until this is called).
  async dispose(): Promise<void> {
    if (!this.modelId) return
    const modelId = this.modelId
    this.modelId = null
    this.loading = null
    await unloadModel({ modelId })
  }
}

export const qvacAgentProvider = new QvacAgentProvider()
