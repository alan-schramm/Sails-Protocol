import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import type { ReputationScore, RateInput, Vouch, LeaderboardResult } from '@satsails/p2p-trading-sdk'
import { useSailsClient } from './useSailsClient'

export interface UseSailsReputationResult {
  query: UseQueryResult<ReputationScore>
  rate: UseMutationResult<unknown, Error, RateInput>
  leaderboard: UseQueryResult<LeaderboardResult>
  vouchFor: UseMutationResult<Vouch, Error, string>
}

/**
 * Wraps `reputation.get/rate/leaderboard/vouchFor`
 * (all real — packages/sails-sdk/src/modules/reputation.ts, verified
 * against src/modules/open-reputation/reputation.routes.ts directly).
 * Every mutation invalidates the relevant queries on success — no
 * caller-side refetch plumbing needed. `participantId` may be
 * undefined (query stays disabled) the same way useSailsTrade()
 * handles an unresolved id.
 */
export function useSailsReputation(participantId: string | undefined): UseSailsReputationResult {
  const client = useSailsClient()
  const queryClient = useQueryClient()
  const queryKey = ['sails', 'reputation', participantId] as const

  const query = useQuery({
    queryKey,
    queryFn: () => client.reputation.get(participantId as string),
    enabled: Boolean(participantId),
  })

  const leaderboard = useQuery({
    queryKey: ['sails', 'reputation', 'leaderboard'],
    queryFn: () => client.reputation.leaderboard(),
  })

  function invalidate(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey })
  }

  const rate = useMutation({
    mutationFn: (input: RateInput) => client.reputation.rate(input),
    onSuccess: invalidate,
  })

  const vouchFor = useMutation({
    mutationFn: (voucheeId: string) => client.reputation.vouchFor(voucheeId),
    onSuccess: invalidate,
  })

  return { query, rate, leaderboard, vouchFor }
}