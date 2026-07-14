# REFERENCE_IMPLEMENTATIONS.md
### Sails Protocol — Engineering Handoff · Document 15 of 20

> **Read this framing before anything else in this document.** The Satsails
> ecosystem (Satsails Wallet, Sails Finance, SailsPay) is **not** the Sails
> Protocol. It is the **first real validation environment** for the
> protocol — a set of already-operating products, with real infrastructure
> and real users, that let protocol modules be proven in production before
> asking any third party to adopt them. If any section of this document
> reads as if Satsails *is* the protocol, that's a drafting error — fix the
> wording, not the hierarchy. See `PROJECT_CONTEXT.md` section 2 for the
> three-level hierarchy this document must respect throughout.

---

## 1. Why a Reference Implementation Ecosystem — Not Just One App

Most protocols are proven by a single reference implementation. Sails
Protocol has something stronger available to it: **three** reference
implementations, already planned or operating within the same company,
each exercising the protocol from a different application shape:

| Reference Implementation | Application shape | Protocol module(s) it proves |
|---|---|---|
| **Satsails Wallet** | Consumer-facing (PF), non-custodial wallet | Sails OpenP2P (✅ proven today) |
| **Sails Finance** | API products (B2B2C), fee-based financial services | Sails OpenFinance (📋 aspirational — see section 3) |
| **SailsPay** | B2B payment gateway, merchant-facing | Sails OpenP2P payment flows / future OpenFinance payment intents |

Proving the same protocol modules across three structurally different
applications — a consumer app, a fee-based API product, and a merchant
payment gateway — is a much stronger validation signal than proving it once
in a single app and hoping it generalizes. This is the actual engineering
argument for why this ecosystem matters, independent of any commercial
narrative.

---

## 2. Satsails Wallet — First Reference Implementation (✅ Proven)

**Status:** in production since **September 2024**; monetized since
**October 2025**.

**Implements:** Sails OpenP2P (see `PROTOCOL_SPECIFICATION.md` section 1.8
and `ARCHITECTURE.md` section 3).

**Architecture principle:** Satsails Wallet never touches fiat directly —
fully non-custodial, consistent with the Sails Protocol's core guarantee
(see `PROJECT_CONTEXT.md` section 1 and `SECURITY_MODEL.md`).

### Existing Infrastructure Stack

| Component | Role |
|---|---|
| **WDK (Tether)** | The wallet substrate — self-custodial keypair generation, multi-chain signing. Shared foundation across all three reference implementations (see `PROJECT_CONTEXT.md` section 3). |
| **Plebank / Fitbank** | PIX receiving + KYC/AML — the fiat rail entry point for Brazilian users |
| **Eulen** | Depix tokenizer — converts PIX-received BRL into an on-chain representation without the wallet ever custodying fiat |
| **SideSwap** | Liquid Network DEX — on-chain swap liquidity for Liquid-based assets |
| **SideShift** | Permissionless cross-chain swap aggregator — broader cross-chain routing beyond Liquid Network |
| **Boltz Exchange** | Atomic swaps between Lightning and Liquid BTC (L-BTC) — cross-network settlement without a trusted intermediary |

This stack is a direct, concrete instance of the **Fiat Settlement
mechanics** described in `PROTOCOL_SPECIFICATION.md` section 4 — PIX comes
in via Plebank/Fitbank, is tokenized by Eulen, and the wallet coordinates
the rest without custody, exactly matching the protocol's behavioral
guarantee.

### Users & Volume

**Confirmed figures (as of this handoff, 2025-07-12):**

```
Total volume processed:              USD $10,000,000+
Total users:                         12,000+
Monetization start date:              October 2025
Production start date:                September 2024
Operating period with real traction:  ~7-8 months as of this handoff
```

This is a real, meaningful data point for any grant or partner
conversation: a non-custodial wallet with $10M+ in processed volume and
12,000+ users, built on the same primitives (Identity, Intent, Discovery,
Negotiation, Settlement, Reputation) that Sails OpenP2P formalizes, is
direct evidence the protocol's core mechanics work in production — not
just in specification.

**Maintenance rule going forward:** update this block with a new date
stamp whenever these figures are refreshed, and cite whether the number is
lifetime-to-date or a specific period. Do not let this figure go stale in
external-facing materials (grant submissions, partner decks) without
updating it here first — this document is the source of truth for these
numbers across the whole project.

---

## 3. Sails Finance — Future Reference Implementation (📋 Aspirational)

**Positioning:** API-first financial products, monetized via fees on
integrations that would otherwise cost the underlying protocol nothing
extra to offer ("zero-additional-cost API products" — the products reuse
infrastructure Satsails already operates).

