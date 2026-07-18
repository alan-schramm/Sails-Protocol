/**
 * Real Sails chat is a WebSocket protocol (chat.routes.ts's
 * `GET /v1/openp2p/chat`, real events: JOIN_TRADE/SEND_MESSAGE/...) that
 * relays through the OpenP2P/Pears path. This mocked window has no
 * socket — sending a message just appends to local state. The real swap
 * is `new WebSocket('/v1/openp2p/chat?token=...')`, never a direct
 * import of `pear.service.ts` (that's Node-only, hyperdht/hyperswarm —
 * a browser cannot run it, and it would mean shipping server-only P2P
 * code into a client bundle either way).
 *
 * Image/video attach: `handleFileSelect` below creates a local
 * `URL.createObjectURL(file)` blob — the file never leaves this browser
 * tab. What a real "send image/video via Pears" would need, concretely:
 * (1) `Message.msgType` on the real backend is already a free String
 * (prisma/schema.prisma) so `IMAGE`/`VIDEO` need no migration; (2) an
 * actual upload/storage step first — `Message.content` is Postgres text,
 * not a place for a raw binary blob, and chat.routes.ts's SEND_MESSAGE
 * schema (`content: z.string()`) has no size ceiling suited to a video;
 * (3) the WS->Pears relay in that same route only ever forwards a plain
 * text `content` inside a `MESSAGE_EXCHANGED` event — carrying a media
 * reference through `PearNode.sendToPeer()` is structurally possible
 * (its payload is arbitrary JSON, sealed with libsodium in
 * `payload-crypto.ts`) but no one has wired that event shape yet. None
 * of that exists today, so this is UI-only, not a claim any of it works
 * end-to-end.
 */
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Message, MessageType } from '../../types'
import { ChatMessage } from './ChatMessage'

const MAX_MEDIA_BYTES = 15 * 1024 * 1024 // 15MB — arbitrary client-side guard, not a backend limit (none exists yet)

interface Props {
  messages: Message[]
  currentUserId?: string
  onSend: (content: string) => void
  onSendMedia: (media: { url: string; fileName: string; type: MessageType }) => void
}

export function ChatWindow({ messages, currentUserId, onSend, onSendMedia }: Props) {
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = () => {
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (file.size > MAX_MEDIA_BYTES) {
      toast.error('Arquivo muito grande (máx. 15MB nesta demonstração)')
      return
    }
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) {
      toast.error('Envie apenas imagem ou vídeo')
      return
    }

    const url = URL.createObjectURL(file)
    onSendMedia({ url, fileName: file.name, type: isImage ? 'IMAGE' : 'VIDEO' })
  }

  return (
    <div className="flex flex-col h-[520px] card overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border flex items-center justify-between">
        <span className="text-sm font-semibold text-brand-text">Chat P2P</span>
        <span className="text-xs text-green-500 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Conectado via Pears
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} isMine={m.senderId === currentUserId} />
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-brand-border p-3 flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Enviar imagem ou vídeo"
          aria-label="Enviar imagem ou vídeo"
          className="btn-ghost px-3 text-sm"
        >
          📎
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Digite uma mensagem..."
          className="input-field flex-1"
        />
        <button onClick={handleSend} className="btn-primary px-4 text-sm">
          Enviar
        </button>
      </div>
    </div>
  )
}
