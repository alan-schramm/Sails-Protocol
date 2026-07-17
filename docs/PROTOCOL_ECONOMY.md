# PROTOCOL_ECONOMY.md
### Sails Protocol — Engineering Handoff · Document 14 of 20

> **Where this fits:** none of the other 13 documents cover economic design
> at this depth. `ROADMAP.md` has the grant budget (how the *initial*
> $400k is spent); `PROJECT_CONTEXT.md` briefly states the "no speculative
> token" principle. This document is the actual economic architecture:
> how the protocol sustains itself indefinitely, how it incentivizes six
> distinct stakeholder groups, and exactly how fees flow — with worked
> comparisons against Morpho, Aave, Uniswap, Bisq, HodlHodl, and Lightning.
>
> Read `PROTOCOL_SPECIFICATION.md` first — the fee mechanisms described
> here attach to the Settlement and Reputation primitives defined there.
>
> **Expanded following an external economic-model review** ("Architecture
> Directive — Economic Model & Adoption Strategy"): sections 1B, 1C, 2B,
> 3B, 4.7, 5B, and 8B are new; 4.5 and 6.2 were extended in place. This
> document is not a technical specification — per that review's own
> instruction, economic architecture and protocol specification are kept
> deliberately separate; where a mechanism here depends on a technical
> primitive or Adapter interface, it is cross-referenced by name, never
> redefined. **Section 3C** (Partner Neutrality) was added in a follow-up
> pass, not part of the original directive — see that section for why it
> is documented here rather than as a new numbered principle in
> `PRINCIPLES.md`. The Sails Foundation concept (a further follow-up) is
> primarily documented in `GOVERNANCE.md` §2B, cross-referenced from
> sections 3 and 4.3 here rather than duplicated.

---

## 1. The Core Constraint: No Speculative Token

**Sails Protocol does not issue, require, or depend on a native token.**

This is a deliberate architectural constraint, not an oversight. Three
reasons:

1. **Regulatory simplicity.** A protocol whose core function (escrow,
   settlement, reputation) depends on a speculative asset invites securities
   scrutiny that has nothing to do with whether the coordination layer
   itself works. Removing the token removes that entire risk surface.
2. **Alignment with "Bitcoin-first, not Bitcoin-only."** Introducing a
   Sails-native token would compete with the assets the protocol is meant
   to coordinate (BTC, USDT, etc.) rather than serve them.
3. **It's not necessary.** Section 4 below shows, module by module, that
   every stakeholder group can be incentivized using the settlement assets
   already flowing through the protocol — the same insight that lets
   HodlHodl and Lightning function without a token (see section 5).

This constraint disciplines every design choice in this document: if a
mechanism can only work by paying someone in a new token, that mechanism is
rejected and redesigned to pay in BTC, USDT, or another already-supported
settlement asset instead.

---

## 1B. Value Capture Principle: Infrastructure, Not Users

**Added following an external economic-model review (Architecture
Directive — Economic Model & Adoption Strategy) — this section makes
explicit a rule the fee mechanics in section 6 already implied but never
stated as its own principle.**

**The protocol does not monetize users. The protocol monetizes operations
executed through the infrastructure it coordinates.**

This is a real distinction, not a rephrasing:

- A user who never trades, never negotiates, never settles costs the
  protocol nothing and owes it nothing — there is no per-account fee,
  no subscription, no cost to simply holding a `Participant` identity
  (`PROTOCOL_SPECIFICATION.md` §1.1).
- The Protocol Fee (section 6) only ever attaches to a completed
  `Settlement` — a real operation that used the Intent → Discovery →
  Negotiation → Settlement pipeline the protocol actually built and
  coordinated.
- This is the same reasoning that separates Morpho, Hyperliquid, Uniswap,
  and Aave from a platform that charges for access or accounts: value
  capture is tied to *coordinating* an operation, not to *controlling*
  who may participate (`PRINCIPLES.md` principle 7, "Open Integrations" —
  no approval process gates who may build against the protocol).

**Why this matters for the wallet-adoption argument (1C below):** it is
what makes the rebate model in section 4.5/4.7 sustainable rather than
extractive — a wallet integrating the SDK is not paying the protocol to
access users, it is sharing in fee revenue generated only when its users
actually transact through the infrastructure the protocol provides.

## 1C. The Wallet Economy — Why This Section of the Document Exists

**Added following the same review.** Any wallet founder evaluating the
Sails P2P Trading SDK (the MVP's branded release of `@sails/sdk` — see
`PROJECT_CONTEXT.md` section 3) asks one question in the first thirty
seconds: *"Why would I integrate the Sails Protocol if I already have a
working wallet?"* If the
honest answer is "because it's an elegant architecture," nobody integrates
— elegance doesn't pay engineering salaries. The answer this document has
to make true is: **"because your wallet gains new, low-effort revenue
streams it would otherwise have to build (or forgo) entirely."**

**Today, most non-custodial wallets monetize very little.** Revenue
typically comes from swap spreads, on/off-ramp fees, affiliate referrals,
donations, and hardware-wallet sales — the wallet itself is close to a
free product, a cost center the rest of the business subsidizes.

**With the Sails Protocol, a wallet stops being just a wallet.** It
becomes a financial application that earns revenue by participating in
the ecosystem — without building marketplace, reputation, escrow,
mediation, settlement, agent, or liquidity infrastructure itself. Section
4.5, 4.7, and 6.2 below specify exactly how; this section exists only to
name the strategic reason those mechanisms matter: **a protocol only
reaches network-effect scale when the technical architecture and the
economic architecture evolve together.** A well-designed protocol with no
incentive for a third party to integrate it stays a single company's
internal tool, no matter how sound the engineering is.

---

## 2. How the Protocol Sustains Itself Financially

Four revenue mechanisms, all denominated in existing settlement assets or
fiat — never a protocol-native token:

| Mechanism | Description | Who pays |
|---|---|---|
| **Protocol Fee** | A small, configurable fee on successful settlement (trade, future loan/swap) | Split between the two counterparties |
| **API / SDK Usage Tiers** | Free sandbox + low-volume tier; paid tier for high-volume integrators needing SLA | Integrators above the free tier |
| **Enterprise Licensing** | White-label protocol access with dedicated support for OTCs, fintechs, exchanges | Enterprise licensees |
| **Premium Reputation Services** | Optional advanced verification, analytics, badges for high-volume participants | Opt-in participants |

The **Protocol Fee** is the only mechanism structurally tied to the
protocol's core function (settlement) — it is the primary long-term
sustainability engine and the only one analyzed at the fee-flow level in
section 6. The other three are reference-implementation/business-layer
revenue (Satsails' business model, not the protocol's), included here for
completeness because they fund the same ecosystem.

## 2B. Future Revenue Sources (architecture-ready, not implemented)

**Added following the same review — explicitly not a commitment to build
any of these now.** The point of naming them here is the same discipline
`PROTOCOL_SPECIFICATION.md` §4B already applies to Settlement/OpenFinance/
Transport Adapters: the architecture must stay capable of supporting a
future source of value capture without a redesign, even while nothing
below is scheduled:

- **Marketplace P2P** — today's mechanism (section 6), already live in
  principle via `Sails OpenP2P`.
- **Settlement** — direct fees on future `SettlementAdapter` (§4B)
  implementations beyond today's escrow flow (e.g. Lightning HODL,
  Liquid Covenant, once real).
