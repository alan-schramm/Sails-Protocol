# Product/UI Reality Return

**Status:** Live audit + source-code cross-reference, not implementation.
**Baseline:** `main@ff40c83e0e672d0b04506885808e5ef41a4665cc`. No frozen
architecture reopened — every finding below is checked against already-
frozen semantic/authority/identity/settlement/error/recovery/multi-
operator truth (Mission 3, Mission 4, PR #153, PR #154, PR #156), never
against a redesign.

**Method:** the real `packages/sails-ui` app was run against a real local
Postgres/Redis and the real Fastify backend (no mocks) — the same
"real over mocked, always disclosed when it isn't" discipline
`packages/sails-ui/PRODUCT.md` already commits this package to. Findings
below are evidenced by live screenshots, live console/network logs, and
direct source reads — not opinion.

## 1. Baseline Inspected

`git log -1 --format="%H %s" origin/main` → `ff40c83e0e672d0b04506885808e5ef41a4665cc`.
Local environment: `postgres:16-alpine` + `redis:7-alpine` (ephemeral,
removed after this audit), real `npm run dev` backend on `:3000`, real
`npm run dev -w @sails/ui` on `:5173`.

## 2. Current Product/UI Architecture Map

Per `packages/sails-ui/PRODUCT.md`/`DESIGN.md` (already-established
product context, not re-derived): nine screens — Marketplace, Offer
Detail, Trade, Login, Profile, Publish Offer (3-step wizard), Trade
History, Disputes (arbiter-scoped), plus a settings/theme surface.
Design system: black + burnt-orange (`#c2410c`), Space Grotesk display /
system-font body, full symmetric light/dark themes, semantic status
colors (green/red/yellow/blue/orange/violet) kept explicitly separate
from the brand accent — confirmed in `StatusBadges.tsx` and `DESIGN.md`
directly, already satisfying the brief's own "semantic colors separate
from brand color" requirement. Reference points cited in `DESIGN.md`:
Binance P2P/Airtm/El Dorado — not literally Zest, but the same
"trading-floor density, not consumer warmth" register the brief asks
for; no contradiction found.

## 3. Journey Audit

### Journey A — Browse First

**Live, confirmed working.** Anonymous load of `/` renders the full
Market screen — offer grid, asset/currency/payment filters, buy/sell
toggle, sort, seller search — with only a "Conectar" affordance in the
header, no forced gate. Tapping "Ativos" (My active trades) correctly
gates with a specific, honest reason: *"Conecte sua carteira para ver
seus trades ativos"* — not a generic block. `Browsing ≠ Authentication`
holds exactly as required.

### Journey B — Create Offer

**Mixed — one real, precise finding.** The offer wizard's own asset
picker (`PublishOffer.tsx`) already imports the *narrower*, real-backend-
values-only `ASSETS` list (`data/mock.ts`), not the wider `ASSETS_FILTERABLE`
list that includes purely UI-invented assets (ETH/BNB/SOL/WBTC/USDC
variants — confirmed these exist only as a disclosed, commented,
deliberate UI-only addition for filter/display contexts, and are
correctly excluded from the real submission path). `SPARK` is also
already correctly excluded, with its own comment citing a direct grep
confirming zero settlement-provider wiring. **This existing discipline
should be preserved, not reopened.**

**The real gap:** among the 9 real, in-scope-enum assets `PublishOffer`
*does* offer — `BTC`, `LN_BTC` (labeled "Bitcoin (Ark/Arkade)"),
`LIQUID_BTC`, `RSK_BTC`, `STACKS`, `USDT_ERC20`, `USDT_LIGHTNING`,
`USDT_LIQUID`, `USDT_TRC20` — only **three** (`BTC`, `LN_BTC`,
`USDT_ERC20`) have any real, registered settlement provider today
(Mission 4's own audit: `MULTISIG`/`LIGHTNING_HODL`/`WDK_USDT_EVM`).
`LIQUID_BTC`/`USDT_TRC20`/`USDT_LIQUID` are registered Day-0 scope with
**zero** providers; `RSK_BTC`/`STACKS` are explicitly named in ADR-002
§11 as falling **outside** frozen Day-0 scope entirely, with "no
automatic mapping authorized." The picker presents all nine with
identical visual weight — no badge, grouping, or copy distinguishes
"can settle today" from "cannot settle at all." A seller can publish a
real, market-visible offer for an asset/rail pair that will fail the
moment a counterparty tries to fund escrow — discovered only then, not
at publish time. **This is a live, undiscovered instance of exactly the
property Journey B asks to verify** — the UI does not collapse
Asset/Rail into one label (it correctly shows both, e.g. "Bitcoin
(Liquid)"), but it does collapse Product Scope with Settlement
Eligibility, which Mission 4's own `execution-candidates.ts` (already
frozen, already has the exact data) could resolve without inventing
anything new.

### Journey C — Take Offer / Trade

Not exercised live this pass (no seed offers existed to take — `0
ofertas disponíveis` throughout, confirmed genuine, not a defect: this
is a fresh database with no seed script run). Deferred to source-level
evidence: `Trade.tsx`'s own escrow-status rendering (§5 below) and
Mission 3's own frozen `PayoutAddress`/destination-authority work
already establish price/amount/counterparty/settlement fields are real
and Postgres-backed, not synthesized client-side. No live journey
evidence gathered — disclosed, not fabricated.

### Journey D — Settlement

Source-verified against `StatusBadges.tsx`'s real, exhaustive
(TypeScript-enforced) `EscrowStatus` mapping: `CREATED` → "Criado"
(Circle icon, neutral), `FUNDS_LOCKED` → "Fundos travados" (Lock icon,
blue), `PAYMENT_PENDING` → "Aguardando pagamento" (Clock icon, yellow),
`COMPLETED` → "Concluído" (CheckCircle2, green), `DISPUTED` → "Em
disputa" (AlertTriangle, red), `REFUNDED` → "Reembolsado" (RotateCcw,
neutral), `EXPIRED` → "Expirado" (XCircle, orange — a deliberate,
disclosed semantic reuse of the brand's own orange for an unrelated
"expiry" meaning, per that file's own comment), `SPLIT` → "Dividido
entre as partes" (Scissors, violet). Every state has a distinct color
*and* icon *and* text label — never color-only. **This is a real,
well-built domain state system and should be preserved.**

**What it does not yet do:** none of these states is `UNAVAILABLE` or
`INELIGIBLE` in the `CapabilityDenialReason` sense (§6 below) — those
never reach this badge system at all today, confirmed by direct search
(§6). "Unknown" (the idempotency-protected `WdkTransferAttempt`
`SUBMISSION_UNKNOWN` state) also has no distinct badge — a genuinely
ambiguous outcome would currently render through whichever generic
status the escrow was last confirmed at, not as its own state. This
does not invent a universal state machine (correctly avoided, per PR
#156's own R1 correction) — it is a disclosed, real gap in what this
already-good badge system covers.

### Journey E — Interrupted Journey

Source-verified against Mission 3's own frozen, tested mechanism
(`sessionEpochGate.ts`, `AuthContext.tsx`) — not re-derived. Live-
confirmed one real behavior this pass: a hard page reload drops the
in-memory session state entirely (`user`/`keypair` reset to `null`),
confirming the session truly is memory-only, not persisted — a real,
consistent architectural fact (the encrypted keypair *is* persisted in
`localStorage`, the *unlocked* session is not). This matches PR #156's
own frozen invariant precisely: a locally active authenticated context
is not proof of a currently-valid remote session, and here a full reload
doesn't even leave a locally active context behind — it requires
re-entering the passphrase, which decrypts the *same* stored keypair
(confirmed directly: `localStorage`'s `sails_ui_keypair_secret_hex`/
`sails_ui_kdf_salt` persist across reload; a wrong passphrase against
that stored ciphertext correctly produces "Senha incorreta," never a
silent wrong-identity login).

### Journey F — Capability / Eligibility Denial

**Real, confirmed gap, already disclosed by prior missions, not newly
discovered but newly evidenced with a precise UI-side check.** Direct
search of every `.tsx`/`.ts` file in `packages/sails-ui/src` for any
read of `.reason` (the `CapabilityDenialReason` field —
`UNSUPPORTED`/`UNAVAILABLE`/`FORBIDDEN`/`INELIGIBLE`/`DISABLED`/
`NOT_IMPLEMENTED`, real and shipped server/SDK-side since
CROSS-LAYER-SEMANTIC-CORRECTIVE-1) found **zero** matches — every real
`.reason` usage in the codebase is unrelated (dispute *reason text*,
local passphrase-decrypt-failure reasons). This means all six denial
reasons currently reach the user, if they reach them at all, through
whatever generic error-toast path exists — indistinguishable from each
other and from an unrelated network failure. This exact gap was already
named in `docs/BACKLOG.md` item 40's own text ("no existing UI code
reads `.reason` today") — this pass confirms it is still true on the
current baseline, not a regression, and not yet closed.

### Journey G — Dispute / Evidence

Source-checked `Disputes.tsx`: the screen is explicitly arbiter-scoped
(confirmed in Mission-era product context — "Disputes (arbiter-scoped,
not an admin console)," `PRODUCT.md`'s own operating-context line), and
renders a `dispute.reason` (the initiating party's stated reason) plus a
sheet detail view — a real, working screen, not a stub. Not exercised
live this pass (no seeded dispute existed). Deferred: whether evidence
submission UI copy anywhere implies automatic factual authority (RFC-021
D8's own auto-resolution path exists server-side per this session's
extensive prior audit trail) — not verified against live UI copy this
pass; flagged as unverified, not asserted clean.

## 4. Product Reality Findings

| # | Journey | USER INTENT | UI CLAIMS | PROTOCOL KNOWS | AUTHORITY | EVIDENCE | ACTION POSSIBLE | CAN GO WRONG | USER SHOULD UNDERSTAND | Class |
|---|---|---|---|---|---|---|---|---|---|---|
| PR-1 | B | List an asset I can actually sell | All 9 listed assets are equally selectable | Only 3 of 9 have a live settlement provider (Mission 4) | None differentiated | None shown | Publish for any of the 9 | Offer goes live, settlement fails only when a counterparty tries to fund escrow | Which of these can actually complete a trade *right now* | B, E |
| PR-2 | F | Understand why an action was denied | Whatever generic error text exists | A typed, 6-way reason (`CapabilityDenialReason`) | N/A | Reason exists, unused | None — no differentiated recovery guidance | User can't tell "try again later" from "this will never work" apart | Which denials are permanent vs. transient | A |
| PR-3 | Any | Not be permanently locked out by a typo | — | Passphrase is a local AES-256-GCM key with no recovery path | Full — losing it loses fund access permanently | Disclosed, but only inside a tooltip | User can dismiss the tooltip without reading it | User loses funds access with no recourse, having never seen the warning surfaced prominently | The passphrase is unrecoverable *before* they commit to one | A |
| PR-4 | Browse | See the market load reliably | Loading spinner, then results | The discovery fan-out (every asset × side) can exceed the backend's own rate limit under normal load | N/A | 267+ console errors, 1200+ requests observed in one session | Retries happen invisibly | A real user on a slower link could see a degraded/empty market with no explanation | (Engineering-facing, not user-facing per se) | B |

## 5. Authority-Collapse Findings

Checked against the required chain `View → Authenticate → Identify →
Connect wallet → Authorize → Sign → Execute → Recommend`:

- **Identify + Authenticate + Connect wallet are structurally one user
  action** ("Conectar Carteira") — verified this is not a false
  collapse but a real architectural fact of this specific reference
  wallet: the passphrase deterministically derives/decrypts the same
  Ed25519 keypair used both as Economic Identity and as the session's
  signing key, confirmed directly in `Login.tsx`'s own code comment
  ("Real Ed25519 challenge-response... `passphrase` never reaches the
  SDK/backend"). For an external-wallet-style integration this would be
  three separate steps; for this specific keypair-derived reference
  wallet, unifying them is honest, not collapsed-for-convenience.
- **Economic Identity vs. Transport Identity are correctly kept
  distinct** on the Profile screen — the displayed key is explicitly
  labeled "Sua chave de identidade (Pears / P2P)," naming it as the
  transport/P2P identity specifically, not presented as *the* identity
  with no qualifier. No collapse found.
- **Authorize/Sign/Execute** (submitting an escrow key, signing a PSBT,
  approving a release) were not exercised live this pass (no active
  trade existed) — deferred, not asserted clean or collapsed.
- **Recommendation ≠ Authority:** the "Sails Agent" (Market Negotiation)
  panel is visually distinct from the offer list and labeled as AI-
  generated intent/auto-search — not exercised deeply enough this pass
  to confirm its action buttons never silently escalate to execution;
  flagged as unverified.

## 6. State/Error-Semantic Findings

Restates §3 Journeys D/F precisely, cross-checked against PR #156's own
frozen invariants (not reopened):

- `UNKNOWN ≠ FAILED` — the backend-level guarantee is real and frozen;
  **no UI surface currently renders an `UNKNOWN` state distinctly at
  all** (§3 Journey D) — not a violation of the invariant (nothing
  mislabels `UNKNOWN` as `FAILED`), but the state has no UI existence
  yet, which is its own, narrower, disclosed gap.
- `CapabilityDenialReason`'s six values have zero UI consumption (§3
  Journey F, §4 PR-2) — confirmed by direct search, not inferred.
- Trade/Escrow status badges are a real, well-built, non-color-only
  system (§3 Journey D) — no defect found here; **preserve as-is.**

## 7. Mobile/Responsive Findings

Not exercised via a dedicated mobile-viewport pass this session (the
Browser pane defaulted to a narrow ~480-600px width throughout, which
incidentally exercised mobile-adjacent layouts for every screen visited
— Market, Login, Profile, Publish Offer wizard all rendered cleanly at
that width with no horizontal overflow or broken layout observed). A
dedicated desktop-width pass and a true `resize_window` mobile/tablet
comparison were not run this pass — disclosed as unverified, not
asserted complete.

## 8. Design-System Findings

No defect found. `StatusBadges.tsx`'s color+icon+text discipline,
`DESIGN.md`'s already-documented WCAG 2.1 AA contrast pass, and the
real/UI-only asset and payment-method list separation (`data/mock.ts`)
are all real, already-good engineering — explicitly preserved, not
reopened.

## 9. What Is Already Good and Should Be Preserved

- `Browsing ≠ Authentication` — live-confirmed, correct.
- The real-vs-UI-only asset/payment-method list split, including the
  already-correct exclusion of `SPARK` (zero provider) from the
  submission path.
- Economic Identity vs. Transport Identity correctly labeled, not
  collapsed, on the Profile screen.
- Trade/Escrow status badge system — real domain states, never
  color-only, TypeScript-enforced exhaustiveness.
- Honest, accurate non-custodial/no-recovery copy on Login — the
  *content* is correct; only its prominence is the finding (§4 PR-3).
- The passphrase-derived keypair's honest single-action framing for
  Identify+Authenticate+Connect (§5) — not a false collapse for this
  wallet type.

## 10. What Must Change Before Adding New Surfaces

Two real, bounded, evidence-backed items — both consume already-frozen
architecture, neither requires new mechanism:

1. **PublishOffer's asset picker must surface settlement maturity**,
   consuming Mission 4's already-frozen `discoverExecutionCandidates()`
   — a scope with `SCOPE_REGISTERED_NO_PROVIDER` or outside Day-0 scope
   entirely should not be presented with the same visual weight as a
   scope with a real, registered provider. **Property, not mechanism,
   frozen here:** the picker must distinguish "can settle today" from
   "cannot" before a new offer-creation surface is built on top of it.
2. **`CapabilityDenialReason` needs a first UI consumer** — even a
   minimal one (map the six reasons to six distinct, honest copy
   strings, never a shared generic message) before any new surface that
   creates more denial-shaped error paths is added.

Explicitly **not** required before new surfaces: a universal re-entry
state model (PR #156 already correctly declined to invent one); a
multi-node presentation vocabulary (still Watchlist, no real multi-node
deployment exists); any change to the passphrase/identity flow itself
(honest and correctly scoped as-is).

## 11. Next Bounded Product/UI Implementation Mission

**"Settlement Maturity Signal in Offer Creation"** — scoped narrowly to
finding #1 above. Wire `PublishOffer.tsx`'s asset selector to
`discoverExecutionCandidates()` (already frozen, already real, no new
mechanism): badge or group each of the 9 real assets by its real
outcome (`SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE` → sellable now;
anything else → visually distinct, honestly labeled, e.g. "ainda não
disponível para liquidação"). Does not require solving Selection among
multiple candidates (no real case exists), does not touch the rate-limit
fan-out (a separate, `discover()`-mechanism-level fix, not a picker
concern), and does not build the `CapabilityDenialReason` UI consumer
(a second, separately-scoped mission — the two are related but not the
same bounded slice).

## 12. Backlog Delta

Both items in §10 are genuinely new, UI-specific obligations not
previously registered anywhere in `docs/BACKLOG.md`'s own numbered
items (confirmed: neither the asset-maturity-picker gap nor the
zero-UI-consumption-of-`CapabilityDenialReason` gap is named there
today, only the *existence* of `CapabilityDenialReason` itself and the
disclosure that no UI reads it — item 40's own text already says this,
this document adds the concrete Product/UI consequence, not a duplicate
registration). Recommend a future `docs/BACKLOG.md` entry cross-
referencing this document once the next mission (§11) is authorized —
not registered as a new top-level item here, since this mission's own
scope is audit + next-mission-scoping, not backlog editing.

## 13. Verdict

Findings are real but narrow and bounded — two concrete, well-evidenced
Product/UI gaps (§10), both resolvable by consuming already-frozen
architecture, neither requiring new mechanism, cryptographic work, or
protocol change. No finding contradicts or requires reopening Mission
3/4/PR #153/PR #154/PR #156's frozen semantics.

**PRODUCT/UI FOUNDATION COHERENT — IMPLEMENT NEXT SLICE**

PRODUCT/UI REALITY RETURN — READY FOR CTO GATE
