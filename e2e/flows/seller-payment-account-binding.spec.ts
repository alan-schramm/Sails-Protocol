import { expect, type Page } from '@playwright/test'
import { test } from '../fixtures/wallet.fixture'
import { HomePage } from '../pages/home.page'
import { TradePage } from '../pages/trade.page'

/**
 * #235 R7H-E3B — the seller's PaymentAccount binding through the real UI, on the governed rail (BTC on-chain →
 * MULTISIG under trade-limit policy V1). Same real local stack as p2p-trade-happy-path.spec.ts: real Postgres,
 * Redis, Fastify server and Vite UI, two real identities. Requires a database migrated through R7H-E3.
 *
 * SELL: the maker types their PIX key, confirms the binding, publishes — the UI registers the account, proves it
 * is theirs and sends only its hash with the offer; the buyer takes it; the seller creates the protected escrow.
 * BUY: the taker is the seller — they type and confirm their own key on the offer page, and the trade request
 * carries its hash. Negative: an ineligible method is blocked before publishing, and a trade created without a
 * binding (a pre-E3B client, simulated by stripping the hash from the request) shows the seller why no
 * protected escrow can exist instead of offering a button that can only fail.
 */
test.setTimeout(120_000)

const priceBrl = () => String(300_000 + Math.floor(Math.random() * 1000))
const pixKey = () => `e3b-${Date.now()}-${Math.floor(Math.random() * 1e6)}@sailsprotocol.test`

async function openNewOffer(page: Page, side: 'Vender' | 'Comprar') {
  await page.getByRole('link', { name: 'Perfil' }).click()
  await page.getByRole('button', { name: 'Nova Oferta' }).click()
  await expect(page).toHaveURL('/profile/new-offer')
  await page.getByRole('button', { name: side }).click()
  await page.getByRole('button', { name: 'Ativo' }).click()
  await page.getByRole('button', { name: 'Bitcoin (on-chain)', exact: true }).click()
  await page.getByPlaceholder('0').fill(priceBrl())
  await page.getByRole('button', { name: 'Próximo' }).click()
  const amounts = page.getByPlaceholder('0.00')
  await amounts.nth(0).fill('0.0001')
  await amounts.nth(1).fill('0.001')
}

async function publish(page: Page): Promise<{ id: string; body: Record<string, unknown> }> {
  await page.getByRole('button', { name: 'Próximo' }).click()
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/v1/liquidity/offers') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Publicar', exact: true }).click(),
  ])
  expect(res.ok()).toBe(true)
  await expect(page).toHaveURL('/profile')
  return { id: (await res.json()).data.id, body: res.request().postDataJSON() }
}

async function openOffer(page: Page, offerId: string) {
  const home = new HomePage(page)
  await page.getByRole('link', { name: 'Market', exact: true }).first().click() // in-app navigation keeps the session
  await home.filterByAsset('BTC')
  await home.openOffer(offerId)
}

async function startTrade(page: Page): Promise<{ id: string; body: Record<string, unknown> }> {
  await page.getByPlaceholder('0.00').fill('0.0005')
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/v1/openp2p/trades') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Iniciar Trade' }).click(),
  ])
  expect(res.ok()).toBe(true)
  await expect(page).toHaveURL(/\/trade\//)
  return { id: (await res.json()).data.id, body: res.request().postDataJSON() }
}

async function createProtectedEscrow(page: Page) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/v1/settlement/escrow') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Criar Escrow' }).click(),
  ])
  expect(res.ok()).toBe(true)
  const escrow = (await res.json()).data
  expect([escrow.type, escrow.asset]).toEqual(['MULTISIG', 'BTC'])
}

test('SELL: the maker binds their own PIX account when publishing; the buyer takes it; the seller creates the protected escrow', async ({ aliceWallet: seller, bobWallet: buyer }) => {
  const key = pixKey()
  let offerId = ''
  await test.step('seller types the key, must confirm the binding, publishes with only its hash', async () => {
    await openNewOffer(seller, 'Vender')
    await expect(seller.getByText('Sua chave de recebimento')).toBeVisible()
    await seller.getByPlaceholder('Sua chave PIX').fill(key)
    await seller.getByRole('button', { name: 'Próximo' }).click()
    await expect(seller.getByText('Confirme o vínculo da sua chave de recebimento ao anúncio.')).toBeVisible()
    await seller.getByRole('checkbox').check()
    const registration = seller.waitForResponse((r) => r.url().includes('/v1/settlement/payment-accounts') && r.request().method() === 'POST')
    const offer = await publish(seller)
    const account = await (await registration).json()
    expect(account.data.accountHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify((await registration).request().postDataJSON())).not.toContain(key) // the key itself is never registered
    expect(offer.body.paymentAccountHash).toBe(account.data.accountHash)
    offerId = offer.id
  })

  let tradeId = ''
  await test.step('buyer takes the SELL offer — no account field for the buyer', async () => {
    await openOffer(buyer, offerId)
    await expect(buyer.getByText('Sua chave de recebimento')).toHaveCount(0)
    const trade = await startTrade(buyer)
    expect(trade.body.paymentAccountHash).toBeUndefined()
    tradeId = trade.id
  })

  await test.step('seller creates the protected escrow (MULTISIG/BTC)', async () => {
    const sellerTrade = new TradePage(seller)
    await sellerTrade.reauthenticate(tradeId)
    await createProtectedEscrow(seller)
  })
})

