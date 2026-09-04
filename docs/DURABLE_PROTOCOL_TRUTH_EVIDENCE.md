# DURABLE_PROTOCOL_TRUTH_EVIDENCE.md

### Durable Protocol Truth Mission — Evidence Record

> Follows this repository's own evidence-artifact convention. This is
> evidence, not a marketing document — `OUTPUT != EVIDENCE != PROPERTY
> != CLAIM`.

## 1. Mission Scope

Investigation-only. No Core/Kernel/Constitution/schema/settlement/SDK
change authority. Builds on, and does not reopen, F03's own residual
("Durable Protocol Truth / operator-independent fact availability") and
Recovery/Reconciliation Conformance (frozen, PR #61, `aec3a16`).

## 2. Baseline

Commit at mission start: `aec3a16c57926988016cda32128868602e9f5779`
(`main`, clean working tree).

## 3. Source Hierarchy

```
NORMATIVE / SEMANTIC AUTHORITY
  docs/PROTOCOL_INVARIANTS.md (INV-05, INV-OP-8, INV-OP-10, INV-OP-11)
  docs/SEMANTIC_KERNEL.md section 14 (Recovery Classification — extended here)

ARCHITECTURAL
  docs/CORE_ARCHITECTURE.md section 40 (Recovery Boundary)
  docs/DESTINATION_AUTHORITY_ARCHITECTURE.md
  packages/sails-core/src/outcome.ts (Outcome / DestinationBinding types)

FOUNDATIONS (Project-card record — see section 4)
  F02 (FOUNDATIONS-02 Conformance Depth Gaps card)
  F03 (Protocol Independence & Decentralization Program card, RESIDUAL 1)
  F04 (Engineering Philosophy Program card)

EVIDENTIARY
  RFC-008 (Verifiable Timestamps and a Hash-Chained Timeline)
  docs/CONDITION_ALGEBRA_CONFORMANCE_EVIDENCE.md
  docs/PROVIDER_SUBSTITUTION_INVARIANCE_EVIDENCE.md
  docs/RECOVERY_RECONCILIATION_CONFORMANCE_EVIDENCE.md

IMPLEMENTATION
  src/modules/open-settlement/arbitration-authority.ts
  src/modules/open-settlement/economic-outcome.ts
  src/modules/open-settlement/dispute-outcome.ts
  src/modules/open-settlement/escrow-lifecycle.ts (EscrowEvent chain)
  src/common/events/event-store.ts (DurableEventRecord chain)
  src/modules/open-proof/timestamp-anchor.ts, proof.service.ts
  prisma/schema.prisma
```

## 4. Sources Inspected and a Real Sourcing Gap

Full text of F02, F03, and F04's conclusions recovered verbatim from
their GitHub Project cards ("FOUNDATIONS-02 Conformance Depth Gaps",
"Protocol Independence & Decentralization Program", "Engineering
Philosophy Program" respectively — none of the four Foundations
missions has a standalone `docs/` file). **F01 ("Fundamental Protocol
Object") could not be located anywhere** — not in any of the 30 current
Project cards, not in git history (`git log --oneline --all | grep -iE
"F01|FOUNDATIONS"` returns zero genuine hits — the three superficial
regex matches found are confirmed false positives: one matches the
English word "foundations" in an unrelated commit subject, two match
substrings of unrelated commit *hashes*), not in any repository file.
Reported as a real, disclosed sourcing gap, not a material contradiction
between authorities (nothing found contradicts anything else — F01
simply cannot be located to check). This does not block this mission:
none of F01's plausible territory ("Fundamental Protocol Object") is
load-bearing for the specific question this mission investigates, and
`docs/CORE_ARCHITECTURE.md`/`SEMANTIC_KERNEL.md` independently cover
Core object identity.

**One real, disclosed discrepancy found (not a normative contradiction —
a stale-bookkeeping vs. code-reality mismatch):** the Project card
"OpenProof — Registry, Evidence Provider & Timestamp Anchor" states
verbatim that RFC-008's `TimestampAnchor`/`AnchorProof` are "genuinely
not started." Direct inspection of `src/modules/open-proof/timestamp-anchor.ts`
and RFC-008's own text shows `anchor()` is real, working code —
"submission... verified against a live public OpenTimestamps calendar
server before writing this file," live-wired into `proof.service.ts`'s
`anchorEvidence()`. Reported as fact; not resolved here (no Project
write authority).

## 5. Refined Definition of "Protocol Truth"

CTO candidate, attacked: *"Protocol Truth is the minimum set of
protocol-relevant facts and bindings whose preservation and admissible
interpretation are necessary for independent parties to verify the
economic meaning of an interaction and, where protocol semantics permit,
continue, recover, exit, or audit it without privileged access to the
original operator."*

**Attack found one real ambiguity, corrected:** the candidate definition
conflates "necessary for verification" with "necessary for
continuation" as if they always require the same fact set. This
investigation's own findings (section 9) show they do not — some facts
are sufficient for historical verification but not for continuation
(e.g. an unanchored hash chain proves internal consistency, not
existence-since; a signed Authority decision proves what was decided,
not that DestinationBinding is bound to it). **Refined definition,
retained:**

*Protocol Truth is the minimum set of protocol-relevant facts and
bindings whose preservation and admissible interpretation — separately
for verification, and separately for continuation where protocol
semantics permit it — do not depend on privileged, continued access to
the original operator.*

This is not a cosmetic change: it forces every fact class (section 6)
to be scored against verification and continuation as distinct
questions (section 8's C column vs. V column), rather than one merged
"is it Protocol Truth, yes/no."

## 6. Fact != Truth != Evidence != Claim; Durable != Available != Portable != Verifiable

Preserved throughout this document (attacked, not assumed): a
PostgreSQL row can be durable (survives process restart) without being
operator-independent (only Satsails can read it). A signed object
(`AuthorityDecisionPayload`) can be portable (the SDK ships the exact
canonicalization) without being available (nothing forces it off the
operator's server before disappearance). A hash can commit to a fact
without the underlying data still existing to check against it (section
9's genesis finding). A verified historical fact (a signature checks
out) may still be insufficient to continue an interaction (section 11's
mid-interaction analysis).

## 7. Fact Taxonomy (T1-T12)

| Class | Definition | Repository status |
|---|---|---|
| T1 — Interaction Identity/Scope | `InteractionId`/`escrowId`/`disputeId`/`appealRound` | Opaque scope, durable in Postgres; portable via API responses (section 10) |
| T2 — Ruleset/Semantic Identity | `rulesetIdentity`/`evaluatorIdentity`/`profileIdentity` | Durable (`SemanticTransitionRecord` columns), portable — returned verbatim by `GET /v1/settlement/disputes/:id/semantic-record` |
| T3 — Assertions/Evidence | `EvidenceReference` (RFC-007/008), `EvidenceBundle` | Durable; `sha256` individually anchorable via real `TimestampAnchor.anchor()` (policy-gated, not universal) |
| T4 — Authority Facts | `AuthorityDecisionPayload` (`disputeId, escrowId, appealRound, authorityId, outcome, buyerBps, issuedAt`) + Ed25519 signature | **Cryptographically real** — signed, domain-separated, canonicalization shipped in both server and SDK, cross-checked by `tests/arbitrationAuthoritySdkParity.test.ts` |
| T5 — Outcome | `ArbitrationOutcomeContent` (ruling, allocations, remainderBeneficiary) | Durable (`SemanticTransitionRecord.outcomeContent Json?`), **but `hashOutcomeContent()` is never called anywhere in the codebase** — see section 9 |
| T6 — DestinationBinding | Resolved beneficiary destination(s) | Durable (`outcomeDestinationBinding Json?`), **never hashed or signed anywhere** — see section 9 |
| T7 — Execution Facts | Provider, rail, txid, attempt, amount, asset, destination reported | Durable (`Escrow`/`EscrowPendingTransaction` columns); MULTISIG's own txid is self-derived, not provider-trusted (Recovery evidence) |
| T8 — Correspondence Facts | `CorrespondenceEvaluation` (evaluator+policy identity, results) | Durable, append-only, fail-closed on disagreement (Recovery evidence §13); **no route/SDK surface found exposing it directly** |
| T9 — Recovery/Reconciliation Facts | Historical destination/allocation snapshot, pending-tx signatures | Durable, MULTISIG-scoped (Recovery evidence) |
| T10 — External Reality References | Chain state, confirmation depth, reorg state | Deliberately **not** made durable-as-current — only durable-as-historical-observation (section 12) |
| T11 — Historical Evolution | `EscrowEvent` chain, `DurableEventRecord`/Timeline chain | Both real, hash-chained, append-only — **both anchored at a hardcoded, non-externally-verified `'genesis'` sentinel** — see section 9 |
| T12 — Privacy/Disclosure Metadata | Party-only vs. public read scoping | Real and enforced (`INV-OP-10`, section 13) — not invented here |

## 8. Minimum Sufficient Truth — Challenge Per Class

Applying "if this fact disappears permanently, what becomes impossible"
to each T-class: T1-T2 loss → historical verification and future
reconstruction both fail (nothing to interpret). T3 loss → dispute
audit fails for that specific claim, not global. T4 loss → attribution
fails entirely — no other fact substitutes for a lost signature. T5/T6
loss → economic meaning becomes ambiguous even though (per section 9)
they are *already* only weakly protected. T7 loss → execution-fact
disputes become unresolvable, but T4/T5/T6 alone remain enough to state
what *should* have happened. T8 loss → correspondence verification
fails for that evaluation only (a new one can be recomputed from T5/T6/T7
if those survive). T9 loss → recovery for that specific crash window
fails; already scoped to MULTISIG. T10 is deliberately never retained
as current fact — no loss because none is claimed. T11 loss → tamper-
evidence for the transition *sequence* is lost, not the economic facts
themselves (which live in T5-T7, separately). T12 loss (i.e., scoping
removed) → privacy fails, not survivability.

**No fact class was found where the honest answer is "nothing
protocol-relevant" — every class earns its place. No class was added
purely for completeness.**

## 9. D/A/P/V/R/C Matrix

D=Durable, A=Available, P=Portable, V=Verifiable, R=Reconstructable,
C=Continuation-capable. No scores are averaged; a single missing
critical dimension is reported as decisive.

| Class | D | A | P | V | R | C |
|---|---|---|---|---|---|---|
| T4 Authority Facts | Yes | Party-scoped (2 routes combined) | Yes — SDK ships canonicalization | **Yes**, independently, via Ed25519 math | Yes | Yes (feeds T9) |
| T5 Outcome content | Yes | Party-scoped | Yes (returned as plain fields) | **No** — `hashOutcomeContent()` exists, tested, never called; not bound to T4's signature | Partial — deterministically re-derivable from T4's signed `buyerBps` + the escrow's `totalUnits`/`asset`, IF those are trusted | Yes, informationally |
| T6 DestinationBinding | Yes | Party-scoped | Yes (returned as plain fields) | **No** — never hashed, never signed, exists only as a plain JSON column populated from a live `PayoutAddress` lookup at commit time | **No** — not derivable from any signed or durable fact; it is *the* one fact that is purely a database claim | No independent proof possible |
| T11 EscrowEvent chain | Yes | Internal only — **no route/SDK exposes it** | No | Internally self-consistent (`verifyEscrowEventChain()`), but genesis is a hardcoded, non-anchored `'genesis'` string | Partial — sequence yes, economic content no (chain excludes amounts/destination) | N/A |
| T11 DurableEventRecord chain | Yes | Yes — full `timeline` array returned by the proof-bundle route | Yes | Same as above, genesis unanchored; full payload IS committed (stronger than EscrowEvent's chain) | Yes for sequence+payload | N/A |
| T3 Evidence (`EvidenceReference.sha256`) | Yes | Depends on `EvidenceProvider` | Depends on provider | **Yes, when policy-gated `TimestampAnchor` used** — real external Bitcoin-anchored submission | Yes | N/A |
| T7 Execution facts (MULTISIG) | Yes | Party-scoped + public chain | Yes | Yes — self-derived txid, chain-observable | Yes | Yes (Recovery evidence) |

**The single most decisive finding in this matrix: T6 (DestinationBinding)
fails Verifiable and Reconstructable outright, for the one rail
(MULTISIG) that otherwise has the strongest chain of custody in the
whole system.** Section 15 develops this in full.

## 10. Actor Availability Analysis

- **Buyer/seller**: hold their own MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM
  keys (client-submitted `EscrowParticipantKey`); can read T1/T2/T3/T4/T5/T6/T8
  (as returned) via party-scoped routes while Satsails operates; hold
  nothing durably outside Satsails' database once it disappears, absent
  their own copy — no export mechanism exists (section 14).
- **Arbiter**: signs T4 with an Ed25519 key registered as `User.publicKey`
  — a **plain, Satsails-controlled database column**, not something the
  arbiter independently publishes or anchors elsewhere.
- **Independent wallet / independent Sails implementation**: can verify
  T4 given the payload + signature + claimed public key (the math is
  real and portable), but cannot independently confirm that public key
  was genuinely the arbiter's key *at decision time*, absent an
  out-of-band channel Satsails does not provide.
- **Auditor/verifier, external observer**: no public (non-party) route
  exposes any of T1-T9 today — every read surface found is party-scoped
  (`isParty`) or narrower.
- **Recovery process**: already fully analyzed (Recovery evidence);
  unaffected by this mission.

## 11. Disappearance Worlds

| World | What breaks |
|---|---|
| A — App disappears, backend remains | Nothing new — same as ordinary downtime |
| B — Backend disappears, participants keep wallets/local artifacts | Any fact never proactively exported (all of them — section 14) becomes unavailable; local wallet key material alone proves nothing about *why* a settlement was authorized |
| C — Database disappears, external rails remain | T7 (on-chain facts) reconstructable from the chain itself; T4/T5/T6 (authority/outcome/destination) **gone** unless a party independently retained their own API response from while the system was live |
| D — Organization disappears, repo/participants remain | Semantic/ruleset identity (T2) and the algorithms (`allocateExactUnits`, canonicalization functions) are open-source and reconstructable without permission; the *specific historical facts* (T4-T6) are not, per world C |
| E — Maintainers disappear, repo frozen | A stranger can read the code/RFCs/conformance vectors and reconstruct *protocol meaning* (section 15); cannot reconstruct *what actually happened* in any specific historical interaction without a durable, exported copy |
| F — Reference implementation disappears | Specifications (Semantic Kernel, Core Architecture, conformance vectors) survive independently in `docs/`/`conformance/` — real, already demonstrated by the Condition Algebra mission's own non-circular-derivation discipline |
| G — One participant disappears | The counterparty and external rails retain T7; T4-T6 remain wherever they already were (party-scoped, so the *surviving* party can still read them) |
| H — Arbiter disappears after decision | T4 (signed decision) already survives independently of the arbiter's continued availability — this is exactly what the signature is for, and it works |
| I — Operator becomes hostile | See section 16 (Hostile Operator/Equivocation Test) — this is a stronger threat than mere disappearance and is analyzed separately |

## 12. Mid-Interaction Survival

Applying CONTINUE/RECOVER/EXIT/FAIL SAFELY/FAIL UNSAFELY/UNKNOWN per
stage, for MULTISIG (the only rail with any of this machinery):

| Stage | Outcome if operator disappears here |
|---|---|
| Before authority decision | FAIL SAFELY — nothing was ever authorized; no loss |
| After signed decision, before Outcome commit | UNKNOWN — the signature is portable (if the party captured it) but the durable commit never happened; whether this is recoverable depends entirely on whether the signed bytes survived off-server |
| After Outcome commit, before dispatch | RECOVER — this is exactly what Recovery Conformance's C4 demonstrates, **while the operator is present**; if the operator is the one that disappeared, RECOVER becomes UNKNOWN because the durable record it reads from is itself gone (world C) |
| After dispatch, before execution | Same as above |
| After execution, before observation | FAIL SAFELY toward the chain's own truth — T7 is independently observable on-chain regardless of Satsails |
| After correspondence | Already-computed T8 is lost if the operator disappears (not exported); recomputable by a party who independently retains T4/T5/T6/T7 |
| During reconciliation | Depends entirely on the operator being present — Recovery Conformance's own machinery is itself operator-hosted |
| After historical completion | EXIT is the honest label — nothing more is expected to happen; whether the *history* of what happened remains provable depends on section 9's D/A/P/V/R/C findings, not on this stage |

**Not every state is currently representable as its own distinct
recoverable case — this is reported honestly, not claimed solved.**

## 13. Stranger Reconstruction Test

A technically competent third party given only the artifacts *intended*
to survive the operator (i.e., what is actually documented as public:
`docs/CORE_ARCHITECTURE.md`, `SEMANTIC_KERNEL.md`, conformance vectors,
the open-source SDK code) can determine: the semantic/ruleset identity
model (T2) in the abstract; how canonicalization/hashing/signing work
(T4); the deterministic Outcome-allocation algorithm (T5). They
**cannot** determine, for any *specific* historical interaction, without
an exported copy of that interaction's own API responses: which
interaction it was, what evidence existed, what was actually decided,
what Outcome/destination followed, or whether execution corresponded —
because none of that is published anywhere outside Satsails' database,
and no export mechanism exists (section 14). This is a **missing
portability** failure, not a legitimate privacy boundary — nothing in
`INV-OP-10` (section 17) requires this data to be undiscoverable by the
*parties themselves*; it simply isn't proactively made available to
survive the operator.

## 14. Portability Test

`READABLE != EXPORTABLE != PORTABLE != SELF-VERIFYING`, tested directly:

- T4 is **self-verifying** (Ed25519 math, portable canonicalization) —
  the strongest category.
- T2/T5/T6/T8 are **readable** (while the operator is live, party-scoped)
  but **not proactively exportable** — no export/backup/GDPR-style route
  exists anywhere in this repository (confirmed by exhaustive grep, zero
  hits, corroborating F03's own RESIDUAL 1 finding verbatim).
- T11 (Timeline/DurableEventRecord chain) is **readable and portable**
  via `GET /v1/proof/trades/:tradeId/bundle`, but the SDK's own
  `TradeEvidenceBundle` type omits fields (`timelineDurable`,
  `timelineStore`) the server actually returns — a real, minor
  server/SDK field-list drift, disclosed here.
- Nothing is **self-verifying** for T6, because nothing hashes or signs
  it (section 9).

## 15. Second Implementation Test

An independent implementation consuming only the intended durable
artifacts (SDK responses, RFC text, conformance vectors) could: verify
T4 signatures without asking Satsails anything ("Ask Satsails what this
field means" never applies to T4 — the canonicalization is fully
specified and cross-tested). It **could not** independently confirm
that a returned T5/T6 pair was ever actually authorized by the T4
signature it also received, because nothing links them cryptographically
— the second implementation would have to trust Satsails' own database
association, exactly the failure mode this mission exists to test for.

## 16. Recovery Intersection

Recovery Conformance's own claim (frozen, PR #61) is: *recovery
reconstructs execution from durable and admissible external facts
without re-authorizing selected economic meaning.* This mission's
finding does not weaken that claim — Recovery Conformance was evaluated
**while the operator is present** (its own real-Postgres evidence
requires a live database), and correctly never claimed otherwise. What
this mission adds: the durable facts Recovery depends on (T4, T5, T6 in
particular) are themselves operator-dependent per section 9 — so
Recovery Conformance's "durable" is `REAL POSTGRES DURABILITY`, which
this mission explicitly does **not** treat as equivalent to `OPERATOR-
INDEPENDENT PROTOCOL DURABILITY`. Recovery Conformance is not reopened,
not redesigned, and its own evidence stands unmodified.

## 17. Correspondence Intersection

T8 (`CorrespondenceEvaluation`) survival depends entirely on T5/T6/T7
surviving (it is a recomputation over them) plus its own row, which is
durable-but-operator-dependent, no different from T5/T6. No new gap is
introduced beyond what section 9 already states; not absorbed further,
not implemented.

## 18. Authority -> Outcome -> Destination Chain Analysis

**This is the mission's central, most load-bearing finding.**

```
AuthorityDecisionPayload (T4)          -- SIGNED (Ed25519, domain-separated, canonical)
        |
        | (same-Postgres-transaction convention only -- NOT a cryptographic link)
        v
ArbitrationOutcomeContent (T5)         -- hashOutcomeContent() exists, tested, NEVER CALLED
        |
        | (plain JSON column, populated from a live PayoutAddress lookup)
        v
DestinationBinding (T6)                -- NEVER hashed, NEVER signed, anywhere
```

Verified directly: `hashAuthorityDecision()` (`arbitration-authority.ts`)
is called live (`discretionary-authority.ts`). `hashOutcomeContent()`
(`economic-outcome.ts`) has zero callers anywhere in the codebase —
confirmed by direct search. `packages/sails-core/src/outcome.ts`'s
`DestinationBinding`/`Outcome` types carry no hash/commitment field, and
no function in `@sails/core` computes one for a destination.
`dispute-outcome.ts`'s `toDisputeRulingTransitionRecordRow()` persists
`outcomeContent`/`outcomeDestinationBinding` as raw `Prisma.InputJsonValue`
— never `hashOutcomeContent(content)`'s output, never anything derived
from T6.

**What this means concretely:** given a signed `AuthorityDecisionPayload`
(RELEASE, `buyerBps: null`) and a database row claiming the destination
was address X, no cryptographic artifact anywhere lets an outside party
confirm that X — specifically — is what the arbiter's signature
actually authorized. The arbiter's signature covers *that* a RELEASE
was decided; it says nothing, cryptographically, about *where*. This is
precisely the residual `destination-correspondence.ts`'s own header
(read during the Provider Substitution mission) already named for
non-MULTISIG rails ("a server that also controls one participant's
cooperation could... construct a cryptographically valid settlement
transaction to a DIFFERENT address") — **this mission's new finding is
that the same absence of cryptographic destination-binding exists for
MULTISIG too**, the one rail with every other link in the chain
(signed authority, self-derived txid, pre-dispatch translation guard,
post-execution correspondence check) already real. `dispatch-translation-guard.ts`
compares the plain in-memory destination value against the PSBT — never
a hash — confirmed by direct search (zero hash-related matches in that
file).

**Can an operator rewrite association without invalidating something?**
For T4 alone: no — any change to the signed fields invalidates the
signature. For the *link* between T4 and T5/T6: **yes** — an operator
with database write access could persist a different `outcomeDestinationBinding`
against the same, still-validly-signed `AuthorityDecisionPayload`, and
nothing in this architecture would detect it, because nothing
cryptographically binds them today.

## 19. Mutant / Wrong-Truth Challenge

| Mutant | Repository verdict |
|---|---|
| M1 — Database Is Truth | **Rejected in principle** by this document's own definition (section 5); **partially true in practice** for T5/T6 today, since nothing else currently substitutes |
| M2 — Latest State Is Enough | **Rejected** — `INV-05`, append-only `EscrowEvent`/`EvidenceReference`/`DurableEventRecord`, real and enforced |
| M3 — Signed Decision Is Everything | **Rejected, correctly, by architecture** — but the converse gap (section 18) means the *opposite* failure mode exists: signed decision survives, but what it's bound to does not |
| M4 — Blockchain Is Everything | **Explicitly rejected** — RFC-008 itself rejected "anchor every EvidenceReference on a blockchain, always" for cost/latency (Infrastructure Neutral, Principle 6) |
| M5 — Public Everything | **Explicitly rejected** — RFC-008 rejected a single global Merkle root for privacy-structure-leakage reasons (Principle 8); `INV-OP-10` is a real, tested, repeatedly-enforced minimization discipline (three closed violations, section 4/17 of that invariant) |
| M6 — Operator Export Equals Portability | **Not applicable — no export exists at all** (section 14); this mutant cannot even be exercised yet, which is itself the finding |
| M7 — Hash Without Availability | **Present, inverted** — T11's chains have hashes with availability (T11 DurableEventRecord) or availability without export (T11 EscrowEvent); the more severe converse (M8) is what actually occurs for T6 |
| M8 — Availability Without Authenticity | **Confirmed present for T6** — DestinationBinding is available (readable, party-scoped) but has zero authenticity mechanism (section 9/18) |
| M9 — Authenticity Without Semantics | **Not found** — T4's signature is fully semantically scoped (ruling + buyerBps, nothing more, nothing less, by design) |
| M10 — Cached External Reality | **Explicitly rejected by architecture** — `OBSERVATION != FINALITY` already demonstrated (Recovery evidence); every sweep re-asks the real explorer |
| M11 — Reference Implementation Is Specification | **Rejected** — `docs/CORE_ARCHITECTURE.md`/`SEMANTIC_KERNEL.md`/conformance vectors are independently specified and already demonstrated non-circularly derivable (Condition Algebra mission) |
| M12 — Replication Equals Decentralization | **Not tested by this mission** — no replication of any kind exists today to evaluate; correctly not claimed |

## 20. Privacy Red Team

The naive proposition ("everything needed for survivability should be
globally replicated forever") is **already rejected by real,
demonstrated architecture**, not merely by this mission's own
disclaimer: `INV-OP-10` (three real violations found and closed —
payment-account, payout-address, identity-participant surfaces) and
RFC-008's own explicit rejection of global-Merkle/always-anchor
alternatives citing Principle 8. This mission adds no new privacy
mechanism and proposes none — the correct posture, given
`Portable != Public` is already a demonstrated, tested property here,
not an aspiration.

## 21. External Reality Limit

`DURABLE HISTORICAL FACT != CURRENT EXTERNAL REALITY` is already
correctly implemented (Recovery evidence, `multisig-release-reorg-sweep.ts`'s
own append-only World A-E classification) — not re-litigated here. This
mission's own T10 fact class explicitly excludes "current chain state"
from durable Protocol Truth, consistent with that finding.

## 22. Property-by-Property Verdicts

| Property | Verdict |
|---|---|
| Historical Meaning Survivability (T1/T2) | **PARTIAL** — durable while operator present; no export |
| Authority Fact Survivability (T4) | **DEMONSTRATED** — signed, portable, independently verifiable |
| Outcome Survivability (T5) | **PARTIAL** — content reconstructable from T4+trusted facts; not independently verifiable via its own hash (never computed) |
| DestinationBinding Survivability (T6) | **NOT DEMONSTRATED** — no cryptographic protection of any kind |
| Execution Fact Survivability (T7) | **DEMONSTRATED for MULTISIG** — on-chain, self-derived, independently observable |
| Correspondence Fact Survivability (T8) | **PARTIAL** — recomputable if T5/T6/T7 survive; own row is operator-dependent |
| Recovery Fact Availability (T9) | **PARTIAL** — real while operator present (frozen Recovery Conformance); not evaluated for operator absence |
| Independent Authenticity Verification | **DEMONSTRATED for T4 only** |
| Independent Semantic Reconstruction | **PARTIAL** — protocol *meaning* (Kernel/Core/conformance) yes; specific *historical facts* no, absent export |
| Participant Portability | **NOT DEMONSTRATED** — zero export/backup capability exists anywhere |
| Privacy-Preserving Survivability | **DEMONSTRATED** (as a non-violated constraint — `INV-OP-10`, RFC-008's own rejections) |
| Operator Disappearance Survivability | **NOT DEMONSTRATED** — this mission's central question; material dependencies remain (T5/T6 above all) |
| Hostile Operator Equivocation Resistance | **PARTIAL** — T4 resists it; T5/T6 do not; arbiter's own signing key is itself DB-controlled, not self-anchored |

## 23. Implementation Defects

**Zero.** Every finding above is an honestly-scoped gap or limitation
against an independently-derived property, not a violation of any
currently-claimed property. No repository code was found to
misrepresent its own scope.

## 24. Architectural Gaps (reported, not fixed)

1. `hashOutcomeContent()` exists, is tested, and is never wired to
   protect the one thing it was built to protect.
2. `DestinationBinding` has no commitment mechanism anywhere in
   `@sails/core` or the runtime layer.
3. `EscrowEvent`/`DurableEventRecord` hash chains both anchor at a
   hardcoded, non-externally-verified `'genesis'` sentinel.
4. No export/backup/data-portability capability exists for any
   protocol-relevant fact.
5. The arbiter's signing key is a plain, operator-controlled database
   column, never independently self-anchored.

None of these were fixed. Per the mission's own gate, a discovered
architectural gap is reported, not implemented.

## 25. Smallest Defensible Claim

**"Sails demonstrates real, independently verifiable Authority Facts
(signed discretionary decisions, portable canonicalization, cross-tested
client/server parity) and a real, tested public-surface minimization
discipline (`INV-OP-10`) consistent with privacy-preserving
survivability. It does not currently demonstrate operator-independent
survivability for Outcome content or DestinationBinding — the specific
facts that state what was economically authorized and where it was
authorized to go — nor does it provide any participant-facing
export/portability mechanism for any protocol fact."**

Deliberately not: Sails is decentralized; Sails survives Satsails
disappearance; operator-independent history; censorship resistance;
immutable history; trustless persistence; permissionless continuation;
complete credible exit; portable history; independently verifiable
history; second-implementation readiness — none of these are supported
without qualification by the evidence above.

## 26. NOT PROVEN

- Operator-independent survivability of Outcome or DestinationBinding.
- Any form of participant data export/portability.
- External anchoring of any hash-chain genesis point.
- That an outside party can confirm the arbiter's registered public key
  was genuinely theirs at decision time, independent of the operator's
  own database.
- Universal, global, or public availability of any fact class (not
  attempted — see Privacy Red Team, section 20, this is correctly not a
  goal).
- Replication, decentralized storage, or any specific mechanism —
  correctly out of scope per this mission's own anti-solutionism gate.
- Full K3 conformance, full Sails conformance, formal verification,
  production readiness of any kind.

## 27. COBRA / Goodhart Check

- **Did we define Protocol Truth as whatever the database contains?**
  No — section 5 explicitly attacked and refined the candidate
  definition before touching implementation.
- **Did we confuse PostgreSQL durability with operator independence?**
  No — section 16 states this distinction explicitly against Recovery
  Conformance's own evidence.
- **Did we maximize retained data instead of minimum sufficient truth?**
  No — section 8 challenged every fact class individually; none was
  added merely for completeness.
- **Did we assume portable means public?** No — section 20 explicitly
  preserves the distinction, backed by real, already-demonstrated
  `INV-OP-10` evidence.
- **Did we create surveillance in the name of survivability?** No — no
  new disclosure mechanism was proposed at all.
- **Did we assume signed means semantically reconstructable?** No —
  section 18 is precisely the finding that signed (T4) does NOT imply
  the bound consequence (T5/T6) is reconstructable.
- **Did we assume a hash is useful when underlying data is unavailable?**
  No — section 9's matrix treats availability and verifiability as
  separate columns throughout.
- **Did we treat external chain data as sufficient to reconstruct
  economic meaning?** No — T7's on-chain observability is explicitly
  scoped to "what happened," never conflated with "why it was
  authorized" (Final Principles, directly addressed in section 18).
- **Did we treat historical observation as current reality?** No —
  section 21 explicitly defers to Recovery evidence's own already-
  demonstrated distinction.
- **Did we treat exportability as independent verifiability?** No —
  section 14 keeps all four dimensions (readable/exportable/portable/
  self-verifying) separately scored.
- **Did we treat replication as decentralization?** No — M12 explicitly
  states no replication exists to evaluate.
- **Did we make the reference implementation the specification?** No —
  M11 explicitly cites the independently-derived Kernel/Core/conformance
  material as the actual specification.
- **Did we propose mechanisms before deriving the property?** No — no
  storage/transport/anchoring mechanism is proposed anywhere in this
  document; sections 2's anti-solutionism gate was followed throughout.
- **Did we invent architecture because the implementation lacks
  something?** No — section 24 reports gaps without proposing fixes;
  no new primitive, registry, or abstraction is introduced.
- **Did we broaden the claim to make the mission look successful?** No —
  section 25's claim is narrower than F03's own original candidate
  obligation, not broader.

No STOP triggered by this check.

## 28. Files Changed

One new file: `docs/DURABLE_PROTOCOL_TRUTH_EVIDENCE.md`. No production
code, no tests, no schema, no Core, no Kernel, no Constitution, no SDK,
no settlement providers modified.

## 29. Final Verdict

**B — IMPORTANT PIECES EXIST, BUT MATERIAL OPERATOR DEPENDENCIES REMAIN**

Real, demonstrated strength exists (Authority Facts, privacy-preserving
minimization, on-chain execution facts, real external timestamp
anchoring capability, real append-only hash-chained history). Material,
precisely-located gaps remain — most severely, the complete absence of
any cryptographic binding between the one thing that IS signed
(Authority) and the two things that most need protecting (Outcome
content, and especially DestinationBinding), plus zero participant
export capability for any fact. Not C: nothing found actively violates
a stated property — every gap is an honest absence, not a broken
guarantee. Not STOP: no material contradiction among normative sources
was found (the one discrepancy found, section 4, is a stale Project
card vs. real code — not a normative conflict).

## 30. Backlog Delta

**BACKLOG DELTA DETECTED** — one genuinely new, material delta, not
already covered by any item on the "do not count" list:

**Cryptographic Content-Binding Gap in Durable Protocol Facts.**
`hashOutcomeContent()` (Core-level, tested, real) is never invoked
anywhere in the codebase; `DestinationBinding` has no commitment
mechanism of any kind in `@sails/core` or the runtime layer; the
`EscrowEvent`/`DurableEventRecord` hash chains both anchor at a
hardcoded, unverified `'genesis'` sentinel with no external anchor. The
durable question this delta records: **should the Outcome/DestinationBinding
that a signed Authority decision commits an escrow to also be
cryptographically bound to that signature (or independently anchored),
and if so, by which mechanism** — this mission does not answer that
question or propose a mechanism, consistent with its own anti-solutionism
gate. Distinct from Provider Substitution's own already-known finding
(that non-MULTISIG rails pass destination as an unsigned parameter) —
this delta is specifically that **even MULTISIG**, the one rail with
every other part of the chain real, has this gap. Not implemented, not
Project-synced, by this mission (no such authority granted).
