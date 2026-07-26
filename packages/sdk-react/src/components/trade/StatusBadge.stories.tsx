import type { Meta, StoryObj } from '@storybook/react'
import { TradeStatusBadge, EscrowStatusBadge } from './StatusBadge'

const meta: Meta = {
  title: 'Trade/StatusBadge',
  tags: ['autodocs'],
}
export default meta

type TradeStory = StoryObj<typeof TradeStatusBadge>
type EscrowStory = StoryObj<typeof EscrowStatusBadge>

export const TradePending: TradeStory = {
  render: () => <TradeStatusBadge status="PENDING" />,
}

export const TradeActive: TradeStory = {
  render: () => <TradeStatusBadge status="ACTIVE" />,
}

export const TradeCompleted: TradeStory = {
  render: () => <TradeStatusBadge status="COMPLETED" />,
}

export const TradeDisputed: TradeStory = {
  render: () => <TradeStatusBadge status="DISPUTED" />,
}

export const TradeCancelled: TradeStory = {
  render: () => <TradeStatusBadge status="CANCELLED" />,
}

export const AllTradeStatuses: TradeStory = {
  render: () => (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <TradeStatusBadge status="PENDING" />
      <TradeStatusBadge status="ACTIVE" />
      <TradeStatusBadge status="COMPLETED" />
      <TradeStatusBadge status="DISPUTED" />
      <TradeStatusBadge status="CANCELLED" />
    </div>
  ),
}

export const EscrowCreated: EscrowStory = {
  render: () => <EscrowStatusBadge status="CREATED" />,
}

export const EscrowFundsLocked: EscrowStory = {
  render: () => <EscrowStatusBadge status="FUNDS_LOCKED" />,
}

export const EscrowPaymentPending: EscrowStory = {
  render: () => <EscrowStatusBadge status="PAYMENT_PENDING" />,
}

export const EscrowCompleted: EscrowStory = {
  render: () => <EscrowStatusBadge status="COMPLETED" />,
}

export const EscrowDisputed: EscrowStory = {
  render: () => <EscrowStatusBadge status="DISPUTED" />,
}

export const EscrowRefunded: EscrowStory = {
  render: () => <EscrowStatusBadge status="REFUNDED" />,
}

export const AllEscrowStatuses: EscrowStory = {
  render: () => (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <EscrowStatusBadge status="CREATED" />
      <EscrowStatusBadge status="FUNDS_LOCKED" />
      <EscrowStatusBadge status="PAYMENT_PENDING" />
      <EscrowStatusBadge status="COMPLETED" />
      <EscrowStatusBadge status="DISPUTED" />
      <EscrowStatusBadge status="REFUNDED" />
    </div>
  ),
}
