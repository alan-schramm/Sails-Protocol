/**
 * Fase 6 — `MockWalletAdapter`, a real implementation of `@satsails/p2p-trading-sdk`'s
 * real `WalletAdapter` interface (`packages/sails-sdk/src/wallet-adapter.ts`,
 * confirmed by reading it directly before writing this):
 *
 * ```ts
 * interface WalletAdapter {
 *   getPeerId(): Promise<string>
 *   getAddress(asset: string): Promise<string>
 *   getBalance(asset: string): Promise<string>
 *   signTransaction(asset: string, tx: unknown): Promise<unknown>
 *   broadcastTransaction(asset: string, signedTx: unknown): Promise<string>
 *   getCapabilities(): Promise<WalletCapabilitiesDeclaration>
 *   signMessage(message: Uint8Array): Promise<Uint8Array>  // added 2026-08-02
 * }
 * ```
 *
 * **This is a reference stub for wiring shape, not a real wallet.**
 * Every value it returns is fake: in-memory addresses, configurable
 * in-memory balances, a "signature" that is a plain object with
 * `mock: true` (never anything resembling a real cryptographic
 * signature), and a "broadcast" that never touches a network. Never use
 * this with real funds. `examples/simple-wallet` itself never implements
 * `WalletAdapter` at all — it authenticates via the SDK's real Ed25519
 * `identity.create()`/`identity.authenticate()` flow instead, which is
 * the flow actually required by every module today. `WalletAdapter` is
 * an optional extension point (`SailsClientOptions.wallet?`) for wiring
 * a real wallet's signing/balance/address logic in later — this class
 * exists to show that shape concretely, not to replace real
 * authentication.
 *
 * Deterministic, not random: `getPeerId()`/`getAddress()` derive from a
 * per-instance seed so the same `MockWalletAdapter` instance always
 * reports the same identity/addresses across calls (useful for a UI
 * that re-renders), while two separately-constructed instances get
 * different ones (useful for simulating two distinct wallets in one
 * process, e.g. a buyer and a seller in `examples/p2p-bitcoin-trade.ts`).
 */
import type { WalletAdapter, WalletCapabilitiesDeclaration } from '@satsails/p2p-trading-sdk'

export interface MockWalletAdapterConfig {
  /** Assets this mock wallet declares support for. Default: a small real AssetType sample. */
  assets?: string[]
  /** Seed initial fake balances per asset (decimal strings — RFC-009). Unlisted assets default to '0.00000000'. */
  initialBalances?: Record<string, string>
}

let instanceCounter = 0

export class MockWalletAdapter implements WalletAdapter {
  private readonly seed: number
  private readonly assets: string[]
  private readonly balances: Record<string, string>

  constructor(config: MockWalletAdapterConfig = {}) {
    this.seed = ++instanceCounter
    this.assets = config.assets ?? ['BTC', 'USDT_ERC20', 'LN_BTC']
    this.balances = { ...config.initialBalances }
  }

  async getPeerId(): Promise<string> {
    return `mock-peer-${this.seed.toString(16).padStart(8, '0')}`
  }

  async getAddress(asset: string): Promise<string> {
    return `mock-addr-${asset.toLowerCase()}-${this.seed.toString(16).padStart(8, '0')}`
  }

  async getBalance(asset: string): Promise<string> {
    return this.balances[asset] ?? '0.00000000'
  }

  async signTransaction(asset: string, tx: unknown): Promise<unknown> {
    return { mock: true as const, asset, tx, signedAt: new Date().toISOString() }
  }

  // 2026-08-02 — WalletAdapter's own new required method (see that
  // interface's doc comment). A fake, deterministic-per-instance "signature"
  // like every other value this mock returns — never anything resembling
  // a real cryptographic signature, so a real server would reject it; this
  // exists to show the wiring shape (identity.authenticateWithWallet()
  // calling through to here), not to actually authenticate against a real
  // backend.
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const fakeSig = new Uint8Array(64)
    fakeSig[0] = this.seed % 256
    fakeSig.set(message.slice(0, Math.min(message.length, 63)), 1)
    return fakeSig
  }

  async broadcastTransaction(_asset: string, _signedTx: unknown): Promise<string> {
    return `mock-tx-${this.seed}-${Date.now()}`
  }

  async getCapabilities(): Promise<WalletCapabilitiesDeclaration> {
    return {
      assets: this.assets,
      fiatRails: [],
      supportsP2PTrading: true,
      supportsOnchainSettlement: false,
    }
  }
}
