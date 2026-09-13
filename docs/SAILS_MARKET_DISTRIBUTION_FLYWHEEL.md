# Sails Market Distribution & Network Flywheel (`P2P-JOURNEY-GATE-R1`, 2026-09-13)

**Status:** Product/Distribution model. Institutionalizes how Sails
Market (the reference `sails-ui`) relates to native SDK integration and
to external/hardware wallet participation — as a distribution surface
over one shared protocol, not a parent the protocol depends on. **No
new protocol truth, no new authority, no wallet connector implemented,
no UI change.** Every real/not-real claim below is stated explicitly;
diagrams distinguish real, shipped mechanisms from future-compatible
possibilities.

**North star:** *One market. Many interfaces. Many wallet stacks.
Shared economic meaning.*

---

## 1. The Three Access Paths — What Is Real Today

| Path | What it is | Real today? |
|---|---|---|
| **Sails Market (Universal Access)** | The reference `sails-ui` web app — anyone can open it, browse, and (per `docs/MARKET_ENTRY_AUTHENTICATION_BOUNDARY.md`) discover offers with zero setup | **Real** — this is the actual, shipped reference implementation |
| **Native SDK Participation** | A third party embeds `@satsails/p2p-trading-sdk` directly into their own product (a wallet, a fintech backend), never touching `sails-ui` at all | **Real, supported, evidenced** — `SailsClient` is the same client `sails-ui` itself uses (`packages/sails-ui/src/lib/sailsClient.ts`); nothing in it is Sails-Market-specific. `docs/PRODUCT_INTERACTION_MODEL.md` §7's Wallet vs. Service/Backend Integrator split already documents this path, restated not redefined |
| **External/Hardware Wallet Participation** | A visitor connects an existing wallet (software or hardware) via a compatible `WalletAdapter`, instead of the reference UI's own demo `LocalKeypairWalletAdapter` | **Not implemented today.** RFC-013's `WalletAdapter` interface is real and the extension point exists; no MetaMask/Xverse/OKX/Ledger/Trezor (or any other external/hardware) adapter exists in this codebase. These names are cited **only as example classes of a future-compatible possibility**, per this mission's own explicit instruction — not as current or planned support |

