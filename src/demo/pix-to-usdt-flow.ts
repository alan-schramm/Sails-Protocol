/**
 * Sails Protocol — Emulação: Comprador PIX ➡️ Vendedor USDT
 *
 * Ties together every real piece built for this pass into one runnable
 * flow: Intent (via trade.service.ts's createTrade, which itself opens
 * negotiation.service.ts's channel — RFC-002/Pears) → QVAC risk check
 * (open-agents/qvac-risk.service.ts, real local LLM inference) →
 * OpenSettlement escrow lifecycle (escrow.service.ts) → WDK USDT
 * settlement (wdk-settlement.provider.ts, real @tetherto/wdk-wallet-evm
 * calls when configured).
 *
 * Requires a reachable Postgres/Redis (DATABASE_URL/REDIS_URL) — this
 * script exercises the real service layer, not a mock of it, so it has
 * the same infrastructure requirement `npm run dev` does. Not run live
 * as part of this pass — no Postgres/Redis reachable in the environment
 * this was written in (same limitation TODO.md documents everywhere
 * else in this project). Each individual piece it calls into is already
 * built and, where the environment allowed it, live-tested — see
 * tests/wdkSettlementProvider.test.ts and the QVAC risk service's own
 * live smoke-test note.
 *
 * WDK USDT settlement is only real when MOCK_ESCROW=false and
 * WDK_SEED_PHRASE/WDK_USDT_CONTRACT are set (.env.example) — otherwise
 * escrow.service.ts's own config gate (RT-001) silently uses
 * MockSettlementProvider, same as every other escrow flow in this repo.
 * This script never assumes real funds moved; it reports which provider
 * actually ran.
 *
 * The "buyer's USDT address" in step 7 is derived from the *same* WDK
 * seed as the treasury/escrow accounts (a different account index),
 * standing in for the buyer's own independently-controlled wallet —
 * this reference implementation doesn't onboard per-user EVM keys yet
 * (participants only have Ed25519 identity keys, common/database's
 * User model). A real deployment would ask the buyer for their own
 * address here instead.
 */
import { config } from '../config'
import { connectDatabase } from '../common/database'
import { connectRedis } from '../common/redis'
import { identityService } from '../modules/open-identity/identity.service'
import { liquidityRouter } from '../modules/open-liquidity/liquidity.service'
import { tradeService } from '../modules/open-p2p/trade.service'
import { escrowService } from '../modules/open-settlement/escrow.service'
import { wdkSettlementProvider } from '../modules/open-settlement/wdk-settlement.provider'
import { qvacRiskService } from '../modules/open-agents/qvac-risk.service'

const BUYER_DEMO_ACCOUNT_INDEX = 1 // treasury is account 0 — see wdk-settlement.provider.ts

function step(n: number, total: number, label: string) {
  console.log(`\n[${n}/${total}] ${label}`)
}

async function main() {
  console.log('=== Sails Protocol — Emulação: Comprador PIX ➡️ Vendedor USDT ===')

  await connectDatabase()
  await connectRedis()

  const TOTAL = 7

  step(1, TOTAL, 'Registrando identidades (Sails OpenIdentity)...')
  const suffix = Date.now()
  const seller = await identityService.register({ publicKey: `demo-seller-${suffix}`, displayName: 'Vendedor USDT' })
  const buyer = await identityService.register({ publicKey: `demo-buyer-${suffix}`, displayName: 'Comprador PIX' })
  console.log(`   Vendedor: ${seller.id}`)
  console.log(`   Comprador: ${buyer.id}`)

  step(2, TOTAL, 'Vendedor publica oferta de venda de USDT (Sails OpenLiquidity)...')
  const offer = await liquidityRouter.createOffer({
    userId: seller.id,
    asset: 'USDT_ERC20',
    side: 'SELL',
    priceUsd: '5.45', // BRL por USDT — ilustrativo
    minAmount: '10',
    maxAmount: '500',
    paymentMethod: 'PIX',
  })
  console.log(`   Offer: ${offer.id} (${offer.minAmount}-${offer.maxAmount} USDT_ERC20 via PIX)`)

  step(3, TOTAL, 'Comprador aceita a oferta e abre negociação (Sails OpenP2P, canal via Pears)...')
  const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '100' })
  console.log(`   Trade: ${trade.id} — ${trade.amount} USDT_ERC20`)

  step(4, TOTAL, 'QVAC avalia risco do Intent (Sails OpenAgents, inferência local — primeira chamada baixa ~737MB)...')
  const risk = await qvacRiskService.assessIntent({
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

  step(5, TOTAL, 'Vendedor cria e trava o escrow (Sails OpenSettlement)...')
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

  step(6, TOTAL, 'Comprador paga PIX (fora do protocolo — fiat nunca é intermediado, PROJECT_CONTEXT.md §1)...')
  await escrowService.markPaymentSent(escrow.id, buyer.id)
  console.log('   Pagamento PIX marcado como enviado (uma prova real viria via Sails OpenProof em produção — RFC-003)')

  step(7, TOTAL, 'Vendedor libera USDT para o Comprador...')
  const buyerAddress = usingRealWdk
    ? await wdkSettlementProvider.getAccountAddress(BUYER_DEMO_ACCOUNT_INDEX)
    : 'mock-buyer-address'
  const released = await escrowService.releaseFunds(escrow.id, buyerAddress, seller.id)
  console.log(`   Liberado para ${buyerAddress}`)
  console.log(`   Tx de release: ${released.txReleaseId}`)

  console.log('\n=== Fluxo completo: Intent → Negociação (Pears) → Risco (QVAC) → Settlement (WDK) → Liberação ===')

  await qvacRiskService.dispose()
  process.exit(0)
}

main().catch((err) => {
  console.error('\n[demo] Falhou:', err)
  process.exit(1)
})
