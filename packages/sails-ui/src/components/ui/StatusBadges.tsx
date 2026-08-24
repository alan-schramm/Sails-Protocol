/**
 * Small badge/pill primitives. Semantic colors (green/red/yellow/blue)
 * are universal conventions, not brand decisions — orange is reserved
 * for the brand accent (primary actions, active states), never reused
 * here for a status meaning.
 */
import type { AssetType, TradeSide, PaymentMethod, TradeStatus, EscrowStatus, OfferStatus } from '../../types'
import { ASSET_LABELS, PAYMENT_METHOD_LABELS } from '../../lib/labels'
import { badgeVariants } from './badge'
import { cn } from '../../lib/utils'
import { Zap } from 'lucide-react'

// Routes through badgeVariants' own base shape (shared with the generic
// shadcn Badge) rather than a hardcoded string — but each call site below
// still passes its own full color className (green=compra, red=venda,
// blue=pagamento, etc.), since these are real domain-semantic colors
// with no equivalent in Badge's own fixed default/secondary/destructive/
// outline palette.
function Pill({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn(badgeVariants({ variant: 'outline' }), 'whitespace-nowrap rounded-full px-2.5 py-1', className)}>
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

// Missão 11 Fase 7.3 (cumulative audit) — EXPIRED added: a real
// EscrowStatus value (../../types.ts, mirroring prisma/schema.prisma)
// this Record was missing — TypeScript's own Record<EscrowStatus, ...>
// exhaustiveness check would otherwise fail this package's build the
// moment the type gained the value. SPLIT (RFC-021 D9) is a separate,
// pre-existing gap in this same Record, unrelated to and predating this
// fix — disclosed, not fixed here.
const ESCROW_STATUS_LABEL: Record<EscrowStatus, string> = {
  CREATED: 'Criado', FUNDS_LOCKED: 'Fundos travados', PAYMENT_PENDING: 'Aguardando pagamento',
  COMPLETED: 'Concluído', DISPUTED: 'Em disputa', REFUNDED: 'Reembolsado', EXPIRED: 'Expirado',
}
const ESCROW_STATUS_COLOR: Record<EscrowStatus, string> = {
  CREATED: 'border-brand-border bg-brand-elevated text-brand-text-secondary',
  FUNDS_LOCKED: 'border-blue-500/25 bg-blue-500/10 text-blue-500',
  PAYMENT_PENDING: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-500',
  COMPLETED: 'border-green-500/25 bg-green-500/10 text-green-500',
  DISPUTED: 'border-red-500/25 bg-red-500/10 text-red-500',
  REFUNDED: 'border-brand-border bg-brand-elevated text-brand-text-muted',
  EXPIRED: 'border-orange-500/25 bg-orange-500/10 text-orange-500',
}
export function EscrowStatusBadge({ status }: { status: EscrowStatus }) {
  return <Pill className={ESCROW_STATUS_COLOR[status]}>{ESCROW_STATUS_LABEL[status]}</Pill>
}

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  ACTIVE: 'Ativa', PAUSED: 'Pausada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
}
export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const color = status === 'ACTIVE' ? 'border-green-500/25 bg-green-500/10 text-green-500' : 'border-brand-border bg-brand-elevated text-brand-text-muted'
  return <Pill className={color}>{OFFER_STATUS_LABEL[status]}</Pill>
}

// Noones-inspired tenure/volume badge (lib/reputation.ts's own comment
// has the full threshold sourcing) — an achievement/brand highlight, not
// a semantic status, so it uses the orange accent like other brand-
// highlight marks in this UI (e.g. the "Verificado" checkmark), not a
// universal-convention color the way Trade/Escrow/Offer status do above.
export function PowerTraderBadge() {
  return (
    <Pill
      className="border-brand-orange-accent/30 bg-brand-orange-accent/10 text-brand-orange-accent flex items-center gap-1"
      title="Power Trader: alto volume de trades com alta taxa de trades sem disputa"
    >
      <Zap className="h-3 w-3" fill="currentColor" strokeWidth={0} /> Power Trader
    </Pill>
  )
}
