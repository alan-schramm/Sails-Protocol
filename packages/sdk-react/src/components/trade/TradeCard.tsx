import type { Trade, EscrowStatus } from '@sails/sdk'
import { TradeStatusBadge, EscrowStatusBadge } from './StatusBadge'

export type TradeCardVariant = 'default' | 'compact' | 'detailed'

export interface TradeCardProps {
  trade: Trade
  /**
   * Escrow.status doesn't live on Trade itself in the SDK's real type
   * (Trade.escrowId is just the id) — a caller who already has the
   * Escrow (e.g. via useSailsEscrow) passes its status in explicitly
   * rather than this component fabricating a fetch of its own. A
   * PENDING trade genuinely has no escrow yet — omit this prop rather
   * than invent a placeholder state for it.
   */
  escrowStatus?: EscrowStatus
  /** Whoever is viewing this card — used only to label the trade "You're buying"/"You're selling", nothing else. Omit for a neutral, role-agnostic label. */
  viewerParticipantId?: string
  variant?: TradeCardVariant
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
}

function roleLabel(trade: Trade, viewerParticipantId?: string): string {
  if (!viewerParticipantId) return trade.buyerId === trade.sellerId ? 'Trade' : 'P2P trade'
  if (viewerParticipantId === trade.buyerId) return "You're buying"
  if (viewerParticipantId === trade.sellerId) return "You're selling"
  return 'P2P trade'
}

const cardBaseStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  border: '1px solid #e7e5e4',
  borderRadius: '12px',
  padding: '12px 16px',
  fontFamily: 'inherit',
}

/**
 * Three variants, not eight fabricated states (Fase 2's original brief
 * asked for an "AllStates" story covering 8 — TradeStatus is 5 real
 * values, EscrowStatus is 6; see .storybook stories for the real 11
 * combined states this card can actually render, confirmed against
 * @sails/sdk's real exported types before writing this).
 */
export function TradeCard({ trade, escrowStatus, viewerParticipantId, variant = 'default', onClick, className, style }: TradeCardProps) {
  const isInteractive = Boolean(onClick)

  if (variant === 'compact') {
    return (
      <div
        className={className}
        style={{ ...cardBaseStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', cursor: isInteractive ? 'pointer' : undefined, ...style }}
        onClick={onClick}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        data-testid="trade-card"
        data-variant="compact"
      >
        <span style={{ fontWeight: 600 }}>{trade.asset}</span>
        <span>{trade.amount}</span>
        <TradeStatusBadge status={trade.status} />
      </div>
    )
  }

  return (
    <div
      className={className}
      style={{ ...cardBaseStyle, cursor: isInteractive ? 'pointer' : undefined, ...style }}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      data-testid="trade-card"
      data-variant={variant}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#78716c' }}>{roleLabel(trade, viewerParticipantId)}</div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
            {trade.amount} {trade.asset}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <TradeStatusBadge status={trade.status} />
          {escrowStatus && <EscrowStatusBadge status={escrowStatus} />}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#57534e' }}>
        <span>${trade.priceUsd} / {trade.asset}</span>
        <span>Total: ${trade.totalUsd}</span>
      </div>

      {variant === 'detailed' && (
        <div style={{ fontSize: '0.75rem', color: '#78716c', display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px solid #e7e5e4', paddingTop: '8px', marginTop: '4px' }}>
          <span>Trade ID: {trade.id}</span>
          <span>Offer ID: {trade.offerId}</span>
          {trade.network && <span>Network: {trade.network}</span>}
          <span>Created: {new Date(trade.createdAt).toLocaleString()}</span>
        </div>
      )}
    </div>
  )
}
