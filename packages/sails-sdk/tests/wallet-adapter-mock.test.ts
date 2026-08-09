// Unit tests for MockWalletAdapter
import { MockWalletAdapter } from '../src/wallet-adapter-mock';

describe('MockWalletAdapter', () => {
  const mock = new MockWalletAdapter({
    balances: { BTC: '1.50000000', USDT_ERC20: '0' },
    addresses: { BTC: 'btc-mock-address', USDT_ERC20: 'usdt-mock-address' },
  });

  test('getBalance returns mocked balances and fallback to 0', async () => {
    expect(await mock.getBalance('BTC')).toBe('1.50000000');
    expect(await mock.getBalance('USDT_ERC20')).toBe('0');
    expect(await mock.getBalance('ETH')).toBe('0'); // unknown asset
  });

  test('signTransaction returns a signed placeholder object', async () => {
    const tx = { amount: 100 };
    const signed = await mock.signTransaction('BTC', tx);
    expect(signed).toMatchObject({ asset: 'BTC', signed: true, originalTx: tx });
  });

  test('broadcastTransaction returns deterministic hash', async () => {
    const hash = await mock.broadcastTransaction('BTC', { dummy: true });
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^0xmockhash-BTC-/);
  });

  test('sendTransaction composes sign and broadcast', async () => {
    const tx = { foo: 'bar' };
    const hash = await mock.sendTransaction('USDT_ERC20', tx);
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^0xmockhash-USDT_ERC20-/);
  });

  test('signMessage returns the original message', async () => {
    const msg = new Uint8Array([1, 2, 3]);
    const signed = await mock.signMessage(msg);
    expect(signed).toEqual(msg);
  });

  test('getCapabilities infers assets from the configured addresses/balances', async () => {
    const caps = await mock.getCapabilities();
    expect(caps).toEqual({
      assets: ['BTC', 'USDT_ERC20'],
      fiatRails: [],
      supportsP2PTrading: false,
      supportsOnchainSettlement: false,
    });
  });

  test('getCapabilities.assets is empty when no addresses/balances are configured', async () => {
    const bare = new MockWalletAdapter();
    expect(await bare.getCapabilities()).toEqual({
      assets: [],
      fiatRails: [],
      supportsP2PTrading: false,
      supportsOnchainSettlement: false,
    });
  });

  test('an explicit capabilities.assets override wins over inference', async () => {
    const overridden = new MockWalletAdapter({
      addresses: { BTC: 'btc-mock-address' },
      capabilities: { assets: ['ETH'] },
    });
    expect((await overridden.getCapabilities()).assets).toEqual(['ETH']);
  });
});
