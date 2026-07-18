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
      <div className={`rounded-lg p-4 text-sm ${status === 'DISPUTED' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
        {status === 'DISPUTED' ? '⚠️ Este trade está em disputa — aguardando resolução do árbitro.' : '↩️ Fundos reembolsados ao vendedor.'}
      </div>
    )
  }

  const activeIndex = HAPPY_PATH.findIndex((s) => s.status === status)

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Progresso do Escrow</h4>
      <div className="flex items-center">
        {HAPPY_PATH.map((step, i) => {
          const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending'
          return (
            <div key={step.status} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    state === 'done'
                      ? 'bg-gray-900 text-white'
                      : state === 'active'
                        ? 'border-2 border-gray-900 text-gray-900'
                        : 'border-2 border-gray-200 text-gray-300'
                  }`}
                >
                  {state === 'done' ? '✓' : i + 1}
                </div>
                <span className={`text-[10px] ${state === 'pending' ? 'text-gray-300' : 'text-gray-600'}`}>{step.label}</span>
              </div>
              {i < HAPPY_PATH.length - 1 && (
                <div className={`flex-1 h-px mx-1 mb-4 ${i < activeIndex ? 'bg-gray-900' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
