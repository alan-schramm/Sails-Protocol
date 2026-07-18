/**
 * Visualizes escrow.service.ts's real VALID_TRANSITIONS happy path
 * (CREATED -> FUNDS_LOCKED -> PAYMENT_PENDING -> COMPLETED). DISPUTED/
 * REFUNDED are real side-branches from that same state machine, not
 * additional steps on this track — shown as a separate banner instead
 * of forced into a 4-step line that doesn't represent them well.
 */
import type { EscrowStatus } from '../../types'

const HAPPY_PATH: { status: EscrowStatus; label: string }[] = [
  { status: 'CREATED', label: 'Criado' },
  { status: 'FUNDS_LOCKED', label: 'Bloqueado' },
  { status: 'PAYMENT_PENDING', label: 'Pagamento' },
  { status: 'COMPLETED', label: 'Concluído' },
]

export function EscrowStateMachine({ status }: { status: EscrowStatus }) {
  if (status === 'DISPUTED' || status === 'REFUNDED') {
    return (
      <div className={`rounded-lg p-4 text-sm border ${status === 'DISPUTED' ? 'bg-red-500/10 text-red-500 border-red-500/25' : 'bg-brand-elevated text-brand-text-secondary border-brand-border'}`}>
        {status === 'DISPUTED' ? '⚠️ Este trade está em disputa — aguardando resolução do árbitro.' : '↩️ Fundos reembolsados ao vendedor.'}
      </div>
    )
  }

  const activeIndex = HAPPY_PATH.findIndex((s) => s.status === status)

  return (
    <div>
      <h4 className="text-xs font-semibold text-brand-text-muted uppercase tracking-wider mb-3">Progresso do Escrow</h4>
      <div className="flex items-center">
        {HAPPY_PATH.map((step, i) => {
          const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending'
          return (
            <div key={step.status} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold relative ${
                    state === 'done'
                      ? 'bg-brand-orange text-white'
                      : state === 'active'
                        ? 'border-2 border-brand-orange text-brand-orange'
                        : 'border-2 border-brand-border text-brand-text-muted'
                  }`}
                >
                  {state === 'active' && (
                    <span className="absolute inset-0 rounded-full border-2 border-brand-orange animate-ping opacity-40" />
                  )}
                  {state === 'done' ? '✓' : i + 1}
                </div>
                <span className={`text-[10px] ${state === 'pending' ? 'text-brand-text-muted' : 'text-brand-text-secondary'}`}>{step.label}</span>
              </div>
              {i < HAPPY_PATH.length - 1 && (
                <div className={`flex-1 h-px mx-1 mb-4 ${i < activeIndex ? 'bg-brand-orange' : 'bg-brand-border'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
