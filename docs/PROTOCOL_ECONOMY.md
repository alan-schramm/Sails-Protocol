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
  revenue/foundation treasury rather than ongoing token emission.

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

### 4.6 Integrators (fintechs, ERPs, enterprise apps beyond wallets)

- Same rebate mechanism as wallets (4.5) for standard integrations.
- **Enterprise Licensing** (section 2) applies to integrators needing
  white-label branding, dedicated support, or an SLA beyond the open SDK —
  this is Satsails' reference-implementation business model layered on top
  of the open protocol, not a protocol-level fee.

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
  └── 10% → Arbitrator Reserve         (pre-funds dispute resolution, section 4.4)
```

These percentages are a proposed starting allocation, not fixed forever —
see section 7 on how they're governed and changed over time.

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
