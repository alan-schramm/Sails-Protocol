'use client'

/**
 * Fase 6 — the real quick-start page: two sections proving the whole
 * stack actually connects to a live Sails node.
 *
 * 1. "Discover offers" — `liquidity.discover()` (no auth required,
 *    verified by reading `SailsLiquidityModule` directly), rendered as
 *    plain `Offer` rows. Deliberately NOT forced through `TradeCard` —
 *    that component takes a real `Trade`, not an `Offer`; they're
 *    different real types (`packages/sails-sdk/src/types.ts`), and
 *    fabricating a fake `Trade` shape just to reuse the component would
 *    be exactly the kind of dishonest scaffolding this starter's own
 *    execution rules rule out.
 * 2. "View a trade" — paste in a real `tradeId` (one of the two
 *    `examples/*.ts` scripts prints one when run) and see the real,
 *    unmodified `TradeCard`/`TradeStatusBadge` from `@satsails/sdk-react`
 *    render it, via `useSailsTrade()` (also no auth required).
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSailsClient, useSailsTrade } from '@satsails/sdk-react'
import type { AssetType, TradeSide } from '@satsails/p2p-trading-sdk'
import { TradeCard } from '../ui/TradeCard'
import { TradeStatusBadge } from '../ui/StatusBadge'

function DiscoverOffers() {
  const client = useSailsClient()
  const [asset, setAsset] = useState<AssetType>('BTC')
  const [side, setSide] = useState<TradeSide>('SELL')

  const { data, isLoading, error } = useQuery({
    queryKey: ['discover', asset, side],
    queryFn: () => client.liquidity.discover({ asset, side, limit: 10 }),
  })

  return (
    <section className="rounded-lg border border-slate-800 p-4">
      <h2 className="text-lg font-semibold">Discover offers</h2>
      <p className="text-sm text-slate-400">Real `liquidity.discover()` call — no login required.</p>
      <div className="mt-3 flex gap-2">
        <select className="rounded bg-slate-800 px-2 py-1" value={asset} onChange={(e) => setAsset(e.target.value as AssetType)}>
          {(['BTC', 'USDT_ERC20', 'LN_BTC'] satisfies AssetType[]).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select className="rounded bg-slate-800 px-2 py-1" value={side} onChange={(e) => setSide(e.target.value as TradeSide)}>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
      </div>
      <div className="mt-3 space-y-2">
        {isLoading && <p className="text-slate-500">Loading…</p>}
        {error && <p className="text-red-400">{error instanceof Error ? error.message : 'Failed to load offers'}</p>}
        {data?.offers.length === 0 && <p className="text-slate-500">No offers found for {asset} {side}.</p>}
        {data?.offers.map((offer) => (
          <div key={offer.id} className="rounded border border-slate-800 p-2 text-sm">
            <span className="font-mono">{offer.asset}</span> · {offer.side} · ${offer.priceUsd} · {offer.paymentMethods.join(', ')}
          </div>
        ))}
      </div>
    </section>
  )
}

function ViewTrade() {
  const [tradeIdInput, setTradeIdInput] = useState('')
  const [activeTradeId, setActiveTradeId] = useState<string | undefined>(undefined)
  const { data: trade, isLoading, error } = useSailsTrade(activeTradeId)

  return (
    <section className="rounded-lg border border-slate-800 p-4">
      <h2 className="text-lg font-semibold">View a trade</h2>
      <p className="text-sm text-slate-400">
        Run <code>npm run example:p2p-bitcoin-trade -w @sails/example-integration-starter</code>, it prints a real tradeId — paste it below.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setActiveTradeId(tradeIdInput.trim() || undefined)
        }}
      >
        <input
          className="flex-1 rounded bg-slate-800 px-2 py-1"
          placeholder="trade-..."
          value={tradeIdInput}
          onChange={(e) => setTradeIdInput(e.target.value)}
        />
        <button type="submit" className="rounded bg-orange-600 px-3 py-1">Load</button>
      </form>
      <div className="mt-3">
        {isLoading && <p className="text-slate-500">Loading…</p>}
        {error && <p className="text-red-400">{error instanceof Error ? error.message : 'Trade not found'}</p>}
        {trade && (
          <div className="space-y-2">
            <TradeStatusBadge status={trade.status} />
            <TradeCard trade={trade} variant="detailed" />
          </div>
        )}
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Sails Integration Starter</h1>
      <DiscoverOffers />
      <ViewTrade />
    </main>
  )
}
