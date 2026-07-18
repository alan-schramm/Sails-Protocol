import type { User } from '../../types'
import { UserAvatar } from '../ui/UserAvatar'

export function TradeParties({ buyer, seller, currentUserId }: { buyer: User; seller: User; currentUserId?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mt-3 divide-y divide-gray-100">
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
        <span className="font-medium">{user.displayName}</span>
        {isYou && <span className="ml-1.5 text-xs bg-gray-100 rounded px-1.5 py-0.5">Você</span>}
      </div>
      <span className="ml-auto text-xs text-gray-400">{role}</span>
    </div>
  )
}
