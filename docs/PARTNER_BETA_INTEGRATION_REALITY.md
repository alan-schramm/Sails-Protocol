# Partner Beta / Integration Reality Discovery

**Type:** Production Reality / Developer Experience / Integration
Architecture / Partner Beta Readiness. **Status:** discovery/evidence
only. No pagination, cursor system, new provider APIs, quote primitive,
webhook framework, capability-discovery API, bootstrap registry, node
federation, WalletAdapter, SettlementProvider, UI, retry engine, device
recovery, deployment, or partner-specific code authorized or built by
this document.

**Origin:** CTO mission, 2026-09-08. Every finding below was verified
directly against the current repository state (file paths, line
numbers, and doc citations given throughout) — nothing here is
extrapolated from what "should" be true.

---

## 1. Scope

Two properties investigated:

> A competent external developer who has never spoken with the Sails
> team should be able to integrate the Sails P2P Trading SDK into an
> existing wallet, fintech, or web buy/sell service using only the
> published package, documentation, examples and supported
> infrastructure.

> A user should be able to enter, leave and resume a P2P transaction
> without needing to understand Sails, transport, settlement
> providers, identity internals or recovery machinery.

The discipline throughout: **make integration reality pass the test,
not the test pass.** Where evidence shows a real gap, it is reported as
a gap, even where it is inconvenient or contradicts prior positioning
language.

---

## 2. Property

Restated for clarity, both halves preserved exactly as given: (a) a
stranger-developer property (self-service integration, zero private
assistance), (b) a user-resilience property (a temporary loss of
connectivity/state must not force the user to guess economic state).
Both are investigated below with real evidence, not assumed satisfied
because documentation *describes* an intended experience.

---

## 3. Existing developer journey

