# @sails/ui

Reference UI for the Sails P2P Trading SDK. **Structural skeleton, not
the final product** — see `docs/TODO.md` section 11 for the plan this
follows: build the real navigation/state flow here first (Claude Code),
apply the final visual identity later (Lovable), keep the two phases
separate so a design change never risks the trading logic underneath it.

## What this is

9 screens, fully navigable, real routing (`react-router-dom`), plain
Tailwind (no brand colors, no design system yet — deliberate, see below):
Marketplace, Offer Detail, Trade (chat + escrow state machine), Login,
Profile, Trade History, Admin Dashboard, Manage Offers, Disputes.

## What this is not

- **Not styled.** No WDK/Binance-inspired dark+orange identity — that's
  an explicit later pass. `tailwind.config.js` has its own comment about
  this; don't add brand colors here without also updating that comment.
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
a lazy `useState` initializer instead. `npm run build` (type-checking
only) never caught this — it's a runtime effect-ordering issue, found
by actually clicking through the app in a browser.

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

1. Apply the real visual identity (WDK/Binance-inspired dark+orange) —
   a themed pass, ideally via design tokens so it's a find-and-replace,
   not a rewrite.
2. Swap `src/data/mock.ts` reads for real `@sails/sdk` calls, route by
   route (every site is already marked with a `// TODO` comment).
3. Real auth: `identity.authenticate()`'s Ed25519 flow
   (`packages/sails-sdk/src/modules/identity.ts`) instead of the mocked
   `AuthContext.login()`.
4. Real chat: `new WebSocket('/v1/openp2p/chat?token=...')` instead of
   `ChatWindow`'s local-only `onSend`.
