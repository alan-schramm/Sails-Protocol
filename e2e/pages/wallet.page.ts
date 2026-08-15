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
    await this.dismissOnboardingIfPresent()
  }

  /**
   * OnboardingTour.tsx auto-opens after every identity's first successful
   * login (Layout.tsx's trigger, lib/onboarding.ts's localStorage flag) and
   * blocks the whole page (a modal Dialog) until dismissed. Every e2e
   * identity is brand-new (its own BrowserContext/localStorage — see this
   * class's own header), so the flag is never set yet and this fires on
   * every real connect() call, not just a one-time first-ever run.
   */
  private async dismissOnboardingIfPresent(): Promise<void> {
    const skipButton = this.page.getByRole('button', { name: 'Pular' })
    if (await skipButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await skipButton.click()
    }
  }

  /**
   * Only safe for `path === '/'` (skips the second navigation entirely —
   * `connect()` already lands there). For any other path, DON'T use
   * this: real bug found running these specs against a real backend —
   * the `page.goto(path)` below is itself a full browser navigation,
   * which wipes the session `connect()` just established a moment
   * earlier the exact same way (AuthContext.tsx has no silent
   * re-authenticate-on-mount since 2026-08-11), landing on `path`
   * logged right back out. Kept only for the `path === '/'` case
   * (e.g. a11y.spec.ts's Marketplace scan); every other caller needing
   * mid-test re-auth should drive the real per-page affordance instead
   * (see `completeLogin()` below) — `CreateTradePage.startTradeDirect()`
   * and `TradePage.reauthenticate()` both do this now.
   */
  async connectAndGoTo(path: string, passphrase = 'e2e-test-passphrase'): Promise<void> {
    await this.connect(passphrase)
    if (path !== '/') await this.page.goto(path)
  }

  /**
   * Fills the passphrase and clicks Connect, assuming the page is
   * ALREADY on `/login` (arrived via the app's own `navigate()` — a
   * click on a "reconnect" affordance, or a page's own mount-time
   * redirect — not a fresh `connect()` call). Doesn't assert a landing
   * URL itself: Login.tsx's `handleConnect()` returns to whatever
   * `location.state.from` the trigger set, which only the caller knows.
   */
  async completeLogin(passphrase = 'e2e-test-passphrase'): Promise<void> {
    await this.passphraseInput.fill(passphrase)
    await this.connectButton.click()
  }

  /** The connected identity's public key, as shown read-only on Profile — the closest real analog to a "wallet address" here. */
  async getPublicKeyFromProfile(): Promise<string> {
    await this.page.goto('/profile')
    const keyEl = this.page.locator('span.font-mono.text-xs.text-brand-text-secondary').first()
    await expect(keyEl).toBeVisible()
    return (await keyEl.textContent())?.trim() ?? ''
  }
}
