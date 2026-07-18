# SDK_usecases.md
### Sails Protocol — Future SDK Family, Use-Case by Use-Case

> **This is a vision/roadmap document, not a spec and not a commitment.**
> It does not change, replace, or broaden today's actual product scope —
> that remains exactly what `PROJECT_CONTEXT.md` and `README.md` already
> say: **one named, shipping product, the Sails P2P Trading SDK**,
> deliberately scoped narrow (a prior external review flagged
> "genericness" as an adoption blocker, and that's the reason the scope
> was narrowed in the first place — see `PROJECT_CONTEXT.md` for the full
> story). Nothing here is built, none of these are announced products,
> and none of the candidate names below are final. The point of writing
> this down is narrower and more useful than a product announcement: to
> register, in one place, how the same real core primitives *could*
> extend into other named SDKs later — so a team building on this
> protocol has something concrete to react to, object to, or build
> instead of guessing.

## Why this exists, and why it isn't "Compliance SDK"

An earlier draft of this document used the term "Compliance SDK" for the
policy/rules use case. That term was removed deliberately — "compliance"
implies KYC/AML/regulatory coverage this protocol does not provide and
has no plan to claim. What actually exists (or will exist) is a
**Policy Engine use case**: a way for a wallet or agent to declare and
check capabilities/rules before acting. That's a real architectural
component (`PROTOCOL_SPECIFICATION.md` §1.10, `RFC-005`), not a
regulatory claim, and the renamed term keeps it that way.

## Status Legend

Same legend `ROADMAP.md` already uses, applied here per use case so
this document can't be read as claiming more than what's actually true
today:

- **✅ Proven** — implemented and functional in the reference implementation
- **🏗️ Specified** — interface/contract defined, implementation partial or stubbed
- **📋 Aspirational** — on the roadmap, spec not yet written

## The shared foundation every use case below builds on

