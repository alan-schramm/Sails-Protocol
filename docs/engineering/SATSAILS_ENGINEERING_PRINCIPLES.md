**Satsails Engineering Principles**

## **1. Purpose**

The Satsails Engineering Principles define the engineering beliefs used to guide architecture, implementation, review, security, product development and technical decision-making across Satsails.

They complement the **Satsails Engineering Methodology**. The methodology defines the process through which work moves. The principles define the standards against which that work is judged.

A process can be followed correctly and still produce the wrong architecture. A feature can work and still create long-term fragility. A test can pass and still prove the wrong thing.

These principles exist to keep execution aligned with product quality, architectural coherence, sovereignty, security and long-term maintainability.

# **2. Core Philosophy**

## **Simple at the center. Open at the edges.**
The authoritative center of the system should remain as small and stable as possible. Complexity belongs at replaceable edges whenever possible. The center should contain only what different implementations truly need to agree on. The edges may evolve independently.

## **Stable semantics, replaceable edges.**
Technologies, providers, wallet stacks, networks, SDKs and infrastructure change. The economic meaning of the protocol should not need to change every time an implementation dependency changes. We adopt capabilities. We do not turn dependencies into architecture.

## **Simple, not simplified.**
Simplicity does not mean ignoring complexity. It means placing complexity in the correct layer. Every abstraction must solve a concrete property. Every complexity must earn its place.

# **3. Product and Engineering**

## **Satsails is a product, not a collection of technical components.**
Engineering does not exist independently from product. Architecture, UX, security, business rules, developer experience, integrations and operations are parts of the same product reality.

A technically elegant solution that creates poor user or developer experience is incomplete. A beautiful interface built over unsafe or ambiguous semantics is also incomplete.

## **Technical depth should increase product simplicity.**
Users should benefit from technical sophistication without being forced to understand it.

> Deep complexity inside. Simple truth outside.

## **The user should experience the system, not the architecture.**
Internal modules, settlement providers, transport mechanisms, identity layers and infrastructure should not leak unnecessarily into the user experience. Complexity should be disclosed progressively, not imposed by default.

# **4. Architecture**

## **Capability ≠ Dependency.**
A capability describes what the system needs. A dependency is one possible implementation.

Wallet capability ≠ WDK.  
Transport capability ≠ Pears.  
Agent capability ≠ QVAC.  
Settlement capability ≠ one provider.

Architectural documents should describe capabilities first. Adapters and providers satisfy those capabilities.

## **Interfaces can multiply. Semantics should not.**
Different wallets, SDKs, languages and providers may expose different interfaces. They should not create different interpretations of the same protocol meaning. Interoperability requires shared semantics, not identical implementation.

## **Protocol truth must remain independent from implementation truth.**
Existing code does not define the protocol merely because it exists. TypeScript does not become authoritative merely because it is implemented first. Reference implementations are examples of conformance. They are not the source of protocol truth.

## **Persistence models are not public contracts.**
Database rows exist for persistence. Public APIs exist for consumers.

Correct boundary: Persistence → Explicit Projection → Public Contract.

Avoid: Persistence → HTTP Response.

Public contracts should be explicit, stable and safe against future database schema expansion.

# **5. Authority and Sovereignty**

## **Authority must always be explicit.**
Every economically meaningful transition must answer: Who is authorized? What exactly are they authorized to do? What evidence proves that authority?

Infrastructure should never acquire economic authority merely because it transports, stores or processes information.

## **Identity domains must remain distinct.**
Participant Economic Identity ≠ Participant Transport Identity ≠ Operational Node Identity ≠ Operator Economic Recipient ≠ Funds Authority.

Different identities may have legitimate relationships. Those relationships must be deliberate. Convenient key reuse must not silently collapse independent authority domains.

## **Recovery must not become authority escalation.**
Recovery mechanisms should restore intended authority. They must not create additional authority. One backup experience does not require one universal key.

# **6. Distributed Systems**

## **Node choice must not define market membership.**
Users should not enter different economic universes merely because their wallet connects through different conformant Sails Nodes.

> Shared liquidity, competitive infrastructure.

## **More infrastructure does not mean more authority.**
More nodes ≠ more truth. More messages ≠ more economic rights. More relay activity ≠ more entitlement. More identities ≠ more economic authority.

Sybil resistance should primarily make cheap multiplicity low-value rather than automatically introducing centralized identity controls.

## **Local policy ≠ Protocol truth.**
Different operators may choose different fees, risk tolerance, providers, ranking, presentation, routing or local policies. Those choices must not redefine authoritative economic facts.

# **7. Failure Semantics**

## **Unknown ≠ Failed.**
A failed API call does not prove that no external side effect happened.

> FAILED CALL ≠ PROVEN NO SIDE EFFECT.

When the outcome of an economic operation is unknown, the correct response may be reconciliation rather than retry.

## **Ambiguity must fail closed.**
When safe continuation cannot be proven, the system should not invent certainty.

Examples include conflicting authority, unknown settlement outcome, incompatible protocol versions, corrupted evidence, identity ambiguity or equivocation.

> Ambiguous ≠ Authorized.

# **8. Security**

## **Security is a permanent adversarial process.**
Security is not a final pre-launch checklist. Production changes the attacker model. Every valuable system eventually attracts skilled, automated, economically motivated and increasingly AI-assisted attackers.

## **No single bug should easily become irreversible economic loss.**
High-value flows should rely on multiple independent protections.

> Economic Defense-in-Depth.

## **Dependency compromise should be bounded.**
Every dependency should receive the minimum authority necessary for its capability. A compromised edge dependency should not automatically compromise protocol authority.

