/**
 * Advanced filters drawer — Binance P2P-style, requested directly with
 * exact option wording and an "i" info icon per option explaining what
 * it does. `negotiableOnly`/`highReputationOnly`/`previouslyTradedOnly`
 * filter against UI-only demonstration fields (see MarketplaceFilters'
 * own comment in types.ts) — real versions need a real block-list and
 * trade-history join, neither built in the backend yet.
 */
import type { FiatCurrency, MarketplaceFilters, PaymentMethod } from '../../types'
import { AMOUNT_PRESETS, formatByCurrency } from '../../lib/currency'
import { COUNTRIES, PAYMENT_METHODS } from '../../data/mock'
import { InfoTooltip } from '../ui/InfoTooltip'

interface Props {
  open: boolean
  onClose: () => void
  filters: MarketplaceFilters
  onChange: (filters: MarketplaceFilters) => void
  currency: FiatCurrency
}

const TIME_LIMITS: { value: MarketplaceFilters['paymentTimeLimit']; label: string }[] = [
  { value: 'Todos', label: 'Todos' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '24h', label: '24h' },
]

const SORT_OPTIONS: { value: MarketplaceFilters['sortBy']; label: string }[] = [
  { value: 'price', label: 'Preço' },
  { value: 'trades', label: 'Trades concluídos' },
  { value: 'reputation', label: 'Reputação' },
]

export function FilterPanel({ open, onClose, filters, onChange, currency }: Props) {
  if (!open) return null

  const set = <K extends keyof MarketplaceFilters>(key: K, value: MarketplaceFilters[K]) =>
    onChange({ ...filters, [key]: value })

  const togglePaymentMethod = (method: PaymentMethod) => {
    const has = filters.paymentMethods.includes(method)
    set('paymentMethods', has ? filters.paymentMethods.filter((m) => m !== method) : [...filters.paymentMethods, method])
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm h-full bg-brand-surface border-l border-brand-border overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-brand-text">Filtros avançados</h3>
          <button onClick={onClose} className="text-brand-text-muted hover:text-brand-text text-sm">✕</button>
        </div>

        <ToggleRow
          label="Salvar filtro para o próximo"
          info="Mantém essas preferências de filtro salvas para a próxima vez que você visitar o Marketplace."
          checked={filters.saveForNext}
          onChange={(v) => set('saveForNext', v)}
        />

        <CheckRow
          label="Apenas anúncios negociáveis"
          info="Exclui usuários que você bloqueou ou que bloquearam você."
          checked={filters.negotiableOnly}
          onChange={(v) => set('negotiableOnly', v)}
        />

        <CheckRow
          label="Somente comerciantes com alta reputação"
          info="Mostra apenas comerciantes com excelentes pontuações e avaliações de alta reputação."
          checked={filters.highReputationOnly}
          onChange={(v) => set('highReputationOnly', v)}
        />

        <CheckRow
          label="Comerciantes com os quais você já negociou"
          info="Comerciantes frequentes com quem você negociou nos últimos meses."
          checked={filters.previouslyTradedOnly}
          onChange={(v) => set('previouslyTradedOnly', v)}
        />

        <div className="mt-5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Quantidade</span>
            <InfoTooltip text="A quantidade que você costuma negociar — usada para destacar ofertas com limites compatíveis." />
          </div>
          <input
            value={filters.amount}
            onChange={(e) => set('amount', e.target.value)}
            type="number"
            placeholder="0.00"
            className="input-field w-full mb-2"
          />
          <div className="flex gap-1.5 flex-wrap">
            {AMOUNT_PRESETS[currency].map((preset) => (
              <button
                key={preset}
                onClick={() => set('amount', String(preset))}
                className={filters.amount === String(preset) ? 'pill-active' : 'pill-inactive'}
              >
                {formatByCurrency(preset, currency)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Tempo limite para pagamento</span>
            <InfoTooltip text="Tempo máximo (em minutos) que o comprador tem para confirmar o pagamento antes que a ordem expire." />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {TIME_LIMITS.map((t) => (
              <button
                key={t.value}
                onClick={() => set('paymentTimeLimit', t.value)}
                className={filters.paymentTimeLimit === t.value ? 'pill-active' : 'pill-inactive'}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Método de pagamento</span>
            <InfoTooltip text="Métodos populares indicados. As moedas serão liberadas imediatamente após a confirmação do pagamento." />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                onClick={() => togglePaymentMethod(m)}
                className={filters.paymentMethods.includes(m) ? 'pill-active' : 'pill-inactive'}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <span className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">País/Região</span>
          <select
            value={filters.country}
            onChange={(e) => set('country', e.target.value)}
            className="input-field w-full mt-2"
          >
            <option value="Todos">Todos</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-5">
          <span className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Ordenar por</span>
          <div className="flex gap-1.5 flex-wrap mt-2">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => set('sortBy', s.value)}
                className={filters.sortBy === s.value ? 'pill-active' : 'pill-inactive'}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={onClose} className="btn-primary w-full mt-6 py-2.5 text-sm">
          Aplicar Filtros
        </button>
      </div>
    </div>
  )
}

function ToggleRow({ label, info, checked, onChange }: { label: string; info: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-brand-border">
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-brand-text">{label}</span>
        <InfoTooltip text={info} />
      </div>
      <button
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`w-10 h-5.5 rounded-full transition-colors relative shrink-0 ${checked ? 'bg-brand-orange' : 'bg-brand-elevated border border-brand-border'}`}
        style={{ height: '22px' }}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}

function CheckRow({ label, info, checked, onChange }: { label: string; info: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-2.5 border-b border-brand-border cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-brand-orange w-4 h-4" />
      <span className="text-sm text-brand-text flex-1">{label}</span>
      <InfoTooltip text={info} />
    </label>
  )
}
