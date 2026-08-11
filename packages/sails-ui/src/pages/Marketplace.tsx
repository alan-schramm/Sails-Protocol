import { useEffect, useMemo, useState } from 'react'
import { ASSETS_FILTERABLE, HIGH_REPUTATION_THRESHOLD, PAYMENT_METHODS_FILTERABLE } from '../data/mock'
import { fetchOffers } from '../lib/realOffers'
import { OfferCard } from '../components/marketplace/OfferCard'
import { AssetPicker } from '../components/marketplace/AssetPicker'
import { CurrencyPicker } from '../components/marketplace/CurrencyPicker'
import { PaymentMethodPicker } from '../components/marketplace/PaymentMethodPicker'
import { FilterPanel, SORT_OPTIONS } from '../components/marketplace/FilterPanel'
import { AgentIntentionPanel } from '../components/agent/AgentIntentionPanel'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select'
import { SlidersHorizontal, AlertTriangle } from 'lucide-react'
import type { AssetType, FiatCurrency, MarketplaceFilters, TradeSide } from '../types'
import { DEFAULT_FILTERS } from '../types'

const SIDE_FILTERS: { value: TradeSide | 'Todos'; label: string }[] = [
  { value: 'Todos', label: 'Todos' },
  { value: 'BUY', label: 'Comprar' },
  { value: 'SELL', label: 'Vender' },
]

const FILTERS_STORAGE_KEY = 'sails_ui_marketplace_filters'

