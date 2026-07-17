/**
 * Sails Protocol — Emulação: Comprador PIX ➡️ Vendedor USDT
 *
 * Two local agents (open-agents/buyer-agent.ts, seller-agent.ts) simulate
 * two Satsails Wallet instances, each autonomously generating their own
 * structured request via QVAC (open-agents/qvac-agent.provider.ts, real
 * local LLM inference) before anything is persisted:
 *
 *   SellerAgent  → proposes an offer shape (asset/side/amount range/
 *                  payment method) from a plain-language goal
 *   BuyerAgent   → generates a real TradeIntentPayload (common/types/
 *                  intent.ts) from a plain-language goal — "solicitando
 *                  a compra de USDT enviando um PIX"
 *
 * Both outputs pass through the same real validation every other client
 * of this system does — intentEngine.create()'s CISO Byzantine/Economic
 * rules for the buyer's Intent, liquidityRouter.createOffer()'s Prisma
 * write for the seller's offer. Neither is trusted specially for being
 * LLM-generated (qvac-agent.provider.ts's own doc comment states this
 * once, for both agents).
 *
 * From there the flow continues through every other real piece built in
 * this pass: OpenP2P negotiation (Pears) → QVAC risk check on the
 * resulting Trade → OpenSettlement escrow lifecycle → WDK USDT
 * settlement (real @tetherto/wdk-wallet-evm calls when configured).
 *
 * Requires a reachable Postgres/Redis (DATABASE_URL/REDIS_URL) — this
 * script exercises the real service layer, not a mock of it, so it has
 * the same infrastructure requirement `npm run dev` does. Not run live
 * as part of this pass — no Postgres/Redis reachable in the environment
 * this was written in (same limitation TODO.md documents everywhere
 * else in this project). Each individual piece it calls into is already
 * built and, where the environment allowed it, live-tested — see
 * tests/wdkSettlementProvider.test.ts and qvac-agent.provider.ts's own
 * live smoke-test note.
 *
 * WDK USDT settlement is only real when MOCK_ESCROW=false and
 * WDK_SEED_PHRASE/WDK_USDT_CONTRACT are set (.env.example) — otherwise
 * escrow.service.ts's own config gate (RT-001) silently uses
 * MockSettlementProvider, same as every other escrow flow in this repo.
 * This script never assumes real funds moved; it reports which provider
 * actually ran.
 *
 * The "buyer's USDT address" in the release step is derived from the
 * *same* WDK seed as the treasury/escrow accounts (a different account
 * index), standing in for the buyer's own independently-controlled
 * wallet — this reference implementation doesn't onboard per-user EVM
 * keys yet (participants only have Ed25519 identity keys,
 * common/database's User model). A real deployment would ask the buyer
 * for their own address here instead.
 */
import { config } from '../config'
import { connectDatabase } from '../common/database'
import { connectRedis } from '../common/redis'
import { identityService } from '../modules/open-identity/identity.service'
import { liquidityRouter } from '../modules/open-liquidity/liquidity.service'
import { tradeService } from '../modules/open-p2p/trade.service'
import { escrowService } from '../modules/open-settlement/escrow.service'
import { wdkSettlementProvider } from '../modules/open-settlement/wdk-settlement.provider'
import { qvacAgentProvider } from '../modules/open-agents/qvac-agent.provider'
import { BuyerAgent } from '../modules/open-agents/buyer-agent'
import { SellerAgent } from '../modules/open-agents/seller-agent'
import { intentEngine } from '../core/intent-engine'

const BUYER_DEMO_ACCOUNT_INDEX = 1 // treasury is account 0 — see wdk-settlement.provider.ts

function step(n: number, total: number, label: string) {
  console.log(`\n[${n}/${total}] ${label}`)
}

