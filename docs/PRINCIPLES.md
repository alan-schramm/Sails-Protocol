# PRINCIPLES.md
### Sails Protocol — Engineering Handoff · Document 16 of 20

> These are not marketing language. Every principle here exists because
> violating it would break something specific — either the protocol's
> non-custodial guarantee, its ability to stay modular for ten years
> (`LONG_TERM_VISION.md`), or its regulatory neutrality. When a future
> architectural decision seems to conflict with one of these, that is a
> signal to stop and reconsider — not to quietly make an exception.

---

## How This List Was Reached

Two candidate lists existed before this one:

1. The **original 6** (from the first whitepaper draft, later lost during
   the 8-module architecture revision): Non-Custodial First, Protocol Over
   Platform, Bitcoin Native, Multi-Asset Future, Privacy Preserving, Open
   Integration.
2. The **CTO review's 7** (consistent across all parts of the review):
   Protocol First, Intent Driven, Self Custody Always, Fiat Off-Protocol,
   Capability Based, Infrastructure Neutral, Open Integrations.

Reconciling them: "Non-Custodial First" and "Self Custody Always" are the
same idea — the CTO's phrasing wins (clearer). "Protocol Over Platform" and
"Protocol First" are the same idea — same resolution. "Bitcoin Native" was
correctly dropped by the CTO's list — it contradicts the 8-module,
multi-asset architecture that now exists. "Multi-Asset Future" is
subsumed by "Infrastructure Neutral." "Open Integration" and "Open
Integrations" are the same idea. That leaves one genuine gap: **Privacy
Preserving** existed in the original list, does not appear in the CTO's 7,
and is substantively documented in `SECURITY_MODEL.md`'s "Privacy by
Design" section — a whole section of real architecture with no principle
representing it. It is added back as principle 8.

**Final count: 8 principles**, not 6, not 7 — the number that survives
reconciling both lists against what the architecture actually does.

**Update (Protocol Freeze, v8.2): the count grew to 9.** A finding from
the Protocol Quality Review — the `Negotiation` primitive had quietly
modeled its channel as a chat interface (`send(message)/onMessage`) —
surfaced a principle that wasn't explicit anywhere in the original 8, but
was cross-cutting enough (it applies just as much to how Discovery results
or Reputation scores get presented as to Negotiation) and specific enough
in what it prevents (a real 10-year relevance risk, not a hypothetical
one) to pass the same test the original 8 were held to. See Principle 9
below. This is not scope creep — it is exactly the kind of correction
Protocol Freeze exists to catch before the specification locks.

---

## The 9 Principles

### 1. Protocol First

Never optimize a specific implementation at the protocol's expense. If
Satsails Wallet needs something that would compromise the protocol's
neutrality or its non-custodial guarantee, the wallet changes — not the
protocol. This is the principle that keeps `ARCHITECTURE.md`'s
Protocol/Application/Domain/Infrastructure separation from eroding under
commercial pressure.

### 2. Intent Driven

Everything starts from an Intent, never from a direct API call describing
a specific action. `protocol.openP2P.createIntent(...)`, not
`createTrade()` or `buyBitcoin()` — see `API_REFERENCE.md`'s Intent-oriented
API redesign. This is what lets humans, wallets, and AI agents all speak
the protocol the same way (`PROTOCOL_SPECIFICATION.md` section 2).

### 3. Self Custody Always

The protocol never holds funds, never controls keys, and no server can
initiate a transaction on a user's behalf. This is not a feature — it is
the reason the protocol exists instead of another custodial exchange. Every
`SettlementProvider` implementation must preserve this, with no exception.

### 4. Fiat Off-Protocol

> "Fiat is always settled directly between participants. The protocol
> never intermediates fiat."

Fiat payment (PIX, ACH, SEPA, Wire, UPI, or any other rail) always happens
directly between buyer and seller. The protocol coordinates — it never
receives, processes, or holds fiat. See `PROTOCOL_SPECIFICATION.md`
section 4 for the exact transaction flow this constrains.

### 5. Capability Based

Applications and agents declare and are granted specific capabilities —
what they're allowed to do — rather than the protocol assuming any
application's business logic. Formalized in `rfcs/RFC-005-capability-model.md`
as two related interfaces: `Capability` (the functional category a module
implements, e.g. `trade-coordination`) and `CapabilityGrant` (the
permission to invoke one). See the Capability Registry
(`ARCHITECTURE.md` section 1B) and `PROTOCOL_SPECIFICATION.md` section 1.10.

### 6. Infrastructure Neutral

Bitcoin, Liquid, Lightning, Stacks, RSK, and any future chain are all
equally valid `SettlementProvider` implementations. The protocol commits
to no single chain, no single custody technology, and no single wallet
implementation. **This extends to transport, not just settlement (v8.3):**
Pears/HyperDHT is today's `TransportProvider` implementation
(`PROTOCOL_SPECIFICATION.md` §4B), not a fixed dependency — a future,
genuinely better P2P transport is an adapter away, never a Core rewrite.

### 7. Open Integrations

Any wallet, any fintech, any bank, any ERP, any AI agent framework can
integrate. No approval process gates who may build against the protocol
spec — only the SDK's public interface and the module registry's naming
discipline (`LONG_TERM_VISION.md`, "How New Modules Emerge").

### 8. Privacy Preserving

The protocol collects the minimum data necessary to coordinate — trade
state, offer metadata, reputation scores — and nothing more. Communication
between counterparties is E2E via Secretstream, never logged by protocol
infrastructure. See `SECURITY_MODEL.md` section 4, "Privacy by Design," for
the full mechanism this principle protects.

### 9. Interface Agnostic

The Core models intentions, states, and events — never user interfaces.
`PROTOCOL_SPECIFICATION.md` §1.4's `NegotiationEvent` is the concrete
example: negotiation is a sequence of structured state transitions
(`OFFER_PROPOSED`, `COUNTER_OFFERED`, `TERMS_ACCEPTED`), and a chat UI is
one pluggable way to transport and render those events — never the
definition of negotiation itself. The same discipline applies to every
other primitive: Discovery doesn't assume results are shown as a list,
Reputation doesn't assume a score is displayed as stars, Agent doesn't
assume a decision is confirmed via a dialog box. What's presented to a
human today and what's exchanged as raw JSON between two QVAC agents
tomorrow are two `NegotiationChannel` implementations of the exact same
primitive — the Core never changes between them.

---

## Where These Principles Must Appear

Per the CTO review's explicit recommendation: these 9 principles should
appear, verbatim and in this order, in the Whitepaper (as a dedicated
section, not buried in an appendix), in this handoff's `PROJECT_CONTEXT.md`,
and in any future onboarding material for third-party integrators. They
are not a one-time deliverable — they are the test any new module or
architectural proposal should be checked against before being accepted.
