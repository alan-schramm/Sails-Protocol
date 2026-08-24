import type { TradeStatus, EscrowStatus } from '@satsails/p2p-trading-sdk'

/**
 * Two badges, not one — matching packages/sails-ui's own real, already-
 * established pattern (components/ui/Badge.tsx's TradeStatusBadge/
 * EscrowStatusBadge) rather than a single combined "8-state" badge: the
 * two real enums (TradeStatus, EscrowStatus, both in @satsails/p2p-trading-sdk's real
 * type exports) are genuinely 5 and 6 states, and a Trade doesn't always
 * have an Escrow yet (a PENDING trade has none), so collapsing them into
 * one badge would need placeholder states that don't correspond to
 * anything real.
 *
 * Deliberately plain inline styles, not sails-ui's Tailwind brand
 * classes or Portuguese-only labels: this package is a general-purpose
 * @satsails/sdk-react for any third-party wallet integrator, not the
 * Satsails reference app specifically — it can't assume the consumer
 * uses Tailwind, and English is the SDK's own documentation language
 * (SDK_GUIDE.md). A consumer that wants sails-ui's exact visual language
 * restyles via `className`/`style` overrides (both accepted below), not
 * by this package importing that app's design tokens.
 */

const TRADE_STATUS_LABEL: Record<TradeStatus, string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  DISPUTED: 'Disputed',
  CANCELLED: 'Cancelled',
}

const TRADE_STATUS_COLOR: Record<TradeStatus, { bg: string; fg: string }> = {
  PENDING: { bg: '#f5f5f4', fg: '#57534e' },
  ACTIVE: { bg: '#dbeafe', fg: '#1d4ed8' },
  COMPLETED: { bg: '#dcfce7', fg: '#15803d' },
  DISPUTED: { bg: '#fee2e2', fg: '#b91c1c' },
  CANCELLED: { bg: '#f5f5f4', fg: '#78716c' },
}

// Missão 11 Fase 7.3 (cumulative audit) — EXPIRED added: a real
// EscrowStatus value (@satsails/p2p-trading-sdk, mirroring
// prisma/schema.prisma) this Record was missing — TypeScript's own
// Record<EscrowStatus, ...> exhaustiveness check would otherwise fail
// this package's build the moment the SDK's own type gained the value.
const ESCROW_STATUS_LABEL: Record<EscrowStatus, string> = {
  CREATED: 'Created',
  FUNDS_LOCKED: 'Funds locked',
  PAYMENT_PENDING: 'Payment pending',
  COMPLETED: 'Completed',
  DISPUTED: 'Disputed',
  REFUNDED: 'Refunded',
  SPLIT: 'Split',
  EXPIRED: 'Expired',
}

const ESCROW_STATUS_COLOR: Record<EscrowStatus, { bg: string; fg: string }> = {
  CREATED: { bg: '#f5f5f4', fg: '#57534e' },
  FUNDS_LOCKED: { bg: '#dbeafe', fg: '#1d4ed8' },
  PAYMENT_PENDING: { bg: '#fef9c3', fg: '#a16207' },
  COMPLETED: { bg: '#dcfce7', fg: '#15803d' },
  DISPUTED: { bg: '#fee2e2', fg: '#b91c1c' },
  REFUNDED: { bg: '#f5f5f4', fg: '#78716c' },
  SPLIT: { bg: '#f3e8ff', fg: '#7c3aed' },
  // Same warm-alert family as DISPUTED (this state also means "needs
  // human attention"), kept visually distinct from it — expiry is not
  // itself a dispute yet, so it doesn't share DISPUTED's exact color.
  EXPIRED: { bg: '#ffedd5', fg: '#c2410c' },
}

const badgeBaseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '9999px',
  padding: '2px 10px',
  fontSize: '0.75rem',
  fontWeight: 600,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
}

export interface TradeStatusBadgeProps {
  status: TradeStatus
  className?: string
  style?: React.CSSProperties
}

export function TradeStatusBadge({ status, className, style }: TradeStatusBadgeProps) {
  const color = TRADE_STATUS_COLOR[status]
  return (
    <span
      className={className}
      style={{ ...badgeBaseStyle, backgroundColor: color.bg, color: color.fg, ...style }}
      data-sails-status={status}
    >
      {TRADE_STATUS_LABEL[status]}
    </span>
  )
}

export interface EscrowStatusBadgeProps {
  status: EscrowStatus
  className?: string
  style?: React.CSSProperties
}

export function EscrowStatusBadge({ status, className, style }: EscrowStatusBadgeProps) {
  const color = ESCROW_STATUS_COLOR[status]
  return (
    <span
      className={className}
      style={{ ...badgeBaseStyle, backgroundColor: color.bg, color: color.fg, ...style }}
      data-sails-status={status}
    >
      {ESCROW_STATUS_LABEL[status]}
    </span>
  )
}
