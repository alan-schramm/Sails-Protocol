/**
 * SailsClient — assembly and the Intent-oriented facade's honest
 * implemented/not-implemented split (intent-facade.ts's own header
 * explains why four of the six verbs throw).
 */
import { SailsClient } from '../src/client'
import { SailsNotImplementedError } from '../src/errors'

function fakeFetch(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
}

describe('SailsClient — Intent facade', () => {
  it('createIntent() calls the real POST /api/v1/intents route', async () => {
    const fetchImpl = fakeFetch(201, {
      success: true,
      data: { id: 'intent-1', type: 'TradeIntent', status: 'COORDINATED' },
    })
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    const intent = await client.createIntent('TradeIntent', { asset: 'BTC', side: 'BUY' }, 'user-1', 'agent-1')

    expect(intent.id).toBe('intent-1')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/api/v1/intents')
    expect(JSON.parse(init.body)).toEqual({
      type: 'TradeIntent',
      payload: { asset: 'BTC', side: 'BUY' },
      participantId: 'user-1',
      agentId: 'agent-1',
    })
  })

  it('cancelIntent() calls the real DELETE /api/v1/intents/:id route', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: {} })
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    await client.cancelIntent('intent-1')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/api/v1/intents/intent-1')
    expect(init.method).toBe('DELETE')
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

  it('dispute() throws SailsNotImplementedError and points to settlement.dispute()', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch })
    await expect(client.dispute('intent-1', 'reason')).rejects.toThrow(/settlement\.dispute/)
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
