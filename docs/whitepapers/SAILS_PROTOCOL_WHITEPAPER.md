# Sails Protocol Whitepaper

### Economic Coordination Protocol
### September 2026

> **Document role:** Canonical explanatory paper for Sails Protocol. This document translates the current Institutional Truth for a broad technical and product audience. It does not define protocol conformance and does not override the Protocol Specification, Protocol Invariants, Semantic Kernel, accepted ADRs, or accepted RFCs.
>
> **Editorial rule:** The Sails Protocol Whitepaper, Sails Technical Paper, and Sails P2P Trading SDK Paper are parallel translations of the same Institutional Truth. None is a canonical source for the others.

---

# Abstract

Digital money has become increasingly interoperable.

Economic context has not.

A wallet can hold Bitcoin, stablecoins, or other digital assets. A payment network can move value. A blockchain can establish consensus. A marketplace can match participants inside its own boundaries. An AI agent can interpret information and recommend an action.

None of these, by itself, provides a common way for different participants and systems to agree on what an economic interaction means, who has authority to change it, what conditions must be satisfied, what evidence matters, and whether execution still corresponds to what was actually authorized.

This is the coordination gap Sails Protocol is designed to address.

**Sails Protocol is an Economic Coordination Protocol.** Its current v1 focus is concrete: open infrastructure for building interoperable P2P financial marketplaces. Its broader architecture is designed around a deeper requirement: enabling humans, wallets, applications, providers, and agents to participate in economic interactions without requiring them to share the same technology stack.

Different stacks can use different transports, settlement mechanisms, interfaces, and execution providers.

What they need to preserve is compatible economic meaning.

> **Different stacks. Shared economic meaning.**

Sails does not attempt to make every technology the same. It defines a stable semantic center while keeping the systems around it replaceable.

At that center are questions such as:

- What does a participant intend?
- What conditions govern the interaction?
- Who has authority to make a discretionary decision?
- What evidence has been submitted?
- What economic outcome has actually been authorized?
- Did the eventual execution preserve that meaning?

The current Sails architecture derives these properties from a minimal Semantic Kernel and materializes them through a Pure Core, Runtime, domain Modules, and replaceable Providers.

The first concrete product built around this architecture is the **Sails P2P Trading SDK**, designed to let wallets and applications participate in interoperable P2P financial marketplaces without rebuilding discovery, negotiation, settlement coordination, disputes, reputation, and related infrastructure independently.

The ambition is broader than one SDK.

But the path to that ambition is deliberately narrow: prove economic coordination in one demanding real-world domain before generalizing it.

---

# 1. Every Wallet Today Is an Island

A non-custodial wallet can do something remarkable.

It can let a person hold their own keys, authorize their own transactions, and move assets without asking a centralized platform for permission.

But custody sovereignty does not automatically create economic interoperability.

The moment two strangers want to do something more complex than sending value to a known address, they need more than a wallet.

They may need to discover each other.

They may need to negotiate terms.

They may need to prove that an external payment happened.

They may need to decide whether an asset can be released.

They may disagree.

They may use different settlement technologies.

They may have never used the same application before.

This is where the island appears.

A wallet may be sovereign and still be economically isolated.

Today, teams often solve this by sending their users somewhere else or by building an entire marketplace stack themselves: discovery, negotiation, escrow or settlement coordination, disputes, reputation, fraud controls, evidence handling, and operational recovery.

When each wallet does this independently, each wallet also creates its own island of economic context.

The fragmentation is larger than wallets.

There are also:

- reputation islands;
- liquidity islands;
- marketplace islands;
- provider islands;
- agent islands;
- evidence islands;
- economic-history islands.

Money can often cross between systems more easily than the context explaining **why**, **under what authority**, and **under which conditions** that money should move.

That is the deeper problem Sails is designed around.

---

# 2. The Coordination Gap

Modern financial technology already contains powerful layers.

Blockchains coordinate consensus over their own state.

Payment networks coordinate settlement.

Wallets coordinate custody, signing, and asset access.

Smart contracts coordinate deterministic execution once rules and inputs are already defined.

Marketplaces coordinate discovery and transaction flows inside their own systems.

None of these layers alone answers the complete economic coordination problem between independent participants and independent technologies.

Consider a P2P interaction between two strangers.

Before settlement can happen, someone must establish:

- what each participant wants;
- whether a counterparty or offer is suitable;
- what terms were agreed;
- whether required conditions have been satisfied;
- who is allowed to make a discretionary judgment;
- which statements or evidence are relevant;
- what economic outcome has been authorized;
- what settlement mechanism is appropriate;
- whether execution eventually matched the authorized outcome.

A blockchain can tell you that a transaction happened.

It cannot, by itself, tell you that this was the transaction the parties were economically authorized to perform.

A transport protocol can deliver a message.

It cannot decide whether the message constitutes authorization.

An AI model can recommend an action.

Its recommendation is not economic authority.

A provider can report that it executed something.

Its report is not automatically world truth.

