// src/wallet-adapter-local-keypair.ts

import nacl from "tweetnacl";
import type { WalletAdapter, WalletCapabilitiesDeclaration } from "./wallet-adapter";
import type { Ed25519Keypair } from "./modules/identity";

/**
 * Bridges an Ed25519 identity keypair a caller already holds
 * (`identity.create()`/`generateKeypair()`) into the `WalletAdapter` shape
 * `resolveDisputeWithWallet()`/`authenticateWithWallet()`/`attachEvidence()`
 * expect. Built for a caller like a reference UI that already generates and
 * stores this exact keypair to sign in (see `identity.authenticate()`) and
 * later needs to sign an additional artifact — an authority decision, an
 * evidence digest — with that SAME registered public key, without
 * hand-rolling `tweetnacl.sign.detached()` itself at every call site.
 *
 * Deliberately narrow, mirroring `examples/wallet-integration`'s
 * `RealBitcoinWalletAdapter` in the opposite direction: that adapter signs
 * asset transactions but throws on `signMessage()` (a different key
 * entirely); this one signs messages/challenges with the Ed25519 identity
 * key and throws a clear error on every other `WalletAdapter` capability —
 * it has no asset balances, addresses, or transaction-signing ability of
 * its own, because the identity key was never meant to hold any.
 *
 * NOT a template for production wallet custody — where the underlying
 * keypair's private key actually lives (encrypted browser storage, a
 * hardware wallet, a browser extension) is entirely the caller's own
 * decision; this class only signs with whatever `Ed25519Keypair` it is
 * constructed with.
 */
export class LocalKeypairWalletAdapter implements WalletAdapter {
  constructor(private readonly keypair: Ed25519Keypair) {}

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    return nacl.sign.detached(message, this.keypair.secretKey);
  }

  async getPeerId(): Promise<string> {
    throw new Error(
      "LocalKeypairWalletAdapter has no independent peerId — it only wraps an Ed25519 identity keypair for " +
        "signMessage(). Use the peerId already returned by identity.create()/identity.me() for this participant.",
    );
  }

  async getAddress(asset: string): Promise<string> {
    throw new Error(
      `LocalKeypairWalletAdapter holds only a session-identity signing key, not a payout address for '${asset}'.`,
    );
  }

  async getBalance(asset: string): Promise<string> {
    throw new Error(
      `LocalKeypairWalletAdapter holds only a session-identity signing key, not a balance for '${asset}'.`,
    );
  }

  async signTransaction(asset: string, _tx: unknown): Promise<unknown> {
    throw new Error(
      `LocalKeypairWalletAdapter cannot sign a '${asset}' transaction — it only signs messages/challenges ` +
        "with the Ed25519 identity key.",
    );
  }

  async broadcastTransaction(asset: string, _signedTx: unknown): Promise<string> {
    throw new Error(
      `LocalKeypairWalletAdapter cannot broadcast a '${asset}' transaction — it only signs messages/challenges ` +
        "with the Ed25519 identity key.",
    );
  }

  async getCapabilities(): Promise<WalletCapabilitiesDeclaration> {
    return { assets: [], fiatRails: [], supportsP2PTrading: false, supportsOnchainSettlement: false };
  }
}
