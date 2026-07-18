/**
 * Fiat currency filter — BRL/USD/EUR/etc. The real backend only models
 * one local-fiat price (Offer.priceBrl, prisma/schema.prisma) — this is
 * a presentation-layer generalization, honestly flagged in types.ts's
 * own comment on FiatCurrency, not a claim the backend already supports
 * arbitrary fiat pricing.
 */
import { useState } from 'react'
import type { FiatCurrency } from '../../types'
import { FIAT_CURRENCIES } from '../../lib/currency'

interface Props {
  value: FiatCurrency | 'Todas'
  onChange: (currency: FiatCurrency | 'Todas') => void
}

export function CurrencyPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const select = (c: FiatCurrency | 'Todas') => {
    onChange(c)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-field flex items-center gap-2 min-w-[110px] justify-between"
      >
        <span className="font-medium">{value === 'Todas' ? 'Todas moedas' : value}</span>
        <span className="text-brand-text-muted text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 w-56 card p-2 shadow-lg max-h-64 overflow-y-auto">
            <button
              onClick={() => select('Todas')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-brand-elevated ${value === 'Todas' ? 'text-brand-orange font-semibold' : 'text-brand-text'}`}
            >
              Todas as moedas
            </button>
            {FIAT_CURRENCIES.map((c) => (
              <button
                key={c.code}
                onClick={() => select(c.code)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-brand-elevated flex justify-between ${value === c.code ? 'text-brand-orange font-semibold' : 'text-brand-text'}`}
              >
                <span className="font-mono">{c.code}</span>
                <span className="text-brand-text-muted text-xs">{c.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