The missing layer is not another settlement network.

It is coordination over economic meaning.

The current v1 expression of this idea remains deliberately concrete:

> **Sails Protocol is open infrastructure for building interoperable P2P Financial Marketplaces.**

The longer-term definition is broader:

> **Sails Protocol is an intent-driven, open coordination protocol that enables sovereign financial interactions across wallets, agents, applications and institutions.**

These statements are not competitors.

The first defines the current adoption wedge.

The second describes the architectural horizon.

---

# 3. Different Stacks, Shared Economic Meaning

Interoperability does not require technological homogeneity.

Two participants do not necessarily need:

- the same wallet;
- the same user interface;
- the same transport;
- the same settlement provider;
- the same blockchain;
- the same software implementation;
- the same agent;
- the same infrastructure operator.

They need enough shared semantics to understand the same economic interaction.

Imagine one participant using a mobile wallet.

Another uses a web marketplace.

A third interaction is initiated through an agent.

One settlement path may use Bitcoin.

Another may use a stablecoin.

A provider may change.

An application may present the process differently.

These differences are acceptable if the economic meaning does not silently change with them.

This is the core narrative bridge of Sails:

> **Sails does not require technological homogeneity. It requires compatible economic meaning.**

That requirement is more demanding than API compatibility.

Two systems can accept the same JSON and still disagree about what it means.

They can expose the same method name and disagree about authority.

They can both support the same asset while disagreeing about settlement eligibility.

They can both report success while having executed different economic outcomes.

Sails therefore treats interoperability as a semantic problem first.

Technology comes afterward.

---

# 4. What Sails Coordinates

At a high level, Sails coordinates five closely related concerns.

## 4.1 Intent

What is the participant trying to accomplish?

An intent expresses economic purpose before forcing the participant into a specific execution mechanism.

## 4.2 Authority

Who is allowed to cause a meaningful change?

Identity alone is not enough.

Authentication alone is not enough.

A capability alone is not enough.

Economic authority must be understood in the context of the interaction.

## 4.3 Conditions

What must become true before a transition can be valid?

Conditions may depend on state, evidence, participant decisions, rules, external observations, or combinations of these.

## 4.4 Evidence

What attributable information has been submitted into the interaction?

A receipt, signed decision, provider report, or participant statement can become evidence without automatically becoming truth.

## 4.5 Outcome

What economic result has actually been authorized?

An authorized outcome must retain its meaning independently of the mechanism that later executes it.

These five concepts are an explanatory model for this paper.

They do not replace the protocol's normative primitives or create a new specification.

Their purpose is to make the architecture understandable.

---

# 5. Coordination Without Control

Coordination is not the same as control.

This distinction is structural.

Sails is not designed to become the owner of every decision, every key, every provider, or every interface participating in an economic interaction.

The protocol's principles include self-custody, infrastructure neutrality, capability-based participation, open integrations, and interface agnosticism.

That means Sails should not need to control:

- the participant's wallet;
- the participant's brand or user relationship;
- every settlement network;
- every liquidity source;
- every interface;
- every AI model;
- every provider implementation.

Coordination instead defines the shared semantic rules required for these systems to interact without silently redefining one another.

This is particularly important when money moves.

The component that executes an economic outcome should not gain authority merely because it is technically capable of executing it.

The component that recommends a decision should not become the decision-maker merely because it produced a high-confidence answer.

The application displaying a state should not redefine that state because a simpler UI would be convenient.

The provider reporting execution should not be allowed to declare its own observation unquestionable truth.

The system remains coherent only if meaning, authority, and execution remain distinguishable.

> **Sails coordinates. It does not control.**

---

# 6. The Semantic Kernel

As Sails evolved, one question became increasingly important:

> What must remain true for something to still be Sails if the technologies, modules, and implementation details around it change?

The result is the **Sails Semantic Kernel**, a frozen architectural baseline containing three properties.

The Kernel is deliberately smaller than the current protocol specification.

It does not define every feature.

It defines the minimum semantic identity the architecture is expected to preserve.

## 6.1 K1: Valid Transition

An economic state change must be valid under the rules the interaction is actually bound to.

A participant, server, or provider should not be able to make an invalid transition become valid simply by executing it.

This becomes critical in distributed systems.

Different services may have different views.

Events may arrive late.

A retry may occur after authority changed.

A provider may still be capable of executing an instruction that is no longer valid.

Economic validity therefore comes from the bound rules of the interaction, not from whichever component happens to run first.

## 6.2 K2: Attributed Discretion

When a transition depends on human or machine judgment, that discretion must be attributable.

If an arbiter decides a dispute, the system should know which arbiter made that decision.

If a principal eventually authorizes an agent to act, the agent's action must remain attributable to the mandate that allowed it.

Execution cannot retroactively invent the authority that justified it.

This property becomes especially important as autonomous systems participate.

A machine can act quickly.

That does not mean the source of its authority can become ambiguous.

## 6.3 K3: Semantic Settlement Independence