- **Liquidity Routing** — a fee on `Sails OpenLiquidity`'s aggregation
  across multiple `LiquidityProvider`s (`liquidity.service.ts`'s
  `LiquidityRouter`) once external providers (HodlHodl, RoboSats) are
  real, not stubbed.
- **OpenFinance** — `LoanIntent`/`SwapIntent`/`EarnIntent` (§2.3,
  `PROTOCOL_SPECIFICATION.md`) each carry the same Protocol Fee mechanism
  as `TradeIntent` once implemented — no new fee design needed, the
  existing Settlement-attached fee already generalizes.
- **Agent Marketplace** — a future fee or revenue-share on `Sails
  OpenAgents`/QVAC-mediated automated trading, matching/negotiation, or
  risk analysis performed on a Participant's behalf (§1.7).
- **Enterprise Services** — expands section 2's existing Enterprise
  Licensing row (white-label, dedicated support, SLA).
- **Commercial APIs** — expands section 2's existing API/SDK Usage Tiers
  row for higher-volume or higher-guarantee integrators.
- **Premium Infrastructure** — e.g. priority routing, dedicated node
  capacity, or enhanced `EventStore` durability (RFC-010) tiers for
  integrators who need stronger guarantees than the open default.

None of these change section 1's no-token constraint or section 1B's
infrastructure-not-users principle — every one of them, if and when built,
is a fee on a real operation executed through real protocol
infrastructure, paid in an existing settlement asset or fiat.

---

## 3. How the Protocol Evolves After the Grant

The $400,000 grant (`ROADMAP.md`) funds Months 1-12 of protocol
*engineering* — it is explicitly not meant to be a permanent funding source.
The transition looks like this:

