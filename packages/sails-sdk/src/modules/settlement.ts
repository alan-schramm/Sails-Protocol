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
import type { AssetType, Dispute, DisputeRuling, Escrow, EscrowPendingTransaction, EscrowType } from '../types'

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

  /**
   * Requires an active session. The client-held-keys write path for
   * MULTISIG/LIGHTNING_HODL escrow — submit only the public half of a
   * keypair generated via `generateEscrowKeypair()` (`escrow-key.ts`);
   * the private key never leaves the caller. Once both the trade's buyer
   * and seller have each called this once, the server derives and
   * persists the real deposit address (`Escrow.multisigAddr`) — see
   * `escrow.service.ts`'s `submitParticipantKey()`.
   */
  async submitKey(escrowId: string, pubkeyHex: string): Promise<{ escrow: Escrow; buyerKeySubmitted: boolean; sellerKeySubmitted: boolean }> {
    return this.transport.post(`/v1/settlement/escrow/${escrowId}/submit-key`, { pubkey: pubkeyHex }, true)
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
   * Phase 2 (2026-07-27), MULTISIG only. Requires an active session AND
   * the same authorization release() already requires (seller, or the
   * assigned dispute arbiter). Builds and persists an unsigned release
   * PSBT server-side — does NOT move funds or transition the escrow by
   * itself. Each id in the response's `requiredSigners` must call
   * `submitTransactionSignature()` with their own signed copy
   * (`signEscrowPsbt()`, `escrow-key.ts`) before the release actually
   * completes.
   */
  async initiateRelease(escrowId: string, toAddress: string): Promise<EscrowPendingTransaction> {
    return this.transport.post(`/v1/settlement/escrow/${escrowId}/initiate-release`, { toAddress }, true)
  }

  /** Mirror of initiateRelease() above, for refund. */
  async initiateRefund(escrowId: string): Promise<EscrowPendingTransaction> {
    return this.transport.post(`/v1/settlement/escrow/${escrowId}/initiate-refund`, undefined, true)
  }

  /**
   * Submits the caller's own independently-signed copy of the pending
   * transaction's unsigned PSBT (sign it first with `signEscrowPsbt()`).
   * `complete: true` in the response means every required signer has now
   * submitted and the escrow has actually finalized (combined, broadcast,
   * and transitioned) — check `getPendingTransaction()`/`get()` for the
   * resulting `txReleaseId` if needed.
   */
  async submitTransactionSignature(escrowId: string, signedPsbtBase64: string): Promise<{ complete: boolean }> {
    return this.transport.post(`/v1/settlement/escrow/${escrowId}/submit-transaction-signature`, { signedPsbtBase64 }, true)
  }

  /** No active session required. Throws SailsNotFoundError if no signing round is in flight for this escrow. */
  async getPendingTransaction(escrowId: string): Promise<EscrowPendingTransaction> {
    return this.transport.get(`/v1/settlement/escrow/${escrowId}/pending-transaction`)
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
