# API Reference

Reference for the `SailsClient` wallet-requiring convenience methods
defined in `packages/sails-sdk/src/client.ts`. Every method here delegates
to the injected `WalletAdapter` and throws a `SailsTransportError` if
no wallet adapter is configured (see `EXAMPLES.md` for the basic setup).

| Method | Description | Parameters | Returns |
| ------ | ----------- | ---------- | ------- |
| `getBalance(asset: string): Promise<string>` | Retrieves the balance for a given asset. | `asset`: Asset identifier (e.g., `'BTC'`). | Balance as a string. |
| `getWalletAddresses(): Promise<string[]>` | Returns one address per asset declared by the wallet capabilities, in declaration order. | _none_ | Array of address strings. |
| `sendTransaction(asset: string, tx: unknown): Promise<string>` | Signs the tx via `wallet.signTransaction(asset, tx)`, then broadcasts the signed result via `wallet.broadcastTransaction(asset, signedTx)`. Returns the broadcast txid. | `asset`: Asset identifier; `tx`: implementation-specific transaction payload. | Transaction hash. |
| `signMessage(message: Uint8Array): Promise<Uint8Array>` | Signs an arbitrary message — used by `identity.authenticateWithWallet()` for the Ed25519 challenge-response flow. | `message`: Byte array to sign. | Signed message bytes. |
| `getCapabilities(): Promise<WalletCapabilitiesDeclaration>` | Returns the wallet's declared capabilities (assets, fiat rails, P2P / onchain support flags). | _none_ | Capabilities object. |
| `setSessionToken(token: string \| null): void` | Direct session control — write the token this client will attach to every authenticated request. Useful when loading the session from your own secure storage instead of `identity.authenticate()`. | `token`: session token or `null` to clear. | _none_ |
| `getSessionToken(): string \| null` | Returns the currently-set session token, or `null` if none. | _none_ | Current token or `null`. |
