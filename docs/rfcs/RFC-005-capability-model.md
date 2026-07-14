# RFC-005: Capability Model — Formal Definition, and Untangling Two Meanings That Were Never Actually Different Interfaces

## Summary

Formalizes what a **Capability** is: a functional category — with its own
events, states, required permissions, and API surface — that a module
*implements*, the same way a `SettlementAdapter` implements
`SettlementProvider`. Separately, formalizes what was informally called
"capability" in the permission sense (what an Identity/Agent is allowed to
do) as **`CapabilityGrant`** — a related but genuinely distinct concept
that was never given its own interface before this RFC.

## Motivation

"Capability" was used in two different senses across the project, neither
of which had ever been given a concrete interface:

1. `ARCHITECTURE.md`'s ecosystem diagram: *"Capabilities (the 7 modules:
   OpenP2P · OpenSettlement · OpenLiquidity · ...)"* — capability as a
   synonym for module.
2. `PROTOCOL_SPECIFICATION.md` §1.10 and `PRINCIPLES.md` Principle 5:
   *"what an Identity/Agent/Application is allowed to do"* — capability as
   a permission grant.

Both readings are legitimate ideas. Neither had ever been written as an
actual interface — both existed only as prose. Left unresolved, a future
contributor implementing "the Capability Registry" would have had to
guess which of the two concepts it manages, or — worse — build something
that quietly conflates them. This RFC exists specifically to prevent that,
per the same discipline that resolved the "Coordination Layer" naming
collision during Architecture Freeze.

## Alternatives Considered

