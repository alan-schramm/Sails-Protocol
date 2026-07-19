import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { generateIntentWithQvac, type AgentGeneratedIntent } from '../../lib/qvacAgent'
import {
  NEGOTIATION_PROFILES,
  PROFILE_META,
  negotiationSteps,
  nextBestOffer,
  type NegotiationMandate,
  type NegotiationProfile,
} from '../../lib/aiNegotiator'
import { InfoTooltip } from '../ui/InfoTooltip'
import { ASSET_LABELS, ASSET_SHORT_LABELS, PAYMENT_METHOD_LABELS } from '../../lib/labels'
import type { AssetType, FiatCurrency, TradeSide } from '../../types'

const GOAL_PLACEHOLDER = 'Ex: quero comprar USDT pagando via PIX, tenho até R$ 500 disponíveis'

const BOUNDARY_TEXT =
  'QVAC roda um LLM local (llama.cpp, sem nuvem). É um agente Crypto-Native (RFC-016): só age sobre ativos digitais já na sua wallet — negociar, criar/aceitar ofertas, travar e liberar escrow via WDK. Ele nunca chama uma API bancária e nunca toca PIX ou qualquer trilho fiat — quem faz o PIX é sempre a contraparte humana, fora do protocolo. Nesta interface o resultado é simulado: ainda não existe uma rota HTTP real conectando o navegador ao QVAC.'

interface Props {
  // Real fix: this panel used to live disconnected from the offer grid
  // below it on Marketplace — generating an intent here never affected
  // what offers were shown, and vice versa, so the two features felt
  // bolted together rather than one flow. Calling this as soon as an
  // intent is generated lets Marketplace narrow its own asset/side/
  // currency filters to match, so the grid updates live.
  onIntentGenerated?: (asset: AssetType, side: TradeSide, currency: FiatCurrency) => void
  // Real bug found in a cold-start UX walkthrough: a goal mentioning a
  // currency the heuristic parser got wrong (qvacAgent.ts's own fix)
  // could silently narrow Marketplace to zero matching offers, with
  // nothing in this panel telling the user why — they'd only see a
  // generic empty grid below, easy to miss or misread as "there's
  // nothing to buy" rather than "this filter is too narrow." Marketplace
  // passes the live post-filter count back in so this panel can say so
  // directly, right where the filter was just set.
  matchCount?: number
  onResetFilters?: () => void
}

