/**
 * PearsTransportProvider.sendIntentToPeer — composition logic only.
 *
 * Same reasoning as transportFallback.test.ts and routes.test.ts: real
 * HyperDHT/Hyperswarm connectivity can't be verified without a live P2P
 * network in this environment, so `pear.service.ts` is mocked here (the
 * mock only stands in for the network round-trip — `joinTradeTopic`,
 * `getConnectedPeerId`, `sendToPeer`). The actual cryptography
 * (`encryptForPeer`) is NOT mocked — it runs for real against a real
 * HyperDHT-shaped public key, exercising the exact code path
 * sendIntentToPeer calls in production, verified independently for
 * correctness in tests/payloadCrypto.test.ts.
 */
import HyperDHT from 'hyperdht'

const mockPearNodeGet = jest.fn()
const mockUserFindUnique = jest.fn()

jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: {
    get: (...args: unknown[]) => mockPearNodeGet(...args),
  },
}))

jest.mock('../src/common/database', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pearsTransportProvider } = require('../src/infrastructure/p2p/transport-provider')

describe('PearsTransportProvider.sendIntentToPeer', () => {
  const seller = HyperDHT.keyPair()
  const intent = { id: 'intent-1', type: 'TradeIntent', payload: { asset: 'USDT_ERC20' } }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('throws if the sending participant has no active node', async () => {
    mockPearNodeGet.mockReturnValue(undefined)

    await expect(
      pearsTransportProvider.sendIntentToPeer('buyer-1', 'seller-1', intent, 'trade-1')
    ).rejects.toThrow(/no active node for buyer-1/)
  })

  it('prefers an already-connected peerId (proven reachable) over the Postgres directory', async () => {
    const joinTradeTopic = jest.fn().mockResolvedValue(undefined)
    const getConnectedPeerId = jest.fn().mockReturnValue(seller.publicKey.toString('hex'))
    const sendToPeer = jest.fn().mockReturnValue(true)
    mockPearNodeGet.mockReturnValue({ joinTradeTopic, getConnectedPeerId, sendToPeer })

    const delivered = await pearsTransportProvider.sendIntentToPeer('buyer-1', 'seller-1', intent, 'trade-1')

    expect(delivered).toBe(true)
    expect(joinTradeTopic).toHaveBeenCalledWith('trade-1')
    expect(mockUserFindUnique).not.toHaveBeenCalled() // never fell back to the directory
    expect(sendToPeer).toHaveBeenCalledWith('seller-1', expect.objectContaining({ type: 'INTENT', ciphertext: expect.any(String) }))
    // the encrypted ciphertext must not contain the plaintext Intent id anywhere
    const [, sentPayload] = sendToPeer.mock.calls[0]
    expect(sentPayload.ciphertext).not.toContain('intent-1')
  })

  it('falls back to the Postgres peerId directory when no live handshake exists yet', async () => {
    const joinTradeTopic = jest.fn().mockResolvedValue(undefined)
    const getConnectedPeerId = jest.fn().mockReturnValue(undefined)
    const sendToPeer = jest.fn().mockReturnValue(true)
    mockPearNodeGet.mockReturnValue({ joinTradeTopic, getConnectedPeerId, sendToPeer })
    mockUserFindUnique.mockResolvedValue({ id: 'seller-1', peerId: seller.publicKey.toString('hex') })

    const delivered = await pearsTransportProvider.sendIntentToPeer('buyer-1', 'seller-1', intent, 'trade-1')

    expect(delivered).toBe(true)
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { id: 'seller-1' } })
    expect(sendToPeer).toHaveBeenCalled()
  })

  it('returns false without attempting to send when the target has no known peerId anywhere', async () => {
    const joinTradeTopic = jest.fn().mockResolvedValue(undefined)
    const getConnectedPeerId = jest.fn().mockReturnValue(undefined)
    const sendToPeer = jest.fn()
    mockPearNodeGet.mockReturnValue({ joinTradeTopic, getConnectedPeerId, sendToPeer })
    mockUserFindUnique.mockResolvedValue({ id: 'seller-1', peerId: null })

    const delivered = await pearsTransportProvider.sendIntentToPeer('buyer-1', 'seller-1', intent, 'trade-1')

    expect(delivered).toBe(false)
    expect(sendToPeer).not.toHaveBeenCalled()
  })
})