When an interaction authorizes an economic outcome, the execution mechanism may translate that outcome into its own technical representation.

It may not change what was authorized.

A settlement provider may know how to construct the transaction for a particular network.

That provider does not gain the right to decide that a different beneficiary, amount, or economic disposition is close enough.

Execution translates meaning.

It does not redefine meaning.

## 6.4 Assertions Are Not Truth

The Kernel also establishes an important supporting rule.

An **Assertion** is an attributable statement submitted for evaluation inside an interaction.

An assertion may later prove relevant, irrelevant, correct, incorrect, or contradictory.

Submission makes it part of the interaction's record.

It does not make it true.

This gives Sails a foundation for dealing with participant statements, payment claims, provider observations, signed decisions, agent recommendations, and evidence submitted during a dispute.

---

# 7. Stable Semantics, Replaceable Edges

The Semantic Kernel leads to a simple design principle:

> **Stable semantics, replaceable edges.**

Around the semantic center, many technologies may change.

Identity mechanisms may change. Transport may change. Settlement mechanisms may change. Wallet infrastructure may change. Liquidity sources may change. Agent runtimes may change. Storage and deployment models may change.

A protocol that depends for its identity on today's favored framework or provider will eventually confuse implementation history with protocol design.

Sails attempts to avoid that.

This is why technologies such as WDK, Pears, and QVAC are important to the current ecosystem without being the definition of the protocol.

They provide capabilities.

They are not the semantic constitution.

---

# 8. Architecture

The current Sails architecture is easiest to read as a semantic center surrounded by replaceable execution edges:

```text
Applications / Interfaces
          │
          ▼
SDK / Integration Surface
          │
          ▼
    Semantic Kernel
          │
          ▼
      Pure Core
          │
          ▼
        Runtime
          │
          ▼
        Modules
          │
          ▼
 Providers / Adapters
          │
          ▼
     External World
```

The **Semantic Kernel** defines the minimum properties that must remain true for an implementation to still preserve Sails' identity. The **Pure Core** evaluates economic semantics. **Runtime** owns orchestration, persistence boundaries, ordering and recovery. **Modules** own domain responsibilities. **Providers and adapters** translate those semantics into external mechanisms.

Applications, SDKs, and interfaces consume this architecture without becoming semantic authorities over it.

This diagram is an explanatory map, not protocol truth. If it conflicts with the Semantic Kernel, Protocol Invariants, Protocol Specification, accepted ADR/RFCs, or current implementation evidence, the governing source wins.

## 8.1 Pure Core

Sails Core is designed as a pure semantic evaluator.

It does not fetch network data, write databases, dispatch settlement, retry providers, or control user interfaces.

Given the semantic material required for a candidate transition, Core evaluates whether that transition is valid and derives any authorized economic outcome.

Its purpose is to give questions such as **Is this transition valid?**, **Who authorized this discretionary action?**, and **What outcome was actually authorized?** one stable home.

## 8.2 Runtime

Runtime operationalizes the decisions.

It assembles Core inputs, establishes ordering, commits authoritative records and state, dispatches external effects, manages retries, and participates in recovery.

Core can decide semantic validity without becoming an operational system.

Runtime can perform operational work without being allowed to redefine semantic truth.

## 8.3 Modules

Modules provide domain meaning.

A P2P trading module knows what trades, disputes, and settlement conditions mean in that domain.

Another future domain may define different states and conditions.

Modules can evolve without forcing Core to learn every product-specific business concept.

## 8.4 Providers

Providers execute concrete capabilities.

A provider may construct a transaction, collect signatures, submit to a settlement mechanism, and report what occurred.

A provider may not, by virtue of execution capability alone, invent economic authority, redefine the authorized outcome, decide protocol validity, or convert its own report into unquestionable world truth.

## 8.5 Adapters

Adapters translate between Sails-facing semantics and external systems.

Adapter and Provider are related concepts, but they should not be collapsed.

One describes translation across boundaries. The other supplies a concrete capability or execution mechanism.

The exact runtime composition can vary. The conceptual distinction should survive.

---

# 9. From Intent to Economic Outcome

A typical economic interaction can be understood through a lifecycle such as:

```text
Intent
  ↓
Discovery
  ↓
Negotiation
  ↓
Eligibility
  ↓
Authority
  ↓
Settlement
  ↓
Evidence
  ↓
Outcome
  ↓
Reputation / Economic History
```

This is not a universal state machine.

Different modules and rulesets can produce different interaction paths.

Some transitions do not produce a settlement outcome at all. Some interactions may remain purely informational. Others may require external action or dispute resolution.

The value of the lifecycle is to show that settlement is only one stage of economic coordination.

Moving value is not the same problem as deciding **why that value is allowed to move**.

---

# 10. Business Rules, State, Authority, and Policy

Economic coordination becomes easier to reason about when several questions are kept separate.

## 10.1 Business Rules: What May Happen?

Business rules define what actions or outcomes are valid under the domain.

