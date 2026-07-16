# RFC-008: Verifiable Timestamps and a Hash-Chained Timeline

**Status:** Accepted. Provenance, stated plainly rather than implied:
this RFC did not originate from a CTO directive the way RFC-007 did — it
originated from a design critique raised during RFC-007's own review
(the Nostr-inspired `EvidenceProvider`/`Timeline` pattern is well-suited
to social content but under-specifies non-repudiation and tamper-evidence
for a financial protocol), drafted, then explicitly authorized for
acceptance and merge by the repository owner after a second technical
review pass tightened the hash-chain persistence mechanics (see D2 below).
Recorded this way, rather than borrowing RFC-007's "CTO directive"
framing, so the RFC's own history stays accurate. This RFC amends two
constructs RFC-007 introduced (`EvidenceReference`, decision D2;
`TimelineEntry`, decision D5) — it does not reopen or re-litigate
RFC-007's other seven decisions, which stay as accepted. Merged into
`PROTOCOL_SPECIFICATION.md`, `ARCHITECTURE.md`, `DATABASE.md`, and
`BACKLOG.md` as of this acceptance.

## Summary

RFC-007's `EvidenceProvider` interface was explicitly modeled on Nostr's
pointer-and-hash pattern (protocol never stores media, only a signed
reference). That pattern is a strong fit for a coordination protocol — but
Sails is a *financial* protocol, where evidence backs real money moving in
a dispute, and two gaps that are acceptable for social content are not
acceptable here: (1) `EvidenceReference.timestamp` is self-declared by the
submitting participant's own signature, which proves *assertion*, not
*existence-at-a-time* — nothing stops backdating; (2) RFC-007's `Timeline`
(D5) is a flat, unlinked read-projection over each module's event tables —
structurally identical to a stream of Nostr events, meaning an entry can
be silently inserted, reordered, or deleted by anyone with write access to
the underlying tables, with no way to detect it after the fact. This RFC
proposes closing both gaps: a new `TimestampAnchor` adapter interface for
provable, third-party-anchored timestamps, and hash-chaining
`TimelineEntry` so the Timeline becomes tamper-evident, the same technique
append-only logs (Certificate Transparency, Secure Scuttlebutt) use
without requiring a blockchain or any new consensus mechanism.

## Motivation

Two concrete failure modes, both direct consequences of following the
Nostr model as-is rather than adapting it to a financial context:

1. **Backdatable evidence.** `EvidenceReference.signature` (RFC-007 D2)
   proves the submitting Participant's key signed a claimed `timestamp` —
   it does not prove the evidence existed at that time. A participant
   preparing fraudulent evidence for a dispute can sign any timestamp they
   want; nothing independent checks it. This matters specifically because
   Settlement outcomes and Reputation scores (RFC-007 D8) now hang on
   dispute evidence being trustworthy, not just present.
2. **Rewritable history.** `Timeline.getEvents()` (RFC-007 D5) returns
   rows from each module's own audit tables (`EscrowEvent`,
   `ReputationEvent`, a future `DisputeEvent`) with no cryptographic link
   between them. An operator with database access — or an attacker who
   gains it — can delete or reorder an inconvenient entry (e.g. a
   `PaymentInstructionChanged` event the Social Engineering Agent, RFC-007
   D7, would otherwise have flagged) and no part of the system would
   notice. A Timeline that can be quietly edited after the fact is a weak
   foundation for the Evidence Bundle (RFC-007 D6) that disputes and
   `ArbitrationProvider`s (RFC-007 D4) are built on.

Both gaps exist precisely because Nostr's trust model is calibrated for
public social content, where "who said what, self-timestamped" is
sufficient. A financial protocol coordinating real settlement needs the
stronger guarantee: evidence and history that cannot be forged or edited
without detection.

## Alternatives Considered

**Anchor every `EvidenceReference` on a blockchain, always.** Rejected —
cost and latency make this impractical for high-volume, low-value P2P
trades (`PRINCIPLES.md` principle 6, Infrastructure Neutral, and the
existing precedent that `SettlementProvider` itself is pluggable/tiered
by cost, `MOCK → MULTISIG → LIGHTNING_HODL → LIQUID_COVENANT`). Accepted
alternative: policy-gated, opt-in per application/dispute-value threshold,
the same pattern RFC-007 D8 already established for
`trustedSettlementAcceleration`.

**A single global Merkle tree over all evidence in the system, one root
for everyone.** Rejected — couples unrelated Intents into one growing
structure, is a scalability bottleneck (verification requires a proof
against an ever-growing global root), and leaks structure about total
system activity across participants who have no relationship to each
other, in tension with Principle 8 (Privacy Preserving). Accepted
alternative: a hash chain scoped to one `intentId` at a time — mirrors how
RFC-007 D5 already scoped `Timeline` per-Intent, not globally.

