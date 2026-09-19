# AI-Assisted Engineering Governance

**Type:** Institutional Memory / Engineering Governance  
**Status:** Governing review posture. Not a protocol semantic and not automatic Day-0 backlog.  
**Purpose:** Preserve engineering quality as AI lowers implementation cost and increases the rate at which both useful code and technical debt can be produced.

---

## 1. Core thesis

AI changes the economics of implementation. It does not remove the need for engineering judgment.

> **When implementation becomes cheap, judgment becomes the scarce resource.**

> **AI speed increases the required review discipline, not the acceptable error rate.**

> **AI-generated code should be held to a higher review standard, not a lower one.**

The goal is not to make AI output pass a checklist. The goal is to make the resulting system deserve the claim being made about it.

Preserve the existing Sails principle:

> **Do not make the test pass. Make reality pass the test.**

---

## 2. AI is an executor, not an authority

An AI agent may:

- inspect;
- propose;
- implement bounded work;
- test;
- summarize evidence;
- compare alternatives;
- surface inconsistencies;
- suggest refactors;
- identify possible blind spots.

An AI agent does not gain authority merely because its implementation is correct or its tests are green.

It must not independently:

- freeze protocol semantics;
- expand a public claim beyond evidence;
- declare production readiness;
- reinterpret an ADR;
- close an institutional obligation merely because code exists;
- convert implementation detail into protocol truth;
- silently promote a hypothesis into architecture.

Preserve:

> **Implementation ≠ Truth.**

> **Tests ≠ Property.**

> **OUTPUT ≠ EVIDENCE ≠ PROPERTY ≠ CLAIM.**

---

## 3. Decision must remain close to execution

AI can implement quickly enough that long gaps between specification, implementation, review and correction become dangerous. Wrong assumptions can spread across many files before a human revisits the original decision.

Preferred Sails flow remains:

```text
MISSION
→ EVIDENCE
→ CTO GATE
→ FREEZE
→ BACKLOG DELTA
→ PROJECT SYNC
→ NEXT MISSION
```

For architecture-sensitive or high-risk work, use a stronger shape when justified:

```text
DISCOVER
→ HYPOTHESIZE
→ CHEAP EXPERIMENT WHEN USEFUL
→ SPECIFY
→ BUILD
→ TEST
→ SANITY / REFACTOR PASS
→ ADVERSARIAL REVIEW
→ EVIDENCE
→ CTO GATE
→ FREEZE
```

Not every small change needs every stage as a separate artifact. The rigor should scale with the authority and blast radius of the change.

---

## 4. Sanity / Refactor Pass

A technically correct implementation can still be structurally poor.

Before freezing meaningful AI-assisted changes, ask whether the implementation introduced avoidable complexity or accidental architecture.

Questions:

- Is there duplicated logic that should have one owner?
- Is there an abstraction that exists only because generation made it easy to create?
- Is there dead code or a temporary path that became permanent by inertia?
- Do names communicate semantic responsibility?
- Is persistence shape leaking into public API shape?
- Are responsibilities mixed across layers?
- Is a dependency being treated as architecture instead of a replaceable capability?
- Are comments making causal or maturity claims stronger than the evidence?
- Do tests protect a real property, or only the current implementation shape?
- Is the happy path hiding failure, recovery, authorization or privacy gaps?
- Could the same result be achieved with a smaller authoritative surface?

Preserve:

> **Simple, not simplified.**

> **Complexity must earn its place.**

> **Stable semantics, replaceable edges.**

---

## 5. Cheap implementation should make experimentation cheaper, not architecture more casual

Because AI lowers the cost of trying an implementation, competing approaches can be tested before an expensive architectural commitment is frozen.

For uncertain architecture where experiments are cheap and representative:

```text
HYPOTHESIS
→ EXPERIMENT A
→ EXPERIMENT B
→ MEASURE
→ COMPARE
→ DOCUMENT WHAT WAS LEARNED
→ DISCARD LOSING EXPERIMENTS
→ CTO / ADR DECISION
```

Experimental code does not earn production status merely because it works.

> **Prototype success ≠ architectural proof.**

> **Experiment code is disposable; learned evidence is not.**

Do not add experiments when direct evidence already resolves the question or when the experiment cannot represent the property under dispute.

---

## 6. Optimize the repository for humans and agents without making it agent-specific

AI agents consume repository structure as context. Poor structure increases both human cognitive load and agent error rate.

Prefer:

