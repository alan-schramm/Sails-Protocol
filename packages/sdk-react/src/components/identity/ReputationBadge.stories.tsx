import type { Meta, StoryObj } from '@storybook/react'
import { ReputationBadge } from './ReputationBadge'
import { mockReputationScore } from '../../../tests/mocks/trade.mock'

const meta: Meta<typeof ReputationBadge> = {
  title: 'Identity/ReputationBadge',
  component: ReputationBadge,
  tags: ['autodocs'],
  args: {
    score: mockReputationScore(),
    displayName: 'alice.sats',
  },
}
export default meta

type Story = StoryObj<typeof ReputationBadge>

export const Default: Story = {}

export const NoDisputes: Story = {
  args: { score: mockReputationScore({ disputeRate: 0 }) },
}

export const HighDisputeRate: Story = {
  args: { score: mockReputationScore({ totalTrades: 10, disputeRate: 0.4 }) },
}

export const NewTrader: Story = {
  args: { score: mockReputationScore({ total: 0, totalTrades: 0, disputeRate: 0 }) },
}

export const NoDisplayName: Story = {
  args: { displayName: undefined, publicKey: 'ed25519-0123456789abcdef' },
}
