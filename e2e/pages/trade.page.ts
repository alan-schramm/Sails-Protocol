import { type Page, type Locator, expect } from '@playwright/test'
import { WalletPage } from './wallet.page'

/** Wraps `/trade/:id` (packages/sails-ui/src/pages/Trade.tsx) — chat + the real escrow state machine + dispute UI. */
export class TradePage {
  constructor(private readonly page: Page) {}

  async goto(tradeId: string): Promise<void> {
    await this.page.goto(`/trade/${tradeId}`)
  }

  /**
   * Every `page.goto()`/`.reload()` against `/trade/:id` is a full
   * browser navigation, remounting the whole React app — Trade.tsx
   * itself never redirects to /login on a lost session (same as
   * ActiveTrades.tsx/TradeHistory.tsx/Disputes.tsx), it just renders a
   * logged-out view on the same URL.
   *
   * Before 2026-08-11 this resolved itself silently: AuthContext.tsx
   * auto-relogged-in on mount using the stored plaintext keypair, and
   * this method (then called `waitForAuthenticated()`) just WAITED for
   * that signal — the real gap p2p-trade-happy-path.spec.ts's header
   * comment used to describe ("a fast actor can act before `user`
   * populates"). Since the identity key is now passphrase-encrypted
   * (real gap fixed: it used to sit in localStorage as plain hex),
   * there is nothing left to silently restore — this actively drives
   * Login.tsx (fill passphrase, click Conectar Carteira) and navigates
   * back to the same trade, rather than waiting for something that no
   * longer happens on its own. Delegates to WalletPage.connectAndGoTo()
   * — same sequence any other spec needing mid-test re-auth uses.
   */
  async reauthenticate(tradeId: string, passphrase = 'e2e-test-passphrase'): Promise<void> {
    await new WalletPage(this.page).connectAndGoTo(`/trade/${tradeId}`, passphrase)
  }

  // Locators below dropped their emoji prefixes (2026-08-11) — the
  // buttons have used Lucide icon components instead of emoji for a
  // while (task #13, the emoji->Lucide migration), so these accessible-
  // name matches were already silently stale before this pass; the
  // passphrase change just happened to be what surfaced them.
  get createEscrowButton(): Locator {
    return this.page.getByRole('button', { name: 'Criar Escrow' })
  }
  get lockFundsButton(): Locator {
    return this.page.getByRole('button', { name: 'Bloquear Fundos' })
  }
  get markPaymentSentButton(): Locator {
    return this.page.getByRole('button', { name: 'Marcar Pagamento Enviado' })
  }
  get releaseFundsButton(): Locator {
    return this.page.getByRole('button', { name: 'Liberar Fundos' })
  }
  get openDisputeButton(): Locator {
    return this.page.getByRole('button', { name: 'Abrir Disputa' })
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
