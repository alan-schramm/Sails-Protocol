'use client'

/**
 * Fase 6 — the real, minimal provider tree every `@sails/sdk-react`
 * consumer needs (documented for real in `packages/sdk-react/README.md`,
 * written alongside this): `SailsProvider` (wraps a pre-constructed
 * `SailsClient`) *and* TanStack Query's own `QueryClientProvider` — every
 * hook in that package is `useQuery`/`useMutation`/`useInfiniteQuery`
 * under the hood.
 */
import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SailsProvider } from '@sails/sdk-react'
import { getSailsClient } from '../sails-integration/client'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [client] = useState(() => getSailsClient())

  return (
    <QueryClientProvider client={queryClient}>
      <SailsProvider client={client}>{children}</SailsProvider>
    </QueryClientProvider>
  )
}