## 10.2 State and Lifecycle: How Does It Change?

State describes where an object currently is. Lifecycle describes which transitions are meaningful.

A system may have the right business rule and still implement an unsafe lifecycle.

Sails treats lifecycle as its own architectural domain rather than incidental application code.

## 10.3 Authority: Who May Cause the Change?

A transition may be valid in principle but still require a specific actor.

This produces important distinctions:

> **Identity ≠ Authority.**
>
> **Authentication ≠ Authorization.**
>
> **Technical Capability ≠ Protocol Permission.**
>
> **Protocol Permission ≠ Economic Authority.**
>
> **Capability Grant ≠ Economic Consent.**
>
> **Recommendation ≠ Authority.**
>
> **Agent Access ≠ Agent Authority.**
>
> **Economic Disposition Authority ≠ Destination Authority ≠ Execution Authority.**

## 10.4 Policy, Eligibility, and Risk: Under Which Conditions May Something Participate?

A system may technically support an operation without currently allowing it.

A provider may exist but be unavailable. A settlement scope may be part of the product target but have no implementation. A participant may be authenticated but not eligible for a particular role. A capability may exist but lack permission.

This is why Sails preserves distinctions such as:

> **Structural Compatibility ≠ Eligibility.**
>
> **Registration ≠ Availability.**
>
> **Availability ≠ Health.**
>
> **Health ≠ Production Eligibility.**

The current eligibility architecture remains incomplete in some settlement paths, and this paper does not present it as fully solved.

---

# 11. Time, Concurrency, and Recovery

Economic systems operate over time.

An event may arrive late. A user may retry. A participant may disappear. A signer may disappear. An arbiter may become unavailable. A capability may be revoked while an operation is in flight. A provider may broadcast a transaction and fail before reporting success. Two valid-looking operations may race.

These problems cannot safely be reduced to HTTP retries.

They are economic lifecycle problems.

**Status: In Validation.**

Temporal and Concurrency architecture is an active engineering domain in Sails.

The project already contains concrete concurrency controls and reconciliation mechanisms in specific paths, but this paper does not claim that one universal temporal model is fully frozen across the protocol.

That work includes delayed events, duplicate events, reordered events, expiry, timeout, stale authority, ambiguous outcomes, reconciliation, disappearing actors, and rail-specific timing.

---

# 12. Evidence and Reconstructable Economic Truth

A serious economic system must be able to reconstruct what happened without confusing state, assertions, evidence, external observations, authorized outcomes, and execution reports.

An assertion records what some actor or mechanism submitted.

Evidence gives an evaluator material to consider.

An authorized outcome says what the system determined may economically happen.

A provider report says what an execution mechanism observed or claims to have done.

These should not be collapsed.

An external payment screenshot is not automatically proof.

A provider's success response is not necessarily final economic truth.

An AI model's confidence score is not evidence of authority.

A blockchain transaction is evidence that execution happened, but additional semantics may still be needed to determine whether it matched the authorized outcome.

The current Sails OpenProof implementation provides real claim, proof, verification, and evidence capabilities, while the broader **Evidence / Auditability** architecture remains an active engineering domain rather than a finished universal framework.

Several distinctions are now explicit:

> **Evidence bytes ≠ Evidence truth.**
>
> **Evidence availability ≠ Evidence integrity.**
>
> **Authentication ≠ Evidence Authorization.**
>
> **Valid evidence ≠ authorized evidence placement.**
>
> **Evidence storage provider ≠ protocol authority.**

Real media/file evidence belongs on the OpenProof path rather than being smuggled into lightweight dispute metadata. Production storage is being hardened behind a provider-neutral contract with durability, privacy, integrity verification, outage semantics and provenance requirements. That work is still under active Day-0 validation; an adapter existing is not the same claim as live production-provider evidence.

**Status: In Validation.**

Sails already has evidence mechanisms.

Sails does not claim that every external-world truth problem has been solved.

---

# 13. Settlement Is a Capability, Not the Protocol

Sails is not a settlement network.

It coordinates settlement capabilities.

## 13.1 Asset ≠ SettlementRail

An Asset is the economic unit.

A SettlementRail is the network or protocol domain through which that asset is represented and settled.

The current Day-0 architecture models **Asset + SettlementRail** as separate product dimensions.

## 13.2 SettlementRail ≠ SettlementProvider

A rail defines where or how settlement occurs.

A provider is an implementation capable of executing against a supported scope.

## 13.3 SettlementProvider ≠ SettlementAdapter

A provider supplies capability.

An adapter translates between systems or semantic representations.

An implementation may combine both roles internally, but the architecture should not confuse them conceptually.

## 13.4 Product Scope ≠ Provider Maturity

A settlement scope may legitimately belong to the Day-0 target while having no provider yet.

That means **part of Product Scope** does not mean **implemented**, and **implemented** does not mean **production eligible**.

The architecture intentionally separates identity, capability, maturity, availability, and eligibility.

---

# 14. Humans, Wallets, Applications, and Agents

