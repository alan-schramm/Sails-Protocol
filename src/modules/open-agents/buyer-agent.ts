/**
 * Sails OpenAgents — BuyerAgent
 *
 * Simulates a Satsails Wallet instance acting autonomously for a buyer.
 * `requestTradeIntent()` is the capability this pass exists to prove:
 * given a plain-language goal, QVAC (local LLM inference, no cloud
 * dependency) produces the protocol's real `TradeIntentPayload` shape —
 * not a mock object, the actual type `core/intent-engine.ts` accepts.
 *
 * Trust boundary, stated once here and not repeated at every call site:
 * this output is never handed to anything that moves money without
 * first passing through `intentEngine.create()`'s own CISO Byzantine/
 * Economic rules. An agent producing a malformed or financially insane
 * payload is rejected at that boundary exactly like a human client
 * would be — being LLM-generated grants it no special trust.
 */
import { WalletAgent } from './wallet-agent'
import type { GeneratedTradeIntent } from './qvac-agent.provider'
import type { TradeIntentPayload } from '../../common/types/intent'

export class BuyerAgent extends WalletAgent {
  async requestTradeIntent(goal: string, onProgress?: (p: unknown) => void): Promise<TradeIntentPayload> {
    const generated: GeneratedTradeIntent = await this.provider.generateTradeIntent(goal, onProgress)
    return {
      asset: generated.asset,
      side: generated.side,
      maxValue: generated.maxValue,
      minValue: generated.minValue,
      currency: generated.currency,
      fiatMethod: generated.fiatMethod,
    }
  }

  // The concrete scenario this pass asked for — "solicitando a compra de
  // USDT enviando um PIX" — pre-filled as a goal, still fully autonomous:
  // QVAC decides the actual amount range and side from the prompt, this
  // method doesn't hardcode a TradeIntentPayload and ask QVAC to rubber-stamp it.
  //
  // "ViaPix" in this method's name describes the *counterparty's expected
  // settlement method* — a label the human buyer will act on manually by
  // sending a real PIX transfer outside this protocol, exactly like every
  // other PaymentMethod value in prisma/schema.prisma. This method never
  // calls a banking API and never touches PIX itself (RFC-016, Crypto-
  // Native Agent boundary, rfcs/RFC-016-qvac-crypto-native-agent-boundary.md).
  async requestUsdtViaPix(maxBrl: string, onProgress?: (p: unknown) => void): Promise<TradeIntentPayload> {
    const goal =
      `Quero comprar USDT (rede ERC20) pagando via PIX em reais (BRL). ` +
      `Tenho até ${maxBrl} BRL disponíveis para essa compra. Proponha um ` +
      `intervalo de quantidade (mínimo e máximo) razoável dentro desse limite, ` +
      `não apenas um valor fixo.`
    return this.requestTradeIntent(goal, onProgress)
  }
}
