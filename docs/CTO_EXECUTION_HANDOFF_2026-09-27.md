# CTO Execution Handoff — Production-Faithful Before Live Economic Rehearsal

**Date:** 2026-09-27  
**Status:** CTO execution handoff / operational memory.  
**Authority:** This note does **not** replace `docs/ENGINEERING_GOVERNANCE.md`, `docs/PROTOCOL_INVARIANTS.md`, accepted RFCs, ADRs, or provider-specific production-eligibility gates. If this note conflicts with canonical architecture or invariants, canonical truth wins and the work must STOP. Its purpose is to make the current CTO execution strategy resumable by a new session, consistent with `ENGINEERING_GOVERNANCE.md` §16.16 Context Handoff Discipline.

## Frozen execution strategy

Sails will implement Day-0 behavior as faithfully as possible to real-value production behavior **before** the final live-funds campaign. The absence of real balances during implementation is not permission to simplify economic semantics, persistence, signing, authority, idempotency, concurrency, restart/recovery, failure handling, or provider boundaries.

This is **not** a decision to defer testing. The rule is:

> Build now as production-faithfully as possible. Prove now everything that can be mechanically demonstrated. Explicitly mark properties that require external economic reality. Then execute a systematic live economic rehearsal, rail by rail and adapter by adapter.

The purpose is to make live-value testing a confirmation of an already implemented and adversarially tested system, rather than the point at which missing implementation is first discovered.

## Evidence states

For Day-0 tracking, distinguish these states without collapsing them:

- **PROVEN WITHOUT LIVE FUNDS** — the claimed property has reproducible evidence without requiring real-value movement.
- **REQUIRES LIVE ECONOMIC REHEARSAL** — implementation exists and all mechanically demonstrable properties should already be tested, but the remaining claim genuinely requires a real external network/provider/value path.
- **LIVE PROVEN** — the specific property has been exercised in a controlled real-value rehearsal and the evidence recorded.
- **BLOCKED / NOT PROVEN** — a known gap, contradiction, missing authority, or missing evidence prevents the stronger claim. Never relabel this as rehearsal-pending merely to make progress look complete.

These labels are evidence claims, not substitutes for the repository's production-eligibility gates.

## What must be proved before live funds where applicable

Use real durable state and production-faithful paths to exercise, as applicable:

- state-machine transitions and economic invariants;
- signing and transaction construction;
- persistence and idempotency;
- duplicate/replay behavior;
- concurrency and multi-worker races;
- process restart, crash windows, recovery and reconciliation;
- malformed/hostile input;
- timeout, cancellation and provider failure semantics;
- authorization and capability boundaries;
- no silent downgrade or fallback into weaker economic authority;
- SDK/adapter conformance and error semantics;
- failure-path and adversarial tests intended to falsify the property.

Mocks/test doubles may isolate external systems, but a mock must not become the evidence for the real persistence, concurrency, signing, provider, or economic property being claimed.

## Wallet / SDK integration requirement

Sails must prove that the public SDK and adapter boundary can integrate with wallets built on different wallet-development stacks. An adapter is **not** the wallet; it is the bridge between the Sails contract and the wallet/stack capabilities.

The intended proof includes representative integration/conformance harnesses for stacks such as WDK and BDK where they are part of the authorized scope, without requiring a wallet to know Sails server internals. A wallet using the public contract should be able to negotiate capabilities, construct/sign/submit the relevant artifacts, preserve typed failure semantics, survive interruption/restart where applicable, and complete the authorized flow.

Do not claim WDK/BDK or any other adapter/rail as production-ready merely because a harness passes. Provider/rail production eligibility and live economic evidence remain separate gates.

## Final live economic rehearsal

After the known Day-0 implementation/backlog reaches its completion gate, run a controlled campaign with small real values. Execute the authorized production-eligible matrix one path at a time, including relevant wallet/adapter combinations and economic paths such as create → sign → broadcast/execute → confirm → release/refund/dispute/recovery/fee behavior where applicable.

For every live failure:

1. preserve the evidence;
2. reproduce at the narrowest faithful seam possible;
3. correct the implementation without weakening the invariant;
4. add a regression/adversarial test;
5. rerun the affected mechanical evidence;
6. repeat the live rehearsal before upgrading the claim to LIVE PROVEN.

A live rehearsal must not be used to bypass an existing production-ineligibility gate. If a rail/provider is not production-eligible, first resolve its canonical gate with the required evidence; do not enable it merely to complete the matrix.

## CTO continuity rule

A future CTO/AI session taking over this work should continue from repository evidence rather than chat memory. For each material mission preserve: base SHA, exact head, decisions, unresolved decisions, files changed, evidence, STOPs, residual limitations, production eligibility, whether the property is PROVEN WITHOUT LIVE FUNDS / REQUIRES LIVE ECONOMIC REHEARSAL / LIVE PROVEN, and the next gate.

The operating objective is not "make everything green." It is to minimize unknowns before real value is introduced while remaining honest about what only external economic reality can prove.


## Engineering assurance and final 100% review

