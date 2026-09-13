# Day-0 Production Reality Sweep

**Type:** Institutional Memory / Day-0 Production Readiness Obligation  
**Status:** Registered, not yet executed  
**Scope:** Production-reachable Day-0 paths only  

## Why this exists

Sails uses mocks, stubs, emulations and incomplete providers for legitimate engineering purposes during development and testing. Those tools are not themselves defects.

The Day-0 risk is different:

> **A production-reachable capability must never appear real while still depending on fictitious, simulated, stubbed or silently substituted behavior.**

This obligation exists to prevent the boundary between test scaffolding and economic reality from becoming ambiguous as Sails approaches beta, RC1 and public production.

## Core rule

> **No production-reachable Day-0 path may silently depend on a mock, stub, emulation, simulated success or non-production fallback.**

And:

> **Production must fail closed rather than fall back to simulation.**

This does not require removing test mocks. Test-only mocks are valid engineering infrastructure when their claim boundary is honest.

## Required classification

Every discovered mock/stub/emulation/fallback must be classified as one of:

1. **TEST-ONLY MOCK**  
   Allowed. Must not support a broader production claim than the test actually proves.

2. **REFERENCE / DEMO IMPLEMENTATION**  
   Allowed if unmistakably identified as non-production and unreachable from production configuration unless explicitly selected for demonstration.

3. **FUTURE-CAPABILITY STUB**  
   Allowed only when the capability is outside the declared Day-0 launch scope and cannot be mistaken for supported production functionality.

4. **DAY-0 REACHABLE STUB**  
   Production blocker.

5. **SILENT FALLBACK TO MOCK / SIMULATION**  
   Critical production blocker.

6. **EMULATED ECONOMIC SUCCESS**  
   Does not satisfy any Production Gate for the corresponding economic capability.

7. **REAL IMPLEMENTATION, NOT YET EVIDENCED**  
   Not a mock, but still not production-eligible until the required property evidence exists.

Preserve:

> **EXISTS ≠ IMPLEMENTED ≠ REAL ≠ EVIDENCED ≠ PRODUCTION ELIGIBLE.**

> **Provider implementation ≠ provider maturity ≠ production eligibility.**

## Sweep question

For every Day-0 production-reachable route, module, adapter, provider and economic flow ask:

> **Can a real user reach any branch that returns, persists, signals or implies success while the authoritative external/economic action was mocked, stubbed, emulated, skipped or silently substituted?**

If yes, that path is not production-ready.

## Mandatory surfaces

The sweep must confront at least:

- settlement providers;
- liquidity providers;
- escrow flows;
- signed Offer discovery and gossip;
- identity and recovery;
- reputation/history;
- arbitration/dispute execution;
- QVAC/agent-assisted decisions where they influence user-visible or economic behavior;
- wallet adapters;
- rail/provider selection;
- fee/accounting flows;
- payment confirmation/evidence flows;
- retries and unknown outcomes;
- feature flags and environment defaults;
- demo/reference providers;
- any `MOCK`, `stub`, `fake`, `emulated`, `simulation`, `not implemented`, `TODO`, placeholder or fallback branch reachable from launch configuration.

## Fail-closed requirement

Unsupported or unavailable real capability must fail explicitly.

Preferred shape:

```text
real provider unavailable
→ explicit unsupported/unavailable/unknown-outcome state
→ no fictitious success
```

Forbidden shape:

```text
real provider unavailable
→ silent mock/emulation/fallback
→ success-shaped result
```

## Evidence discipline

A test using mocks may prove local logic, validation, transition rules or error handling.

It does not by itself prove:

- external provider behavior;
- real settlement;
- real network interoperability;
- real payment confirmation;
- recovery against the real dependency;
- production eligibility.

For every production claim, identify the first real external boundary and require evidence through that boundary.

Preserve:

> **Mock evidence may prove internal logic. It cannot prove an external side effect that never happened.**

> **Do not make the test pass. Make reality pass the test.**

## Completion criteria

This Day-0 obligation closes only when all of the following are true for the declared launch scope:

1. all production-reachable Day-0 paths have been inventoried;
2. mocks/stubs/emulations/fallbacks are classified;
3. no Day-0 production path silently falls back to simulation;
4. unsupported capabilities fail closed;
5. demo/reference providers cannot be confused with production-eligible providers;
6. emulated economic evidence is excluded from Production Readiness claims;
7. each enabled provider/rail has an explicit maturity and eligibility status;
8. every launch claim maps to real evidence at the relevant external/economic boundary;
9. CI/tests retain useful mocks where appropriate without those mocks being treated as production proof;
10. Production Readiness Gate confirms there is no fictitious success in the declared Day-0 path.

## Sequencing

This is a **Day-0 completion obligation**, not an immediate refactor mission.

It should be executed after the launch/beta scope and production-enabled rails are known well enough to define the reachable surface, and before public production activation.

It must not derail the current sequence:

```text
TD #57
→ TD #61
→ Gate B scope freeze
→ Gate C onward
```

But it must be satisfied before the final Production Readiness / RC1 / public-production gate accepts the corresponding launch claims.

## Relationship to mocks in tests

Do not optimize for a low mock count.

A repository with zero mocks can still be unsafe. A repository with many well-scoped test mocks can be rigorous.

The target is not:

> "remove mocks"

The target is:

> **Mocks where tests need isolation. Reality where economic claims depend on reality.**

## Institutional classification

**Classification: DAY-0 PRODUCTION READINESS OBLIGATION.**

**BACKLOG DELTA: REQUIRED.**

This obligation should be cross-linked from the Day-0 completion tracker and treated as a blocker for public production within the declared launch scope.
