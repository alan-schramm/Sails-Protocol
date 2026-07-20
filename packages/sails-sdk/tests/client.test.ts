/**
 * SailsClient — assembly and the Intent-oriented facade's honest
 * implemented/not-implemented split (intent-facade.ts's own header
 * explains why three of the six verbs still throw — dispute() became
 * real once RFC-018's Intent -> Trade -> Escrow link existed).
 */
import { SailsClient } from '../src/client'
import { SailsNotImplementedError } from '../src/errors'

function fakeFetch(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
}

// dispute() makes two real calls in sequence (GET by-intent, then POST
// dispute) — a single fakeFetch() can't return two different bodies, so
// this resolves each call in the order dispute() actually makes them.
function fakeFetchSequence(...responses: Array<{ status: number; body: unknown }>): jest.Mock {
  const mock = jest.fn()
  for (const { status, body } of responses) {
    mock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body })
  }
  return mock
}

describe('SailsClient — Intent facade', () => {
  it('createIntent() calls the real POST /api/v1/intents route with a real auth header, no participantId in the body', async () => {
    // Gap-audit fix: this call used to send participantId in the body
    // with no auth header at all — the exact RT-002 vulnerability
    // reintroduced. It's now authenticated and the server derives
    // participantId from the session instead of trusting the body.
    const fetchImpl = fakeFetch(201, {
      success: true,
      data: { id: 'intent-1', type: 'TradeIntent', status: 'COORDINATED' },
    })
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    client.setSessionToken('session-token-1')

    const intent = await client.createIntent('TradeIntent', { asset: 'BTC', side: 'BUY' }, 'agent-1')

    expect(intent.id).toBe('intent-1')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/api/v1/intents')
    expect(init.headers.authorization).toBe('Bearer session-token-1')
    expect(JSON.parse(init.body)).toEqual({
      type: 'TradeIntent',
      payload: { asset: 'BTC', side: 'BUY' },
      agentId: 'agent-1',
    })
  })

  it('createIntent() throws before making a request when no session token is set — auth is not optional anymore', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch })
    await expect(client.createIntent('TradeIntent', { asset: 'BTC', side: 'BUY' })).rejects.toThrow(/requires authentication/)
  })

  it('cancelIntent() calls the real DELETE /api/v1/intents/:id route with a real auth header', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: {} })
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    client.setSessionToken('session-token-1')

    await client.cancelIntent('intent-1')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/api/v1/intents/intent-1')
    expect(init.method).toBe('DELETE')
    expect(init.headers.authorization).toBe('Bearer session-token-1')
  })

  it('negotiate() throws SailsNotImplementedError and points to openp2p.chat()', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch })
    await expect(client.negotiate('intent-1', { type: 'MESSAGE_EXCHANGED' })).rejects.toThrow(SailsNotImplementedError)
    await expect(client.negotiate('intent-1', { type: 'MESSAGE_EXCHANGED' })).rejects.toThrow(/openp2p\.chat/)
  })

  it('submitProof() throws SailsNotImplementedError citing the Proof primitive gap', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch })
    await expect(client.submitProof('intent-1', { claimType: 'payment_sent', evidence: {} })).rejects.toThrow(/Proof primitive/)
  })

  it('releaseAsset() throws SailsNotImplementedError and points to settlement.release()', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch })
    await expect(client.releaseAsset('intent-1')).rejects.toThrow(/settlement\.release/)
  })

  it('dispute() resolves intentId -> Trade -> Escrow (RFC-018) and raises a real Dispute', async () => {
    const fetchImpl = fakeFetchSequence(
      { status: 200, body: { success: true, data: { id: 'trade-1', escrowId: 'escrow-1' } } },
      { status: 200, body: { success: true, data: { id: 'dispute-1', reason: 'no payment received' } } }
    )
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    client.setSessionToken('session-token-1')

    const dispute = await client.dispute('intent-1', 'no payment received')

    expect(dispute.id).toBe('dispute-1')
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:3000/v1/openp2p/trades/by-intent/intent-1')
    const [disputeUrl, disputeInit] = fetchImpl.mock.calls[1]
    expect(disputeUrl).toBe('http://localhost:3000/v1/settlement/escrow/escrow-1/dispute')
    expect(JSON.parse(disputeInit.body)).toEqual({ reason: 'no payment received' })
  })

  it('dispute() throws SailsNotImplementedError when the resolved Trade has no Escrow yet', async () => {
    // Called twice below (same as this file's other rejects.toThrow pairs),
    // so the by-intent lookup needs two queued responses, not one.
    const noEscrowResponse = { status: 200, body: { success: true, data: { id: 'trade-1', escrowId: null } } }
    const fetchImpl = fakeFetchSequence(noEscrowResponse, noEscrowResponse)
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    client.setSessionToken('session-token-1')

    await expect(client.dispute('intent-1', 'reason')).rejects.toThrow(SailsNotImplementedError)
    await expect(client.dispute('intent-1', 'reason')).rejects.toThrow(/no Escrow yet/)
  })
})

describe('SailsClient — module assembly', () => {
  it('exposes every Protocol SDK module (SDK_GUIDE.md section 2)', () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch })
    expect(client.identity).toBeDefined()
    expect(client.reputation).toBeDefined()
    expect(client.liquidity).toBeDefined()
    expect(client.openp2p).toBeDefined()
    expect(client.settlement).toBeDefined()
    expect(client.peers).toBeDefined()
    expect(client.capabilities).toBeDefined() // RFC-013
  })

  it('leaves client.wallet undefined when no WalletAdapter is supplied (RFC-013 — optional, v0.1 surface unaffected)', () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch })
    expect(client.wallet).toBeUndefined()
  })

  it('exposes the WalletAdapter passed at construction as client.wallet', () => {
    const wallet = {
      getPeerId: async () => 'peer-1',
      getAddress: async () => '0xabc',
      getBalance: async () => '0',
      signTransaction: async (_asset: string, tx: unknown) => tx,
      broadcastTransaction: async () => 'txid',
      getCapabilities: async () => ({ assets: [], fiatRails: [], supportsP2PTrading: true, supportsOnchainSettlement: true }),
    }
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch, wallet })
    expect(client.wallet).toBe(wallet)
  })

  it('setSessionToken()/getSessionToken() escape hatch reaches the same transport every module shares', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: { id: 'user-1' } })
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    client.setSessionToken('manually-set-token')
    expect(client.getSessionToken()).toBe('manually-set-token')

    await client.identity.me()
    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers.authorization).toBe('Bearer manually-set-token')
  })
})

describe('SailsClient — friendly aliases (docs/API_STABLE.md)', () => {
  // Each alias must be the SAME instance as its protocol-name
  // counterpart, not a second module with its own state — a caller
  // mixing `sdk.auth.authenticate(...)` and `sdk.identity.me()` (or any
  // other alias/protocol-name pair) must share one session, one
  // transport, no duplicated behavior to keep in sync.
  it('auth/offers/trades/escrow/trustScore are the exact same instances as identity/liquidity/openp2p/settlement/reputation', () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch })

    expect(client.auth).toBe(client.identity)
    expect(client.offers).toBe(client.liquidity)
    expect(client.trades).toBe(client.openp2p)
    expect(client.escrow).toBe(client.settlement)
    expect(client.trustScore).toBe(client.reputation)
  })

  it('a session set via one name is visible through its alias (proves they share the one real transport, not just object equality)', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: { id: 'user-1' } })
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    client.setSessionToken('alias-shared-token')
    await client.auth.me()

    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers.authorization).toBe('Bearer alias-shared-token')
  })
})
