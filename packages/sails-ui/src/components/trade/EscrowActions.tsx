/**
 * Context-aware action buttons — mirrors the real ownership rules built
 * into escrow.service.ts (gap-audit pass, 2026-07-18): only the seller
 * may lock/release, only the buyer may mark payment sent, either party
 * may open a dispute. Purely presentational — Trade.tsx's own
 * onLockFunds/onMarkPaymentSent/onReleaseFunds/onOpenDispute props are
 * real sailsClient.settlement.*() calls (corrected 2026-08-04; the
 * per-button "TODO" comments below used to describe work not done yet,
 * back when this component was built ahead of Trade.tsx's real wiring).
 */
import type { EscrowStatus } from '../../types'
import { Button } from '../ui/button'
import { Lock, Banknote, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Props {
  status: EscrowStatus
  isBuyer: boolean
  isSeller: boolean
  // Real bug found live: none of this component's buttons ever disabled
  // during the async call (Trade.tsx's own `acting` state, already wired
  // to every other guarded action on that page — see its own withGuard())
  // — a double-click could fire the same lock/release/dispute call twice.
  acting: boolean
  onLockFunds: () => void
  onMarkPaymentSent: () => void
  onReleaseFunds: () => void
  onOpenDispute: () => void
}

export function EscrowActions({ status, isBuyer, isSeller, acting, onLockFunds, onMarkPaymentSent, onReleaseFunds, onOpenDispute }: Props) {
  const canDispute = isBuyer || isSeller
  const isTerminal = status === 'COMPLETED' || status === 'DISPUTED' || status === 'REFUNDED'

  return (
    <div className="mt-4 flex flex-col gap-2">
      {isSeller && status === 'CREATED' && (
        // POST /v1/settlement/escrow/:id/lock (escrow.service.ts's lockFunds())
        <Button onClick={onLockFunds} disabled={acting} className="w-full py-2.5 text-sm">
          <Lock className="h-4 w-4" />
          Bloquear Fundos
        </Button>
      )}

      {isBuyer && status === 'FUNDS_LOCKED' && (
        // POST /v1/settlement/escrow/:id/payment-sent (markPaymentSent())
        <Button onClick={onMarkPaymentSent} disabled={acting} className="w-full py-2.5 text-sm">
          <Banknote className="h-4 w-4" />
          Marcar Pagamento Enviado
        </Button>
      )}

      {isSeller && status === 'PAYMENT_PENDING' && (
        // POST /v1/settlement/escrow/:id/release (releaseFunds()) —
        // requires ENFORCE_CAPABILITIES/REQUIRE_DUAL_APPROVAL_RELEASE
        // preconditions if those flags are on (RFC-014/015).
        <Button onClick={onReleaseFunds} disabled={acting} className="w-full py-2.5 text-sm bg-green-600 hover:bg-green-500 text-white">
          <CheckCircle2 className="h-4 w-4" />
          Liberar Fundos
        </Button>
      )}

      {!isTerminal && canDispute && (
        // POST /v1/settlement/escrow/:id/dispute (dispute.service.ts's raiseDispute())
        <Button variant="outline" onClick={onOpenDispute} disabled={acting} className="w-full py-2 text-sm border-red-500/25 text-red-700 hover:bg-red-500/10 hover:text-red-700">
          <AlertTriangle className="h-4 w-4" />
          Abrir Disputa
        </Button>
      )}
    </div>
  )
}
