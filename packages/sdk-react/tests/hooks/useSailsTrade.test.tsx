import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SailsProvider } from '../../src/providers/SailsProvider'
import { useSailsTrade } from '../../src/hooks/useSailsTrade'
import { createMockSailsClient } from '../mocks/sails-client.mock'
import { mockTrade } from '../mocks/trade.mock'

function makeWrapper(client: ReturnType<typeof createMockSailsClient>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SailsProvider client={client}>{children}</SailsProvider>
      </QueryClientProvider>
    )
  }
}

describe('useSailsTrade', () => {
  it('fetches and returns the trade by id', async () => {
    const trade = mockTrade({ id: 'trade-42' })
    const client = createMockSailsClient({ handleRequest: () => trade })

    const { result } = renderHook(() => useSailsTrade('trade-42'), { wrapper: makeWrapper(client) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(trade)
  })

  it('stays disabled and never fetches when tradeId is undefined', async () => {
    const client = createMockSailsClient()
    const { result } = renderHook(() => useSailsTrade(undefined), { wrapper: makeWrapper(client) })

    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.isPending).toBe(true)
  })

  it('surfaces a query error when the transport rejects', async () => {
    const failing = createMockSailsClient({
      handleRequest: () => {
        throw new Error('boom')
      },
    })

    const { result } = renderHook(() => useSailsTrade('trade-1'), { wrapper: makeWrapper(failing) })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