Reaching **100% of the known Master Backlog is not a claim that the software is complete, bug-free, production-certified, or that the engineering lifecycle is finished**. It means the known backlog has reached its closure gate. Before Day-0/Beta engineering can be treated as closed, Sails must perform a separate final closure sweep and an evidence-based Engineering Assurance Review.

The review must use primary standards/specifications as external baselines where applicable, without treating any checklist as a substitute for Sails-specific economic invariants:

- **Software lifecycle and process:** ISO/IEC/IEEE 12207:2026.
- **Requirements engineering and traceability:** ISO/IEC/IEEE 29148:2018, with the current revision/draft reviewed when it becomes normative.
- **Architecture description:** ISO/IEC/IEEE 42010:2022.
- **Software/product quality:** ISO/IEC 25010:2023 and, where useful for automated source-code quality, ISO/IEC 5055:2021.
- **Software verification/testing:** ISO/IEC/IEEE 29119 series, especially Parts 1 and 2, supplemented by Sails adversarial, concurrency, restart/recovery, mutation/falsification, and live-economic evidence.
- **Secure software development:** NIST SP 800-218 SSDF 1.1 as the normative baseline; review the delta in SSDF 1.2 while it remains draft. CISA Secure by Design is a complementary product-security baseline.
- **Application/API security:** OWASP ASVS, using the current stable release at review time.
- **Software supply chain:** SLSA, using the current approved specification at review time, including source/build provenance and release/attestation expectations where applicable.
- **HTTP API contract:** OpenAPI Specification, using the repository's selected supported version and validating implementation/documentation conformance rather than assuming generated documentation is truth.
- **Human-centred UX:** ISO 9241-210:2019.
- **Accessibility:** WCAG 2.2 and normative WAI-ARIA requirements where applicable; WAI-ARIA Authoring Practices Guide may be used as implementation guidance, not as a normative standard.
- **Iterative product/delivery methodology:** the Agile Manifesto/Principles and the current official Scrum Guide are reference models, not mandatory process theatre. Sails may retain its own SEM flow and CTO gate system where they provide stronger evidence and control.

There is no single authoritative international standard that proves "good full-stack programming", "good logic", "good Product Management", or "good UI design" as a whole. Those areas must therefore be decomposed into verifiable concerns: requirements, architecture, correctness, data integrity, API contracts, frontend behavior, accessibility, usability, observability, operations, security, testing, release/supply-chain integrity, stakeholder/product outcomes, and Sails-specific economic correctness. Do not manufacture compliance by mapping vague labels to unrelated standards.

### Assurance matrix

The final review must create an evidence matrix with at least:

`Requirement / Practice → Source + version → Applicable? → Sails implementation → Mechanical evidence → Test/CI/evidence artifact → Status → Gap → Required action`

Allowed review states:

- **PROVEN** — appropriate reproducible evidence supports the claim.
- **PARTIAL** — some applicable portion is demonstrated, but the full claim is not.
- **NOT PROVEN** — implementation/evidence is absent or insufficient.
- **NOT APPLICABLE** — applicability was evaluated and the exclusion is justified.
- **REQUIRES LIVE REHEARSAL** — the remaining property genuinely depends on external production/economic reality.
- **LIVE PROVEN** — use only where the controlled live rehearsal has actually been completed and evidence preserved.

Documentation, a green generic CI run, code presence, mocks, AI agreement, or checklist completion alone must never upgrade a claim to PROVEN.

### Sails Institutional Invariants

External standards are necessary baselines but are not sufficient authority for a P2P economic protocol. The review must maintain a parallel **Sails Institutional Invariants** track covering protocol-specific properties such as economic authority, exactly-once effects, canonical-vs-residual value, signing-round authority, immutable/frozen intent, idempotency, replay identity, durable concurrency authority, crash/restart recovery, fail-closed behavior, provider evidence, no contradictory source of truth, and recovery without unauthorized value movement.

For each institutional invariant, preserve the same evidence discipline: invariant statement, authority boundary, implementation, failure-mode reproduction, mechanical proof, concurrency/restart proof where applicable, exact-head CI, residual limitations, production eligibility, and live-rehearsal status.

### Final review sequence

After the known Master Backlog reaches 100%, do not immediately declare Day-0/Beta engineering complete. The intended sequence is:

`100% known Master Backlog → final backlog closure sweep → Engineering Assurance Review → Reality Validation → SDK/adapter conformance → Asset × Network × Rail × Adapter × Capability matrix → Day-0 economics/providers/nodes/topology/UI review → independent adversarial review → supply-chain/release assurance → controlled Live Economic Rehearsal → RC/Beta gate`

The Engineering Assurance Review must explicitly include backend/full-stack behavior, persistence/data semantics, API contracts, frontend/UI implementation, UX/human-centred design, accessibility, product/requirements traceability, architecture, testing/verification, security, observability/operations, dependency/build/release integrity, and the Sails-specific economic invariants.

Any material applicable requirement that is PARTIAL or NOT PROVEN returns to execution before the corresponding assurance layer can be closed. **NO MATERIAL FINDING UNDER THE RUG.**