```
Months 1-12 (grant-funded)
  → Protocol Engineering, Security Audits, SDK, Operations
  → Protocol Fee is OFF (0%) — matches the existing roadmap commitment to
    prioritize adoption over extraction during the bootstrap phase

Months 12+ (post-grant, self-sustaining)
  → Protocol Fee activates at a low default (e.g. 0.05%-0.15%,
    configurable per module — see section 6)
  → Fee revenue seeds a Developer/Treasury Fund (section 4.3)
  → Enterprise Licensing and Premium Reputation revenue (Satsails' own
    business layer) supplements but does not replace protocol-level
    sustainability

Months 18+ (governance maturity)
  → Fee parameters and Treasury Fund disbursement move from
    Satsails-controlled to the multi-stakeholder "Governance layer v1"
    already committed in ROADMAP.md's Months 10-12 phase
  → This is the anti-centralization mechanism — see section 7
```

This mirrors how the Ethereum Foundation or the Uniswap Foundation used
initial concentrated funding/control to bootstrap an ecosystem, then handed
fee-parameter and treasury governance to a broader body once the protocol
had enough real usage to make that governance meaningful rather than
theoretical.

**Concrete entity structure for "Governance Layer v1":** `GOVERNANCE.md`
§2B names this — Satsails plays the Morpho-Labs/Fedi role (the company
that builds); a future **Sails Foundation** (working name, not yet a
formed legal entity) is intended to play the Morpho-Association/Fedimint
role (the nonprofit that stewards the protocol and, once it exists,
administers the Developer/Treasury Fund below). See `GOVERNANCE.md` §2B
for what is and isn't true about this today — the intent is documented
now, the entity itself is not yet formed.

---

## 3B. Wallets Are Partners, Not Clients

**Added following the same review — this is the framing principle the
stakeholder-by-stakeholder design in section 4 is built on, stated
explicitly rather than left implicit.**

A wallet integrating `@sails/sdk` is not a consumer of a hosted service —
it is a participant in the protocol's economy, the same category as a
Liquidity Provider or an Arbitrator (section 4). Two consequences follow
directly:

1. **Wallets earn, they don't just pay.** Section 4.5/4.7 and section 6.2
   exist because an integration that only costs a wallet engineering time
   and offers nothing back does not scale past whichever wallet builds it
   first for its own reasons (Satsails). A wallet that earns a rebate on
   every operation it originates has a durable, ongoing reason to keep
   integrating deeper.
2. **Neutrality is not optional.** The protocol never favors one wallet
   over another. Every wallet that correctly implements the SDK has
   access to *exactly* the same economic opportunities — same rebate
   mechanism, same fee-discount tiers (section 4.1), same eligibility for
   the Node Operator Pool (section 4.2) if it also runs infrastructure.
   This is `PRINCIPLES.md` principle 1 (Protocol First) and principle 7
   (Open Integrations) applied specifically to economics, not just to
   technical access: an open protocol whose economic layer quietly
   privileges its own reference implementation is not actually neutral,
   regardless of how open its SDK's source code is.

**What this changes in practice:** wallets stop competing for who builds
the best internal P2P/escrow/reputation stack, and start competing purely
on user experience — the infrastructure underneath is shared. Section 5B
develops why this produces a network effect rather than a race to the
bottom.

## 3C. Partner Neutrality — Avoiding Single-Ecosystem-Partner Concentration

**Added following a follow-up discussion after the external economic-model
review, not present in the original directive — a real gap identified by
checking this document and `PRINCIPLES.md`/`GOVERNANCE.md` for existing
coverage before assuming one was needed.**

Section 3B's neutrality principle protects against the protocol favoring
one *wallet* over another. It says nothing about a different, real risk:
`ARCHITECTURE.md` §1C's four-layer diagram places **Tether Ecosystem** as
the foundational layer beneath the Open Infrastructure Stack (WDK + Pears
+ QVAC) that Sails Protocol coordinates on top of. That's an accurate
description of where the project's infrastructure comes from today — but
if USDT/Tether-originated liquidity comes to dominate real settlement
volume, the protocol can be *technically* chain-agnostic
(`PRINCIPLES.md` principle 6, Infrastructure Neutral) while still being
*perceived and functionally treated* as "the Tether P2P protocol" by the
market. That perception alone is enough to make a competing stablecoin
issuer, or a wallet that doesn't want to be read as Tether-aligned,
hesitate to integrate — undermining exactly the neutrality section 3B
exists to guarantee, through a channel neither section 3B nor principle 6
was written to cover.

**The distinction that matters:** principle 6 (Infrastructure Neutral)
protects against *technical* lock-in — no fixed chain, custody
technology, or transport. This section protects against *ecosystem*
lock-in — no single backer, issuer, or strategic partner the protocol
becomes functionally synonymous with, even while remaining technically
neutral on paper. A protocol can pass every test of principle 6 and still
fail this one.

