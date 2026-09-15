# Sails Technical Paper

### Architecture of an Economic Coordination Protocol
### September 2026

> **Document role:** Technical explanatory companion for Sails Protocol. This paper translates the same Institutional Truth used by the Sails Protocol Whitepaper and Sails P2P Trading SDK Paper. It is not a normative specification and does not govern either companion paper.
>
> **Normative and institutional authority remains in:** `docs/SEMANTIC_KERNEL.md`, `docs/PROTOCOL_INVARIANTS.md`, `docs/PROTOCOL_SPECIFICATION.md`, frozen architecture documents, accepted ADRs, and accepted RFCs.

---

# 1. Engineering Thesis

Sails Protocol is designed around a simple technical constraint:

> **Execution must be able to change mechanism without silently changing economic meaning.**

That requirement is stricter than ordinary modularity.

A system can have clean interfaces and still be semantically unsafe if:

- a provider can redefine what it was asked to execute;
- an authenticated actor is treated as economically authorized by default;
- a retry creates a new action rather than re-attempting an existing one;
- a state transition becomes valid merely because some component wrote it;
- a recommendation is mistaken for authority;
- an execution report is mistaken for truth;
- product scope is inferred from whatever providers happen to be installed.

Sails therefore separates semantic authority from operational execution.

The result is an architecture centered on:

```text
Semantic Kernel
      ↓
Pure Core
      ↓
Runtime
      ↓
Modules
      ↓
Providers / Adapters
```

The arrows describe responsibility, not ownership hierarchy. Modules provide domain meaning to Core. Runtime operationalizes accepted decisions. Providers execute external effects. None is allowed to silently redefine another layer's semantic role.

---

# 2. Semantic Kernel

The Semantic Kernel defines the minimum properties expected to survive across implementations and future protocol evolution.

## K1 — Valid Transition

A state transition is valid only when its required conditions are satisfied and economically valid under the ruleset bound to the interaction.

Ruleset binding itself cannot be changed arbitrarily. A change to the rules governing an interaction must itself occur through a valid transition.

This prevents implementation convenience from becoming economic truth.

## K2 — Attributed Discretion

A discretionary transition must be attributable to the actor who exercised the discretion and to the specific interaction and transition where it mattered.

The executor is not automatically the decision-maker.

A settlement provider executing a ruling does not become the arbiter who authorized it.

An agent submitting a recommendation does not become the principal whose authority would be required to act on it.

## K3 — Semantic Settlement Independence

When a transition authorizes an economic outcome, the meaning of that outcome must be defined independently from the mechanism used to execute it.

A provider may translate an authorized result into:

- a transaction;
- a PSBT;
- a smart-contract call;
- a VTXO operation;
- another rail-specific mechanism.

It may not redefine the beneficiary, disposition, or economic effect merely because its execution interface looks different.

## Assertions

An assertion is an attributable, interaction-bound statement.

It becomes part of the permanent record once submitted, but submission does not make it true.

Corrections therefore appear as new assertions rather than silent edits to history.

This distinction gives Evidence, Proof, Dispute, and Agent systems a common semantic foundation.

---

# 3. Pure Core

Sails Core is a deterministic semantic evaluator.

It is deliberately constrained.

Core does not:

- perform I/O;
- fetch provider state;
- write databases;
- dispatch transactions;
- retry side effects;
- select infrastructure based on hidden heuristics;
- own transport;
- own UX.

Given the authoritative inputs needed for a candidate transition, Core determines semantic validity and derives the result that Runtime may commit and execute.

This keeps the most consequential questions independent from operational machinery:

- Is this transition valid?
- Which conditions are satisfied?
- Which remain unresolved?
- Who exercised discretion?
- What economic outcome follows?
- What ruleset governed the decision?

## Four-state condition model

Sails does not reduce every condition to a boolean.

The architectural model distinguishes:

- `SATISFIED`
- `NOT_YET_SATISFIED`
- `UNSATISFIABLE`
- `UNKNOWN`

This matters because temporary absence, permanent impossibility, and lack of knowledge are economically different situations.

A provider being temporarily unavailable is not the same thing as an invalid settlement path.

Missing evidence is not the same thing as evidence disproving a claim.

