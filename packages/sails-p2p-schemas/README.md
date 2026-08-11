# @satsails/p2p-schemas

Domain contract layer between Sails Core (the generic coordination
protocol) and any P2P trading SDK/wallet integration — the shared
TypeScript types and small derivation helpers every Sails Protocol
integration builds on (`Offer`, `Trade`, `Dispute`). Zero runtime
dependencies: a wallet written in any framework can depend on this
without pulling in Prisma, Fastify, or anything else from the
reference implementation.

## Installation

```bash
npm install @satsails/p2p-schemas
```

## Usage

```ts
import type { OfferSchema, TradeSchema, DisputeSchema } from '@satsails/p2p-schemas'
import { toOfferSchema, deriveTradeState } from '@satsails/p2p-schemas'
```

- `offer.ts` — `OfferSchema`, `OfferRecord`, `toOfferSchema()`
- `trade.ts` — `TradeSchema`, `TradeState`, `deriveTradeState()`
- `dispute.ts` — `DisputeSchema`, `DisputeStatus`, `DisputeRuling`, `EvidenceDescriptor`

See [@satsails/p2p-trading-sdk](../sails-sdk) for the full client that builds on these
contracts, and the root [README.md](../../README.md) for the protocol
overview.

## License

Apache-2.0
