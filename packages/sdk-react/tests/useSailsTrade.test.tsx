import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SailsProvider } from '../src/providers/SailsProvider'
import { useSailsTrade } from '../src/hooks/useSailsTrade'
import type { SailsClient } from '@sails/sdk'

function mockClient(): SailsClient {
  return {
    trades: {
      getTrade: vi.fn().mockResolvedValue({
        id: 'trade-1',
        asset: 'BTC',
        amount: '0.1',
        status: 'ACTIVE',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      }),
    },
  } as unknown as SailsClient
}

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('useSailsTrade', () => {
  let client: SailsClient
  let queryClient: QueryClient

  beforeEach(() => {
    client = mockClient()
    queryClient = makeQueryClient()
  })

  function renderHookWithProvider(tradeId?: string) {
    return renderHook(() => useSailsTrade(tradeId), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <SailsProvider client={client}>{children}</SailsProvider>
        </QueryClientProvider>
      ),
    })
  }

  it('fetches trade data when tradeId is provided', async () => {
    const { result } = renderHookWithProvider('trade-1')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(client.trades.getTrade).toHaveBeenCalledWith('trade-1')
    expect(result.current.data).toEqual({
      id: 'trade-1',
      asset: 'BTC',
      amount: '0.1',
      status: 'ACTIVE',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
    })
  })

  it('query is disabled when tradeId is undefined', () => {
    const { result } = renderHookWithProvider(undefined)

    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.isPending).toBe(true)
  })

  it('query is disabled when tradeId is empty string', () => {
    const { result } = renderHookWithProvider('')

    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.isPending).toBe(true)
  })
})
