/**
 * @sails/sdk — WalletAdapter (rfcs/RFC-013-capability-registry-and-wallet-adapter.md)
 *
 * Lets a wallet plug its own signing/balance/address logic into this
 * SDK instead of the SDK being absent one entirely, which v0.1 was
 * (every v0.1 module only makes HTTP/WS calls — none of them ever touch
 * a private key). Deliberately transport- and chain-agnostic (`asset` is
 * a plain string key, `tx`/`signedTx` are `unknown`) — same discipline
 * `SettlementProvider`/`TransportProvider` already use server-side, so a
 * WDK-based wallet, a hardware wallet, or anything else can implement
 * this without the SDK assuming *how* signing happens.
 *
 * `getPeerId()` (not `getNodeId()`, the term an earlier draft of this
 * proposal used) — matches this codebase's own existing vocabulary
 * (`User.peerId`, `PeerHandle.peerId`, `pearNodeRegistry`) instead of
 * introducing a synonym for the same concept.
 */

export interface WalletCapabilitiesDeclaration {
  assets: string[]
  fiatRails: string[]
  supportsP2PTrading: boolean
  supportsOnchainSettlement: boolean
}

export interface WalletAdapter {
  getPeerId(): Promise<string>
  getAddress(asset: string): Promise<string>
  getBalance(asset: string): Promise<string>
  signTransaction(asset: string, tx: unknown): Promise<unknown>
  broadcastTransaction(asset: string, signedTx: unknown): Promise<string>
  getCapabilities(): Promise<WalletCapabilitiesDeclaration>
  // PRODUCTION_READINESS_REVIEW.md's High-severity finding #3 (client key
  // custody), closed on the SDK side 2026-08-02 — before this, nothing in
  // WalletAdapter could authenticate a session at all: `identity.
  // authenticate()` needed the raw Ed25519 secretKey directly (this
  // interface's own header already disclosed that the reference UI's
  // localStorage-backed keypair was a demo shortcut, not a template). A
  // real wallet signs an opaque message with whatever key it holds
  // internally (Ed25519, secp256k1, hardware-backed, doesn't matter to
  // this interface) and returns just the signature bytes — the caller
  // (identity.ts's new `authenticateWithWallet()`) never needs to see,
  // hold, or store the private key itself. Required, not optional: a
  // wallet that can't prove identity can't do anything else useful in
  // this protocol's trust model either.
  signMessage(message: Uint8Array): Promise<Uint8Array>
  // PRODUCTION_READINESS_FIXES.md P1 item 11, closed 2026-08-08 —
  // optional (not every real wallet integration holds a connection
  // worth tearing down — e.g. MockWalletAdapter). SailsClient itself
  // never calls this automatically (it has no destroy()/dispose()
  // lifecycle of its own); a caller that wants deterministic cleanup
  // (closing a hardware-wallet transport, revoking a WalletConnect
  // session, etc.) calls `client.wallet?.disconnect?.()` itself.
  disconnect?(): Promise<void>
}
