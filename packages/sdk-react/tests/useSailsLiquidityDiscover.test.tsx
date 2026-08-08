import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SailsProvider } from '../src/providers/SailsProvider'
import { useSailsLiquidityDiscover } from '../src/hooks/useSailsLiquidityDiscover'
import type { SailsClient } from '@sails/sdk'

function mockClient(): SailsClient {
  return {
    liquidity: {
      discover: vi.fn().mockResolvedValue({ offers: [{ id: 'offer-1', assetSell: 'BTC', assetBuy: 'USDT' }], total: 1 }),
    },
  } as unknown as SailsClient
}

function errorClient(): SailsClient {
  return {
    liquidity: {
      discover: vi.fn().mockRejectedValue(new Error('Discover failed')),
    },
  } as unknown as SailsClient
}

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('useSailsLiquidityDiscover', () => {
  let client: SailsClient
  let queryClient: QueryClient

  beforeEach(() => {
    client = mockClient()
    queryClient = makeQueryClient()
  })

  function renderHookWithProvider(filter: any) {
    return renderHook(() => useSailsLiquidityDiscover(filter), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <SailsProvider client={client}>{children}</SailsProvider>
        </QueryClientProvider>
      ),
    })
  }

  it('discover query calls client.liquidity.discover with filters', async () => {
    const filter = { asset: 'BTC' as const, side: 'SELL' as const, limit: 10, offset: 0 }
    const { result } = renderHookWithProvider(filter)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(client.liquidity.discover).toHaveBeenCalledWith(filter)
    expect(result.current.data).toEqual({ offers: [{ id: 'offer-1', assetSell: 'BTC', assetBuy: 'USDT' }], total: 1 })
  })

  it('discover query surfaces an error when the transport rejects', async () => {
    client = errorClient()
    const filter = { asset: 'BTC' as const, side: 'SELL' as const }
    const { result } = renderHookWithProvider(filter)

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect((result.current.error as Error).message).toBe('Discover failed')
  })
})
