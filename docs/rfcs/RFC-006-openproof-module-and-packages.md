# RFC-006: OpenProof as the 8th Module, and Package as the Word for Module Groupings

## Summary

Two related decisions, made together because the second depends on the
first being unambiguous first: (1) `Proof` — previously a primitive with
no owning module (`PROTOCOL_SPECIFICATION.md` §1.8: "no single module
owns this primitive") — gets a module: **Sails OpenProof**, the 8th
official module. (2) A new word, **Package**, is introduced for a
composition of several modules delivering one business-facing capability
(e.g., "OpenP2P Package" = OpenP2P + OpenSettlement + OpenIdentity +
OpenReputation + OpenProof + OpenAgents) — deliberately *not* reusing the
word `Capability`, which RFC-005 already defined with a different,
narrower meaning (one module's own functional category).

## Motivation

Two gaps surfaced in the same conversation, both real:

1. Every other primitive with real usage volume (Identity, Settlement,
   Reputation, Negotiation) has a module that owns and standardizes it.
   `Proof` was the one exception — genuinely useful (`Claim`/`Proof`/
   `Verification`, RFC-003) but with no module responsible for its
   creation, verification workflow, or cross-module consistency. As
   OpenSettlement's dispute flow, OpenReputation's evidence-of-history,
   and any future OpenFinance credit-underwriting flow all lean on Proof
   more heavily, leaving it un-owned was going to become a real gap, not
   a theoretical one.
2. A second proposal — grouping several modules into a business-facing
   bundle a developer enables in one call (e.g. `sdk.enable(P2P_PACKAGE)`)
   — used the word "Capability" for this grouping. That collides directly
   with RFC-005's `Capability` (`capabilityName`, one module implements
   one Capability, 1:1). A developer reading both RFCs would find the same
   word meaning two different cardinalities (1:1 in RFC-005, 1:many here)
   with nothing to disambiguate them.

## Alternatives Considered

**For OpenProof:**
1. **Leave Proof un-owned, split its logic across whichever module calls
   it.** Rejected — this is exactly the drift that was starting to happen
   (dispute resolution, reputation evidence, and future credit checks each
   quietly building their own proof-handling instead of sharing one).
2. **Fold Proof into OpenSettlement** (since Settlement is Proof's biggest
   consumer today via Dispute). Rejected — Proof is consumed by
   Reputation and Negotiation too (payment-proof exchange), not just
   Settlement; folding it into one consumer module would recreate the
   same "who owns this" ambiguity from the consuming side instead of the
   defining side.
3. **A dedicated `Sails OpenProof` module, cross-cutting infrastructure
   status.** **Accepted.**

**For Package vs. Capability:**
1. **Reuse `Capability` for module groupings too, let context disambiguate.**
   Rejected outright — this is the exact mistake RFC-005 was written to
   fix (the word "Capability" already meant two different things before
   RFC-005 gave it one precise meaning). Reintroducing ambiguity one RFC
   later would undo that work.
2. **A new, distinct word: `Package`.** **Accepted.**

## Decision

### OpenProof (8th module)

```typescript
// OpenProof implements the Proof primitive (PROTOCOL_SPECIFICATION.md §1.8)
// — Claim, Proof, Verification are unchanged; they now have an owning module.
interface OpenProofService {
  assertClaim(claim: Omit<Claim, 'id' | 'createdAt'>): Promise<Claim>
  submitProof(claimId: string, evidence: unknown): Promise<Proof>
  verify(proofId: string, verifiedBy: string, verdict: 'ACCEPTED' | 'REJECTED', reason?: string): Promise<Verification>
}
```

`OpenProof`'s Capability (RFC-005) is `proof-verification` — added as the
8th row to the module-to-Capability mapping table (`RFC-005`'s Decision
section), extending it, not revising the seven that already exist.

### Package (new term, distinct from Capability)

```typescript
interface Package {
  packageName: string          // e.g. 'p2p', 'open-finance', 'marketplace'
  version: string
  modules: string[]            // moduleIds this package composes
}

// Example — the P2P Package this whole project has actually been proving
// since Satsails Wallet shipped:
const P2P_PACKAGE: Package = {
  packageName: 'p2p',
  version: '1.0',
  modules: ['openp2p', 'opensettlement', 'openidentity', 'openreputation', 'openproof', 'openagents'],
}
```

`Package` is many-to-many over `Module` (a module can appear in more than
one Package — `OpenIdentity` will show up in nearly all of them). `Capability`
(RFC-005) stays one-to-one with a single module. The SDK resolves a
requested `Package` into its constituent modules and their `Capability`
grants automatically — the developer calls `sdk.enable('p2p')` once,
never resolves the six modules underneath it by hand.

### Terminology clarification (no architectural change, precision only)

| Term | Means |
|---|---|
| **Core** | The 6 formal components (`ARCHITECTURE.md` §1B: Intent Engine, Coordination Engine, Event Bus, State Machine, Capability Registry, Policy Engine) that host and enforce the 9 primitives (`PROTOCOL_SPECIFICATION.md` §1). Saying "Core holds the fundamental primitives" is shorthand for this — it does not replace or remove the 6-component definition already frozen. |
| **Module** | An independent, pluggable component of the protocol — now 8, not 7. |
| **Package** | A named composition of several Modules delivering one business-facing capability — new in this RFC. |
| **SDK** | The developer-facing surface (`SDK_GUIDE.md`'s six verbs) that resolves Package → Modules → Capability grants automatically, per RFC-005's `CapabilityGrant`. |

## Primitives Used or Extended

No new primitive. `Proof` (§1.8) is unchanged in shape — only its
"Implemented by" line changes, from "no single module" to "Sails
OpenProof." `Package` and the Core/Module/Package/SDK glossary are new
Core-adjacent vocabulary, not primitives — they don't pass the primitive
test (`PROTOCOL_SPECIFICATION.md` §1.10-1.11's irreducible/orthogonal/
own-lifecycle/cross-cutting bar), the same reasoning that kept Capability
and Policy as Core components rather than primitives.

## Principle Alignment

- **Principle 5 (Capability Based):** `Package` is a direct extension of
  this principle's spirit — applications declare what they need
  (`p2p`, `earn`, `treasury`) without hand-resolving dependencies, the
  same way `CapabilityGrant` lets a Participant declare what it's allowed
  to do without the Core assuming business logic.
- **Principle 1 (Protocol First):** disambiguating Package from Capability
  now, one RFC after the collision risk first appeared, is exactly the
  discipline this principle exists to enforce — fixing terminology drift
  before it compounds, not after three more RFCs reuse the same word
  differently again.

## Specification

- `PROTOCOL_SPECIFICATION.md` §1.8: "Implemented by" line updated to name
  Sails OpenProof.
- `ARCHITECTURE.md` §3: module count 7 → 8, OpenProof added to the table.
- `rfcs/RFC-005-capability-model.md`: Decision section's mapping table
  gains an 8th row (`proof-verification` → OpenProof), and a note pointing
  to this RFC for the Package/Capability distinction.
- `DATABASE.md`: `Claim`, `Proof`, `EvidenceVerification` tables' `moduleId`
  default changes from unset/generic to `"openproof"`.
- `BACKLOG.md`: OpenProof added as a new P0/P1-adjacent row — it already
  has real types (`common/types` work from the dev-handoff code pass) but
  no service layer yet.

## Backward Compatibility

`protocolVersion` bump recommended. No live data migration — no
`Claim`/`Proof`/`EvidenceVerification` rows exist in any running system
yet (per `TODO.md`, this is all pre-Implementation-Freeze work).

## Reference Implementation Plan

`modules/open-proof/proof.service.ts` is the next real code file, built
directly on the `Claim`/`Proof`/`EvidenceVerification` Prisma models
already added to `DATABASE.md` and the `common/types` interfaces already
written during the dev-handoff code pass — this RFC gives that existing
code an owning module, it does not require rewriting it.
