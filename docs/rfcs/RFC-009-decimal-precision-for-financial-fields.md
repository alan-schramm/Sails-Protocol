# RFC-009: Decimal Precision for Financial Fields

**Status:** Accepted. Originated from an external audit report (CISO/Chief
Architect review of `sails-push-ready`, delivered outside this repository)
claiming `priceUsd`, `amount`, `lockedAmount`, and related fields were
stored as `Float`. Verified independently against `prisma/schema.prisma`
before treating the claim as fact — confirmed real, not assumed from the
report. Authorized directly by the repository owner after verification.
Merged into `prisma/schema.prisma`, `DATABASE.md`, `PROTOCOL_SPECIFICATION.md`,
and the `escrow.service.ts`/`liquidity.service.ts`/`event-bus.ts` code that
touches these fields.

## Summary

Every financial quantity in `prisma/schema.prisma` — `Offer.priceUsd`,
`Offer.priceBrl`, `Offer.minAmount`, `Offer.maxAmount`, `Trade.amount`,
`Trade.priceUsd`, `Trade.totalUsd`, `Escrow.lockedAmount`,
`User.totalVolumeBtc` — is typed `Float` (IEEE 754 double-precision).
Floating point cannot represent most decimal fractions exactly, and errors
compound under repeated arithmetic — a real risk for a field that
represents value an `Escrow` is directly holding pending release. This RFC
changes those columns to `Decimal` with explicit precision/scale, and
propagates the fix through every TypeScript boundary that touches them:
financial amounts become decimal strings (`string`), never `number`, at
every protocol-level or cross-module contract (event payloads,
`LiquidityOffer`, `Settlement`) — not just at the database column.

## Motivation

`Float`/IEEE 754 cannot exactly represent most base-10 fractions (e.g.
`0.1 + 0.2 !== 0.3` in every language using it) — errors are small per
operation but compound under repeated increments, comparisons, and
multiplication, which is exactly what happens to these fields:
`totalVolumeBtc` is incremented on every completed trade
(`handlers.ts`'s `settlement.escrow.released` reaction), `totalUsd` is
presumably `amount * priceUsd` wherever `Trade` creation is implemented,
and `Escrow.lockedAmount` represents actual custodied value between lock
and release. A rounding error here is not cosmetic — it is a real
financial discrepancy in an escrow the protocol is directly responsible
for. Verified directly against the current schema and code rather than
taken on the audit report's word alone (`prisma/schema.prisma` lines
79-167, before this RFC).

## Alternatives Considered

**Smallest-unit `BigInt` representation (satoshis for BTC, cents for
USD).** This is the gold-standard for financial systems — it avoids
floating point and `Decimal`-library overhead entirely, since integers
have no representation error. Rejected for *this* pass, not rejected
outright: it changes the *meaning* of every amount field (`1 BTC` becomes
`100000000`), which requires a unit-conversion layer at every future
display/API boundary in a codebase where none exists yet (no HTTP routes
for trade/escrow creation are wired up today — `app.ts`'s own comments
confirm this). That is a substantially larger refactor than the bug
warrants right now. Left as a candidate for a future RFC if `Decimal`'s
performance or complexity becomes a real constraint once real HTTP/SDK
surfaces exist to migrate.

