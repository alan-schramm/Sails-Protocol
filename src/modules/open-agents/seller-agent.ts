/**
 * Sails OpenAgents — SellerAgent
 *
 * Simulates a Satsails Wallet instance acting autonomously for a seller —
 * the symmetric counterpart to BuyerAgent (buyer-agent.ts). Given a
 * plain-language goal, QVAC produces the fields
 * `liquidity.service.ts`'s `createOffer()` needs (minus `userId` and
 * `priceUsd`, which this agent doesn't decide — see the method doc
 * comment below for why).
 *
 * Same trust boundary as BuyerAgent: nothing generated here is trusted
 * blindly. `createOffer()` persists whatever it's given (no CISO-style
 * gate on offer creation exists today the way intent-engine.ts has one
 * for Intents — a genuine, separate gap, not something this agent
 * papers over).
 */
import { WalletAgent } from './wallet-agent'
import type { GeneratedOfferIntent } from './qvac-agent.provider'
import type { CreateOfferInput } from '../open-liquidity/liquidity.service'

export type GeneratedOffer = Omit<CreateOfferInput, 'userId' | 'priceUsd'>

export class SellerAgent extends WalletAgent {
  async proposeOffer(goal: string, onProgress?: (p: unknown) => void): Promise<GeneratedOffer> {
    const generated: GeneratedOfferIntent = await this.provider.generateOfferIntent(goal, onProgress)
    return {
      asset: generated.asset as CreateOfferInput['asset'],
      side: generated.side,
      minAmount: generated.minAmount,
      maxAmount: generated.maxAmount,
      paymentMethod: generated.paymentMethod as CreateOfferInput['paymentMethod'],
    }
  }

  // The concrete scenario symmetric to BuyerAgent.requestUsdtViaPix() —
  // priceUsd is deliberately NOT something QVAC decides here: market
  // price is external data (OpenLiquidity's future pricing-provider
  // integration, PROTOCOL_ECONOMY.md — an LLM has no live price feed to
  // reason from, only whatever's in its training data, which would be
  // stale and wrong the moment it's used). The caller supplies the real
  // price; this agent only autonomously decides the quantity range and
  // confirms the payment method from the stated goal.
  async offerUsdtForPix(onProgress?: (p: unknown) => void): Promise<GeneratedOffer> {
    const goal =
      'Quero vender USDT (rede ERC20) recebendo pagamento via PIX em reais (BRL). ' +
      'Proponha um intervalo de quantidade (mínimo e máximo) razoável para uma oferta P2P.'
    return this.proposeOffer(goal, onProgress)
  }
}
