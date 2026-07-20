/**
 * "Publicar Anúncio" — a 3-step wizard matching the Binance P2P ad-
 * posting flow, requested directly with a reference screenshot: Definir
 * tipo e preço → Definir valor e método → Definir condições.
 *
 * Every field that reaches `handlePublish()`'s final `Offer` object maps
 * onto a real field in the backend's `CreateOfferInput`
 * (`src/modules/open-liquidity/liquidity.service.ts`, checked before
 * building this): asset, side, priceUsd, priceBrl, minAmount, maxAmount,
 * paymentMethod, paymentDetails, network, description, requiresKyc.
 * Two things in this wizard are honestly NOT backed by that real shape:
 *
 * 1. "Tipo de Preço: Flutuante" (a price pegged to a live market rate,
 *    matching Binance's own picker) — `liquidity.service.ts` has no live
 *    FX/price-feed integration at all (`lib/currency.ts`'s
 *    `AMOUNT_PRESETS` comment already flags this same gap). Selectable
 *    in the UI for fidelity to the reference screenshot, but disabled
 *    with an explanatory tooltip — publishing always sends a fixed price.
 * 2. `priceUsd` itself, when the user prices in a non-USD currency —
 *    derived from `lib/currency.ts`'s `ILLUSTRATIVE_FX_TO_USD`, the same
 *    "illustrative, not a live rate" honesty boundary `AMOUNT_PRESETS`
 *    already uses, since `CreateOfferInput.priceUsd` is mandatory on the
 *    real backend regardless of which fiat the user prices in.
 *
 * No `POST /v1/liquidity/offers` call happens here — `lib/offersStore.ts`
 * persists the result to `localStorage` instead, the same mock-swap
 * boundary this whole package already draws everywhere else.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { AssetPicker } from '../components/marketplace/AssetPicker'
import { CurrencyPicker } from '../components/marketplace/CurrencyPicker'
import { InfoTooltip } from '../components/ui/InfoTooltip'
import { MOCK_OFFERS, ASSETS, PAYMENT_METHODS, COUNTRIES } from '../data/mock'
import { ILLUSTRATIVE_FX_TO_USD, formatByCurrency } from '../lib/currency'
import { PAYMENT_METHOD_LABELS } from '../lib/labels'
import { sailsClient } from '../lib/sailsClient'
import type { AssetType, FiatCurrency, PaymentMethod, TradeSide } from '../types'

const STEPS = ['Definir tipo e preço', 'Definir valor e método', 'Definir condições']

const NETWORK_BY_ASSET: Partial<Record<AssetType, string>> = {
  BTC: 'bitcoin', LN_BTC: 'lightning', LIQUID_BTC: 'liquid',
  USDT_ERC20: 'ethereum', USDT_TRC20: 'tron', USDT_LIQUID: 'liquid', USDT_LIGHTNING: 'lightning',
}

export function PublishOffer() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  // Step 1
  const [side, setSide] = useState<TradeSide>('SELL')
  const [asset, setAsset] = useState<AssetType | 'Todos'>('Todos')
  const [currency, setCurrency] = useState<FiatCurrency | 'Todas'>('BRL')
  const [priceType, setPriceType] = useState<'FIXED' | 'FLOATING'>('FIXED')
  const [price, setPrice] = useState('')

  // Step 2
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX')
  const [paymentDetails, setPaymentDetails] = useState('')

  // Step 3
  const [requiresKyc, setRequiresKyc] = useState(false)
  const [country, setCountry] = useState('BR')
  const [description, setDescription] = useState('')

  const suggestedRange = useMemo(() => {
    if (asset === 'Todos' || currency === 'Todas') return null
    const comparable = MOCK_OFFERS.filter((o) => o.asset === asset && o.fiatCurrency === currency)
    if (comparable.length === 0) return null
    const prices = comparable.map((o) => o.priceFiat)
    return { min: Math.min(...prices), max: Math.max(...prices) }
  }, [asset, currency])

  const step1Valid = asset !== 'Todos' && currency !== 'Todas' && Number(price) > 0
  const step2Valid = Number(minAmount) > 0 && Number(maxAmount) > Number(minAmount) && paymentDetails.trim().length > 0

  const goNext = () => {
    if (step === 1 && !step1Valid) {
      toast.error('Selecione o ativo, a moeda e informe um preço válido')
      return
    }
    if (step === 2 && !step2Valid) {
      toast.error('Informe limites válidos e os detalhes do pagamento')
      return
    }
    setStep((s) => Math.min(s + 1, 3))
  }

  const [publishing, setPublishing] = useState(false)

  const handlePublish = async () => {
    if (!user || asset === 'Todos' || currency === 'Todas') return

    const priceFiat = Number(price)
    // Real CreateOfferInput.priceUsd is mandatory regardless of which
    // fiat the offer is priced in — see this file's own doc comment for
    // why this conversion is illustrative, not live.
    const priceUsd = currency === 'USD' ? priceFiat : Number((priceFiat * ILLUSTRATIVE_FX_TO_USD[currency]).toFixed(2))

    setPublishing(true)
    try {
      // Real @sails/sdk call — POST /v1/liquidity/offers (requires the
      // active session identity.authenticate() already established).
      // priceUsd/minAmount/maxAmount as decimal strings, never number
      // (RFC-009 — packages/sails-sdk/src/types.ts's own header comment).
      await sailsClient.liquidity.publish({
        asset,
        side,
        priceUsd: priceUsd.toFixed(8),
        priceBrl: currency === 'BRL' ? priceFiat.toFixed(8) : undefined,
        minAmount: minAmount,
        maxAmount: maxAmount,
        paymentMethod,
        paymentDetails: paymentDetails.trim(),
        network: NETWORK_BY_ASSET[asset],
        description: description.trim() || undefined,
        requiresKyc,
      })
      toast.success('Anúncio publicado!')
      navigate('/profile')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao publicar anúncio')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => (step === 1 ? navigate('/profile') : setStep((s) => s - 1))} className="text-xl text-brand-text-secondary hover:text-brand-text">
          ←
        </button>
        <h1 className="text-lg font-bold text-brand-text">Publicar Anúncio</h1>
      </div>

      <div className="flex items-center mb-8">
        {STEPS.map((label, i) => {
          const n = i + 1
          const active = n <= step
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${active ? 'bg-brand-orange text-white' : 'bg-brand-elevated text-brand-text-muted'}`}>
                  {n}
                </div>
                <span className={`text-[10px] text-center max-w-[70px] ${active ? 'text-brand-text font-medium' : 'text-brand-text-muted'}`}>{label}</span>
              </div>
              {n < STEPS.length && <div className={`flex-1 h-px mx-2 mb-4 ${step > n ? 'bg-brand-orange' : 'bg-brand-border'}`} />}
            </div>
          )
        })}
      </div>

      <div className="card p-5">
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-brand-text-muted mb-1.5 block">Eu quero</label>
              <div className="flex gap-1 bg-brand-elevated rounded-lg p-1">
                {(['SELL', 'BUY'] as TradeSide[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className={`flex-1 rounded-md py-2 text-sm transition-colors ${side === s ? 'bg-brand-surface shadow-sm font-medium text-brand-text' : 'text-brand-text-secondary'}`}
                  >
                    {s === 'SELL' ? 'Vender' : 'Comprar'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-brand-text-muted mb-1.5 block">Ativo</label>
                <AssetPicker assets={ASSETS} value={asset} onChange={setAsset} />
              </div>
              <div>
                <label className="text-xs text-brand-text-muted mb-1.5 block">com moeda fiduciária</label>
                <CurrencyPicker value={currency} onChange={setCurrency} />
              </div>
            </div>

            <div>
              <label className="text-xs text-brand-text-muted mb-1.5 flex items-center gap-1">
                Tipo de Preço
                <InfoTooltip text="Flutuante (atrelado a uma cotação de mercado ao vivo) ainda não é suportado — não existe integração com uma fonte de câmbio em tempo real no backend hoje. Publicar sempre envia um preço fixo." />
              </label>
              <select value={priceType} onChange={(e) => setPriceType(e.target.value as 'FIXED' | 'FLOATING')} className="input-field w-full">
                <option value="FIXED">Fixo</option>
                <option value="FLOATING">Flutuante (em breve)</option>
              </select>
            </div>

            {priceType === 'FIXED' ? (
              <div>
                <label className="text-xs text-brand-text-muted mb-1.5 block">Preço fixo</label>
                <div className="flex items-center input-field !p-0">
                  <button onClick={() => setPrice(String(Math.max(0, Number(price || 0) - 1)))} className="px-4 py-3 text-brand-text-secondary hover:text-brand-text">−</button>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    type="number"
                    className="flex-1 bg-transparent text-center text-lg font-bold outline-none text-brand-text"
                    placeholder="0"
                  />
                  <button onClick={() => setPrice(String(Number(price || 0) + 1))} className="px-4 py-3 text-brand-text-secondary hover:text-brand-text">+</button>
                </div>
                {suggestedRange && (
                  <p className="text-xs text-brand-text-muted mt-1.5">
                    Faixa de preço sugerida: {formatByCurrency(suggestedRange.min, currency as FiatCurrency)} – {formatByCurrency(suggestedRange.max, currency as FiatCurrency)}
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-brand-elevated border border-brand-border rounded-lg p-3 text-xs text-brand-text-muted">
                Preço flutuante ainda não suportado neste protótipo — selecione "Fixo" para continuar.
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-brand-text-muted mb-1.5 block">Quantidade mínima</label>
                <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} type="number" className="input-field w-full" placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs text-brand-text-muted mb-1.5 block">Quantidade máxima</label>
                <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} type="number" className="input-field w-full" placeholder="0.00" />
              </div>
            </div>

            <div>
              <label className="text-xs text-brand-text-muted mb-1.5 block">Método de pagamento</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="input-field w-full">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-brand-text-muted mb-1.5 block">Detalhes do pagamento</label>
              <input
                value={paymentDetails}
                onChange={(e) => setPaymentDetails(e.target.value)}
                className="input-field w-full"
                placeholder={paymentMethod === 'PIX' ? 'Sua chave PIX' : 'Dados para o comprador enviar o pagamento'}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-brand-text">Requer KYC</div>
                <div className="text-xs text-brand-text-muted">Exigir verificação de identidade da contraparte</div>
              </div>
              <button
                onClick={() => setRequiresKyc((v) => !v)}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${requiresKyc ? 'bg-brand-orange' : 'bg-brand-elevated'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${requiresKyc ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div>
              <label className="text-xs text-brand-text-muted mb-1.5 block">País/Região</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="input-field w-full">
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-brand-text-muted mb-1.5 block">Descrição (opcional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field w-full"
                rows={3}
                placeholder="Instruções extras para a contraparte..."
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-2">
        {step > 1 && (
          <button onClick={() => setStep((s) => s - 1)} className="btn-ghost flex-1 py-3">
            Voltar
          </button>
        )}
        {step < 3 ? (
          <button onClick={goNext} className="btn-primary flex-1 py-3">
            Próximo
          </button>
        ) : (
          <button onClick={handlePublish} disabled={publishing} className="btn-primary flex-1 py-3">
            {publishing ? 'Publicando...' : 'Publicar'}
          </button>
        )}
      </div>
    </div>
  )
}
