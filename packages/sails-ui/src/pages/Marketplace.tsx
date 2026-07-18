import { useEffect, useMemo, useState } from 'react'
import { MOCK_OFFERS, ASSETS, HIGH_REPUTATION_THRESHOLD } from '../data/mock'
import { OfferCard } from '../components/marketplace/OfferCard'
import { AssetPicker } from '../components/marketplace/AssetPicker'
import { CurrencyPicker } from '../components/marketplace/CurrencyPicker'
import { FilterPanel } from '../components/marketplace/FilterPanel'
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

  // TODO: replace with @sails/sdk `liquidity.getOffers({ asset, side })`
  // call (real route: GET /v1/liquidity/offers) once mock data is
  // swapped — server-side filtering would replace this client-side pass.
  const offers = useMemo(() => {
    let result = MOCK_OFFERS.filter((o) => {
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
  }, [asset, currency, side, search, filters])

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-brand-text">Marketplace P2P</h1>
      <p className="text-sm text-brand-text-muted mt-1">{offers.length} ofertas disponíveis · Non-custodial · Powered by Pears</p>

      <div className="mt-6 flex flex-wrap gap-2 items-center">
        <AssetPicker assets={ASSETS} value={asset} onChange={setAsset} />
        <CurrencyPicker value={currency} onChange={setCurrency} />

        <button
          onClick={() => setFilterPanelOpen(true)}
          className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm relative"
        >
          🎚️ Filtros
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 flex items-center justify-center bg-brand-orange text-white text-[10px] rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

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

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por vendedor..."
          className="input-field ml-auto"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((offer) => (
          <OfferCard key={offer.id} offer={offer} />
        ))}
        {offers.length === 0 && (
          <p className="col-span-full text-center text-brand-text-muted py-10">Nenhuma oferta encontrada com esses filtros.</p>
        )}
      </div>

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
