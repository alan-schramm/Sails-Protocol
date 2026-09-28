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
