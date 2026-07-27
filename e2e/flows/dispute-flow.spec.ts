import { expect } from '@playwright/test'
import { test } from '../fixtures/wallet.fixture'
import { CreateTradePage } from '../pages/create-trade.page'
import { TradePage } from '../pages/trade.page'

/**
 * Covers opening a dispute only — real, via Trade.tsx's actual "⚠️ Abrir
 * Disputa" flow (real POST /v1/settlement/escrow/:id/dispute,
 * settlement.service.ts's dispute(), which persists a Dispute row and
 * assigns an arbiter per RFC-007 D4).
 *
 * Resolution is deliberately NOT covered here (confirmed with the user
 * before writing this file): packages/sails-ui/src/pages/admin/Disputes.tsx
 * is 100% mock today — `MOCK_DISPUTES`, and its own `resolve()` has a
 * `// TODO: real POST /v1/settlement/disputes/:id/resolve` comment and
 * never calls the real API. There is no real UI path to drive a
 * resolution through today; wiring that page to the real endpoint is a
 * separate, out-of-scope gap (tracked, not fixed as a side effect of
 * writing this E2E test).
 */
test.setTimeout(60_000)

test('dispute flow: buyer opens a real dispute mid-trade', async ({ aliceWallet: seller, bobWallet: buyer }) => {
  const createTrade = new CreateTradePage(buyer)
  const sellerTrade = new TradePage(seller)
  const buyerTrade = new TradePage(buyer)

  // See p2p-trade-happy-path.spec.ts's header comment: a tiny BRL price
  // rounds to priceUsd=0.00 via PublishOffer.tsx's `.toFixed(2)` FX
  // conversion — this range stays cheap but avoids that.
  const priceBrl = (5 + Math.random() * 5).toFixed(4)
  const pixKey = `e2e-dispute-${Date.now()}@sailsprotocol.test`

  let offerId = ''
  await test.step('seller publishes a real offer', async () => {
    await seller.getByRole('link', { name: 'Perfil' }).click()
    await seller.getByRole('button', { name: 'Nova Oferta' }).click()
    await seller.getByRole('button', { name: 'Vender' }).click()
    await seller.getByRole('button', { name: 'Todos os ativos' }).click()
    await seller.getByRole('button', { name: 'USDT_ERC20', exact: true }).click()
    await seller.getByPlaceholder('0').fill(priceBrl)
    await seller.getByRole('button', { name: 'Próximo' }).click()

    const amountInputs = seller.getByPlaceholder('0.00')
    await amountInputs.nth(0).fill('10')
    await amountInputs.nth(1).fill('500')
    await seller.getByPlaceholder('Sua chave PIX').fill(pixKey)
    await seller.getByRole('button', { name: 'Próximo' }).click()

    const [offerResponse] = await Promise.all([
      seller.waitForResponse((res) => res.url().includes('/v1/liquidity/offers') && res.request().method() === 'POST'),
      seller.getByRole('button', { name: 'Publicar', exact: true }).click(),
    ])
    offerId = (await offerResponse.json()).data.id
    expect(offerId).toBeTruthy()
  })

  let tradeUrl = ''
  await test.step('buyer starts a real trade against the offer (direct navigation — see create-trade.page.ts on why)', async () => {
    await createTrade.startTradeDirect(offerId, '20')
    tradeUrl = buyer.url()
  })

  await test.step('seller creates and locks escrow', async () => {
    await seller.goto(tradeUrl)
    await sellerTrade.waitForAuthenticated()
    await sellerTrade.createEscrow()
    await sellerTrade.lockFunds()
  })

  await test.step('buyer opens a real dispute instead of marking payment sent', async () => {
    await buyer.reload()
    await buyerTrade.waitForAuthenticated()
    await expect(buyerTrade.markPaymentSentButton).toBeVisible({ timeout: 10_000 })
    await buyerTrade.openDispute('Vendedor não respondeu no chat após o bloqueio dos fundos')
    // dispute() moves the escrow to DISPUTED — the dispute form closes
    // and the escrow-status badge (EscrowStatusBadge) reflects it.
    await expect(buyer.getByText('Em disputa').first()).toBeVisible({ timeout: 10_000 })
  })

  await test.step('seller sees the trade is disputed on reload', async () => {
    await seller.reload()
    await sellerTrade.waitForAuthenticated()
    await expect(seller.getByText('Em disputa').first()).toBeVisible({ timeout: 10_000 })
  })
})
