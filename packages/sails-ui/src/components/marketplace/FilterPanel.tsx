/**
 * Advanced filters drawer — Binance P2P-style, requested directly with
 * exact option wording and an "i" info icon per option explaining what
 * it does. `negotiableOnly`/`highReputationOnly`/`previouslyTradedOnly`
 * filter against UI-only demonstration fields (see MarketplaceFilters'
 * own comment in types.ts) — real versions need a real block-list and
 * trade-history join, neither built in the backend yet.
 *
 * NAVIGATION-FILTER-1 §4.1 — reorganized into six labeled sections
 * (Qualidade do anunciante / Valor / Tempo de pagamento / País-Região /
 * Método de pagamento / Ordenação), was six blocks of equal visual
 * weight with no grouping signal beyond spacing. §4.6 — footer is now
 * sticky (outside the scrolling region) so mobile users don't have to
 * scroll to the end to apply/clear.
 */
import * as React from 'react'
import type { FiatCurrency, MarketplaceFilters, PaymentMethod } from '../../types'
import { AMOUNT_PRESETS, formatByCurrency } from '../../lib/currency'
import { COUNTRIES, PAYMENT_METHODS_FILTERABLE } from '../../data/mock'
import { PAYMENT_METHOD_LABELS } from '../../lib/labels'
import {
  PAYMENT_METHOD_CATEGORY,
  PAYMENT_METHOD_CATEGORY_LABELS,
  PAYMENT_METHOD_CATEGORY_ORDER,
  COUNTRY_PRIORITY_METHODS,
} from '../../lib/paymentMethodMeta'
import { countActiveFilters } from '../../lib/filters'
import { InfoTooltip } from '../ui/InfoTooltip'
import { Button } from '../ui/button'
import { badgeVariants } from '../ui/badge'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Checkbox } from '../ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { cn } from '../../lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import { Search, ChevronDown, ChevronUp, X } from 'lucide-react'
import { DEFAULT_FILTERS } from '../../types'

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

// NAVIGATION-FILTER-1 §4.4 — copy audit. `trades`/`reputation` are
// correctly "best first" regardless of context (higher totalTrades/
// reputationScore is unambiguously better) — safe to say "Maior"/"Mais".
// `price` is NOT: Marketplace.tsx's own sort is a flat
// `a.priceUsd - b.priceUsd` (always ascending) regardless of the
// BUY/SELL side filter. Ascending is genuinely "best" only when viewing
// SELL offers (the viewer is buying — lowest price wins); for BUY
// offers (the viewer would be selling to the offer's maker) ascending
// shows the WORST price first. Calling this "Melhor preço" would
// overclaim correctness the implementation doesn't have yet — "Menor
// preço" states exactly what happens today, honestly. Real gap
// registered, not fixed here (a side-aware sort is a logic change, out
// of this mission's copy-only scope for §4.4) — see
// docs/SAILS_DESIGN_LANGUAGE.md's Filter/Discovery UX Grammar section
// and docs/BACKLOG.md.
export const SORT_OPTIONS: { value: MarketplaceFilters['sortBy']; label: string }[] = [
  { value: 'price', label: 'Menor preço' },
  { value: 'reputation', label: 'Maior reputação' },
  { value: 'trades', label: 'Mais trades' },
]