**Would implement:** Sails OpenFinance (see `PROTOCOL_SPECIFICATION.md`
section 2.3 for `LoanIntent`, `SwapIntent`, `EarnIntent` payload shapes).

### Existing/Planned Integrations and Their Intent-Type Mapping

| Integration | Product name | Maps to Intent type | Notes |
|---|---|---|---|
| **Morpho** | Sails Empréstimo Colateralizado | `LoanIntent` | Direct match — collateralized lending is exactly what `LoanIntent` was specified for in `PROTOCOL_SPECIFICATION.md` section 2.3 |
| **Hyperliquid** | Sails Trading | `SwapIntent` (closest existing fit) | Hyperliquid is a derivatives/perpetuals venue; the existing `SwapIntent` payload does not fully capture leveraged/derivatives semantics — flagged as an open spec question below |
| **Polymarket** | Sails Predictions | **No existing Intent type fits well** | Prediction markets are structurally different from trade/payment/loan/swap/earn. This is flagged as an open question, not resolved here — see section 3.1 |

### 3.1 Open Spec Question — Should There Be a `PredictionIntent`?

This document does **not** unilaterally add a new Intent type — that is a
protocol-level decision that belongs in `PROTOCOL_SPECIFICATION.md` and
`MASTER_COORDINATION.md`, following the same process used for every other
Intent type in this project. What can be said here is an observation:

> Sails Predictions (via Polymarket) does not map cleanly onto
> `TradeIntent`, `PaymentIntent`, `SwapIntent`, `LoanIntent`, or
> `EarnIntent`. If Sails Finance moves forward with this integration, it is
> a concrete, real-world forcing function for deciding whether Sails
> OpenFinance needs a sixth payload type (`PredictionIntent`) or whether
> prediction-market positions are better modeled as a specialized
> `SwapIntent` variant. This should be resolved as part of the Sails
> OpenFinance module spec (`ROADMAP.md`, Months 7-9 / Months 10-12), not
> improvised ad hoc when the integration is built.

### Why Hyperliquid, Morpho, and Polymarket Matter Beyond Revenue

Each of these is an **external, already-operating financial protocol** with
its own real liquidity and its own users. Integrating Sails OpenFinance
against them means the module gets validated against real external
counterparties and real market conditions — not a synthetic testnet. This
is a materially stronger proof point than building OpenFinance in isolation
and testing it only against mocked data.

---

## 4. SailsPay — Future Reference Implementation (📋 Aspirational)

**Positioning:** B2B payment gateway — merchant-facing, likely combining
Sails OpenP2P's trade coordination with payment-specific flows that may
eventually become part of Sails OpenFinance's `PaymentIntent`.

### Existing/Planned Infrastructure

| Component | Role |
|---|---|
| **dLocal** | LatAm payment coverage — regional payment method aggregation for merchant settlement |
| **Fireblocks MPC** | Institutional-grade custody infrastructure for merchant-side asset management |
| **Lightspark Grid** | Lightning Network infrastructure — routing and liquidity for Bitcoin-native merchant settlement |

**Note on custody:** Fireblocks MPC is infrastructure Satsails may use on
the *merchant* side of a B2B gateway. This must not be confused with the
Sails Protocol's own non-custodial guarantee for peer-to-peer participants
— see `SECURITY_MODEL.md` and `THREAT_MODEL.md` ("Custody Creep") for why
this distinction matters and must stay explicit in any external-facing
material. SailsPay serving merchants who choose custodial infrastructure
for their own operations does not change what the Sails Protocol itself
guarantees between P2P counterparties.

---

## 5. Additional Integration Points Mentioned for Documentation

### SideShift

**Confirmed live** as of this handoff (2025-07-12) — Satsails Wallet uses
SideShift in addition to SideSwap (section 2). These are two distinct
services and must not be conflated:

- **SideSwap** — Liquid Network DEX, used for on-chain Liquid-asset swaps
- **SideShift** — permissionless cross-chain swap aggregator, used for
  broader cross-chain swap routing beyond Liquid Network alone

Both sit at the same architectural point as Boltz Exchange in section 2 —
external swap liquidity the wallet coordinates through, never custodies.
Status: **✅ Proven** (confirmed in production use), joining SideSwap and
Boltz Exchange as the third confirmed swap-liquidity integration.

### WDK (Tether)

Already covered in section 2 — repeated here because it is the **shared
substrate across all three reference implementations**, not something
specific to the Wallet alone. Every reference implementation's Identity
primitive (`PROTOCOL_SPECIFICATION.md` section 1.1) is grounded in the same
WDK-generated Ed25519 keypair infrastructure.

