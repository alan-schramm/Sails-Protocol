import { Link } from 'react-router-dom'
import type { Offer } from '../../types'
import { AssetBadge, SideBadge, PaymentBadge } from '../ui/Badge'
import { UserAvatar } from '../ui/UserAvatar'
import { formatAmount } from '../../lib/format'
import { formatByCurrency } from '../../lib/currency'
import { ASSET_LABELS } from '../../lib/labels'

export function OfferCard({ offer }: { offer: Offer }) {
  return (
    <Link to={`/offer/${offer.id}`} className="block card-hover p-4">
      <div className="flex justify-between items-start">
        <div className="flex gap-2">
          <AssetBadge asset={offer.asset} />
          <SideBadge side={offer.side} />
        </div>
        <PaymentBadge method={offer.paymentMethod} />
      </div>

      <div className="mt-3">
        <div className="text-2xl font-black text-brand-text tabular-nums">
          {formatByCurrency(offer.priceFiat, offer.fiatCurrency)}
        </div>
        <div className="text-xs text-brand-text-muted">
          por {ASSET_LABELS[offer.asset]}
          {offer.fiatCurrency !== 'USD' && ` · ≈ $${offer.priceUsd} USD`}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <UserAvatar user={offer.user} size="sm" />
        <span className="text-sm text-brand-text-secondary">{offer.user.displayName}</span>
        {offer.user.verified && <span className="text-xs text-brand-orange" title="Verificado">✓</span>}
        <span className="ml-auto text-xs text-brand-text-muted">★ {offer.user.reputationScore.toFixed(0)} · {offer.user.totalTrades} trades</span>
      </div>

      <div className="mt-2 flex gap-2 text-xs text-brand-text-muted">
        <span className="bg-brand-elevated rounded px-1.5 py-0.5">min {formatAmount(offer.minAmount)}</span>
        <span className="bg-brand-elevated rounded px-1.5 py-0.5">max {formatAmount(offer.maxAmount)}</span>
      </div>

      {offer.description && <p className="mt-2 text-xs text-brand-text-muted line-clamp-1">{offer.description}</p>}
    </Link>
  )
}