**Preserved, verified against real code:** `WalletAdapter ≠
SettlementProvider` (Issue #86 — a wallet integration never makes that
wallet a `SettlementProvider`, confirmed unchanged in
`docs/P2P_PRODUCT_JOURNEY.md` §6's Authority Matrix). `Access through
Sails Market ≠ native adoption` — opening `sails-ui` in a browser is
consuming the reference interface, not integrating the SDK; only the
second path is "adoption" in the SDK-distribution sense. `Better
integration ≠ privileged semantics` — this is not a new rule; it
restates `docs/PROJECT_CONTEXT.md` §2D item 7 ("Access does not imply
authority") and `docs/PRODUCT_INTERACTION_MODEL.md` §6's own frozen row
("Interface depth implies authority depth: **False**"), applied here to
distribution channel specifically: a wallet with a deep, native SDK
integration gets no more protocol authority than a visitor using Sails
Market's own UI to reach the identical capability through the identical
public contract.

---

## 2. Access Topology

```mermaid
flowchart TB
    subgraph Protocol["Sails Protocol (Core + Modules)"]
        API["Public HTTP/WS API<br/>(the single real contract)"]
    end

    subgraph Universal["Universal Market Access — real, shipped"]
        UI["Sails Market (sails-ui)<br/>reference web app"]
    end

    subgraph Native["Native SDK Participation — real, shipped"]
        SDK["@satsails/p2p-trading-sdk"]
        PartnerA["A partner wallet's own product"]
        PartnerB["A backend/service integrator<br/>(no wallet UI, HTTP/WS only)"]
    end

    subgraph Future["External/Hardware Wallet Participation — NOT implemented today"]
        WA["WalletAdapter (RFC-013)<br/>real interface, no real connector yet"]
        Ext["Example future classes only:<br/>MetaMask-style / Xverse-style /<br/>OKX-style / Ledger-style / Trezor-style"]
    end

    UI -->|"calls the same client"| API
    SDK -->|"wraps the same API"| API
    PartnerA --> SDK
    PartnerB --> SDK
    WA -.->|"pluggable, unimplemented"| SDK
    Ext -.->|"illustrative only"| WA

    style Future stroke-dasharray: 5 5
    style Ext stroke-dasharray: 5 5
    style WA stroke-dasharray: 5 5
```

**Reading this diagram:** solid lines are real, shipped call paths.
Dashed lines/boxes (`Future`) are the pluggable extension point that
exists structurally (RFC-013) but has no real implementation — named
here so a future Wallet Partner Journey mission has the shape without
this document overclaiming it is built.

---

## 3. SDK-vs-Universal-Access Convergence

The point of this diagram: two participants who started completely
differently land in the *same* economic reality, with no interface
gaining extra authority for having a "deeper" integration.

```mermaid
flowchart LR
    V1["Visitor opens<br/>Sails Market (sails-ui)"] --> D1["Discovery/Offer Evaluation<br/>(public, no auth — verified<br/>docs/MARKET_ENTRY_AUTHENTICATION_BOUNDARY.md)"]
    V2["Partner wallet's own user,<br/>inside the partner's own app"] --> D2["Discovery/Offer Evaluation<br/>via the partner's own native<br/>@satsails/p2p-trading-sdk call"]

    D1 --> C["Same Economic Commitment Boundary<br/>(docs/P2P_PRODUCT_JOURNEY.md §2)<br/>same POST /v1/openp2p/trades contract"]
    D2 --> C

    C --> T["Same Trade Lifecycle<br/>same EscrowStatus/DisputeStatus<br/>same Authority Matrix"]

    T --> R1["Sails Market renders it<br/>with sails-ui's own UI"]
    T --> R2["Partner wallet renders it<br/>with its own UI"]

    style C fill:#f9f,stroke:#333,stroke-width:2px
```

**No privileged path exists at `C`.** Both participants hit the
identical backend contract, the identical Authority Matrix, and the
identical maturity/eligibility rules (`docs/P2P_PRODUCT_JOURNEY.md`
§1). What differs is only presentation — exactly the *"one economic
reality, multiple actor-specific experiences"* north star already
frozen in `docs/PRODUCT_INTERACTION_MODEL.md`.

---

## 4. Network Flywheel

**Framed carefully, as a product hypothesis grounded in real,
already-existing mechanisms — not a claim that adoption has already
happened.**

```mermaid
flowchart TB
    A["More integrators use the real,\nstable @satsails/p2p-trading-sdk contract"] --> B["More real Offers/liquidity\nenter the same shared market"]
    B --> C["Sails Market (Universal Access)\nand every native integration alike\nsee a deeper, more liquid market"]
    C --> D["A deeper market is more useful\nto browse or integrate against"]
    D --> E["More reason for a new wallet/service\nto integrate the SDK natively"]
    E --> A

    C -.->|"today, single-node only —\nsee docs/P2P_PRODUCT_JOURNEY.md §1.2"| F["Not yet: Day-0 Multi-Operator\nNetwork liquidity (Issue #105)"]

    style F stroke-dasharray: 5 5
```

**What is real about this loop today:** the SDK contract itself is real
and stable (`docs/API_STABLE.md`); every integrator — Sails Market
included — draws from the same real `Offer`/liquidity data
(`docs/PRODUCT_INTERACTION_MODEL.md` §7's Wallet vs. Service/Backend
split already frozen). **What is not yet real:** actual multi-integrator
adoption, and the Day-0 Multi-Operator Network liquidity layer this loop
would need to scale past a single node — both named as open, not
claimed as achieved (consistent with `docs/P2P_PRODUCT_JOURNEY.md`
§1.2's own correction). This diagram documents the *mechanism* the
flywheel would run on, not a claim that it is already spinning.

---

## 5. Capability-Gated Wallet Participation

```mermaid
flowchart TD
    W["External or hardware wallet\n(example classes only — not implemented:\nMetaMask-style / Xverse-style / OKX-style /\nLedger-style / Trezor-style)"] -.-> Adapter["Compatible WalletAdapter\n(RFC-013 interface — real;\nno concrete connector exists yet)"]

    Adapter --> CD{"Capability Discovery\n(CapabilityGrant / Capability Registry,\nRFC-005/013/014 — real mechanism)"}

    CD -->|"scope present +\nENFORCE_CAPABILITIES semantics honored"| Eligible["Eligible action proceeds\n(e.g. propose an offer,\nsign a client-held-key release)"]
    CD -->|"scope absent, or\ndeployment doesn't enforce it —\nsee docs/PRODUCT_INTERACTION_MODEL.md\nBacklog item 28's own finding"| Denied["Action denied or\ndeployment-dependent —\nnever assumed enforced by default"]

    style W stroke-dasharray: 5 5
    style Adapter stroke-dasharray: 5 5
```

**Preserved, restated:** `ENFORCE_CAPABILITIES` defaults `false` in
this reference deployment (`docs/PRODUCT_INTERACTION_MODEL.md`, item
28's own finding) — capability discovery is real infrastructure
(RFC-005/013/014, `CapabilityGrant`), but no future wallet-adapter UI
may assume enforcement is universal without checking the actual
per-deployment flag. This diagram names the *shape* capability-gated
participation would take; it authorizes no connector and no new
enforcement default.

---

## 6. Sails Market as Distribution Surface, Not Protocol Parent

**The relationship, stated precisely:** the Sails Protocol (Core +
modules) defines the economic reality and its contract. Sails Market
(`sails-ui`) is **one interface** consuming that contract — the
reference one, and today's only Universal-Access one — not something
the protocol is built to serve. A native SDK integrator does not need
Sails Market to exist, is not routed through it, and gains no lesser
(or greater) protocol standing for integrating "around" it rather than
"through" it. This is the same distinction `docs/PRODUCT_INTERACTION_MODEL.md`
§7 already draws between a Wallet Integrator and a Service/Backend
Integrator, generalized one level up: **Sails Market itself is a third
kind of consumer of the same public contract**, not a layer either of
the other two depends on.

---

## 7. Non-Goals (this document does not authorize)

Per `P2P-JOURNEY-GATE-R1`'s own explicit instruction: no external
wallet connector (MetaMask/Xverse/OKX/Ledger/Trezor or any other) is
implemented, planned on a timeline, or claimed supported. No passkey or
Breez Auth mechanism is implemented. No `FundingInstruction`/
`SigningRequest` runtime is implemented. No new authority role is
created. No UI is redesigned. This document names a distribution model
and its real vs. not-yet-real mechanisms; it authorizes none of the
above.

---

## Closing confirmations

No protocol, SDK, Core, or Semantic Kernel change. No wallet connector,
no passkey/Breez Auth, no `FundingInstruction`/`SigningRequest`, no new
authority, no UI change. `MetaMask`/`Xverse`/`OKX`/`Ledger`/`Trezor` are
cited exclusively as illustrative example classes of a future-compatible
possibility, never as current or committed support. This document
institutionalizes a distribution/access model built entirely from
already-real mechanisms (the shared SDK contract, RFC-013's
`WalletAdapter` interface, RFC-005/013/014's Capability Registry) plus
one explicitly-labeled, not-yet-validated product hypothesis (the
network flywheel, §4).
