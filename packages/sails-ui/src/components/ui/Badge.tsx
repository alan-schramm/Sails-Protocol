/**
 * Small badge/pill primitives. Plain, functional colors only (green/red/
 * gray semantics that are universal, not brand-specific) — the WDK/
 * Binance-inspired dark+orange design system is a deliberate later pass,
 * not this one (see this package's README / docs/TODO.md section 11).
 */
import type { AssetType, TradeSide, PaymentMethod, TradeStatus, EscrowStatus, OfferStatus } from '../../types'

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

export function AssetBadge({ asset }: { asset: AssetType }) {
  return <Pill className="border-gray-300 bg-gray-100 text-gray-700 font-mono">{asset}</Pill>
}

export function SideBadge({ side }: { side: TradeSide }) {
  return side === 'BUY' ? (
    <Pill className="border-green-300 bg-green-50 text-green-700">COMPRAR</Pill>
  ) : (
    <Pill className="border-red-300 bg-red-50 text-red-700">VENDER</Pill>
  )
}

export function PaymentBadge({ method }: { method: PaymentMethod }) {
  return <Pill className="border-blue-300 bg-blue-50 text-blue-700">{method}</Pill>
}

const TRADE_STATUS_LABEL: Record<TradeStatus, string> = {
  PENDING: 'Pendente', ACTIVE: 'Ativo', COMPLETED: 'Concluído', DISPUTED: 'Em disputa', CANCELLED: 'Cancelado',
}
const TRADE_STATUS_COLOR: Record<TradeStatus, string> = {
  PENDING: 'border-yellow-300 bg-yellow-50 text-yellow-700',
  ACTIVE: 'border-blue-300 bg-blue-50 text-blue-700',
  COMPLETED: 'border-green-300 bg-green-50 text-green-700',
  DISPUTED: 'border-red-300 bg-red-50 text-red-700',
  CANCELLED: 'border-gray-300 bg-gray-100 text-gray-500',
}
export function TradeStatusBadge({ status }: { status: TradeStatus }) {
  return <Pill className={TRADE_STATUS_COLOR[status]}>{TRADE_STATUS_LABEL[status]}</Pill>
}

const ESCROW_STATUS_LABEL: Record<EscrowStatus, string> = {
  CREATED: 'Criado', FUNDS_LOCKED: 'Fundos travados', PAYMENT_PENDING: 'Aguardando pagamento',
  COMPLETED: 'Concluído', DISPUTED: 'Em disputa', REFUNDED: 'Reembolsado',
}
const ESCROW_STATUS_COLOR: Record<EscrowStatus, string> = {
  CREATED: 'border-gray-300 bg-gray-100 text-gray-600',
  FUNDS_LOCKED: 'border-blue-300 bg-blue-50 text-blue-700',
  PAYMENT_PENDING: 'border-yellow-300 bg-yellow-50 text-yellow-700',
  COMPLETED: 'border-green-300 bg-green-50 text-green-700',
  DISPUTED: 'border-red-300 bg-red-50 text-red-700',
  REFUNDED: 'border-gray-300 bg-gray-100 text-gray-500',
}
export function EscrowStatusBadge({ status }: { status: EscrowStatus }) {
  return <Pill className={ESCROW_STATUS_COLOR[status]}>{ESCROW_STATUS_LABEL[status]}</Pill>
}

const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  ACTIVE: 'Ativa', PAUSED: 'Pausada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
}
export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const color = status === 'ACTIVE' ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 bg-gray-100 text-gray-500'
  return <Pill className={color}>{OFFER_STATUS_LABEL[status]}</Pill>
}
