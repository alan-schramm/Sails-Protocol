import { SailsTransport } from '../src/transport'
import { SailsIdentityModule, generateKeypair } from '../src/modules/identity'
import { SailsOpenP2PModule, WebSocketChannel } from '../src/modules/openp2p'
import { SailsTransportError, SailsValidationError, SailsNotFoundError } from '../src/errors'
import { bytesToHex } from '../src/encoding'

function fakeFetch(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
}

function fakeFetchSequence(...responses: Array<{ status: number; body: unknown }>): jest.Mock {
  const mock = jest.fn()
  for (const { status, body } of responses) {
    mock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body })
  }
  return mock
}

class FakeSocket {
  public sent: string[] = []
  public closed = false
  public readonly url: string
  private listeners: Record<string, Array<(event: any) => void>> = {}

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, handler: (event: any) => void) {
    ;(this.listeners[type] ??= []).push(handler)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
  }

  emitOpen() {
    for (const handler of this.listeners['open'] ?? []) handler({})
  }

  emitMessage(data: unknown) {
    for (const handler of this.listeners['message'] ?? []) handler({ data })
  }

  emitClose() {
    for (const handler of this.listeners['close'] ?? []) handler({})
  }
}

describe('SDK breaker tests — edge-case failure handling', () => {
  it('propagates wallet sign failures from authenticateWithWallet and does not set a session token', async () => {
    const challenge = 'deadbeef'.repeat(8)
    const fetchImpl = fakeFetchSequence(
      { status: 200, body: { success: true, data: { challenge, expiresIn: 120 } } }
    )
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    const identity = new SailsIdentityModule(transport)
    const publicKeyHex = bytesToHex(generateKeypair().publicKey)
    const wallet = {
      signMessage: jest.fn(async () => {
        throw new Error('wallet unavailable')
      }),
    }

    await expect(identity.authenticateWithWallet(publicKeyHex, wallet)).rejects.toThrow('wallet unavailable')
    expect(transport.getSessionToken()).toBeNull()
  })

  it('maps challenge validation failures to SailsValidationError', async () => {
    const fetchImpl = fakeFetch(400, {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid publicKey',
      details: [{ path: ['publicKey'], message: 'Required' }],
    })
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    const identity = new SailsIdentityModule(transport)

    await expect(identity.challenge('')).rejects.toThrow(SailsValidationError)
  })

  it('maps getTrade 404 to SailsNotFoundError', async () => {
    const fetchImpl = fakeFetch(404, { success: false, error: 'NOT_FOUND', message: 'Trade not found', details: [] })
    const openp2p = new SailsOpenP2PModule(new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch }))

    await expect(openp2p.getTrade('missing-trade')).rejects.toThrow(SailsNotFoundError)
  })

  it('maps updateTradeStatus 404 to SailsNotFoundError', async () => {
    const fetchImpl = fakeFetch(404, { success: false, error: 'NOT_FOUND', message: 'Trade not found', details: [] })
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    transport.setSessionToken('session-token')
    const openp2p = new SailsOpenP2PModule(transport)

    await expect(openp2p.updateTradeStatus('missing-trade', 'CANCELLED')).rejects.toThrow(SailsNotFoundError)
  })

  it('throws before opening a chat when no session token is set', async () => {
    const openp2p = new SailsOpenP2PModule(new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch }))
    await expect(() => openp2p.chat('trade-1')).toThrow(/active session/)
  })

  it('ignores malformed JSON chat frames and keeps processing later valid messages', async () => {
    const socket = new FakeSocket('ws://localhost:3000/v1/openp2p/chat?token=session-abc')
    const channel = new WebSocketChannel(() => socket as unknown as WebSocket, 'trade-1')
    const received: unknown[] = []
    channel.onMessage((msg) => received.push(msg))

    socket.emitOpen()
    socket.emitMessage('not-json')
    socket.emitMessage(JSON.stringify({ type: 'NEW_MESSAGE', payload: { messageId: 'msg-1', tradeId: 'trade-1', senderId: 'sender-1', content: 'hello', msgType: 'TEXT', timestamp: new Date().toISOString() } }))

    expect(received).toEqual([
      { messageId: 'msg-1', tradeId: 'trade-1', senderId: 'sender-1', content: 'hello', msgType: 'TEXT', timestamp: expect.any(String) },
    ])
  })

  it('uses the freshest session token when reconnecting a WebSocket channel', async () => {
    const sockets: FakeSocket[] = []
    let sessionToken: string | null = 'token-1'
    const transport = new SailsTransport({
      baseUrl: 'http://localhost:3000',
      fetchImpl: fakeFetch(200, { success: true, data: { ok: true } }),
      webSocketImpl: class FakeWebSocket {
        public url: string
        constructor(url: string) {
          this.url = url
          const socket = new FakeSocket(url)
          sockets.push(socket)
          return socket as unknown as FakeWebSocket
        }
      } as unknown as typeof WebSocket,
    })

    transport.setSessionToken(sessionToken)
    const openp2p = new SailsOpenP2PModule(transport)
    const channel = openp2p.chat('trade-1', { initialReconnectDelayMs: 1, maxReconnectDelayMs: 1, maxReconnectAttempts: 1 })

    expect(sockets).toHaveLength(1)
    sockets[0].emitOpen()
    expect(sockets[0].url).toContain('token=token-1')

    sessionToken = 'token-2'
    transport.setSessionToken(sessionToken)
    sockets[0].emitClose()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(sockets).toHaveLength(2)
    expect(sockets[1].url).toContain('token=token-2')
  })

  it('throws SailsTransportError for network failures on POST and does not retry mutating calls', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 2 })

    await expect(transport.post('/v1/settlement/escrow', { foo: 'bar' })).rejects.toThrow(SailsTransportError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
