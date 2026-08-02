import type { User } from '../../types'

const SIZES = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-16 h-16 text-xl' } as const
const DOT_SIZES = { sm: 'w-2 h-2', md: 'w-2.5 h-2.5', lg: 'w-3 h-3', xl: 'w-3.5 h-3.5' } as const

// Deterministic, not random-per-render: same user always reads the same
// way while this session is open, rather than flickering on every
// re-render. Stands in for a real presence signal (Binance P2P/HodlHodl/
// El Dorado all show one) — nothing today reports live Pears/Hyperswarm
// connection state up to this UI (the whole point of that P2P layer is
// exactly "is this peer currently reachable," but this package has no
// live socket to it yet, same "not wired to the real backend" gap this
// UI's own README discloses everywhere else). Honestly illustrative,
// not a claim about whether this user is actually online right now —
// callers that show it should pass a `title`/tooltip saying so.
function deterministicOnline(id: string): boolean {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 3 !== 0 // ~66% online, close to what a real P2P swarm sample would look like
}

export function UserAvatar({
  user,
  size = 'md',
  showPresence = false,
  // Real presence override (2026-08-02) — Trade.tsx's chat WebSocketChannel
  // gets real USER_ONLINE/USER_OFFLINE frames for the counterparty
  // specifically (chat.routes.ts broadcasts them on room join/leave/
  // socket close), so that ONE context can pass a real boolean here
  // instead of falling back to deterministicOnline()'s illustrative hash.
  // `null` means "a real channel exists but no event has arrived yet" —
  // shown as a distinct neutral/unknown dot, never guessed as true/false.
  // Omitted (undefined) preserves the old illustrative behavior exactly,
  // used everywhere else (Marketplace/OfferCard) where no live channel
  // exists to source a real value from.
  online: realOnline,
}: {
  user: User
  size?: keyof typeof SIZES
  showPresence?: boolean
  online?: boolean | null
}) {
  const initial = (user.displayName ?? user.id).charAt(0).toUpperCase()
  const isReal = realOnline !== undefined
  const online = isReal ? realOnline : deterministicOnline(user.id)
  const dotTitle = isReal
    ? online === null
      ? 'Presença ainda não observada nesta sessão'
      : online
        ? 'Online agora — visto na sala de chat deste trade'
        : 'Offline — saiu da sala de chat deste trade'
    : online
      ? 'Online agora (ilustrativo — ver comentário em UserAvatar.tsx)'
      : 'Offline (ilustrativo — ver comentário em UserAvatar.tsx)'
  return (
    <div className="relative shrink-0">
      <div className={`${SIZES[size]} rounded-full bg-brand-orange-accent/15 border border-brand-orange-accent/25 text-brand-orange-accent font-bold flex items-center justify-center`}>
        {initial}
      </div>
      {showPresence && (
        <span
          title={dotTitle}
          className={`absolute -bottom-0.5 -right-0.5 ${DOT_SIZES[size]} rounded-full border-2 border-brand-surface ${
            online === null ? 'bg-brand-text-muted/40' : online ? 'bg-green-500' : 'bg-brand-text-muted'
          }`}
        />
      )}
    </div>
  )
}
