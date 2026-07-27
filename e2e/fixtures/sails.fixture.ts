import { test as base, type Page } from '@playwright/test'
import { WalletPage } from '../pages/wallet.page'

/** A single already-connected identity, for specs that only need one authenticated party (accessibility, visual, timeout-flow's UI half). */
export interface SailsFixtures {
  authenticatedPage: Page
}

export const test = base.extend<SailsFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await new WalletPage(page).connect()
    await use(page)
  },
})

export { expect } from '@playwright/test'
