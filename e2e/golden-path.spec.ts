import { test, expect, type Page } from '@playwright/test'

/**
 * Real finding from writing this spec, not fixed here (a UI robustness
 * gap, not a test-infra workaround): `AuthContext.tsx` computes a real
 * `loading` boolean for its post-reload re-authentication window (the
 * challenge-response round trip a fresh page load re-runs from the
 * stored keypair) but no page or layout component ever reads it —
 * checked directly (`grep -rn "\.loading" packages/sails-ui/src`, zero
 * matches outside AuthContext.tsx itself). A full page reload leaves
 * every form fully interactive while re-auth is still in flight; a fast
 * actor (a script, or just a quick human) can act before `user`
 * populates, and the action silently no-ops (`PublishOffer.tsx`'s
 * `handlePublish()`: `if (!user || ...) return`) rather than erroring.
 * Registered in `docs/TODO.md` §22 as a follow-up. This helper waits
 * for the same signal `TopNav.tsx` itself uses to decide authenticated
 * vs not (`user ? ... : <Link to="/login">Conectar</Link>`), the same
 * workaround a real user doesn't have available to them.
 */
async function waitForAuthenticated(page: Page): Promise<void> {
  await expect(page.getByRole('link', { name: 'Conectar' })).toHaveCount(0, { timeout: 15_000 })
}

/**
 * The official protocol test — CTO-directed hardening pass, 2026-07-20
 * ("testes E2E automatizados, prioridade máxima... esse teste passa a
 * ser o teste oficial do protocolo").
 *
 * Two real, independent browser contexts (separate localStorage, so two
 * genuinely distinct Ed25519 identities — the same isolation a real
 * buyer and seller on two different devices would have) drive the full
 * golden path against the real local stack: real Postgres (§18), real
 * Memurai/Redis, the real Fastify server, the real Vite-built UI. No
 * mocked fetch, no mocked WebSocket — the same "mock only the database
 * boundary a unit test needs to, never the thing actually being proven"
 * discipline `tests/fullTradeLifecycle.test.ts` established for the
 * service layer, extended here to the real browser + real network:
 * register → publish → discover → trade → chat → escrow → settle.
 *
 * A real finding from writing this test, not fixed here (already
 * registered in `docs/TODO.md` §22's WebSocket-reconnection item, same
 * root cause): Trade.tsx never subscribes to escrow-status WS frames,
 * only chat messages — a counterparty's escrow action (lock, mark-paid,
 * release) never appears on the other party's already-open tab without
 * a reload. The `.reload()` calls below aren't test scaffolding around
 * a flaky UI; they're accurately modeling what a real user has to do
 * today.
 */
test.setTimeout(60_000)