A condition that may become true later is not equivalent to one that can never be satisfied.

---

# 4. Canonical Evaluation and Semantic Identity

A semantic decision needs one authoritative evaluator for the decision being made.

This does not prohibit:

- shadow evaluation;
- migration comparison;
- alternate implementations;
- conformance testing.

It prohibits dual semantic authority over the same decision.

Two evaluators may be compared during migration, but the system must know which result is authoritative.

The implementation architecture therefore distinguishes:

- semantic identity;
- package identity;
- evaluator identity;
- evaluator profile;
- conformance evidence.

The package that contains an evaluator is not the semantic definition of Sails.

The runtime service hosting it is not the semantic definition either.

This distinction matters for future independent implementations.

---

# 5. Transition Records

A valid economic transition should leave enough durable information for later reconstruction.

The implementation architecture therefore treats Transition Records as more than ordinary logs.

A Transition Record can bind together facts such as:

- prior semantic state;
- resulting semantic state;
- bound ruleset;
- attributable discretion;
- authorized outcome;
- destination or other authority-sensitive data;
- evaluator identity/profile;
- execution correspondence state.

The purpose is not maximum data retention.

The purpose is durable inspectability of economically meaningful change.

---

# 6. Runtime

Runtime is the operational boundary around Core.

Runtime responsibilities include:

- assembling authoritative Core inputs;
- ordering operations;
- committing semantic state and transition records;
- dispatching external effects;
- managing retries;
- recovering from partial failure;
- reconciling uncertain external outcomes;
- exposing operational status without redefining semantic status.

This separation allows Core to remain pure while still supporting a real distributed system.

## Why Runtime matters

Most serious financial failure modes do not occur because a type definition was wrong.

They occur because:

- an effect happened and the process crashed before recording it;
- two concurrent requests raced;
- a stale instruction remained executable;
- a provider became unavailable after selection;
- a retry duplicated economic action;
- a signer or arbiter disappeared;
- the application could not reconcile external state with internal state.

Runtime is where those operational problems belong.

They should not be hidden inside providers or Core.

---

# 7. Modules

Modules define domain-specific economic rules and workflows.

Current protocol families include areas such as:

- OpenIdentity;
- OpenReputation;
- OpenSettlement;
- OpenLiquidity;
- OpenProof;
- OpenP2P;
- OpenAgents;
- OpenFinance on the roadmap.

The important architectural point is not the exact module count.

Modules do not define the identity of Sails.

They are replaceable and extensible domain rulesets built around the same semantic center.

A future module may introduce a different lifecycle without requiring Core to learn its product-specific vocabulary.

---

# 8. Providers and Adapters

Providers execute mechanisms.

Adapters translate between semantic boundaries.

The distinction is conceptual even if one implementation class sometimes performs both jobs.

## Provider responsibilities

A provider may:

- expose structural capabilities;
- prepare rail-specific execution;
- collect or validate required signatures;
- submit an operation;
- report observations;
- participate in reconciliation.

A provider must not acquire authority merely because it can execute.

## Adapter responsibilities

An adapter may:

- map protocol-level data into external formats;
- translate external responses into typed observations;
- normalize transport or network differences;
- bridge wallet or provider APIs into Sails-facing contracts.

An adapter should not become a hidden policy engine.

---

# 9. Asset, SettlementRail, SettlementScope, Provider

Sails Day-0 settlement architecture separates dimensions that earlier code conflated.

## Asset

The economic unit, such as BTC or USDT.

## SettlementRail

The network or protocol domain on which the asset is settled, such as Bitcoin L1, Ethereum, Arkade, Liquid, Spark, or another explicitly modeled rail.

## SettlementScope

The canonical identity pair:

```text
{ Asset, SettlementRail }
```

A scope can be part of Product Scope even when no provider implements it yet.

This is deliberate.

Product scope must not be created accidentally by installing a provider.

## SettlementProviderRegistration

A registration binds an implementation to:

- a settlement scope;
- structural capabilities.

Provider registration does not prove:

- runtime availability;
- provider health;
- maturity;
- product eligibility;
- economic authority.

This preserves the distinctions:

> **Registration ≠ Availability ≠ Health ≠ Eligibility.**

and:

> **Structural Compatibility ≠ Eligibility.**

---

# 10. Adaptive Execution

Sails is evolving from fixed implementation lookup toward explicit execution-candidate reasoning.

The architectural principle is:

> **One intent. Many possible paths. One economic truth.**

Current implementation supports a bounded case:

- enumerate structurally compatible candidates;
- if exactly one exists, resolve it;
- if more than one exists, refuse to silently select one.

This is intentionally not presented as a complete routing engine.

A future Selection layer may consider:

- provider availability;
- wallet capability;
- policy;
- risk;
- maturity;
- cost;
- liquidity;
- user preference;
- latency.

Those dimensions must not be invented merely because they sound useful.

They should be introduced when real product requirements and evidence justify them.

**Current status:** bounded implementation + architecture in validation.

---

# 11. Authority Model

Sails treats authority as a first-class architecture domain.

The following distinctions are load-bearing:

> **Identity ≠ Authority**
>
> **Authentication ≠ Authorization**
>
> **Technical Capability ≠ Protocol Permission**
>
> **Protocol Permission ≠ Economic Authority**
>
> **Capability Grant ≠ Economic Consent**
>
> **Agent Access ≠ Agent Authority**
>
> **Recommendation ≠ Authority**
>
> **Retry Permission ≠ New Economic Authorization**

For settlement-sensitive actions, the architecture additionally distinguishes:

- Economic Disposition Authority;
- Destination Authority;
- Execution Authority.

A party may have authority over one without automatically owning the others.

This prevents a server, provider, SDK, or UI from inheriting economic power merely because it participates in execution.

---

# 12. Policy, Eligibility, and Risk

Policy and eligibility determine whether a structurally possible path should actually participate in an economic interaction.

This domain is intentionally separate from provider selection.

A candidate can be structurally compatible and still be ineligible because of:

- missing permission;
- unsupported wallet capability;
- provider unavailability;
- insufficient maturity evidence;
- product policy;
- risk constraints;
- participant-specific limits.

Current architecture has explicit gaps here.

The codebase does not yet expose one universal runtime pipeline covering every eligibility dimension.

That limitation is documented rather than hidden.

**Current status: In Validation.**

---

# 13. State and Lifecycle

Sails separates business rules from lifecycle correctness.

A valid economic rule can still be implemented unsafely if related objects transition inconsistently.

Lifecycle review therefore looks for contradictions such as:

- one object completing while another still says disputed;
- a cancellation leaving an intent stuck;
- an appeal creating execution ambiguity;
- a settlement event arriving after the state that originally authorized it has changed.

Current engineering work has already found and corrected real examples of cross-object lifecycle drift.

This is one reason the project treats architecture as something tested against adversarial execution, not merely documented.

---

# 14. Evidence and Auditability

Sails distinguishes:

- assertion;
- proof;
- evidence;
- verification;
- state;
- provider observation;
- authorized outcome;
- execution correspondence.

These are not synonyms.

## Assertion

What an attributable actor submitted.

## Proof / Evidence

Material used to support or challenge an assertion.

## Verification

A process or record that evaluates a proof under defined rules.

## Provider Observation

What an external execution mechanism reports.

## Outcome

What the protocol authorized economically.

The broader Evidence / Auditability architecture is still being institutionalized across the system.

OpenProof provides real implementation capability today, but the protocol does not yet claim a universal external-truth oracle.

**Current status: In Validation.**

---

# 15. Execution Correspondence

Authorization and execution are different events.

After execution begins, the system may need to determine whether reality still corresponds to the authorized outcome.

The implementation architecture uses correspondence vocabulary:

- `MATCH`
- `DIVERGENT`
- `PENDING`
- `UNKNOWN`

This avoids a common mistake: treating every provider response as either success or failure when external systems often contain genuine uncertainty.

A transaction may be submitted but not final.

A provider may time out after broadcast.

A settlement may be observable but not yet reconciled.

Correspondence lets Runtime represent those states without rewriting the semantic decision that caused execution.

---

# 16. Temporal and Concurrency Architecture

Time changes economic meaning.

The important questions include:

- Was this authority still fresh when execution occurred?
- Did two requests race?
- Is this retry idempotent?
- Has the underlying condition expired?
- Did an event arrive late?
- Was a provider outcome recorded before a process failed?
- Can a signer disappear permanently?
- Can an arbiter disappear before deciding?

Sails already contains bounded concurrency controls, atomic transition claims, idempotency mechanisms, and rail-specific reconciliation behavior.

It does not yet claim one fully frozen universal temporal model across all domains.

**Current status: In Validation.**

---

# 17. Recovery

Recovery is not a generic "try again" function.

The correct recovery behavior depends on what is known.

Examples:

- if no external effect occurred, retry may be safe;
- if an external effect definitely occurred, repeat execution may be unsafe;
- if outcome is unknown, reconciliation should precede new authorization;
- if authority expired, retry cannot silently create fresh authority;
- if a required actor disappeared, the system may need a separate recovery decision rather than technical retry.

This is why:

> **Retry ≠ New Economic Authorization.**

Broader disappearance cases, including arbiter and signer unavailability, remain active Day-0 resilience domains.

---

# 18. Identity

Sails distinguishes several identity concerns that older architectures often collapse.

Current institutional work separates at least:

- Participant Economic Identity;
- Participant Transport Identity;
- future Operational Sails Node Identity;
- future Operator Economic Recipient.

These are not interchangeable.

A transport peer identifier should not silently become economic identity.

A node operator identity should not automatically determine who receives economic compensation.

An agent acts on behalf of a participant; it does not automatically become an independent economic principal.

Recovery relationships also must not be confused with public identity relationships.

Some recovery and derivation questions remain open and are not decided by this paper.

---

# 19. Agents and QVAC

QVAC is treated as an intelligence capability, not as protocol authority.

The governing distinctions are:

> **Intelligence ≠ Authority**
>
> **Recommendation ≠ Authorization**
>
> **Inference ≠ Evidence**
>
> **Model confidence ≠ Protocol truth**

Current agent functionality can assist with structured intent generation, offer analysis, negotiation support, and risk interpretation.

Delegated economic execution requires an explicit future mandate model.

A future OpenAgent architecture may follow:

```text
Principal
→ Mandate / Delegation
→ Agent
→ Negotiation
→ Eligibility + Authority Gate
→ Execution
```

That model is a direction, not a Day-0 authorization grant.

---

# 20. Human Interface Engineering

Protocol UX must expose human meaning without granting UI code semantic authority.

A useful model is:

```text
Protocol State
→ Human Meaning
→ User Action
```

Current principles include:

- State Legibility;
- Action Legibility;
- Authority Legibility;
- Uncertainty Preservation;
- Recovery Continuity;
- Progressive Technical Disclosure.

The product-level rule is:

> **One economic reality, multiple actor-specific experiences.**

Different actors can see different densities of information without creating different economic truths.

**Current status: In Validation / institutionalization continuing.**

---

# 21. Trust Boundaries

Trust is not represented by one global label.

Different components are trusted for different things.

Examples:

- Core is trusted for semantic evaluation;
- Runtime is trusted to preserve ordering, commit records, and dispatch correctly;
- providers are trusted only within the capability they implement;
- wallets retain control of keys and user authorization;
- arbiters have dispute-scoped discretion, not general economic authority;
- agents may recommend without gaining authority;
- transports deliver data without defining its economic meaning.

A component trusted for one role should not automatically inherit another.

This role-specific trust model is more useful than saying the entire system is simply trusted or trustless.

---

# 22. Security Posture

Sails security design follows the economic consequences of being wrong.

Changes affecting financial authority or value movement require stronger sequencing:

```text
Invariant
→ Architecture
→ Implementation
→ Adversarial Validation
→ Evidence
```

This is different from reversible product work, where building a candidate early can be useful.

Security review therefore focuses on consequences such as:

- unauthorized release;
- destination substitution;
- duplicate execution;
- stale authority;
- replay;
- privacy leakage;
- capability escalation;
- provider overreach;
- custody creep;
- recovery ambiguity.

Security is not a post-build beautification stage.

It constrains architecture from the beginning when economic consequence demands it.

---

# 23. Reference Implementation vs Protocol

The reference implementation exists to validate architecture against reality.

It does not define protocol identity by itself.