A coordination protocol serves more than one kind of consumer.

A human may need a simple decision. A wallet needs typed integration surfaces. An operator needs infrastructure visibility. An agent needs machine-readable state. A dispute arbiter needs the material relevant to one decision.

These consumers do not need identical interfaces.

They need compatible views of the same economic reality.

> **One economic reality, multiple actor-specific experiences.**
>
> **Visibility ≠ Authority ≠ Economic Entitlement.**

A user interface may simplify. It may not rewrite truth.

An integrator may expose fewer details. It may not invent new economic semantics.

An agent may process more data. That does not grant it additional authority.

---

# 15. Intelligence Without Sovereignty Loss

AI creates an obvious temptation in financial systems.

If an agent can interpret context, predict risk, and generate a recommendation, why not let it execute?

The answer is that intelligence and authority solve different problems.

Sails therefore preserves several boundaries:

> **Intelligence ≠ Authority.**
>
> **Recommendation ≠ Authorization.**
>
> **Inference ≠ Evidence.**
>
> **Model confidence ≠ Protocol truth.**

QVAC is currently used as a local-intelligence capability in the Sails ecosystem.

Its importance is not that Sails becomes an AI protocol.

Its importance is that intelligence can participate without becoming the semantic authority of the protocol.

An agent can observe, interpret, propose, prepare, and assist negotiation.

Those actions do not automatically entitle it to authorize irreversible economic outcomes.

---

# 16. OpenAgents

OpenAgents is the architectural area where this distinction becomes most visible.

```text
Principal
   ↓
Mandate / Delegation
   ↓
OpenAgent
   ↓
Negotiation
   ↓
Eligibility + Authority Gate
   ↓
Execution
```

The long-term principle is:

> **Human-authorized autonomy, machine-executed negotiation.**

Future autonomy must not be confused with today's implementation.

## 16.1 Assistive Agent

**Implemented / current direction.**

QVAC-backed agent functionality can generate structured intents, proposals, and risk analysis while requiring human authority for consequential economic action.

## 16.2 Autonomous Negotiation

A future agent may negotiate more of the interaction while remaining unable to create new economic authority.

## 16.3 Delegated-Authority Agent

**Future Vision / not currently authorized as Day-0 behavior.**

A future agent could act within an explicit, scoped, observable, revocable, and auditable mandate.

That requires dedicated authorization semantics.

---

# 17. Portable Reputation and Economic History

Before reputation can be portable, identity boundaries must remain explicit.

Sails does not require one universal "Sails ID." The current architecture separates:

```text
Funds Authority ≠ Economic Identity ≠ Transport/Communication Identity
Identity ≠ Authority
Same recovery root ≠ same private key across protocols
```

The **Sails Participant** is the economic participant in Sails semantics. Pears/HyperDHT is a transport implementation in the current Reference Implementation, not the participant's economic identity and not protocol authority. External ecosystems such as Nostr and Pubky may be recognized or bound through future accepted interoperability designs, but they are optional edges rather than mandatory Sails identity layers.

Reputation is valuable because economic interactions have memory.

Traditional platforms often make that memory proprietary.

Sails is designed around a different direction: economic reputation should not inherently belong to one application.

The current OpenReputation implementation already ties reputation to participant identity rather than to a presentation layer.

That is real.

What is not yet proven is universal portability across multiple independent implementations.

These claims should remain separate.

### Current implementation

Reputation exists as a real protocol capability.

### Portability architecture

The identity and semantics are designed not to depend on one UI or one wallet.

### Future interoperability

Independent applications recognizing and reusing that history is the larger ecosystem outcome.

Economic history may eventually include successful interactions, disputes, outcomes, attestations, evidence, and behavior over time.

Sails should not turn this into a universal social score.

Reputation must remain bounded by explicit rules, sovereignty, and privacy.

---

# 18. Sails P2P Trading SDK

Sails deliberately chose P2P trading as its first concrete product.

Not because P2P trading is the final scope of the protocol.

Because it is a demanding proving ground.

A serious P2P interaction forces an architecture to confront discovery, negotiation, counterparty risk, authority, evidence, payment uncertainty, settlement, disputes, reputation, retries, disappearance, and external-world ambiguity.

A protocol that cannot survive these questions in one concrete domain has little basis for claiming it can coordinate more abstract forms of economic activity later.

The **Sails P2P Trading SDK** is therefore the first developer-facing product built around Sails.

Its public API is independently governed by the SDK's frozen contract, not by this Whitepaper.

The Whitepaper explains why the system exists.

The SDK defines how an integrator uses one concrete product built on it.

---

# 19. What an Integrator Gets

A wallet integrating Sails should not have to become a protocol research team.

Without shared infrastructure, a wallet that wants to offer P2P economic interaction may need to build and maintain offer discovery, marketplace logic, negotiation infrastructure, evidence handling, settlement coordination, dispute flows, reputation, agent and risk tooling, recovery behavior, and integration semantics.

