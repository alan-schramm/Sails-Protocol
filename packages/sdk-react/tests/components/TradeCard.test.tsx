import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../helpers/render'
import { TradeCard } from '../../src/components/trade/TradeCard'
import { mockTrade } from '../mocks/trade.mock'

describe('TradeCard', () => {
  it('renders default variant with amount, asset, and trade status', () => {
    const trade = mockTrade({ amount: '0.1', asset: 'BTC', status: 'ACTIVE' })
    renderWithProviders(<TradeCard trade={trade} />)

    const card = screen.getByTestId('trade-card')
    expect(card).toHaveAttribute('data-variant', 'default')
    expect(card).toHaveTextContent('0.1 BTC')
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders the compact variant as a single row', () => {
    const trade = mockTrade()
    renderWithProviders(<TradeCard trade={trade} variant="compact" />)
    expect(screen.getByTestId('trade-card')).toHaveAttribute('data-variant', 'compact')
  })

  it('renders trade id/offer id/created date only in the detailed variant', () => {
    const trade = mockTrade({ id: 'trade-abc', offerId: 'offer-xyz' })
    const { rerender } = renderWithProviders(<TradeCard trade={trade} variant="default" />)
    expect(screen.queryByText(/Trade ID/)).not.toBeInTheDocument()

    rerender(<TradeCard trade={trade} variant="detailed" />)
    expect(screen.getByText(/Trade ID: trade-abc/)).toBeInTheDocument()
    expect(screen.getByText(/Offer ID: offer-xyz/)).toBeInTheDocument()
  })

  it('shows the escrow badge only when escrowStatus is passed', () => {
    const trade = mockTrade()
    const { rerender } = renderWithProviders(<TradeCard trade={trade} />)
    expect(screen.queryByText('Funds locked')).not.toBeInTheDocument()

    rerender(<TradeCard trade={trade} escrowStatus="FUNDS_LOCKED" />)
    expect(screen.getByText('Funds locked')).toBeInTheDocument()
  })

  it.each([
    ['buyer-1', "You're buying"],
    ['seller-1', "You're selling"],
    ['someone-else', 'P2P trade'],
  ])('labels the role correctly for viewerParticipantId=%s', (viewerId, expectedLabel) => {
    const trade = mockTrade({ buyerId: 'buyer-1', sellerId: 'seller-1' })
    renderWithProviders(<TradeCard trade={trade} viewerParticipantId={viewerId} />)
    expect(screen.getByText(expectedLabel)).toBeInTheDocument()
  })

  it('renders a neutral role label when no viewer is given', () => {
    renderWithProviders(<TradeCard trade={mockTrade()} />)
    expect(screen.getByText('P2P trade')).toBeInTheDocument()
  })

  it('is not clickable/focusable without onClick', () => {
    renderWithProviders(<TradeCard trade={mockTrade()} />)
    const card = screen.getByTestId('trade-card')
    expect(card).not.toHaveAttribute('role')
    expect(card).not.toHaveAttribute('tabIndex')
  })

  it('calls onClick when clicked, and exposes role=button/tabIndex=0', async () => {
    const onClick = vi.fn()
    renderWithProviders(<TradeCard trade={mockTrade()} onClick={onClick} />)
    const card = screen.getByTestId('trade-card')
    expect(card).toHaveAttribute('role', 'button')
    expect(card).toHaveAttribute('tabIndex', '0')

    await userEvent.click(card)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
