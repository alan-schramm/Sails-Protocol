import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SailsProvider } from '../src/providers/SailsProvider'
import { useSailsReputation } from '../src/hooks/useSailsReputation'
import type { SailsClient } from '@satsails/p2p-trading-sdk'

function mockClient(): SailsClient {
  return {
    reputation: {
      get: vi.fn().mockResolvedValue({ score: 95, totalTrades: 10 }),
      leaderboard: vi.fn().mockResolvedValue({
        items: [{ id: 'participant-1', displayName: 'Participant One', reputationScore: 95, totalTrades: 10 }],
        total: 1,
        hasMore: false,
        nextOffset: null,
      }),
      rate: vi.fn().mockResolvedValue(undefined),
      vouchFor: vi.fn().mockResolvedValue({ id: 'vouch-1', voucherId: 'participant-1', voucheeId: 'participant-2' }),
    },
  } as unknown as SailsClient
}

function errorClient(): SailsClient {
  return {
    reputation: {
      get: vi.fn().mockRejectedValue(new Error('Get reputation failed')),
      leaderboard: vi.fn().mockRejectedValue(new Error('Leaderboard failed')),
      rate: vi.fn().mockRejectedValue(new Error('Rate failed')),
      vouchFor: vi.fn().mockRejectedValue(new Error('Vouch failed')),
    },
  } as unknown as SailsClient
}

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('useSailsReputation', () => {
  let client: SailsClient
  let queryClient: QueryClient

  beforeEach(() => {
    client = mockClient()
    queryClient = makeQueryClient()
  })

  function renderHookWithProvider(participantId?: string) {
    return renderHook(() => useSailsReputation(participantId ?? 'participant-1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <SailsProvider client={client}>{children}</SailsProvider>
        </QueryClientProvider>
      ),
    })
  }

  it('get query calls client.reputation.get with participantId', async () => {
    const { result } = renderHookWithProvider()

    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true)
    })

    expect(client.reputation.get).toHaveBeenCalledWith('participant-1')
    expect(result.current.query.data).toEqual({ score: 95, totalTrades: 10 })
  })

  it('get query is disabled if participantId is undefined', () => {
    const { result } = renderHook(() => useSailsReputation(undefined), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <SailsProvider client={client}>{children}</SailsProvider>
        </QueryClientProvider>
      ),
    })
    expect(result.current.query.fetchStatus).toBe('idle')
    expect(result.current.query.isPending).toBe(true)
  })

  it('get query surfaces error when transport rejects', async () => {
    client = errorClient()
    const { result } = renderHookWithProvider()

    await waitFor(() => {
      expect(result.current.query.isError).toBe(true)
    })

    expect(result.current.query.error).toBeInstanceOf(Error)
    expect((result.current.query.error as Error).message).toBe('Get reputation failed')
  })

  it('leaderboard query calls client.reputation.leaderboard', async () => {
    const { result } = renderHookWithProvider()

    await waitFor(() => {
      expect(result.current.leaderboard.isSuccess).toBe(true)
    })

    expect(client.reputation.leaderboard).toHaveBeenCalled()
    expect(result.current.leaderboard.data).toEqual({
      items: [{ id: 'participant-1', displayName: 'Participant One', reputationScore: 95, totalTrades: 10 }],
      total: 1,
      hasMore: false,
      nextOffset: null,
    })
  })

  it('rate mutation calls client.reputation.rate and invalidates queries on success', async () => {
    const { result } = renderHookWithProvider()
    const input = { tradeId: 'trade-1', ratedId: 'participant-2', score: 5 as const, comment: 'Great seller' }

    await act(async () => {
      await result.current.rate.mutateAsync(input)
    })

    expect(client.reputation.rate).toHaveBeenCalledWith(input)
  })

  it('rate mutation surfaces error when transport rejects', async () => {
    client = errorClient()
    const { result } = renderHookWithProvider()
    const input = { tradeId: 'trade-1', ratedId: 'participant-2', score: 5 as const, comment: 'Great seller' }

    await act(async () => {
      await expect(result.current.rate.mutateAsync(input)).rejects.toThrow('Rate failed')
    })
  })

  it('vouchFor mutation calls client.reputation.vouchFor and invalidates queries on success', async () => {
    const { result } = renderHookWithProvider()

    await act(async () => {
      await result.current.vouchFor.mutateAsync('participant-2')
    })

    expect(client.reputation.vouchFor).toHaveBeenCalledWith('participant-2')
  })

  it('vouchFor mutation surfaces error when transport rejects', async () => {
    client = errorClient()
    const { result } = renderHookWithProvider()

    await act(async () => {
      await expect(result.current.vouchFor.mutateAsync('participant-2')).rejects.toThrow('Vouch failed')
    })
  })
})
