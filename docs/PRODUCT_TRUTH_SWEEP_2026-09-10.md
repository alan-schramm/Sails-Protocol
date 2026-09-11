# Institutional Scope & Product Truth Sweep (2026-09-10)

**Status: DISCOVERY EVIDENCE = FROZEN. This document institutionalizes
accepted findings. It does not authorize any implementation.**

> **Discovery findings ≠ implementation authorization.** Nothing in this
> document — no CRITICAL/HIGH/MEDIUM severity label, no classification
> letter, no cross-reference — grants permission to modify code, UI
> behavior, `AssetType`, QVAC schemas, settlement providers, or any
> architecture decision. Each backlog obligation this document produces
> (§7) requires its own separate CTO authorization before implementation
> begins, exactly like every other entry in `docs/BACKLOG.md`.

---

## 1. Purpose

Two concrete blind spots were found in immediately-preceding missions:
(1) Day-0 scope had silently narrowed toward BTC-only/bounded rails based
on implementation convenience rather than actual Product Direction; (2)
an Ark-based `LIGHTNING_HODL` implementation was used, in earlier drafts
of this same session's own work, to claim Lightning maturity despite
Lightning and Arkade being distinct product/protocol capabilities. Both
were corrected in PR #118 (merged, `main` commit `0b1915e`), which froze
the **Full Reference Wallet Day-0 Capability Target** in
`docs/BACKLOG.md` (Cold Sweep Loop 5, item 20) as canonical Product
Direction.

This document exists because those two corrections are evidence of a
**class** of institutional failure, not two isolated typos. This sweep
searched the whole repository for further instances of the same class,
before any more implementation work proceeds on Gate C or any settlement
rail.

**Governing rule, preserved verbatim:**

> **IMPLEMENTATION CONVENIENCE MUST NEVER SILENTLY BECOME PRODUCT
> DIRECTION.**

Also preserved:

> Implementation ≠ truth. Interoperability ≠ protocol identity. Protocol
> family ≠ implementation/client ≠ settlement capability/provider ≠
> interoperability path. Reference Wallet capability ≠ Sails Protocol
> adapter maturity ≠ SettlementProvider maturity. Day-0 scope ≠ current
> implementation maturity.

**New Product Reality property, registered by this sweep** (also
recorded in `docs/ENGINEERING_GOVERNANCE.md` §10A — Product/Engineering
governance, deliberately **not** added to `docs/SEMANTIC_KERNEL.md`,
which answers a narrower question about protocol identity, not product
completeness):

> Backend/provider completion does not imply completion of the Reference
> Wallet user journey.

> A Day-0 capability is complete only when the declared product journey,
> protocol representation, implementation, and required evidence are
> mutually consistent at the claimed maturity level.

---

## 2. Frozen methodology

Four parallel research passes, each read-only (no file edits), covering:
(a) `docs/**` excluding the five files already reviewed by the prior Gate
B mission (`README.md`, `docs/BACKLOG.md`, `docs/ROADMAP.md`,
`docs/PROJECT_CONTEXT.md`, `docs/DAY0_COMPLETENESS_COLD_SWEEP.md`); (b)
`docs/rfcs/**` and `docs/adr/**`; (c) `src/**/*.ts` production code
(excluding tests), the settlement-provider registry
(`escrow-providers.ts`), config feature flags (`config/index.ts`); (d)
`packages/sails-sdk/src/**`, `packages/sails-ui/src/**`, `examples/**`.

Search heuristics: case-insensitive grep for scope/maturity language
("future," "later," "optional," "out of scope," "not required,"
"post-beta," "deferred," "won't support," "not blocking," "planned,"
"TODO," "stub," "mock," "fallback," "temporary," "for now," "MVP,"
"simplified," "not production," "implementation detail") plus targeted
grep for every Day-0 asset/network/protocol name (Lightning, Arkade,
Ark, Spark, DePix, XAUT/Tether Gold, USDC, Base, Optimism, Polygon,
Avalanche, Arbitrum, BNB Chain, Solana, TON, Tron, Liquid, WDK). Every
hit was read in surrounding context, not treated as a hit in isolation —
most matches across the repository were legitimate and are not reported
below.

