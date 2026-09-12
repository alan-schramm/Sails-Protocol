# Asset / SettlementRail / Adapter / Provider — Discovery & Design Record (2026-09-12)

**Status: institutional evidence record. Discovery + design only — no
implementation authorized by this document.** The decisions this record
supports are frozen in `docs/adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md`
and `docs/PROJECT_CONTEXT.md` §2C. This document exists so an external
reviewer can reconstruct exactly why each frozen decision exists,
without re-running the discovery.

Addresses `docs/BACKLOG.md` item 20.6 (Asset/Network/Settlement
architecture obligation — mechanism previously not frozen).

---

## 1. Purpose

`docs/BACKLOG.md` item 20 froze the Full Reference Wallet Day-0
Capability Target (2026-09-10) and explicitly left its representation
mechanism as an open architecture question: the flat `AssetType` enum
"does not scale... without either a combinatorial explosion of new flat
values or a genuine Asset × Network × Settlement-Capability
decomposition." This record documents the discovery that produced, and
the design that specified, the answer frozen in ADR-002.

## 2. Frozen methodology

Three parallel, read-only research passes (institutional docs; code
taxonomy — `AssetType`/`EscrowType`/provider registry/QVAC schema/Prisma;
SDK+UI+tests) followed by direct verification of the highest-leverage
findings against source (`PROTOCOL_SPECIFICATION.md`, `PROJECT_CONTEXT.md`,
`PRINCIPLES.md`, `SEMANTIC_KERNEL.md`, RFC-005, RFC-013, Issue #105).

## 3. Institutional evidence found

- **`docs/PROTOCOL_SPECIFICATION.md:1241-1243`** already specifies
  `interface SettlementAdapter extends SettlementProvider { chain: 'bitcoin' | 'liquid' | 'lightning' | 'evm' | 'solana' | 'ton' | string }`
  — the reference implementation never adopted it. Its own value list
  already misuses "chain" for `'lightning'` (a payment protocol, not a
  chain) — direct evidence the imprecision this record fixes predates
  this mission.
- **`docs/PROJECT_CONTEXT.md:417-422`**: *"Do not collapse wallet
  adapters and settlement rails... A wallet may use one kit while
  settling over several eligible rails."* **`:450-456`**: *"Normalize by
  capability family, not through one universal generic interface."*
  Both directly pre-date and pre-answer this mission's Adapter/Provider
  and anti-God-object questions.
- **`docs/PRINCIPLES.md`** Principle 6 (Infrastructure Neutral):
  *"Bitcoin, Liquid, Lightning, Stacks, RSK, and any future chain are
  all equally valid `SettlementProvider` implementations."* Principle 9
  (Interface Agnostic). Principle 5 (Capability Based) — the RFC-005
  permission sense, not this mission's settlement-capability sense (see
  below).
- **`docs/SEMANTIC_KERNEL.md`** K1–K3, read in full: no mention of
  Asset, Network, or Provider identity anywhere. §25 confirms "Sails
  Core" (where such a model might eventually live) is not yet built or
  authorized. Confirms zero Kernel impact for this whole architecture.
