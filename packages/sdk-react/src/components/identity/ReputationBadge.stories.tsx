import type { Meta, StoryObj } from '@storybook/react'
import { ReputationBadge } from './ReputationBadge'
import { mockReputationScore } from '../../../tests/mocks/trade.mock'

const meta: Meta<typeof ReputationBadge> = {
  title: 'Identity/ReputationBadge',
  component: ReputationBadge,
  tags: ['autodocs'],
  args: {
    score: mockReputationScore(),
  },
}
export default meta

type Story = StoryObj<typeof ReputationBadge>

export const Default: Story = {}

export const NoDisputes: Story = {
  args: { score: mockReputationScore({ disputeCount: 0 }) },
}

export const HighDisputeRate: Story = {
  args: { score: mockReputationScore({ totalTrades: 10, disputeCount: 4 }) },
}

export const NewTrader: Story = {
  args: { score: mockReputationScore({ reputationScore: 0, totalTrades: 0, disputeCount: 0 }) },
}

export const NoDisplayName: Story = {
  args: { score: mockReputationScore({ displayName: null as unknown as string }) },
}