**Trust the `EvidenceProvider`'s own storage metadata (e.g. an S3 object's
upload timestamp) instead of a dedicated anchor.** Rejected — the
`EvidenceProvider` is chosen and configured by the submitting party's own
Reference Implementation (RFC-007 D2: "each Reference Implementation
chooses its own `EvidenceProvider`"), so its metadata sits inside the same
trust boundary as the participant submitting evidence — it doesn't add
independent assurance, it just relocates the same self-reported claim.

**Require `TimestampAnchor` for every `EvidenceReference`, unconditionally.**
Rejected for the same cost/latency reason as blockchain-always above —
made policy-gated instead.

## Decision

### D1 — `TimestampAnchor`: a new Adapter interface

Same category as `SettlementProvider`, `TransportProvider`,
`EvidenceProvider`, and `ArbitrationProvider` — a new Adapter, which is
why this needs an RFC rather than shipping as a silent implementation
detail (`GOVERNANCE.md` §3).

```typescript
interface TimestampAnchor {
  anchorName: string                       // 'opentimestamps' | 'rfc3161' | ...
  anchor(hash: string): Promise<AnchorProof>
  verify(proof: AnchorProof): Promise<{ verified: boolean; notAfter: Timestamp }>
}
interface AnchorProof {
  hash: string             // the sha256 being anchored
  anchorType: 'opentimestamps' | 'rfc3161' | string   // open, like Proof.claimType (§1.8)
  anchorData: unknown       // opaque — an .ots file, a TSA token, etc.
  anchoredAt?: Timestamp    // set once confirmed (e.g. OpenTimestamps' Bitcoin confirmation)
}
```

`EvidenceReference` (RFC-007 D2) gains one optional field — additive, does
not change its existing shape or break anything already specified:

```typescript
interface EvidenceReference {
  proofId: string
  provider: string
  uri: string
  sha256: string
  mimeType: 'image' | 'video' | 'document' | 'ocr' | 'external_reference'
  timestamp: Timestamp      // unchanged — self-declared, cheap, always present
  signature: string         // unchanged
  anchorProof?: AnchorProof  // new (RFC-008 D1) — present only when Policy requires it
}
```

Policy-gated, not mandatory: the Policy Engine decides when an anchor is
required (e.g. dispute value above a threshold, or specific `claimType`s
per `Proof`, §1.8) — the same division of labor RFC-007 D8/D10 already
established between what Core enforces and what Policy configures.
Without a required anchor, evidence behaves exactly as RFC-007 specified;
`TimestampAnchor` raises the assurance level, it doesn't replace the
existing path.

### D2 — Hash-chained `TimelineEntry`

`Timeline` (RFC-007 D5) stays a Core-level, per-`intentId` read
projection — this does not reopen that decision. What changes is that
each `TimelineEntry`, at write time, includes a hash of itself and a
reference to the previous entry's hash for the same `intentId`:

```typescript
interface TimelineEntry {
  eventType: string
  occurredAt: Timestamp
  payload: unknown
  entryHash: string     // sha256(eventType + occurredAt + payload + prevHash)
  prevHash: string       // previous TimelineEntry's entryHash for this intentId; 'genesis' for the first
}
interface Timeline {
  intentId: string
  getEvents(): Promise<TimelineEntry[]>
  verifyChain(): Promise<{ valid: boolean; brokenAtIndex?: number }>
}
```

**A precision that matters for this to actually work:** `entryHash`/
`prevHash` must be computed and persisted at the moment each underlying
event is first written, never derived later at read-time. `Timeline` is a
projection over each module's own audit tables (`EscrowEvent` and
`ReputationEvent` today, per `DATABASE.md`; a future `DisputeEvent`) — if
the hash were computed on the fly whenever `getEvents()` runs, tampering
with an underlying row would simply produce a different, still
internally-consistent hash on the next read, defeating the entire point.
Concretely, this means each of those per-module event tables gains two
columns (`entryHash`, `prevHash`), written once by the same code path
that already writes `EscrowEvent`/`ReputationEvent` today — not a new
table, but not free of schema changes either, which is a slightly
stronger claim than RFC-007 D5's original "no new write path."
`Timeline.getEvents()` reads the already-computed hashes; it does not
compute them, and neither should any other caller.

`verifyChain()` walks the chain and fails at the first broken link,
telling a Dispute UI or `ArbitrationProvider` exactly where tampering (an
inserted, reordered, or deleted entry) occurred, rather than a bare
yes/no. This is a hash chain, not a blockchain — no consensus, no new
network dependency, the same technique Certificate Transparency logs and
Secure Scuttlebutt use for tamper-evident, append-only history.

**Where D1 and D2 connect:** periodically anchoring the Timeline's
*current tip hash* (not every entry) via `TimestampAnchor` — e.g. on
`DisputeOpened` or `SettlementCompleted` — means even an attacker with
full database access cannot rewrite history from before that anchor point
without the rewrite being detectable against the anchored hash. This is
the natural point where D1's external assurance and D2's internal
tamper-evidence reinforce each other; it is not a new mechanism, just
applying D1 to D2's chain tip instead of to a single `EvidenceReference`.

