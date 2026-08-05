// src/wallet-adapter-mock.ts

import { WalletAdapter, WalletCapabilitiesDeclaration } from "./wallet-adapter";

/**
 * Simple in‑memory mock implementation of {@link WalletAdapter}.
 * Intended for unit‑tests and examples where a real wallet is not needed.
 * All methods return deterministic values based on the supplied constructor
 * parameters. The mock adheres to the same async contract as the real
 * adapter, making it a drop‑in replacement without altering production code.
 */
export class MockWalletAdapter implements WalletAdapter {
  private readonly peerId: string;
  private readonly addressMap: Record<string, string>;
  private readonly balanceMap: Record<string, string>;
  private readonly capabilities: WalletCapabilitiesDeclaration;

  constructor(options: {
    peerId?: string;
    addresses?: Record<string, string>;
    balances?: Record<string, string>;
    capabilities?: Partial<WalletCapabilitiesDeclaration>;
  } = {}) {
    this.peerId = options.peerId ?? "mock-peer-id";
    this.addressMap = options.addresses ?? {};
    this.balanceMap = options.balances ?? {};
    this.capabilities = {
      assets: [],
      fiatRails: [],
      supportsP2PTrading: false,
      supportsOnchainSettlement: false,
      ...(options.capabilities ?? {}),
    };
  }

  async getPeerId(): Promise<string> {
    return this.peerId;
  }

  async getAddress(asset: string): Promise<string> {
    return this.addressMap[asset] ?? `${asset}-mock-address`;
  }

  async getBalance(asset: string): Promise<string> {
    return this.balanceMap[asset] ?? "0";
  }

  async signTransaction(asset: string, tx: unknown): Promise<unknown> {
    // In a mock we simply echo back the transaction wrapped in an object.
    return { asset, signed: true, originalTx: tx };
  }

  async broadcastTransaction(asset: string, signedTx: unknown): Promise<string> {
    // Return a deterministic fake transaction hash.
    return `0xmockhash-${asset}-${Date.now()}`;
  }
  /**
   * Convenience mock method that signs a transaction and then broadcasts it,
   * returning the fake transaction hash. Mirrors a typical high‑level flow
   * developers expect from a real wallet implementation.
   */
  async sendTransaction(asset: string, tx: unknown): Promise<string> {
    const signed = await this.signTransaction(asset, tx);
    return this.broadcastTransaction(asset, signed);
  }

  async getCapabilities(): Promise<WalletCapabilitiesDeclaration> {
    return this.capabilities;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    // Return the message unchanged – sufficient for unit tests.
    return message;
  }
}