Sails attempts to make these capabilities reusable.

The wallet still owns what should remain its own: its brand, user relationship, interface, custody architecture, product decisions, and obligations specific to its jurisdiction or business model.

Sails supplies coordination infrastructure.

The SDK is the integration surface.

This is why **Why integrate?** is a business question as much as an engineering question.

An elegant protocol that nobody has an economic reason to integrate remains an internal architecture.

---

# 20. Reference Implementations

Sails Protocol is not Satsails Wallet.

Sails Protocol is not Sails Market.

A reference implementation is valuable precisely because it is not the protocol itself.

It gives architecture contact with reality.

The current institutional model treats Satsails as the first validation environment for Sails, while other product surfaces can exercise the same underlying semantics from different application shapes.

```text
Sails Protocol
     │
     ├── Satsails Wallet
     ├── Sails Market
     ├── future wallets
     ├── partner applications
     └── future agent surfaces
```

The protocol should be able to survive the multiplication of interfaces.

---

# 21. One Market, Many Interfaces

A shared economic market should not require one canonical screen.

Satsails may present an interaction one way. Sails Market may present it another way. A partner wallet may reduce the workflow to three screens. An agent may use no human interface at all during negotiation.

These differences are acceptable if they remain compatible with the same underlying economic state, authority, and outcomes.

Sails also separates **market access policy** from **protocol semantics**.

An open/public market may allow multiple independent operators to participate in a shared economic market universe. A private, closed, or permissioned market may restrict discovery or participation for an OTC desk, business, community, professional group, or other bounded context. Both can preserve the same Sails economic semantics.

Therefore:

```text
Market admission policy ≠ protocol truth
Private market ≠ different economic semantics
Private visibility ≠ public identity requirement
Node choice ≠ market membership
```

> **Interfaces may multiply; market contexts may differ; semantics must not.**

This is an editorial expression of the existing architecture, not a new protocol invariant.

---

# 22. Sails Infrastructure

Protocol and infrastructure should not be confused.

A Sails Protocol implementation may involve nodes, application or API servers, transports, databases, settlement providers, adapters, and external networks.

These are implementation responsibilities.

They do not all have the same trust boundary or authority.

A Sails Node is not identical to the protocol.

A transport is not identical to a node.

An API server is not automatically semantic authority.

A provider executing a settlement is not the same thing as the ruleset that authorized it.

The Day-0 topology target is explicitly multi-operator: more than one independent Sails node/runtime operator should be able to participate in the same economic market universe. Node selection is intended to be a service-level choice, not the definition of market membership. The current Reference Implementation has not yet fully demonstrated that target; significant economic state remains node-local and the required cross-node/shared-market evidence is still part of the Day-0 gate.

This is also why words such as **decentralized** should be used carefully.

Using a P2P transport does not automatically decentralize every authority, persistence, or execution path in the system.

Sails is better described by the concrete boundaries it preserves than by a broad decentralization label.

---

# 23. Technologies as Capabilities

Technology matters.

Architecture should still survive technology replacement.

## 23.1 WDK

WDK provides wallet and settlement-related capabilities in current reference implementations.

WDK is not Sails Core.

## 23.2 Pears

Pears provides peer-to-peer transport/communication capabilities in the current Reference Implementation.

Pears transport identity is separate from the Sails Participant/economic identity. Current implementation usage must not be interpreted as a mandatory protocol identity layer or as proof that transport reachability equals economic authority.

Pears is not the protocol's semantic identity.

## 23.3 QVAC

QVAC provides local intelligence capabilities.

QVAC does not become an economic authority simply because it can infer or recommend.

## 23.4 Settlement technologies

Bitcoin, EVM-based networks, Arkade, Liquid, Spark, and other settlement technologies can provide different execution capabilities where real providers and product eligibility exist.

The Asset / SettlementRail architecture exists specifically so product scope is not reduced to one flattened list of vendor-specific identifiers.

## 23.5 Other integrations

Technologies such as Nostr, Pubky, and other identity, transport, communication or interoperability systems may participate where they fit a real capability.

They remain optional and replaceable unless a future accepted protocol decision explicitly says otherwise. Recognizing an external identity must not silently convert it into economic authority.

They should not become mandatory simply because they are adjacent to the ecosystem.

> **Adopt capabilities, not dependencies as architecture.**

---

# 24. Adaptive Execution

Once multiple execution paths exist for the same economic intent, a new question appears:

> Which path should the system use?

Sails is designing this as an adaptive execution problem, not merely a provider router.

> **One intent. Many possible paths. One economic truth.**

The system may eventually adapt execution based on factors such as capabilities, eligibility, policy, cost, liquidity, availability, or user preferences.

It may not adapt the meaning of what the actor authorized.

This area is only partially implemented.

Today, canonical settlement registries exist and the system can resolve the bounded case where exactly one structurally compatible candidate exists.

There is not yet a general production selection engine for multiple eligible execution candidates.

That is deliberate.

