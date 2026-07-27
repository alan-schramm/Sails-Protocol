import { test as base, type Page } from '@playwright/test'
import { WalletPage } from '../pages/wallet.page'

/**
 * Two real, independent identities — separate BrowserContexts (separate
 * localStorage, so genuinely distinct Ed25519 keypairs, same isolation a
 * real buyer and seller on two different devices would have), each
 * already connected via the real register/challenge/authenticate flow
 * (WalletPage.connect()) before the test body runs. Mirrors the dual-
 * context pattern e2e/flows/p2p-trade-happy-path.spec.ts (formerly
 * golden-path.spec.ts) already established.
 */
export interface WalletFixtures {
  aliceWallet: Page
  bobWallet: Page
}

export const test = base.extend<WalletFixtures>({
  aliceWallet: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await new WalletPage(page).connect()
    await use(page)
    await context.close()
  },
  bobWallet: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await new WalletPage(page).connect()
    await use(page)
    await context.close()
  },
})

export { expect } from '@playwright/test'
