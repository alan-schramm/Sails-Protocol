import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SailsProvider } from '../src/providers/SailsProvider'
import { useSailsTrades } from '../src/hooks/useSailsTrades'
import type { SailsClient } from '@sails/sdk'

function mockClient(): SailsClient {
  return {
    trades: {
      getTrades: vi.fn().mockResolvedValue({
        trades: [
          { id: 'trade-1', asset: 'BTC', amount: '0.1', status: 'ACTIVE' },
          { id: 'trade-2', asset: 'USDT', amount: '100', status: 'COMPLETED' },
        ],
        total: 2,
        hasMore: false,
        nextOffset: null,
      }),
    },
  } as unknown as SailsClient
}

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('useSailsTrades', () => {
  let client: SailsClient
  let queryClient: QueryClient

  beforeEach(() => {
    client = mockClient()
    queryClient = makeQueryClient()
  })

  function renderHookWithProvider(options?: { limit?: number }) {
    return renderHook(() => useSailsTrades(options), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <SailsProvider client={client}>{children}</SailsProvider>
        </QueryClientProvider>
      ),
    })
  }

  it('fetches trades with default limit', async () => {
    const { result } = renderHookWithProvider()

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(client.trades.getTrades).toHaveBeenCalledWith({ limit: 10, offset: 0 })
    expect(result.current.data?.pages[0].trades).toHaveLength(2)
  })

  it('fetches trades with custom limit', async () => {
    const { result } = renderHookWithProvider({ limit: 20 })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(client.trades.getTrades).toHaveBeenCalledWith({ limit: 20, offset: 0 })
  })

  it('hasMore is false when no more pages', async () => {
    const { result } = renderHookWithProvider()

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.pages[0].hasMore).toBe(false)
    expect(result.current.hasNextPage).toBe(false)
  })

  it('can fetch next page when hasMore is true', async () => {
    const mockGetTrades = vi.fn()
      .mockResolvedValueOnce({
        trades: [{ id: 'trade-1', asset: 'BTC', amount: '0.1', status: 'ACTIVE' }],
        total: 5,
        hasMore: true,
        nextOffset: 1,
      })
      .mockResolvedValueOnce({
        trades: [{ id: 'trade-2', asset: 'USDT', amount: '100', status: 'COMPLETED' }],
        total: 5,
        hasMore: false,
        nextOffset: null,
      })

    client = {
      trades: { getTrades: mockGetTrades },
    } as unknown as SailsClient

    const { result } = renderHook(() => useSailsTrades(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <SailsProvider client={client}>{children}</SailsProvider>
        </QueryClientProvider>
      ),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => {
      expect(result.current.data?.pages).toHaveLength(2)
    })

    expect(mockGetTrades).toHaveBeenCalledTimes(2)
  })
})
