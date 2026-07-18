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
}
