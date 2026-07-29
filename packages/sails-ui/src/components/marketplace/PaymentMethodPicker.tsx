/**
 * Payment-method quick filter (2026-07-28), requested directly — same
 * search-based picker pattern AssetPicker/CurrencyPicker already use on
 * this toolbar, so a user can immediately check "does anyone here accept
 * my payment method?" without opening the full Filtros drawer. Multi-
 * select (unlike Asset/CurrencyPicker's single value): a trader might
 * accept more than one method. Binds to the exact same
 * `filters.paymentMethods` FilterPanel's own "Método de pagamento"
 * section already edits — not a second source of truth, just a second,
 * faster entry point to it.
 */
import { useMemo, useState } from 'react'
import type { PaymentMethod } from '../../types'
import { PAYMENT_METHOD_LABELS } from '../../lib/labels'

interface Props {
  methods: readonly PaymentMethod[]
  value: PaymentMethod[]
  onChange: (methods: PaymentMethod[]) => void
}

export function PaymentMethodPicker({ methods, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () => methods.filter((m) => PAYMENT_METHOD_LABELS[m].toLowerCase().includes(search.toLowerCase())),
    [methods, search]
  )

  const toggle = (m: PaymentMethod) => {
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m])
  }

  const label =
    value.length === 0 ? 'Métodos de pagamento' : value.length === 1 ? PAYMENT_METHOD_LABELS[value[0]] : `${value.length} métodos`

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-field flex items-center gap-2 min-w-[170px] justify-between"
      >
        <span className={`truncate ${value.length > 0 ? 'font-medium text-brand-orange-accent' : ''}`}>{label}</span>
        <span className="text-brand-text-muted text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 w-72 card p-2 shadow-lg">
            <div className="relative mb-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted text-sm pointer-events-none">🔍</span>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar método de pagamento..."
                className="input-field w-full pl-8"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.map((m) => {
                const checked = value.includes(m)
                return (
                  <button
                    key={m}
                    onClick={() => toggle(m)}
                    aria-pressed={checked}
                    className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-sm hover:bg-brand-elevated ${
                      checked ? 'text-brand-orange-accent font-semibold' : 'text-brand-text'
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                    {checked && <span>✓</span>}
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <p className="text-xs text-brand-text-muted px-3 py-2">Nenhum método encontrado com esse nome.</p>
              )}
            </div>
            {value.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="w-full text-xs text-brand-text-muted hover:text-brand-text mt-1 pt-2 border-t border-brand-border"
              >
                Limpar seleção
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