| Pillar | Status | What it actually is today |
|---|---|---|
| `WalletAdapter` | 🏗️ Specified | Real interface in `@sails/sdk` (RFC-013) — `getPeerId()`/`getAddress()`/`signTransaction()`/etc. A wallet implements it; the SDK never assumes how signing happens. |
| Capability Registry | ✅ Proven | Real, persisted (`CapabilityGrant`, RFC-013), and — as of RFC-014/015 — actually **enforced** at the two real money-moving choke points (`intentEngine.create()`, `escrow.service.ts`'s `releaseFunds()`), not just a store nothing consults. |
| Policy Engine (governed rules) | 📋 Aspirational | **Correction from an earlier draft of this document, which said this was already implemented — it is not.** `policy-engine.ts` today only has `validateFinancialSanity()` (the CISO Economic Rule — a hardcoded sanity check, not a governed/configurable rule system). The `get`/`propose`/`activate` governed-policy interface `RFC-012`'s own Alternatives Considered describes has never been built. This is the one pillar in this table that's a real gap, not a nuance — see the Policy use case below for what that means concretely. |
| OpenReputation | ✅ Proven | `recordOutcome()` is the sole input to `User.reputationScore` (RFC-007 D8/D9, dispute-aware), `rate()` is real informational feedback, both tested (`tests/reputationOutcome.test.ts`). Not yet packaged as a *portable, cross-module* SDK surface usable outside OpenP2P (`ROADMAP.md` Months 7-9) — the computation is real, the standalone distribution isn't built. |
| Pears (`peerId`) | ✅ Proven | Real HyperDHT/Hyperswarm identity substrate — a participant's `peerId` is a real, persisted, portable Ed25519 public key (RFC-013's Motivation section has the full correction of what Pears is and isn't). |
| QVAC (local inference) | ✅ Proven | Real on-device LLM inference (`@qvac/sdk`), live-smoke-tested this project, no cloud call. Produces structured signals an agent or the (still-aspirational) Policy Engine can act on — it does not decide unilaterally (RFC-007 D7). |

## The use cases

Each one below is framed the way Breez frames its own SDK family
(breez.technology/sdk — one brand, several sharply-scoped products on
shared technology, so nobody looking at any single one has to guess what
it does) — the same pattern `PROJECT_CONTEXT.md` §3's Named-SDK Rule
already commits this protocol to. **Candidate name** below means exactly
that: a candidate, following the existing "Sails P2P Trading SDK" /
"Sails P2P Lending SDK" naming pattern, not a decision made in this
document.

### 🔄 Trading — *the one that already ships*

- **Status: ✅ Proven.** This is not a future use case — it's
  `PROJECT_CONTEXT.md`'s **Sails P2P Trading SDK**, shipping today
  (`@sails/sdk`, OpenP2P + OpenSettlement + OpenReputation +
  OpenIdentity). Included here only so the comparison table below has
  the real baseline next to the aspirational ones, not to suggest it's
  new.
- Market equivalents: Binance P2P, Bisq, HodlHodl.
- Differentiator: not a platform an integrator visits — a library any
  wallet embeds, carrying **portable** reputation (via `peerId`) instead
  of reputation locked inside one platform's silo.

### 💸 Settlement — *candidate: "Sails Settlement SDK"*

- **Status: 🏗️ Specified.** OpenSettlement's escrow lifecycle, WDK USDT
  release, and dispute resolution are real and tested — but only for
  `WDK_USDT_EVM` and `MOCK`. `LightningHodlProvider`/
  `LiquidCovenantProvider` both still throw "not yet implemented"
  (`TODO.md` §4). The "abstract multiple rails behind one interface"
  value proposition is real *as an interface* (`SettlementProvider`),
  not yet real as delivered multi-rail coverage.
- Market equivalents: Lightning (LDK), Liquid, Strike.
- Differentiator: a team wanting only cross-rail settlement — without
  adopting the full P2P trading/negotiation flow — could integrate this
  slice alone once the additional providers exist.

### 🌊 Liquidity — *candidate: "Sails Liquidity SDK"*

- **Status: 🏗️ Specified.** Real order book, offer matching, and
  aggregation (`liquidity.service.ts`) — genuinely real code, not a
  mock. "Cross-rail" (PIX, BRL, BTC, USDT routed through one interface)
  describes the data model today; live routing/execution across
  disparate rails at once is not yet proven end to end (no live
  environment has run it, `HANDOFF.md`).
- Market equivalents: 1inch, CowSwap, OTC order books.
- Differentiator: not limited to EVM/DeFi liquidity — fiat rails
  (PIX/BRL) are first-class, not bolted on.

### ⭐ Reputation — *candidate: "Sails Reputation SDK"*

- **Status: ✅ Proven as a module, 📋 Aspirational as a standalone SDK.**
  The scoring itself is real and dispute-aware. What doesn't exist yet
  is packaging it so a wallet with *no other Sails integration* could
  pull in just portable reputation — today it ships bundled inside the
  Trading SDK.
- Market equivalents: Binance P2P ratings, Bisq reputation.
- Differentiator: reputation tied to a portable `peerId`, not to one
  platform's account — a trader's history could follow them across
  wallets built on this protocol.

### 🛡️ Policy — *candidate: "Sails Policy SDK"*

- **Status: Capability Registry ✅ Proven (and enforced, RFC-014/015);
  Policy Engine (governed, versioned rules) 📋 Aspirational.** This is
  the correction from the earlier draft, stated plainly: what's real
  today is checking a participant against a static, self-issued
  `CapabilityGrant`. What's aspirational is a governed rule system
  (propose a rule, version it, activate it, evaluate scopes against it)
  — `RFC-012`'s own Alternatives Considered explicitly deferred this,
  and it remains deferred as of this document.
- Market equivalents: internal permission/rule systems generally (no
  single named product maps cleanly — this is closer to an
  authorization framework than a market category).
- Differentiator, once built: capability declaration and policy
  evaluation as a reusable primitive, explicitly **not** KYC/AML — see
  "Why this exists" above.

### 🤖 AI (QVAC) — *candidate: "Sails Agent SDK"*

- **Status: The underlying integration is ✅ Proven (real local
  inference, live-tested); a dedicated external-facing Agent SDK surface
  is 📋 Aspirational.** `qvac-agent.provider.ts` and the `BuyerAgent`/
  `SellerAgent` pattern are real, working code today — but they're
  internal to this reference implementation, not yet exposed as
  something a third-party team could adopt directly.
- Market equivalents: Hummingbot, Gauntlet, trading bots generally.
- Differentiator: on-device inference (no cloud dependency, no API key),
  producing signals that feed a Capability/Policy check rather than
  acting unilaterally (RFC-007 D7 — an agent proposes, it doesn't decide
  alone).

## Comparison table

| Use case | Market equivalent | Similarity | Differentiator | Status |
|---|---|---|---|---|
| Trading | Binance P2P, Bisq, HodlHodl | P2P market, seller reputation, escrow | Embeddable library, not a platform; portable reputation via `peerId` | ✅ Proven — shipping today as the Sails P2P Trading SDK |
| Settlement | Lightning (LDK), Liquid, Strike | On/off-chain settlement, fiat↔crypto rails | One interface across rails | 🏗️ Specified — WDK_USDT_EVM real, Lightning/Liquid still stubs |
| Liquidity | 1inch, CowSwap, OTC books | Liquidity discovery, order matching | Fiat rails (PIX/BRL) first-class, not EVM-only | 🏗️ Specified — real order book, cross-rail *routing* not yet proven live |
| Reputation | Binance P2P ratings, Bisq | Trade-history-based score | Portable across wallets via `peerId`, not platform-locked | ✅ Proven as a module / 📋 Aspirational as a standalone SDK |
| Policy | Internal permission/rule engines | Capability/rule validation | Not KYC/AML — a reusable authorization primitive | Capability Registry ✅ Proven+enforced / Policy Engine 📋 Aspirational |
| AI (QVAC) | Hummingbot, Gauntlet | Automated offer/risk evaluation | On-device inference, feeds a policy check rather than deciding alone | Integration ✅ Proven / external Agent SDK surface 📋 Aspirational |

## What this document is for

To register these use cases where a team evaluating or building on Sails
Protocol can find them — including a team that never talks to the
current maintainers directly — and let the real, already-built core
(Capability Registry, OpenReputation, Pears `peerId`, QVAC) suggest what
else it could become, without overselling any of it as already built.
If a future team wants to build one of these for real, that work starts
the same way every real change to this protocol does: an RFC
(`CONTRIBUTING.md`, `GOVERNANCE.md`) — this document is the idea, not the
proposal.
