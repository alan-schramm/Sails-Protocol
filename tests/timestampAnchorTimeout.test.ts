import { createHash } from 'crypto'
import { BoundedRpcTimeoutError } from '../src/modules/open-settlement/bounded-rpc'
import {
  OpenTimestampsAnchor,
  OTS_CALENDAR_TIMEOUT_MS,
} from '../src/modules/open-proof/timestamp-anchor'

describe('OpenTimestampsAnchor outbound timeout policy (#314A)', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('preserves the existing successful calendar response behavior', async () => {
    const proofBytes = Buffer.alloc(64, 7)
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(proofBytes, { status: 200 })
    )
    global.fetch = fetchMock as typeof fetch

    const anchor = new OpenTimestampsAnchor('https://calendar.example')
    const digestHex = createHash('sha256').update('normal').digest('hex')
    const proof = await anchor.anchor(digestHex)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://calendar.example/digest',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      })
    )
    expect(proof).toEqual(expect.objectContaining({
      anchorType: 'opentimestamps',
      anchorId: proofBytes.toString('base64'),
      upgraded: false,
    }))
  })

  it('cancels a never-resolving calendar at 30s, reports no success, and never retries', async () => {
    jest.useFakeTimers()
    const fetchMock = jest.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        }, { once: true })
      })
    )
    global.fetch = fetchMock as typeof fetch

    const anchor = new OpenTimestampsAnchor('https://calendar.example')
    const digestHex = createHash('sha256').update('never-resolves').digest('hex')
    const pending = anchor.anchor(digestHex)

    await jest.advanceTimersByTimeAsync(OTS_CALENDAR_TIMEOUT_MS)

    await expect(pending).rejects.toBeInstanceOf(BoundedRpcTimeoutError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('propagates cancellation/network failure without manufacturing an anchor or retrying', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('calendar unavailable'))
    global.fetch = fetchMock as typeof fetch

    const anchor = new OpenTimestampsAnchor('https://calendar.example')
    const digestHex = createHash('sha256').update('failure').digest('hex')

    await expect(anchor.anchor(digestHex)).rejects.toThrow('calendar unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
