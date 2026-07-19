# @sails/ui

Reference UI for the Sails P2P Trading SDK. Structural flow built first,
then given the real Satsails brand identity directly (2026-07-18) —
black + orange, light and dark theme, orange constant across both. See
`docs/TODO.md` section 11.

## What this is

10 screens, fully navigable, real routing (`react-router-dom`):
Marketplace, Offer Detail, Trade (chat + escrow state machine), Login,
Profile, Publish Offer (3-step wizard), Trade History, Admin Dashboard,
Manage Offers, Disputes.

**Publish Offer** (`PublishOffer.tsx`, `/profile/new-offer`): a 3-step
wizard matching the Binance P2P ad-posting flow, requested directly with
a reference screenshot — Definir tipo e preço → Definir valor e método →
Definir condições. Every field that reaches the final `Offer` object
maps onto the real backend's `CreateOfferInput`
(`liquidity.service.ts`, checked before building this): asset, side,
priceUsd, priceBrl, minAmount, maxAmount, paymentMethod, paymentDetails,
network, description, requiresKyc. Two things are honestly not backed
by that real shape: "Tipo de Preço: Flutuante" (a market-pegged price —
`liquidity.service.ts` has no live FX/price-feed integration at all,
selectable for fidelity to the reference screenshot but disabled with a
tooltip explaining why) and `priceUsd` itself when pricing in a non-USD
currency (derived via `lib/currency.ts`'s new `ILLUSTRATIVE_FX_TO_USD`,
same "illustrative, not live" honesty boundary `AMOUNT_PRESETS` already
uses). `lib/offersStore.ts` persists a published offer to
`localStorage` (same pattern Marketplace's filters already use) layered
on top of the seed `MOCK_OFFERS` — `Marketplace`/`Profile`/`OfferDetail`
all read through it now, so a just-published offer shows up everywhere
immediately. No `POST /v1/liquidity/offers` call happens — see this
file's own `// TODO: replace with @sails/sdk liquidity.createOffer()`
comment. Verified live in browser: full 3-step flow, validation on
under-filled steps, the published offer appearing correctly in
Marketplace, Profile, and its own detail page with the right
side/price/limits.

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

**Agent QVAC surface** (`src/components/agent/`, `src/lib/qvacAgent.ts`):
reflects the real `QvacAgentProvider`/`BuyerAgent`/`SellerAgent`
(`src/modules/open-agents/*.ts`) — a real local LLM (`@qvac/sdk`,
llama.cpp, no cloud dependency) that today only runs inside the demo
script and `core/intent-engine.ts`'s own validation. No HTTP route
exposes it to a browser yet, so this is honestly mocked (latency +
heuristic parsing, not a live model call) — see `qvacAgent.ts`'s own
comment for exactly what a real route would need to wrap.
- `AgentIntentionPanel` (Marketplace, now "🤖 AI Negotiator"): natural-
  language goal → mocked structured trade intent, reflecting
  `BuyerAgent.requestTradeIntent()`/`SellerAgent.proposeOffer()`. Once
  generated, the panel exposes a bounded delegation mandate (quantity,
  limit price, deadline, tolerance, and a Negotiation Profile —
  Conservative/Balanced/Aggressive/Instant, `src/lib/aiNegotiator.ts`) —
  the user always hands the agent a mandate, never open-ended control.
  "Delegar para IA" starts a client-side simulation of the negotiation
  (status timeline, an "Agent Strategy" readout, a converging "Melhor
  oferta"), with a permanent "🛑 Parar Agente / Assumir Controle" button
  that halts it at the current step — the user can always take back
  control. This is a UI simulation only: no backend accepts a mandate
  shaped like this yet (see Next steps).
- `AgentRiskCard` (Trade page): mocked risk assessment reflecting
  `qvacAgentProvider.assessIntentRisk()`, the real step that runs before
  Intent coordination (RFC-012).

**Crypto-Native Agent boundary (RFC-016,
`docs/rfcs/RFC-016-qvac-crypto-native-agent-boundary.md`):** both
components' `InfoTooltip` copy states this directly — QVAC only ever
acts on digital assets already in the wallet, via WDK. It never calls a
banking API and never touches PIX or any other fiat rail; that
conversion is a regulated on/off-ramp provider's job, entirely outside
this protocol. The one negotiation step that names a fiat action
("Aguardando pagamento") is always something the human counterparty
does — the agent only waits for and observes it.

**Scam-prevention warnings (RFC-017,
`docs/rfcs/RFC-017-timeline-and-social-engineering-agent.md`):**
`ChatWindow`/`ChatMessage` render a `RISK_WARNING` message type — the
same name and shape the real backend's WS protocol uses
(`chat.routes.ts`'s broadcast of `agents.social_engineering.risk_detected`).
The real backend detector (`SocialEngineeringAgent.evaluate()`, QVAC via
`assessSocialEngineeringRisk()`) is real code, off by default
(`config.features.socialEngineeringDetection`) — but this UI has no live
connection to it. `src/lib/socialEngineering.ts`'s `detectRiskLocally()`
is a plain keyword regex standing in for that real QVAC call, purely so
`Trade.tsx`'s chat has something to react to; it detects the same two
patterns the real agent detects today (`off_channel_migration`,
`payment_instruction_change` — try sending "vamos falar no whatsapp" or
"nova chave pix" in the demo chat). Verified in browser: both patterns
fire correctly, a plain message doesn't false-positive.

**Chat image/video attach** (`ChatWindow`/`ChatMessage`): the 📎 button
creates a local `URL.createObjectURL()` blob — the file never leaves the
browser tab, nothing is sent "via Pears" yet. `ChatWindow.tsx`'s own
comment spells out what's actually missing on the real backend: an
upload/storage step (`Message.content` is Postgres text, not a place for
a raw video blob) and a Pears event kind carrying media (today's
WS→Pears relay in `chat.routes.ts` only forwards plain text). `msgType`
itself needs no migration — it's already a free-form `String` in
`prisma/schema.prisma`.

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

A second one, found the same way while adding the Agent QVAC panel:
`AgentIntentionPanel`'s collapsible header was a `<button>` wrapping an
`InfoTooltip`, which renders its own `<button>` — invalid HTML (a button
can't contain a button) and a real interaction bug, since clicking the
info icon would bubble up and also toggle the whole panel closed. The
browser's console flagged it as a React DOM-nesting warning; `tsc` had
no opinion, since it's valid TypeScript. Fixed by pulling `InfoTooltip`
out to be a sibling of the toggle button instead of a descendant.

## Three real UX bugs found and fixed (asked directly: "tem erros de UX?")

None of these were caught by `tsc`/`npm run build` — all three are
runtime navigation/state bugs, found by actually clicking through the
full offer → login → trade flow, not by the type checker.

1. **Any offer landed on the same hardcoded trade.** `OfferDetail`'s
   "Iniciar Trade" always navigated to `/trade/trade-a1b2c3d4` — the
   `MOCK_TRADE` id — regardless of which offer or amount was picked.
   Browsing the STX offer and starting a trade landed on a screen
   showing BTC, a different amount, and a different counterparty. Fixed
   by `src/lib/buildTrade.ts`'s `buildTradeFromOffer()`, which
   constructs a real `Trade` from the offer + amount passed through
   `navigate()`'s router state; `Trade.tsx` uses it when that state is
   present and falls back to `MOCK_TRADE` only for direct/bookmarked
   navigation (no offer to build from) — an intentional fallback, not
   the bug. Also swapped `Trade.tsx`'s hardcoded `formatBrl()` for
   `formatByCurrency(trade.totalBrl, trade.offer.fiatCurrency)`, since a
   trade built from a non-BRL offer needs the right currency symbol.
2. **Login lost all context.** `Login`'s `handleConnect()` always
   navigated to `/`. An unauthenticated user redirected here from
   `OfferDetail`'s "Iniciar Trade" would connect, land on the
   Marketplace, and have to re-find the offer and retype the amount.
   Fixed with a standard return-to pattern: `OfferDetail` passes
   `{ from: location.pathname, amount }` in `navigate()`'s state when
   redirecting to `/login`; `Login` reads it back and navigates to
   `from` (forwarding `amount`) instead of always `/`; `OfferDetail`
   prefills its amount field from that returned state on mount.
3. **`AgentIntentionPanel` and the offer grid never referenced each
   other.** Delegating a mandate to the AI Negotiator never filtered or
   highlighted any real offer, and picking an offer manually never
   referenced anything from the mandate — two parallel entry points to
   the same goal that felt bolted together rather than one flow. Fixed
   with a new `onIntentGenerated` prop: as soon as QVAC parses a goal
   (before the user even delegates), `Marketplace` narrows its own
   asset/side/currency filters to match, so the offer grid updates
   live. The generated-intent card also gained a "Ver ofertas
   correspondentes no Marketplace ↓" link that scrolls to the (now
   filtered) grid (`id="marketplace-offer-grid"`).

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
6. A real `POST /v1/agents/...` route wrapping
   `qvacAgentProvider.generateTradeIntent()`/`.generateOfferIntent()`/
   `.assessIntentRisk()`, to back `AgentIntentionPanel`/`AgentRiskCard`
   with an actual local LLM call instead of `qvacAgent.ts`'s heuristic mock.
7. Real media messages: an upload/storage endpoint plus a Pears event
   kind carrying a media reference, to back the chat's 📎 attach button
   with something beyond a local, never-transmitted blob URL.
8. A real `NegotiationIntent`-accepting backend for the AI Negotiator's
   delegation mandate — today `src/lib/aiNegotiator.ts`'s status
   timeline and Strategy panel are a client-side simulation with no
   agent actually running.
9. Real `RISK_WARNING`: `new WebSocket('/v1/openp2p/chat?token=...')`
   already delivers this message type once real chat (item 3) is wired
   — nothing extra is needed on the backend side, that route already
   broadcasts it (RFC-017). What's needed is only replacing
   `src/lib/socialEngineering.ts`'s keyword regex with just listening
   for the real WS message.
10. A real `POST /v1/liquidity/offers` call (`liquidity.createOffer()`)
    instead of `lib/offersStore.ts`'s `localStorage` layer, once auth
    (item 2) is real — `PublishOffer.tsx`'s wizard already builds the
    exact `CreateOfferInput` shape that call needs. A real live-rate
    source would also let "Tipo de Preço: Flutuante" stop being disabled.
