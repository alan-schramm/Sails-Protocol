export interface SkeletonProps {
  /** CSS width, e.g. '100%', '120px'. Default '100%'. */
  width?: string | number
  /** CSS height, e.g. '1rem', '48px'. Default '1rem'. */
  height?: string | number
  /** Set for a circular skeleton (avatar placeholders). Default false. */
  circle?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * A plain CSS-animated shimmer — no dependency on a keyframes stylesheet
 * being loaded by the consumer, since this package ships no global CSS
 * (every other component here uses inline styles for the same reason,
 * see StatusBadge.tsx's header comment). The `@keyframes` rule is
 * injected once via a single <style> tag the first time any Skeleton
 * mounts, not duplicated per instance.
 */
let keyframesInjected = false
function ensureKeyframes() {
  if (keyframesInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = `@keyframes sails-skeleton-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`
  document.head.appendChild(style)
  keyframesInjected = true
}

export function Skeleton({ width = '100%', height = '1rem', circle = false, className, style }: SkeletonProps) {
  ensureKeyframes()

  return (
    <span
      className={className}
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: circle ? '9999px' : '6px',
        backgroundColor: '#e7e5e4',
        animation: 'sails-skeleton-pulse 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  )
}
