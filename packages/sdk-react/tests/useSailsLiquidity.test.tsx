import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SailsProvider } from '../src/providers/SailsProvider'
import { useSailsLiquidity } from '../src/hooks/useSailsLiquidity'
import type { SailsClient } from '@satsails/p2p-trading-sdk'

function mockClient(): SailsClient {
  return {
    liquidity: {
      getOffer: vi.fn().mockResolvedValue({ id: 'offer-1', userId: 'user-1', asset: 'BTC', side: 'SELL', priceUsd: '60000', minAmount: '0.001', maxAmount: '1.0', paymentMethod: 'PIX', status: 'ACTIVE' }),
      book: vi.fn().mockResolvedValue({ bids: [], asks: [] }),
      match: vi.fn().mockResolvedValue({ matches: [], totalAmount: '0.0' }),
      publish: vi.fn().mockResolvedValue({ id: 'offer-2', userId: 'user-1', asset: 'USDT_ERC20', side: 'BUY', priceUsd: '1.00', minAmount: '10', maxAmount: '100', paymentMethod: 'PIX', status: 'ACTIVE' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 'offer-1', status: 'CANCELLED' }),
    },
  } as unknown as SailsClient
}

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('useSailsLiquidity', () => {
  let client: SailsClient
  let queryClient: QueryClient

  beforeEach(() => {
    client = mockClient()
    queryClient = makeQueryClient()
  })

  function renderHookWithProvider(offerId?: string, options?: any) {
    return renderHook(() => useSailsLiquidity(offerId ?? 'offer-1', options), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <SailsProvider client={client}>{children}</SailsProvider>
        </QueryClientProvider>
      ),
    })
  }

  it('getOffer query calls client.liquidity.getOffer with offerId', async () => {
    const { result } = renderHookWithProvider()

    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true)
    })

    expect(client.liquidity.getOffer).toHaveBeenCalledWith('offer-1')
    expect(result.current.query.data).toEqual({ id: 'offer-1', userId: 'user-1', asset: 'BTC', side: 'SELL', priceUsd: '60000', minAmount: '0.001', maxAmount: '1.0', paymentMethod: 'PIX', status: 'ACTIVE' })
  })

  it('getOffer query is disabled if offerId is undefined', () => {
    const { result } = renderHook(() => useSailsLiquidity(undefined), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <SailsProvider client={client}>{children}</SailsProvider>
        </QueryClientProvider>
      ),
    })
    expect(result.current.query.fetchStatus).toBe('idle')
    expect(result.current.query.isPending).toBe(true)
  })

  it('book query calls client.liquidity.book with default asset', async () => {
    const { result } = renderHookWithProvider()

    await waitFor(() => {
      expect(result.current.book.isSuccess).toBe(true)
    })

    expect(client.liquidity.book).toHaveBeenCalledWith('BTC')
  })

  it('book query calls client.liquidity.book with custom asset', async () => {
    const { result } = renderHookWithProvider('offer-1', { bookAsset: 'USDT' })

    await waitFor(() => {
      expect(result.current.book.isSuccess).toBe(true)
    })

    expect(client.liquidity.book).toHaveBeenCalledWith('USDT')
  })

  it('match query calls client.liquidity.match with default input', async () => {
    const { result } = renderHookWithProvider()

    await waitFor(() => {
      expect(result.current.match.isSuccess).toBe(true)
    })

    expect(client.liquidity.match).toHaveBeenCalledWith({ asset: 'BTC', side: 'BUY', amount: '0.001' })
  })

  it('match query calls client.liquidity.match with custom input', async () => {
    const matchInput = { asset: 'ETH', side: 'SELL', amount: '0.5' }
    const { result } = renderHookWithProvider('offer-1', { matchInput })

    await waitFor(() => {
      expect(result.current.match.isSuccess).toBe(true)
    })

    expect(client.liquidity.match).toHaveBeenCalledWith(matchInput)
  })

  it('publish mutation calls client.liquidity.publish and invalidates queries on success', async () => {
    const { result } = renderHookWithProvider()
    const input = { asset: 'USDT_ERC20' as const, side: 'BUY' as const, priceUsd: '1.00', minAmount: '10', maxAmount: '100', paymentMethod: 'PIX' as const }

    await act(async () => {
      await result.current.publish.mutateAsync(input)
    })

    expect(client.liquidity.publish).toHaveBeenCalledWith(input)
  })

  it('updateStatus mutation calls client.liquidity.updateStatus', async () => {
    const { result } = renderHookWithProvider()

    await act(async () => {
      await result.current.updateStatus.mutateAsync({ offerId: 'offer-1', status: 'CANCELLED' })
    })

    expect(client.liquidity.updateStatus).toHaveBeenCalledWith('offer-1', 'CANCELLED')
  })
})
