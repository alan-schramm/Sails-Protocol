# @sails/example-simple-wallet

The dogfooding test for `@sails/sdk` (docs/TODO.md §25): the smallest
real wallet integration of the SDK, written using **only its public
API** — no reaching into this monorepo's internal services, no mocks.
It runs the real golden path against a real local Sails node:

```
register (seller) → register (buyer) → publish offer → discover offer
  → open trade → chat → create + lock escrow → mark payment sent
  → release escrow
```

The question this answers: **can a wallet developer integrate this SDK
in under 15 minutes?** Read `src/index.ts` top to bottom — it's ~140
lines including comments, uses 12 SDK methods, and needs nothing beyond
what `@sails/sdk`'s own types export.

## Run it

1. Start a Sails node (from the repo root):
   ```
   npm run dev
   ```
2. In a second terminal, from the repo root:
   ```
   npm run build -w @sails/sdk
   npm run start -w @sails/example-simple-wallet
   ```

You should see all 9 steps print and finish with:
```
Done — full golden path completed using only @sails/sdk's public API.
```

To point this at a different node (e.g. a staging deployment), set
`SAILS_BASE_URL`:
```
SAILS_BASE_URL=https://staging.example.com npm run start -w @sails/example-simple-wallet
```

## What this is *not*

This is not a UI. There's no wallet screen, no key storage, no error
recovery beyond a single clear message pointing back at the
prerequisite. Real wallets (see `packages/sails-ui` for what a full
screen-by-screen integration looks like) need all of that — this
example exists purely to prove the SDK's public surface alone is
enough to drive the entire protocol, without shortcuts.

## A real finding from writing this

The offer below is published at an aggressively low price
(`priceUsd: '0.01'`) on purpose, not arbitrarily. `liquidity.discover()`
orders results by price ascending and hard-caps at 10
(`liquidity.service.ts`'s `getOffers()`, `take: 10`, no pagination
parameter exists on the route or the SDK today). The first version of
this example priced the offer realistically (`'1.00'`) and it silently
failed to appear in `discover()` results at all, once this repo's own
local dev database — used across dozens of E2E runs — accumulated more
than 10 cheaper active offers for the same asset/side. A real wallet
integrating against a genuinely active marketplace will hit the exact
same wall. Pricing low here works around it for this demo; it does not
fix the underlying gap — see docs/TODO.md §25 for the real fix this
surfaced.
