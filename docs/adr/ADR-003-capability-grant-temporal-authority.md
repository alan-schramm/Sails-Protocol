# ADR-003: CapabilityGrant Temporal Authority for Asynchronous Settlement

**Status:** Accepted on merge of this ADR (architecture / policy decision only; no implementation authorized by this document).  
**Type:** Architecture + Policy Decision Record.  
**Origin:** Issue #211, surfaced by Authority Model Discovery and the #165 Beta Readiness registry.  
**Baseline:** `main@a1c1da08ef7ee2acf80369838851c648eb6a7575`.

**Not authorized by this document:** schema changes, Capability Registry API changes, settlement runtime changes, pending-transaction cancellation semantics, Appeal/ruling-generation changes, or any provider behavior change. Those require separately gated implementation missions.

---

## 1. Problem

Sails currently checks a `CapabilityGrant` when an asynchronous settlement operation is initiated:

- `initiateRelease()`
- `initiateRefund()`
- `initiateSplit()`

The operation may then remain pending while client-held signatures are collected. `submitTransactionSignature()` can finalize much later, including after process restart.

Today the finalization path does not re-check the Capability Registry.

The repository had no frozen answer for what should happen if the grant is revoked or expires after initiation but before the final signature. Treating that absence as an implementation bug would invent policy by accident. This ADR freezes the policy first.

The decision must preserve all of these distinctions:

> **Capability / Policy Authority ≠ Execution Authority ≠ Economic Disposition Authority**

and:

> **retry permission ≠ new economic authority**

---

## 2. Decision

### 2.1 CapabilityGrant authorizes an operation commitment, not every later mechanical continuation

For an asynchronous signature-collection settlement action, a valid `CapabilityGrant` authorizes creation of one specific, durable operation.

The authorization becomes durable at a **Capability Authorization Commit**: the point at which the exact prepared operation and the capability authorization that permitted it are committed together.

After that commit, later revocation or expiry of the general CapabilityGrant is **prospective**. It prevents new operations from being committed under that grant, but does not retroactively erase authority already committed to the existing prepared operation.

Therefore:

- valid grant at commit → the existing prepared operation may continue to collect required signatures and finalize;
- revoked/expired grant before commit → the operation must not be created;
- revocation/expiry after commit → no new operation may be created, but the already-committed operation does not become unauthorized merely because time or policy later changed.

This is **not** a blanket authorization to move funds. Finalization remains subject to the independent authority layers in §4.

### 2.2 Revocation is not cancellation

Revoking a general CapabilityGrant MUST NOT silently serve as cancellation of an already-prepared economic operation.

Cancellation/invalidation of an existing pending operation is a separate semantic action and requires its own explicit lifecycle/authority design.

This preserves a critical distinction:

> **permission to create future operations ≠ authority to cancel an existing committed operation**

The existing cooperative `EscrowPendingTransaction` abandonment/cleanup gap remains owned by `docs/BACKLOG.md` item 44. This ADR does not invent timeout or cancellation semantics.

### 2.3 The commit must be durable and inspectable

A conforming implementation must persist enough evidence to prove, after restart and after later revocation, that the operation was authorized when committed.

At minimum, durable evidence must bind:

- the exact actor (`triggeredBy`);
- the CapabilityGrant that authorized the operation;
- the required capability name/scope;
- the time at which authorization committed;
- the exact prepared operation the authorization applies to.

The implementation may satisfy this with immutable grant identity plus a durable authorization record, a snapshot/hash, or another inspectable mechanism. The mechanism is not frozen here.

If grant fields ever become mutable, a bare grant id is not sufficient by itself; the evaluated authorization content must remain reconstructable.

### 2.4 Authorization commit and revocation must have a deterministic ordering

The implementation must make the authorization commit linearizable with grant revocation.

For a revoke racing an initiate:

- if revocation wins before the authorization commit, initiation fails;
- if the authorization commit wins first, the existing operation remains valid under §2.1 and the revocation applies prospectively.

A check-then-write window that can record an operation after a revocation already committed is non-conforming.

For expiry, the authorization time must be strictly within the grant's valid window. Later expiry is prospective under §2.1.

---

## 3. Why finalization does not re-check the current CapabilityGrant

A second mutable-policy check at finalization was considered and rejected as the default model.

Re-checking would make the ability to complete or recover the **same immutable prepared operation** depend on unrelated later policy state. That creates several problems:

- restart/recovery could manufacture a new authorization requirement that did not exist when the operation was committed;
- a later revocation could strand an otherwise valid partially signed transaction without being an explicit cancellation action;
- retries could become semantically indistinguishable from new operations;
- after an external submission or ambiguous outcome, mutable policy could incorrectly influence reconciliation of an already-attempted economic effect.

The correct boundary is:

> **new operation → current CapabilityGrant required**  
> **same committed operation → durable Capability Authorization Commit governs policy eligibility**

A materially changed operation is not the same operation. Changing outcome, destination, economic amount outside the originally committed bounds, or other authority-relevant content requires a new operation and a new current capability authorization.

---

## 4. Finalization still requires independent current authority

The Capability Authorization Commit does **not** replace other authority layers.

