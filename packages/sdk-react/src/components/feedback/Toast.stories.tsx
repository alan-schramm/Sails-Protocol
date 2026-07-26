import type { Meta, StoryObj } from '@storybook/react'
import { within, userEvent, expect, waitFor } from '@storybook/test'
import { Toast, useToast } from './Toast'

const meta: Meta = {
  title: 'Feedback/Toast',
  tags: ['autodocs'],
}
export default meta

export const Info: StoryObj = {
  render: () => <Toast message="Trade updated" variant="info" />,
}

export const Success: StoryObj = {
  render: () => <Toast message="Escrow released successfully" variant="success" />,
}

export const Error: StoryObj = {
  render: () => <Toast message="Failed to lock funds" variant="error" />,
}

export const Dismissible: StoryObj = {
  render: () => <Toast message="Click the X to dismiss" variant="info" onDismiss={() => {}} />,
}

/**
 * Exercises the real ToastProvider/useToast() pair (wired in via the
 * global preview.tsx decorator) rather than the standalone <Toast>
 * presentational component — this is the only story that proves
 * show() actually renders into the viewport.
 */
function TriggerToastDemo() {
  const { show } = useToast()
  return (
    <button onClick={() => show('Trade confirmed', 'success')}>Show toast</button>
  )
}

export const TriggeredViaProvider: StoryObj = {
  render: () => <TriggerToastDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }))
    await waitFor(() => {
      expect(within(document.body).getByText('Trade confirmed')).toBeInTheDocument()
    })
  },
}