**What this means in practice, stated as a standing goal, not a
restriction on any current relationship:**

- Tether/WDK is correctly the **first** major ecosystem partner and
  infrastructure provider — nothing here suggests reducing or
  deprioritizing that relationship, which is real, valuable, and already
  load-bearing in the architecture.
- The protocol should actively pursue integration with **additional**
  large liquidity sources, stablecoin issuers, and infrastructure
  partners over time, the same way it pursues additional wallets (section
  3B) and additional `SettlementAdapter`/`LiquidityProvider`
  implementations (section 4.7) — partner diversity is success, not
  disloyalty to the first partner.
- Economic mechanisms in this document (the fee model, section 6; the
  rebate model, section 4.5) must stay identically available to volume
  originating from any settlement asset or backing partner — the same
  "no favoritism" commitment section 3B makes for wallets, extended to
  partners.

**Not yet a formal Principle 10.** Per `GOVERNANCE.md` §3, changes to
`PRINCIPLES.md` require Governance Layer v1, which does not exist during
the current bootstrap phase (Months 1-12) — this section is recorded here,
in the economic-architecture document, as the reasoned case for it, not as
an unauthorized edit to the frozen 9-principle list. Once Governance Layer
v1 exists, formally elevating "Partner Neutrality" to a numbered principle
in `PRINCIPLES.md` should go through the same RFC process
(`GOVERNANCE.md` §5) as any other principle change — this section is the
proposal that RFC would draw on, not a substitute for it.

---

## 4. Incentive Design by Stakeholder Group

### 4.1 Liquidity Providers (market makers, OTC desks posting standing offers)

**Primary incentive: the spread**, exactly as in any P2P market — an LP
quotes a price with a margin over the reference rate and earns that margin
on every fill. This requires no protocol-level payment at all; it's the
natural economics of quoting a two-sided market.

**Protocol-level enhancement:** volume/reputation-tiered fee discounts —
LPs with high `volumeScore` (see `PROTOCOL_SPECIFICATION.md` section 1.6)
pay a reduced Protocol Fee, similar to maker-rebate tiers on centralized
exchanges. This costs the protocol a small amount of fee revenue but grows
total settlement volume, which is the actual goal.

**Why no token here:** Uniswap pays LPs via pool fee-share, requiring
pooled capital and a token-like LP-share accounting unit. Sails has no
pooled liquidity — offers are individually posted and matched P2P — so
there's no pool-share problem to solve with a token in the first place.

### 4.2 Node Operators (Bootstrap nodes, Reputation nodes, future relay nodes)

This is the hardest group to incentivize without a token, because unlike
LPs, node operators don't have a natural transaction to earn a spread on.
Three tiers of answer, matched to the roadmap:

- **Bootstrap nodes (today):** run voluntarily, the same way Bitcoin full
  nodes or Tor relays are run today — goodwill, ecosystem interest, and (for
  companies like Satsails) direct business interest in network reliability.
  No payment mechanism needed at this stage.
- **Reputation nodes (Months 7-9, cross-module portability phase):** once
  reputation validation requires real infrastructure at scale, a small
  slice of Protocol Fee revenue is earmarked for a **Node Operator Pool**,
  distributed proportionally to verifiable uptime/service metrics (not
  emissions — a real payout from real fee revenue, paid in the settlement
  asset).
- **Relay/routing nodes (Months 10-12, Pears Runtime / distributed order
  book phase):** modeled directly on **Lightning Network's routing fee**
  mechanism (see section 5) — a peer that relays discovery or negotiation
  traffic earns a tiny, protocol-defined routing fee denominated in the
  settlement asset, paid by whoever benefits from the routed message.

### 4.3 Developers (protocol-spec, SDK, and module contributors)

- **Open-source contribution model** — the same non-monetary incentive
  that sustains Bitcoin Core, Linux, and most successful protocols:
  reputation, career capital, and being early in an ecosystem's growth
  curve.
- **Developer/Treasury Fund** — seeded from Protocol Fee revenue once fees
  activate (section 3). Used for: ongoing `@sails/protocol-spec` and
  `@sails/sdk` maintenance, funding third-party security audits beyond the
  grant-funded first one, and **grants to external contributors** who build
  new modules (e.g., a fintech that needs `Sails OpenFinance` sooner than
  the roadmap schedule can fund its own development and contribute it back).
- This is structurally identical to how the Uniswap Foundation or Ethereum
  Foundation fund ongoing ecosystem development from protocol
  revenue/foundation treasury rather than ongoing token emission — and,
  once it exists, is intended to be administered by the Sails Foundation
  rather than Satsails directly (`GOVERNANCE.md` §2B), the same separation
  those two foundations maintain from their respective founding companies.

