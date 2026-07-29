/**
 * @sails/sdk — Payment account trust ramp module (RFC-021 D5, verified
 * against src/modules/open-settlement/settlement.routes.ts's real
 * /v1/settlement/payment-accounts/* routes).
 *
 * Real callers hash the raw account identifier themselves via
 * `hashPaymentAccount()` (`../payment-account`) before calling
 * `register()` — the raw value never has to be sent here.
 */
import type { SailsTransport } from '../transport'

export interface PaymentAccount {
  id: string
  ownerId: string
  accountHash: string
  paymentMethod: string
  signed: boolean
  signedBy: string | null
  signedAt: string | null
  completedTrades: number
  chargebacks: number
}

export class SailsPaymentAccountModule {
  constructor(private readonly transport: SailsTransport) {}

  /** Requires an active session. Idempotent — safe to call again for an already-registered accountHash. */
  async register(accountHash: string, paymentMethod: string): Promise<PaymentAccount> {
    return this.transport.post<PaymentAccount>('/v1/settlement/payment-accounts', { accountHash, paymentMethod }, true)
  }

  /** No active session required. Throws SailsNotFoundError if this hash was never registered. */
  async get(accountHash: string): Promise<PaymentAccount & { tradeLimit: string }> {
    return this.transport.get(`/v1/settlement/payment-accounts/${accountHash}`)
  }

  /**
   * Requires an active session. RFC-021 D1's narrow attestation framing:
   * the caller is attesting a specific completed trade, not vouching for
   * the account owner generally.
   */
  async sign(accountHash: string): Promise<PaymentAccount> {
    return this.transport.post<PaymentAccount>(`/v1/settlement/payment-accounts/${accountHash}/sign`, undefined, true)
  }
}
