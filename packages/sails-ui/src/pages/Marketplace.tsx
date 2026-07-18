import { useMemo, useState } from 'react'
import { MOCK_OFFERS, ASSETS } from '../data/mock'
import { OfferCard } from '../components/marketplace/OfferCard'
import type { TradeSide } from '../types'

const ASSET_FILTERS = ['Todos', ...ASSETS] as const
const SIDE_FILTERS: { value: TradeSide | 'Todos'; label: string }[] = [
  { value: 'Todos', label: 'Todos' },
  { value: 'BUY', label: 'Comprar' },
  { value: 'SELL', label: 'Vender' },
]

export function Marketplace() {
  const [asset, setAsset] = useState<(typeof ASSET_FILTERS)[number]>('Todos')
  const [side, setSide] = useState<TradeSide | 'Todos'>('Todos')
  const [search, setSearch] = useState('')

  // TODO: replace with @sails/sdk `liquidity.getOffers({ asset, side })`
  // call (real route: GET /v1/liquidity/offers) once mock data is swapped.
  const offers = useMemo(() => {
    return MOCK_OFFERS.filter((o) => {
      if (asset !== 'Todos' && o.asset !== asset) return false
      if (side !== 'Todos' && o.side !== side) return false
      if (search && !o.user.displayName?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [asset, side, search])

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight">Marketplace P2P</h1>
      <p className="text-sm text-gray-500 mt-1">{offers.length} ofertas disponíveis · Non-custodial · Powered by Pears</p>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {ASSET_FILTERS.map((a) => (
          <button
            key={a}
            onClick={() => setAsset(a)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm border ${
              asset === a ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {SIDE_FILTERS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSide(s.value)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                side === s.value ? 'bg-white shadow-sm font-medium' : 'text-gray-500'
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
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((offer) => (
          <OfferCard key={offer.id} offer={offer} />
        ))}
        {offers.length === 0 && (
          <p className="col-span-full text-center text-gray-400 py-10">Nenhuma oferta encontrada com esses filtros.</p>
        )}
      </div>
    </div>
  )
}