test('golden path: register, publish, discover, trade, chat, escrow, settle', async ({ browser }) => {
  const sellerContext = await browser.newContext()
  const buyerContext = await browser.newContext()
  const seller = await sellerContext.newPage()
  const buyer = await buyerContext.newPage()

  // Distinctive per-run values so this spec is safe to run repeatedly
  // against the same shared local database (leftover offers from manual
  // testing sessions are expected to already be there) without any
  // reliance on prior state.
  //
  // Real finding from running this spec repeatedly, registered in
  // docs/TODO.md §22, not fixed here: `liquidity.service.ts`'s
  // `discover()` orders SELL offers by `priceUsd` ascending and hard-caps
  // at `take: 10` — no pagination, no "more results" signal. After
  // enough SELL/USDT_ERC20 offers accumulate (exactly what repeated runs
  // of this very spec do), a real, active offer priced above the 10th-
  // cheapest one becomes permanently invisible in the Marketplace, with
  // no error and no indication anything is missing. Priced deliberately
  // tiny here so this spec keeps passing regardless of how much the
  // shared local database has accumulated — that's a workaround for the
  // test's own stability, not evidence the underlying cap is fine.
  const priceBrl = (0.01 + Math.random() * 0.05).toFixed(4)
  const pixKey = `e2e-${Date.now()}@sailsprotocol.test`
  const chatMessage = `E2E golden path — ${Date.now()}`

  await test.step('seller registers a real Ed25519 identity', async () => {
    await seller.goto('/login')
    await seller.getByRole('button', { name: '🔑 Conectar Carteira' }).click()
    await expect(seller).toHaveURL('/')
  })

  let offerId = ''
  await test.step('seller publishes a real offer (POST /v1/liquidity/offers)', async () => {
    // Real in-app navigation (click, not goto()) — deliberately avoids
    // the full-page-reload re-authentication race this file's header
    // comment documents. Login just happened in this same page context,
    // so `user` is already populated; no reload, no race.
    await seller.getByRole('link', { name: 'Perfil' }).click()
    await seller.getByRole('button', { name: 'Nova Oferta' }).click()
    await expect(seller).toHaveURL('/profile/new-offer')

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
    expect(offerResponse.ok()).toBe(true)
    offerId = (await offerResponse.json()).data.id
    expect(offerId).toBeTruthy()
    await expect(seller).toHaveURL('/profile')
  })

  await test.step('buyer registers a separate real Ed25519 identity', async () => {
    await buyer.goto('/login')
    await buyer.getByRole('button', { name: '🔑 Conectar Carteira' }).click()
    await expect(buyer).toHaveURL('/')
  })

  await test.step('buyer discovers the offer via the real Marketplace (GET /v1/liquidity/offers)', async () => {
    await buyer.getByRole('button', { name: 'Todos os ativos' }).click()
    await buyer.getByRole('button', { name: 'USDT_ERC20', exact: true }).click()

    const offerLink = buyer.locator(`a[href="/offer/${offerId}"]`)
    await expect(offerLink).toBeVisible({ timeout: 15_000 })
    await offerLink.click()
    await expect(buyer).toHaveURL(`/offer/${offerId}`)
  })

  let tradeUrl = ''
  await test.step('buyer starts a real Trade against the discovered offer', async () => {
    await buyer.getByPlaceholder('0.00').fill('20')
    const [tradeResponse] = await Promise.all([
      buyer.waitForResponse((res) => res.url().includes('/v1/openp2p/trades') && res.request().method() === 'POST'),
      buyer.getByRole('button', { name: 'Iniciar Trade' }).click(),
    ])
    expect(tradeResponse.ok()).toBe(true)
    await expect(buyer).toHaveURL(/\/trade\//)
    tradeUrl = buyer.url()
  })

  await test.step('seller opens the same real Trade', async () => {
    // A real goto() — no in-app link reaches an arbitrary trade today
    // (TradeHistory.tsx still shows MOCK_TRADE_HISTORY, a separate,
    // already-disclosed gap — docs/TODO.md §19), so a fresh page load is
    // unavoidable here, unlike the offer-publish step above. Wait for
    // the post-reload re-authentication to actually finish first — see
    // this file's header comment on why that isn't automatic.
    await seller.goto(tradeUrl)
    await waitForAuthenticated(seller)
    await expect(seller.getByRole('button', { name: '🔓 Criar Escrow' })).toBeVisible()
  })

  await test.step('real-time chat — buyer sends, seller receives over a live WebSocket, no reload', async () => {
    // Real finding, registered in docs/TODO.md §22, not fixed here:
    // ChatWindow.tsx's "🟢 Conectado via Pears" label is static markup,
    // not tied to the WebSocket's actual readyState or JOIN_TRADE
    // acknowledgment — there is no real signal, for a test or for a real
    // user, that the chat channel has actually finished connecting on a
    // freshly loaded Trade page. A message sent before the recipient's
    // JOIN_TRADE completes is lost with no retry or backfill (the REST
    // history fetch already ran before the WS message would arrive).
    // This short, explicit wait is standing in for that missing signal —
    // not arbitrary padding, a direct workaround for a real gap.
    await seller.waitForTimeout(1000)
    await buyer.getByPlaceholder('Digite uma mensagem...').fill(chatMessage)
    await buyer.getByRole('button', { name: 'Enviar', exact: true }).click()
    await expect(seller.getByText(chatMessage)).toBeVisible({ timeout: 10_000 })
  })

  await test.step('seller creates and locks escrow', async () => {
    await seller.getByRole('button', { name: '🔓 Criar Escrow' }).click()
    await expect(seller.getByRole('button', { name: '🔒 Bloquear Fundos' })).toBeVisible({ timeout: 10_000 })
    await seller.getByRole('button', { name: '🔒 Bloquear Fundos' }).click()
    await expect(seller.getByRole('button', { name: '🔒 Bloquear Fundos' })).toHaveCount(0)
  })

  await test.step('buyer sees the locked escrow and the seller\'s PIX details, marks payment sent', async () => {
    await buyer.reload() // see this file's header comment — no live WS push for escrow status yet
    await waitForAuthenticated(buyer)
    await expect(buyer.getByText(pixKey)).toBeVisible()
    await expect(buyer.getByRole('button', { name: '💸 Marcar Pagamento Enviado' })).toBeVisible({ timeout: 10_000 })
    await buyer.getByRole('button', { name: '💸 Marcar Pagamento Enviado' }).click()
    await expect(buyer.getByRole('button', { name: '💸 Marcar Pagamento Enviado' })).toHaveCount(0)
  })

  await test.step('seller releases funds — real WdkSettlementProvider/MockSettlementProvider call, trade completes', async () => {
    await seller.reload()
    await waitForAuthenticated(seller)
    await expect(seller.getByRole('button', { name: '✅ Liberar Fundos' })).toBeVisible({ timeout: 10_000 })
    await seller.getByRole('button', { name: '✅ Liberar Fundos' }).click()
    await expect(seller.getByRole('button', { name: '✅ Liberar Fundos' })).toHaveCount(0)
    await expect(seller.getByText('Concluído').first()).toBeVisible({ timeout: 10_000 })
  })
})
