/**
 * SailsTransport — the SDK's only network boundary. Every test injects a
 * fake `fetchImpl` (the constructor param this file was specifically
 * designed to accept for exactly this) rather than mocking the global
 * `fetch`, so these tests never depend on jsdom/node-fetch internals.
 */
import { SailsTransport } from '../src/transport'
import { SailsTransportError, SailsValidationError, SailsNotFoundError } from '../src/errors'

function fakeFetch(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

describe('SailsTransport', () => {
  it('builds a GET request with query params appended, dropping undefined values', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: { ok: true } })
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    await transport.get('/v1/liquidity/offers', { asset: 'BTC', side: undefined, limit: 5 })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/liquidity/offers?asset=BTC&limit=5')
    expect(init.method).toBe('GET')
  })

  it('sends a JSON body with content-type on POST', async () => {
    const fetchImpl = fakeFetch(201, { success: true, data: { id: 'x' } })
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    await transport.post('/v1/identity/participants', { publicKey: 'abc' })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/identity/participants')
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ publicKey: 'abc' })
  })

  it('attaches the Bearer session token only when auth=true and a token is set', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: {} })
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    transport.setSessionToken('session-abc')

    await transport.get('/v1/identity/me', undefined, true)

    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers.authorization).toBe('Bearer session-abc')
  })

  it('throws SailsTransportError instead of calling fetch when auth=true but no session token is set', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: {} })
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(transport.get('/v1/identity/me', undefined, true)).rejects.toThrow(SailsTransportError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns the unwrapped `data` field on a successful envelope', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: { id: 'trade-1', amount: '20.5' } })
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    const result = await transport.get('/v1/openp2p/trades/trade-1')
    expect(result).toEqual({ id: 'trade-1', amount: '20.5' })
  })

  it('maps a VALIDATION_ERROR response to SailsValidationError with its details', async () => {
    const fetchImpl = fakeFetch(400, {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: [{ path: ['asset'], message: 'Required' }],
    })
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(transport.post('/v1/liquidity/offers', {})).rejects.toThrow(SailsValidationError)
  })

  it('maps a NOT_FOUND response to SailsNotFoundError', async () => {
    const fetchImpl = fakeFetch(404, { success: false, error: 'NOT_FOUND', message: 'Trade nope not found', details: [] })
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(transport.get('/v1/openp2p/trades/nope')).rejects.toThrow(SailsNotFoundError)
  })

  it('throws SailsTransportError when the response body is not JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json')
      },
    })
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(transport.get('/health')).rejects.toThrow(SailsTransportError)
  })

  it('throws SailsTransportError when the network request itself fails', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(transport.get('/health')).rejects.toThrow(SailsTransportError)
  })
})
