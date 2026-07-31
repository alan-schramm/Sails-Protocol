/**
 * Binance-style asset selector: a button that opens a search list,
 * instead of a lateral row of pills. Requested directly — a pill row
 * doesn't scale once more assets exist (ETH, USDC, SOL, etc.), and a
 * search-based picker already handles that without changing this
 * component when ASSETS (data/mock.ts) grows.
 *
 * Renders `ASSET_LABELS` (2026-07-29 fix, found while testing the new
 * asset additions) — used to render the raw `AssetType` code verbatim
 * (`USDC_ERC20`, `SBTC_STACKS`, `USDCX_STACKS`...), the exact "code
 * identifier, not interface copy" problem lib/labels.ts's own header
 * comment already named and fixed everywhere else in this UI; just
 * missed here since this component predates most of those codes. Search
 * now matches the label too (e.g. "bitcoin" finds BTC/LN_BTC/etc.), not
 * only the raw code — the label is what's visible now, so it should be
 * searchable too.
 */
import { useMemo, useState } from 'react'
import type { AssetType } from '../../types'
import { ASSET_LABELS } from '../../lib/labels'

interface Props {
  assets: readonly AssetType[]
  value: AssetType | 'Todos'
  onChange: (asset: AssetType | 'Todos') => void
}

export function AssetPicker({ assets, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return assets.filter((a) => a.toLowerCase().includes(q) || ASSET_LABELS[a].toLowerCase().includes(q))
  }, [assets, search])

  const select = (asset: AssetType | 'Todos') => {
    onChange(asset)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-field flex items-center gap-2 min-w-[140px] justify-between"
      >
        <span className="font-medium truncate">{value === 'Todos' ? 'Todos os ativos' : ASSET_LABELS[value]}</span>
        <span className="text-brand-text-muted text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 w-72 card p-2 shadow-lg">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar ativo..."
              className="input-field w-full mb-2"
            />
            <div className="max-h-64 overflow-y-auto">
              <button
                onClick={() => select('Todos')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-brand-elevated ${value === 'Todos' ? 'text-brand-orange-accent font-semibold' : 'text-brand-text'}`}
              >
                Todos os ativos
              </button>
              {filtered.map((asset) => (
                <button
                  key={asset}
                  onClick={() => select(asset)}
                  title={asset}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-brand-elevated ${value === asset ? 'text-brand-orange-accent font-semibold' : 'text-brand-text'}`}
                >
                  {ASSET_LABELS[asset]}
                </button>
              ))}
              {filtered.length === 0 && <p className="text-xs text-brand-text-muted px-3 py-2">Nenhum ativo encontrado.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