### 4.4 Arbitrators (dispute resolution — see `SECURITY_MODEL.md` section 3)

**Updated (v8.10) to reference the formalized primitives:** an arbiter's
decision is a `Verification` (`PROTOCOL_SPECIFICATION.md` §1.8,
RFC-003) evaluating the `Proof`s submitted to a `Dispute` (§1.9), and the
`Dispute.ruling` (`RELEASE` | `REFUND` | `SPLIT`) is what determines the
fee split below — this section previously described the mechanism only in
prose, before either primitive existed in this form.

- **Bond:** arbitrators stake **reputation**, not a token — their
  `ReputationScore` (already a protocol primitive) acts as collateral. A
  bad-faith or clearly incorrect ruling damages their score, which is
  publicly visible and portable across the whole network — a real,
  non-speculative cost to acting in bad faith.
- **Fee:** a small arbitration fee (e.g., 1-2% of the disputed amount) is
  paid **by the losing party** in the dispute, drawn from the escrowed
  funds at resolution time. If a dispute is resolved without fault (e.g.,
  a timeout with no clear bad actor), the fee is split evenly between both
  parties as a shared cost of using dispute resolution — comparable to how
  insurance/mediation fees work in traditional escrow arrangements.
- **Why not a token-staking model like Kleros:** Kleros (a real
  decentralized arbitration protocol) requires jurors to stake a native
  token (PNK) to be selected and rewarded. Sails deliberately avoids this —
  reputation-as-bond achieves the same "skin in the game" property without
  introducing a speculative asset arbitrators would need to acquire first.

### 4.5 Wallets (reference implementations and third-party wallet integrators)

- **Primary incentive:** product differentiation. A wallet that offers
  non-custodial P2P trading via Sails attracts and retains users without
  building that infrastructure itself — the SDK does the work.
- **Protocol-level rebate:** a portion of the Protocol Fee generated by
  trades executed through a specific wallet's integration flows back to
  that wallet as a rebate — an affiliate/referral mechanism, comparable to
  how some DEX aggregators share a cut of fees with the front-end that
  originated the trade. This directly rewards wallets for integrating
  deeply and promoting usage, without requiring a token.
- **The rebate is per-side, not per-trade, which is what makes it work
  across different wallets (added following the external review):**
  because a `TradeIntent` has a buyer and a seller (`PROTOCOL_SPECIFICATION.md`
  §1.2), and each independently originates from whichever wallet they're
  using, the Wallet Rebate bucket (section 6.2) splits by origin, not by
  trade. Concretely:

  ```
  User A (Satsails Wallet)  buys USDT  from  User B (Rumble Wallet)

  Protocol Fee (e.g. 0.20% of trade value)
    ├── Satsails Wallet  ← rebate for originating User A's side
    ├── Rumble Wallet    ← rebate for originating User B's side
    └── Treasury/other buckets (section 6.2)
  ```

  When both sides happen to use the same wallet, that wallet simply
  receives both origination rebates. When they differ — the common case
  once multiple wallets integrate — **both wallets are paid for the same
  trade**, neither one having to be the "primary" integration. This is the
  mechanism that makes section 3B's neutrality principle concrete rather
  than aspirational: Rumble Wallet earns exactly as much for originating
  its side of this trade as Satsails does for originating the other, with
  no dependency on which wallet the Reference Implementation happens to
  be.

### 4.6 Integrators (fintechs, ERPs, enterprise apps beyond wallets)

- Same rebate mechanism as wallets (4.5) for standard integrations.
- **Enterprise Licensing** (section 2) applies to integrators needing
  white-label branding, dedicated support, or an SLA beyond the open SDK —
  this is Satsails' reference-implementation business model layered on top
  of the open protocol, not a protocol-level fee.

### 4.7 Infrastructure Provider Economy (added following the external review)

Sections 4.1 and 4.4 already establish that Liquidity Providers and
Arbitrators are economically incentivized, not free labor — this section
names the pattern explicitly and extends it to two roles the original
stakeholder list didn't yet cover, so "who gets paid for running Sails
infrastructure" has one answer instead of being scattered across the
document:

