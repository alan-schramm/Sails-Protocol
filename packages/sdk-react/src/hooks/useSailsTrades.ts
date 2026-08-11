import { useInfiniteQuery, type UseInfiniteQueryResult, type InfiniteData } from '@tanstack/react-query'
import type { PaginatedTrades } from '@satsails/p2p-trading-sdk'
import { useSailsClient } from './useSailsClient'

export interface UseSailsTradesOptions {
  /** Page size — clamped server-side to 1-50, default 10 (trade.service.ts's getTrades()). */
  limit?: number
}

/**
 * Wraps `openp2p.getTrades()` (GET /v1/openp2p/trades, requires auth —
 * the caller's own trade history as buyer or seller). This is the
 * hook that didn't have a real endpoint to call until Fase 2's backend
 * addition (trade.routes.ts/trade.service.ts's own comments have the
 * full story) — `hasMore`/offset pagination here mirrors exactly what
 * that endpoint returns, not an invented cursor scheme.
 */
export function useSailsTrades(
  options: UseSailsTradesOptions = {}
): UseInfiniteQueryResult<InfiniteData<PaginatedTrades>> {
  const client = useSailsClient()
  const limit = options.limit ?? 10

  return useInfiniteQuery({
    queryKey: ['sails', 'trades', limit],
    queryFn: ({ pageParam }) => client.trades.getTrades({ limit, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined
      return allPages.reduce((loaded, page) => loaded + page.trades.length, 0)
    },
  })
}