**`Prisma.Decimal` objects propagated into cross-module contracts**
(event payloads, `LiquidityOffer`, `Settlement`), instead of converting to
`string` at the boundary. Rejected — this would leak an ORM-specific class
(`decimal.js`, re-exported by `@prisma/client`) into Core-level,
technology-agnostic protocol interfaces. `ARCHITECTURE.md` §1's layer
separation and Principle 6 (Infrastructure Neutral) exist specifically to
keep Infrastructure/Domain concerns (a specific ORM's number class) out of
Protocol-layer contracts — a webhook consumer or a future non-Postgres
Reference Implementation should never need `@prisma/client` installed
just to interpret an event payload's amount field. `string` is the
representation every consumer can parse regardless of runtime.

**Fix only the Postgres column type, leave TypeScript interfaces as
`number`.** Rejected — once a column is `Decimal`-typed, Prisma returns a
`Prisma.Decimal` object at read time, not a `number`. Leaving `EscrowRecord`,
`LiquidityOffer`, and the event contracts typed as `number` would just
move the type-lie one layer up (a runtime `Decimal` object assigned to a
statically-declared `number`), and the first arithmetic operation or
`JSON.stringify` boundary that assumed `number` would reintroduce
precision loss or silently misbehave. Fixing the column without fixing
the code it flows into is not actually fixing the bug.

## Decision

**Database (`prisma/schema.prisma`):** every field listed in the Summary
changes from `Float`/`Float?` to `Decimal @db.Decimal(24, 8)` /
`Decimal? @db.Decimal(24, 8)` — 24 total digits, 8 after the decimal point,
enough headroom for BTC-level (satoshi, 8 decimals) precision on both
crypto-asset and fiat-denominated fields without needing separate
precision/scale reasoning per field. `User.reputationScore` is
deliberately **not** changed — it is a computed trust score (§1.6,
0-100 range per `PROTOCOL_SPECIFICATION.md` §1.6's `ReputationScore.total`),
not a currency amount, and is out of scope for a financial-precision fix.

**TypeScript, at every boundary outside Prisma-aware module code:**
financial amounts become `string` (a decimal string, e.g. `"1234.56"`),
converted via `.toString()` at the point a `Prisma.Decimal` result is
mapped into a protocol-level or cross-module shape. Inside a module's own
service file, where Prisma is already an explicit dependency (e.g.
`liquidity.service.ts` reading `offer.priceUsd` directly off a query
result), using `Prisma.Decimal` is fine and expected — the boundary that
matters is the one Core/event-contract/cross-module interfaces cross, not
every internal variable.

```typescript
// Before (event-bus.ts) — leaks precision the moment this gets JSON-serialized,
// since JSON numbers are IEEE754 by spec; only JSON strings are lossless here.
export interface SettlementEscrowCreatedEvent {
  lockedAmount: number
}

// After
export interface SettlementEscrowCreatedEvent {
  lockedAmount: string   // decimal string, e.g. "0.015" — never a JS number
}
```

Prisma's `Decimal`-typed fields accept `string` natively for both writes
(`create`/`update`) and comparison filters (`lte`/`gte`) — parsed via
`decimal.js` server-side-equivalent logic, never through a JS `number`
intermediate — so passing a decimal string *in* is strictly safer than
passing a `number`, not a compromise.

**One real arithmetic fix required:** `liquidity.service.ts`'s offer sort
(`all.sort((a, b) => a.priceUsd - b.priceUsd)`) does live subtraction on
`priceUsd` for ordering purposes. With `priceUsd: string`, this needs an
explicit `Number(a.priceUsd) - Number(b.priceUsd)` — float precision in a
*sort comparator* is immaterial (it only needs correct relative order, not
an exact value), so this is the one place `Number()` coercion is
correct and intentional, called out explicitly rather than left as an
implicit cast.

## Primitives Used or Extended

No new primitive. Corrects the `Settlement` primitive (`PROTOCOL_SPECIFICATION.md`
§1.5)'s `amount` field type from `number` to `string` — a representation
correction, not a shape change: still one scalar field, same name, same
semantics, only the JS/TS type changes to close a real precision bug.
Also establishes the convention — documented at §2.3, not applied
retroactively to code that doesn't exist yet — that any future Intent
payload type (`PaymentIntentPayload`, `SwapIntentPayload`,
`LoanIntentPayload`, `EarnIntentPayload`) carrying a financial amount
follows the same `string`-not-`number` rule when it is actually
implemented.

## Principle Alignment

- **Principle 6 (Infrastructure Neutral):** decimal-string-at-the-boundary
  keeps event contracts and protocol interfaces free of any hard
  dependency on `@prisma/client`/`decimal.js`.
- **Principle 1 (Protocol First):** fixing this at the primitive/spec
  level (`Settlement.amount`, §1.5) rather than only inside one Reference
  Implementation's database, so every future implementation inherits the
  correct representation from day one instead of rediscovering this bug
  independently.

## Specification

| Component | Change |
|---|---|
| `prisma/schema.prisma` | `Offer.priceUsd/priceBrl/minAmount/maxAmount`, `Trade.amount/priceUsd/totalUsd`, `Escrow.lockedAmount`, `User.totalVolumeBtc`: `Float`/`Float?` → `Decimal @db.Decimal(24, 8)` / `Decimal? @db.Decimal(24, 8)`. `User.reputationScore` unchanged. |
| `escrow.service.ts` | `EscrowRecord.lockedAmount`, `CreateEscrowInput.lockedAmount`: `number` → `string` |
| `liquidity.service.ts` | `LiquidityOffer.priceUsd/minAmount/maxAmount`: `number` → `string`. `OfferRow` fields: `Prisma.Decimal` (internal, converted to `string` in `mapOfferToLiquidityOffer`). `matchOrder()`/`findBestMatch()`'s `amount` param: `number` → `string`. Sort comparator: explicit `Number()` coercion, documented as sort-only. |
| `event-bus.ts` | `OpenP2PTradeCreatedEvent.amount/priceUsd`, `SettlementEscrowCreatedEvent.lockedAmount`, `LiquidityOfferCreatedEvent.priceUsd`: `number` → `string` |
| `PROTOCOL_SPECIFICATION.md` §1.5 | `Settlement.amount: number` → `string` |
| `PROTOCOL_SPECIFICATION.md` §2.3 | Convention note added for future Intent payload amount fields |
| `DATABASE.md` | `Offer`/`Trade`/`Escrow`/`User` model listings updated to `Decimal` |

## Backward Compatibility

`protocolVersion` bump recommended. Per `BACKLOG.md`, this is
pre-Implementation-Freeze work with no live production data — the
`Float → Decimal` column change is additionally a safe, lossless
direction for Postgres even if dev/test data existed (`ALTER COLUMN ...
TYPE DECIMAL` widens a stored finite float value without further loss).
**This environment has no reachable Postgres instance** — `schema.prisma`
and `DATABASE.md` are updated as the source of truth, but `npx prisma
migrate dev` could not actually be run here to generate/apply the
migration. Whoever next has a connected database must run that migration
before this schema change takes effect anywhere real.

## Reference Implementation Plan

Applied directly in this pass, verified with `npm run build` (TypeScript
compiler, not just visual review) since no HTTP routes or tests exist yet
to exercise these code paths end-to-end — confirmed zero external callers
of `escrowService.createEscrow()` / `liquidityRouter.matchOrder()` /
`findBestMatch()` before changing their signatures (`app.ts`'s routes for
these are not wired up), so this change has zero live blast radius beyond
the two service files and the event contract types themselves.