| Role | Protocol interface | Incentive | Detail |
|---|---|---|---|
| **Liquidity Provider** | `LiquidityProvider` (`liquidity.service.ts`, `PROTOCOL_SPECIFICATION.md` §1.3) | Spread + volume-tiered fee discounts | Section 4.1 |
| **Arbitration Provider** | `ArbitrationProvider` (RFC-007, `rfcs/RFC-007-real-world-p2p-requirements.md`, decision D4) | Arbitration fee from the losing party + reputation bond | Section 4.4. RFC-007 registers arbitrators per application ("Trusted Arbitrators"), not as a protocol-native role — the fee mechanism here is what makes filling that role economically worthwhile, not just a trust obligation. |
| **Agent Provider (QVAC / Sails OpenAgents)** | `AgentGrant`/`AgentScope` (`PROTOCOL_SPECIFICATION.md` §1.7) | 📋 Future — see section 2B's "Agent Marketplace" | Not yet monetized in this document prior to this review. An entity running QVAC-backed matching, fraud detection (RFC-007 D7's Social Engineering Agent), or risk analysis on behalf of Participants is providing real infrastructure, and section 2B commits the architecture to eventually pricing that the same way as every other role here — paid in settlement assets, never a token. |
| **Settlement Provider** | `SettlementProvider`/`SettlementAdapter` (`PROTOCOL_SPECIFICATION.md` §1.5, §4B) | Node Operator Pool share (section 4.2) today; a direct per-settlement fee is one of section 2B's named future sources | A future `SettlementAdapter` beyond Mock/Multisig/Lightning HODL/Liquid Covenant (e.g. a specialized custody/covenant provider) is exactly the kind of infrastructure role this economy is designed to extend to without a redesign — the Adapter pattern already makes "add a new implementation" a non-event architecturally; this table makes it a non-event economically too. |

**Why this table matters strategically:** it is the answer to "the
protocol doesn't just pay whoever builds a wallet — it creates an economy
around every role that sustains the ecosystem," which is the distinction
between a protocol with one sponsor (rebates only) and a protocol with a
genuine open economy (rebates *and* infrastructure incentives, matching
how Lightning Network routing nodes and Ethereum validators are both
paid, not just wallet front-ends).

---

## 5. Comparative Analysis

| Protocol | Token? | Core revenue mechanism | Liquidity model | Relevance to Sails |
|---|---|---|---|---|
| **Uniswap** | Yes (UNI) — governance + optional fee-switch | Swap fee (0.01%-1%) paid by swapper to pooled LPs | Pooled AMM (LPs deposit ahead of time) | Low direct relevance — Sails has no pooled liquidity, so LP-share/impermanent-loss mechanics don't map. Confirms fee-switch-style governance (fee parameters controlled by a broader body, not a single company) is worth adopting conceptually. |
| **Aave** | Yes (AAVE) — governance + Safety Module staking | Interest rate spread; "reserve factor" cut to DAO treasury | Pooled lending (aTokens represent pool share) | Low direct relevance for the same pooling reason. Confirms a treasury/reserve-factor pattern is a proven way to fund ongoing protocol development from real usage. |
| **Morpho** | Yes (MORPHO) — governance only, not required for matching | P2P rate improvement over underlying pool (Aave/Compound); protocol fee optional | **P2P-matching-first**, falls back to pooled liquidity when no direct match exists | **Highest relevance.** Morpho proves that a "prefer direct P2P matching over pooled inefficiency" philosophy — the same philosophy behind Sails' Discovery/Negotiation primitives — is viable at scale. Its token is for governance, not required for the matching engine itself, which validates that Sails' no-token stance doesn't sacrifice any core functionality. |
| **Bisq** | **Yes (BSQ)** — a colored-coin token used for trading fees, arbitrator/mediator bonds, and DAO voting | Trading fees payable in BSQ or BTC; BSQ burned/distributed | True P2P, non-custodial, no pooled liquidity | **Important honest caveat:** Bisq is often cited as a "no-token" P2P exchange, but it does have BSQ for fees and arbitrator bonding. Sails deliberately diverges here — all Sails fees and arbitrator bonds are denominated in the settlement asset (BTC/USDT) or reputation (not a new token), trading away Bisq's unified accounting unit in exchange for avoiding a new speculative asset entirely. |
| **HodlHodl** | **No token** | Small escrow fee, paid in BTC/fiat by one or both parties | True P2P, non-custodial, no pooled liquidity | **Direct proof-of-concept.** HodlHodl demonstrates a non-custodial P2P Bitcoin marketplace can sustain itself purely on transaction fees denominated in the traded asset, with zero token. This is the closest real-world validation of Sails' fee model. |
| **Lightning Network** | No token | Routing fees (base fee + proportional fee per hop), paid in satoshis by the sender to routing nodes | N/A — payment channel network, not a marketplace | **Direct model for Node Operator incentives** (section 4.2) — pay infrastructure providers directly in the asset being moved, proportional to service provided, with no token or emissions required. |

