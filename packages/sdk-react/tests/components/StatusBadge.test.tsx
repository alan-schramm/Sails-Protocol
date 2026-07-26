import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TradeStatusBadge, EscrowStatusBadge } from '../../src/components/trade/StatusBadge'
import type { TradeStatus, EscrowStatus } from '@sails/sdk'

describe('TradeStatusBadge', () => {
  const cases: Array<[TradeStatus, string]> = [
    ['PENDING', 'Pending'],
    ['ACTIVE', 'Active'],
    ['COMPLETED', 'Completed'],
    ['DISPUTED', 'Disputed'],
    ['CANCELLED', 'Cancelled'],
  ]

  it.each(cases)('renders the label for %s', (status, label) => {
    render(<TradeStatusBadge status={status} />)
    const badge = screen.getByText(label)
    expect(badge).toHaveAttribute('data-sails-status', status)
  })

  it('accepts a className and style override', () => {
    render(<TradeStatusBadge status="ACTIVE" className="custom" style={{ fontWeight: 900 }} />)
    const badge = screen.getByText('Active')
    expect(badge).toHaveClass('custom')
    expect(badge).toHaveStyle({ fontWeight: '900' })
  })
})

describe('EscrowStatusBadge', () => {
  const cases: Array<[EscrowStatus, string]> = [
    ['CREATED', 'Created'],
    ['FUNDS_LOCKED', 'Funds locked'],
    ['PAYMENT_PENDING', 'Payment pending'],
    ['COMPLETED', 'Completed'],
    ['DISPUTED', 'Disputed'],
    ['REFUNDED', 'Refunded'],
  ]

  it.each(cases)('renders the label for %s', (status, label) => {
    render(<EscrowStatusBadge status={status} />)
    const badge = screen.getByText(label)
    expect(badge).toHaveAttribute('data-sails-status', status)
  })
})
