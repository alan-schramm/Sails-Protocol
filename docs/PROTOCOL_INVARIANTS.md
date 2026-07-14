# PROTOCOL_INVARIANTS.md
### Sails Protocol — Engineering Handoff · Document 19 of 20

> Requested explicitly by the CTO after reviewing RFC-001 through RFC-005:
> "a technical constitution — rules that can never be broken." This is
> distinct from `PRINCIPLES.md` (9 principles that *guide* architectural
> decisions) and `PHILOSOPHY.md` (the reasoning *why* those principles
> exist). Invariants are stricter than either: they are not guidance to be
> weighed against other considerations — they are conditions that, if
> violated, mean the resulting system is no longer the Sails Protocol,
> regardless of what it's called.

---

## How an Invariant Differs From a Principle

A Principle can be honored imperfectly and still leave a recognizably
sound protocol — e.g., "Interface Agnostic" (Principle 9) was violated
once, informally, in an early `Negotiation` draft, and fixing it (RFC-004)
was a correction, not a rebuild. An Invariant cannot be violated even
once without the system ceasing to be Sails Protocol. There is no
"mostly non-custodial" the way there can be a "mostly interface-agnostic
Negotiation before RFC-004 fixed it."

---

## The Invariants

### 1. The Core Never Knows Concrete Implementations

The Intent Engine, Coordination Engine, Event Bus, State Machine,
Capability Registry, and Policy/Rules Engine (`ARCHITECTURE.md` §1B) never
reference a specific chain, a specific transport, a specific identity
scheme, or a specific module's internal logic. Every place a concrete
choice is needed, an interface exists instead — `SettlementProvider`
(§1.5), `TransportProvider` (RFC-002), `Participant` (RFC-001),
`Capability` (RFC-005). If any future code adds a direct dependency from
Core onto a concrete implementation, that code is wrong, not the
invariant.

### 2. The Protocol Never Custodies Assets

No Sails Protocol component — Core, module, or Reference Implementation
acting as the protocol itself — ever holds a private key or controls an
asset on a user's behalf. `SettlementProvider` implementations lock value
in escrow (multisig, HTLC, covenant) that no single party unilaterally
controls; they never transfer custody to a Sails-operated account. This is
`PRINCIPLES.md` Principle 3 ("Self Custody Always") elevated from
guidance to invariant because it is the protocol's entire reason for
existing over a custodial alternative — see `PHILOSOPHY.md`, "Why
Coordination, Not Custody."

### 3. Fiat Always Settles Outside the Protocol

The protocol never receives, holds, processes, or executes a fiat
payment — PIX, ACH, SEPA, Wire, UPI, or any other rail. Fiat settles
directly between participants; the protocol only coordinates negotiation
and digital-asset settlement. Canonical statement (`MASTER_COORDINATION.md`
v8.0): *"Fiat is always settled directly between participants. The
protocol never intermediates fiat."*

### 4. Every Module Is Optional

No application is required to implement more than the modules its use
case needs. A Reference Implementation offering only `OpenP2P` is as
valid an implementation of Sails Protocol as one offering all seven
current modules. This is what makes `Capability` (RFC-005) a meaningful
abstraction rather than a fixed bundle — an application declares which
Capabilities it implements or consumes; the protocol never assumes all of
them are present.

### 5. Every Implementation Respects the Protocol Principles

`PRINCIPLES.md`'s 9 principles are not a checklist a Reference
Implementation can partially satisfy and still claim to implement Sails
Protocol. An implementation that touches fiat, or that lets an Agent act
without a delegating Participant's authority, is not a partial
implementation of Sails Protocol — it is not an implementation of Sails
Protocol.

### 6. The Protocol Remains Infrastructure-Neutral

No single blockchain, no single P2P transport, no single identity or
custody scheme, no single AI framework is privileged by the Core.
Bitcoin, Liquid, Lightning, EVM chains, Solana, and TON are equally valid
`SettlementProvider` implementations (§4B). Pears and any future P2P
transport are equally valid `TransportProvider` implementations (RFC-002).
Ed25519 keypairs and any future `Participant` implementation — a
multi-signature corporate account, a post-quantum scheme — are equally
valid (RFC-001). This invariant is what makes the other five durable for
the ten-year horizon `LONG_TERM_VISION.md` argues for: an invariant that
secretly privileged one chain, one transport, or one identity scheme would
not survive contact with year eight the way TCP/IP or Bitcoin's base
layer have.

---

## How Invariants Are Enforced

Unlike Principles (which guide judgment) and Philosophy (which explains
reasoning), Invariants should be checked mechanically wherever possible:

- **RFC Review** (`GOVERNANCE.md` §5): every RFC's "Principle Alignment"
  section should also state, explicitly, that it does not violate any
  invariant above — silence on this is not sufficient once Implementation
  Freeze begins.
- **Code review, once Implementation Freeze starts:** the discipline the
  CTO specified — every new module or API references the RFC that defines
  its behavior — makes Invariant violations checkable at review time, not
  just at design time. A pull request implementing settlement logic that
  doesn't cite `SettlementProvider`'s interface, or that adds a
  Sails-operated custody path, is checkable against Invariant 1 and 2
  mechanically, not just by judgment call.
- **A violation found after the fact is not "documented as an
  exception."** Per the definition above, a violation means the resulting
  system is not Sails Protocol — the fix is to remove the violation, not
  to add a caveat to this document.
