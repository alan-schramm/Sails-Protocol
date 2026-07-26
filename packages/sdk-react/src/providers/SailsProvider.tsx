import { createContext, useContext, type ReactNode } from 'react'
import type { SailsClient } from '@sails/sdk'

// Takes a pre-constructed SailsClient, not construction options — same
// convention TanStack Query's own QueryClientProvider uses (a `client`
// prop, not `{ options }`), which is also what this package's own
// preview.tsx decorators compose it with. Constructing the client
// inside this component instead would mean either re-creating it every
// render (loses the session token) or a fragile useMemo dependency-array
// heuristic on options that could easily go stale — the caller already
// owns the client's lifecycle in every real integration this wraps.
const SailsContext = createContext<SailsClient | null>(null)

export interface SailsProviderProps {
  client: SailsClient
  children: ReactNode
}

export function SailsProvider({ client, children }: SailsProviderProps) {
  return <SailsContext.Provider value={client}>{children}</SailsContext.Provider>
}

// The real accessor every hook in this package (useSailsTrade,
// useSailsTrades, useSailsEscrow) calls through — hooks/useSailsClient.ts
// re-exports this rather than duplicating it, so there is exactly one
// Context object in the whole package.
export function useSailsContext(): SailsClient {
  const client = useContext(SailsContext)
  if (!client) {
    throw new Error(
      'useSailsClient() (and every other @sails/sdk-react hook) must be called within a <SailsProvider client={...}>.'
    )
  }
  return client
}
