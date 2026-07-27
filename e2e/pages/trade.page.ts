import { type Page, type Locator, expect } from '@playwright/test'

/** Wraps `/trade/:id` (packages/sails-ui/src/pages/Trade.tsx) — chat + the real escrow state machine + dispute UI. */
export class TradePage {
  constructor(private readonly page: Page) {}

  async goto(tradeId: string): Promise<void> {
    await this.page.goto(`/trade/${tradeId}`)
  }

  /** Real gap this repo's own golden-path.spec.ts already documents: a full reload's post-reload re-auth isn't reflected by any loading state a caller can await — this waits for the same signal TopNav.tsx itself uses. */
  async waitForAuthenticated(): Promise<void> {
    await expect(this.page.getByRole('link', { name: 'Conectar' })).toHaveCount(0, { timeout: 15_000 })
  }

  get createEscrowButton(): Locator {
    return this.page.getByRole('button', { name: '🔓 Criar Escrow' })
  }
  get lockFundsButton(): Locator {
    return this.page.getByRole('button', { name: '🔒 Bloquear Fundos' })
  }
  get markPaymentSentButton(): Locator {
    return this.page.getByRole('button', { name: '💸 Marcar Pagamento Enviado' })
  }
  get releaseFundsButton(): Locator {
    return this.page.getByRole('button', { name: '✅ Liberar Fundos' })
  }
  get openDisputeButton(): Locator {
    return this.page.getByRole('button', { name: '⚠️ Abrir Disputa' })
  }
  get disputeReasonInput(): Locator {
    return this.page.getByPlaceholder('Descreva o motivo da disputa...')
  }
  get confirmDisputeButton(): Locator {
    return this.page.getByRole('button', { name: 'Confirmar Disputa' })
  }
  get messageInput(): Locator {
    return this.page.getByPlaceholder('Digite uma mensagem...')
  }
  get sendButton(): Locator {
    return this.page.getByRole('button', { name: 'Enviar', exact: true })
  }

  async createEscrow(): Promise<void> {
    await this.createEscrowButton.click()
    await expect(this.lockFundsButton).toBeVisible({ timeout: 10_000 })
  }

  async lockFunds(): Promise<void> {
    await this.lockFundsButton.click()
    await expect(this.lockFundsButton).toHaveCount(0)
  }

  async markPaymentSent(): Promise<void> {
    await this.markPaymentSentButton.click()
    await expect(this.markPaymentSentButton).toHaveCount(0)
  }

  async releaseFunds(): Promise<void> {
    await this.releaseFundsButton.click()
    await expect(this.releaseFundsButton).toHaveCount(0)
  }

  async sendMessage(content: string): Promise<void> {
    await this.messageInput.fill(content)
    await this.sendButton.click()
  }

  /** Opens the real dispute form and submits it — real POST /v1/settlement/escrow/:id/dispute (Trade.tsx's handleOpenDispute). Resolution is intentionally not covered here (Admin > Disputes is 100% mocked today — dispute-flow.spec.ts's own header explains why). */
  async openDispute(reason: string): Promise<void> {
    await this.openDisputeButton.click()
    await this.disputeReasonInput.fill(reason)
    const [disputeResponse] = await Promise.all([
      this.page.waitForResponse((res) => res.url().includes('/dispute') && res.request().method() === 'POST'),
      this.confirmDisputeButton.click(),
    ])
    expect(disputeResponse.ok()).toBe(true)
  }
}