- **`docs/rfcs/RFC-005-capability-model.md`**: already resolved one
  "capability" word-collision (module-category sense vs. permission
  sense) before this mission — evidence that a *third* sense
  ("settlement capability," this record's own vocabulary) must be kept
  textually distinct, not reused carelessly.
- **`docs/rfcs/RFC-013-capability-registry-and-wallet-adapter.md`**:
  `WalletAdapter`'s `getAddress(asset: string)` etc. — already
  chain-agnostic by design (bare string, never `AssetType`).
  `WalletCapabilitiesDeclaration.fiatRails: string[]` — confirms "rail"
  is **already** an established, different-meaning term in this
  codebase (fiat payment rails), motivating ADR-002 §"why SettlementRail"'s
  naming caution.
- **Three independently-worded restatements of the same underlying
  rule**, never cross-linked before this record: `docs/PRODUCT_TRUTH_SWEEP_2026-09-10.md:35-46`
  (origin, fullest form, with worked examples), `docs/BACKLOG.md:1915-1951`
  (verbatim copy of the worked examples), `docs/PROJECT_CONTEXT.md:511-527`
  (compressed summary). A fourth, narrower, wire-protocol-scoped sibling
  exists at `docs/DAY0_COMPLETENESS_COLD_SWEEP.md:400,557`
  (*"Asset identity ≠ Network identity ≠ Settlement-provider identity"*)
  — real, not identical, never cross-linked to the other three. This
  fragmentation is recorded here, not yet remediated (see §8).
- `docs/DESTINATION_AUTHORITY_ARCHITECTURE.md`'s Economic Disposition /
  Destination / Execution Authority three-way distinction is a
  **different, adjacent** rule (about authority, not identity) —
  disambiguated explicitly after an initial research-pass conflation.

## 4. Code evidence found

- `AssetType` — 5 independently-maintained, currently value-identical
  copies (`src/common/types/index.ts`, `packages/sails-sdk/src/types.ts`,
  `packages/sails-p2p-schemas/src/escrow.ts`, `prisma/schema.prisma`, and
  `src/common/types/trade.ts` importing the first). 10 values conflate
  asset+network+rail: `USDT_ERC20`/`USDT_TRC20`/`USDT_LIQUID`/`USDT_LIGHTNING`
  = asset+network; `LN_BTC`/`LIQUID_BTC`/`RSK_BTC` = asset+protocol;
  `SPARK`/`STACKS` = protocol/network only, no distinguishable asset
  component.
- `escrow-providers.ts`'s `RECOMMENDED_ESCROW_TYPE` maps only 3 of 10
  `AssetType` values to any real provider (`BTC→MULTISIG`,
  `LN_BTC→LIGHTNING_HODL`, `USDT_ERC20→WDK_USDT_EVM`) — hand-duplicated
  a second time, identically, in `packages/sails-sdk/src/modules/settlement.ts:294-298`.
  `LIQUID_COVENANT` (a real `EscrowType`) has zero implementation.
- `LIGHTNING_HODL`'s real backing (`lightning-hodl.provider.ts`) is the
  Ark protocol via `@arkade-os/sdk` against Mutinynet — not plain
  Lightning HTLCs (its own header comment: *"Real Lightning (plain
  HTLCs) has no genuine multi-party escrow primitive"*) — confirming
  `LN_BTC`'s name and its real provider's protocol disagree.
- `custodyModel` on each provider (`multisig.provider.ts:431`,
  `lightning-hodl.provider.ts:141`, `safe-guard-evm.provider.ts:314`,
  `wdk-settlement.provider.ts:121`) describes **key custody only** —
  never network/protocol; MOCK has no `custodyModel` field at all
  (`getCustodyModelForType()` returns `null` for it, by its own design).
- `WalletAdapter` (`packages/sails-sdk/src/wallet-adapter.ts`) — already
  asset/network-agnostic (`asset: string`, never `AssetType`).
- `qvac-agent.provider.ts`'s `TRADE_INTENT_SCHEMA`/`OFFER_INTENT_SCHEMA`
  hand-duplicate a 7-value asset enum (missing `SPARK`/`STACKS`/`RSK_BTC`)
  — the F16 contract-drift finding, now traced to the same root cause
  (no single source of truth for asset/rail scope).
- `Offer.network`/`Trade.network`/`Escrow.network` — real schema fields,
  confirmed **never read** by any provider-selection logic anywhere in
  the repository; an untyped, unvalidated, effectively-decorative first
  attempt at the exact dimension this architecture now formalizes.
- `packages/sails-ui/src/lib/labels.ts`'s `ASSET_LABELS` smuggles
  network into display strings (`'Bitcoin (Ark/Arkade)'`,
  `'USDT (ERC-20)'`) and additionally contains 11 labels
  (`DEPIX, ETH, BNB, SOL, LTC, WBTC, USDC_ERC20, USDC_POLYGON, USDC_BASE,
  SBTC_STACKS, USDCX_STACKS`) with **no backing `AssetType` value at
  all** — an informal, disconnected forward-declaration of Day-0
  breadth at the UI layer.
- `PublishOffer.tsx`'s `NETWORK_BY_ASSET` derives "network" silently
  from the flat asset choice; the UI has no network/rail control
  anywhere.
- The SDK independently uses "network" for two **unrelated** concepts:
  (a) Bitcoin mainnet/testnet/regtest environment selection (`escrow-key-derivation.ts`,
  `wallet-verification.ts` — extensive), and (b) the vestigial
  chain-identity field noted above — a genuine naming collision inside
  the SDK itself, separate from the "fiat rail" collision noted in §3.

## 5. Candidate models evaluated

- **Model A (current)** — status quo, described in full above; not
  cleaned up, not recommended.
- **Model B (minimum correct, adopted)** — Asset + SettlementRail as two
  small identity enums; SettlementScope as a sparse, explicitly-registered
  list; Settlement Capability as structural metadata on a Provider
  registration (extending the already-real optional-method pattern,
  e.g. `splitFunds?`); Adapter and Provider conceptually distinct but
  not required to be separate runtime classes; Interoperability and
  Maturity as non-identity metadata layers. Frozen in ADR-002.
- **Model C (future-extensible)** — considered, **not adopted**: Model B
  already absorbs every stress case tried (alternative Lightning
  implementations, future Spark providers, new stablecoin networks,
  RGB, Cashu, Fedimint, alternative Liquid/EVM stacks) by registering a
  new row or a new Provider, never by branching Core. The one plausible
  future need (ecash/note-based settlement) is a vocabulary extension to
  Settlement Capability (e.g. `invoicePayout` vs `addressPayout`,
  already anticipated), not a new architectural layer.

## 6. Day-0 representation proof

All 25 canonical `{asset, rail}` rows (ADR-002 §5) are representable as
sparse registry rows with zero new Core branches; ~21 of 25 have zero
providers today and remain valid, in-scope rows — proving provider
maturity never gates Product Scope under this model. Full per-row
mapping: ADR-002 §5.

## 7. Legacy identifier findings

See ADR-002 §11 for the frozen treatment. Summary: 5 high-confidence
mappings recorded (not implemented); `LN_BTC` flagged as requiring an
explicit future decision (name says Lightning, real evidence is
Arkade); `STACKS`/`RSK_BTC` flagged as outside the current frozen Day-0
scope entirely, requiring their own future Product Decision (plausibly
Roadmap/Future, analogous to RGB's already-settled status — not decided
here).

## 8. Institutional delta

- **Already exists, cross-linked by this record rather than
  duplicated:** the Adapter-vs-Provider distinction (`PROJECT_CONTEXT.md`),
  the anti-God-object principle (`PROJECT_CONTEXT.md`), the
  `SettlementAdapter.chain` field (`PROTOCOL_SPECIFICATION.md`, now
  given a dated clarification note, not rewritten), the RFC-005
  capability-word precedent.
- **Stale:** none newly found beyond what `docs/BACKLOG.md` 20.3 already
  tracks.
- **Contradictory (fragmented, not conflicting):** three-plus
  restatements of the same "identity ≠ implementation ≠ provider ≠
  interoperability" rule across `PRODUCT_TRUTH_SWEEP_2026-09-10.md`,
  `BACKLOG.md`, `PROJECT_CONTEXT.md`, and `DAY0_COMPLETENESS_COLD_SWEEP.md`
  — recorded here as a known fragmentation; cross-linking them fully is
  left to Issue #125's own future truth-reconciliation pass, not
  attempted in this mission.
- **Genuinely missing before this record:** a named architecture for
  the Asset/Rail/Provider decomposition itself — now supplied by
  ADR-002.
- **Belongs under `docs/BACKLOG.md` 20.2/20.5:** both become direct
  future *consumers* of ADR-002's registry once implementation is
  separately authorized — cross-linked, not duplicated.
- **ADR required:** yes — `ADR-002`, this record's own companion.
- **Product Decision required:** yes — `docs/PROJECT_CONTEXT.md` §2C.
- **New issue needed:** no — `docs/BACKLOG.md` item 20.6 already exists
  as the correct home; Issue #125 already exists as the correct home
  for the fragmented-restatement cross-linking noted above.