export function Marketplace() {
  const [asset, setAsset] = useState<AssetType | 'Todos'>('Todos')
  const [currency, setCurrency] = useState<FiatCurrency | 'Todas'>('Todas')
  const [side, setSide] = useState<TradeSide | 'Todos'>('Todos')
  const [search, setSearch] = useState('')
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [filters, setFilters] = useState<MarketplaceFilters>(() => {
    const stored = localStorage.getItem(FILTERS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : DEFAULT_FILTERS
  })

  useEffect(() => {
    if (filters.saveForNext) localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters))
    else localStorage.removeItem(FILTERS_STORAGE_KEY)
  }, [filters])

  const activeFilterCount = [
    filters.negotiableOnly,
    filters.highReputationOnly,
    filters.previouslyTradedOnly,
    filters.amount !== '',
    filters.paymentTimeLimit !== 'Todos',
    filters.paymentMethods.length > 0,
    filters.country !== 'Todos',
  ].filter(Boolean).length

  // Real @satsails/p2p-trading-sdk liquidity.discover() calls (lib/realOffers.ts),
  // fanned out per asset/side since GET /v1/liquidity/offers only
  // filters by asset+side, not a bare "list everything". Client-side
  // filtering below (country/paymentMethods/etc.) stays, since the real
  // route doesn't support those filters server-side either (verified
  // against liquidity.routes.ts directly).
  const [allOffers, setAllOffers] = useState<import('../types').Offer[]>([])
  const [loadingOffers, setLoadingOffers] = useState(true)
  // hadError (2026-08-02) — distinguishes "backend unreachable" from
  // "no offers match" (SLC audit's own 🟡 finding: these rendered
  // identically before). fetchOffers() never throws itself (it fans out
  // per asset/side and can't map a partial failure to a single reject),
  // so this reads its own hadError flag instead of a .catch().
  const [offersError, setOffersError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadingOffers(true)
    fetchOffers(asset, side)
      .then(({ offers, hadError }) => {
        if (cancelled) return
        setAllOffers(offers)
        setOffersError(hadError)
      })
      .finally(() => { if (!cancelled) setLoadingOffers(false) })
    return () => { cancelled = true }
  }, [asset, side])

  const offers = useMemo(() => {
    let result = allOffers.filter((o) => {
      // Real bug found live: a cancelled/paused offer (Profile.tsx's new
      // "Cancelar oferta"/"Pausar" actions) still showed up here — this
      // filter never checked status at all, since until now nothing in
      // the UI could ever change one away from ACTIVE. Every real P2P
      // marketplace (Binance, Bisq, HodlHodl, ...) hides a paused/
      // cancelled ad from the public listing; only its owner sees it,
      // in Profile.tsx's "Minhas Ofertas".
      if (o.status !== 'ACTIVE') return false
      if (asset !== 'Todos' && o.asset !== asset) return false
      if (currency !== 'Todas' && o.fiatCurrency !== currency) return false
      if (side !== 'Todos' && o.side !== side) return false
      if (search && !o.user.displayName?.toLowerCase().includes(search.toLowerCase())) return false
      if (filters.negotiableOnly && o.blockedRelationship) return false
      if (filters.highReputationOnly && o.user.reputationScore < HIGH_REPUTATION_THRESHOLD) return false
      if (filters.previouslyTradedOnly && !o.tradedWithCurrentUser) return false
      if (filters.country !== 'Todos' && o.country !== filters.country) return false
      if (filters.paymentMethods.length > 0 && !filters.paymentMethods.includes(o.paymentMethod)) return false
      const amountNum = Number(filters.amount)
      if (amountNum > 0 && (amountNum < o.minAmount || amountNum > o.maxAmount)) return false
      return true
    })

    result = [...result].sort((a, b) => {
      if (filters.sortBy === 'trades') return b.user.totalTrades - a.user.totalTrades
      if (filters.sortBy === 'reputation') return b.user.reputationScore - a.user.reputationScore
      return a.priceUsd - b.priceUsd
    })

    return result
  }, [allOffers, asset, currency, side, search, filters])

  return (
    <div>
      <h1 className="text-2xl font-display font-bold tracking-tight text-brand-text">Marketplace P2P</h1>
      <p className="text-sm text-brand-text-muted mt-1">{offers.length} ofertas disponíveis · Non-custodial · Powered by Pears</p>

      <div className="mt-4">
        <AgentIntentionPanel
          matchCount={offers.length}
          onIntentGenerated={(a, s, c) => {
            setAsset(a)
            setSide(s)
            setCurrency(c)
          }}
          onResetFilters={() => {
            setAsset('Todos')
            setCurrency('Todas')
            setSide('Todos')
          }}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2 items-center">
        <AssetPicker assets={ASSETS_FILTERABLE} value={asset} onChange={setAsset} />
        <CurrencyPicker value={currency} onChange={setCurrency} />
        <PaymentMethodPicker
          methods={PAYMENT_METHODS_FILTERABLE}
          value={filters.paymentMethods}
          onChange={(paymentMethods) => setFilters({ ...filters, paymentMethods })}
        />

        <Button
          variant="outline"
          onClick={() => setFilterPanelOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm relative"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 flex items-center justify-center bg-brand-orange text-white text-[10px] rounded-full">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <div className="flex gap-1 bg-brand-elevated rounded-lg p-1">
          {SIDE_FILTERS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSide(s.value)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                side === s.value ? 'bg-brand-surface shadow-sm font-medium text-brand-text' : 'text-brand-text-secondary'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Quick sort (2026-07-28): reference platforms (Binance P2P/
            Airtm/HodlHodl/El Dorado) all put sort directly on the main
            toolbar — burying it one click deep inside the Filtros drawer
            made it easy to miss. Same `filters.sortBy` FilterPanel's own
            drawer already edits, just exposed here too — not a second
            source of truth. */}
        <Select
          value={filters.sortBy}
          onValueChange={(v) => setFilters({ ...filters, sortBy: v as MarketplaceFilters['sortBy'] })}
        >
          <SelectTrigger aria-label="Ordenar por" className="text-sm w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>Ordenar: {s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por vendedor..."
          aria-label="Buscar por vendedor"
          className="ml-auto"
        />
      </div>

      {/* Single hairline-divided list (2026-07-28), not a card grid —
          matches the Binance P2P/Airtm/El Dorado density this screen is
          modeled on; OfferCard's own `.offer-row` class supplies the
          divider/hover/accent-border treatment per row. */}
      {/* Partial-failure banner — shown alongside whatever offers DID
          load successfully, since a total-outage message would be
          dishonest when some (asset, side) pairs actually succeeded. */}
      {!loadingOffers && offersError && offers.length > 0 && (
        <div className="mt-4 flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/25 text-yellow-700 text-xs rounded-lg px-3.5 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Algumas ofertas podem não ter carregado — houve falha ao buscar parte do Marketplace.
        </div>
      )}

      <Card id="marketplace-offer-grid" className="mt-4 overflow-hidden [&>a:last-child]:border-b-0">
        {/* Desktop-only column header (Binance P2P/HodlHodl/El Dorado all
            label their offer-list columns) — hidden below `lg` since the
            mobile/tablet layout groups fields into paired rows instead of
            fixed columns, so column labels wouldn't line up with anything.
            Widths mirror OfferCard's own `lg:w-*` values exactly. */}
        <div className="hidden lg:flex items-center gap-6 px-5 py-2 border-b border-brand-border text-xs font-medium text-brand-text-muted uppercase tracking-wider">
          <span className="w-44 shrink-0">Anunciante</span>
          <span className="w-48 shrink-0">Ativo</span>
          <span className="flex-1">Preço</span>
          <span className="w-40 shrink-0">Limites</span>
          <span className="w-32 shrink-0">Pagamento</span>
          <span className="w-28 shrink-0 text-right">Ação</span>
        </div>
        {loadingOffers ? (
          <p className="text-center text-brand-text-muted py-10">Carregando ofertas...</p>
        ) : (
          <>
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
            {offers.length === 0 && (
              <p className="text-center text-brand-text-muted py-10">
                {offersError
                  ? 'Não foi possível carregar as ofertas agora — verifique sua conexão e tente novamente.'
                  : 'Nenhuma oferta encontrada com esses filtros.'}
              </p>
            )}
          </>
        )}
      </Card>

      <FilterPanel
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        filters={filters}
        onChange={setFilters}
        currency={currency === 'Todas' ? 'BRL' : currency}
      />
    </div>
  )
}
