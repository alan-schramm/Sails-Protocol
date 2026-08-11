/**
 * Fase 6 — a lazy `SailsClient` singleton, the real class from
 * `@satsails/p2p-trading-sdk` (`packages/sails-sdk/src/client.ts`), constructed the
 * same way `examples/simple-wallet/src/index.ts` already proves works:
 * `new SailsClient({ baseUrl })`, nothing else required. Deliberately
 * NOT the stale `new SailsClient({ wdk, network })` shape
 * `docs/SDK_GUIDE.md` §4/`docs/DEVELOPER_JOURNEY.md` still show — that
 * constructor option doesn't exist on the real class (confirmed by
 * reading `client.ts` directly).
 *
 * Lazy + singleton so both the Next.js app (`NEXT_PUBLIC_SAILS_BASE_URL`,
 * inlined at build time for client components) and the standalone
 * `examples/*.ts` scripts (`SAILS_BASE_URL`, a plain server-side env var)
 * can import this same module without constructing a second client by
 * accident.
 */
import { SailsClient } from '@satsails/p2p-trading-sdk'

let client: SailsClient | undefined

function resolveBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SAILS_BASE_URL ?? process.env.SAILS_BASE_URL ?? 'http://localhost:3000'
}

export function getSailsClient(): SailsClient {
  if (!client) client = new SailsClient({ baseUrl: resolveBaseUrl() })
  return client
}

// Test-only escape hatch — lets a test construct a fresh client against
// a different baseUrl without the module-level singleton leaking state
// across test files. Not needed by the app/scripts themselves.
export function resetSailsClient(): void {
  client = undefined
}