## Primitives Used or Extended

No new primitive. Extends two RFC-007 constructs that were themselves
already ruled non-primitives — `EvidenceReference` (D2 of RFC-007, part
of OpenProof) and `TimelineEntry` (D5 of RFC-007, Core-level read
projection). `TimestampAnchor` is a new Adapter, not a primitive — same
category as the four existing Adapters, evaluated the same way RFC-007
evaluated `EvidenceProvider` and `ArbitrationProvider`: it has no
participant-facing lifecycle of its own, it is infrastructure consulted
by OpenProof and the Event Bus.

## Principle Alignment

- **Principle 6 (Infrastructure Neutral):** `TimestampAnchor` is pluggable
  (`opentimestamps`, `rfc3161`, or an open string for others) — the
  protocol defines the interface, never a specific anchoring service,
  same as every other Adapter.
- **Principle 8 (Privacy Preserving):** the per-`intentId` scoping for
  both the hash chain (D2) and anchoring (D1) — rejecting the global
  Merkle tree alternative above — keeps unrelated participants' activity
  from being linkable through a shared structure.
- **Principle 1 (Protocol First):** policy-gating D1 rather than making it
  mandatory keeps the Core minimal and lets applications decide the
  cost/assurance tradeoff, consistent with how `SettlementProvider`'s tiers
  and RFC-007 D8's Liquidity Provider policies are already structured.
- **Risk flagged, not resolved by this RFC:** `TimestampAnchor` implementations
  that rely on a centralized TSA (RFC 3161) reintroduce a trusted third
  party the OpenTimestamps/Bitcoin-anchored path avoids — Discussion
  should weigh whether the protocol should recommend one anchor type as
  the default for financial disputes specifically, rather than treating
  all `anchorType`s as equivalent.

## Specification

| Component | Change |
|---|---|
| OpenProof (`EvidenceReference`, RFC-007 D2) | + optional `anchorProof?: AnchorProof` field |
| New Adapter | `TimestampAnchor` / `AnchorProof` interfaces |
| Core (`Timeline`/`TimelineEntry`, RFC-007 D5) | `TimelineEntry` gains `entryHash`/`prevHash`; `Timeline` gains `verifyChain()` |
| `EscrowEvent`, `ReputationEvent` (`DATABASE.md`) | + nullable `entryHash`, `prevHash` columns on each — written going forward, `null` on rows that predate this RFC (see Backward Compatibility) |
| Policy Engine | + policy for when `TimestampAnchor` is required (dispute value threshold, `claimType`, or `OperationalProfile`-based, per RFC-007 D8/D10's existing pattern) |

## Backward Compatibility

`protocolVersion` bump recommended, same as RFC-006 and RFC-007.
`TimestampAnchor`/`EvidenceReference.anchorProof` carry the same zero-risk
profile RFC-007 already established for D1/D2/D6 (OpenProof has no
service layer yet — nothing to migrate). D2's chaining is the one
exception worth being precise about: it touches `EscrowEvent`, which
backs `escrow.service.ts` — real, already-written code (`BACKLOG.md`:
"🟢 Most complete module today"), unlike OpenProof or OpenReputation's
service layers. Concretely: `entryHash`/`prevHash` ship as **nullable**
columns, so existing `EscrowEvent` rows are unaffected and remain valid
with `entryHash = null`; `verifyChain()` treats a `null` as "chain starts
here" rather than a break, meaning the tamper-evidence guarantee only
covers entries written after this RFC ships, not retroactively — a
limitation worth stating plainly rather than implying `verifyChain()`
protects history it cannot possibly cover.

## Reference Implementation Plan

Sequenced against RFC-007's own plan, which this RFC depends on rather
than replaces:

1. Build alongside RFC-007 D5 (Timeline) — `entryHash`/`prevHash`
   computation belongs in the same Core Event Bus code that RFC-007 D5
   already scoped as the next piece of work, not a separate pass.
2. Build alongside RFC-007 D1/D2/D6 (OpenProof's first service layer) —
   `TimestampAnchor` sits next to `EvidenceProvider` in the same
   `modules/open-proof/` work RFC-007 already sequenced first.
3. `TimestampAnchor`'s first concrete implementation should be
   `opentimestamps` (Bitcoin-anchored, no trusted third party) rather than
   `rfc3161` (centralized TSA) — consistent with `PRINCIPLES.md` principle
   3 (Self Custody Always) and the risk flagged above; an `rfc3161`
   adapter can be added later by any Reference Implementation without a
   protocol change, the same way any `SettlementProvider` can be added.

As with RFC-007, acceptance is not a commitment that Satsails builds both
D1 and D2 immediately — each can stabilize independently before being
merged into `PROTOCOL_SPECIFICATION.md` / `ARCHITECTURE.md` / `DATABASE.md`.