Satsails, Sails Market, the current Fastify/Postgres runtime, WDK, Pears, QVAC, and current provider implementations can all supply important evidence without becoming the semantic definition of Sails.

The test for architecture is replacement:

> If a technology is replaced while the economic semantics remain valid, the protocol should survive the replacement.

That is the operational meaning of:

> **Stable semantics, replaceable edges.**

---

# 24. Engineering Governance

Sails uses an explicit engineering governance model because AI-assisted implementation can otherwise accelerate architectural drift as easily as it accelerates delivery.

The central rule is:

> **Anyone may challenge the architecture. No one may silently redefine it.**

The project distinguishes:

- repository truth;
- work-management state;
- implementation evidence;
- architectural authority.

A GitHub Project card can say a task is done.

Only code, tests, and durable documentation can show what "done" actually means.

The development loop is:

```text
MISSION
→ EVIDENCE
→ DURABLE INSPECTABILITY
→ CTO GATE
→ FREEZE
→ BACKLOG DELTA
→ PROJECT SYNC
→ NEXT MISSION
```

This is the Sails Engineering Harness.

It governs the construction of the system.

It is separate from any future Runtime Harness governing agents acting inside the system.

---

# 25. Maturity Model

Sails avoids one-dimensional maturity claims.

A capability may be:

- implemented but not frozen;
- frozen architecturally but not fully implemented;
- testnet-evidenced but not production eligible;
- structurally compatible but unavailable;
- registered but unhealthy;
- product-scoped but without a provider.

The editorial and engineering status vocabulary is:

- **Implemented**
- **Frozen**
- **In Validation**
- **Day-0 Decision Required**
- **Roadmap**
- **Future Vision**

This paper uses those statuses rather than collapsing maturity into one word such as "ready."

---

# 26. Current Day-0 Technical Reality

| Domain | Status |
|---|---|
| Semantic Kernel K1/K2/K3 | **Frozen** |
| Pure Core architecture | **Frozen** |
| Core implementation migration | **Implemented / continuing** |
| Transition Record / evaluator identity architecture | **Frozen** |
| Asset + SettlementRail architecture | **Frozen** |
| SettlementScope registry | **Implemented** |
| Provider registration model | **Implemented** |
| Single-candidate structural resolution | **Implemented** |
| General multi-candidate selection | **In Validation / not implemented** |
| Settlement eligibility pipeline | **In Validation / incomplete** |
| Provider availability / health model | **In Validation** |
| Authority model | **Institutional discovery established; implementation varies by path** |
| Assistive agents | **Implemented** |
| Delegated agent authority | **Future Vision / not Day-0 authorized** |
| Evidence mechanisms | **Implemented in OpenProof** |
| General Evidence / Auditability architecture | **In Validation** |
| Temporal / Concurrency model | **In Validation** |
| Recovery for all disappearance cases | **Day-0 work remains** |
| Human Interface Engineering | **In Validation** |

---

# 27. What This Paper Does Not Claim

This paper does not claim that:

- every Day-0 settlement scope has a provider;
- every provider is production eligible;
- general adaptive routing is complete;
- every recovery case is solved;
- every evidence question can be reduced to cryptographic proof;
- delegated agents already hold economic authority;
- one reference implementation proves universal interoperability;
- P2P transport alone makes the whole system decentralized;
- green CI proves architecture correctness.

These limits are part of the architecture's credibility, not exceptions to it.

---

# Conclusion

Sails is not technically interesting because it connects several modern technologies.

It is interesting if it can preserve economic meaning while those technologies change.

That requires a semantic center strong enough to survive replacement of transport, wallet stack, provider, interface, and intelligence layer.

The Semantic Kernel defines the minimum identity.

Pure Core evaluates meaning.

Runtime turns semantic decisions into durable operations.

Modules define domain rules.

Providers and Adapters connect those rules to external execution without becoming their author.

Authority, eligibility, evidence, temporal correctness, recovery, and correspondence prevent the coordination layer from degenerating into simple routing.

The engineering standard is therefore not:

> Does the code run?

It is:

> Can the system explain why an economic transition was valid, who authorized it, what outcome was intended, what actually executed, and whether those two meanings still correspond?

That is the technical burden of an Economic Coordination Protocol.
