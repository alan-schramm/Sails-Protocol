import { SailsClient } from '@sails/sdk'
import { mockTrade } from './trade.mock'

/**
 * A real SailsClient (not a hand-rolled duck-typed fake) with a
 * controllable fetchImpl — the same pattern packages/sails-sdk's own
 * tests/modules.test.ts uses (`fakeFetch`). This means every hook in
 * this package is exercised against the real transport/module code, not
 * a shortcut that could silently drift from what @sails/sdk actually
 * does. Used by both this package's Vitest tests and its Storybook
 * decorators (.storybook/preview.tsx) — one mock client, not two.
 */
export interface MockSailsClientOptions {
  /** Called for every request; return the JSON body @sails/sdk should receive. Default: a single mock Trade for any GET, {} for anything else. */
  handleRequest?: (url: string, init: RequestInit) => unknown
  /** Pre-authenticate the client (setSessionToken) so auth-required calls don't throw. Default true. */
  authenticated?: boolean
}

export function createMockSailsClient(options: MockSailsClientOptions = {}): SailsClient {
  const handleRequest =
    options.handleRequest ??
    ((url: string) => {
      // The list endpoint's path has no id segment after it
      // (/v1/openp2p/trades, optionally + a `?limit=...` query) —
      // distinct from a single-trade fetch (/v1/openp2p/trades/:id),
      // which also contains "/trades" but always has a further path
      // segment. Checked by path shape, not just substring inclusion,
      // so getTrade(id) and getTrades() never collide under the default.
      if (/\/trades(\?.*)?$/.test(url)) {
        return { trades: [mockTrade()], total: 1, hasMore: false }
      }
      return mockTrade()
    })

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const body = handleRequest(String(url), init ?? {})
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: body }),
    } as Response
  }) as typeof fetch

  const client = new SailsClient({ baseUrl: 'http://mock.local', fetchImpl })
  if (options.authenticated ?? true) {
    client.setSessionToken('mock-session-token')
  }
  return client
}
