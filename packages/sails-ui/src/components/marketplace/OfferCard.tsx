import { Link } from 'react-router-dom'
import type { Offer } from '../../types'
import { AssetBadge, SideBadge, PaymentBadge } from '../ui/Badge'
import { UserAvatar } from '../ui/UserAvatar'
import { formatBrl, formatAmount } from '../../lib/format'

export function OfferCard({ offer }: { offer: Offer }) {
  return (
    <Link
      to={`/offer/${offer.id}`}
      className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 transition-colors"
    >
      <div className="flex justify-between items-start">
        <div className="flex gap-2">
          <AssetBadge asset={offer.asset} />
          <SideBadge side={offer.side} />
        </div>
        <PaymentBadge method={offer.paymentMethod} />
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold text-gray-900 tabular-nums">
          {offer.priceBrl ? formatBrl(offer.priceBrl) : `$${offer.priceUsd}`}
        </div>
        <div className="text-xs text-gray-500">por {offer.asset} · ${offer.priceUsd} USD</div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <UserAvatar user={offer.user} size="sm" />
        <span className="text-sm text-gray-700">{offer.user.displayName}</span>
        {offer.user.verified && <span className="text-xs text-blue-500" title="Verificado">✓</span>}
        <span className="ml-auto text-xs text-gray-400">★ {offer.user.reputationScore.toFixed(0)} · {offer.user.totalTrades} trades</span>
      </div>

      <div className="mt-2 flex gap-2 text-xs text-gray-500">
        <span className="bg-gray-100 rounded px-1.5 py-0.5">min {formatAmount(offer.minAmount)}</span>
        <span className="bg-gray-100 rounded px-1.5 py-0.5">max {formatAmount(offer.maxAmount)}</span>
      </div>

      {offer.description && <p className="mt-2 text-xs text-gray-400 line-clamp-1">{offer.description}</p>}
    </Link>
  )
}
