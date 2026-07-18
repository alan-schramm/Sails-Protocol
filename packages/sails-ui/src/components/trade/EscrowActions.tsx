/**
 * Context-aware action buttons — mirrors the real ownership rules built
 * into escrow.service.ts (gap-audit pass, 2026-07-18): only the seller
 * may lock/release, only the buyer may mark payment sent, either party
 * may open a dispute. Each button below is commented with the real
 * route it corresponds to for when this becomes a real @sails/sdk call.
 */
import type { EscrowStatus } from '../../types'

interface Props {
  status: EscrowStatus
  isBuyer: boolean
  isSeller: boolean
  onLockFunds: () => void
  onMarkPaymentSent: () => void
  onReleaseFunds: () => void
  onOpenDispute: () => void
}

export function EscrowActions({ status, isBuyer, isSeller, onLockFunds, onMarkPaymentSent, onReleaseFunds, onOpenDispute }: Props) {
  const canDispute = isBuyer || isSeller
  const isTerminal = status === 'COMPLETED' || status === 'DISPUTED' || status === 'REFUNDED'

  return (
    <div className="mt-4 flex flex-col gap-2">
      {isSeller && status === 'CREATED' && (
        // TODO: POST /v1/settlement/escrow/:id/lock (escrow.service.ts's lockFunds())
        <button onClick={onLockFunds} className="btn-primary w-full py-2.5 text-sm">
          🔒 Bloquear Fundos
        </button>
      )}

      {isBuyer && status === 'FUNDS_LOCKED' && (
        // TODO: POST /v1/settlement/escrow/:id/payment-sent (markPaymentSent())
        <button onClick={onMarkPaymentSent} className="btn-primary w-full py-2.5 text-sm">
          💸 Marcar Pagamento Enviado
        </button>
      )}

      {isSeller && status === 'PAYMENT_PENDING' && (
        // TODO: POST /v1/settlement/escrow/:id/release (releaseFunds()) —
        // requires ENFORCE_CAPABILITIES/REQUIRE_DUAL_APPROVAL_RELEASE
        // preconditions if those flags are on (RFC-014/015).
        <button onClick={onReleaseFunds} className="w-full bg-green-600 hover:bg-green-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
          ✅ Liberar Fundos
        </button>
      )}

      {!isTerminal && canDispute && (
        // TODO: POST /v1/settlement/escrow/:id/dispute (dispute.service.ts's raiseDispute())
        <button onClick={onOpenDispute} className="w-full border border-red-500/25 text-red-500 rounded-lg py-2 text-sm hover:bg-red-500/10 transition-colors">
          ⚠️ Abrir Disputa
        </button>
      )}
    </div>
  )
}
