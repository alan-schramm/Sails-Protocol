import type { SailsClient } from '@satsails/p2p-trading-sdk'
import { useSailsContext } from '../providers/SailsProvider'

/** The real SailsClient instance a <SailsProvider client={...}> was given — throws outside one. */
export function useSailsClient(): SailsClient {
  return useSailsContext()
}
