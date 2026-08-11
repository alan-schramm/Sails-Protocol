import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import type { AssetType, Offer, PublishOfferInput, MatchInput, OrderBook, LiquidityOfferSummary } from '@satsails/p2p-trading-sdk'
import { useSailsClient } from './useSailsClient'

export interface UseSailsLiquidityOptions {
  bookAsset?: AssetType
  matchInput?: MatchInput
}

export interface UseSailsLiquidityResult {
  query: UseQueryResult<Offer>
  book: UseQueryResult<OrderBook>
  match: UseQueryResult<LiquidityOfferSummary | null>
  publish: UseMutationResult<Offer, Error, PublishOfferInput>
  updateStatus: UseMutationResult<Offer, Error, { offerId: string; status: Offer['status'] }>
}

/**
 * Wraps `liquidity.get/book/match/publish/updateStatus`
 * (all real — packages/sails-sdk/src/modules/liquidity.ts, verified
 * against src/modules/open-liquidity/liquidity.routes.ts directly).
 * `offerId` may be undefined (getOffer query stays disabled,
 * mutations simply aren't called yet) the same way useSailsTrade()
 * handles an unresolved id.
 */
export function useSailsLiquidity(
  offerId: string | undefined,
  options: UseSailsLiquidityOptions = {}
): UseSailsLiquidityResult {
  const client = useSailsClient()
  const queryClient = useQueryClient()
  const queryKey = ['sails', 'liquidity', offerId] as const

  const query = useQuery({
    queryKey,
    queryFn: () => client.liquidity.getOffer(offerId as string),
    enabled: Boolean(offerId),
  })

  const bookAsset = options.bookAsset ?? 'BTC'
  const book = useQuery({
    queryKey: ['sails', 'liquidity', 'book', bookAsset],
    queryFn: () => client.liquidity.book(bookAsset),
  })

  const matchInput = options.matchInput ?? { asset: 'BTC', side: 'BUY', amount: '0.001' }
  const match = useQuery({
    queryKey: ['sails', 'liquidity', 'match', matchInput.asset, matchInput.side, matchInput.amount],
    queryFn: () => client.liquidity.match(matchInput),
  })

  function invalidate(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey })
  }

  const publish = useMutation({
    mutationFn: (input: PublishOfferInput) => client.liquidity.publish(input),
    onSuccess: invalidate,
  })

  const updateStatus = useMutation({
    mutationFn: ({ offerId, status }: { offerId: string; status: Offer['status'] }) =>
      client.liquidity.updateStatus(offerId, status),
    onSuccess: invalidate,
  })

  return { query, book, match, publish, updateStatus }
}