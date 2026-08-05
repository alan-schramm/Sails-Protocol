import { SailsClient } from '../src/client';

describe('SailsClient — sendTransaction method', () => {
  it('signs and broadcasts a transaction using the injected wallet adapter', async () => {
    const wallet = {
      getPeerId: async () => 'peer-1',
      getAddress: async (asset: string) => `address-${asset}`,
      getBalance: async (asset: string) => '0',
      signTransaction: async (_asset: string, tx: any) => ({ ...(tx as any), signed: true }),
      broadcastTransaction: async (asset: string, signedTx: unknown) => `0xmockhash-${asset}-${JSON.stringify(signedTx)}`,
      getCapabilities: async () => ({ assets: [], fiatRails: [], supportsP2PTrading: true, supportsOnchainSettlement: true }),
      signMessage: async (message: Uint8Array) => message,
    };
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch, wallet });
    const tx = { amount: 100 };
    const hash = await client.sendTransaction('BTC', tx);
    expect(hash).toMatch(/^0xmockhash-BTC-/);
  });

  it('throws if no wallet is configured', async () => {
    const client = new SailsClient({ baseUrl: 'http://localhost:3000', fetchImpl: jest.fn() as unknown as typeof fetch });
    await expect(client.sendTransaction('BTC', {})).rejects.toThrow('Wallet adapter not configured');
  });
});
