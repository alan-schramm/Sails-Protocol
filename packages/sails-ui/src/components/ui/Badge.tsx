/**
 * Small badge/pill primitives. Semantic colors (green/red/yellow/blue)
 * are universal conventions, not brand decisions — orange is reserved
 * for the brand accent (primary actions, active states), never reused
 * here for a status meaning.
 */
import type { AssetType, TradeSide, PaymentMethod, TradeStatus, EscrowStatus, OfferStatus } from '../../types'
import { ASSET_LABELS, PAYMENT_METHOD_LABELS } from '../../lib/labels'

function Pill({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

export function AssetBadge({ asset }: { asset: AssetType }) {
  return <Pill className="border-brand-border bg-brand-elevated text-brand-text-secondary" title={asset}>{ASSET_LABELS[asset]}</Pill>
}

export function SideBadge({ side }: { side: TradeSide }) {
  return side === 'BUY' ? (
    <Pill className="border-green-500/25 bg-green-500/10 text-green-500">COMPRAR</Pill>
  ) : (
    <Pill className="border-red-500/25 bg-red-500/10 text-red-500">VENDER</Pill>
  )
}

export function PaymentBadge({ method }: { method: PaymentMethod }) {
  return <Pill className="border-blue-500/25 bg-blue-500/10 text-blue-500">{PAYMENT_METHOD_LABELS[method]}</Pill>
}

const TRADE_STATUS_LABEL: Record<TradeStatus, string> = {
  PENDING: 'Pendente', ACTIVE: 'Ativo', COMPLETED: 'Concluído', DISPUTED: 'Em disputa', CANCELLED: 'Cancelado',
}
const TRADE_STATUS_COLOR: Record<TradeStatus, string> = {
  PENDING: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-500',
  ACTIVE: 'border-blue-500/25 bg-blue-500/10 text-blue-500',
  COMPLETED: 'border-green-500/25 bg-green-500/10 text-green-500',
  DISPUTED: 'border-red-500/25 bg-red-500/10 text-red-500',
  CANCELLED: 'border-brand-border bg-brand-elevated text-brand-text-muted',
}
export function TradeStatusBadge({ status }: { status: TradeStatus }) {
  return <Pill className={TRADE_STATUS_COLOR[status]}>{TRADE_STATUS_LABEL[status]}</Pill>
}

const ESCROW_STATUS_LABEL: Record<EscrowStatus, string> = {
  CREATED: 'Criado', FUNDS_LOCKED: 'Fundos travados', PAYMENT_PENDING: 'Aguardando pagamento',
  COMPLETED: 'Concluído', DISPUTED: 'Em disputa', REFUNDED: 'Reembolsado',
}
const ESCROW_STATUS_COLOR: Record<EscrowStatus, string> = {
  CREATED: 'border-brand-border bg-brand-elevated text-brand-text-secondary',
  FUNDS_LOCKED: 'border-blue-500/25 bg-blue-500/10 text-blue-500',
  PAYMENT_PENDING: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-500',
  COMPLETED: 'border-green-500/25 bg-green-500/10 text-green-500',
  DISPUTED: 'border-red-500/25 bg-red-500/10 text-red-500',
  REFUNDED: 'border-brand-border bg-brand-elevated text-brand-text-muted',
}
export function EscrowStatusBadge({ status }: { status: EscrowStatus }) {
  return <Pill className={ESCROW_STATUS_COLOR[status]}>{ESCROW_STATUS_LABEL[status]}</Pill>
}

const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  ACTIVE: 'Ativa', PAUSED: 'Pausada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
}
export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const color = status === 'ACTIVE' ? 'border-green-500/25 bg-green-500/10 text-green-500' : 'border-brand-border bg-brand-elevated text-brand-text-muted'
  return <Pill className={color}>{OFFER_STATUS_LABEL[status]}</Pill>
}
