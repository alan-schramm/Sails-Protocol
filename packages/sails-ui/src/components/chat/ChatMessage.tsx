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
  const isMedia = message.type === 'IMAGE' || message.type === 'VIDEO'

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
        } ${isMedia ? 'p-1.5' : ''}`}
      >
        {isProof && <div className="text-xs font-semibold text-green-500 mb-1">🧾 Comprovante de Pagamento</div>}
        {message.type === 'IMAGE' && message.mediaUrl && (
          <img src={message.mediaUrl} alt={message.mediaFileName ?? 'Imagem enviada'} className="max-w-[240px] max-h-[240px] rounded-xl object-cover" />
        )}
        {message.type === 'VIDEO' && message.mediaUrl && (
          <video src={message.mediaUrl} controls className="max-w-[240px] max-h-[240px] rounded-xl" />
        )}
        {!isMedia && message.content}
        {isMedia && message.content && (
          <div className={`text-xs px-1.5 pt-1 ${isMine ? 'text-white/80' : 'text-brand-text-muted'}`}>{message.content}</div>
        )}
      </div>
      <span className="text-[10px] text-brand-text-muted mt-0.5">{formatTime(message.createdAt)}</span>
    </div>
  )
}
