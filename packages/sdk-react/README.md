# @sails/sdk-react

React hooks and components for [`@sails/sdk`](../sails-sdk) — a small,
real set of TanStack Query-backed data hooks and trade/identity/feedback
primitives. Not a full design system: it wraps what `@sails/sdk` actually
exposes, nothing more (`src/index.ts`'s own header comment).

This file was missing until Fase 6 (the `examples/sails-integration-starter`
starter kit) needed to document the one real setup requirement every
consumer of this package hits — including `src/index.ts`'s own comment,
which pointed here before this file existed.

## Setup

Every hook in this package needs **two** providers present — `SailsProvider`
(wraps a `SailsClient` instance you construct yourself) **and** TanStack
Query's own `QueryClientProvider` (every hook here is `useQuery`/
`useMutation`/`useInfiniteQuery` under the hood):

```tsx
import { SailsClient } from '@sails/sdk'
import { SailsProvider } from '@sails/sdk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const sailsClient = new SailsClient({ baseUrl: process.env.NEXT_PUBLIC_SAILS_BASE_URL ?? 'http://localhost:3000' })
const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SailsProvider client={sailsClient}>{children}</SailsProvider>
    </QueryClientProvider>
  )
}
```

`SailsProvider` takes a pre-constructed `SailsClient`, not construction
options (`SailsProviderProps { client: SailsClient; children: ReactNode }`)
— you own the client's lifecycle, same convention `QueryClientProvider`
itself uses. See `examples/sails-integration-starter/src/sails-integration/client.ts`
for a real, working singleton pattern.

## What's exported (`src/index.ts`)

**Providers/hooks:**
- `SailsProvider`, `useSailsContext` — the context above.
- `useSailsClient()` — the real `SailsClient` a `<SailsProvider>` was given.
- `useSailsTrade(tradeId)` — wraps `openp2p.getTrade(tradeId)`. No auth
  required. `tradeId` may be `undefined`; the query just stays disabled.
- `useSailsTrades({ limit? })` — wraps `openp2p.getTrades()`, an
  infinite/paginated query over the caller's own trade history (requires
  an authenticated session).
- `useSailsEscrow(escrowId)` — one query (`settlement.get`) plus five
  mutations (`lock`/`markPaymentSent`/`release`/`refund`/`dispute`), each
  wrapping the matching real `SailsSettlementModule` method. Every
  mutation invalidates the escrow query on success — no manual refetch
  needed to see the new status.

**Components:**
- `TradeCard` (`variant: 'default' | 'compact' | 'detailed'`) — renders a
  `Trade`, optionally an `EscrowStatus`, optionally a `viewerParticipantId`
  (labels "You're buying"/"You're selling").
- `TradeStatusBadge` / `EscrowStatusBadge` — plain inline-styled status
  pills (deliberately not Tailwind-coupled, so any consumer can restyle
  via `className`/`style`).
- `ReputationBadge` — renders a `ReputationScore`.
- `ToastProvider` / `useToast` / `Toast` — a minimal toast system.
- `Skeleton` — a loading placeholder.

Every component/hook prop type is exported alongside it (`TradeCardProps`,
`UseSailsEscrowResult`, etc.) — see each file's own JSDoc under `src/`
for the authoritative shape; this README summarizes, it doesn't replace
reading the real source.

## What this package does *not* do

- No routing, no layout, no design tokens — bring your own (Tailwind,
  CSS Modules, whatever). `StatusBadge`'s own file header states this
  explicitly.
- No authentication UI — `@sails/sdk`'s `identity` module (Ed25519
  challenge-response) is the real auth mechanism; this package only
  consumes an already-authenticated `SailsClient`.
- Six-verb intent facade (`createIntent`/`cancelIntent`/`negotiate`/
  `submitProof`/`releaseAsset`/`dispute`) has no dedicated hooks here —
  only `createIntent`/`cancelIntent`/`dispute` are real today (the other
  three throw `SailsNotImplementedError` unconditionally); call them
  directly via `useSailsClient()` if you need them, there's no wrapper
  to keep in sync with that boundary.

## Real, working example

`examples/sails-integration-starter` (this monorepo) wires up this exact
setup end-to-end against a real local Sails node — see its own README
for a from-scratch quick start.
