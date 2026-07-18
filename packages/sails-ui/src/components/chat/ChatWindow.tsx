/**
 * Real Sails chat is a WebSocket protocol (chat.routes.ts's
 * `GET /v1/openp2p/chat`, real events: JOIN_TRADE/SEND_MESSAGE/...) that
 * relays through the OpenP2P/Pears path. This mocked window has no
 * socket — sending a message just appends to local state. The real swap
 * is `new WebSocket('/v1/openp2p/chat?token=...')`, never a direct
 * import of `pear.service.ts` (that's Node-only, hyperdht/hyperswarm —
 * a browser cannot run it, and it would mean shipping server-only P2P
 * code into a client bundle either way).
 */
import { useEffect, useRef, useState } from 'react'
import type { Message } from '../../types'
import { ChatMessage } from './ChatMessage'

interface Props {
  messages: Message[]
  currentUserId?: string
  onSend: (content: string) => void
}

export function ChatWindow({ messages, currentUserId, onSend }: Props) {
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = () => {
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  return (
    <div className="flex flex-col h-[520px] bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-semibold">Chat P2P</span>
        <span className="text-xs text-green-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Conectado via Pears
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} isMine={m.senderId === currentUserId} />
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-gray-100 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Digite uma mensagem..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button onClick={handleSend} className="bg-gray-900 text-white rounded-lg px-4 text-sm font-semibold hover:bg-gray-700">
          Enviar
        </button>
      </div>
    </div>
  )
}
