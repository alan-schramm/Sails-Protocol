# RFC-003: Proof Primitive and submitProof() — Removing the Fiat-Specific Leak

## Summary

Formalizes two related fixes already made during Protocol Freeze: the
`Proof` primitive's `claimType` stays an open string (never a closed
enum), and the SDK's top-level `confirmFiat()` method — which hardcoded
one `claimType` into the universal Intent facade — is replaced with a
generic `submitProof()`.

## Motivation

`confirmFiat(intentId, proof)` was a P2P-trading-specific method sitting
at the top of `SailsClient`, the interface meant to generalize across
every future Intent type. A `SwapIntent` with no fiat leg, or a future
`LoanIntent` needing `collateral_held` proof, had no natural way to use
that method — they would either need their own bespoke top-level methods
(defeating the point of a generic facade) or force their evidence through
a method named for a different use case entirely.

## Alternatives Considered

1. **Add more fiat-specific methods as new Intent types need them**
   (`confirmCollateral()`, `confirmOracle()`, ...). Rejected — this is the
   inverse of Principle 9 (Interface Agnostic): it would grow the Core's
   surface area for every new claim type instead of staying stable.
2. **Generic `submitProof()`, `claimType` as an open string.** **Accepted.**
3. *(Considered and rejected as unnecessary)* making `claimType` a closed
   TypeScript union of known values. Rejected — a closed union would
   require a Core/SDK release for every new claim type a future module
   invents, exactly the coupling this RFC removes.

## Decision

```typescript
// SailsClient facade — generic, per Intent type
submitProof(intentId: string, proof: ProofSubmission): Promise<Proof>
```

**Amendment (v8.7 — CTO review):** the `Proof` primitive itself was
further decomposed into three interfaces, not one — the original single
object conflated what's asserted, what evidence supports it, and who
verified it:

```typescript
interface Claim {
  claimId: string
  claimedBy: string
  claimType: string        // open-ended, unchanged from the original design
  assertion: unknown
  createdAt: Timestamp
}
interface Proof {
  proofId: string
  claimId: string
  evidence: unknown
  submittedAt: Timestamp
}
interface Verification {
  verificationId: string
  proofId: string
  verifiedBy: string
  verdict: 'ACCEPTED' | 'REJECTED'
  verifiedAt: Timestamp
  reason?: string
}
```

This mirrors the separation W3C Verifiable Credentials draw between a
claim, its credential, and its verification — a well-established pattern
for exactly this problem, not a novel invention. `submitProof()` at the
SDK facade level is unchanged in name and signature; internally it now
creates a `Claim` + `Proof` pair, with `Verification` recorded separately
by whoever checks it.

Well-known conventional `claimType` values, documented but never enforced
at the type level: `payment_sent`, `invoice_paid`, `oracle_verified`,
`kyc_verified`, `collateral_held`.

## Primitives Used or Extended

**Proof** (§1.8) — no change to the primitive itself; this RFC corrects
where the primitive's genericity had leaked out through the SDK facade,
not the primitive's own definition, which was already correct.

## Principle Alignment

- **Principle 9 (Interface Agnostic):** direct application, same as
  RFC-001 and the `Negotiation` fix — the Core (and the SDK facade that
  mirrors it) must not encode one module's specific vocabulary.
- **Principle 2 (Intent Driven):** every Intent type can submit proof the
  same way, regardless of what it's proving.

## Specification

See `SDK_GUIDE.md` §2 and `API_REFERENCE.md` §0 for the corrected
interface and the canonical-verb table.

## Backward Compatibility

`confirmFiat()` did not exist in any shipped SDK (SDK is 📋 Aspirational,
`SDK_GUIDE.md` — no implementation exists yet). No migration required;
this is a pre-implementation correction, the cheapest time to make it.

## Reference Implementation Plan

`@sails/sdk` v1.0 (Meses 4-6, `ROADMAP.md`) implements `submitProof()`
directly — `confirmFiat()` is never built.