The current architecture explicitly refuses to invent scoring logic before a real multi-candidate case exists.

**Status: In Validation / bounded implementation.**

---

# 25. Learning From Existing P2P Systems

Sails does not exist in a vacuum.

Long-running P2P systems have already demonstrated that serious economic coordination eventually encounters problem classes that early prototypes often avoid.

Examples include Bisq, Hodl Hodl, Mostro, RoboSats, Peach Bitcoin, OpenBazaar, and Anoma.

The useful question is not which project has more features.

It is:

> Which problem classes does every serious P2P economic system eventually have to solve?

These include no-shows, griefing, economic spam, dispute handling, evidence, recovery, participant disappearance, signer disappearance, arbiter disappearance, provider failure, delayed events, settlement timing, reconciliation, and unsafe capability exposure.

Sails uses these systems as architectural evidence.

It should not claim greater operational maturity than systems that have spent years in production merely because Sails models more abstractions.

> **Production-informed architecture before production maturity.**

---

# 26. Economic Model

A coordination protocol also needs sustainable economic participation.

Sails does not require a native speculative token.

The current protocol economy is designed around economic activity using existing settlement assets, while business-layer services remain conceptually separate from the protocol's core fee architecture.

Potential ecosystem participants include protocol infrastructure, wallet and application integrators, node or infrastructure operators, liquidity providers, settlement providers, market operators, arbitration providers, and future agent and provider ecosystems.

The core economic principle is that value capture should follow useful operations rather than simple user existence.

A participant should not owe a protocol fee merely for having an identity.

Economic value capture becomes relevant when infrastructure coordinates real economic activity.

Not every mechanism described in the broader economic architecture is currently implemented.

Revenue mechanisms such as enterprise services, commercial API tiers, and future provider ecosystems belong to business or roadmap layers unless implementation evidence says otherwise.

---

# 27. Network Effects

A shared coordination protocol has a potential network effect that an isolated marketplace cannot reproduce by itself.

```text
More integrations
      ↓
More participants
      ↓
More intents and offers
      ↓
More counterparties and interactions
      ↓
More economic history
      ↓
More useful trust signals
      ↓
More useful market
      ↓
More integrations
```

This is a structural thesis.

It is not yet a demonstrated ecosystem flywheel.

One reference implementation can validate mechanisms.

A network effect requires independent participants and independent interfaces actually joining the same economic environment.

The architecture is designed to make that possible.

Adoption must prove that it happens.

---

# 28. Human Interface

A protocol only becomes useful when a human or machine can act through it.

Good product design does not expose architecture merely because the architecture exists.

A person attempting a trade should experience the economic action, not every provider abstraction, state machine, or settlement adapter.

But simplification has a limit.

The interface must not hide facts that materially affect sovereignty, authority, uncertainty, or economic consequence.

> **Hide complexity, preserve truth.**
>
> **Progressive disclosure, constant sovereignty.**
>
> **User experiences economic action, not architecture.**

Human Interface Engineering remains an active institutionalization area.

**Status: In Validation.**

---

# 29. How Sails Is Engineered

Sails is developed with extensive use of AI-assisted engineering.

It is not developed by treating AI output as architecture authority.

The project's Engineering Governance defines a model in which architecture may always be challenged but may not be silently redefined.

Product, Protocol, Architecture, Security, UX, and Engineering constrain the same change rather than operating as isolated hand-off stages.

```text
MISSION
  ↓
EVIDENCE
  ↓
DURABLE INSPECTABILITY
  ↓
CTO GATE
  ↓
FREEZE
  ↓
BACKLOG DELTA
  ↓
PROJECT SYNC
  ↓
NEXT MISSION
```

This works alongside:

```text
Discover
→ Specify
→ Design
→ Build
→ Verify
→ Ship
→ Learn
```

A passing build proves that code compiles and tests passed.

It does not prove that the architecture is correct.

A merged PR proves that a change entered the repository.

It does not automatically prove the property the change was supposed to establish.

Implementation is evidence.

Implementation is not truth by itself.

---

# 30. AI as Executor, Not Architecture Authority

The same boundary Sails applies to runtime agents also appears in how the project itself is engineered.

An AI executor can inspect, implement, test, challenge, propose, and compare evidence.

It does not receive unilateral authority to redefine protocol semantics, architectural invariants, product truth, economic authority, or security assumptions.

This is important because AI-assisted development makes it easy to produce large amounts of apparently coherent software.

Volume is not architecture.

A system becomes reliable only when decisions remain inspectable, attributable, and challengeable.

The **Sails Engineering Harness** and a future **QVAC Runtime Harness** therefore solve different problems.

The first governs humans and machines building Sails.

The second governs agents operating inside Sails.

Neither should silently become the other.

---

# 31. Day-0 Reality

Sails separates current reality from architectural ambition.

## Implemented

Real code exists for the described capability.

This does not automatically mean production eligible.

## Frozen

An architecture, semantic rule, or decision has passed its institutional gate and should not be silently reinterpreted.

