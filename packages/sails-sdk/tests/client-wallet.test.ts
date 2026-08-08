/**
 * SailsClient wallet-requiring convenience methods — `getBalance`,
 * `sendTransaction`, `getCapabilities`, `signMessage`, `getWalletAddresses`.
 *
 * tests/TEST_AUDIT_REPORT.md flagged these as untested — every one
 * follows the exact same pattern (`throw if !this.wallet`, otherwise
 * delegate to the wallet adapter), so the assertions here exercise the
 * guard, the delegation, and the per-method shape of the wallet adapter
 * contract the SDK relies on.
 *
 * Same fakeFetch pattern capabilities.test.ts already uses — keeps
 * the suite's mocking discipline uniform.
 */
import { SailsClient } from '../src/client'
import type { WalletAdapter } from '../src/wallet-adapter'

function fakeFetch(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

// A real-shaped WalletAdapter — every method the client-side methods
// in this file delegate to has a corresponding entry here, all
// returning realistic-looking values.
function fakeWallet(overrides: Partial<WalletAdapter> = {}): WalletAdapter {
  return {
    getPeerId: async () => 'peer-1',
    getAddress: async (asset: string) => `0xaddr-${asset}`,
    getBalance: async () => '1.5',
    signTransaction: async (_asset, tx) => tx,
    broadcastTransaction: async () => '0xtxid',
    signMessage: async (message) => message,
    getCapabilities: async () => ({
      assets: ['BTC', 'USDT_ERC20'],
      fiatRails: ['PIX'],
      supportsP2PTrading: true,
      supportsOnchainSettlement: true,
    }),
    ...overrides,
  }
}

describe('SailsClient — wallet-requiring convenience methods', () => {
  it('getBalance() throws a clear, actionable error when no wallet adapter is configured', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000' })
    await expect(client.getBalance('BTC')).rejects.toThrow(
      /getBalance\(\) requires a wallet adapter/
    )
  })

  it('getBalance() delegates to wallet.getBalance(asset) and returns its string', async () => {
    const client = new SailsClient({
      baseUrl: 'http://localhost:3000',
      wallet: fakeWallet({ getBalance: async () => '0.42' }),
    })
    expect(await client.getBalance('BTC')).toBe('0.42')
  })

  it('sendTransaction() throws when no wallet adapter is configured', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000' })
    await expect(client.sendTransaction('BTC', { to: '0xabc', value: '0' })).rejects.toThrow(
      /sendTransaction\(\) requires a wallet adapter/
    )
  })

  it('sendTransaction() signs with the wallet and broadcasts the signed tx, returning the broadcast txId', async () => {
    const signedTx = { to: '0xabc', value: '0', sig: '0xsig' }
    const client = new SailsClient({
      baseUrl: 'http://localhost:3000',
      wallet: fakeWallet({
        signTransaction: async (_asset, tx) => {
          // The real mock-wallet implementation signTransaction returns
          // the input as-is (signTransaction in client.ts doesn't mutate
          // the tx). The signature is conceptually attached later in a
          // real wallet — for the test we just return the same shape
          // the broadcast call will see.
          return tx
        },
        broadcastTransaction: async (asset, tx) => `0xtxid-${asset}-${(tx as any).value}`,
      }),
    })
    const tx = { to: '0xabc', value: '1' }
    const result = await client.sendTransaction('BTC', tx)
    expect(result).toBe('0xtxid-BTC-1')
  })

  it('getCapabilities() throws when no wallet adapter is configured', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000' })
    await expect(client.getCapabilities()).rejects.toThrow(
      /getCapabilities\(\) requires a wallet adapter/
    )
  })

  it('getCapabilities() returns the WalletCapabilitiesDeclaration as-is', async () => {
    const declared = {
      assets: ['BTC', 'USDT_ERC20', 'LN_BTC'],
      fiatRails: ['PIX', 'TED'],
      supportsP2PTrading: true,
      supportsOnchainSettlement: false,
    }
    const client = new SailsClient({
      baseUrl: 'http://localhost:3000',
      wallet: fakeWallet({ getCapabilities: async () => declared }),
    })
    expect(await client.getCapabilities()).toEqual(declared)
  })

  it('signMessage() throws when no wallet adapter is configured', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000' })
    const message = new Uint8Array([1, 2, 3])
    await expect(client.signMessage(message)).rejects.toThrow(
      /signMessage\(\) requires a wallet adapter/
    )
  })

  it('signMessage() delegates to wallet.signMessage(message)', async () => {
    const signed = new Uint8Array([9, 9, 9])
    const client = new SailsClient({
      baseUrl: 'http://localhost:3000',
      wallet: fakeWallet({ signMessage: async () => signed }),
    })
    const message = new Uint8Array([1, 2, 3])
    expect(await client.signMessage(message)).toBe(signed)
  })

  it('getWalletAddresses() throws when no wallet adapter is configured', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000' })
    await expect(client.getWalletAddresses()).rejects.toThrow(
      /getWalletAddresses\(\) requires a wallet adapter/
    )
  })

  it('getWalletAddresses() returns an address per asset declared by the wallet capabilities', async () => {
    // getWalletAddresses() reads wallet.getCapabilities() to enumerate
    // assets, then calls wallet.getAddress(asset) for each — every asset
    // declared must produce a corresponding address in the same order.
    const client = new SailsClient({
      baseUrl: 'http://localhost:3000',
      wallet: fakeWallet({
        getAddress: async (asset) => `0xaddr-${asset}`,
        getCapabilities: async () => ({
          assets: ['BTC', 'USDT_ERC20', 'LN_BTC'],
          fiatRails: ['PIX'],
          supportsP2PTrading: true,
          supportsOnchainSettlement: true,
        }),
      }),
    })
    expect(await client.getWalletAddresses()).toEqual([
      '0xaddr-BTC',
      '0xaddr-USDT_ERC20',
      '0xaddr-LN_BTC',
    ])
  })

  it('getWalletAddresses() returns an empty array when the wallet declares no assets', async () => {
    const client = new SailsClient({
      baseUrl: 'http://localhost:3000',
      wallet: fakeWallet({
        getCapabilities: async () => ({
          assets: [],
          fiatRails: [],
          supportsP2PTrading: false,
          supportsOnchainSettlement: false,
        }),
      }),
    })
    expect(await client.getWalletAddresses()).toEqual([])
  })

  it('getWalletAddresses() preserves order — important for the UI\'s address-list rendering', async () => {
    const client = new SailsClient({
      baseUrl: 'http://localhost:3000',
      wallet: fakeWallet({
        getAddress: async (asset) => asset,
        getCapabilities: async () => ({
          assets: ['BTC', 'LN_BTC', 'USDT_ERC20'],
          fiatRails: [],
          supportsP2PTrading: true,
          supportsOnchainSettlement: true,
        }),
      }),
    })
    expect(await client.getWalletAddresses()).toEqual(['BTC', 'LN_BTC', 'USDT_ERC20'])
  })
})