import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, renderHook, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toast, ToastProvider, useToast } from '../../src/components/feedback/Toast'

describe('Toast (presentational)', () => {
  it('renders the message with role=status', () => {
    render(<Toast message="Trade updated" variant="info" />)
    expect(screen.getByRole('status')).toHaveTextContent('Trade updated')
  })

  it('renders a dismiss button only when onDismiss is passed, and calls it on click', async () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<Toast message="hi" variant="success" />)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()

    rerender(<Toast message="hi" variant="success" onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('useToast() / ToastProvider', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('throws when called outside a ToastProvider', () => {
    expect(() => renderHook(() => useToast())).toThrow(/must be called within a <ToastProvider>/)
  })

  it('show() renders a toast into the viewport, and it auto-dismisses after 4s', async () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    })

    act(() => {
      result.current.show('Escrow released', 'success')
    })
    expect(screen.getByText('Escrow released')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    await waitFor(() => expect(screen.queryByText('Escrow released')).not.toBeInTheDocument())
  })

  it('dismiss() removes a toast immediately, via the rendered Dismiss button', async () => {
    vi.useRealTimers()
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    })

    act(() => {
      result.current.show('Will be dismissed')
    })
    expect(screen.getByText('Will be dismissed')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Will be dismissed')).not.toBeInTheDocument()
  })
})