## **Temporary infrastructure must not become permanent authority by inertia.**
Beta conveniences frequently become architecture accidentally. Temporary servers, registries, allowlists, databases or keys should never become protocol authority without an explicit architectural decision.

# **9. Evidence**

## **Implementation ≠ Truth.**
A feature existing in the repository does not prove the intended property. A ticket being closed does not prove readiness. A PR being merged does not prove correctness.

## **Tests ≠ Property.**
A passing test proves only what that test actually exercised. A test called multiNodeTest does not prove multi-node interoperability merely because it passes. Claims must match evidence.

## **OUTPUT ≠ EVIDENCE ≠ PROPERTY ≠ CLAIM.**
Output is what a system produced. Evidence is information supporting a proposition. A property is something we believe the system guarantees. A claim is what we communicate externally or institutionally. Claims must never exceed evidence.

## **Do not make the test pass. Make reality pass the test.**
Tests are tools for interrogating reality. They must not become the objective themselves.

# **10. Production Reality**

A capability may exist at several maturity levels:

EXISTS → IMPLEMENTED → REAL → EVIDENCED → PRODUCTION ELIGIBLE

These stages are not interchangeable. A mock can demonstrate an interface. A real provider can demonstrate integration. Evidence demonstrates a property. Production eligibility requires all relevant properties to be demonstrated under realistic conditions.

## **Production must fail closed rather than fall back to simulation.**
No production-reachable Day-0 path should silently terminate in mock behavior, stub behavior, simulation, emulated success or a non-production provider. Test-only mocks are healthy. Silent production fallbacks are not.

# **11. AI-Assisted Engineering**

## **When implementation becomes cheap, judgment becomes the scarce resource.**
AI dramatically reduces the cost of producing code. That does not reduce the need for engineering judgment. It increases it.

The bottleneck moves from typing to framing, architecture, review, evidence, security, product judgment and deciding what should exist.

## **AI speed increases required review discipline, not acceptable error rate.**
AI can generate correct code faster. It can also generate technical debt faster. Higher execution speed therefore requires stronger review, not weaker review.

## **AI-generated code should be held to a higher review standard, not a lower one.**
AI-generated work must still withstand architectural review, security review, semantic review, tests, evidence and production reasoning.

## **AI is an executor and investigator, not an authority.**
AI can research, implement, test, compare alternatives, detect inconsistencies, propose architecture and produce evidence.

AI does not independently freeze protocol semantics, declare production readiness, grant economic authority, close institutional obligations or redefine architectural truth.

## **Human review does not mean manually rewriting AI output.**
The highest-value human work is often evaluating meaning, boundaries, risk, authority, product impact, simplicity, compatibility and evidence.

# **12. AI-Era Engineering Hygiene**

Every substantial change should receive a sanity pass.

Ask: Is there unnecessary duplication? Did we introduce speculative abstraction? Did the implementation create a new concept unnecessarily? Did persistence leak into public contracts? Are names carrying the correct semantic responsibility? Did we add a dependency where an interface should exist? Did we add a wrapper that provides no real boundary? Did a comment turn a hypothesis into a fact? Did the tests prove the actual property? Can the design become simpler without weakening it?

## **Experiments can be cheaper than premature architecture.**
For uncertain architectural choices:

Hypothesis → Small Experiment → Evidence → Adversarial Review → Decision → ADR.

Experimental code can be discarded. Learning should remain.

# **13. Developer Experience**

## **A capable external developer should be able to integrate without private assistance.**
Documentation quality is part of product quality. Every mandatory support question from a competent integrator may reveal a documentation defect, DX defect, abstraction defect or missing product surface.

## **Code should be legible to humans and agents.**
Prefer explicit types, predictable modules, small responsibilities, clear boundaries, searchable names, isolated dependencies and testable components.

Do not distort architecture merely to optimize for AI context windows. Human architecture remains primary.

# **14. Refactoring**

## **Refactoring is not cleanup after engineering.**
It is part of engineering. Working code may still contain accidental coupling, duplicate responsibility, poor naming, unnecessary abstraction or leaked implementation detail.

Significant changes should therefore be evaluated for whether a bounded refactor improves the architecture before freeze.

# **15. Institutional Memory**

Important engineering discoveries must survive the conversation that produced them.

A valuable finding should land in the appropriate durable location: Master Backlog, ADR, Technical Debt, Institutional Memory, Evidence obligation, Roadmap or executable Issue.

The rule is:

> Não duplicar. Não perder. Não inflar. Não esconder.

# **16. Review Philosophy**

Before freezing an important implementation, ask:

Does it work? Is the responsibility in the right place? Is the abstraction justified? Does it preserve sovereignty, privacy and interoperability? Does it increase capability without unnecessarily increasing weight? Does it create hidden authority? Does it fragment liquidity? Does it expose implementation as protocol? Does it depend on evidence we do not actually have? Will a competent engineer understand why this design exists? Will this architecture still make sense after the current dependency is replaced?

# **17. Final Principle**

The objective of Satsails engineering is not to maximize the amount of software produced.

It is to maximize the amount of **correct, understandable, interoperable and durable capability** produced.

AI can accelerate execution. Frameworks can organize execution. Tests can interrogate execution. But engineering judgment determines whether the system deserves to exist in its final form.

> **Use AI to make execution cheap. Use engineering governance to keep mistakes, ambiguity and accidental architecture expensive.**

And ultimately:

> **Build systems that remain understandable after the people, tools and technologies that created them have changed.**
