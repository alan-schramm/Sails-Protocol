/**
 * SailsCapabilitiesModule + WalletAdapter integration (RFC-013).
 */
import { SailsTransport } from '../src/transport'
import { SailsCapabilitiesModule } from '../src/modules/capabilities'
import type { WalletAdapter } from '../src/wallet-adapter'

function fakeFetch(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
}

function authedTransport(fetchImpl: jest.Mock): SailsTransport {
  const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
  transport.setSessionToken('session-abc')
  return transport
}

describe('SailsCapabilitiesModule', () => {
  it('register() posts to /v1/capabilities/register with auth', async () => {
    const fetchImpl = fakeFetch(201, {
      success: true,
      data: { grantId: 'grant-1', grantedTo: 'user-1', capabilityName: 'trade-coordination', scope: ['a'], issuedBy: 'user-1' },
    })
    const capabilities = new SailsCapabilitiesModule(authedTransport(fetchImpl))

    const grant = await capabilities.register({ capabilityName: 'trade-coordination', scope: ['a'] })

    expect(grant.grantId).toBe('grant-1')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/capabilities/register')
    expect(init.headers.authorization).toBe('Bearer session-abc')
  })

  it('list() hits GET /v1/capabilities/:participantId, no auth required', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: [] })
    const capabilities = new SailsCapabilitiesModule(new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch }))

    await capabilities.list('user-1')

    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:3000/v1/capabilities/user-1')
  })

  it('revoke() posts to /v1/capabilities/:grantId/revoke with auth', async () => {
    const fetchImpl = fakeFetch(200, { success: true, data: {} })
    const capabilities = new SailsCapabilitiesModule(authedTransport(fetchImpl))

    await capabilities.revoke('grant-1')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3000/v1/capabilities/grant-1/revoke')
    expect(init.headers.authorization).toBe('Bearer session-abc')
  })

  it('registerFromWallet() derives scope from the WalletAdapter\'s declared capabilities', async () => {
    const fetchImpl = fakeFetch(201, {
      success: true,
      data: { grantId: 'grant-1', grantedTo: 'user-1', capabilityName: 'trade-coordination', scope: ['trade-coordination', 'settlement'], issuedBy: 'user-1' },
    })
    const capabilities = new SailsCapabilitiesModule(authedTransport(fetchImpl))

    const wallet: WalletAdapter = {
      getPeerId: async () => 'peer-1',
      getAddress: async () => '0xabc',
      getBalance: async () => '0',
      signTransaction: async (_asset, tx) => tx,
      broadcastTransaction: async () => 'txid',
      getCapabilities: async () => ({
        assets: ['USDT', 'BTC'],
        fiatRails: ['PIX'],
        supportsP2PTrading: true,
        supportsOnchainSettlement: true,
      }),
    }

    await capabilities.registerFromWallet(wallet)

    const [, init] = fetchImpl.mock.calls[0]
    const sentBody = JSON.parse(init.body)
    expect(sentBody.scope).toEqual(['trade-coordination', 'settlement'])
    expect(sentBody.constraints).toEqual({ assets: ['USDT', 'BTC'], fiatRails: ['PIX'] })
  })

  it('registerFromWallet() omits settlement scope when the wallet does not support on-chain settlement', async () => {
    const fetchImpl = fakeFetch(201, { success: true, data: { grantId: 'g', grantedTo: 'u', capabilityName: 'trade-coordination', scope: [], issuedBy: 'u' } })
    const capabilities = new SailsCapabilitiesModule(authedTransport(fetchImpl))

    const wallet: WalletAdapter = {
      getPeerId: async () => 'peer-1',
      getAddress: async () => '0xabc',
      getBalance: async () => '0',
      signTransaction: async (_asset, tx) => tx,
      broadcastTransaction: async () => 'txid',
      getCapabilities: async () => ({
        assets: ['USDT'],
        fiatRails: ['PIX'],
        supportsP2PTrading: true,
        supportsOnchainSettlement: false,
      }),
    }

    await capabilities.registerFromWallet(wallet)

    const [, init] = fetchImpl.mock.calls[0]
    expect(JSON.parse(init.body).scope).toEqual(['trade-coordination'])
  })
})
