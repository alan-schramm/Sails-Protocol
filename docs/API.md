# API Reference

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `getBalance(asset: string): Promise<string>` | Retrieves the balance for a given asset. | `asset`: Asset identifier (e.g., `BTC`). | Balance as a string.
| `getAddresses(): Promise<string[]>` | Returns all wallet addresses managed by the adapter. | _none_ | Array of address strings.
| `sendTransaction(params: { asset: string; from: string; to: string; value: number; [key: string]: any }): Promise<string>` | Signs and broadcasts a transaction. | Transaction object with at least `asset`, `from`, `to`, `value`. | Transaction hash.
| `signMessage(message: Uint8Array): Promise<Uint8Array>` | Signs an arbitrary message. | `message`: Byte array to sign. | Signed message bytes.
| `getCapabilities(): Promise<WalletCapabilitiesDeclaration>` | Returns the wallet's declared capabilities. | _none_ | Capabilities object.
