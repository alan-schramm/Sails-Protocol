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

  /** The connected identity's public key, as shown read-only on Profile — the closest real analog to a "wallet address" here. */
  async getPublicKeyFromProfile(): Promise<string> {
    await this.page.goto('/profile')
    const keyEl = this.page.locator('span.font-mono.text-xs.text-brand-text-secondary').first()
    await expect(keyEl).toBeVisible()
    return (await keyEl.textContent())?.trim() ?? ''
  }
}
