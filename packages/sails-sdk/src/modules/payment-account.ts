/**
 * @satsails/p2p-trading-sdk — Payment account trust ramp module (RFC-021 D5, verified
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

/**
 * Missão 11 Fase 9.3.1 — the shape `get()` actually returns. Deliberately
 * NOT `PaymentAccount` — that full row (including `ownerId`/`signedBy`,
 * platform User ids) is only ever returned to an AUTHENTICATED, self-
 * referential caller (`register()`/`sign()`, where the caller IS the
 * owner/signer). `get()` is public-by-hash (no session, matching RFC-021
 * D5's own age-witness design and this file's own doc comment below), so
 * it returns only what a counterparty actually needs to verify a payment
 * rail's trust history — never who owns or attested it. See
 * `src/modules/open-settlement/payment-account.service.ts`'s
 * `PublicPaymentAccountView` (the server-side source of this shape) for
 * the full field-by-field rationale.
 */
export interface PublicPaymentAccount {
  accountHash: string
  paymentMethod: string
  signed: boolean
  signedAt: string | null
  firstUsedAt: string
  completedTrades: number
  chargebacks: number
  tradeLimit: string
}

export class SailsPaymentAccountModule {
  constructor(private readonly transport: SailsTransport) {}

  /** Requires an active session. Idempotent — safe to call again for an already-registered accountHash. */
  async register(accountHash: string, paymentMethod: string): Promise<PaymentAccount> {
    return this.transport.post<PaymentAccount>('/v1/settlement/payment-accounts', { accountHash, paymentMethod }, true)
  }

  /**
   * No active session required — deliberately public-by-hash (RFC-021 D5).
   * Throws SailsNotFoundError if this hash was never registered.
   *
   * Missão 11 Fase 9.3.1 — narrowed from `PaymentAccount & { tradeLimit }`
   * to `PublicPaymentAccount`: the server no longer returns `ownerId`/
   * `signedBy`/`id` here at all (a privacy fix, not a client-side filter —
   * see PublicPaymentAccount's own doc comment). No known caller of this
   * SDK read those fields from `get()`'s result.
   */
  async get(accountHash: string): Promise<PublicPaymentAccount> {
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