**Ground truth used throughout:** the Full Reference Wallet Day-0
Capability Target frozen in `docs/BACKLOG.md` Cold Sweep Loop 5, item
20 — BTC (on-chain, Spark, Lightning, Arkade, Liquid/L-BTC — five
distinct capabilities); DePix (Liquid **and** Spark, both required);
USDT (Ethereum, Base, Optimism, Polygon, Avalanche, Solana, Tron, TON,
BNB Chain, Arbitrum, Liquid); USDC (Ethereum, Base, Optimism, Arbitrum,
Avalanche, Polygon); XAUT (Ethereum). **RGB is confirmed ROADMAP/FUTURE,
NOT Day-0** — this sweep does not promote it, and uses it only as an
architecture-extensibility example where already established elsewhere.

---

## 3. Classification taxonomy used

A. Product truth omitted · B. Engineering convenience promoted to
product decision · C. Implementation truth mislabeled as protocol truth
· D. Interoperability mislabeled as identity · E. Maturity overclaim ·
F. Maturity underclaim / hidden existing capability · G. Legitimate
deferral · H. Legitimate implementation detail · I. Product decision
required · J. Architecture decision required.

---

## 4. Findings (accepted, frozen)

### CRITICAL

**F1 — Reference UI payout destination is hardcoded, for every real settlement rail.**

- **Location:** `packages/sails-ui/src/pages/Trade.tsx:274-306`
  (`handleReleaseFunds`).
- **Exact reachable defect:** the release call path selects a
  compile-time constant (`DEMO_RELEASE_ADDRESS_MULTISIG`,
  `DEMO_RELEASE_SCRIPT_HEX_ARKADE`, `DEMO_RELEASE_ADDRESS_EVM`, or
  `DEMO_RELEASE_ADDRESS`) based on `escrow.type`, and passes that
  constant to `sailsClient.settlement.initiateRelease()`/`release()` —
  there is no address-entry UI anywhere in `EscrowActions.tsx` (confirmed:
  zero matches for "address" in that component) or elsewhere in
  `Trade.tsx`. This is true for every escrow type that has a real
  `SettlementProvider` today (`MULTISIG`/BTC, `LIGHTNING_HODL`/Arkade,
  `WDK_USDT_EVM`/USDT-Ethereum).
- **What this does NOT claim:** no evidence of actual lost funds exists
  or is asserted here — this repository's own continuously-run examples
  and tests never route real user funds through this exact UI path with
  a real counterpart address. The finding is the **reachable
  implementation defect**: the shipped Reference UI component, as
  written, cannot direct a release to an address the user actually
  controls.