### 4.1 Execution Authority remains current

`submitTransactionSignature()` must continue to enforce the real signer set and cryptographic execution requirements. A capability snapshot cannot make an unauthorized signer valid.

### 4.2 Economic Disposition Authority remains independently current

For disputed settlement, a previously committed capability authorization cannot make a superseded ruling current.

Appeal, stale-ruling finalization, pending-instruction supersession, and ruling-generation binding remain the separate Architecture Decision owned by `docs/BACKLOG.md` item 44.

This ADR deliberately does not solve that family.

### 4.3 Destination Authority remains beneficiary-bound

A Capability Authorization Commit cannot authorize substitution of a beneficiary payout destination. The destination-authority invariant frozen elsewhere remains unchanged.

---

## 5. Synchronous direct fund movement

For a synchronous/direct settlement path with no durable asynchronous prepared operation, the CapabilityGrant must be valid at the authorization point immediately preceding the fund-moving action.

There is no long-lived authorization commit to carry across time unless the implementation first creates one explicitly.

This preserves the current distinction between:

- direct one-request economic actions; and
- signature-collection operations that intentionally span multiple requests and restarts.

---

## 6. Retry, restart, and UNKNOWN outcomes

A retry of the **same** durably committed operation does not create new Capability authority.

After restart, the node must be able to reconstruct whether the pending operation has a valid Capability Authorization Commit without relying on the grant still being active today.

If an external submission has already happened and the result is ambiguous:

> **UNKNOWN ≠ FAILED**

Capability revocation must not turn reconciliation into a blind new submission and must not cause a duplicate economic action. Recovery must reason from the existing operation/evidence, not from a new authorization check.

---

## 7. Alternatives considered

### A. Initiation-only check with no durable evidence

Rejected.

This resembles current runtime behavior but is not durably inspectable. After restart or revocation, the system cannot prove *why* the pending operation was permitted.

### B. Re-check current CapabilityGrant at every signature/finalization step

Rejected as the default temporal model.

It conflates policy for **new** operations with continuation of an already-committed one and makes recovery depend on mutable later policy.

### C. Fixed authorization TTL independent of the grant

Rejected.

It invents a second time authority not present in the grant model and makes correctness depend on an arbitrary clock window.

### D. Capability Authorization Commit with prospective revocation

**Accepted.**

It gives the asynchronous operation a durable policy provenance while preserving separate Execution Authority, Economic Disposition Authority, cancellation semantics, and recovery semantics.

---

## 8. Required implementation properties

A later implementation mission must demonstrate all of the following:

1. a valid grant can produce one durable Capability Authorization Commit for the exact pending operation;
2. a revoked grant cannot create a new commit;
3. a grant expiring before commit cannot create a new commit;
4. revocation/expiry after commit does not retroactively invalidate that exact pending operation;
5. initiate vs revoke race has a deterministic, durable winner;
6. restart can reconstruct authorization from durable evidence;
7. changing authority-relevant operation content requires a new authorization;
8. current required-signer checks remain enforced at finalize;
9. stale Economic Disposition Authority is not legitimized by the capability commit;
10. direct synchronous movement still requires current capability at its own authorization point;
11. retry/reconciliation of the same operation does not require or create new capability authority;
12. enforcement-off mode remains explicit and cannot fabricate capability evidence.

The current boolean-only `CapabilityRegistry.check()` is insufficient to produce durable provenance by itself. A future implementation will need an evidence-bearing authorization result or equivalent mechanism, but this ADR does not prescribe the final API shape.

---

## 9. Current implementation status

Current behavior is **directionally compatible but not complete**:

- capability is checked at `initiate*`;
- finalization does not re-check it;
- `EscrowPendingTransaction` persists `triggeredBy` and the prepared transaction;
- it does **not** persist durable Capability Authorization Commit evidence;
- current initiation is not proven atomic with respect to CapabilityGrant revocation.

Therefore this ADR does not convert the existing implementation into PASS by documentation. It freezes the target semantics and authorizes a separate implementation mission to close the evidence/atomicity delta.

---

## 10. Relationship to other decisions

- **RFC-005 / RFC-013:** continue to own the Capability / CapabilityGrant model and registry. This ADR adds the previously missing temporal semantics.
- **RFC-014:** capability enforcement remains required where enabled; this ADR defines how that authority survives an asynchronous committed operation.
- **BACKLOG item 44:** remains sole owner of Appeal / pending-instruction / stale Economic Disposition Authority.
- **Issue #207:** per-rail arbitration capability is unrelated to permission CapabilityGrant temporal semantics and remains a separate architecture mission.
- **Issue #165:** remains the Beta Readiness scenario registry.

---

## 11. Frozen rule

> **A CapabilityGrant must be current when a new asynchronous economic operation is durably authorized. Once that exact operation and its authorization are committed together, later grant revocation or expiry is prospective and does not itself cancel the operation. Continuation/finalization relies on the durable Capability Authorization Commit while still independently satisfying current Execution Authority and Economic Disposition Authority.**

This is the canonical temporal rule for CapabilityGrant-governed asynchronous settlement unless superseded by a later accepted ADR.
