import type { User } from '../../types'
import { UserAvatar } from '../ui/UserAvatar'

export function TradeParties({ buyer, seller, currentUserId }: { buyer: User; seller: User; currentUserId?: string }) {
  return (
    <div className="card p-4 mt-3 divide-y divide-brand-border">
      <PartyRow user={buyer} role="Comprador" isYou={buyer.id === currentUserId} />
      <PartyRow user={seller} role="Vendedor" isYou={seller.id === currentUserId} />
    </div>
  )
}

function PartyRow({ user, role, isYou }: { user: User; role: string; isYou: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <UserAvatar user={user} size="sm" />
      <div className="text-sm">
        <span className="font-medium text-brand-text">{user.displayName}</span>
        {isYou && <span className="ml-1.5 text-xs bg-brand-orange/10 text-brand-orange rounded px-1.5 py-0.5">Você</span>}
      </div>
      <span className="ml-auto text-xs text-brand-text-muted">{role}</span>
    </div>
  )
}
