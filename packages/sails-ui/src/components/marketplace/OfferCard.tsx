import { Link } from 'react-router-dom'
import type { Offer } from '../../types'
import { AssetBadge, SideBadge, PaymentBadge } from '../ui/Badge'
import { UserAvatar } from '../ui/UserAvatar'
import { formatAmount } from '../../lib/format'
import { formatByCurrency } from '../../lib/currency'
import { ASSET_LABELS } from '../../lib/labels'

// Dense list-row layout (2026-07-28 visual redesign) replacing the
// bordered-card-in-a-grid shape — matches Marketplace.tsx's switch from
// a card grid to a single hairline-divided list (Binance P2P/Airtm/El
// Dorado's actual offer-listing layout). Side reads instantly off the
// left accent border instead of only a badge; the fixed-width columns
// below only take effect at md+ (mobile keeps the old stacked reading
// order via .offer-row's own flex-col default).
export function OfferCard({ offer }: { offer: Offer }) {
  const sideAccent = offer.side === 'BUY' ? 'border-l-green-500' : 'border-l-red-500'

  return (
    <Link to={`/offer/${offer.id}`} className={`offer-row ${sideAccent}`}>
      <div className="flex items-center gap-2 md:w-44 md:shrink-0">
        <UserAvatar user={offer.user} size="sm" />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-brand-text truncate">{offer.user.displayName}</span>
            {offer.user.verified && <span className="text-xs text-brand-orange-accent shrink-0" title="Verificado">✓</span>}
          </div>
          <div className="text-xs text-brand-text-muted">★ {offer.user.reputationScore.toFixed(0)} · {offer.user.totalTrades} trades</div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:w-32 md:shrink-0">
        <AssetBadge asset={offer.asset} />
        <SideBadge side={offer.side} />
      </div>

      <div className="md:flex-1 md:min-w-0">
        <div className="text-xl font-display font-bold text-brand-text tabular-nums leading-tight">
          {formatByCurrency(offer.priceFiat, offer.fiatCurrency)}
        </div>
        <div className="text-xs text-brand-text-muted">
          por {ASSET_LABELS[offer.asset]}
          {offer.fiatCurrency !== 'USD' && ` · ≈ $${offer.priceUsd} USD`}
        </div>
      </div>

      <div className="flex gap-2 text-xs text-brand-text-muted md:w-40 md:shrink-0">
        <span className="bg-brand-elevated rounded px-1.5 py-0.5">min {formatAmount(offer.minAmount)}</span>
        <span className="bg-brand-elevated rounded px-1.5 py-0.5">max {formatAmount(offer.maxAmount)}</span>
      </div>

      <div className="md:w-32 md:shrink-0">
        <PaymentBadge method={offer.paymentMethod} />
      </div>

      {offer.description && (
        <p className="text-xs text-brand-text-muted line-clamp-1 md:hidden">{offer.description}</p>
      )}
    </Link>
  )
}