async function main() {
  console.log('=== Sails Protocol — Emulação: Comprador PIX ➡️ Vendedor USDT ===')

  await connectDatabase()
  await connectRedis()

  const TOTAL = 9

  step(1, TOTAL, 'Registrando identidades (Sails OpenIdentity)...')
  const suffix = Date.now()
  const seller = await identityService.register({ publicKey: `demo-seller-${suffix}`, displayName: 'Vendedor USDT' })
  const buyer = await identityService.register({ publicKey: `demo-buyer-${suffix}`, displayName: 'Comprador PIX' })
  console.log(`   Vendedor: ${seller.id}`)
  console.log(`   Comprador: ${buyer.id}`)

  const sellerAgent = new SellerAgent(qvacAgentProvider, { participantId: seller.id, label: 'seller-wallet' })
  const buyerAgent = new BuyerAgent(qvacAgentProvider, { participantId: buyer.id, label: 'buyer-wallet' })

  step(2, TOTAL, 'Agente Vendedor gera a oferta autonomamente via QVAC (inferência local — primeira chamada baixa ~737MB)...')
  const proposedOffer = await sellerAgent.offerUsdtForPix()
  console.log(`   Gerado por ${sellerAgent.agentId}: ${JSON.stringify(proposedOffer)}`)

  step(3, TOTAL, 'Oferta é publicada (Sails OpenLiquidity)...')
  const offer = await liquidityRouter.createOffer({
    userId: seller.id,
    ...proposedOffer,
    priceUsd: '5.45', // BRL por USDT — preço de mercado externo, QVAC não decide isso (seller-agent.ts's own doc comment)
  })
  console.log(`   Offer: ${offer.id} (${offer.minAmount}-${offer.maxAmount} ${offer.asset} via ${offer.paymentMethod})`)

  step(4, TOTAL, 'Agente Comprador gera o Intent autonomamente via QVAC ("solicitando a compra de USDT enviando um PIX")...')
  const buyerPayload = await buyerAgent.requestUsdtViaPix('500')
  console.log(`   Gerado por ${buyerAgent.agentId}: ${JSON.stringify(buyerPayload)}`)

  step(5, TOTAL, 'Intent passa pela validação real do protocolo (Core: CISO Byzantine + Economic rules)...')
  const intent = await intentEngine.create('TradeIntent', buyerPayload, buyer.id, buyerAgent.agentId)
  console.log(`   Intent: ${intent.id} — status ${intent.status} (agentId: ${intent.agentId ?? 'n/a'})`)

  step(6, TOTAL, 'Comprador aceita a oferta e abre negociação (Sails OpenP2P, canal via Pears)...')
  const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: offer.minAmount.toString() })
  console.log(`   Trade: ${trade.id} — ${trade.amount} ${trade.asset}`)

  step(7, TOTAL, 'QVAC avalia risco do Trade resultante (Sails OpenAgents)...')
  const risk = await qvacAgentProvider.assessIntentRisk({
    asset: trade.asset,
    side: 'SELL',
    minValue: offer.minAmount.toString(),
    maxValue: offer.maxAmount.toString(),
    currency: 'BRL',
    fiatMethod: 'PIX',
  })
  console.log(`   Risco: ${risk.risk} | Recomendação: ${risk.recommendation}`)
  console.log(`   Raciocínio: ${risk.reasoning}`)
  if (risk.recommendation === 'reject') {
    // RFC-007 D7: QVAC/OpenAgents produces a signal, never a unilateral
    // action — a real deployment routes this to the Policy Engine, which
    // decides. This demo script plays that role and continues anyway,
    // since halting here would just be this script deciding, not the
    // Policy Engine.
    console.log('   (QVAC sinalizou "reject" — em produção isso vai para o Policy Engine decidir, não é bloqueado aqui automaticamente. Prosseguindo.)')
  }

  step(8, TOTAL, 'Vendedor cria e trava o escrow (Sails OpenSettlement)...')
  const escrow = await escrowService.createEscrow({
    tradeId: trade.id,
    type: 'WDK_USDT_EVM',
    lockedAmount: trade.amount.toString(),
    asset: 'USDT_ERC20',
  })
  const locked = await escrowService.lockFunds(escrow.id, seller.id)
  const usingRealWdk = !config.features.mockEscrow && Boolean(config.wdk.seedPhrase)
  console.log(`   Escrow: ${locked.id} — status ${locked.status} (provider: ${usingRealWdk ? 'WDK_USDT_EVM real (testnet)' : 'MOCK — MOCK_ESCROW/WDK_SEED_PHRASE não configurados para real'})`)
  console.log(`   Tx de lock: ${locked.txLockId}`)

  console.log('\n   Comprador paga PIX (fora do protocolo — fiat nunca é intermediado, PROJECT_CONTEXT.md §1)...')
  await escrowService.markPaymentSent(escrow.id, buyer.id)
  console.log('   Pagamento PIX marcado como enviado (uma prova real viria via Sails OpenProof em produção — RFC-003)')

  step(9, TOTAL, 'Vendedor libera USDT para o Comprador...')
  const buyerAddress = usingRealWdk
    ? await wdkSettlementProvider.getAccountAddress(BUYER_DEMO_ACCOUNT_INDEX)
    : 'mock-buyer-address'
  const released = await escrowService.releaseFunds(escrow.id, buyerAddress, seller.id)
  console.log(`   Liberado para ${buyerAddress}`)
  console.log(`   Tx de release: ${released.txReleaseId}`)

  console.log('\n=== Fluxo completo: Agentes (QVAC) → Intent/Oferta → Negociação (Pears) → Risco (QVAC) → Settlement (WDK) → Liberação ===')

  await qvacAgentProvider.dispose()
  process.exit(0)
}

main().catch((err) => {
  console.error('\n[demo] Falhou:', err)
  process.exit(1)
})
