import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AssetType, TradeSide, DiscoverResult } from '@sails/sdk'
import { useSailsClient } from './useSailsClient'

export interface UseSailsLiquidityDiscoverOptions {
  asset: AssetType
  side: TradeSide
  limit?: number
  offset?: number
}

/**
 * Wraps `liquidity.discover()` — the real GET /v1/liquidity/offers route
 * (packages/sails-sdk/src/modules/liquidity.ts, verified against
 * src/modules/open-liquidity/liquidity.routes.ts directly).
 * Accepts the same filter shape the backend expects so the SDK type
 * and the server contract stay in sync.
 */
export function useSailsLiquidityDiscover(
  filter: UseSailsLiquidityDiscoverOptions
): UseQueryResult<DiscoverResult> {
  const client = useSailsClient()

  return useQuery({
    queryKey: ['sails', 'liquidity', 'discover', filter.asset, filter.side, filter.limit, filter.offset] as const,
    queryFn: () =>
      client.liquidity.discover({
        asset: filter.asset,
        side: filter.side,
        limit: filter.limit,
        offset: filter.offset,
      }),
  })
}