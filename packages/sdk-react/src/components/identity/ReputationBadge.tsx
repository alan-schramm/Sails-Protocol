import type { ReputationScore } from '@satsails/p2p-trading-sdk'

export interface ReputationBadgeProps {
  score: ReputationScore
  // Missão 11 Fase 9.3.6 — CONTRACT INTEGRITY FIX. `ReputationScore`
  // never actually carried identity fields at the wire level (see that
  // type's own updated header comment in packages/sails-sdk/src/types.ts)
  // — this component previously read `score.displayName`/`score.publicKey`
  // directly, both of which were always `undefined` against a real
  // server response (only ever true against the SDK's own wrong-shape
  // mock), so `score.publicKey.slice(0, 10)` would have thrown the
  // first time this rendered outside a test/story. A reputation lookup
  // and an identity lookup are two different, separately-scoped public
  // surfaces (`reputation.get()` vs `identity.get()`, INV-OP-10) — the
  // caller composes them, same pattern `sails-ui`'s Trade.tsx already
  // uses. Both optional: a caller with no identity data yet still gets
  // a real, honest badge (falls back to participantId).
  displayName?: string | null
  publicKey?: string
  className?: string
  style?: React.CSSProperties
}

/**
 * Built against @satsails/p2p-trading-sdk's real, server-verified
 * ReputationScore shape (participantId/total/tradeScore/volumeScore/
 * settlementScore/disputeRate/totalTrades/cumulativeFeesObserved —
 * reputation.service.ts's getScore(), traced directly, Missão 11 Fase
 * 9.3.6). `total` is the aggregate score; `disputeRate` is already
 * computed server-side, not re-derived here.
 */
export function ReputationBadge({ score, displayName, publicKey, className, style }: ReputationBadgeProps) {
  const label = displayName ?? (publicKey ? publicKey.slice(0, 10) : score.participantId.slice(0, 10))

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
        aria-label={`Reputation score: ${score.total}`}
      >
        {score.total}
      </span>
      <span style={{ fontSize: '0.8125rem', color: '#57534e' }}>
        {label} · {score.totalTrades} trade{score.totalTrades === 1 ? '' : 's'}
        {score.totalTrades > 0 && ` · ${(score.disputeRate * 100).toFixed(0)}% disputed`}
      </span>
    </div>
  )
}
