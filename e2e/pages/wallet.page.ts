import { type Page, type Locator, expect } from '@playwright/test'

/**
 * No dedicated "wallet" route exists in this app (there's no
 * `/wallet` in App.tsx) — "wallet" here is the real concept this repo
 * actually uses: a locally-generated Ed25519 keypair, connected via
 * Login's "🔑 Conectar Carteira" button (real POST /v1/identity/...
 * register/challenge/authenticate — same flow golden-path.spec.ts
 * exercises), with the public key surfaced read-only on Profile
 * (`/profile`). This Page Object wraps both halves of that real flow
 * under the name the brief asked for, rather than inventing a wallet
 * screen that doesn't exist.
 */
export class WalletPage {
  constructor(private readonly page: Page) {}

  get connectButton(): Locator {
    return this.page.getByRole('button', { name: '🔑 Conectar Carteira' })
  }

  /** Registers + authenticates a brand-new Ed25519 identity via the real UI flow, landing on '/'. */
  async connect(): Promise<void> {
    await this.page.goto('/login')
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
