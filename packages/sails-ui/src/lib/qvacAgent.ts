/**
 * Mocked QVAC agent interaction for this UI — modeled on the real
 * `QvacAgentProvider` (`src/modules/open-agents/qvac-agent.provider.ts`)
 * and its callers, `BuyerAgent.requestTradeIntent()` /
 * `SellerAgent.proposeOffer()` (`buyer-agent.ts`/`seller-agent.ts`).
 *
 * That real code exists and runs a real local LLM
 * (`@qvac/sdk`, LLAMA_3_2_1B_INST_Q4_0, llama.cpp, no cloud dependency) —
 * but as of this writing nothing calls it over HTTP. It only runs inside
 * `src/demo/pix-to-usdt-flow.ts` and inside `core/intent-engine.ts`'s own
 * validation path. There is no `POST /v1/agents/...` route a browser
 * could call. So this file fakes the *shape and latency* of a real call
 * (structured JSON out, a few seconds of "thinking") without claiming a
 * live model runs anywhere near this UI — the honest swap-in later is a
 * real route wrapping `qvacAgentProvider.generateTradeIntent()` /
 * `.generateOfferIntent()` / `.assessIntentRisk()`, not a change to this
 * file's call sites.
 */
import type { AssetType, PaymentMethod, TradeSide } from '../types'

export interface AgentGeneratedIntent {
  asset: AssetType
  side: TradeSide
  minValue: string
  maxValue: string
  currency: string
  fiatMethod: PaymentMethod
}

export type AgentRiskLevel = 'low' | 'medium' | 'high'
export type AgentRiskRecommendation = 'proceed' | 'hold' | 'reject'

export interface AgentRiskAssessment {
  risk: AgentRiskLevel
  reasoning: string
  recommendation: AgentRiskRecommendation
}

const ASSET_HINTS: [RegExp, AssetType][] = [
  [/usdt|tether|d[oó]lar digital/i, 'USDT_ERC20'],
  [/lightning|ln\b|relâmpago/i, 'LN_BTC'],
  [/liquid/i, 'LIQUID_BTC'],
  [/bitcoin|btc/i, 'BTC'],
]

const METHOD_HINTS: [RegExp, PaymentMethod][] = [
  [/pix/i, 'PIX'],
  [/ted/i, 'TED'],
  [/transfer[êe]ncia|bank/i, 'BANK_TRANSFER'],
  [/dinheiro|cash/i, 'CASH'],
]

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Very small heuristic parse, deliberately not an LLM — this is a stand-in
// for what generateTradeIntent()/generateOfferIntent() would return, not an
// attempt to reproduce their reasoning client-side.
export async function generateIntentWithQvac(goal: string, side: TradeSide): Promise<AgentGeneratedIntent> {
  await delay(1400 + Math.random() * 900)

  const asset = ASSET_HINTS.find(([re]) => re.test(goal))?.[1] ?? 'BTC'
  const fiatMethod = METHOD_HINTS.find(([re]) => re.test(goal))?.[1] ?? 'PIX'
  const amountMatch = goal.match(/(\d[\d.,]*)/)
  const maxAmount = amountMatch ? amountMatch[1].replace(/\./g, '').replace(',', '.') : '1000'
  const maxNum = Number(maxAmount) || 1000

  return {
    asset,
    side,
    minValue: (maxNum * 0.1).toFixed(2),
    maxValue: maxNum.toFixed(2),
    currency: 'BRL',
    fiatMethod,
  }
}

export async function assessRiskWithQvac(intent: {
  asset: AssetType
  side: TradeSide
  maxValue: number
  minValue: number
}): Promise<AgentRiskAssessment> {
  await delay(900 + Math.random() * 700)

  if (intent.maxValue > 8000) {
    return {
      risk: 'medium',
      reasoning: 'Valor acima da faixa usual para este par — recomendável confirmar identidade da contraparte antes de liberar o escrow.',
      recommendation: 'hold',
    }
  }

  return {
    risk: 'low',
    reasoning: 'Valor, moeda e método de pagamento consistentes entre si. Nenhuma bandeira vermelha identificada.',
    recommendation: 'proceed',
  }
}
