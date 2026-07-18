/**
 * Binance-style asset selector: a button that opens a search list,
 * instead of a lateral row of pills. Requested directly — a pill row
 * doesn't scale once more assets exist (ETH, USDC, SOL, etc.), and a
 * search-based picker already handles that without changing this
 * component when ASSETS (data/mock.ts) grows. Only the 10 real
 * AssetType values (prisma/schema.prisma) are listed today — no
 * fictional assets added just to make the picker look fuller.
 */
import { useMemo, useState } from 'react'
import type { AssetType } from '../../types'

interface Props {
  assets: readonly AssetType[]
  value: AssetType | 'Todos'
  onChange: (asset: AssetType | 'Todos') => void
}

export function AssetPicker({ assets, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () => assets.filter((a) => a.toLowerCase().includes(search.toLowerCase())),
    [assets, search]
  )

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
        <span className="font-medium">{value === 'Todos' ? 'Todos os ativos' : value}</span>
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
                className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-brand-elevated ${value === 'Todos' ? 'text-brand-orange font-semibold' : 'text-brand-text'}`}
              >
                Todos os ativos
              </button>
              {filtered.map((asset) => (
                <button
                  key={asset}
                  onClick={() => select(asset)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono hover:bg-brand-elevated ${value === asset ? 'text-brand-orange font-semibold' : 'text-brand-text'}`}
                >
                  {asset}
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