export function FilterPanel({ open, onClose, filters, onChange, currency }: Props) {
  const set = <K extends keyof MarketplaceFilters>(key: K, value: MarketplaceFilters[K]) =>
    onChange({ ...filters, [key]: value })

  const togglePaymentMethod = (method: PaymentMethod) => {
    const has = filters.paymentMethods.includes(method)
    set('paymentMethods', has ? filters.paymentMethods.filter((m) => m !== method) : [...filters.paymentMethods, method])
  }

  const activeCount = countActiveFilters(filters)

  // §4.6 — preserves the user's save-preference and current sort choice
  // (not "filters" in the countActiveFilters sense — sort is display
  // ordering, saveForNext is a meta-preference about persistence, not
  // search criteria), clears everything that actually narrows results.
  const clearAll = () => onChange({ ...DEFAULT_FILTERS, saveForNext: filters.saveForNext, sortBy: filters.sortBy })

  return (
    // Real Radix Sheet (2026-08-01) — replaces a hand-rolled `fixed inset-0`
    // backdrop with a manually added (but never wired) `role="dialog"
    // aria-modal="true"`: no real focus trap, no Escape-to-close. Same fix
    // as Disputes.tsx's own drawer — see feedback_slc_ui_philosophy memory.
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full max-w-sm p-0 flex flex-col">
        <div className="flex-1 overflow-y-auto p-5">
          <SheetHeader>
            <SheetTitle>Filtros avançados</SheetTitle>
          </SheetHeader>

          {/* §4.5 — proportional active-filter summary: a count + a single
              clear-all action, not a second set of removable chips
              duplicating the per-section toggles already visible below. */}
          {activeCount > 0 && (
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-brand-text-secondary">
                {activeCount} {activeCount === 1 ? 'filtro ativo' : 'filtros ativos'}
              </span>
              <button onClick={clearAll} className="text-brand-orange-accent hover:underline font-medium">
                Limpar tudo
              </button>
            </div>
          )}

          <ToggleRow
            label="Salvar filtro para o próximo"
            info="Mantém essas preferências de filtro salvas para a próxima vez que você visitar o Marketplace."
            checked={filters.saveForNext}
            onChange={(v) => set('saveForNext', v)}
          />

          <Section title="Qualidade do anunciante">
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
              last
            />
          </Section>

          <Section title="Valor" info="A quantidade que você costuma negociar — usada para destacar ofertas com limites compatíveis.">
            <Input
              value={filters.amount}
              onChange={(e) => set('amount', e.target.value)}
              type="number"
              placeholder="0.00"
              className="w-full mb-2"
            />
            <div className="flex gap-1.5 flex-wrap">
              {AMOUNT_PRESETS[currency].map((preset) => (
                <button
                  key={preset}
                  onClick={() => set('amount', String(preset))}
                  className={cn(badgeVariants({ variant: filters.amount === String(preset) ? 'default' : 'secondary' }), 'rounded-full px-3 py-1')}
                >
                  {formatByCurrency(preset, currency)}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Tempo de pagamento" info="Tempo máximo (em minutos) que o comprador tem para confirmar o pagamento antes que a ordem expire.">
            <div className="flex gap-1.5 flex-wrap">
              {TIME_LIMITS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => set('paymentTimeLimit', t.value)}
                  className={cn(badgeVariants({ variant: filters.paymentTimeLimit === t.value ? 'default' : 'secondary' }), 'rounded-full px-3 py-1')}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="País/Região">
            <Select value={filters.country} onValueChange={(v) => set('country', v)}>
              <SelectTrigger aria-label="País/Região" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Section>

          <Section title="Método de pagamento" info="Métodos populares indicados primeiro pelo país selecionado — os demais continuam disponíveis em 'Ver todos'. As moedas serão liberadas imediatamente após a confirmação do pagamento.">
            <PaymentMethodSection
              country={filters.country}
              value={filters.paymentMethods}
              onToggle={togglePaymentMethod}
            />
          </Section>

          <Section title="Ordenação" last>
            <div className="flex gap-1.5 flex-wrap">
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => set('sortBy', s.value)}
                  className={cn(badgeVariants({ variant: filters.sortBy === s.value ? 'default' : 'secondary' }), 'rounded-full px-3 py-1')}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Section>
        </div>

        {/* §4.6 — sticky footer: a flex sibling of the scrolling region
            above (not inside its own overflow-y-auto), so it stays
            pinned to the bottom of the sheet regardless of scroll
            position — no more scrolling to the end to apply/clear. */}
        <div className="shrink-0 border-t border-brand-border-subtle p-4 flex gap-2 bg-brand-surface">
          <Button variant="outline" onClick={clearAll} className="flex-1 py-2.5 text-sm">
            Limpar
          </Button>
          <Button onClick={onClose} className="flex-1 py-2.5 text-sm">
            Aplicar filtros
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// NAVIGATION-FILTER-1 §4.1 — small local wrapper, not a new design-
// system primitive: gives every section the same title + spacing +
// divider rhythm without retyping it six times.
function Section({ title, info, last, children }: { title: string; info?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={`mt-5 pb-5 ${last ? '' : 'border-b border-brand-border-subtle'}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-label">{title}</span>
        {info && <InfoTooltip text={info} />}
      </div>
      {children}
    </div>
  )
}

// NAVIGATION-FILTER-1 §4.2 — replaces the flat "wall of chips" (all 43
// filterable methods rendered at once, no search/grouping/priority)
// with: selected methods pinned visible, country-prioritized
// suggestions (priority, never a hard restriction — every method stays
// reachable via "Ver todos"), and a collapsed-by-default grouped+
// searchable full list.
function PaymentMethodSection({
  country,
  value,
  onToggle,
}: {
  country: string
  value: PaymentMethod[]
  onToggle: (m: PaymentMethod) => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const priorityMethods = React.useMemo(() => COUNTRY_PRIORITY_METHODS[country] ?? [], [country])
  const selectedSet = React.useMemo(() => new Set(value), [value])

  // Suggested row: this country's priority methods, minus whatever is
  // already pinned in the "selected" row above it (no duplicate chips).
  const suggested = priorityMethods.filter((m) => !selectedSet.has(m))

  const q = search.trim().toLowerCase()
  const remaining = React.useMemo(() => {
    const shown = new Set<PaymentMethod>([...value, ...suggested])
    return PAYMENT_METHODS_FILTERABLE.filter((m) => !shown.has(m))
  }, [value, suggested])

  const filteredRemaining = q
    ? remaining.filter((m) => PAYMENT_METHOD_LABELS[m].toLowerCase().includes(q))
    : remaining

  const grouped = React.useMemo(() => {
    const map = new Map<string, PaymentMethod[]>()
    for (const m of filteredRemaining) {
      const cat = PAYMENT_METHOD_CATEGORY[m]
      map.set(cat, [...(map.get(cat) ?? []), m])
    }
    return map
  }, [filteredRemaining])

  const Chip = ({ m }: { m: PaymentMethod }) => (
    <button
      onClick={() => onToggle(m)}
      className={cn(badgeVariants({ variant: selectedSet.has(m) ? 'default' : 'secondary' }), 'rounded-full px-3 py-1')}
    >
      {PAYMENT_METHOD_LABELS[m]}
      {selectedSet.has(m) && <X className="h-3 w-3" />}
    </button>
  )

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2">
          <span className="text-[11px] text-brand-text-muted">Selecionados</span>
          <div className="flex gap-1.5 flex-wrap mt-1">
            {value.map((m) => <Chip key={m} m={m} />)}
          </div>
        </div>
      )}

      {suggested.length > 0 && (
        <div className="mb-2">
          <span className="text-[11px] text-brand-text-muted">
            Sugeridos para {COUNTRIES.find((c) => c.code === country)?.label ?? country}
          </span>
          <div className="flex gap-1.5 flex-wrap mt-1">
            {suggested.map((m) => <Chip key={m} m={m} />)}
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 text-xs text-brand-text-secondary hover:text-brand-text mt-1"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? 'Ocultar métodos' : 'Ver todos os métodos'}
      </button>

      {expanded && (
        <div className="mt-2">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-text-muted pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar método de pagamento..."
              className="w-full pl-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto pr-1 space-y-3">
            {PAYMENT_METHOD_CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
              <div key={cat}>
                <span className="text-[11px] text-brand-text-muted">{PAYMENT_METHOD_CATEGORY_LABELS[cat]}</span>
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {grouped.get(cat)!.map((m) => <Chip key={m} m={m} />)}
                </div>
              </div>
            ))}
            {filteredRemaining.length === 0 && (
              <p className="text-xs text-brand-text-muted">Nenhum método encontrado com esse nome.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// DESIGN-LANGUAGE-1 §2.3 — was a hand-rolled button+span pair reimplementing
// a switch from scratch; the real shadcn `Switch` (packages/sails-ui/src/
// components/ui/switch.tsx, already used by ChatWindow.tsx) exists and is
// already brand-token-mapped (checked = --primary = Sails orange) — no
// reason for a second, subtly-different-looking switch implementation.
function ToggleRow({ label, info, checked, onChange }: { label: string; info: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = React.useId()
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-brand-border-subtle">
      <label htmlFor={id} className="flex items-center gap-1.5 cursor-pointer">
        <span className="text-sm text-brand-text">{label}</span>
        <InfoTooltip text={info} />
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

// Same rationale as ToggleRow: replaces a bare `<input type="checkbox">`
// (unstyled native browser control, the most literal "looks like the
// browser, not Sails Market" case flagged this mission) with the real
// shadcn `Checkbox` primitive (new — packages/sails-ui/src/components/ui/checkbox.tsx,
// same Radix family as the existing Switch/Select/Popover/Dialog).
function CheckRow({ label, info, checked, onChange, last }: { label: string; info: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  const id = React.useId()
  return (
    <div className={`flex items-center gap-2.5 py-2.5 ${last ? '' : 'border-b border-brand-border-subtle'}`}>
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <label htmlFor={id} className="text-sm text-brand-text flex-1 cursor-pointer">{label}</label>
      <InfoTooltip text={info} />
    </div>
  )
}