---

## 6. Why This Ecosystem Accelerates Sails Protocol Adoption

Four concrete reasons, tied directly to concerns raised earlier in this
project's own strategic review (see the "proof vs. ambition" tension
flagged during the architecture checkpoint):

1. **It closes the gap between 8 specified modules and 1 proven module —
   fast, and without waiting on third parties.** Satsails Wallet already
   proves OpenP2P **at real scale**: USD $10M+ in processed volume and
   12,000+ users (section 2) is not a pilot or a testnet — it's a live,
   monetized product. Sails Finance's Morpho/Hyperliquid/Polymarket
   integrations are a near-term, low-risk path to proving OpenFinance
   against real external liquidity. SailsPay is a near-term path to
   proving payment-specific flows. None of this requires convincing an
   unrelated third-party company to adopt an unproven spec first — the
   proving ground already has real users on it.

2. **It validates the protocol across genuinely different application
   shapes**, which is a stronger signal than one app proving itself
   repeatedly. A consumer wallet, a fee-based API product, and a B2B
   payment gateway stress the same primitives (Identity, Intent, Discovery,
   Negotiation, Settlement, Reputation) in different ways — edge cases one
   application shape would never surface get caught by another.

3. **It gives Sails OpenFinance real external counterparties on day one.**
   Morpho, Hyperliquid, and Polymarket are established, liquid protocols
   with their own users. Building `LoanIntent`/`SwapIntent` against them is
   qualitatively different — and more convincing to an outside evaluator —
   than building against a mock.

4. **It directly serves the causal adoption argument already established
   for the Tether grant** (`PROJECT_CONTEXT.md` section 3, `ROADMAP.md`):
   every one of these reference implementations runs on WDK. Proving three
   reference implementations instead of one triples the concrete evidence
   that Sails Protocol adoption means WDK adoption — the exact argument the
   grant case depends on.

---

## 7. Suggested Whitepaper Appendix

The following is a ready-to-use appendix draft. It is written to be lifted
directly into `Sails-Whitepaper-v2.0` as a new appendix section — adjust
formatting to match the deck's existing visual language (see
`ARCHITECTURE.md` reference to the whitepaper's slide conventions) rather
than pasting this markdown verbatim into a slide.

---

### Appendix — Validating Sails Protocol Within the Satsails Ecosystem

**Purpose of this appendix:** show a credible, low-risk path from "one
proven module" to "protocol validated across multiple real application
shapes," entirely within infrastructure that already exists today, before
any third-party adoption is required.

**The validation sequence:**

```
Stage 1 (✅ already true today)
  Satsails Wallet proves Sails OpenP2P in production.
  Real PIX-to-Bitcoin flow via Plebank/Fitbank + Eulen + SideSwap + Boltz.
  Non-custodial guarantee held throughout — the wallet never touches fiat.

Stage 2 (near-term, reuses existing integrations)
  Sails Finance proves Sails OpenFinance against real external liquidity:
    Morpho      → LoanIntent (collateralized lending)
    Hyperliquid → SwapIntent (trading — pending a derivatives-specific
                  payload refinement, see PROTOCOL_SPECIFICATION.md)
    Polymarket  → forces a concrete decision on whether OpenFinance needs
                  a new PredictionIntent payload type

Stage 3 (near-term, B2B validation)
  SailsPay proves payment-specific flows at the merchant/B2B layer,
  using dLocal for regional coverage and Lightspark Grid for Lightning
  settlement — validating the protocol beyond peer-to-peer consumer use.

Stage 4 (the actual goal)
  With three independent reference implementations proving the protocol
  across consumer, API-product, and B2B application shapes — all built on
  WDK — Sails Protocol is presented to third-party wallets, fintechs, and
  enterprises with production evidence, not a specification alone.
```

**Why this matters to an evaluator:** a protocol asking for adoption based
solely on its specification is asking for trust. A protocol that can point
to three structurally different, real applications already running on the
same primitives is asking for much less trust — the primitives have
already been exercised against real users, real external liquidity, and
real settlement rails, before the first outside integrator is even asked
to consider it.

---

## 8. Maintenance Note for This Document

Sections 2-4 contain infrastructure and integration facts that will change
faster than the rest of this handoff (new integrations, new volume figures,
new monetization milestones). As of 2025-07-12, the confirmed figures are
USD $10M+ processed volume and 12,000+ users (section 2), with SideShift
confirmed alongside SideSwap and Boltz as production swap infrastructure.
Whoever owns this document should keep these figures current on a regular
cadence, and add new integrations to sections 3-5 as they go live, keeping
the ✅/🏗️/📋 status honest at every update.
