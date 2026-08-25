import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReputationBadge } from '../../src/components/identity/ReputationBadge'
import { mockReputationScore } from '../mocks/trade.mock'

describe('ReputationBadge', () => {
  it('renders the score, display name, trade count, and dispute rate', () => {
    render(<ReputationBadge score={mockReputationScore({ total: 42, totalTrades: 18, disputeRate: 1 / 18 })} displayName="alice.sats" />)

    expect(screen.getByLabelText('Reputation score: 42')).toHaveTextContent('42')
    expect(screen.getByText(/alice\.sats/)).toBeInTheDocument()
    expect(screen.getByText(/18 trades/)).toBeInTheDocument()
    expect(screen.getByText(/6% disputed/)).toBeInTheDocument()
  })

  it('falls back to a publicKey prefix when displayName is missing', () => {
    render(<ReputationBadge score={mockReputationScore()} publicKey="ed25519-0123456789abcdef" />)
    expect(screen.getByText(/ed25519-01/)).toBeInTheDocument()
  })

  it('falls back to the participantId prefix when neither displayName nor publicKey is given — no identity fields ride along on ReputationScore itself', () => {
    render(<ReputationBadge score={mockReputationScore({ participantId: 'participant-abcdef123456' })} />)
    expect(screen.getByText(/participant-a/)).toBeInTheDocument()
  })

  it('uses singular "trade" for exactly one trade', () => {
    render(<ReputationBadge score={mockReputationScore({ totalTrades: 1, disputeRate: 0 })} />)
    expect(screen.getByText(/1 trade(?!s)/)).toBeInTheDocument()
  })

  it('omits the dispute-rate segment when totalTrades is 0', () => {
    render(<ReputationBadge score={mockReputationScore({ totalTrades: 0, disputeRate: 0 })} />)
    expect(screen.queryByText(/disputed/)).not.toBeInTheDocument()
  })
})
