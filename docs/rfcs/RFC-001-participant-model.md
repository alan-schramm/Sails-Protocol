# RFC-001: Participant Model — Core Depends on an Abstraction, Not on Identity

## Summary

The Core should never reference `Identity` (Ed25519 keypair,
`OpenIdentity`'s concrete shape) directly. It should reference an abstract
`Participant` interface instead, with `Identity` as one implementation.
This is the same Adapter Pattern discipline already applied to Settlement
(RFC-002... no — already in `PROTOCOL_SPECIFICATION.md` §4B) and Transport
(this RFC's sibling, RFC-002), now extended to identity.

## Motivation

Every primitive — Intent, Negotiation, Settlement, Reputation — references
"who did this" via a `participantId`. Today, that reference implicitly
assumes the participant is an `Identity`: an Ed25519 keypair with a
`verificationLevel`. That assumption is unnecessary and, left uncorrected,
would have made the same 10-year-relevance mistake `Negotiation` almost
made by modeling chat as the primitive — see `PRINCIPLES.md` Principle 9,
"Interface Agnostic." A company or bank needing multi-key custody, not a
single Ed25519 key, is a real near-term case this would otherwise force
into an awkward fit.

## Alternatives Considered

1. **Promote Identity itself to the Core.** Rejected — considered and
   rejected once already in the Protocol Quality Review that preceded this
   RFC. It would reduce flexibility for future key schemes without
   removing the coupling problem; it just moves the specific shape one
   layer up instead of abstracting it.
2. **Leave Identity as-is, accept the coupling.** Rejected — this is
   exactly the asymmetry the Protocol Quality Review flagged for Transport
   (`RFC-002`) and would have been inconsistent to leave unresolved here
   while fixing it there.
3. **Introduce `Participant` as the Core-level abstraction, with `Identity`
   as its first implementation.** **Accepted.**

## Decision

```typescript
// Core-level — what every other primitive actually depends on.
interface Participant {
  participantId: string
  verificationLevel: 0 | 1 | 2
  proveControl(challenge: Challenge): Promise<IdentityProof>
}

// Sails OpenIdentity's existing shape becomes ONE implementation:
interface Identity extends Participant {
  publicKey: string        // Ed25519
  createdAt: Timestamp
}

// A plausible future implementation for companies/banks needing
// multi-key custody instead of a single Ed25519 key — no Core change
// required to add this later:
interface OrgMultisigParticipant extends Participant {
  signers: string[]
  threshold: number
}
```

**A correction made during this RFC's drafting, not in the original
proposal:** `Wallet` and `Agent` are explicitly **not** implementations of
`Participant` at this level.

- `Wallet` is software that holds a Participant's keys — it has no
  identity of its own to prove. Modeling it as a `Participant`
  implementation would conflate a tool with an actor.
- `Agent` (`PROTOCOL_SPECIFICATION.md` §1.7) already has a stricter,
  more important rule: it acts **under delegation** from a Participant, and
  every action is attributed back to the delegating Participant for
  Reputation purposes. If `Agent` implemented `Participant` directly at
  the same level as `Identity`, that would open a reading where an Agent
  could act as an independent entity — directly contradicting
  `PRINCIPLES.md` Principle 3 ("Self Custody Always") and the mitigation
  designed for `RED_TEAM_REVIEW.md` finding RT-004 (prompt injection into
  agent negotiation, mitigated by enforcing `AgentScope` limits *outside*
  the agent's own reasoning). `Agent` consumes a delegating `Participant`;
  it does not become one.

## Primitives Used or Extended

Extends **Identity** (§1.1) — no new primitive. `Identity` is now
explicitly a `Participant` implementation rather than the Core's only
possible shape for "who acted." This passes the same discipline
`PROTOCOL_SPECIFICATION.md` §1.10-1.11 already applied: it does not add a
tenth primitive, it clarifies which existing primitive is the abstraction
and which is the implementation.

## Principle Alignment

- **Principle 9 (Interface Agnostic):** direct application — the Core
  models "a participant acted," never the specific proof mechanism.
- **Principle 6 (Infrastructure Neutral):** extended by analogy — no
  single identity/custody scheme is privileged, matching how no single
  chain or transport is privileged.
- **Principle 3 (Self Custody Always):** the correction above (Agent
  excluded from directly implementing Participant) exists specifically to
  protect this principle from an unintended reading.

## Specification

See Decision above. `OpenIdentity` module code does not change in
behavior — `Identity` already had this exact shape. The change is purely
that `Negotiation`, `Settlement`, `Reputation`, and `Intent` primitives
now type their `participantId`-holding fields against `Participant`, not
`Identity`, in `PROTOCOL_SPECIFICATION.md`.

## Backward Compatibility

No `protocolVersion` bump required. Every existing `Identity` record
already satisfies the new `Participant` interface — this is a
type-hierarchy clarification, not a data migration.

## Reference Implementation Plan

Satsails Wallet's existing `OpenIdentity` implementation requires no
change — it already produces `Identity` records with exactly this shape.
`OrgMultisigParticipant` is not being built now; it is documented here so
that when Sails Finance or SailsPay need corporate custody (a realistic
near-term need per `REFERENCE_IMPLEMENTATIONS.md`), the Core requires no
change to support it.
