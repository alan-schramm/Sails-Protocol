# @sails/ui

Reference UI for the Sails P2P Trading SDK. Structural flow built first,
then given the real Satsails brand identity directly (2026-07-18) —
black + orange, light and dark theme, orange constant across both. See
`docs/TODO.md` section 11.

## What this is

9 screens, fully navigable, real routing (`react-router-dom`):
Marketplace, Offer Detail, Trade (chat + escrow state machine), Login,
Profile, Trade History, Admin Dashboard, Manage Offers, Disputes.

**Design system** (`src/index.css`, `tailwind.config.js`): CSS custom
properties define the full palette for both themes — `:root` (light)
and `:root.dark` (dark), toggled via `ThemeContext`
(`src/context/ThemeContext.tsx`), defaulting to the visitor's system
preference and persisted to `localStorage`. Orange (`--color-orange`,
`#f97316`) is the one constant across both themes. A handful of
component classes (`.card`, `.btn-primary`, `.btn-ghost`, `.input-field`,
`.pill-active`/`.pill-inactive`) live in `@layer components` so a future
white-label partner edits ~8 rules, not every component file — the
whole point of building the structure and the identity as separable
layers, even though both are now real.

**Marketplace filters** (`src/components/marketplace/`): a Binance
P2P-style advanced filter system, requested directly —
- `AssetPicker`: search-based asset selector (not a lateral pill row —
  doesn't scale once more assets exist).
- `CurrencyPicker`: fiat currency filter (BRL/USD/EUR/...). The real
  backend only models one local-fiat price (`Offer.priceBrl`,
  `prisma/schema.prisma`) — `FiatCurrency`/`Offer.priceFiat`
  (`src/types.ts`) generalize that for the UI, honestly flagged as
  presentation-layer in that type's own comment, not a backend claim.
- `FilterPanel`: a drawer with the exact requested option set (save
  filter, negotiable-only, high-reputation-only, previously-traded,
  amount presets by currency, payment time limit, payment method,
  country/region, sort by) — each with an "i" `InfoTooltip` explaining
  what it does. `negotiableOnly`/`highReputationOnly`/
  `previouslyTradedOnly` filter against UI-only demonstration fields on
  `Offer` (`blockedRelationship`, `tradedWithCurrentUser`) — a real
  version needs a real block-list and trade-history join, neither built
  in the backend yet; flagged in `types.ts`'s own comments, not hidden.

## What this is not

- **Not wired to the real backend.** Every screen reads `src/data/mock.ts`.
  No `@sails/sdk` call happens anywhere in this package yet. Every read
  site that will eventually become a real call has a
  `// TODO: replace with @sails/sdk ...` comment naming the real method
  and route.
- **Not where WDK/Pears code runs.** `wdk-settlement.provider.ts` and
  `pear.service.ts` (the real signing/P2P code) are server-only — a
  browser can never import them directly (they hold seed material /
  need `hyperdht`, Node-only). This UI only ever talks to the real
  backend's HTTP/WS routes, never those modules.

## Real bug found and fixed while testing this in a browser

`AuthContext`'s login state used to be read from `localStorage` inside
a `useEffect`. On a hard navigation straight to `/profile`, React runs
effects child-to-parent on mount — `Profile`'s own `if (!user)
navigate('/login')` effect fired before `AuthProvider`'s effect had a
chance to populate `user`, bouncing a genuinely logged-in session back
to the login screen. Fixed by reading `localStorage` synchronously via
a lazy `useState` initializer instead — the same pattern `ThemeContext`
uses for the same reason (see its own comment). `npm run build`
(type-checking only) never caught either — both are runtime
effect-ordering issues, found by actually clicking through the app in a
browser, not by the type checker.

## Running it

```bash
npm run dev -w @sails/ui       # http://localhost:5173
npm run build -w @sails/ui     # type-check + production build
```

The dev server proxies `/v1`/`/api` to `http://localhost:3000` (the
real backend) — not used by anything yet, but means swapping a mock
data read for a real `fetch`/`@sails/sdk` call later doesn't also
require touching `vite.config.ts`.

## Next steps (not done here)

1. Swap `src/data/mock.ts` reads for real `@sails/sdk` calls, route by
   route (every site is already marked with a `// TODO` comment).
2. Real auth: `identity.authenticate()`'s Ed25519 flow
   (`packages/sails-sdk/src/modules/identity.ts`) instead of the mocked
   `AuthContext.login()`.
3. Real chat: `new WebSocket('/v1/openp2p/chat?token=...')` instead of
   `ChatWindow`'s local-only `onSend`.
4. A real multi-fiat price field on `Offer` (backend), or a real FX-rate
   source, to back `CurrencyPicker`/`AMOUNT_PRESETS` with something
   other than illustrative numbers.
5. A real block-list model and trade-history join to back
   `negotiableOnly`/`previouslyTradedOnly` for real.
