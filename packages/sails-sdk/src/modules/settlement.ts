/**
 * @sails/sdk — Sails OpenSettlement module (verified against
 * src/modules/open-settlement/settlement.routes.ts directly).
 *
 * SDK_GUIDE.md marks this namespace "advanced/direct use" — the six-verb
 * Intent facade's releaseAsset()/dispute() is the path most applications
 * should reach for first, EXCEPT that those two currently throw
 * SailsNotImplementedError (intent-facade.ts's own header explains why:
 * no server-side Intent -> Trade -> Escrow resolution exists yet). Until
 * that's built, `settlement.release(escrowId)`/`settlement.dispute(...)`
 * below are the real, working path — operating on `escrowId` directly,
 * exactly like the server route does.
 */
import type { SailsTransport } from '../transport'
import type { AssetType, Dispute, DisputeRuling, Escrow, EscrowType } from '../types'

export interface CreateEscrowInput {
  tradeId: string
  type?: EscrowType
  lockedAmount: string
  asset: AssetType
  network?: string
  timelockHours?: number
}

export class SailsSettlementModule {
  constructor(private readonly transport: SailsTransport) {}

  /** Requires an active session. */
  async create(input: CreateEscrowInput): Promise<Escrow> {
    return this.transport.post<Escrow>('/v1/settlement/escrow', input, true)
  }

  async get(escrowId: string): Promise<Escrow> {
    return this.transport.get<Escrow>(`/v1/settlement/escrow/${escrowId}`)
  }

  /** Requires an active session. CREATED -> FUNDS_LOCKED. */
  async lock(escrowId: string): Promise<Escrow> {
    return this.transport.post<Escrow>(`/v1/settlement/escrow/${escrowId}/lock`, undefined, true)
  }

  /** Requires an active session. FUNDS_LOCKED -> PAYMENT_PENDING. */
  async markPaymentSent(escrowId: string): Promise<Escrow> {
    return this.transport.post<Escrow>(`/v1/settlement/escrow/${escrowId}/payment-sent`, undefined, true)
  }

  /** Requires an active session. PAYMENT_PENDING (or PENDING_BANK_SETTLEMENT) -> COMPLETED. */
  async release(escrowId: string, toAddress: string): Promise<Escrow> {
    return this.transport.post<Escrow>(`/v1/settlement/escrow/${escrowId}/release`, { toAddress }, true)
  }

  /** Requires an active session. -> DISPUTED, persists a Dispute row and assigns an arbiter (RFC-007 D4). */
  async dispute(escrowId: string, reason: string, evidence?: unknown[]): Promise<Dispute> {
    return this.transport.post<Dispute>(`/v1/settlement/escrow/${escrowId}/dispute`, { reason, evidence }, true)
  }

  /** Requires an active session. -> REFUNDED. */
  async refund(escrowId: string): Promise<Escrow> {
    return this.transport.post<Escrow>(`/v1/settlement/escrow/${escrowId}/refund`, undefined, true)
  }

  /**
   * Requires an active session AND that the caller is the dispute's
   * assigned arbiter (RFC-007 D4) — the server rejects this otherwise.
   * `releaseToAddress` is required when `ruling` is `'RELEASE'`.
   */
  async resolveDispute(disputeId: string, ruling: DisputeRuling, releaseToAddress?: string): Promise<Dispute> {
    return this.transport.post<Dispute>(`/v1/settlement/disputes/${disputeId}/resolve`, { ruling, releaseToAddress }, true)
  }
}
