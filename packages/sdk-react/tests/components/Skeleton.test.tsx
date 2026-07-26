import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton } from '../../src/components/feedback/Skeleton'

describe('Skeleton', () => {
  it('renders with role=status and default width/height', () => {
    render(<Skeleton />)
    const el = screen.getByRole('status', { name: 'Loading' })
    expect(el).toHaveStyle({ width: '100%', height: '1rem', borderRadius: '6px' })
  })

  it('applies custom width/height', () => {
    render(<Skeleton width="120px" height="48px" />)
    expect(screen.getByRole('status')).toHaveStyle({ width: '120px', height: '48px' })
  })

  it('renders a pill radius when circle is set', () => {
    render(<Skeleton circle />)
    expect(screen.getByRole('status')).toHaveStyle({ borderRadius: '9999px' })
  })

  it('injects the keyframes stylesheet exactly once, even across multiple instances', () => {
    render(
      <>
        <Skeleton />
        <Skeleton />
      </>
    )
    const styleTags = Array.from(document.head.querySelectorAll('style')).filter((s) =>
      s.textContent?.includes('sails-skeleton-pulse')
    )
    expect(styleTags).toHaveLength(1)
  })
})
