import type { SailsClient } from '@sails/sdk'
import { useSailsContext } from '../providers/SailsProvider'

/** The real SailsClient instance a <SailsProvider client={...}> was given — throws outside one. */
export function useSailsClient(): SailsClient {
  return useSailsContext()
}
