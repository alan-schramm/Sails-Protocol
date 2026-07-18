/**
 * "AI Negotiator" — mocked delegation mandate + live negotiation
 * simulation. Same honesty boundary as `qvacAgent.ts`: no backend route
 * accepts a mandate shaped like this yet, so everything below the
 * mandate form is a client-side simulation, not a live agent run.
 *
 * The mandate shape (bounded: quantity/limit price/deadline/tolerance,
 * never open-ended control) mirrors what a real `NegotiationIntent`
 * extension would look like on top of the real `TradeIntentPayload`
 * (`common/types/intent.ts`) the agent already produces today
 * (`BuyerAgent.requestTradeIntent()`). The user always delegates a
 * mandate, never hands over free-form control — reflected here by the
 * mandate fields being required before "Delegar para IA" is enabled, and
 * by the STOP control the panel always keeps visible while a simulation
 * runs.
 *
 * Crypto-Native Agent boundary (RFC-016,
 * docs/rfcs/RFC-016-qvac-crypto-native-agent-boundary.md): every step in
 * `NEGOTIATION_STEPS` below is either search/negotiation (asset-side) or
 * escrow lock/release (asset-side, via WDK in the real system). The one
 * step that names a fiat action ("Aguardando pagamento") is always
 * something the *human counterparty* does outside this protocol — the
 * agent only ever waits for and observes that step, it never performs
 * or automates it.
 */
import type { AssetType, PaymentMethod, TradeSide } from '../types'

export type NegotiationProfile = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE' | 'INSTANT'

export const NEGOTIATION_PROFILES: NegotiationProfile[] = ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE', 'INSTANT']

export const PROFILE_META: Record<NegotiationProfile, { label: string; description: string; defaultTolerancePct: number; tickMs: number }> = {
  CONSERVATIVE: { label: 'Conservador', description: 'Prioriza o melhor preço, aceita esperar mais.', defaultTolerancePct: 0.1, tickMs: 2600 },
  BALANCED: { label: 'Equilibrado', description: 'Equilíbrio entre velocidade e preço.', defaultTolerancePct: 0.25, tickMs: 2000 },
  AGGRESSIVE: { label: 'Agressivo', description: 'Prioriza fechar rápido, aceita um preço um pouco pior.', defaultTolerancePct: 0.5, tickMs: 1300 },
  INSTANT: { label: 'Instantâneo', description: 'Aceita a primeira oferta dentro do limite.', defaultTolerancePct: 0.75, tickMs: 650 },
}

export interface NegotiationMandate {
  asset: AssetType
  side: TradeSide
  quantity: string
  limitPrice: string
  currency: string
  paymentMethod: PaymentMethod
  deadlineMinutes: number
  tolerancePct: number
  profile: NegotiationProfile
}

export interface NegotiationStep {
  id: string
  label: string
}

export function negotiationSteps(paymentMethod: PaymentMethod): NegotiationStep[] {
  return [
    { id: 'SEARCHING', label: 'Procurando ofertas' },
    { id: 'OFFER_FOUND', label: 'Oferta encontrada' },
    { id: 'NEGOTIATING', label: 'Negociando' },
    { id: 'COUNTER_SENT', label: 'Contraproposta enviada' },
    { id: 'AWAITING_RESPONSE', label: 'Aguardando resposta' },
    { id: 'AGREEMENT_REACHED', label: 'Acordo fechado' },
    { id: 'AWAITING_PAYMENT', label: `Aguardando pagamento (${paymentMethod}, feito pela contraparte)` },
    { id: 'ESCROW_RELEASED', label: 'Escrow liberado' },
  ]
}

// Deterministic-ish drift toward the mandate's limit price — a small,
// shrinking random walk, not a real order-book simulation. Purely for a
// believable "Melhor oferta" readout in the Strategy panel.
export function nextBestOffer(limitPrice: number, side: TradeSide, iteration: number): number {
  const decay = Math.max(0.15, 1 - iteration * 0.12)
  const drift = limitPrice * 0.08 * decay * (0.4 + Math.random() * 0.6)
  return side === 'BUY' ? Number((limitPrice + drift).toFixed(2)) : Number((limitPrice - drift).toFixed(2))
}
