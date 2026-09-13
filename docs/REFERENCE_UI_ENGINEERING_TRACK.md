# Sails Reference UI Engineering Track

**Type:** Institutional Memory / Reference Implementation / Product & DX Track  
**Status:** Parallel product-engineering track. Not protocol truth.  
**Purpose:** Define the role of the Sails UI reference implementation as a first-party, production-grade integration example for teams adopting Sails SDKs across web, mobile and desktop.

## Role

The Sails UI is not merely a demo and must not become protocol truth.

It exists to shorten the distance between SDK capability and a real product integration by providing a coherent reference experience that demonstrates how the official SDKs can be consumed correctly.

> **Reference UI = executable integration guidance, not protocol authority.**

> **The reference implementation should make the correct path easy to see without making that path mandatory.**

## Strategic purpose

The reference UI should help an external team answer practical questions before they need private assistance:

- how to discover offers;
- how to render public vs private data safely;
- how to authenticate;
- how to create and resume trades;
- how to handle pending / failed / unknown outcomes;
- how to represent reputation honestly;
- how to surface network/rail/capability choices;
- how to preserve self-custody and explicit authority boundaries;
- how to integrate SDK types without relying on raw backend persistence shapes;
- how the same product model can map to web, mobile and desktop experiences.

## Architectural boundary

The reference UI must consume public SDK/API contracts rather than internal database models or implementation-only server shapes.

Desired direction:

```
Protocol semantics
      ↓
Official SDK / public API contract
      ↓
Reference UI integration model
      ↓
Web / Mobile / Desktop experience
```

Avoid:

```
Database / internal implementation
      ↓
Reference UI
```

The UI must not force the protocol to expose implementation detail merely because a screen wants convenient data.

## Product quality standard

The Sails UI should be treated as a serious first-party reference implementation, not disposable showcase code.

It should demonstrate:

- correct SDK usage;
- coherent UX;
- progressive disclosure of complexity;
- explicit loading/error/unknown states;
- truthful maturity and provider support;
- privacy boundaries;
- safe handling of authority and settlement states;
- responsive behavior appropriate to web/mobile/desktop;
- accessibility and interaction quality appropriate to the target release;
- no fabricated data to make the interface look more complete.

## Cross-track contract discipline

Changes to public backend/SDK contracts must check first-party UI consumers before freeze.

> **Producer contract + first-party consumer compatibility is one product reality.**

A backend change may be technically correct and still be incomplete if it knowingly leaves the reference UI incompatible.

Conversely, UI compatibility must never justify weakening a correct public/security boundary. The consumer migrates to the correct contract.

## Separate Claude execution track

A dedicated Claude session may own the Sails UI implementation track while the main protocol execution session remains focused on protocol/core work.

The UI session should:

- treat SDK/public API as its integration boundary;
- report contract gaps instead of silently working around them;
- never redefine protocol semantics locally;
- distinguish product/UI decisions from protocol decisions;
- preserve findings that affect SDK/API/Protocol through the main CTO workflow;
- test responsive behavior across web/mobile/desktop targets where applicable;
- keep the reference UI aligned with current frozen public contracts.

## Escalation rule

When the UI discovers a missing field, awkward flow or unavailable capability, classify before changing architecture:

1. UI-only presentation problem;
2. SDK/DX defect;
3. public API contract gap;
4. product decision;
5. protocol/semantic gap;
6. security/privacy conflict.

Only the appropriate owner should change the corresponding layer.

> **A missing screen field is not automatically an API requirement.**

## Evidence expectations

For meaningful reference UI flows, progressively build evidence through:

- typecheck/build;
- component/unit tests where justified;
- integration tests against the SDK;
- browser/runtime walkthroughs;
- responsive/mobile/desktop validation;
- failure-state tests;
- real backend integration for critical flows;
- partner/developer usability feedback.

Absence of test infrastructure is itself an evidence/tooling gap, not evidence that the UI is correct.

## Success criterion

The reference UI succeeds when a competent integrator can inspect and run it and understand how to build a real Sails-powered product without depending on undocumented behavior or private guidance.

It should accelerate adoption while preserving the rule:

> **Satsails Wallet / Sails UI is a reference implementation, not protocol truth.**
