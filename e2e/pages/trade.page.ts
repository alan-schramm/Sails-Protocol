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
   * browser navigation, remounting the whole React app and wiping
   * AuthContext.tsx's in-memory `user` (no silent re-authenticate-on-
   * mount since 2026-08-11 — the identity key is passphrase-encrypted,
   * nothing left to silently restore).
   *
   * Real bug found running this spec against a real backend: this used
   * to delegate to `WalletPage.connectAndGoTo(path)`, which re-
   * authenticates FIRST (landing on '/') and THEN does a second hard
   * `page.goto(path)` — but that second navigation is itself a full
   * reload, wiping the session `connect()` just established right back
   * out. Trade.tsx's action buttons (createEscrow/lockFunds/etc.) are
   * gated on `isBuyer`/`isSeller`, both `false` while `user` is null, so
   * every caller's next click just hung waiting for a button that would
   * never render — a real product gap too, not just a test artifact:
   * Trade.tsx had no actual way to reconnect from a lost session, only
   * inert text ("Conecte sua carteira para agir neste trade"). Fixed at
   * the source (Trade.tsx, 2026-08-15) with the same real affordance
   * OfferDetail.tsx's `handleStartTrade()` already established: a button
   * that navigates to `/login` carrying `{ from: location.pathname }` in
   * `location.state`, which Login.tsx's own `handleConnect()` already
   * knows how to return through. This method now drives that real flow
   * directly instead of the broken generic helper.
   */
  async reauthenticate(tradeId: string, passphrase = 'e2e-test-passphrase'): Promise<void> {
    await this.goto(tradeId)
    await this.page.getByRole('button', { name: 'Conectar Carteira' }).click()
    await new WalletPage(this.page).completeLogin(passphrase)
    await expect(this.page).toHaveURL(new RegExp(`/trade/${tradeId}$`))
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
