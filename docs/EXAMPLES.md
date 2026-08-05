# Examples for Sails SDK usage

This document provides quick code snippets demonstrating how to use the new wallet methods provided by the `SailsClient`.

## Basic setup
```ts
import { SailsClient } from '@sails/sdk';
import { MockWalletAdapter } from '@sails/sdk/wallet-adapter-mock';

const wallet = new MockWalletAdapter();
const client = new SailsClient({ walletAdapter: wallet });
```

## Get balance
```ts
const balance = await client.getBalance('BTC');
console.log('BTC balance:', balance);
```

## Get addresses
```ts
const addresses = await client.getAddresses();
console.log('All wallet addresses:', addresses);
```

## Send transaction (sign + broadcast)
```ts
const txHash = await client.sendTransaction({
  asset: 'BTC',
  from: addresses[0],
  to: 'bc1qexampleaddress...',
  value: 0.001,
});
console.log('Transaction hash:', txHash);
```

## Sign an arbitrary message
```ts
const message = new Uint8Array([1, 2, 3]);
const signed = await client.signMessage(message);
console.log('Signed message bytes:', signed);
```

## Query wallet capabilities
```ts
const caps = await client.getCapabilities();
console.log('Wallet capabilities:', caps);
```

These snippets can be copied into a file (e.g., `example.ts`) and run with `ts-node` after installing the SDK.
