# Satsails Engineering Principles

**Type:** Engineering Principles / Institutional Guidance  
**Status:** Working institutional draft for later consolidation  
**Purpose:** Define the principles used to judge whether Satsails engineering decisions are correct, durable, interoperable, understandable, sovereign, and product-coherent.

This document complements the Satsails Engineering Methodology. The methodology describes **how work moves**. These principles describe **how we judge whether the result is good engineering**.

---

## 1. Simple at the center. Open at the edges.

Keep the protocol-authoritative semantic core as small and stable as possible. Put changeable complexity at replaceable edges whenever possible.

> **Simple at the center. Open at the edges.**

> **Stable semantics, replaceable edges.**

> **Interfaces can multiply. Semantics should not.**

---

## 2. Simple, not simplified.

Simplicity does not mean ignoring real complexity. It means placing complexity in the correct layer.

Every abstraction must solve a concrete property. Every complexity must earn its place.

> **Simple, not simplified.**

---

## 3. Capability before dependency.

Architecture should describe capabilities before implementation choices.

Wallet capability is not WDK. Transport capability is not Pears. Agent capability is not QVAC. Settlement capability is not one provider.

> **Adopt capabilities, not dependencies as architecture.**

---

## 4. Protocol truth is not implementation truth.

Existing code does not become protocol semantics merely because it exists. TypeScript may be first, but it is not authoritative. Reference implementations prove one implementation path; they do not define protocol truth.

> **Implementation ≠ Truth.**

> **Reference implementation ≠ protocol authority.**

---

## 5. Product and engineering are one reality.

Architecture, UX, security, developer experience, operations, business constraints and protocol semantics are not separate realities. A technically correct subsystem can still produce an incomplete product.

> **Activity ≠ Progress.**

> **Implementation ≠ Readiness.**

> **Readiness ≠ Value.**

---

## 6. Technical depth should increase product simplicity.

Internal complexity should make the product easier to use, not harder to understand.

> **Deep complexity inside. Simple truth outside.**

The user should experience the system, not the architecture.

---

## 7. Multiple interfaces, one economic reality.

Sails should support different levels of interaction without creating different meanings of the protocol.

A basic user may interact through a graphical wallet interface. An integrator may use an SDK. An advanced operator may use an API or CLI. An AI agent may interact through MCP/WebMCP or another machine-oriented interface.

These are different surfaces over the same underlying economic semantics.

> **Multiple interfaces, one economic reality.**

> **The user should choose the interface depth, not a different protocol meaning.**

> **Sails should expose increasing power through progressive interfaces, not increasing semantic complexity.**

Conceptual surface stack:

```text
Human UI
Web / Mobile / Desktop
        ↓
Reference UI / Partner UI
        ↓
SDK
        ↓
API
        ↓
CLI
        ↓
MCP / WebMCP / Agents
        ↓
Sails Protocol Semantics
```

The stack is not a hierarchy of authority. It is a hierarchy of interface depth.

A GUI must not invent semantics that the CLI cannot express. A CLI must not expose a second interpretation of an economic action. An AI agent must not gain authority merely because it has a more direct machine interface.

All surfaces should converge on the same protocol-level concepts and constraints.

---

## 8. Progressive power without progressive sovereignty loss.

Different users need different amounts of visible complexity.

A basic user should be able to transact without understanding protocol internals. An advanced user should be able to inspect, automate and exercise sovereign choices without being forced into a separate system.

> **Progressive disclosure of complexity. Constant sovereignty.**

Centralized-grade UX must not require centralized authority.

---

## 9. Persistence models are not public contracts.

Persistence exists for storage. Public contracts exist for consumers.

Correct boundary:

```text
Persistence
↓
Explicit Projection
↓
Public Contract
```

Never allow database evolution to silently expand public disclosure.

---

## 10. Authority must be explicit.

Every economically meaningful transition must answer who is authorized, what they are authorized to do, and what evidence proves it.

Infrastructure that transports, stores or computes information must not gain economic authority merely by being present.

> **Funds Authority ≠ Economic Identity ≠ Transport Identity ≠ Operational Node Identity.**

---

## 11. Local policy is not protocol truth.

Operators may differ in fees, providers, ranking, routing, presentation and risk tolerance. Those local choices must not redefine signed or authoritative economic facts.

> **Local policy ≠ Protocol truth.**

---

## 12. Unknown is not failed.

A failed call does not prove that no economic side effect happened.

> **FAILED CALL ≠ PROVEN NO SIDE EFFECT.**

> **Unknown outcome ≠ failed economic action.**

Ambiguity must not be converted into invented certainty.

---

## 13. Evidence must match claims.

A passing test proves only what that test exercised.

> **OUTPUT ≠ EVIDENCE ≠ PROPERTY ≠ CLAIM.**

> **Do not make the test pass. Make reality pass the test.**

Claims must never exceed evidence.

---

## 14. Production is a maturity state, not a merge state.

```text
EXISTS
↓
IMPLEMENTED
↓
REAL
↓
EVIDENCED
↓
PRODUCTION ELIGIBLE
```

PR merged, issue closed, CI green, provider integrated, or feature visible are not equivalent to production eligibility.

Production paths must fail closed rather than silently fall back to simulation, mocks, stubs or unevidenced behavior.

---

## 15. AI makes judgment more important, not less.

When implementation becomes cheap, judgment becomes the scarce resource.

> **AI speed increases the required review discipline, not the acceptable error rate.**

> **AI-generated code should be held to a higher review standard, not a lower one.**

AI may execute, investigate, compare, test and propose. It does not independently freeze architecture, define protocol truth, declare production readiness, or grant economic authority.

---

## 16. Working code can still be mathematically wrong.

Quantitative semantics deserve explicit review. Rounding, precision, prices, fees, scores, rates, thresholds, incentives and accounting can change behavior even when code compiles and tests pass.

> **Working code ≠ correct mathematics.**

> **Correct arithmetic ≠ correct economic model.**

> **Equivalent-looking formulas ≠ equivalent semantics.**

---

## 17. Reference UI is executable integration guidance, not protocol authority.

The Sails Reference UI exists to prove that a real product can be built using the public SDK/contracts and to accelerate integrators across web, mobile and desktop.

> **Producer contract + first-party consumer compatibility is one product reality.**

The UI must adapt to correct protocol boundaries. The protocol must not preserve a bad contract merely because a reference screen depends on it.

A reference implementation should help an independent developer understand how to integrate without private assistance.

---

## 18. Refactoring is part of engineering.

Working code may still contain accidental coupling, unnecessary abstraction, poor naming, leaked implementation detail or duplicated semantics.

Significant changes should receive a bounded sanity/refactor pass before freeze.

---

## 19. Institutional memory must survive the conversation.

Important findings should land in the correct durable place: Master Backlog, ADR, Technical Debt, Institutional Memory, Evidence obligation, Roadmap or executable Issue.

> **Não duplicar. Não perder. Não inflar. Não esconder.**

---

## 20. Final engineering objective.

The objective is not to maximize the amount of software produced. It is to maximize the amount of correct, understandable, interoperable, sovereign and durable capability produced.

> **Use AI to make execution cheap. Use engineering governance to keep mistakes, ambiguity and accidental architecture expensive.**

> **Build systems that remain understandable after the people, tools and technologies that created them have changed.**
