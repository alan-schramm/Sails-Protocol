# @satsails/p2p-schemas

Shared P2P trading domain/schema contract package for Sails Protocol — the
TypeScript types and small derivation helpers used across SDK/wallet
integrations (`Offer`, `Trade`, `Dispute`). It sits between protocol-facing
domain contracts and developer integrations; it is not Sails Protocol itself
and it is not the modern Pure Sails Core semantic-evaluator boundary.

Zero runtime dependencies: a wallet written in any framework can depend on
this without pulling in Prisma, Fastify, or anything else from the reference
implementation.

## Installation

```bash
npm install @satsails/p2p-schemas
```

**Publication truth:** the package source visible in the current repository
workspace is not, by definition, identical to the artifact currently
published on npm. A package version identifies one immutable published
artifact; current workspace source may be newer. Verify registry/package
identity when release state matters. Maintainers should follow
[`docs/SCHEMAS_RELEASE.md`](../../docs/SCHEMAS_RELEASE.md) for the canonical
release and package-identity contract.

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

Maintainers: [`docs/SCHEMAS_RELEASE.md`](../../docs/SCHEMAS_RELEASE.md) is the canonical
release contract for this independently versioned npm artifact.

## License

Apache-2.0
