import type { Meta, StoryObj } from '@storybook/react'
import { Skeleton } from './Skeleton'

const meta: Meta<typeof Skeleton> = {
  title: 'Feedback/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
}
export default meta

type Story = StoryObj<typeof Skeleton>

export const TextLine: Story = {
  args: { width: '240px', height: '1rem' },
}

export const Avatar: Story = {
  args: { width: '48px', height: '48px', circle: true },
}

export const Block: Story = {
  args: { width: '100%', height: '120px' },
}

export const CardSkeletonComposition: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '260px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Skeleton width="32px" height="32px" circle />
        <Skeleton width="120px" height="0.875rem" />
      </div>
      <Skeleton width="100%" height="1rem" />
      <Skeleton width="60%" height="1rem" />
    </div>
  ),
}