- explicit types and boundaries;
- small semantic modules where natural;
- searchable and precise names;
- documented ownership of public contracts;
- dependency injection where it materially improves replaceability/testability;
- deterministic tests;
- headless/reproducible verification;
- clear ADR and institutional provenance;
- comments that explain non-obvious reasons and evidence boundaries;
- explicit source-of-truth documents rather than duplicated narratives.

Avoid optimizing code for an agent at the expense of the human model of the system.

> **Agent-readable should be a consequence of clear engineering, not a competing architecture.**

---

## 7. Regression permanence

AI makes repeated implementation fast, so already-learned failures must not be rediscovered repeatedly.

For a confirmed defect class:

```text
finding
→ violated property
→ bounded fix
→ regression / evidence obligation
→ institutional memory where warranted
```

A bug fix without a durable learning mechanism is incomplete when the failure class is likely to recur.

This does not require a test for every historical observation. Where executable regression is not meaningful, preserve an evidence obligation or architectural constraint instead.

---

## 8. Review intensity follows economic authority and blast radius

Sails is financial coordination infrastructure. Review rigor must not be uniform.

Changes deserve stronger gates when they touch:

- funds authority;
- economic commitment;
- identity;
- reputation;
- authorization;
- settlement;
- public API contracts;
- privacy;
- multi-node convergence;
- recovery;
- provider eligibility;
- production fallback behavior;
- protocol interoperability.

A cosmetic or local refactor and a settlement-authority change should not receive the same review burden.

> **The cheaper code becomes, the more review effort should concentrate on high-authority boundaries.**

---

## 9. AI must not turn green CI into false confidence

Green CI is evidence about exercised behavior, not a general maturity certificate.

Ask:

- What exact property did the test exercise?
- What did it not exercise?
- Was the provider real, mocked, stubbed or emulated?
- Was concurrency representative?
- Was failure injection representative?
- Was the public/private boundary actually tested?
- Was restart/recovery tested where required?
- Did the test prove absence of a side effect or only absence of an observed error?

Preserve:

> **A passing test proves only the property actually exercised by that test.**

---

## 10. AI-era debt can accumulate faster than traditional debt

An agent can create internally consistent but unnecessary abstractions across a large code surface faster than a human team would normally produce them.

Watch for:

- abstraction multiplication;
- duplicate semantic models;
- wrappers with no independent responsibility;
- speculative extensibility;
- broad interfaces justified by hypothetical future use;
- generated comments that narrate assumptions as facts;
- tests that duplicate implementation rather than constrain behavior;
- silent fallback to mocks/stubs;
- dependency-specific concepts leaking into protocol terminology.

Use the Goodhart, Cobra and Rube Goldberg checks already present in Sails governance.

---

## 11. Human review is not manual reimplementation

The reviewer does not need to rewrite every generated line to exercise real engineering judgment.

High-value review focuses on:

- problem framing;
- semantic boundaries;
- source of authority;
- privacy and security implications;
- failure modes;
- invariants;
- claims versus evidence;
- unnecessary complexity;
- compatibility and future migration cost;
- whether the implementation is solving the right problem.

AI can accelerate inspection as well as implementation, but final institutional authority remains explicit.

---

## 12. Sails-specific working rule

The current Sails operating model intentionally separates roles:

```text
Product / Protocol Direction
        ↓
bounded mission
        ↓
AI executor
        ↓
evidence
        ↓
CTO adversarial review
        ↓
correction / reject / freeze
```

The value of this model is not that AI writes code quickly. Its value is that execution speed is paired with an explicit adversarial quality gate.

Desired external impression from an experienced engineer reviewing the repository:

> the implementation may have been AI-assisted, but the architecture, boundaries, claims, tests and institutional decisions were deliberately reviewed.

---

## 13. Institutional classification

This document is **Engineering Governance / Institutional Memory**.

It does not automatically create:

- a Day-0 protocol requirement;
- a new protocol abstraction;
- a new runtime dependency;
- an issue for every question above;
- an obligation to add process steps to trivial changes.

When a concrete finding appears, classify it using the normal institutional flow:

```text
observation
→ duplicate check
→ implementation defect / architecture gap / evidence gap / technical debt /
  Day-0 obligation / roadmap / no action
→ issue or mission only if executable work exists
```

Concise rule:

> **Use AI to make execution cheap. Use engineering governance to keep mistakes, ambiguity and accidental architecture expensive.**