**Conclusion drawn from this comparison:** every protocol on this list that
uses pooled liquidity (Uniswap, Aave) also uses a governance token, because
pooled liquidity needs a share-accounting mechanism a token provides
naturally. Every protocol that is genuinely P2P without pooling (HodlHodl,
Lightning, and Morpho's core matching engine) either has no token or
doesn't need one for its core function. **Sails has no pooled liquidity —
it is P2P discovery and negotiation, like HodlHodl and Morpho's matching
layer — which is precisely why it doesn't need a token either.**

---

## 5B. Network Effects & Why Wallets Collaborate Instead of Compete

**Added following the external economic-model review.** Morpho's
integrators (custodial and non-custodial wallets, aggregators, other
protocols) all earn from routing volume through Morpho rather than
building their own lending engine — the same effect this section claims
for Sails, cited directly because it's the closest real precedent for
"a neutral coordination layer makes competitors into co-beneficiaries."

**Without a shared protocol**, wallets compete for the same finite pool of
users by each building isolated, non-interoperable P2P infrastructure —
duplicated engineering cost across every wallet, and each wallet's
liquidity and reputation data trapped inside its own walls.

**With the Sails Protocol**, cross-wallet trades (section 4.5's example)
mean liquidity and reputation are shared resources, not competitive
moats:

```
More wallets integrate
  ↓
More liquidity visible to Discovery (§1.3)
  ↓
More successful matches, more settlement volume
  ↓
More Protocol Fee revenue split across every originating wallet (§6.2)
  ↓
Stronger incentive for the next wallet to integrate
```

This is a real network effect, not a marketing claim: each additional
wallet makes the protocol more valuable to every wallet already
integrated, because `Sails OpenLiquidity`'s Discovery primitive
aggregates across all of them (`liquidity.service.ts`'s `LiquidityRouter`
already aggregates multiple `LiquidityProvider`s by design — the same
mechanism, extended to more integrators, is exactly what compounds this
effect). Wallets stop competing on "who has better P2P infrastructure"
(the infrastructure is now shared and identical for everyone, per 3B's
neutrality principle) and compete purely on user experience, support, and
distribution — which is a healthier, more differentiable axis of
competition for the wallet businesses themselves.

---

## 6. Fee Mechanics — Exact Flow

### 6.1 Who pays

The Protocol Fee is charged at **Settlement** (see the `Settlement`
primitive in `PROTOCOL_SPECIFICATION.md` section 1.5), split proportionally
between the two counterparties of the completed trade (buyer and seller,
or borrower and lender for future OpenFinance intents) — not charged to
either party alone. This mirrors how HodlHodl splits its escrow fee.

### 6.2 Who receives

The fee is never collected into a single company's account. It splits into
four buckets at the moment of settlement:

```
Protocol Fee (100%)
  ├── 40% → Node Operator Pool        (infrastructure providers, section 4.2)
  ├── 30% → Developer/Treasury Fund    (ongoing protocol development, section 4.3)
  ├── 20% → Originating Wallet/Integrator Rebate  (section 4.5/4.6)
  │           split per-side (section 4.5) — e.g. 10% to the buyer-side
  │           wallet's origination, 10% to the seller-side wallet's, or
  │           the full 20% to one wallet when both sides use it
  └── 10% → Arbitrator Reserve         (pre-funds dispute resolution, section 4.4)
```

These percentages are a proposed starting allocation, not fixed forever —
see section 7 on how they're governed and changed over time. The
buyer-side/seller-side split *within* the 20% bucket (section 4.5) is
likewise illustrative, not fixed — the architectural commitment is that
the split is per-originating-side, so a trade between two different
wallets pays both, never just one.

### 6.3 How distributed

Distribution happens **at settlement time**, computed by the
`SettlementProvider` implementation as part of the release transaction —
not batched, not held by an intermediary, not requiring a separate claim
process. Each bucket's share is paid directly in the settlement asset to:

- the **Node Operator Pool** — an address/mechanism defined in the Protocol
  Spec (not controlled by any single reference implementation)
- the **Developer/Treasury Fund** — similarly protocol-defined
- the **originating wallet's** designated payout address (registered when
  a wallet integrates the SDK)
- the **Arbitrator Reserve** — accumulates until drawn on for dispute
  resolution fees (section 4.4)

Because this logic lives in the `SettlementProvider` interface
(`PROTOCOL_SPECIFICATION.md` section 1.5), **every reference implementation
distributes fees identically** — a company implementing Sails Protocol in
Rust follows the same split as the Satsails TypeScript implementation. This
is what makes the fee model a protocol-level guarantee rather than a
business decision any single implementer could quietly change.

### 6.4 How to avoid centralization

Four concrete mechanisms:

1. **No intermediary custody of fee revenue.** Funds move directly from the
   settling escrow to each bucket's destination at release time — there is
   no step where "Sails Inc." (or any company) holds collected fees before
   distributing them. This avoids recreating exactly the custodial
   single-point-of-failure the whole protocol exists to eliminate.
2. **Fee parameters live in the versioned Protocol Spec, not in any single
   implementation's code.** The percentages in section 6.2, the fee rate
   itself, and which assets qualify are part of `@sails/protocol-spec` —
   publicly documented and versioned. A reference implementation cannot
   unilaterally redirect fee revenue without diverging from the spec in an
   auditable way.
3. **Governance of fee parameters transitions away from Satsails.** Per
   section 3, once "Governance layer v1" ships (`ROADMAP.md`, Months
   10-12), changes to the fee rate or the bucket-split percentages require
   the multi-stakeholder governance process, not a unilateral decision by
   whichever company happens to run the most-used reference implementation.
4. **The fee is optional per integrator, not mandatory.** Any wallet or
   fintech integrating the SDK can configure a 0% Protocol Fee for their
   own users if their business model doesn't need it — see the "Protocol
   Fee is OFF (0%)" bootstrap-phase default in section 3. This prevents the
   protocol itself from becoming a mandatory rent-extraction layer that
   integrators have no way to opt out of.

---

## 7. Governance of Economic Parameters (cross-reference to `ROADMAP.md`)

The economic parameters in this document (fee rate, bucket splits,
arbitration fee %) are **defaults proposed for the bootstrap phase**, owned
by Satsails during Months 1-12 while the protocol has essentially one real
reference implementation and one real module (OpenP2P). As the ecosystem
matures per the roadmap:

- **Months 1-12:** Satsails proposes and can adjust these defaults as
  needed to support adoption (e.g., keeping the Protocol Fee at 0% longer
  if that better serves growth).
- **Months 10-12 onward:** "Governance layer v1" (already committed in
  `ROADMAP.md`) becomes the body that reviews and approves changes to fee
  parameters — composed of recognized ecosystem stakeholders (reference
  implementers, major integrators, node operators), not necessarily a
  token-weighted vote (consistent with the no-token principle), but a
  multi-signature or delegated-representative process instead.

Do not treat the percentages in section 6.2 as final — they are a
reasoned starting proposal, explicitly designed to be revisited by
governance once real settlement volume makes the trade-offs concrete rather
than theoretical.

---

## 8. Summary Table — Six Stakeholders, One Page

| Stakeholder | Incentive mechanism | Paid in | Token required? |
|---|---|---|---|
| Liquidity Providers | Spread + volume-tiered fee discounts | Settlement asset | No |
| Node Operators | Node Operator Pool share (uptime-proportional) + future Lightning-style routing fees | Settlement asset | No |
| Developers | Developer/Treasury Fund grants + open-source reputation | Settlement asset / fiat | No |
| Arbitrators | Arbitration fee (from losing party) + reputation bond | Settlement asset (fee) / reputation (bond) | No |
| Wallets | Fee rebate on originated volume + product differentiation | Settlement asset | No |
| Integrators | Same rebate + optional Enterprise Licensing (Satsails business layer) | Settlement asset / fiat | No |

Every row is satisfied without introducing a Sails-native token — the
constraint from section 1 holds across the entire design.

**Not exhaustive as of section 4.7's addition:** this table predates the
external economic-model review and covers the six stakeholder groups with
a concrete, largely-active incentive mechanism today. Section 4.7 adds two
more infrastructure-provider roles — Agent Providers and Settlement
Providers beyond today's Mock/Multisig — both still 📋 Future rather than
active, which is why they're documented there rather than folded into
this table as a seventh and eighth row that would overstate how built-out
they are.

---

## 8B. Why Any Wallet Should Integrate (added following the external review)

By the end of this document, any wallet founder should be able to answer,
concretely, the question opened in section 1C:

> **"Why would I integrate the Sails Protocol if I already have a working
> wallet?"**

**Because integrating turns a cost center into a revenue participant,
without building the infrastructure yourself.** Instead of engineering a
marketplace, reputation system, escrow, dispute mediation, settlement
logic, agent integration, and liquidity discovery independently — the
`@sails/sdk` (`SDK_GUIDE.md`) provides all of it — a wallet integrates the
SDK and starts earning a rebate (section 4.5) on every operation its users
originate, with exactly the same economic opportunity as every other
wallet in the ecosystem (section 3B), and its earning surface grows every
time another wallet joins (section 5B) rather than shrinking.

> "The Sails Protocol turns wallets from cost centers into participants
> in an open economy of financial infrastructure."

This sentence is the one-line version of sections 1B through 8 above —
useful for a pitch deck or a first integration conversation, but every
claim in it traces back to a specific, non-speculative mechanism
documented in this file, not to a marketing promise.
