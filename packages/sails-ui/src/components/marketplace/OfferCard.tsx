import { Link } from 'react-router-dom'
import type { Offer } from '../../types'
import { AssetBadge, SideBadge, PaymentBadge } from '../ui/StatusBadges'
import { UserAvatar } from '../ui/UserAvatar'
import { formatAmount } from '../../lib/format'
import { formatByCurrency } from '../../lib/currency'
import { ASSET_LABELS } from '../../lib/labels'
import { buttonVariants } from '../ui/button'
import { cn } from '../../lib/utils'
import { Check, Star } from 'lucide-react'

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
      {/* Mobile: 2 paired rows (trader+payment, asset/side+price) instead of
          5 stacked full-width blocks — the original one-column-per-line
          layout was technically responsive but way too tall per offer once
          actually viewed on a phone. `lg:contents` drops these wrapper divs
          from the desktop layout entirely so their children become direct
          flex items of `.offer-row` (lg:flex-row) again, same as before —
          `lg:order-*` on each child then restores the original desktop
          left-to-right sequence, since grouping for mobile changes DOM
          order (payment now sits right after trader, not last). */}
      <div className="flex items-center justify-between gap-2 lg:contents">
        <div className="flex items-center gap-2 lg:order-1 lg:w-44 lg:shrink-0">
          <UserAvatar user={offer.user} size="sm" showPresence />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-brand-text truncate">{offer.user.displayName}</span>
              {offer.user.verified && (
                <span title="Verificado" className="shrink-0">
                  <Check className="h-3.5 w-3.5 text-brand-orange-accent" />
                </span>
              )}
            </div>
            <div className="text-xs text-brand-text-muted flex items-center gap-1">
              <Star className="h-3 w-3" fill="currentColor" strokeWidth={0} /> {offer.user.reputationScore.toFixed(0)} · {offer.user.totalTrades} trades
            </div>
          </div>
        </div>
        <div className="lg:order-5 lg:w-32 lg:shrink-0">
          <PaymentBadge method={offer.paymentMethod} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 lg:contents">
        <div className="flex items-center gap-2.5 lg:order-2 lg:w-48 lg:shrink-0">
          <AssetBadge asset={offer.asset} />
          <SideBadge side={offer.side} />
        </div>
        <div className="text-right lg:order-3 lg:text-left lg:flex-1 lg:min-w-0">
          <div className="text-xl font-display font-bold text-brand-text tabular-nums leading-tight">
            {formatByCurrency(offer.priceFiat, offer.fiatCurrency)}
          </div>
          <div className="text-xs text-brand-text-muted">
            por {ASSET_LABELS[offer.asset]}
            {offer.fiatCurrency !== 'USD' && ` · ≈ $${offer.priceUsd} USD`}
          </div>
        </div>
      </div>

      {/* Explicit per-row CTA (Binance P2P/HodlHodl/El Dorado all put a
          "Buy"/"Sell" button directly on the row, not just a clickable
          card) — visual affordance only, not a real nested control: the
          whole row is already the actual `<Link>`, and a real `<button>`
          nested inside it would be invalid HTML (the exact bug this
          codebase's own AgentIntentionPanel fix, see sails-ui/README,
          already ran into once with a button-in-button). Label is the
          viewer's action, the inverse of `offer.side` — same computation
          OfferDetail.tsx already uses for its own amount-field label. */}
      <div className="flex items-center justify-between gap-2 lg:contents">
        <div className="flex gap-2 text-xs text-brand-text-muted lg:order-4 lg:w-40 lg:shrink-0">
          <span className="bg-brand-elevated rounded px-1.5 py-0.5">min {formatAmount(offer.minAmount)}</span>
          <span className="bg-brand-elevated rounded px-1.5 py-0.5">max {formatAmount(offer.maxAmount)}</span>
        </div>
        <span className={cn(buttonVariants({ className: 'lg:order-6 px-4 py-1.5 text-sm shrink-0' }))}>
          {offer.side === 'SELL' ? 'Comprar' : 'Vender'}
        </span>
      </div>

      {offer.description && (
        <p className="text-xs text-brand-text-muted line-clamp-1 lg:hidden">{offer.description}</p>
      )}
    </Link>
  )
}
