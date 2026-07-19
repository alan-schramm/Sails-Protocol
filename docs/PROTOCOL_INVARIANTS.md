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

## The Constitutional Invariants

> Retitled from "The Invariants" *(2026-07-19, same consolidation pass
> that added the "Operational Invariants" section below)* — not a
> content change, just a label distinguishing these six protocol-shape
> rules from the code-traceable ones added below. Both are equally
> "never broken"; they differ in what they're rules *about*.

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

> **⚠ Known violation, real code, 2026-07-19.** Per this document's own
> §"How Invariants Are Enforced" below, a violation is not something to
> quietly caveat — it means the violating system is not Sails Protocol.
> Stating that plainly: the one real, tested `SettlementProvider`
> (`WdkSettlementProvider`, `wdk-settlement.provider.ts`) violates this
> invariant. It signs every escrow release from a single server-held
> seed phrase, not from any user's own key — full detail in
> `CRYPTOGRAPHIC_MODEL.md` §5, `SECURITY_MODEL.md` §2 Principle 2. This
> is flagged here loudly, not smoothed over, precisely because the
> correct response per this document's own rule is "remove the
> violation" — **RFC-019** (`rfcs/RFC-019-settlement-custody-reference-vs-normative.md`)
> is the accepted, registered plan for doing exactly that: reclassifying
> the current implementation as a reference-only implementation and
> specifying the real non-custodial target architecture, without
> committing to a build date. Also tracked in `TODO.md`.

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

## Operational Invariants

> Added *(2026-07-19)*, relaying a CTO-role architectural review
> requesting invariants concrete enough for tests to check directly —
> "`INV-001: Funds MUST NEVER move before Settlement Locked`"-style
> rules. The six Constitutional Invariants above are about the
> protocol's *shape* (no custody, no fiat, infrastructure-neutral); these
> are about specific runtime behavior, each traceable to the RFC that
> decided it and the code that enforces it today. Where enforcement is
> conditional (a feature flag, off by default per this project's
> established precedent — `TODO.md`), that's stated, not hidden: an
> invariant that's real only when a flag is on is still worth stating
> precisely, but claiming it's unconditional when it isn't would be
> exactly the kind of gap this document exists to prevent.

### INV-OP-1. No Escrow Mutation Without a Verified Party

`lockFunds`/`markPaymentSent`/`releaseFunds`/`refundFunds`/
`openDispute` may only be triggered by the trade's actual buyer or
seller, or — for release/refund specifically — the dispute's assigned
arbiter. Unconditional, not feature-flagged: found missing and fixed in
a general gap audit (`TODO.md` §14), verified in
`tests/escrowReleaseControls.test.ts`'s ownership/IDOR block (11 tests).
Enforced in `open-settlement/escrow.service.ts`.

### INV-OP-2. Escrow Release Requires Two Independent Approvals, When Enabled

When `REQUIRE_DUAL_APPROVAL_RELEASE=true` (off by default —
`config.features.requireDualApprovalForRelease`), `releaseFunds()` on a
`PAYMENT_PENDING` escrow blocks unless `hasDualApproval()` counts two
*distinct* approvers. A `DISPUTED` escrow bypasses this — an arbiter's
ruling is itself the second, independent authorization. RFC-015.
Enforced in `open-settlement/escrow.service.ts`; see
`tests/escrowReleaseControls.test.ts`.

### INV-OP-3. A Crypto-Native Agent Never Touches Fiat Rails

No QVAC Agent code path (`BuyerAgent`, `SellerAgent`,
`qvac-agent.provider.ts`) ever calls a banking API, processes PIX/ACH/
SEPA/Wire/UPI, or holds fiat balance state. This is structural, not
feature-flagged — no fiat integration exists anywhere in the Agent's
reachable code, by construction. Fiat settles directly between
participants, outside the protocol entirely (Constitutional Invariant
3). RFC-016.

### INV-OP-4. Fraud/Risk Detection Never Acts Unilaterally

`SocialEngineeringAgent.evaluate()` (when
`SOCIAL_ENGINEERING_DETECTION=true`, off by default) may only ever
produce a `RiskSignal` that results in a human-facing `RISK_WARNING`
broadcast. It never blocks, delays, cancels, or alters a trade, chat
message, or escrow state — detection and enforcement are strictly
separate code paths, with no call from the former into the latter. RFC-
017 D7. Enforced by `open-agents/social-engineering-agent.ts`'s own
return type (`RiskSignal | null`, never a mutation) and
`chat.routes.ts`'s handler, which only ever calls
`broadcastToTrade(..., { type: 'RISK_WARNING', ... })`.

### INV-OP-5. Reputation Score Changes Through Exactly One Entrypoint

`User.reputationScore` is mutated only by `recordOutcome()`
(`open-reputation/reputation.service.ts`), itself triggered only by
`settlement.escrow.released`/`refunded` events. A chat message, an
Agent action, a QVAC risk signal, or `rate()` (informational only, by
its own header comment) can never move the score. RFC-007 D8.

### INV-OP-6. Every Authenticated Write Requires a Verified Signature

No route derives `participantId` from a client-supplied body field.
Every write-side route requires `requireAuth()`, which only ever sets
`req.participantId` from a session token issued after a real Ed25519
challenge-response verification (`CRYPTOGRAPHIC_MODEL.md` §2) — never
from a bare claimed id. Originally the RT-002 fix for one route family;
generalized and re-verified across the codebase in the same gap audit
as INV-OP-1 (`TODO.md` §14). Enforced by `common/middleware/auth.ts`.

### INV-OP-7. Financial Amounts Are Always `Decimal`, Never `Float`

Every schema field representing money or on-chain value
(`Offer.priceUsd`, `Escrow.lockedAmount`, `User.totalVolumeBtc`, etc.)
is a Prisma `Decimal`, end to end — no `Float`/`Number` financial field
exists anywhere in `prisma/schema.prisma`, and no computation path
converts a `Decimal` to a JS `number` before a value comparison or
persistence write. RFC-009 (floating-point rounding is a real-money
correctness bug class, not a style preference).

### INV-OP-8. Every Durable Event Carries a `correlationId`

`EventStore.publish()` (RFC-010) refuses an event with no
`correlationId` — there is no code path that persists a durable event
untraceable back to the Intent, Trade, or userId it belongs to. This is
what makes `Timeline`/`getEvents(correlationId)`
(`CRYPTOGRAPHIC_MODEL.md` §4.2) and `SocialEngineeringAgent`'s
conversational context possible at all — an event with no correlation
id would be structurally invisible to both.

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
