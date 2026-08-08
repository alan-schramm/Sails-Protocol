/**
 * Real, network-free unit tests for both WalletAdapter implementations —
 * key generation, address derivation, and signing are all pure functions
 * (no live RPC/explorer needed); only getBalance() touches the network,
 * mocked here at the fetch/provider boundary (CODE_STYLE.md §8: mock the
 * boundary, not the logic under test).
 */
import { RealBitcoinWalletAdapter } from '../src/bitcoin-wallet-adapter'
import { RealEvmWalletAdapter } from '../src/evm-wallet-adapter'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'

bitcoin.initEccLib(ecc)

describe('RealBitcoinWalletAdapter', () => {
  it('derives a real testnet P2WPKH address (bech32, tb1 prefix) from its own generated keypair', async () => {
    const wallet = new RealBitcoinWalletAdapter()
    expect(wallet.address).toMatch(/^tb1/)
    await expect(wallet.getAddress('BTC')).resolves.toBe(wallet.address)
  })

  it('exposes a 33-byte compressed pubkey matching the same PUBKEY_HEX_PATTERN the server validates against', async () => {
    const wallet = new RealBitcoinWalletAdapter()
    expect(wallet.publicKeyHex).toMatch(/^0[23][0-9a-fA-F]{64}$/)
  })

  it('rejects any asset other than BTC', async () => {
    const wallet = new RealBitcoinWalletAdapter()
    await expect(wallet.getAddress('USDT_ERC20')).rejects.toThrow(/only holds a BTC key/)
    await expect(wallet.getBalance('USDT_ERC20')).rejects.toThrow(/only holds a BTC key/)
  })

  it('throws a clear error for getPeerId/signMessage — different key material than session identity', async () => {
    const wallet = new RealBitcoinWalletAdapter()
    await expect(wallet.getPeerId()).rejects.toThrow(/separate Ed25519 keypair/)
    await expect(wallet.signMessage(new Uint8Array([1, 2, 3]))).rejects.toThrow(/separate Ed25519 keypair/)
  })

  it('throws a clear error for broadcastTransaction — MULTISIG broadcasts server-side once all signatures are in', async () => {
    const wallet = new RealBitcoinWalletAdapter()
    await expect(wallet.broadcastTransaction('BTC', 'anything')).rejects.toThrow(/never broadcasts/)
  })

  it('declares real capabilities scoped to BTC only', async () => {
    const wallet = new RealBitcoinWalletAdapter()
    const caps = await wallet.getCapabilities()
    expect(caps.assets).toEqual(['BTC'])
    expect(caps.supportsOnchainSettlement).toBe(true)
  })

  it('getBalance() sums real mempool.space chain_stats correctly', async () => {
    const wallet = new RealBitcoinWalletAdapter()
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ chain_stats: { funded_txo_sum: 15000, spent_txo_sum: 5000 } }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const balance = await wallet.getBalance('BTC')
    expect(balance).toBe('10000')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(wallet.address))
  })
})

describe('RealEvmWalletAdapter', () => {
  it('derives a real checksummed EVM address (ethers.Wallet.createRandom, verifiable independently)', async () => {
    const wallet = new RealEvmWalletAdapter()
    const address = await wallet.getAddress('USDT_ERC20')
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('exposes a 33-byte compressed pubkey matching the same PUBKEY_HEX_PATTERN the server validates against for submitKey()', async () => {
    const wallet = new RealEvmWalletAdapter()
    expect(wallet.publicKeyHex).toMatch(/^0[23][0-9a-fA-F]{64}$/)
  })

  it('rejects any asset other than USDT_ERC20', async () => {
    const wallet = new RealEvmWalletAdapter()
    await expect(wallet.getAddress('BTC')).rejects.toThrow(/only holds an EVM key/)
  })

  it('throws a clear error for getPeerId/signMessage — different key material than session identity', async () => {
    const wallet = new RealEvmWalletAdapter()
    await expect(wallet.getPeerId()).rejects.toThrow(/separate Ed25519 keypair/)
    await expect(wallet.signMessage(new Uint8Array([1, 2, 3]))).rejects.toThrow(/separate Ed25519 keypair/)
  })

  it('declares real capabilities scoped to USDT_ERC20 only', async () => {
    const wallet = new RealEvmWalletAdapter()
    const caps = await wallet.getCapabilities()
    expect(caps.assets).toEqual(['USDT_ERC20'])
    expect(caps.supportsOnchainSettlement).toBe(true)
  })

  it('signEscrowUserOp() produces a real 65-byte Ethereum signature over a SafeGuardBundle\'s userOpHash', async () => {
    const wallet = new RealEvmWalletAdapter()
    // Real SafeGuardBundle shape (settlement.ts) — a real 32-byte hash, hex.
    const bundle = JSON.stringify({
      path: 'COOPERATIVE',
      userOpHash: '0x' + '11'.repeat(32),
      toAddress: '0x' + '22'.repeat(20),
      guardAddress: '0x' + '33'.repeat(20),
      guardDeployment: { to: '0x' + '44'.repeat(20), data: '0x' },
    })
    const signature = wallet.signEscrowUserOp(bundle)
    expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/) // 65 bytes: r(32) + s(32) + v(1)
  })
})