test('BUY: the taker is the seller — they bind their own key on the offer page, never the publisher\'s; they create the escrow', async ({ aliceWallet: maker, bobWallet: taker }) => {
  let offerId = ''
  await test.step('maker (the buyer) publishes a BUY offer — no binding asked of the payer', async () => {
    await openNewOffer(maker, 'Comprar')
    await expect(maker.getByRole('checkbox')).toHaveCount(0)
    await maker.getByPlaceholder('Sua chave PIX').fill('pago via PIX')
    const offer = await publish(maker)
    expect(offer.body.paymentAccountHash).toBeUndefined()
    offerId = offer.id
  })

  const key = pixKey()
  let tradeId = ''
  await test.step('taker must give and confirm their receiving key before the trade starts', async () => {
    await openOffer(taker, offerId)
    await taker.getByPlaceholder('0.00').fill('0.0005')
    await taker.getByRole('button', { name: 'Iniciar Trade' }).click()
    await expect(taker.getByText('Informe a sua chave de recebimento.')).toBeVisible()
    await taker.getByPlaceholder('Sua chave PIX').fill(key)
    await taker.getByRole('checkbox').check()
    const registration = taker.waitForResponse((r) => r.url().includes('/v1/settlement/payment-accounts') && r.request().method() === 'POST')
    const trade = await startTrade(taker)
    const account = (await (await registration).json()).data
    expect(trade.body.paymentAccountHash).toBe(account.accountHash)
    tradeId = trade.id
  })

  await test.step('the publisher (buyer) is offered no escrow button; the taker (seller) creates the escrow', async () => {
    const makerTrade = new TradePage(maker)
    await makerTrade.reauthenticate(tradeId)
    await expect(maker.getByText('Aguardando o vendedor criar o escrow.')).toBeVisible()
    await new TradePage(taker).reauthenticate(tradeId)
    await createProtectedEscrow(taker)
  })
})

test('NEGATIVE: an ineligible method is blocked before publishing; an unbound (pre-E3B) trade tells the seller why no escrow can exist', async ({ aliceWallet: seller, bobWallet: buyer }) => {
  await test.step('TED on BTC: the policy in force does not make it eligible — the UI says so and does not proceed', async () => {
    await openNewOffer(seller, 'Vender')
    await seller.getByRole('combobox', { name: 'Método de pagamento' }).click()
    await seller.getByRole('option', { name: 'TED' }).click()
    await expect(seller.getByRole('alert').filter({ hasText: 'TED não é aceito para escrow protegido' })).toBeVisible()
    await seller.getByPlaceholder('Dados para o comprador enviar o pagamento').fill('conta TED')
    await seller.getByRole('button', { name: 'Próximo' }).click()
    await expect(seller.getByText('Este método de pagamento não é aceito para escrow protegido neste ativo.')).toBeVisible()
    await expect(seller.getByRole('button', { name: 'Publicar', exact: true })).toHaveCount(0)
  })

  let offerId = ''
  await test.step('a BUY offer the seller takes through a client that sends no binding', async () => {
    await openNewOffer(buyer, 'Comprar')
    await buyer.getByPlaceholder('Sua chave PIX').fill('pago via PIX')
    offerId = (await publish(buyer)).id
    await openOffer(seller, offerId)
    await seller.getByPlaceholder('Sua chave PIX').fill(pixKey())
    await seller.getByRole('checkbox').check()
    await seller.route('**/v1/openp2p/trades', async (route) => {
      const body = route.request().postDataJSON()
      delete body.paymentAccountHash
      await route.continue({ postData: JSON.stringify(body) })
    })
    const trade = await startTrade(seller)
    await seller.unroute('**/v1/openp2p/trades')
    await new TradePage(seller).reauthenticate(trade.id)
    await expect(seller.getByRole('alert').filter({ hasText: 'sem uma conta de recebimento do vendedor vinculada' })).toBeVisible()
    await expect(seller.getByRole('button', { name: 'Criar Escrow' })).toHaveCount(0)
  })
})
