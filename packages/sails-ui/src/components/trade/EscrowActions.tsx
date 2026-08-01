/**
 * Context-aware action buttons — mirrors the real ownership rules built
 * into escrow.service.ts (gap-audit pass, 2026-07-18): only the seller
 * may lock/release, only the buyer may mark payment sent, either party
 * may open a dispute. Each button below is commented with the real
 * route it corresponds to for when this becomes a real @sails/sdk call.
 */
import type { EscrowStatus } from '../../types'
import { Button } from '../ui/button'
import { Lock, Banknote, CheckCircle2, AlertTriangle } from 'lucide-react'

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
        <Button onClick={onLockFunds} className="w-full py-2.5 text-sm">
          <Lock className="h-4 w-4" />
          Bloquear Fundos
        </Button>
      )}

      {isBuyer && status === 'FUNDS_LOCKED' && (
        // TODO: POST /v1/settlement/escrow/:id/payment-sent (markPaymentSent())
        <Button onClick={onMarkPaymentSent} className="w-full py-2.5 text-sm">
          <Banknote className="h-4 w-4" />
          Marcar Pagamento Enviado
        </Button>
      )}

      {isSeller && status === 'PAYMENT_PENDING' && (
        // TODO: POST /v1/settlement/escrow/:id/release (releaseFunds()) —
        // requires ENFORCE_CAPABILITIES/REQUIRE_DUAL_APPROVAL_RELEASE
        // preconditions if those flags are on (RFC-014/015).
        <button onClick={onReleaseFunds} className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
          <CheckCircle2 className="h-4 w-4" />
          Liberar Fundos
        </button>
      )}

      {!isTerminal && canDispute && (
        // TODO: POST /v1/settlement/escrow/:id/dispute (dispute.service.ts's raiseDispute())
        <button onClick={onOpenDispute} className="w-full flex items-center justify-center gap-2 border border-red-500/25 text-red-700 rounded-lg py-2 text-sm hover:bg-red-500/10 transition-colors">
          <AlertTriangle className="h-4 w-4" />
          Abrir Disputa
        </button>
      )}
    </div>
  )
}