**Canonical path, as documented** (`README.md`'s own "canonical
developer journey," Missão 07.4): README → `docs/GETTING_STARTED.md` →
`examples/simple-wallet` → `docs/SDK_GUIDE.md` → `docs/API_REFERENCE.md`
→ `docs/API_STABLE.md`.

- **Is it possible to start from npm alone?** No — the very first step
  in `docs/GETTING_STARTED.md` is `docker compose up -d --build`
  (Postgres + Redis + the server), run from a clone of this
  repository. `npm install @satsails/p2p-trading-sdk` only happens in
  step 3, *after* a full backend is already running. A developer
  cannot "just npm install and go" — they must first stand up an
  entire backend stack. **DX GAP / PRODUCTION INFRASTRUCTURE GAP.**
- **What infrastructure must exist?** A running Sails backend instance
  (Fastify server + Postgres + Redis), reachable at a `baseUrl`. Every
  documented example (`README.md:356`, `docs/GETTING_STARTED.md:44`,
  `docs/SDK_GUIDE.md:418`) hardcodes `http://localhost:3000` — **there
  is no documented public, Sails-operated endpoint anywhere in this
  repository.** See §4 for the full implication.
- **What must the developer obtain from Sails?** Nothing, to run the
  documented `docker compose` path — it's fully self-contained
  (`docker-compose.yml`'s defaults, including `MOCK_ESCROW=true`).
  Nothing tribal is required for that path specifically.
- **What secret/config must be supplied externally?** For the `MOCK`
  path: none. For any real settlement rail: real infra per
  `docs/GETTING_STARTED.md`'s own settlement-provider table —
  `WDK_SEED_PHRASE` + Sepolia RPC for `WDK_USDT_EVM`, real testnet BTC
  for `MULTISIG`, a pinned Ark Labs `mutinynet` endpoint for
  `LIGHTNING_HODL`. All disclosed, none hidden — **NO GAP** on
  disclosure, but each is real operational setup work, not zero-config.
- **First undocumented-question point:** "how do I reach the same
  liquidity pool as everyone else, not just my own local database?" —
  **no document anywhere answers this** (§4). This is the single
  earliest point in the journey where a real partner would have to ask
  the Sails team directly, contradicting the property under test.
- **Examples using MOCK or non-production behavior:**
  `examples/simple-wallet` runs entirely against `MOCK_ESCROW=true`
  (the `docker-compose.yml` default) — `release()` "works" locally only
  because the flag routes every escrow type to `MOCK` regardless of the
  `type` stored on the row, explicitly flagged as a footgun in
  `docs/GETTING_STARTED.md`'s own "Local dev note." **Disclosed, not
  hidden — NO GAP** on honesty, but it does mean the one continuously-
  run golden path never exercises a real settlement rail.
- **Facade methods that don't work:** exactly one,
  `IntentFacade.negotiate()` (`packages/sails-sdk/src/intent-facade.ts:146-150`),
  which throws `SailsNotImplementedError` with a specific, correct
  pointer to the real, working alternative
  (`openp2p.chat(tradeId)`). `releaseAsset()`/`dispute()` only throw for
  the legitimate precondition "no Escrow exists yet on this Trade,"
  not because they're unimplemented — verified directly, both call the
  real routes. **KNOWN RESIDUAL, correctly disclosed — not a hidden
  defect.**
- **Browser/Node/React Native differences:** not exhaustively audited
  in this pass (out of the mission's explicit budget) — `SailsClient`'s
  transport layer uses `fetch`/`WebSocket`, both broadly polyfilled
  across those three environments; no environment-specific code path
  was found to contradict this in the files read. Flagged as **NOT
  FULLY AUDITED**, not asserted safe.
- **What should the golden path be for a real partner?** Today's golden
  path (self-hosted node, `MOCK` escrow, own isolated database) proves
  the SDK's *API surface* works end-to-end. It does **not** prove a
  partner can join the *same economic network* Satsails' own users are
  on — that is a structurally different, currently unaddressed
  question (§4).

**Verdict for this section: B.** The documented path is honest, mostly
internally consistent, and self-hosting works — but it stops one level
short of proving what a real partner actually needs (shared network
entry), and contains one confirmed stale claim (§5's pagination
finding).

---

## 4. Infrastructure / bootstrap model

**The concrete question:** in production, what does a partner put in
`new SailsClient({ baseUrl: ... })`?

**Investigated directly, not assumed:**

- Every code example in this repository uses `http://localhost:3000`.
- `examples/simple-wallet/README.md:36-40` shows the *mechanism* for
  pointing elsewhere exists (`SAILS_BASE_URL=https://staging.example.com`)
  — but this is a placeholder URL, not a real, reachable, documented
  endpoint.
- A repository-wide search for a public API host (`satsails.com`,
  hosted API references, multi-tenant language) found **no evidence of
  a publicly reachable, Sails/Satsails-operated production endpoint**
  anywhere in `docs/`.
- Cross-instance mechanisms that do exist (`docs/DATABASE.md`'s
  `sails:cross-instance-events` Redis Pub/Sub channel,
  `eventBus.enableCrossInstanceFanout()`, `docs/DEPLOYMENT.md`'s
  discussion of running multiple server processes) are **horizontal
  scaling for one operator's own deployment** — multiple processes
  sharing one Postgres/Redis — **not** federation between two
  independently-operated Sails nodes. Confirmed by direct reading:
  nothing in this codebase lets two separately-deployed Sails instances
  share offers, identities, or reputation.

**Verdict on the four candidate topologies:**

- **Model A (Sails-operated public infrastructure):** does not exist
  today, documented or otherwise. (Session memory: the one real AWS
  deployment underway is explicitly non-public, a self-funded mainnet
  rehearsal ahead of an external audit — not a partner-facing shared
  endpoint.)
- **Model B (partner-operated Sails node):** this is what's actually
  documented and works — but it produces an **isolated economic
  island**. A partner running `docker compose up` gets their own empty
  Postgres database: no shared offers, no shared participants, no
  shared reputation with Satsails' own users or any other operator.
- **Model C (both):** not implemented — no mechanism connects a
  partner's Model-B island to a Model-A hub, because no Model-A hub is
  documented to exist.
- **Model D (another topology):** none found implied by the
  architecture beyond Model B's single-operator shape.

**A direct, load-bearing contradiction found:** `docs/PROJECT_CONTEXT.md`
(lines ~110-117) states the intended architecture explicitly: *"a
wallet that integrates Sails becomes a participant in one shared,
interoperable network, not the operator of its own isolated instance."*
The actual, current, documented integration path does exactly the
opposite — it makes every integrator the operator of their own isolated
instance. **This is a real ARCHITECTURAL GAP, not a documentation
wording issue** — the code and the stated positioning genuinely
disagree about what happens when a second party integrates.

**Per-model check requested by the mission** (discovery, DHT, shared
liquidity, identity, reputation, connectivity, event/history access,
settlement, node trust, availability, interoperability, operator
disappearance) — answered honestly for the *only* model that actually
exists (B): discovery/liquidity/identity/reputation are all
**local-only, per-deployment**; P2P connectivity (Pears/HyperDHT) is
genuinely serverless and *could* connect peers across two different
operators' nodes at the transport layer, but the *application* layer
(offers, trades, identity registration) has no cross-node protocol to
make that meaningful; settlement is per-rail, unaffected by this gap;
node trust/availability/operator-disappearance questions are moot
because there is no multi-operator topology to reason about yet.

**Verdict for this section: STOP.** This is not a "pick the best of
four options" situation — none of the four options is actually
available to a real partner today, and the one that is documented
(Model B) contradicts the protocol's own stated purpose. A future
mission needs to design (not this one) how a second real operator
joins the same economic network as Satsails, or explicitly revise the
"shared network" positioning claim if that is not actually the near-term
plan. **This is the single most severe finding in this document** —
classified as a **Beta blocker**, not merely a Production blocker: even
a *beta* partner integration cannot demonstrate joining a shared network
today, because no such join mechanism exists.

---

## 5. Liquidity discovery

**The documented finding, verified directly against current code:**
`examples/simple-wallet/README.md:51-65` states, as a "real finding
from writing this," that `liquidity.discover()` "hard-caps at 10" with
"no pagination parameter on the route or the SDK today," and that the
example prices its own offer unrealistically low (`priceUsd: '0.01'`)
to work around it.

**This claim is currently false — a real, confirmed DOCUMENTATION
GAP, not a live architectural gap.** Direct verification:

- `src/modules/open-liquidity/liquidity.service.ts:50-106` defines
  `OfferPagination` (`limit`/`offset`) and `normalizePagination()`,
  clamping `limit` to 1-50 (default 10).
- `getAggregatedOffers()` (same file, ~line 458) computes `hasMore` and
  fetches `offset + limit` from each provider before slicing — a real,
  working deep-pagination implementation, not a stub.
- `src/modules/open-liquidity/liquidity.routes.ts:28-32,84` — the route
  accepts `limit`/`offset` as validated, coerced query params, capped
  at 50.
- `packages/sails-sdk/src/modules/liquidity.ts:10,53,83-93` — `discover()`
  accepts `limit`/`offset`, plus `paymentMethod`/`priceMin`/`priceMax`
  filters, and the backend returns `total`/`hasMore` metadata.

**This means the underlying property the mission asks about —**

> A valid economically relevant offer must not become practically
> undiscoverable merely because more than N other active offers exist.

**— is structurally addressed today**, via a combination the mission
explicitly asked to be compared rather than assumed: real
offset/limit pagination (bounded, capped at 50 per page, not
unbounded) *plus* price/payment-method filtering, which lets a caller
locate a *specific* known offer without paging through the whole book
at all. `examples/simple-wallet/src/index.ts:88` still hardcodes the
`'0.01'` workaround and its own README still describes the pre-fix
state — **stale example/documentation, not a stale mechanism.**

**A/B/C beta-suitability verdict: B.** The mechanism is real and
sufficient for beta-scale discovery (bounded pages, real filters,
`hasMore` signaling). Not **A**, because: aggregation across multiple
providers is explicitly documented as not globally re-paginated (a
known, disclosed limitation, `docs/TODO.md` §25's own fix notes), and
because the one continuously-run example still demonstrates the
*old*, pre-fix workaround rather than the real mechanism — a partner
reading the example today would form an incorrect, overly pessimistic
picture of a solved problem. **DOCUMENTATION GAP, not a beta blocker.**

---

## 6. Professional providers

**Actors, as specified:** A (person selling BTC), B (wallet exposing
P2P to its own users — the primitives clearly already serve this,
confirmed throughout the rest of this document), C (a professional
liquidity provider or web buy/sell service already trading BTC/USDT/
DePix via web/API).

**Dispositive question:** can Actor C participate through existing
Sails semantics without a second, provider-specific marketplace?

Checked directly against `prisma/schema.prisma`'s `Offer` model
(lines 143-173) and `trade.service.ts`'s `createTrade()`:

| Need | Exists today? | Evidence |
|---|---|---|
| Quote (price) | Yes | `Offer.priceUsd`/`priceBrl` |
| Quote **expiry** | **No** | No `expiresAt`/TTL field on `Offer` at all — a price is either active or not, with no time-bound validity window |
| Inventory (total available, not just per-trade bounds) | **No** | `Offer.minAmount`/`maxAmount` bound a *single* trade's size; nothing tracks remaining aggregate inventory across multiple concurrent trades against the same offer |
| Min/max | Yes | `Offer.minAmount`/`maxAmount` |
| Payment method | Yes | `Offer.paymentMethod`/`paymentDetails` |
| Spread/price | Yes (static) | Same as quote — no dynamic/live-repricing primitive |
| Availability (on/off) | Yes | `Offer.status` (`ACTIVE`/etc.) |
| Automated acceptance | **Always on, not optional** | `createTrade()` (`trade.service.ts:53-133`) transitions straight to an `ACTIVE` Trade the instant a buyer initiates against an offer — there is no manual-review/accept-or-reject step available to the offer owner at all. A provider wanting risk review before commitment cannot express that today. |
| Webhook/event push | **No** | `docs/API_REFERENCE.md:397-398` mentions webhooks only as "API consumers using webhooks will see these same names" for already-existing internal event names — no outbound webhook dispatcher exists in this codebase. The only real-time channel is the WebSocket (`/ws`), which assumes a persistent client connection, not a natural fit for a backend/OTC service. |
| Partial inventory | **No** | Same gap as "inventory" above — no concept of an offer's remaining capacity after a partial fill |
| Settlement status | Yes | `GET /v1/settlement/escrow/:id`, real, already used throughout this document's other sections |
| Cancellation | Yes | `Offer.status`, `Trade` cancellation path (`updateStatus` to `CANCELLED`) |
| Reconciliation | Yes | Real, extensively hardened this session (`reconciliation.service.ts`, the WDK safety work) — see §9 |

**Answer to the dispositive question: no, not without gaps — but the
gaps are narrow and named, not systemic.** A professional provider can
publish an offer, get discovered (§5), have a trade initiated against
them, and settle — the *trade lifecycle itself* is fully professional-
provider-agnostic (same primitives Actor B's wallet users get). What's
missing is specifically the **market-making** layer around it: no
quote expiry, no live inventory decrement, no pre-commit review gate,
no push notifications. These are real, but they are additive gaps on
top of a working foundation, not evidence the whole model needs
provider-specific marketplace semantics invented.

**Classification: PRODUCTION INFRASTRUCTURE GAP** (quote expiry,
inventory, webhooks) **+ ARCHITECTURAL GAP** (no pre-commit review
option — this one is a real semantic gap, not just missing
infrastructure). **No new Core primitive proposed here** — these read
as `Offer`/`Trade` extensions and a genuinely new webhook-delivery
mechanism, not a parallel marketplace.

**Verdict for this section: B.** The foundation genuinely works for a
professional provider's *settlement* needs; it does not yet work for
their *market-making* needs.

---

## 7. Wallet vs. service integrations

**Direct question: does the SDK assume the integrator must be a
wallet?**

**No — confirmed directly, not assumed.** `packages/sails-sdk/src/client.ts:42,86`
declares `wallet?: WalletAdapter` — genuinely optional. `requireWallet()`
(line 248) only throws when a *wallet-specific* method
(`getBalance`/`sendTransaction`/`getCapabilities`/`signMessage`/
`getWalletAddresses`) is called without one configured. Every other
surface this document has exercised — identity, liquidity discovery,
trade/chat orchestration, settlement status, reputation — has no
wallet dependency at all.

This means, **structurally**, all three of the requested integration
shapes are possible without violating custody/authority boundaries:

- **Wallet-native integrations** — demonstrated (`examples/simple-wallet`,
  `examples/wallet-integration`'s `RealBitcoinWalletAdapter`).
- **Wallet-connected web services** — structurally supported (a web
  frontend could authenticate a user's own wallet via
  `identity.authenticateWithWallet()` and never touch signing itself)
  but **not demonstrated by any example in this repository.**
- **Backend/service integrations** (no end-user wallet at all, e.g. an
  OTC desk's own backend acting as one economic participant) —
  structurally supported (register an identity with a server-held
  keypair, use the SDK with no `WalletAdapter` at all) but **also not
  demonstrated by any example.**

**Verdict for this section: B (structurally A, evidentially B).** The
architecture already does not force a wallet assumption — a genuinely
good, already-existing property. What's missing is *proof*: no example,
test, or documentation anywhere in this repository exercises the
non-wallet path end-to-end, so a stranger reading only the docs would
reasonably (if incorrectly) conclude a wallet is required, since every
example given is wallet-shaped.

---

## 8. Capability / rail discovery

Preserved distinctions, verified against real evidence rather than
assumed to hold: **WalletAdapter ≠ SettlementProvider**; **wallet
support ≠ network support ≠ asset support ≠ settlement support**;
**provider implementation ≠ provider maturity ≠ production
eligibility.**

**What already exists, confirmed real:**

- `GET /v1/settlement/escrow/:id`'s `data.custodyModel`
  (`docs/API_REFERENCE.md:190`) — a real, per-escrow, distinctly-worded
  custody-topology disclosure string (e.g.
  `client-held-buyer-seller-keys-server-held-arbiter` for MULTISIG),
  `null` when undisclosed, never fabricated. This is a genuine, live
  API-level capability-discovery surface — **not invented for this
  document, already shipped** (2026-08-24).
- `README.md`'s coverage matrix (Wallet Stack targets, Network/Protocol/
  Settlement targets, "Rail readiness" section) — a complete,
  maturity-labeled, honestly-disclosed table of what's `✅ Proven`,
  `🏗️ Implemented, testnet-only`, or `📋 Planned`/`Designed only`.
- `docs/GETTING_STARTED.md`'s settlement-provider table — infra
  requirements, custody model, and status per provider.

**What is missing:** all of the above is **documentation-only,
pre-integration knowledge** — there is no *live API* a running
integrator's code can query at runtime to ask "what settlement
providers/assets/networks does *this specific deployment* currently
support, and at what maturity?" `custodyModel` only appears **after**
an escrow already exists with a chosen `type` — it cannot inform the
*choice* of `type` before creating one. A developer must read the
README's static tables (which describe this repository's own
capabilities, not necessarily what any given partner-operated Model-B
deployment has enabled/configured) to make that choice.

**Explicitly not fabricated:** no `supportedCapabilities()` method is
proposed here merely because it was discussed conceptually — the
finding is narrower: a live, pre-creation discovery surface doesn't
exist, and whether the fix is a new endpoint, an extension of an
existing one, or simply better static documentation is a design
question for later, not decided here.

**Verdict for this section: B.** A real, working capability-disclosure
primitive exists (`custodyModel`) and the static documentation is
honest and detailed — but there is no live, runtime, pre-creation
discovery API. **DX GAP**, not an architectural one.

---

## 9. Restart / offline / resume

Reusing this session's own existing evidence (`docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md`,
`docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md`, `docs/TEST_HARNESS_RELIABILITY.md`'s
unrelated scope, and the `WdkTransferAttempt` remediation merged as
PR #89) rather than re-deriving it, plus direct architecture facts
already established this session (all economic state — `Trade`,
`Escrow`, `Offer`, `User` — is Postgres-backed via Prisma, never held
only in server memory; the one genuinely ephemeral, in-memory-only
identity is the Pears/HyperDHT transport `peerId`, confirmed §2 of
`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`, PR #92).

| Scenario | Persisted truth | Reconstructable | Safe to retry? | Client knows next action? | Depends on operator memory? |
|---|---|---|---|---|---|
| App closes after Trade created | `Trade` row, Postgres | Fully | Yes (re-fetch) | Yes — `GET` the trade by id | No |
| App closes after escrow lock | `Escrow.status`, Postgres | Fully | Yes (re-fetch) | Yes | No |
| App closes after payment-sent | `Escrow.status = PAYMENT_SENT`, Postgres | Fully | Yes | Yes | No |
| Connection drops during settlement | `WdkTransferAttempt` (PREPARED/SUBMITTED/SUBMISSION_UNKNOWN), Postgres | Fully, per this session's own remediation | **Yes, now** — blind retry after an unknown outcome is exactly what PR #89 closed | Partially — the *server* knows not to double-submit; the *client* only sees an eventual success/failure, no special "reconnect and resume" UX exists | No, for the fund-moving boundary specifically |
| Request errors but external op may have happened | Same `WdkTransferAttempt` mechanism | Fully for WDK; **narrower for MULTISIG/LIGHTNING_HODL client-held-key flows**, which rely on `escrow-dual-approval.ts`/`escrow-pending-tx.ts`'s own pending-transaction tracking — real, but not audited fresh in this pass | Yes, per rail's own mechanism | Server-side yes; client-visible UX not specifically designed for this | No |
| Session expires | `auth:session:<token>` (Redis, TTL) expires | The session, not the trade — trade state is unaffected | N/A — re-authenticate | **No automatic client-side recovery** — confirmed, no `refreshSession`/auto-reauth code found anywhere in `packages/sails-sdk`; the developer must catch `401` and call `identity.authenticate()` again manually (`docs/GETTING_STARTED.md`'s own error table) | Yes, in the sense the *developer* must remember to implement this — **DX GAP** |
| Device change | `User.publicKey` persists; no device-specific key concept exists yet (confirmed, `docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` §10) | Trade/Escrow state fully, if the new device has the same signing key | N/A | No dedicated "resume on new device" flow exists — this is the same foundational gap §10 of that document already found (Sails' own identity has no recovery mechanism of its own) | Not operator-dependent, but genuinely unaddressed |
| Wallet offline | N/A — economic state unaffected | Fully | Yes | Yes | No |
| Counterparty offline | N/A — economic state unaffected, chat/negotiation stalls | Fully | Yes | Partially — no explicit "counterparty appears offline" signal found; a caller must infer this from a lack of response | No |
| Provider slow | Escrow status stays at its last confirmed state | Fully | Yes, with the same unknown-outcome handling as above | Server-side yes | No |
| Duplicate callback/request | Idempotency handled per-mechanism — confirmed for the WDK fund-moving boundary this session; not freshly re-audited for every other route in this pass | Mostly | Server-enforced where audited | N/A | No, where audited |
| Browser refresh | Same as "app closes" rows — Postgres-backed state, no client-only economic truth found | Fully | Yes | Yes, if the client re-fetches on load | No |
| Mobile app backgrounds | Same as above; WS reconnect already has backoff+jitter (`WebSocketChannel`, confirmed in this session's own memory of the SDK's network-reliability pass) | Fully | Yes | Yes, WS auto-reconnects and re-`JOIN_TRADE`s | No |
| Process/node restart | All economic state Postgres-backed; per-process sweepers (timelock, dual-approval, reorg sweeps) restart independently per `docs/DEPLOYMENT.md`'s own disclosure — no cross-instance coordination needed for correctness, just redundant work if scaled to N instances | Fully | Yes | N/A (server-side) | No |

**Overall property assessment:** *"A temporary loss of application/
process connectivity must not force the user to guess the economic
state of an in-progress trade"* — **substantially true today for the
fund-moving/settlement boundary specifically**, thanks to this
session's own #56/#58/#59 remediation (not re-litigated here, only
reused). The **one real, disclosed, unaddressed gap** is session-expiry
recovery being entirely manual on the client side, and device-change/
identity-recovery being foundationally unaddressed (already tracked in
`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`, not duplicated here).

**Verdict for this section: B.** The hard part (fund-moving safety) is
demonstrably closed. The soft part (client-side session/device
resumption UX) is a real, disclosed, but bounded gap — not systemic.

---

## 10. Stranger test

**Direct question: is there sufficient evidence today to claim "can
integrate in 15 minutes"?**

**No — and this document does not fabricate a stranger to claim
otherwise.** `examples/simple-wallet`'s own README explicitly states
"this example exists purely to prove the SDK's public surface alone is
enough to drive the entire protocol" — but it was written *by the Sails
team, with full repository knowledge*, run *inside* this monorepo
(`npm run start -w @sails/example-simple-wallet`, a workspace script,
not a standalone `npm install` from a public registry against a
standalone project). No evidence was found anywhere in this repository
of an actual blind test — a developer given only the published
package, public docs, and public examples, with no repo-internal
knowledge and no private explanation.

**Minimum future test defined, not performed here** (per the mission's
own instruction — Discovery only):

```
install (npm install @satsails/p2p-trading-sdk, standalone project)
→ connect (new SailsClient({ baseUrl }) — needs §4's gap resolved first)
→ identify/authenticate
→ discover liquidity
→ initiate trade
→ interact (chat/negotiate)
→ observe settlement state
```

Excluded from what the test subject receives: any private explanation
from the Sails team, repo-internal knowledge, undocumented env
assumptions, or hand-written instructions from the project's own
maintainers — exactly as the mission specifies.

**Classification: NOT DEMONSTRATED.** The example's existing "prove the
SDK's public surface alone is enough" framing is a real, honest, useful
internal dogfooding exercise — it is not the same evidence as a blind
external test, and should not be cited as equivalent. It is also
currently **blocked** on §4's finding: step "connect" has no real
target to connect to beyond `localhost`, which a true stranger,
working entirely from public material, would not have running.

---

## 11. Partner evidence bar

**Preserved distinction, verbatim:** *Satsails Wallet success proves
reference integration viability, not independent cross-wallet
interoperability.* Confirmed accurate by this entire document — every
example, every continuously-run test, and the one real mainnet
rehearsal (`docs/MAINNET_MULTISIG_PROOF.md`) all originate from the
same team, the same repository, the same reference implementation.

**Two evidence bars, kept explicitly distinct as instructed:**

- **Partner Beta** requires, at minimum: an independently maintained
  wallet/service that (a) installs the SDK as an external package, not
  from within this monorepo, (b) uses only the public integration
  surface, (c) participates in *some* shared economic environment with
  at least one other participant not operated by the same team
  (requires §4's gap to be resolved first, even for a beta-scale
  arrangement — e.g., pointing a partner's client at a shared
  staging deployment), (d) discovers or creates a real offer/trade,
  (e) exercises an eligible settlement flow (any rail in
  `docs/GETTING_STARTED.md`'s table, `MOCK` included for beta
  purposes), (f) produces integration evidence someone outside the
  Sails team can independently review (a write-up, a recorded session,
  or a PR to a separate repository).
- **Public Production Claim** requires everything above, plus: a
  *non-MOCK*, production-eligible settlement rail (per `README.md`'s
  own "Rail readiness" — today, none of the four rails is both
  mainnet-proven *and* free of a disclosed structural gap
  simultaneously), a resolved shared-network topology (§4), and the
  Production Readiness Consolidated Gate's own evidence bar (this
  session's own prior mission, `docs/BACKLOG.md`).

**Current status against both bars: neither is met.** No independently
maintained wallet/service exists today that installs this SDK from
outside this repository. This is not a criticism of engineering
quality — it is a simple, verifiable fact: this document found zero
evidence of one anywhere in the repository, issues, or documentation.

---

## 12. User invisibility

Checked the public SDK surface (`packages/sails-sdk/src/*.ts`, method
and type names) against the desired user-facing vocabulary (Buy/Sell/
Pay/Waiting confirmation/Completed/Problem) vs. the internal vocabulary
that should stay below the product layer (Pears/HyperDHT/
SettlementProvider/CapabilityGrant/OpenProof/Transport identity/WDK).

**Findings:**

- **Genuinely well-contained:** none of `Pears`, `HyperDHT`, `WDK`,
  `SettlementProvider`, or `Transport identity` appears anywhere in the
  SDK's *public* method or type names (`identity.*`, `liquidity.*`,
  `openp2p.*`, `settlement.*`, `reputation.*`, `capabilities.*`,
  `peers.*` — even `peers.*` names itself after the P2P *feature*, not
  the underlying `HyperDHT` library). A developer building on the SDK
  never has to import or reference these technology names directly to
  build a working integration — confirmed by every example read in
  this pass.
- **Leaks that remain, one layer below full end-user language (expected
  and appropriate for an SDK, not a defect on its own):** `escrow`,
  `dispute`, `capability`/`CapabilityGrant`, `intent`/`Intent` are all
  real, visible names in the public API (`settlement.escrow.*`,
  `capabilities.register()`, `createIntent()`). This is the correct
  altitude for an *SDK* (protocol vocabulary), but a **product UX**
  built directly on top of these names without its own translation
  layer would leak "escrow"/"dispute"/"capability" straight to an end
  user, which is a real Product/UX concern, distinct from the SDK
  itself. `packages/sails-ui` (a separate concern, explicitly out of
  this document's file scope) is where that translation layer would
  live or already partially lives — not audited here.
- **No final UI designed here, per the mission's own instruction.**

**Verdict for this section: B.** The SDK layer itself is well-behaved —
transport/settlement-provider/identity-internals genuinely do not leak
into its public names. The remaining, expected layer of protocol
vocabulary (escrow/dispute/capability/intent) is exactly where a
product's own UX layer needs to do translation work — not yet verified
whether it currently does, since that lives in a different package.

---

## 13. Production Readiness mapping

Cross-checked against the Production Readiness Consolidated Gate
registered this session (`docs/BACKLOG.md`, PR #93) — no category
duplicated, only mapped:

| This document's finding | Existing Gate category |
|---|---|
| §4 shared-network topology gap | Deployment assumptions; independent integration evidence |
| §5 liquidity discovery (resolved, doc stale) | Not a Gate category — a documentation-maintenance item, not a readiness gap |
| §6 professional-provider gaps (quote expiry, inventory, webhooks) | Provider production eligibility (partially); this is new, narrower detail under an existing category, not a new one |
| §8 capability/rail discovery (no live API) | Observability (adjacent); mostly a DX gap without an exact existing Gate category — noted, not forced into one that doesn't fit |
| §9 restart/resume (mostly closed) | Recovery/reconciliation; unknown-outcome handling — **already substantially evidenced**, this document adds confirmation, not a new finding |
| §10 stranger test | Independent integration evidence |
| §11 partner evidence bar | Independent integration evidence; reference-wallet production evidence |

No new Gate category is proposed — every finding here fits inside a
category the Gate already names.

---

## 14. Findings table

| # | Finding | Classification | Section |
|---|---|---|---|
| 1 | No npm-only start; requires self-hosting a full backend first | DX GAP | §3 |
| 2 | No documented public/shared Sails endpoint anywhere | ARCHITECTURAL GAP | §4 |
| 3 | Documented integration path creates an isolated economic island, contradicting `PROJECT_CONTEXT.md`'s own "shared network" claim | ARCHITECTURAL GAP | §4 |
| 4 | `examples/simple-wallet` README's pagination claim is stale; real pagination+filtering already exists | DOCUMENTATION GAP | §5 |
| 5 | No offer quote-expiry field | PRODUCTION INFRASTRUCTURE GAP | §6 |
| 6 | No offer inventory/partial-fill tracking | PRODUCTION INFRASTRUCTURE GAP | §6 |
| 7 | No pre-commit trade-review gate for offer owners | ARCHITECTURAL GAP | §6 |
| 8 | No outbound webhook delivery mechanism | PRODUCTION INFRASTRUCTURE GAP | §6 |
| 9 | `WalletAdapter` is genuinely optional (positive finding) | NO GAP | §7 |
| 10 | No example demonstrates a non-wallet (service/backend) integration | DOCUMENTATION GAP | §7 |
| 11 | `custodyModel` per-escrow disclosure is real and working (positive finding) | NO GAP | §8 |
| 12 | No live, pre-creation capability/rail discovery API | DX GAP | §8 |
| 13 | Fund-moving restart/resume safety is substantially closed (positive finding, this session's own prior work) | KNOWN RESIDUAL (closed) | §9 |
| 14 | No automatic client-side session-expiry recovery | DX GAP | §9 |
| 15 | No stranger/blind integration test has ever been performed | PRODUCTION INFRASTRUCTURE GAP (evidence gap) | §10 |
| 16 | No independently maintained partner wallet/service exists | PRODUCTION INFRASTRUCTURE GAP (evidence gap) | §11 |
| 17 | SDK public surface is well-contained against transport/provider/identity leakage (positive finding) | NO GAP | §12 |
| 18 | `IntentFacade.negotiate()` intentionally unimplemented, correctly disclosed | KNOWN RESIDUAL | §3 |

---

## 15. Existing representations

Checked before registering anything new, per the mission's own rule
("finding → classify → check existing representation → decide
destination"):

- Findings 4, 9, 11, 13, 17, 18 require **no new registration** — they
  either confirm already-closed work (13, from this session's own
  #56/#58/#59 chain) or are positive findings needing no backlog entry
  at all (9, 11, 17), or point at a stale doc, not a stale mechanism
  (4) or an already-disclosed residual (18).
- Findings 5, 6, 7, 8 (professional-provider gaps) — no existing
  Backlog/Issue entry found covering offer quote-expiry, inventory, or
  webhooks specifically. **New Backlog delta required.**
- Findings 2, 3 (network/bootstrap) — no existing Backlog/Issue entry
  found. Issue #75 (multi-implementation horizon) and Issue #86
  (wallet-kit distribution) are adjacent but distinct — neither
  addresses *shared economic network topology between operators*.
  **New Backlog delta required — this is the most consequential one in
  this document.**
- Finding 12 (capability/rail discovery API) — adjacent to, but
  distinct from, the already-real `custodyModel` disclosure (11). **New
  Backlog delta required**, narrowly scoped.
- Finding 14 (session-expiry recovery) — no existing entry found.
  **New Backlog delta required**, small/bounded.
- Findings 15, 16 (stranger test, partner evidence) — directly maps to
  the Production Readiness Consolidated Gate's own "independent
  integration evidence" category, already registered this session.
  **No new Backlog entry — covered by the existing Gate category**;
  this document itself is the evidence trail for that category.
- Finding 10 (no non-wallet example) — adjacent to Issue #75 (DX/
  interfaces horizon) and Issue #86 (distribution) but narrower and
  more concrete (a missing example, not a missing architecture).
  **New Backlog delta required**, small.

---

## 16. Backlog deltas

Per the mission's explicit rule against automatically creating seven
issues, findings are grouped into **four** new Backlog deltas (not
seven), each cross-linked to the closest existing representation
rather than duplicating it:

1. **Shared economic network topology** (findings 2, 3) — the most
   severe. Destination: **new Master Backlog entry**, cross-linking
   `docs/PROJECT_CONTEXT.md`'s "shared, interoperable network" claim
   (which it currently contradicts) and the Production Readiness
   Consolidated Gate's "deployment assumptions" / "independent
   integration evidence" categories. Not Issue #75 or #86 — genuinely
   distinct from both (neither is about cross-operator network
   topology).
2. **Professional liquidity provider primitives** (findings 5, 6, 7, 8)
   — Destination: **new Master Backlog entry**, cross-linking the
   Production Readiness Gate's "provider production eligibility"
   category. Not a new Issue — scoped enough to track as a Backlog
   entry until a design/execution mission is authorized.
3. **Live capability/rail discovery** (finding 12) — Destination:
   **new Master Backlog entry**, narrow, cross-linking the existing
   `custodyModel` precedent (11) as the pattern to extend, not
   replace.
4. **Client-side session-expiry recovery + non-wallet integration
   example** (findings 10, 14) — Destination: **new Master Backlog
   entry**, small/bounded, cross-linking Issue #75 (DX/interfaces
   horizon) for the missing-example half.

**Explicitly not creating a new Issue for any of these** — per the
mission's own rule, a Backlog entry is sufficient while no execution
mission is authorized (same posture used throughout this session for
PR #91/#92/#93).

---

## 17. Beta blockers

Findings that block even a **beta**-scale partner integration:

- **Finding 2/3 — no shared economic network topology.** This is a
  genuine beta blocker: a beta partner cannot demonstrate participating
  in the same economic environment as any other operator today, by
  design of the current deployment model, not by partner-side
  incompetence.
- **Finding 15/16 — no stranger test, no independent partner evidence.**
  These are evidence gaps, not code gaps — they block *claiming* beta
  readiness, not necessarily *achieving* it, since the underlying SDK
  surface is largely sound (§3, §7, §12).

---

## 18. Production blockers

Everything in §17, plus:

- **Finding 5/6/7/8 — professional-provider primitives** are needed
  before any professional liquidity provider (a likely, valuable early
  partner class per this session's own roadmap work) can be
  production-viable, not merely beta-viable.
- **Finding 14 — session-expiry recovery** is a real production-UX
  gap, though narrow and bounded.
- Every rail-maturity/audit/Red-Team gap already tracked by the
  Production Readiness Consolidated Gate (not re-litigated here).

---

## 19. Recommendation

**STOP, for a Partner Beta or Public Production claim as currently
scoped — but not because the SDK itself is unsound.**

The evidence in this document is more positive about the SDK's own
design than the mission's own skeptical framing might have predicted:
`WalletAdapter` optionality, `custodyModel` disclosure, the liquidity
pagination/filter mechanism, and the fund-moving restart/resume safety
work are all real, working, and well-disclosed. The facade's one
unimplemented method is honestly documented with a working alternative.

**What actually blocks a real partner today is narrower and more
specific than "the SDK isn't ready": there is no way for a second,
independently-operated party to join the same economic network as
Satsails' own deployment.** Every other finding in this document is a
real but bounded gap (quote expiry, inventory, webhooks, a stale
example, a missing non-wallet demo, no live discovery API, manual
session recovery) — the kind of gap a beta partner could work around or
route through the Sails team temporarily. The network-topology gap is
not something a partner can work around at all; it requires a design
decision this document does not make (that is properly a future,
CTO-gated architecture mission, not this discovery pass).

**Recommendation, concretely:** register the four Backlog deltas in
§16, prioritizing the shared-network-topology entry as the one genuine
precondition for any real Partner Beta; treat the professional-provider
gaps as the next priority once that precondition is addressed; and do
not claim "can integrate in 15 minutes" or cite Satsails' own
integration as interoperability proof until §10/§11's evidence bars are
actually met.

DO NOT MERGE. STOP AND RETURN TO CTO.