Implementation may still be incomplete.

## In Validation

The domain exists and active engineering work is determining or validating its final architecture.

## Day-0 Decision Required

The system cannot responsibly claim complete Day-0 behavior until a decision is made.

## Roadmap

A planned direction with enough substance to track, but not current product truth.

## Future Vision

A long-term architectural or ecosystem possibility.

| Area | Current editorial status |
|---|---|
| Semantic Kernel | **Frozen** |
| Pure Core architecture | **Frozen** |
| Core implementation program | **Implemented / continuing migration** |
| P2P Trading SDK public surface | **Implemented / frozen contract by tier** |
| Asset + SettlementRail architecture | **Frozen** |
| Settlement-scope/provider registries | **Implemented** |
| General multi-candidate execution selection | **In Validation / not implemented** |
| Settlement eligibility pipeline | **In Validation / incomplete** |
| Production evidence-provider durability / provenance | **In Validation — implementation hardening active; live provider evidence not yet claimed** |
| Multi-operator shared-market topology | **Frozen Day-0 target / external reality evidence incomplete** |
| Assistive QVAC agents | **Implemented** |
| Delegated economic agent authority | **Future Vision / not Day-0 authorized** |
| Temporal / Concurrency architecture | **In Validation** |
| Evidence / Auditability architecture | **In Validation** |
| Human Interface Engineering | **In Validation** |
| General Engineering Maturity Benchmark | **Roadmap** |

This paper intentionally avoids converting those distinctions into one word such as **ready**.

Maturity is multidimensional.

---

# 32. Open Engineering Domains

Several important areas remain open or partially resolved.

This section exists because hiding them would make the paper weaker, not stronger.

## 32.1 Temporal / Concurrency

The architecture must still fully institutionalize how time, retries, stale authority, races, and disappearance interact across every economic path.

## 32.2 Evidence / Auditability

Evidence mechanisms exist, but the general evidence architecture is still being developed.

## 32.3 Human Interface Engineering

The actor model and several UX principles are institutionalized, while the complete human-interface engineering discipline is still being finalized.

## 32.4 OpenAgents Day-0

Assistive agents are real.

The exact Day-0 boundary for more autonomous negotiation and delegated execution remains constrained by authority architecture.

## 32.5 Settlement Eligibility

Structural compatibility and scope registries exist.

The complete runtime eligibility pipeline is not yet universal.

## 32.6 Runtime Provider Availability

Registration does not automatically mean availability or health.

These remain distinct operational concerns.

## 32.7 Recovery and Participant Disappearance

Recovery mechanisms exist in bounded paths.

Broader behavior for cases such as provider, signer, or arbiter disappearance remains part of Day-0 resilience work.

The public Whitepaper does not need to publish sensitive exploit mechanics to acknowledge these domains.

It does need to avoid writing as though they do not exist.

---

# 33. From Economic Coordination Protocol to Economic Coordination Operating System

The current category is:

> **Economic Coordination Protocol.**

A useful architectural description is:

> **Economic Coordination Layer.**

A broader long-term mental model is:

> **Economic Coordination Operating System.**

These terms should not be collapsed.

Calling Sails an Economic Coordination Operating System today as a normative definition would imply a level of ecosystem breadth the current system has not yet earned.

But the analogy becomes useful as a direction.

An operating system does not need every application to be the same.

It provides stable abstractions through which different applications, devices, and processes can coexist.

In the same way, an economic coordination system could eventually let wallets, marketplaces, humans, autonomous agents, liquidity providers, settlement providers, and applications participate through shared economic semantics without giving up their own interfaces and infrastructure.

If that ecosystem emerges, Sails may increasingly function like an operating system for economic coordination.

That is a vision.

The protocol is how we attempt to make that vision technically possible.

---

# Conclusion

Every wallet today is an island.

But the deeper problem is not the wallet.

It is the fragmentation of economic meaning.

One application knows the participant. Another knows the reputation. Another holds the offer. Another sees the settlement. Another runs the agent. Another knows what was authorized.

When these systems cannot share enough meaning, interoperability stops at moving bytes or assets.

Sails Protocol is an attempt to move the boundary further.

The goal is not to make every wallet, blockchain, provider, or agent identical.

The goal is to let them remain different while preserving the same economic interaction.

That requires more than routing.

It requires valid transitions. Attributed discretion. Stable outcome meaning. Explicit authority. Evidence that is not confused with truth. Execution that does not rewrite authorization. Interfaces that simplify without becoming semantic authorities. Intelligence that assists without silently taking sovereignty. And an architecture capable of surviving the replacement of the technologies around it.

The first proof is deliberately concrete:

**Sails P2P Trading SDK.**

The category is broader:

**Economic Coordination Protocol.**

The architectural idea is simple:

> **Different stacks. Shared economic meaning.**

And the long-term possibility is larger still: an ecosystem where humans, applications, and machines can coordinate economic value through shared semantics without first surrendering their infrastructure, interfaces, or sovereignty to a single platform.