- **Why this is Product Reality, not merely a UI polish gap:** provider/
  backend maturity for BTC, Arkade, and USDT-Ethereum is real and
  testnet-evidenced (`docs/BACKLOG.md` item 20's own maturity table) —
  but that maturity does not, by itself, prove a real user can complete
  the declared economic journey through the Reference Wallet, because
  the last step of that journey is currently unreachable without
  bypassing the shipped UI and calling the SDK directly (`intent-facade.ts`'s
  `releaseAsset(intentId, toAddress)` already accepts a real
  caller-supplied address — the SDK is not the limiting factor).
- **Classification:** Product Reality defect (new property, §1 above) +
  Technical Debt + Evidence obligation. Not classified under A-J alone
  because it is a live code defect, not a documentation/scope statement.
- **Cross-link, not duplicate:** overlaps with the existing **Day-0
  Production Reality Sweep** obligation (mock/stub/emulation/fallback
  sweep referenced in Issue #105's comment thread, 2026-09-XX — no
  dedicated `docs/DAY0_PRODUCTION_REALITY_SWEEP.md` file currently
  exists in this repository under that name or on the branch named in
  that comment; this sweep's own artifact is, as of this date, the only
  place this specific obligation's scope is written down). `DEMO_RELEASE_*`
  constants are exactly the class of "Day-0 reachable stub" that
  obligation's own classification table names — cross-linked here, not
  duplicated as a second finding.

### HIGH

**F2 — Multi-network stablecoin UI representation absent.**

- **Location:** `packages/sails-ui/src/pages/PublishOffer.tsx:62-65`
  (`NETWORK_BY_ASSET`), `packages/sails-sdk/src/types.ts:23-25` /
  `src/common/types/index.ts:5-7` (`AssetType`).
- **Finding:** the UI derives `network` from a fixed 1:1
  asset→network lookup (`USDT_ERC20` → `'ethereum'`, always); there is
  no network selector anywhere, and the real `AssetType` has only one
  USDT-EVM value. A user cannot select Base, Optimism, Polygon,
  Avalanche, Arbitrum, or BNB Chain for a USDT (or USDC) trade today.
- **Explicit correction from the CTO verdict on this sweep:** this is
  **NOT a Product Decision Required** — Day-0 Product Scope is already
  decided (all eleven USDT networks, all six USDC networks are Day-0
  Required). What remains open is **architecture/integration
  sequencing** — how the Asset × Network × Settlement-Capability
  decomposition is represented and in what order networks are wired up,
  not *whether* they are in scope.
- **Classification:** A (product truth already decided, representation
  absent) intersecting the existing architecture obligation (J).

**F3 — Spark absent from actionable Reference UI selection despite being Day-0 required.**

- **Location:** `packages/sails-ui/src/data/mock.ts:29-32` ("SPARK
  removed 2026-07-29... zero settlement-provider wiring").
- **Finding:** Spark is a real `AssetType` value but the Reference UI's
  own asset picker actively excludes it — confirmed, not inferred.
- **Explicit instruction preserved:** do not re-open scope. Spark's
  Day-0 requirement is not in question; only its current absence from
  the actionable UI surface is recorded here.
- **Classification:** A.

**F4 — DePix absent from actionable real Reference UI flow despite Liquid and Spark both being Day-0 required.**

- **Location:** `packages/sails-ui/src/pages/PublishOffer.tsx` (real
  `ASSETS` import never includes `DEPIX`); `packages/sails-ui/src/lib/realOffers.ts:124-132`
  (already-disclosed UI-only handling, not re-reported as new).
- **Finding:** DePix has no actionable entry point in any real flow —
  not even a degraded or blocked one; it is entirely absent from the
  publishable asset list.
- **Explicit instruction preserved:** do not re-open scope. DePix's
  Day-0 requirement (both Liquid and Spark) is not in question.
- **Classification:** A.

**F5 — RFCs contain stale `LiquidCovenantProvider` existence/maturity claims.**

- **Location:** `docs/rfcs/RFC-010-durable-event-store.md:161` ("the
  same pattern `escrow.service.ts`'s `LightningHodlProvider`/
  `LiquidCovenantProvider` already use" — implying both are real,
  existing, unverified-but-present classes); `docs/rfcs/RFC-008-verifiable-timestamps-and-chained-timeline.md:74`
  (lists `LIQUID_COVENANT` as a rung in an "existing precedent"
  cost-tiered `SettlementProvider` ladder alongside `MOCK`/`MULTISIG`/
  `LIGHTNING_HODL`).
- **Competing truth:** `docs/DATABASE.md:92` and `docs/BACKLOG.md` item
  20 both confirm directly: **no `LiquidCovenantProvider` file exists in
  this repository.** Confirmed independently by this sweep: no file
  matching `*liquid*` exists under `src/modules/open-settlement/`.
- **Classification:** E (maturity overclaim), in two RFCs already
  Accepted/merged into canonical protocol documentation — higher
  severity than an ordinary stale comment because these are load-bearing
  institutional documents.
- **Historical correction required, applied by this sweep** (§6 below):
  dated correction notes added directly to both RFC files, original
  text preserved verbatim per this repository's own established
  discipline (never a silent edit).

**F6/F7/F17 — Lightning/Arkade maturity and naming terminology remains stale across institutional surfaces beyond PR #118 (one correction family, not three).**

- **Locations (representative, not exhaustive):** `docs/DATABASE.md`,
  `docs/API_REFERENCE.md`, `docs/GETTING_STARTED.md:206`,
  `docs/SDK_GUIDE.md:320`, `docs/ARCHITECTURE.md:237`,
  `docs/whitepapers/TECHNICAL_WHITEPAPER.md:247-249,605`,
  `docs/whitepapers/SDK_PAPER.md:144-146`,
  `docs/whitepapers/PROTOCOL_PAPER.md:267`, `docs/SDK_usecases.md:171`
  (self-contradicts its own 2026-09-06 correction at lines 78-95 in the
  same file), `packages/sails-ui/src/lib/labels.ts:16,43` ("Bitcoin
  (Ark/Arkade)" for the only "Lightning" `AssetType` value),
  `src/modules/open-settlement/wdk-settlement.provider.ts:4-7` (stale
  header comment: "`LightningHodlProvider`... still throw[s] 'not yet
  implemented'").
- **Two distinct sub-patterns, both already corrected in README.md/
  docs/PROJECT_CONTEXT.md/docs/BACKLOG.md by PR #118, not yet corrected
  in the files above:**
  1. **Underclaim (F6):** several docs still say `LIGHTNING_HODL`/Liquid
     escrow are "not yet backed by working code" — false since
     2026-07-27 (`docs/TODO.md:162` says "done").
  2. **Naming conflation (F7/F17):** "Lightning" used without the
     Arkade caveat, or `LIGHTNING_HODL`'s own code comments left
     pointing at a since-superseded state.
- **Classification:** F (underclaim) + C/D (implementation-as-protocol-
  truth, naming conflation) — grouped as **one correction family**, not
  duplicated as three separate Technical Debt entries.

**F8 — Liquid protocol-settlement deferral wording can be mistaken for Reference Wallet Product Direction.**

- **Location:** `docs/DATABASE.md:54-66` ("consciously unsupported for
  real escrow, 2026-08-01... a real product decision, not an
  oversight"); `docs/TODO.md:193-200`; `docs/ENGINEERING_GOVERNANCE.md:353-355`.
- **Competing truth:** Liquid is Day-0-required, **and** the Satsails
  Wallet already has real, production Liquid capability today via
  infrastructure outside the Sails Protocol's own settlement-provider
  registry — SideSwap (Liquid Network DEX) and Boltz (Lightning↔L-BTC
  atomic swaps), confirmed live with $10M+ processed volume
  (`docs/REFERENCE_IMPLEMENTATIONS.md:57,59,174-181`).
- **Preserved distinction, exactly as the CTO verdict requires:**
  **Satsails Wallet capability ≠ Sails Protocol settlement provider
  maturity.** The 2026-08-01 decision was genuinely scoped to the Sails
  Protocol's own P2P-escrow rail specifically — it was a legitimate
  engineering-prioritization call at the time, not a Product Direction
  exclusion of Liquid, and does not need to be un-made. It needs an
  explicit scope disclaimer so a reader does not conflate the two
  claims.
- **Classification:** A (Reference Wallet capability, real today, not
  connected to the Sails Protocol's own Day-0 tracking).

### MEDIUM

**F9 — Conflicting institutional attribution of the current Liquid integration stack.**
`docs/REFERENCE_IMPLEMENTATIONS.md` attributes Satsails' Liquid access to
SideSwap/Boltz; `docs/whitepapers/MARKETING_WHITEPAPER.md:113`
attributes it to "Breez's SDK" — two different, uncorroborated claims
for the same capability. Classification: C.

**F10/F11/F13/F14 — Incomplete or stale Day-0/reference-wallet documentation.**
- F10: `docs/ECOSYSTEM_INTEGRATIONS.md:131-140` frames Spark as
  speculative/conditional ("if Spark's model matures") despite Day-0
  commitment, and separately states "none of the integrations below
  exist in code" — false for the Arkade-based Lightning path (see F7).
- F11: `docs/whitepapers/TECHNICAL_WHITEPAPER.md:128-132` /
  `MARKETING_WHITEPAPER.md:117-119` correctly distinguish WDK capability
  from Sails Protocol adapter maturity (a **positive** finding, the
  pattern itself is right) but only name XAUT/TON/Solana as the known
  gap — incomplete relative to the frozen target's additional six EVM
  networks.
- F13: `docs/REFERENCE_IMPLEMENTATIONS.md:38-59`'s "Existing
  Infrastructure Stack" table omits on-chain BTC, Spark, Arkade, USDC,
  XAUT, and most USDT networks — plausibly incomplete-for-purpose, risk
  of being read as exhaustive.
- F14: `docs/REFERENCE_IMPLEMENTATIONS.md:56` (Eulen DePix tokenizer)
  never specifies which chain — Liquid, Spark, or both — leaving DePix's
  dual-network Day-0 requirement unaddressed in the one document that
  names a real DePix-adjacent partner.
- **Classification:** A (F10, F13, F14), positive-with-gap (F11).

**F12 — SDK incorrectly described as aspirational/spec-only.**
`docs/ARCHITECTURE.md:248` — stale status marker; the SDK is real,
npm-published, and tested extensively per every other document read in
this sweep. Classification: F.

**F15 — `recordTradeCompletion()` increments `totalVolumeBtc` with `trade.amount` without asset/unit discrimination.**

- **Location:** `src/common/events/handlers.ts:106-133,279,376`.
- **Finding:** called unconditionally for every completed trade
  regardless of `trade.asset`, adding the raw amount into a column
  literally named `totalVolumeBtc` — satoshi-scale for BTC/LN_BTC,
  6-decimal-USDT-scale for `USDT_ERC20` trades settled via
  `WdkSettlementProvider`, with no comment disclosing the cross-asset
  mixing. Confirmed the field is not currently read anywhere in `src/`
  (grep, no consumer) — limits blast radius today, but is a live
  correctness trap the moment any consumer reads it.
- **Not duplicated against `docs/TECHNICAL_DEBT_AUDIT.md` item #42**,
  which covers a different, narrower question (timing of volume
  recognition relative to reorg), not cross-asset unit conflation.
- **Classification:** C. **Registered as Technical Debt requiring
  semantic/architecture review before any fix — this sweep does NOT
  choose the replacement metric or schema.**

**F16 — QVAC schemas claim synchronization with `AssetType` but omit currently-real enum values including SPARK.**

- **Location:** `src/modules/open-agents/qvac-agent.provider.ts:127-137,172-177`
  (`TRADE_INTENT_SCHEMA`/`OFFER_INTENT_SCHEMA`), comment: "kept in sync
  with `common/types/index.ts`'s `AssetType`... by hand."
- **Finding:** the schema enum has 7 values; the real `AssetType` has
  10 (missing `SPARK`, `STACKS`, `RSK_BTC`) — the "kept in sync" claim
  is false. `SPARK` is Day-0-required. Every other hand-duplicated copy
  of this enum in the codebase (`intent.routes.ts`, `liquidity.routes.ts`,
  `agent.routes.ts`, `offer-envelope.ts`) correctly lists all 10 — this
  file is the one outlier.
- **Classification:** C (contract drift). **Registered as Technical
  Debt / contract drift. Do NOT mechanically patch before the Asset/
  Network semantic architecture decision (docs/BACKLOG.md item 20's own
  open question) is resolved, unless a later CTO mission explicitly
  authorizes an interim mechanical fix.**

**F18-F21 — Already covered by the existing Asset/Network/Settlement architecture obligation (`docs/BACKLOG.md` item 20). Cross-linked only, not duplicated:**
- F18: single-EVM-network hardcoded config in `config/index.ts`'s
  `wdk`/`safeGuardEvm` blocks and both providers' module-singleton
  pattern (concrete code evidence for the open question already named).
- F19: `PayoutAddress` uniqueness key is `(participantId, asset)`, no
  network dimension — concrete downstream consequence of the same open
  question.
- F20: `docs/rfcs/RFC-020-non-custodial-evm-settlement.md`/`RFC-019`
  treat "EVM" as one generic rail rather than a family of Day-0-required
  networks — corroborating, not new.
- F21: XAUT has zero references anywhere in `packages/sails-sdk`,
  `packages/sails-ui`, or `examples/**` — corroborates the already-known
  `AssetType`/SDK representability gap end-to-end; no new obligation.

---

## 5. Legitimate deferrals confirmed (preserved, not re-litigated)

- **RGB** — ROADMAP/FUTURE, confirmed NOT Day-0 by explicit Product
  Direction. May be used as an architecture-extensibility example only.
  Not promoted by this sweep.
- OpenFinance module — consistently and correctly labeled future across
  every document read.
- HodlHodl liquidity-aggregation removal (`src/modules/open-liquidity/liquidity.service.ts:406-414`)
  — a legitimate, explicitly milestone-scoped project-owner decision,
  not a permanent exclusion.
- RFC-021/RFC-022/RFC-024's careful Lightning-vs-Ark handling — already
  correct; RFC-021 even self-corrected an earlier draft's identical
  naming mistake before this sweep existed.
- RFC-013's chain-agnostic `WalletAdapter` design — already correct, no
  hardcoded asset/network list.
- `escrow-providers.ts`'s own `RECOMMENDED_ESCROW_TYPE` — exemplary
  self-disclosure of exactly which assets have no real provider; not a
  blind spot, a model to follow.
- `IntentFacade.negotiate()` — already correctly disclosed as a known,
  intentional residual with a working alternative pointed to.

---

## 6. False positives investigated and rejected

"Liquidity Provider" mentions in RFC-007/008/009/011 (≠ the Liquid
network); RFC-023's PolicyEngine deferral (legitimate, unrelated to
asset scope); RFC-015's dual-approval scope cut (legitimate);
`docs/GOVERNANCE.md` hits for the scope-language wordlist (process
language only); `dispute.service.ts:776`'s silent default-to-`'BTC'`
fallback for an appeal-fee row (defensive code for a should-never-happen
null case, low confidence it's reachable in practice); `pear.routes.ts:29`'s
incomplete P2P topic enum (low priority — the missing assets have no
settlement provider regardless).

---

## 7. Resulting backlog obligations (grouped, not 21 items)

Registered in `docs/BACKLOG.md` as a new Cold Sweep entry, cross-linking
rather than duplicating wherever an existing obligation already covers
the finding:

1. **Reference Wallet payout destination / end-to-end payout truth**
   (F1) — cross-linked to the Day-0 Production Reality Sweep obligation.
2. **Reference Wallet Day-0 capability integration coverage** (F2, F3,
   F4) — architecture/integration sequencing, not a product decision.
3. **Institutional maturity/terminology reconciliation** (F5, F6, F7,
   F8, F9, F10, F11, F12, F13, F14, F17) — one correction family.
4. **Cross-asset volume semantic debt** (F15).
5. **QVAC Asset contract drift** (F16).
6. **Existing Asset/Network/Settlement architecture obligation —
   cross-link only** (F18, F19, F20, F21) — no new entry created.

Full detail for each: `docs/BACKLOG.md`, this sweep's own Cold Sweep
entry.

---

## 8. Progress-percentage treatment

**No single completion percentage is recorded by this sweep, and the
previously-stated single-percent estimate from the prior discovery pass
is explicitly non-authoritative** — it used a Day-0 denominator that was
itself incomplete at the time. Progress must be tracked across separate,
non-collapsible dimensions: institutional completeness, architecture
completeness, Day-0 representability, provider maturity, Reference
Wallet integration, evidence maturity, and production readiness. No
numerical value is assigned to any of these here without a defensible
denominator — assigning one would itself repeat the exact class of
institutional failure this sweep exists to correct.

---

## 9. Provenance

This document, `docs/BACKLOG.md`'s corresponding Cold Sweep entry,
`docs/ENGINEERING_GOVERNANCE.md` §10A, `docs/TECHNICAL_DEBT_AUDIT.md`'s
new entries for F15/F16, and the dated correction notes added to
`docs/rfcs/RFC-010-durable-event-store.md` and
`docs/rfcs/RFC-008-verifiable-timestamps-and-chained-timeline.md`
together constitute the full institutional record of this sweep. An
external reviewer can reconstruct every obligation's origin from this
document alone, cross-referenced against the exact file:line evidence
cited in §4.
