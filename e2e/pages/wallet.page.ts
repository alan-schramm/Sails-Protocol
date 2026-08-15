import { type Page, type Locator, expect } from '@playwright/test'

/**
 * No dedicated "wallet" route exists in this app (there's no
 * `/wallet` in App.tsx) — "wallet" here is the real concept this repo
 * actually uses: a locally-generated Ed25519 keypair, connected via
 * Login's "Conectar Carteira" button (real POST /v1/identity/...
 * register/challenge/authenticate — same flow golden-path.spec.ts
 * exercises), with the public key surfaced read-only on Profile
 * (`/profile`). This Page Object wraps both halves of that real flow
 * under the name the brief asked for, rather than inventing a wallet
 * screen that doesn't exist.
 *
 * `connectButton`'s selector dropped the "🔑" prefix (2026-08-11) — the
 * button icon has been a Lucide `<KeyRound>` SVG for a while (the emoji
 * -> Lucide migration), so an accessible-name match on the emoji never
 * matched anything; this was a silently-stale locator until now.
 *
 * `connect()` now fills a passphrase before clicking — Login.tsx started
 * requiring one the same day (2026-08-11, real gap: the identity/escrow
 * keys used to sit in localStorage as plain hex; the passphrase derives
 * the AES-256-GCM key that encrypts them). A fixed default is fine here:
 * each e2e identity lives in its own BrowserContext/localStorage
 * (wallet.fixture.ts's own header comment), so there's no real secret to
 * protect across test runs the way a real user's passphrase would be.
 */
export class WalletPage {
  constructor(private readonly page: Page) {}

  get connectButton(): Locator {
    return this.page.getByRole('button', { name: 'Conectar Carteira' })
  }

  get passphraseInput(): Locator {
    return this.page.locator('input[type="password"]')
  }

  /** Registers + authenticates a brand-new Ed25519 identity via the real UI flow, landing on '/'. */
  async connect(passphrase = 'e2e-test-passphrase'): Promise<void> {
    await this.page.goto('/login')
    await this.passphraseInput.fill(passphrase)
    await this.connectButton.click()
    await expect(this.page).toHaveURL('/')
  }

  /**
   * Re-establishes a session that a real browser navigation just wiped
   * out (2026-08-11: no more silent restore-on-mount, see this class's
   * own header on why `connect()` now needs a passphrase at all), then
   * lands on `path` — since none of this app's real pages force-redirect
   * to /login on a lost session (Trade.tsx/OfferDetail.tsx/
   * ActiveTrades.tsx/TradeHistory.tsx/Disputes.tsx all just render a
   * logged-out view on the same URL instead), simply waiting was never
   * going to work here; this drives Login.tsx directly. Reused by
   * TradePage.reauthenticate() and any spec that does a real `page.goto()`
   * mid-test after already being logged in (e.g. timeout-flow.spec.ts's
   * direct /offer/:id navigation) rather than duplicating this sequence.
   */
  async connectAndGoTo(path: string, passphrase = 'e2e-test-passphrase'): Promise<void> {
    await this.connect(passphrase)
    if (path !== '/') await this.page.goto(path)
  }

  /** The connected identity's public key, as shown read-only on Profile — the closest real analog to a "wallet address" here. */
  async getPublicKeyFromProfile(): Promise<string> {
    await this.page.goto('/profile')
    const keyEl = this.page.locator('span.font-mono.text-xs.text-brand-text-secondary').first()
    await expect(keyEl).toBeVisible()
    return (await keyEl.textContent())?.trim() ?? ''
  }
}