1. **Keep "Capability" meaning only the permission grant; rename the
   module-category usage to something else (e.g., just "Module,"
   dropping the word "Capability" from the ecosystem diagram).** Rejected
   — this would lose a genuinely valuable framing: modules exist because
   they represent functional categories, not because someone decided to
   add a feature (this was the CTO review's own A-022 finding). Dropping
   the word loses that insight rather than formalizing it.
2. **Merge both meanings into one interface.** Rejected outright — a
   permission grant ("Agent X can call `settlement.release` up to
   0.01 BTC") and a functional category ("Settlement is the category of
   things that lock/release value") are not the same shape and forcing
   them together would produce an interface with fields that don't apply
   to half its use cases.
3. **Two related, clearly named interfaces: `Capability` (the abstract
   category) and `CapabilityGrant` (the permission to use one).**
   **Accepted.**

## Decision

```typescript
// The abstract functional category — what ARCHITECTURE.md's ecosystem
// diagram meant by "the 7 modules represent capabilities."
interface Capability {
  capabilityName: string          // e.g. 'trade-coordination', 'settlement',
                                   // 'liquidity-discovery', 'identity-verification',
                                   // 'reputation-scoring', 'agent-delegation',
                                   // 'financial-instruments'
  version: string                 // versioned independently of protocolVersion —
                                   // a capability's shape can evolve without
                                   // every module needing a lockstep release
  events: string[]                // the {module}.{entity}.{action} namespace
                                   // this capability owns
  states: string[]                // valid lifecycle states an implementation
                                   // of this capability moves through
  requiredGrants: string[]        // which CapabilityGrant scopes are needed
                                   // to invoke this capability
  api: string[]                   // canonical Intent verbs or API surface
                                   // this capability exposes
}

// A module is a concrete implementation of a Capability — today, exactly
// one implementation per capability exists; nothing prevents a second
// vendor from implementing the same capability differently tomorrow,
// same discipline as SettlementAdapter having multiple chain implementations.
interface CapabilityImplementation {
  capabilityName: string
  moduleId: string                // e.g. 'openp2p'
}

// The permission grant — previously described only in prose, now a real
// interface. Renamed from the bare "Capability" it used to informally
// share a name with.
interface CapabilityGrant {
  grantId: string
  grantedTo: string                // a Participant or Agent (RFC-001)
  capabilityName: string           // which Capability this grants access to
  scope: string[]                  // e.g. a subset of that capability's events/API
  constraints?: Record<string, unknown>   // e.g. maxValue, expiresAt
  issuedBy: string
}
```

**Mapping today's 7 modules to Capabilities (illustrative, not exhaustive
— exact `capabilityName` strings are a Reference Implementation detail,
not fixed by this RFC):**

| Module | Capability it implements |
|---|---|
| Sails OpenP2P | `trade-coordination` |
| Sails OpenSettlement | `settlement` |
| Sails OpenLiquidity | `liquidity-discovery` |
| Sails OpenIdentity | `identity-verification` |
| Sails OpenReputation | `reputation-scoring` |
| Sails OpenAgents | `agent-delegation` |
| Sails OpenFinance | `financial-instruments` |
| Sails OpenProof | `proof-verification` — added by `rfcs/RFC-006-openproof-module-and-packages.md`, extending this table from 7 to 8 rows |

**Note (RFC-006):** `Capability` here stays strictly 1:1 with a single
module, as originally decided. A later RFC introduced a *different* word,
`Package`, for many-to-one groupings of several modules into one
business-facing bundle — deliberately not reusing `Capability` for that,
to avoid recreating the exact ambiguity this RFC exists to resolve.

**Relationship to `GOVERNANCE.md`'s Module Registry:** the two are
complementary, not redundant. The Module Registry (`GOVERNANCE.md` §4)
arbitrates unique `moduleId` naming — a naming authority. The Capability
Registry (`ARCHITECTURE.md` §1B, a Core component) tracks which
`Capability` each `moduleId` implements, and manages `CapabilityGrant`
issuance/revocation. A module must have a registered name (Module
Registry) *and* declare which Capability it implements (Capability
Registry) — two different questions, two different registries, on
purpose.

## Primitives Used or Extended

No new primitive — consistent with `PROTOCOL_SPECIFICATION.md` §1.10's
existing ruling that Capability (and Policy) are Core components, not
primitives, because neither has a participant-facing lifecycle of its
own. This RFC does not revisit that ruling; it gives the already-decided
Core component an actual interface for the first time, split cleanly in
two.

## Principle Alignment

- **Principle 5 (Capability Based):** this RFC *is* the formal
  specification `PRINCIPLES.md` Principle 5 has been referencing by
  prose description since it was written. "Applications and agents
  declare and are granted specific capabilities" now has a concrete
  `CapabilityGrant` shape instead of remaining an unspecified promise.
- **Principle 9 (Interface Agnostic):** the `Capability` interface's
  `api: string[]` field is deliberately a list of canonical verbs, not a
  transport-specific or UI-specific shape — same discipline as
  `NegotiationEvent` (RFC-004).

## Specification

Add both interfaces to `PROTOCOL_SPECIFICATION.md` §1.10, replacing the
current prose-only description. Update `ARCHITECTURE.md`'s Capability
Registry description (§1B) to reference `CapabilityGrant` by name instead
of the previously undifferentiated "Capability."

## Backward Compatibility

`protocolVersion` bump recommended — this is the first time either
interface is given a concrete shape, so any Reference Implementation code
written against the prose description alone (none currently exists; the
Capability Registry is a `TODO.md`-listed stub with no real logic yet)
would need to conform to this shape going forward. No live data migration
is required.

## Reference Implementation Plan

The `capability-registry.ts` stub already scaffolded in
`sails-protocol/src/core/` (per the physical `core/` folder created during
Architecture Freeze) implements both `Capability`/`CapabilityImplementation`
tracking and `CapabilityGrant` issuance — as one registry managing two
related tables, not two separate services. Implementation scheduled for
Implementation Freeze, per `TODO.md`.

## Stability Guidance (v8.7 — CTO review addendum)

`Capability` must stay a definition of stable, deliberately abstract as
possible while still being useful — never a specific feature. The test
before adding a new one: does this represent a genuinely new functional
category (a new event namespace, a new state machine, a new required
grant), or is it a new event/API within a `Capability` that already
exists? A new payment rail within `settlement`, or a new ranking factor
within `liquidity-discovery`, is a feature — it extends an existing
`Capability`'s `events`/`api` arrays, no new `capabilityName` and no RFC
required. A genuinely new functional category — the way `agent-delegation`
was new relative to the original five — requires a numbered RFC per
`GOVERNANCE.md` §5. This bar exists specifically so `Capability` doesn't
quietly become a synonym for "any feature," which would defeat the
disambiguation this RFC exists to establish.