export function AgentIntentionPanel({ onIntentGenerated, matchCount, onResetFilters }: Props) {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<TradeSide>('BUY')
  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AgentGeneratedIntent | null>(null)

  const [quantity, setQuantity] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [deadlineMinutes, setDeadlineMinutes] = useState(20)
  const [tolerancePct, setTolerancePct] = useState(PROFILE_META.BALANCED.defaultTolerancePct)
  const [profile, setProfile] = useState<NegotiationProfile>('BALANCED')

  const [delegated, setDelegated] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [proposalsAnalyzed, setProposalsAnalyzed] = useState(0)
  const [bestOffer, setBestOffer] = useState<number | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const iterationRef = useRef(0)

  const steps = result ? negotiationSteps(result.fiatMethod) : []
  const finished = delegated && stepIndex >= steps.length - 1

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const handleGenerate = async () => {
    if (!goal.trim()) {
      toast.error('Descreva o que você quer negociar')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const intent = await generateIntentWithQvac(goal.trim(), side)
      setResult(intent)
      setLimitPrice('')
      setQuantity('')
      onIntentGenerated?.(intent.asset, intent.side, intent.currency)
    } finally {
      setLoading(false)
    }
  }

  const handleProfileChange = (p: NegotiationProfile) => {
    setProfile(p)
    setTolerancePct(PROFILE_META[p].defaultTolerancePct)
  }

  const handleDelegate = () => {
    if (!result) return
    const qty = Number(quantity)
    const price = Number(limitPrice)
    if (!qty || qty <= 0) {
      toast.error('Informe a quantidade')
      return
    }
    if (!price || price <= 0) {
      toast.error(`Informe o preço ${side === 'BUY' ? 'máximo' : 'mínimo'}`)
      return
    }

    const mandate: NegotiationMandate = {
      asset: result.asset,
      side: result.side,
      quantity,
      limitPrice,
      currency: result.currency,
      paymentMethod: result.fiatMethod,
      deadlineMinutes,
      tolerancePct,
      profile,
    }

    setDelegated(true)
    setStopped(false)
    setStepIndex(0)
    setProposalsAnalyzed(0)
    setBestOffer(null)
    setSecondsRemaining(deadlineMinutes * 60)
    iterationRef.current = 0

    const tickMs = PROFILE_META[profile].tickMs
    intervalRef.current = setInterval(() => {
      iterationRef.current += 1
      setStepIndex((i) => Math.min(i + 1, negotiationSteps(mandate.paymentMethod).length - 1))
      setProposalsAnalyzed((n) => n + Math.floor(1 + Math.random() * 4))
      setBestOffer(nextBestOffer(price, mandate.side, iterationRef.current))
      setSecondsRemaining((s) => Math.max(0, s - tickMs / 1000))
    }, tickMs)

    toast.success('Mandato delegado ao AI Negotiator 🤖')
  }

  useEffect(() => {
    if (delegated && stepIndex >= steps.length - 1 && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [delegated, stepIndex, steps.length])

  const handleStop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    setStopped(true)
    toast('Controle assumido pelo usuário', { icon: '🛑' })
  }

  const handleReset = () => {
    setResult(null)
    setDelegated(false)
    setStopped(false)
    setStepIndex(0)
    setGoal('')
  }

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = Math.floor(secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="card p-4 mb-4">
      <div className="w-full flex items-center justify-between text-left">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-semibold text-brand-text"
        >
          🤖 AI Negotiator — negociação assistida por IA (Agente QVAC)
        </button>
        <div className="flex items-center gap-2">
          <InfoTooltip text={BOUNDARY_TEXT} />
          <button onClick={() => setOpen((o) => !o)} className="text-brand-text-muted text-xs">
            {open ? 'fechar ▲' : 'abrir ▼'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3">
          {!result && (
            <>
              <div className="flex gap-1 bg-brand-elevated rounded-lg p-1 w-fit mb-2">
                {(['BUY', 'SELL'] as TradeSide[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      side === s ? 'bg-brand-surface shadow-sm font-medium text-brand-text' : 'text-brand-text-secondary'
                    }`}
                  >
                    {s === 'BUY' ? 'Quero comprar' : 'Quero vender'}
                  </button>
                ))}
              </div>

              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={GOAL_PLACEHOLDER}
                className="input-field w-full"
                rows={2}
              />

              <div className="flex items-center gap-3 mt-2">
                <button onClick={handleGenerate} disabled={loading} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
                  {loading ? 'QVAC pensando...' : 'Gerar com QVAC'}
                </button>
                {loading && (
                  <span className="text-xs text-brand-text-muted flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
                    LLAMA_3_2_1B_INST_Q4_0 · inferência local (simulada)
                  </span>
                )}
              </div>
            </>
          )}

          {result && !delegated && (
            <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/5 p-3">
              <div className="text-xs font-semibold text-brand-orange mb-2">Intenção estruturada gerada</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mb-3">
                <Field label="Ativo" value={ASSET_LABELS[result.asset]} />
                <Field label="Lado" value={result.side === 'BUY' ? 'Compra' : 'Venda'} />
                <Field label="Moeda" value={result.currency} />
                <Field label="Método" value={PAYMENT_METHOD_LABELS[result.fiatMethod]} />
                <Field label="Faixa de valor sugerida" value={`${result.currency} ${result.minValue} – ${result.maxValue}`} />
              </div>

              {matchCount !== undefined && (
                matchCount > 0 ? (
                  <button
                    onClick={() => document.getElementById('marketplace-offer-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="text-xs text-brand-orange underline mb-3 block"
                  >
                    {matchCount} {matchCount === 1 ? 'oferta corresponde' : 'ofertas correspondem'} a este filtro — ver no Marketplace ↓
                  </button>
                ) : (
                  <div className="mb-3 rounded-md bg-brand-elevated border border-brand-border px-3 py-2 text-xs text-brand-text-secondary">
                    Nenhuma oferta encontrada com {result.currency} + {ASSET_LABELS[result.asset]}
                    {onResetFilters && (
                      <button onClick={onResetFilters} className="ml-2 text-brand-orange underline whitespace-nowrap">
                        Redefinir filtros
                      </button>
                    )}
                  </div>
                )
              )}

              <div className="text-xs font-semibold text-brand-text mb-2">Mandato para o AI Negotiator</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <label className="text-xs text-brand-text-muted">
                  Quantidade ({ASSET_SHORT_LABELS[result.asset]})
                  <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Ex: 100" className="input-field w-full mt-1 text-sm" />
                </label>
                <label className="text-xs text-brand-text-muted">
                  Preço {side === 'BUY' ? 'máximo' : 'mínimo'} ({result.currency}/un.)
                  <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} placeholder="Ex: 5.61" className="input-field w-full mt-1 text-sm" />
                </label>
                <label className="text-xs text-brand-text-muted">
                  Prazo (minutos)
                  <select value={deadlineMinutes} onChange={(e) => setDeadlineMinutes(Number(e.target.value))} className="input-field w-full mt-1 text-sm">
                    {[15, 20, 30, 45, 60].map((m) => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-brand-text-muted">
                  Tolerância (%)
                  <input
                    type="number" step="0.05" min="0"
                    value={tolerancePct}
                    onChange={(e) => setTolerancePct(Number(e.target.value))}
                    className="input-field w-full mt-1 text-sm"
                  />
                </label>
              </div>

              <div className="text-xs text-brand-text-muted mb-1">Perfil de negociação</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {NEGOTIATION_PROFILES.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleProfileChange(p)}
                    title={PROFILE_META[p].description}
                    className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                      profile === p
                        ? 'bg-brand-orange text-white border-brand-orange'
                        : 'border-brand-border text-brand-text-secondary hover:border-brand-orange'
                    }`}
                  >
                    {PROFILE_META[p].label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={handleDelegate} className="btn-primary px-3 py-1.5 text-xs">
                  🤖 Delegar para IA
                </button>
                <button onClick={handleReset} className="btn-ghost px-3 py-1.5 text-xs">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {result && delegated && (
            <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/5 p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-brand-orange">Status</span>
                {!stopped && !finished && (
                  <button onClick={handleStop} className="bg-red-600 hover:bg-red-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors">
                    🛑 Parar Agente / Assumir Controle
                  </button>
                )}
              </div>

              <div className="space-y-1.5 mb-4">
                {steps.map((step, i) => (
                  <div key={step.id} className="flex items-center gap-2 text-xs">
                    <span className={i <= stepIndex ? 'text-green-500' : 'text-brand-text-muted'}>
                      {i < stepIndex ? '✓' : i === stepIndex ? '●' : '○'}
                    </span>
                    <span className={i <= stepIndex ? 'text-brand-text' : 'text-brand-text-muted'}>{step.label}</span>
                  </div>
                ))}
              </div>

              {(stopped || finished) && (
                <div className="mb-3 rounded-md bg-brand-elevated px-3 py-2 text-xs text-brand-text-secondary">
                  {stopped ? `Controle assumido pelo usuário — última etapa: "${steps[stepIndex]?.label}".` : 'Negociação concluída pela IA.'}
                </div>
              )}

              <div className="text-xs font-semibold text-brand-text mb-2">Agent Strategy</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mb-3">
                <Field label="Modo" value={PROFILE_META[profile].label} />
                <Field label="Objetivo" value={side === 'BUY' ? 'Comprar' : 'Vender'} />
                <Field label="Quantidade" value={`${quantity} ${ASSET_SHORT_LABELS[result.asset]}`} />
                <Field label={side === 'BUY' ? 'Preço máximo' : 'Preço mínimo'} value={`${result.currency} ${limitPrice}`} />
                <Field label="Tempo restante" value={formatCountdown(secondsRemaining)} />
                <Field label="Propostas analisadas" value={String(proposalsAnalyzed)} />
                {bestOffer !== null && <Field label="Melhor oferta" value={`${result.currency} ${bestOffer}`} />}
              </div>

              {(stopped || finished) && (
                <button onClick={handleReset} className="btn-ghost px-3 py-1.5 text-xs">
                  Novo mandato
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-brand-surface rounded-md px-2 py-1.5 border border-brand-border">
      <div className="text-brand-text-muted">{label}</div>
      <div className="font-medium text-brand-text">{value}</div>
    </div>
  )
}
