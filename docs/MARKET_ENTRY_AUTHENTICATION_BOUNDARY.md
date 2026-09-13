# Market Entry / Authentication Boundary (`MISSÃO 2A`, 2026-09-13)

**Status:** Product/UX boundary audit, companion to
`docs/P2P_PRODUCT_JOURNEY.md` (`MISSÃO 2`) §2 (Economic Commitment
Boundary). **No new auth implemented. No auth scheme decided (email/
password, passkey, Breez Auth). No UI corrected.** Every claim below was
verified against real, current source (`sails-ui`'s routing/pages/
`AuthContext.tsx`, and the real backend route files) on 2026-09-13 — not
assumed from product intent or from prior missions' framing.

**North star, restated (this mission's own):** *Browsing ≠
Authentication ≠ Economic Identity ≠ Wallet Connection ≠ Funds
Authority. Visibility does not imply authority. Enter first. Authenticate
when authority becomes necessary.*

**Headline finding, stated up front because it inverts the mission
brief's own conditional framing ("if the current UI requires login
before Market Discovery"):** **it does not.** `Marketplace.tsx` and
`OfferDetail.tsx` — Discovery and Offer Evaluation — are already
reachable, and already fetch real backend data, with zero authentication
at both the React-routing layer and the backend-route layer. The
target direction this mission asks to evaluate
(*Open Market → Discovery → Offer Evaluation → Intent to Act →
Authentication/Identity if required → Wallet/Signing Boundary if
required → Economic Commitment → Trade Lifecycle*) is **already the
real, shipped shape of this codebase for its first three stages** —
not a UX assumption to correct, and not something this mission
invented. What follows verifies this precisely, names the places where
the boundary is inconsistent or mislabeled, and answers every question
the mission asked without changing any code.

---

## 1. Real Architecture Audited

### 1.1 No centralized route guard exists

`App.tsx`'s router has no `<ProtectedRoute>`/`<RequireAuth>` wrapper of
any kind — every route (`/`, `/offer/:id`, `/trade/:id`, `/profile`,
`/profile/*`, `/disputes`) is registered identically, and `Layout.tsx`
(the shared shell wrapping all of them) renders `<Outlet />`
unconditionally, regardless of `useAuth()`'s `user` state. **Every page
gates itself, individually** — there is no single, central boundary to
audit; the boundary is the sum of each page's own choice.

### 1.2 Two real, distinct per-page patterns (both already in use, consistently)

| Pattern | Pages | Behavior |
|---|---|---|
| **Route-level redirect** | `Profile.tsx:76`, `ActiveTrades.tsx:34,65`, `Disputes.tsx:74,192`, `TradeHistory.tsx:39,83`, `Trade.tsx:431` | `if (!user) navigate('/login', { state: { from: <path> } })` (or an early `return null`) — the entire page is participant-scoped content (own offers, own trades, own disputes, a specific trade's negotiation), so there is no meaningful anonymous view to show |
| **Action-level gate** | `OfferDetail.tsx:135`, `AgentIntentionPanel.tsx:91` (rendered on `Marketplace.tsx`) | The page/component renders fully and fetches real public data for everyone; only the specific write/compute action (`handleStartTrade`, the Sails Agent's `handleGenerate`) checks `user` at click-time |
| **No gate at all** | `Marketplace.tsx` | Zero `useAuth()`/`user` reference anywhere in the file — genuinely, fully public today |

Both patterns are real, deliberate, and already correctly matched to
their content — not an oversight. The one real inconsistency found is
narrower (§5.3).

### 1.3 Backend route audit (real, current — `preHandler: requireAuth` presence/absence read directly from each route file)

| Route | Auth required? | What it does |
|---|---|---|
| `GET /v1/liquidity/offers` | **No** | Discovery — browse/filter offers (`Marketplace.tsx`'s own data source) |
| `GET /v1/liquidity/offers/:id` | **No** | Offer Evaluation — single offer detail incl. real seller reputation/trades/dispute-rate (`OfferDetail.tsx`'s own data source) |
| `GET /v1/liquidity/offers/:asset/book` | **No** | Aggregate order-book view per asset |
| `POST /v1/liquidity/match` | **No** | Best-match query (read-only computation, no state created) |
| `POST /v1/liquidity/offers` | **Yes** | Publish an offer — requires a real Participant to attribute it to |
| `GET /v1/liquidity/offers/mine` | **Yes** | Participant-scoped, correctly |
| `PATCH /v1/liquidity/offers/:id/status` | **Yes** | Mutates the caller's own offer |
| `POST /v1/openp2p/trades` | **Yes** | **The Current Runtime Coordination Commitment** (`docs/P2P_PRODUCT_JOURNEY.md` §2.2 — corrected `P2P-JOURNEY-GATE-R1`: real and authenticated, but not the *complete* Target Economic Commitment Boundary, §2.3) |
| `GET /v1/openp2p/trades/:id`, `GET /v1/openp2p/trades` | **Yes** | Contains negotiation + payment-instruction content — correctly participant-scoped (`trade.routes.ts`'s own comment cites a real, previously-fixed IDOR here) |
| Every `/v1/settlement/escrow/*`, `/v1/settlement/disputes/*` write and detail route | **Yes**, uniformly | Once a trade/escrow/dispute exists, everything about it is participant- or arbiter-scoped |
| `GET /v1/settlement/arbitration/profile/:participantId` | **No** | Public arbiter reputation lookup — a legitimate public trust signal, same register as an offer's seller reputation |
| `GET /v1/settlement/payment-accounts/:accountHash` | **No** | Lookup by an already-privacy-preserving hash, not a raw identifier |
| `GET /v1/settlement/payout-addresses/:participantId/:asset` | **No** | A registered payout address — **current runtime reality, not evaluated as automatically legitimate; see §1.3.1** |

**The real, current backend boundary is precisely: read = public where
the content is inherently non-participant-private (offers, arbiter
reputation, hashed payment-account lookups); write = authenticated,
always.** This is not a partial or accidental boundary for offers/
arbiter-reputation/payment-account-hash lookups — it is applied
consistently across every module audited. **The payout-address route
is a separate case, reconciled below (§1.3.1), not folded into this
same "inherently non-private" framing without checking it first.**

#### 1.3.1 Payout-address exposure, reconciled against the frozen Privacy Matrix (corrected `P2P-JOURNEY-GATE-R1`, 2026-09-13)

**Correction to this document's own original framing:** the first pass
above classified `GET /v1/settlement/payout-addresses/:participantId/:asset`
as unproblematic ("no stronger privacy than any on-chain address
already has once used") without checking it against
`docs/PRODUCT_INTERACTION_MODEL.md` §5's own, already-frozen Privacy
Matrix. Checked now: that matrix's own "Payout/destination address" row
reads `● (own) | ○ (unless protocol requires disclosure to complete
settlement) | ○ | ○ | ◐ (disputed case only) | ○ | ○ | ○` — i.e. the
owner sees it fully, and every other actor including **Public** is
frozen at `○` (no access) unless a specific, named exception applies.

**Current runtime reality, stated plainly, not judged as legitimate or
illegitimate by this document:** `GET /v1/settlement/payout-addresses/:participantId/:asset`
has no `requireAuth` — any caller, including an unauthenticated one and
the general public, can resolve any participant's registered payout
address for a given asset today. This is a real, verified (2026-09-13)
discrepancy between the already-frozen Privacy Matrix's own `Public: ○`
column and the real, current route's actual `●`-equivalent behavior —
not a case this document classifies as fine, and not one it decides how
to close.

**Privacy review gap, registered, not solved:** whether this route's
current public reachability is an intentional, narrow exception (the
same register as an on-chain address's own inherent post-use
visibility — a plausible reading, but not decided here) or a real
non-conformance with the frozen Privacy Matrix that should gain
`requireAuth` (or an equivalent narrower disclosure rule, e.g. scoped
to an active trade's own counterparty) is a genuine open question,
registered as a Backlog delta (§8) for a future privacy review — **no
mechanism is proposed, chosen, or implemented here.**

### 1.4 "Wallet Connection" does not exist as a separate step today

`AuthContext.tsx`'s own header comment discloses this precisely: the
single "Conectar Carteira" action in `Login.tsx` performs Ed25519
**identity/session establishment** (`sailsClient.identity.create()`/
`authenticate()`, a real challenge-response) — WDK (the actual
custodial asset-moving infrastructure for `WDK_USDT_EVM`) **never runs
client-side at all**, confirmed both here and in `docs/P2P_PRODUCT_JOURNEY.md`
§9-10. The same identity keypair is then wrapped as a `WalletAdapter`
(`LocalKeypairWalletAdapter`) and reused for chat encryption and for
signing client-held-key escrow actions (`useEscrowKey.ts`,
`resolveDisputeWithWallet()`) — **one artifact serving both roles**,
explicitly disclosed as "demo-only... not a step toward real wallet
custody." **There is no genuine "connect an external wallet" UI flow
anywhere in `sails-ui` today** — the UI's own copy ("Conectar
Carteira") already speaks as if there were one, which is a labeling
mismatch, not a missing feature (§5.4).

---

## 2. The Ten Questions

**O que pode ser visto anonimamente?** The entire Marketplace listing
(price, limits, payment method, asset, side, real seller reputation/
trade-count/dispute-rate per offer); a single offer's full detail page;
the aggregate order book; a best-match query; a public arbiter's
profile; a payment account's signed/chargeback status by hash; a
participant's registered payout address by id+asset.

**Qual ação realmente exige uma Economic Identity?** Publishing an
offer, starting a trade (`POST /v1/openp2p/trades` — the real Economic
Commitment moment), any action on an existing trade/escrow/dispute
(payment-sent, release, refund, dispute, evidence, signature
submission), registering a payment account or payout address, using the
Sails Agent to generate an intent.

**Em qual ponto a autenticação passa a ser necessária?** At **Intent to
Act**, exactly as the mission's own target journey names it — concretely,
the moment a visitor clicks "Iniciar Trade" (`OfferDetail.tsx`) or tries
to use the Sails Agent (`AgentIntentionPanel.tsx`), not before.

**Em qual ponto Wallet Connection passa a ser necessária?** Never, as
its own distinct step, in the current implementation — because it does
not exist as one (§1.4). The closest real analogue (producing a
`WalletAdapter`) happens automatically, bundled into the same
authentication action, the moment `login()` succeeds.

**Quais ações exigem Funds Authority?** None, in this non-custodial
protocol's own terms — the platform never holds Funds Authority over a
participant's asset. What *does* require the participant's own signing
key (the closest real analogue in this codebase) is releasing/refunding/
splitting a client-held-key escrow (`MULTISIG`/`LIGHTNING_HODL`/
`SAFE_GUARD_EVM`) — real, distinct from `WDK_USDT_EVM`'s server-custodial
model, per `docs/P2P_PRODUCT_JOURNEY.md` §10.

**Quais ações exigem Signing Authority?** The client-signature-collection
flow above (`useEscrowKey.ts`'s verify-then-sign, `signEscrowPsbt()`/
`signEscrowArkTx()`/`signEscrowSafeUserOp()`), and dispute-evidence/
resolution actions that go through `resolveDisputeWithWallet()`/
`attachEvidence()` — both real, both keyed to the SAME identity keypair
`login()` already produced, not a separate signing credential.

**Auth/session e wallet connection podem existir separadamente?**
**Architecturally, yes** — nothing in the protocol/backend requires them
to be the same artifact; `WalletAdapter` is its own real interface
(RFC-013), and a genuine external-wallet integration (a real WDK/BDK/
Breez/Spark/LDK adapter, per `docs/BACKLOG.md`'s aspirational
`@sails/adapter-*` list) would supply signing without ever touching this
UI's own session/identity mechanism. **In the current reference UI, no
— they are the same artifact today**, by explicit, disclosed design
choice (a demo shortcut), not a protocol constraint.

**Um Partner Wallet já autenticado deve precisar repetir onboarding
dentro do Sails?** Not evaluated by this mission (no Wallet Partner
Journey work is authorized — `docs/P2P_PRODUCT_JOURNEY.md` §28's own
explicit deferral). Named here only as the natural next question for
that future mission: today's `login()` conflates identity-creation and
wallet-adapter-creation into one step, which a real Partner Wallet
integration would need to decompose (RFC-013's `WalletAdapter` already
being optional/pluggable is the real architectural room this would use).

**O usuário pode entrar no Market sem conta?** **Yes, today, already** —
confirmed at both the routing layer (§1.1-1.2) and the backend layer
(§1.3). No account, session, or identity of any kind is required to
open the app, browse every offer, or view any offer's full detail.

**Quais dados continuam privados mesmo com discovery público?** Payment
details/destination, chat content, dispute evidence, and a trade's own
negotiation detail (`GET /v1/openp2p/trades/:id` requires auth
specifically because it carries this) — everything
`docs/PRODUCT_INTERACTION_MODEL.md` §5's Privacy Matrix and
`docs/P2P_PRODUCT_JOURNEY.md` §17 already freeze, confirmed by the same
route audit (§1.3): every route carrying such content already requires
auth, independent of this mission's own findings about Discovery being
public. **One exception, not folded into the above without
qualification:** the registered payout *address* itself
(`GET /v1/settlement/payout-addresses/:participantId/:asset`) is
publicly queryable today, which is a real, verified discrepancy against
the same Privacy Matrix's own `Public: ○` for that row — reconciled,
not resolved, at §1.3.1.

---

## 3. Journey Target vs. Current Behavior

```
Target:   Open Market → Discovery → Offer Evaluation → Intent to Act →
          Authentication/Identity if required → Wallet/Signing Boundary
          if required → Economic Commitment → Trade Lifecycle

Current:  Open Market → Discovery (public, real) → Offer Evaluation
          (public, real) → Intent to Act ("Iniciar Trade" / Agent
          "Gerar") → Authentication (redirect-with-return to /login,
          OfferDetail only) → [no distinct Wallet/Signing step — bundled
          into the same login()] → Economic Commitment (POST
          /v1/openp2p/trades, real, authenticated) → Trade Lifecycle
```

**Match: substantial, for the stages this mission is scoped to
(Discovery through Economic Commitment).** The one structural gap
against the target is that "Wallet/Signing Boundary if required" has no
independent existence to evaluate — it is not a missing stage, it is a
stage collapsed into Authentication by the current reference
implementation's own disclosed shortcut (§1.4), not by backend or
protocol necessity.

---

## 4. Classification of the Current Boundary (per the mission's own required causes)

Since no login wall exists on Discovery/Offer Evaluation, there is
nothing to classify as an obstacle there. What this section classifies
instead is *why the boundary already sits where it does*, and the one
real inconsistency found:

| Observation | Classification |
|---|---|
| `GET /v1/liquidity/offers`/`/:id`/`/:asset/book`, `POST /v1/liquidity/match` have no `requireAuth` | **Product truth** — a deliberate, already-correct backend design (confirmed by its own consistency across every read route that carries no participant-private content), not an accidental omission |
| `Marketplace.tsx` has zero auth references | **Product truth**, matching the backend — the frontend simply never introduced a gate the backend never required |
| `OfferDetail.tsx`'s action-level gate (view public, gate the click) | **Product truth**, deliberately built this way (its own comment explains the redirect-with-return design was fixed specifically to preserve context) |
| `Trade`/`Escrow`/`Dispute` detail and every write route requiring auth | **Real security requirement** — these carry payment/negotiation/evidence content the Privacy Matrix already protects |
| `AgentIntentionPanel.tsx`'s `handleGenerate` showing a toast with no redirect-with-return, unlike `OfferDetail.tsx`'s pattern | **UX assumption / inconsistency** — not a security requirement (the same participant-scoped SDK call either way), just a narrower implementation than its sibling gate. Not fixed here (§ Non-goals). |
| `Login.tsx`'s "Conectar Carteira" copy for what is actually identity/session establishment, not a wallet connection | **UX assumption / implementation convenience**, explicitly disclosed as a demo shortcut in `AuthContext.tsx`'s own header — not a security or protocol requirement forcing this conflation |
| No independent "Wallet Connection" step exists anywhere | **Implementation convenience** (the demo-only `LocalKeypairWalletAdapter` shortcut), not an inexistence of an anonymous read path (which is unrelated) and not a security requirement — RFC-013's real `WalletAdapter` interface already supports decoupling this, unbuilt only because no real external-wallet integration exists yet |

**No cause found requires removing or loosening anything** — the
mission's own caution ("não simplesmente remover o login wall sem
verificar backend/privacy") turned out not to apply, because there is
no wall to remove on the stages in scope.

---

## 5. Preserved Distinctions, Verified Against Real Code

`Browsing ≠ Authentication ≠ Economic Identity ≠ Wallet Connection ≠
Funds Authority` — checked one by one:

1. **Browsing ≠ Authentication** — real, confirmed (§1.1-1.3): browsing
   requires neither a session nor a token.
2. **Authentication ≠ Economic Identity** — real but currently
   simultaneous: `login()`'s `identity.create()`/`authenticate()` both
   establishes a session AND registers/proves the `User`/`Participant`
   row in the same action. The protocol's own `Participant` abstraction
   (`docs/PROTOCOL_SPECIFICATION.md` §1.1) does not require this
   simultaneity — a future flow could authenticate a returning session
   without necessarily implying a *fresh* economic identity is being
   created, but today's UI only has the combined `login()` path. Not a
   gap this mission is scoped to close.
3. **Economic Identity ≠ Wallet Connection** — real distinction at the
   protocol/RFC-013 level; **collapsed in this reference UI** (§1.4,
   §4). This is the one genuine, disclosed conflation found.
4. **Wallet Connection ≠ Funds Authority** — real: even a genuine
   external-wallet connection would only ever grant *signing* capability
   for the participant's own client-held keys — never platform custody
   of funds, which does not exist anywhere in this protocol's model
   (`docs/PRODUCT_INTERACTION_MODEL.md`'s own "no platform-operator
   visibility"/no-custody framing, restated not redefined).
5. **Visibility does not imply authority** — real and enforced for
   authority: every public read route audited (§1.3) has no
   corresponding write capability; `docs/DESTINATION_AUTHORITY_ARCHITECTURE.md`'s
   own Economic Disposition Authority ≠ Destination Authority ≠
   Execution Authority distinction (restated in
   `docs/P2P_PRODUCT_JOURNEY.md` §16) is the same principle one layer
   deeper in the journey. **This principle is about authority, not
   privacy** — the payout-address route (§1.3.1) shows visibility
   itself can still exceed the already-frozen Privacy Matrix's own
   intent even where no authority ever changes hands; the two questions
   are independent and this finding does not weaken the authority
   claim above.

---

## 6. Candidate Authentication Capability — Passkeys / Breez Auth (registered, not decided)

**Checked first, per the mission's own instruction, to avoid
duplication:** `docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` §5.1 already
documents Breez's real, published `passkey-login` spec
(`github.com/breez/passkey-login`) as external precedent — but in a
**different register**: that section cites it as evidence for a
*recovery-root/multi-domain-derivation* pattern (a passkey's WebAuthn
PRF deterministically deriving both a Nostr identity and a wallet
mnemonic), explicitly stating *"this does not make Passkey or Breez a
Sails Protocol dependency."* It is not framed there as a candidate for
`sails-ui`'s own **login/session-establishment** UX — the angle this
mission's brief raises.

**Registered here, narrowly, as the missing angle — not decided, not
selected, not implemented:** a passkey (WebAuthn)-based or Breez-style
authentication capability is a real, evidenced-elsewhere candidate for
replacing/supplementing `Login.tsx`'s current passphrase-encrypted-
localStorage-keypair mechanism (`AuthContext.tsx`, itself already
self-disclosed as a demo shortcut, §1.4) — worth a future, dedicated
investigation, cross-referencing `docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`
§5.1 rather than re-deriving its own research. No email/password
decision, no passkey scheme decision, and no Breez Auth adoption
decision are made by naming this candidate — per the mission's own
explicit non-goal.

---

## 7. Findings Classification (reusing `docs/P2P_PRODUCT_JOURNEY.md` §21's A–J scale)

| Finding | Classification |
|---|---|
| Public Market Discovery/Offer Evaluation is already real, not a gap needing to be opened | **H** — legitimate, already-correct implementation; the mission's own conditional premise did not hold |
| Economic Identity and Wallet Connection are collapsed into one `login()` step in the reference UI | **B** — an engineering/demo convenience (no real external-wallet integration exists yet) promoted, via UI copy ("Conectar Carteira"), to read as if it were the protocol's own model |
| `AgentIntentionPanel.tsx`'s unauthenticated dead-end (toast, no redirect-with-return) | **H** — a minor, real implementation-consistency gap, not a security or product-truth issue |
| No passkey/Breez-Auth-as-login candidate is registered anywhere (only as recovery-root evidence) | **A** — a real, narrow angle of product truth not yet named, now named here |
| `WalletAdapter` (RFC-013) already supports decoupling identity from signing, unused today | **G** — legitimate deferral (no real external-wallet integration exists to need it yet) |
| `GET /v1/settlement/payout-addresses/:participantId/:asset` is publicly reachable, contradicting `docs/PRODUCT_INTERACTION_MODEL.md` §5's own frozen `Public: ○` for that row (§1.3.1) | **A** — Product truth (the frozen Privacy Matrix) not enforced by real runtime behavior; registered as a privacy review gap, not solved here |
| `docs/P2P_PRODUCT_JOURNEY.md`'s original labeling of `POST /v1/openp2p/trades` as "the Economic Commitment moment itself" | **H** — corrected upstream (`docs/P2P_PRODUCT_JOURNEY.md` §2.2, `P2P-JOURNEY-GATE-R1`) to Current Runtime Coordination Commitment; this document's own reference updated to match |

---

## 8. Documentation Deltas

- **New:** this document, `docs/MARKET_ENTRY_AUTHENTICATION_BOUNDARY.md`.
- **`docs/PROJECT_CONTEXT.md`:** one short cross-link (§2I, below).
- **`docs/BACKLOG.md`:** one new item registering §6's candidate and
  §7's findings, plus the §1.3.1 privacy review gap — no existing item
  altered.
- **Not touched:** `docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` (its §5.1
  is cited, not amended — its own framing is accurate for its own
  scope and needs no correction); `docs/PRODUCT_INTERACTION_MODEL.md`
  §5's Privacy Matrix (cited as the frozen reference the real route is
  checked against, not amended — the matrix itself was already correct;
  the runtime is what needs reconciling, not the frozen intent).

---

## Closing confirmations

No authentication mechanism implemented, changed, or removed. No
email/password decision. No passkey scheme decision. No Breez Auth
adoption decision. No UI corrected — the one real inconsistency found
(`AgentIntentionPanel.tsx`'s dead-end toast) and the one real conflation
found (identity/wallet in `login()`) are named, not fixed, per this
mission's own explicit instruction to prove the boundary before
touching any code. This document is a verification of where the
public/authenticated/wallet/funds-authority boundary already sits
today, built entirely from direct, current-code evidence
(`sails-ui`'s routing, pages, `AuthContext.tsx`, and the real backend
route files) — not from assumption in either direction ("open
everything because it's nicer" or "require login because it's
simpler").
