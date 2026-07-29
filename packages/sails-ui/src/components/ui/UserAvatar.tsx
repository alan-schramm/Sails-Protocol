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
}: {
  user: User
  size?: keyof typeof SIZES
  showPresence?: boolean
}) {
  const initial = (user.displayName ?? user.id).charAt(0).toUpperCase()
  const online = showPresence && deterministicOnline(user.id)
  return (
    <div className="relative shrink-0">
      <div className={`${SIZES[size]} rounded-full bg-brand-orange-accent/15 border border-brand-orange-accent/25 text-brand-orange-accent font-bold flex items-center justify-center`}>
        {initial}
      </div>
      {showPresence && (
        <span
          title={online ? 'Online agora (ilustrativo — ver comentário em UserAvatar.tsx)' : 'Offline (ilustrativo — ver comentário em UserAvatar.tsx)'}
          className={`absolute -bottom-0.5 -right-0.5 ${DOT_SIZES[size]} rounded-full border-2 border-brand-surface ${online ? 'bg-green-500' : 'bg-brand-text-muted'}`}
        />
      )}
    </div>
  )
}
