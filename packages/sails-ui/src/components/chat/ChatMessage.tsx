import type { Message } from '../../types'
import { formatTime } from '../../lib/format'

export function ChatMessage({ message, isMine }: { message: Message; isMine: boolean }) {
  if (message.type === 'SYSTEM') {
    return (
      <div className="self-center text-center text-xs italic text-brand-text-muted bg-brand-elevated border border-brand-border rounded-full px-4 py-1.5 my-1">
        {message.content}
      </div>
    )
  }

  const isProof = message.type === 'PAYMENT_PROOF'

  return (
    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
      {!isMine && message.sender && (
        <span className="text-[10px] text-brand-text-muted mb-0.5 ml-1">{message.sender.displayName}</span>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
          isProof
            ? 'bg-green-500/10 border border-green-500/25 text-brand-text'
            : isMine
              ? 'bg-brand-orange text-white rounded-br-sm'
              : 'bg-brand-elevated text-brand-text rounded-bl-sm'
        }`}
      >
        {isProof && <div className="text-xs font-semibold text-green-500 mb-1">🧾 Comprovante de Pagamento</div>}
        {message.content}
      </div>
      <span className="text-[10px] text-brand-text-muted mt-0.5">{formatTime(message.createdAt)}</span>
    </div>
  )
}
