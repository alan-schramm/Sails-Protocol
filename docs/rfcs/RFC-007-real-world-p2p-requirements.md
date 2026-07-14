# RFC-007: Real-World P2P Requirements

**Status:** Accepted (CTO directive, bootstrap-phase governance —
`GOVERNANCE.md` §1: "the Satsails engineering team, following the RFC
Process below even internally"). Unlike RFC-001 through RFC-006, this RFC
did not go through an open Discussion window before acceptance — the CTO
directed immediate adoption. Recorded here rather than silently skipped,
consistent with `GOVERNANCE.md`'s own rule that no spec change happens as
an unlogged edit, including by the original authors. Merged into
`PROTOCOL_SPECIFICATION.md`, `ARCHITECTURE.md`, `DATABASE.md`,
`BACKLOG.md`, and `SDK_GUIDE.md` as of this acceptance.

## Summary

Eleven requirements (`RWR-001` through `RWR-011`), surfaced from interviews
with experienced P2P market operators, extending five existing modules
(OpenProof, OpenSettlement, OpenReputation, OpenIdentity, OpenAgents) and
introducing two new Adapter-pattern interfaces (`EvidenceProvider`,
`ArbitrationProvider`). This RFC does **not** create a P2P-specific
protocol or a ninth module — every requirement is framed as a generic
extension to an existing primitive or module, usable by any application
module (OpenP2P today, OpenFinance later), consistent with Principle 1
("Protocol First"). Two concepts proposed in the interview material as new
primitives — `EvidenceBundle` and `Timeline` — are evaluated against the
primitive test (`PROTOCOL_SPECIFICATION.md` §1.10-1.11) below and **rejected
as primitives**, for the same category reasons that rejected `Event` and
`Package`.

## Motivation

Operator interviews surfaced concrete production gaps, not hypothetical
ones:

- Payment screenshots and receipts reused across multiple disputes by the
  same bad actor, because nothing fingerprints or indexes submitted
  evidence.
- Disputes with evidence scattered across chat, uploads, and settlement
  records instead of one queryable set.
- Bank settlement modeled as instant, when in practice a PIX/bank transfer
  can be initiated and then held or delayed by the financial institution
  before it actually clears.
- Every dispute routed straight to a human, when the majority are
  resolvable from policy plus evidence alone.
- Counterparties steering a negotiation off-protocol (WhatsApp, Telegram,
  a changed bank/PIX key) as a precursor to fraud, with no automated
  detection.
- Reputation systems where a party who cancels in bad faith can still
  leave a punitive rating, turning the reputation system itself into an
  attack surface.
- High-volume market makers forced through the same manual two-sided
  confirmation flow as a one-time retail trader, with no protocol-level
  way to earn faster settlement.

None of these are unique to the P2P market in the abstract — they are
trade-coordination, evidence, and trust problems that happened to surface
first in the market OpenP2P already serves, and which OpenFinance will hit
again later if they aren't solved once at the protocol level now.

## Alternatives Considered

**Framing this as a P2P-specific module or protocol fork.** Rejected —
this was explicitly ruled out in the source material itself and would
violate Principle 1 (Protocol First): OpenP2P is one Package (RFC-006)
built on Core primitives, not a place to bolt on requirements that belong
at the primitive or module level. Every requirement below is stated in
terms of an existing module or interface, the same discipline
`ARCHITECTURE.md` §1C already applies to OpenFinance.

**Calling the arbitration participants "Guardiões" (Guardians).** Rejected
in the source interviews themselves, and accepted here for the same
reason: the name implies the protocol governs or controls the network,
which risks both a technical misreading (that the protocol has privileged
actors) and a regulatory one (that Sails is assuming responsibility for
arbitration outcomes). `Trusted Arbitrator`, registered per-application
through an `ArbitrationProvider` interface, keeps the protocol itself
neutral — it defines the interface, never who fills it, the same pattern
already established for `SettlementProvider` (§1.5) and `TransportProvider`
(RFC-002).

**Having the protocol host evidence media (images, video, documents)
directly.** Rejected — this would violate Principle 3 (Self Custody
Always) and Principle 6 (Infrastructure Neutral) by making the protocol a
storage custodian, and would centralize a cost and liability the protocol
has no reason to take on. See RWR-002 / `EvidenceProvider` below for the
accepted alternative (a pointer-and-hash pattern, Nostr-inspired).

**Promoting `EvidenceBundle` and `Timeline` to new Core primitives**, as
literally proposed in the interview material. Considered in detail under
"Primitives Used or Extended" below — rejected in favor of extending
existing primitives/modules, on the same irreducibility and category
grounds that rejected `Event` (§1.11) and `Package` (RFC-006).

## Decision

Eight sub-decisions, grouped by which existing primitive or module they
extend. None require a new module — OpenProof, OpenSettlement,
OpenReputation, OpenIdentity, and OpenAgents already exist as the 8
official modules (`ARCHITECTURE.md` §3).

### D1 — Proof Registry (`RWR-001`): extends OpenProof, no interface change

An internal component of OpenProof (RFC-006), not a new module and not a
new primitive — the same relationship `ARCHITECTURE.md` §1B draws between
Core and the Capability Registry / Policy Engine it hosts.

```typescript
// Internal to OpenProof — not exposed as a new Core primitive.
interface ProofRegistry {
  fingerprint(evidence: unknown): Promise<string>       // perceptual/content hash
  register(proofId: string, fingerprint: string, intentId: string): Promise<void>
  findDuplicates(fingerprint: string): Promise<ProofRegistryMatch[]>
}
interface ProofRegistryMatch {
  proofId: string
  intentId: string          // a *different* Intent than the one being checked
  matchedAt: Timestamp
}
```

`submitProof()` (`PROTOCOL_SPECIFICATION.md` §1.8) calls
`ProofRegistry.fingerprint()` before persisting a `Proof`, and surfaces
`findDuplicates()` results as a `proof.duplicate_detected` event rather
than silently blocking — OpenProof flags reuse, it does not adjudicate it;
adjudication is Dispute's (§1.9) and Policy Engine's job.

### D2 — `EvidenceProvider` (`RWR-002`): new Adapter interface

A new Adapter category, the same pattern as `SettlementProvider` (§1.5)
and `TransportProvider` (RFC-002) — which is exactly why it needs an RFC
per `GOVERNANCE.md` §3 ("New `SettlementAdapter` implementation" needs no
RFC, but a new Adapter *category* does, by the same logic RFC-002 needed
one for Transport).

```typescript
interface EvidenceProvider {
  providerName: string                 // e.g. 'nostr.build', 's3', 'r2', 'ipfs', 'arweave'
  store(media: Uint8Array, mimeType: string): Promise<EvidenceReference>
  retrieve(reference: EvidenceReference): Promise<Uint8Array>
}
interface EvidenceReference {
  proofId: string
  provider: string
  uri: string
  sha256: string
  mimeType: 'image' | 'video' | 'document' | 'ocr' | 'external_reference'
  timestamp: Timestamp
  signature: string           // signed by the submitting Participant's key
}
```

The protocol never stores media. `Proof.evidence` (§1.8) becomes, in
practice, an `EvidenceReference` for media-backed claims — the field's
type (`unknown`) already accommodates this without changing `Proof`'s
shape. Each Reference Implementation chooses its own `EvidenceProvider`;
OpenProof only ever persists the reference, hash, and signature.

### D3 — `PendingBankSettlement` (`RWR-003`): extends Settlement primitive

A new `SettlementStatus` value, added to the enum referenced in §1.5. In
the existing `escrow.service.ts` state machine (`CREATED` →
`FUNDS_LOCKED` → `PAYMENT_PENDING` → `COMPLETED` / `DISPUTED` /
`REFUNDED`), this sits between `PAYMENT_PENDING` and `COMPLETED`:

```
PAYMENT_PENDING → PENDING_BANK_SETTLEMENT → COMPLETED
                                          ↘ DISPUTED
```

Represents payment that has left the payer (PIX/bank transfer initiated)
but is held or processing at the financial institution before it clears —
distinct from `PAYMENT_PENDING`, where the payer has not yet acted. This
does not change the `Settlement` interface's shape (§1.5), only the
`SettlementStatus` enum and the transition table `assertTransition()`
enforces.

### D4 — Dispute escalation order + `ArbitrationProvider` (`RWR-004`): extends Dispute primitive

`Dispute.status` (§1.9: `'OPENED' | 'EVIDENCE_SUBMITTED' | 'ARBITRATED' |
'RESOLVED'`) gains an explicit escalation order rather than jumping
straight from evidence to arbitration:

```
Evidence collected (OpenProof)
  ↓
Policy Engine  — checks against configured auto-resolution rules
  ↓
OpenAgents      — attempts automated resolution from policy + evidence
  ↓
Trusted Arbitrator (via ArbitrationProvider) — only if the above two do not resolve it
  ↓
Settlement — release / refund / split
```

```typescript
interface ArbitrationProvider {
  providerName: string                    // registered per application, not per protocol
  arbitrators: string[]                   // Participant IDs the application trusts
  assign(disputeId: string): Promise<string>          // returns arbiterId
  rule(disputeId: string, arbiterId: string): Promise<Dispute['ruling']>
}
```

`Dispute.arbiterId` (§1.9) is now populated via `ArbitrationProvider`
rather than assumed to be a protocol-native role — consistent with
rejecting "Guardiões" above. No change to `Dispute`'s fields; this
formalizes *how* `arbiterId` and `ruling` get set, not their shape.

### D5 — Timeline (`RWR-005`): Core-level read-model, not a primitive

See "Primitives Used or Extended" below for the full reasoning. Decision:
`Timeline` is a Core-level, per-Intent ordered projection over the
existing Event Bus (`ARCHITECTURE.md` §5), not a new primitive and not
owned by any single module:

```typescript
// Core-level query surface, not a new domain object participants act on.
interface Timeline {
  intentId: string
  getEvents(): Promise<TimelineEntry[]>
}
interface TimelineEntry {
  eventType: string        // e.g. 'IntentCreated', 'PaymentInitiated',
                            // 'EvidenceUploaded', 'DisputeOpened'
  occurredAt: Timestamp
  payload: unknown
}
```

`Timeline.getEvents()` is a read projection over events already emitted
on the Event Bus, filtered by `intentId` and ordered by timestamp — it
introduces no new write path and no new event that doesn't already exist
under §1.2-1.9's event lists.

### D6 — Evidence Bundle (`RWR-006`): OpenProof-owned aggregate, not a primitive

See "Primitives Used or Extended" below. Decision: `EvidenceBundle` is an
OpenProof-owned query aggregate — the module that already owns `Claim` /
`Proof` / `Verification` (RFC-006) is the natural owner of "all evidence
for this Intent," the same way `Dispute.proofs: Proof[]` (§1.9) already
aggregates `Proof`s without `Proof` needing to know about `Dispute`.

```typescript
// OpenProof-owned aggregate — composes existing primitives, is not one itself.
interface EvidenceBundle {
  intentId: string
  claims: Claim[]
  proofs: Proof[]
  verifications: Verification[]
  timeline: TimelineEntry[]        // pulled from D5's Timeline for the same intentId
  externalReferences: EvidenceReference[]  // from D2
}
// OpenProofService (§1.8/RFC-006) gains one method:
interface OpenProofService {
  // ...existing assertClaim / submitProof / verify unchanged
  getEvidenceBundle(intentId: string): Promise<EvidenceBundle>
}
```

`Dispute.proofs` (§1.9) can be populated from
`EvidenceBundle.proofs` directly once a dispute opens — `EvidenceBundle`
is the general-purpose read model; `Dispute` still owns which subset
becomes formal evidence for a ruling.

### D7 — Social Engineering Agent (`RWR-007`): extends OpenAgents

A specialized agent behavior within OpenAgents (§1.7), not a new
primitive or module — the same category as the fraud-detection and
matching behaviors OpenAgents already lists in `ARCHITECTURE.md` §3.

```typescript
interface SocialEngineeringAgent {
  evaluate(event: TimelineEntry): Promise<RiskSignal | null>
}
interface RiskSignal {
  intentId: string
  pattern: 'off_channel_migration' | 'payment_instruction_change' |
           'unexpected_flow_deviation' | string   // open string, policy-configurable
  riskScore: number
  detectedAt: Timestamp
}
```

Runs against the same `Timeline` (D5) any other consumer reads —
detection is local/on-device per `PRINCIPLES.md` Principle 8 (Privacy
Preserving) and `SECURITY_MODEL.md`'s local-AI guarantee, consistent with
`AgentGrant`/`AgentScope` (§1.7) already established for OpenAgents.
`riskScore` feeds the Policy Engine, which decides what happens next
(warn, hold, escalate) — the agent detects, it does not act unilaterally.

### D8 — Outcome-based Reputation, cancellation neutrality, Liquidity Provider policies (`RWR-008`, `RWR-009`, `RWR-010`, `RWR-011`)

Grouped because they are one coherent change to how `ReputationContract`
(§1.6) is used, plus the `OpenIdentity` addition (`Operational Profile`)
that the Liquidity Provider policy depends on.

**RWR-008/009 — reweight `ReputationContract`, don't change its shape.**
`recordOutcome(event: SettlementOutcome)` already exists in §1.6 and
already reads from Settlement, not from user opinion — this RFC does not
add a method, it makes `recordOutcome` the *primary and only* source of
`ReputationScore`, and demotes `rate()` to feedback that is stored but
never folded into the score:

```typescript
// §1.6, unchanged shape — only the score-computation rule changes.
interface ReputationContract {
  get(participantId: string): Promise<ReputationScore>
  recordOutcome(event: SettlementOutcome): Promise<void>   // now the ONLY score input
  rate(negotiationId: string, raterId: string, score: number): Promise<void>  // informational only, does not alter ReputationScore
}
// New internal component of OpenReputation — not a primitive, same relationship
// as ProofRegistry is to OpenProof (D1).
interface OutcomeEngine {
  classify(outcome: SettlementOutcome): 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
}
```

Outcome classification (illustrative, configurable via Policy Engine, not
hardcoded in Core):

| Outcome | Class |
|---|---|
| `TradeCompleted` (no dispute, no timeout) | Positive |
| `CancelledByAgreement` | Neutral |
| `PaymentTimeout` | Negative |
| `FraudConfirmed` | Negative |
| `ArbitrationDecision` (ruling-dependent) | Positive/Negative per ruling |

**RWR-009, specifically:** a `CancelledByAgreement` outcome is always
`Neutral` — it is recorded on the `Timeline` (D5) and may carry a
`rate()` feedback entry, but by construction never produces a `Negative`
classification. This closes the "cancel-then-punish" abuse pattern
described in Motivation without adding a special case to `Settlement` or
`Dispute` — it's one row in the `OutcomeEngine`'s classification table.

**RWR-010/011 — `Operational Profile` (OpenIdentity growth-path addition) drives Policy Engine, not a new permission primitive.**
`Identity`'s core contract (§1.1) is unchanged. `Operational Profile` is
an additive OpenIdentity-module attribute, the same category as the
existing DID / Credentials / Trust Graph growth path already documented
in §1.1 — none of which change what `Identity` fundamentally is:

```typescript
// OpenIdentity module-level addition — not part of the Identity primitive's core contract.
type OperationalProfile =
  | 'regular_trader' | 'liquidity_provider' | 'merchant' | 'arbitrator' | 'agent'

interface OperationalProfileGrant {
  participantId: string
  profile: OperationalProfile
  grantedBy: string          // an application, via Policy Engine — not a protocol-level KYC check
  criteria?: Record<string, unknown>   // e.g. { minScore: 95, minTrades: 1000, noRecentDisputes: true }
}
```

`liquidity_provider` is not a fixed privilege — it is a `CapabilityGrant`
(§1.10, RFC-005) scoped by `OperationalProfileGrant`, evaluated by the
Policy Engine, e.g. a `trustedSettlementAcceleration` policy that lets a
qualifying Liquidity Provider trigger `Settlement.release()` (§1.5)
without waiting on the counterparty's manual confirmation. This is
policy-gated, not a protocol-level permission — consistent with how §1.10
already draws the line between what Core enforces (grants, scope) and
what Policy configures (thresholds, which grants unlock what).

## Primitives Used or Extended

**No new primitive is proposed by this RFC.** Extends: Proof (§1.8, via
OpenProof/RFC-006), Settlement (§1.5), Dispute (§1.9), Reputation (§1.6),
Identity (§1.1, module growth path only — core contract unchanged), Agent
(§1.7). Introduces two new Adapter interfaces (`EvidenceProvider`,
`ArbitrationProvider`) in the existing Adapter pattern
(`PROTOCOL_SPECIFICATION.md` §4B) — not primitives, adapters, the same
category as `SettlementProvider` and `TransportProvider`.

**`EvidenceBundle` — considered and rejected as a primitive.** Applying
the test from §1.10-1.11 (irreducible, orthogonal, own participant-facing
lifecycle, cross-cutting): it fails irreducibility the same way `Offer`
did. `Offer` was rejected as "OpenLiquidity's concrete database artifact
representing a published Intent, not an orthogonal concept" (§1.11).
`EvidenceBundle` is structurally identical — a materialized composition
of `Claim[]`, `Proof[]`, `Verification[]`, `TimelineEntry[]`, and
`EvidenceReference[]`, all of which already exist as primitives or
primitive-adjacent structures. It has no lifecycle of its own:
participants don't create, negotiate, or settle an `EvidenceBundle` — it
comes into existence automatically as those other things happen, and
disappears as a concept the moment you ask "what changes state when it's
created?" and the answer is "nothing; it's a query." Decision: OpenProof
module-level aggregate (D6), not a primitive.

**`Timeline` — considered and rejected as a primitive**, on almost exactly
the grounds §1.11 already rejected `Event`: "Event is the *mechanism* by
which any [primitive]'s state changes get communicated... the
event-emission mechanism itself isn't a separate primitive." `Timeline`
is that same mechanism's ordered, per-Intent read projection — it doesn't
add a domain concept two parties transact around, it makes the existing
Event Bus (`ARCHITECTURE.md` §5) queryable in order for one `Intent`.
Decision: Core-level read-model (D5), not a primitive.

This RFC's contribution to the primitive discipline is the same one
RFC-006 made for `Package`: showing that a proposal *feeling* like it
deserves primitive status (because it's genuinely useful and
cross-cutting) is not the same as it *passing* the test — usefulness and
cross-cutting-ness are necessary but not sufficient; irreducibility and an
independent lifecycle are the parts that actually gate the decision.

## Principle Alignment

- **Principle 1 (Protocol First):** the entire RFC is framed as generic
  extensions to primitives/modules OpenFinance can reuse verbatim, not a
  P2P-specific bolt-on — see Alternatives Considered.
- **Principle 3 (Self Custody Always) / Principle 6 (Infrastructure
  Neutral):** `EvidenceProvider` (D2) keeps the protocol from ever
  custodying media, mirroring why `SettlementProvider` keeps it from ever
  custodying funds.
- **Principle 5 (Capability Based):** `OperationalProfileGrant` (D8) is
  implemented as a `CapabilityGrant` (RFC-005), not a new permission
  mechanism — applications declare policy, Core enforces grants, exactly
  the existing division of labor.
- **Principle 7 (Open Integrations):** `ArbitrationProvider` (D4) keeps
  arbitration an application-level registration, not a protocol-native
  role — explicitly the reasoning that rejected "Guardiões."
- **Principle 8 (Privacy Preserving):** the Social Engineering Agent (D7)
  runs on-device against the Timeline, consistent with OpenAgents' local-AI
  guarantee (§1.7, `SECURITY_MODEL.md`) — it is not proposed as a
  cloud-side surveillance service.
- **Risk flagged, not resolved by this RFC:** `ProofRegistry` (D1)
  fingerprinting media and `OutcomeEngine` (D8) classifying settlement
  outcomes both concentrate more inference inside OpenProof/OpenReputation
  than exists today. Neither custodies data the protocol didn't already
  see, but Discussion should confirm this doesn't quietly erode Principle
  8 as these components get built out — flagged here rather than assumed
  fine.

## Specification

Summary of every interface/enum touched (illustrative, not exhaustive —
each module's own RFC-adoption pass would finalize exact TypeScript):

| Module / Component | Change |
|---|---|
| OpenProof | + `ProofRegistry` (internal, D1), + `EvidenceProvider` adapter (D2), + `getEvidenceBundle()` on `OpenProofService` (D6) |
| OpenSettlement | + `PendingBankSettlement` `SettlementStatus` value and transition (D3) |
| OpenSettlement (Dispute) | Dispute escalation order formalized: Policy Engine → OpenAgents → `ArbitrationProvider` (D4); `Dispute.arbiterId`/`ruling` now explicitly sourced from `ArbitrationProvider` |
| Core (Event Bus) | + `Timeline` read-model, per-`intentId` projection (D5) — no new write path |
| OpenAgents | + `SocialEngineeringAgent` behavior (D7) |
| OpenReputation | `recordOutcome()` becomes sole `ReputationScore` input; `rate()` becomes informational-only; + `OutcomeEngine` (internal, D8) |
| OpenIdentity | + `OperationalProfile` / `OperationalProfileGrant` (module growth-path addition, D8) — `Identity` core contract (§1.1) unchanged |
| Policy Engine | + `trustedSettlementAcceleration`-style policies gated on `OperationalProfileGrant` + `ReputationScore` thresholds (D8) |

## Backward Compatibility

`protocolVersion` bump recommended, same as RFC-006. Live-data impact is
narrow: per `ARCHITECTURE.md` §4 (actual code inventory), only
`open-settlement/escrow.service.ts` and `open-liquidity/liquidity.service.ts`
have real running state machines today — OpenProof, OpenReputation,
OpenAgents have no module directory yet, and `open-identity/` is an empty
scaffold. Concretely:

- D3 (`PendingBankSettlement`) is the only change touching code that
  exists today — an additive `SettlementStatus` value and one new
  transition edge in `escrow.service.ts`'s `assertTransition()`. No
  existing `Escrow` rows need migration; they simply never reach the new
  state retroactively.
- D1, D2, D4, D5, D6, D7, D8 are all additions to modules with no
  reference-implementation code yet (OpenProof per RFC-006's own
  Backward Compatibility note; OpenReputation, OpenAgents, OpenIdentity
  per the empty/missing directories above) — no migration path needed
  because nothing exists to migrate.

## Reference Implementation Plan

Sequenced by what has real code to build against today:

1. **D3 (`PendingBankSettlement`)** — smallest, touches live code
   (`escrow.service.ts`), can be implemented and stabilized first,
   independent of everything else in this RFC.
2. **D1/D2/D6 (OpenProof: Proof Registry, `EvidenceProvider`,
   `EvidenceBundle`)** — build together as OpenProof's first real service
   layer (`modules/open-proof/proof.service.ts`, already identified as
   the next file in RFC-006's own plan), now scoped to include these three
   from the start rather than as a later addition.
3. **D5 (Timeline)** — a projection over the existing Event Bus; can be
   built as soon as D1/D2/D6 need it, no new dependency introduced.
4. **D4 (`ArbitrationProvider`, escalation order)** — depends on D6
   (Evidence Bundle) existing first, since the escalation flow consumes it.
5. **D7 (Social Engineering Agent), D8 (Outcome Engine, Operational
   Profile)** — depend on OpenAgents and OpenReputation/OpenIdentity
   getting their first service layers, which per `ROADMAP.md` and
   `ARCHITECTURE.md` §3 are still 📋 Aspirational — these land after 1-4,
   not blocking them.

Per `GOVERNANCE.md` §5, acceptance of this RFC is not a commitment that
Satsails builds all eight sub-decisions at once — each can stabilize in a
Reference Implementation independently before its slice is merged into
`PROTOCOL_SPECIFICATION.md` / `ARCHITECTURE.md` / `DATABASE.md`.
