import type { ReputationScore } from '@sails/sdk'

export interface ReputationBadgeProps {
  score: ReputationScore
  className?: string
  style?: React.CSSProperties
}

/**
 * Built directly from @sails/sdk's real ReputationScore shape
 * (id/publicKey/displayName/reputationScore/totalTrades/disputeCount —
 * confirmed against types.ts before writing this; that type does NOT
 * currently include tradeScore/volumeScore/settlementScore/disputeRate
 * fields SDK_GUIDE.md's fuller interface describes, so this component
 * only renders what's actually there. disputeRate is computed here
 * (disputeCount / totalTrades), the same simple math
 * reputation.service.ts's own getScore() does server-side — not
 * invented, just not re-derived from a field this SDK type doesn't
 * expose).
 */
export function ReputationBadge({ score, className, style }: ReputationBadgeProps) {
  const disputeRate = score.totalTrades > 0 ? score.disputeCount / score.totalTrades : 0

  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit', ...style }}
      data-testid="reputation-badge"
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '32px',
          height: '32px',
          borderRadius: '9999px',
          backgroundColor: '#fff7ed',
          color: '#c2410c',
          fontWeight: 700,
          fontSize: '0.875rem',
          padding: '0 8px',
        }}
        aria-label={`Reputation score: ${score.reputationScore}`}
      >
        {score.reputationScore}
      </span>
      <span style={{ fontSize: '0.8125rem', color: '#57534e' }}>
        {score.displayName ?? score.publicKey.slice(0, 10)} · {score.totalTrades} trade{score.totalTrades === 1 ? '' : 's'}
        {score.totalTrades > 0 && ` · ${(disputeRate * 100).toFixed(0)}% disputed`}
      </span>
    </div>
  )
}
