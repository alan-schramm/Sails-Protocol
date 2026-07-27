import { type Page, type Locator, expect } from '@playwright/test'

/**
 * App.tsx's actual home route is `/` → <Marketplace /> (the offer
 * discovery/listing screen) — there's no separate "home" page, so this
 * wraps Marketplace under the name the brief asked for.
 */
export class HomePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/')
  }

  get allAssetsButton(): Locator {
    return this.page.getByRole('button', { name: 'Todos os ativos' })
  }

  assetButton(asset: string): Locator {
    return this.page.getByRole('button', { name: asset, exact: true })
  }

  async filterByAsset(asset: string): Promise<void> {
    await this.allAssetsButton.click()
    await this.assetButton(asset).click()
  }

  offerLink(offerId: string): Locator {
    return this.page.locator(`a[href="/offer/${offerId}"]`)
  }

  async openOffer(offerId: string): Promise<void> {
    const link = this.offerLink(offerId)
    await expect(link).toBeVisible({ timeout: 15_000 })
    await link.click()
    await expect(this.page).toHaveURL(`/offer/${offerId}`)
  }
}
