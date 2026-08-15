import { type Page, expect } from '@playwright/test'
import { WalletPage } from './wallet.page'

/**
 * There is no separate "create trade" route — a trade is started from
 * OfferDetail (`/offer/:id`, real POST /v1/openp2p/trades on "Iniciar
 * Trade"), never a standalone form. This wraps that real flow under the
 * name the brief asked for.
 */
export class CreateTradePage {
  constructor(private readonly page: Page) {}

  /** Assumes the page is already on `/offer/:id` (see HomePage.openOffer). Fills the amount and starts a real trade, waiting for the real POST response. Returns the created trade's id. */
  async startTrade(amount: string): Promise<string> {
    await this.page.getByPlaceholder('0.00').fill(amount)
    const [tradeResponse] = await Promise.all([
      this.page.waitForResponse((res) => res.url().includes('/v1/openp2p/trades') && res.request().method() === 'POST'),
      this.page.getByRole('button', { name: 'Iniciar Trade' }).click(),
    ])
    expect(tradeResponse.ok()).toBe(true)
    await expect(this.page).toHaveURL(/\/trade\//)
    const body = await tradeResponse.json()
    return body.data.id as string
  }

  /**
   * Navigates straight to `/offer/:id` and starts a trade — skipping
   * Marketplace's own discovery step entirely. Real finding from writing
   * this suite: `discover()` has no pagination and hard-caps at 10
   * results (docs/TODO.md §19, already disclosed before this phase); a
   * brand-new offer competing on price against however many older
   * offers a shared local dev Postgres has accumulated over many past
   * sessions has no reliable guarantee of appearing in that window —
   * confirmed empirically while writing this suite, not assumed. Specs
   * whose real subject is the trade/escrow/dispute/timeout mechanics
   * (not the marketplace search UX itself) use this instead, exactly
   * the way a bookmarked or shared offer link would work for a real
   * user. p2p-trade-happy-path.spec.ts is the one exception — that
   * spec's whole point is the real discovery step, so it keeps using
   * HomePage.openOffer() and accepts the same flakiness risk as a
   * documented, known limitation.
   *
   * Real navigation, not a client-side `<Link>` click like
   * HomePage.openOffer() — a real navigation wipes whatever session the
   * caller already had (2026-08-11: no more silent restore-on-mount,
   * see WalletPage.connectAndGoTo()'s own header), so this
   * re-authenticates as part of the same call rather than assuming the
   * caller is still logged in by the time startTrade() below needs to
   * POST as an authenticated participant. The identity itself isn't
   * recreated — WalletPage.connect() reuses the encrypted keypair
   * already in this BrowserContext's localStorage from the fixture's
   * own initial connect(), same passphrase.
   */
  async startTradeDirect(offerId: string, amount: string): Promise<string> {
    await this.page.goto(`/offer/${offerId}`)
    // The goto() above is a hard navigation — it does NOT restore the
    // in-memory session even if this identity's encrypted keypair (and a
    // real backend session) is still valid (WalletPage.connect()'s own
    // header: no silent re-authenticate-on-mount since 2026-08-11).
    // Real bug found running this spec against a real backend: the old
    // connectAndGoTo() re-authenticated FIRST, landing on '/', then did
    // this same hard goto() SECOND — which wipes the session it had just
    // re-established, right back to logged-out, so `startTrade()` below
    // clicked "Iniciar Trade" while logged out and hung forever waiting
    // for a POST that OfferDetail.tsx's own `handleStartTrade()` never
    // sends in that state (it redirects to /login instead — see its own
    // `if (!user)` branch). Fixed by driving the REAL app affordance for
    // exactly this case: fill the amount, click "Iniciar Trade" while
    // logged out (which navigates to /login carrying {from, amount} in
    // location.state), authenticate, and land back on this same offer
    // page with the amount already restored (OfferDetail.tsx's own
    // "Prefilled when arriving back here" logic) — the same round trip a
    // real user hits, not a synthetic shortcut.
    await this.page.getByPlaceholder('0.00').fill(amount)
    await this.page.getByRole('button', { name: 'Iniciar Trade' }).click()
    await new WalletPage(this.page).completeLogin()
    await expect(this.page).toHaveURL(new RegExp(`/offer/${offerId}$`))
    return this.startTrade(amount)
  }
}
