import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SailsProvider } from '../../src/providers/SailsProvider'
import { useSailsTrades } from '../../src/hooks/useSailsTrades'
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

describe('useSailsTrades', () => {
  it('fetches the first page with the default limit (10) at offset 0', async () => {
    const seen: Array<{ limit?: number; offset?: number }> = []
    const client = createMockSailsClient({
      handleRequest: (url) => {
        const params = new URL(url).searchParams
        seen.push({
          limit: params.get('limit') ? Number(params.get('limit')) : undefined,
          offset: params.get('offset') ? Number(params.get('offset')) : undefined,
        })
        return { trades: [mockTrade()], total: 25, hasMore: true }
      },
    })

    const { result } = renderHook(() => useSailsTrades(), { wrapper: makeWrapper(client) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(seen[0]).toEqual({ limit: 10, offset: 0 })
    expect(result.current.data?.pages).toHaveLength(1)
  })

  it('computes the next page offset from cumulative loaded trades and stops when hasMore is false', async () => {
    let call = 0
    const client = createMockSailsClient({
      handleRequest: () => {
        call += 1
        if (call === 1) return { trades: [mockTrade(), mockTrade()], total: 3, hasMore: true }
        return { trades: [mockTrade()], total: 3, hasMore: false }
      },
    })

    const { result } = renderHook(() => useSailsTrades({ limit: 2 }), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(true)

    await result.current.fetchNextPage()
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(result.current.hasNextPage).toBe(false)
  })
})
