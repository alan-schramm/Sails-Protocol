import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Trade } from '@sails/sdk'
import { useSailsClient } from './useSailsClient'

/**
 * Wraps the real `openp2p.getTrade(tradeId)` (GET /v1/openp2p/trades/:id,
 * no auth required — src/modules/open-p2p/trade.routes.ts). `tradeId`
 * may be undefined (e.g. before a route param resolves) — the query
 * simply stays disabled rather than the caller needing their own guard.
 */
export function useSailsTrade(tradeId: string | undefined): UseQueryResult<Trade> {
  const client = useSailsClient()

  return useQuery({
    queryKey: ['sails', 'trade', tradeId],
    queryFn: () => client.trades.getTrade(tradeId as string),
    enabled: Boolean(tradeId),
  })
}
