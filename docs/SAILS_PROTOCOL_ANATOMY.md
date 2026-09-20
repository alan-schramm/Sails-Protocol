# Sails Protocol — Anatomy

> **Status:** Draft / CTO-owned consolidated anatomy map.  
> **Purpose:** Explain what composes Sails, where each part belongs, how the parts relate, and where each concept is governed.  
> **Authority rule:** This document is a map, not a replacement for its governing sources. If a summary here conflicts with a canonical source, the canonical source wins.
>
> **Constitutional reading:** **New technologies should expand capability, not rewrite semantics.**

---

## 1. Purpose & Scope

Sails Protocol is an [Economic Coordination Protocol](PROJECT_CONTEXT.md) whose V1 focus is open infrastructure for interoperable P2P financial marketplaces.

This document answers a different question from [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md):

- **System Design** explains the current technical architecture and how the system operates.
- **Anatomy** explains the complete body of Sails: its semantic constitution, software organs, extension surfaces, execution edges, economic boundaries, products, and the canonical source that governs each part.

The Anatomy is intended to be the consolidated source from which explanatory material — articles, website copy, diagrams, presentations, educational material and social content — can be derived without flattening architectural distinctions.

### 1.1 Governing-source rule

Every material concept in this document links to its deeper source. Anatomy summarizes and connects; it does not silently redefine.

Primary authorities include the [Semantic Kernel](SEMANTIC_KERNEL.md), [Protocol Invariants](PROTOCOL_INVARIANTS.md), [Protocol Specification](PROTOCOL_SPECIFICATION.md), [Core Architecture](CORE_ARCHITECTURE.md), accepted [ADRs](adr/), accepted [RFCs](rfcs/), and current implementation/evidence sources such as [BACKLOG.md](BACKLOG.md).

---

## 2. Architectural Thesis

Sails is organized around a simple architectural discipline:

> **Stable semantics, replaceable edges. Simple at center, open at edges.**

The [Semantic Kernel](SEMANTIC_KERNEL.md) defines what must remain true for something to remain Sails. The [Pure Core](CORE_ARCHITECTURE.md) materializes those semantics as deterministic evaluation. Runtime, Modules, Providers and Adapters surround that stable center without acquiring permission to redefine its economic meaning.

A useful adoption expression from the repository is:

> **Keep your wallet stack; plug into Sails.**

The broader extension principle is documented by [External Extensibility Precedent Consolidation](EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md):

> **Open extension. Stable semantics. Governed compatibility.**

### 2.1 Whole-body map

```mermaid
flowchart TB
    APPS["Applications / Integrators<br/>Sails Market · Satsails Wallet · Third-party apps"]
    SDK["SDKs / Integration Surfaces"]
    EXT["Open Extension<br/>stable semantics · governed compatibility"]

    subgraph BODY["Sails Protocol"]
      SK["Semantic Kernel<br/>K1 · K2 · K3 + Assertion rule"]
      CORE["Pure Sails Core<br/>semantic evaluator"]
      RT["Runtime<br/>orchestration · persistence · recovery"]
      MOD["Modules / Open* Building Blocks"]
    end

    subgraph EDGES["Replaceable execution edges"]
      AD["Adapters"]
      PR["Providers"]
      TR["Transport / Discovery"]
    end

    subgraph WORLD["External execution world"]
      RAIL["Settlement Rails / Networks"]
      INFRA["Storage · transport · external infrastructure"]
    end

    APPS --> SDK
    SDK --> EXT
    EXT --> SK
    SK --> CORE
    CORE --> RT
    RT --> MOD
    MOD --> AD
    MOD --> PR
    MOD --> TR
    AD --> RAIL
    PR --> RAIL
    PR --> INFRA

    EXT -. "governs participation at replaceable edges" .-> AD
    EXT -. "governs participation at replaceable edges" .-> PR
    SK -. "constrains all conformant extensions" .-> EXT
```

**Governing sources:** [SEMANTIC_KERNEL.md](SEMANTIC_KERNEL.md) · [CORE_ARCHITECTURE.md](CORE_ARCHITECTURE.md) · [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) · [EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md](EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md)

---

## 3. Protocol Constitution

### 3.1 Semantic Kernel

The [Semantic Kernel](SEMANTIC_KERNEL.md) is semantic identity, not a package. It contains exactly three frozen identity properties plus the supporting Assertion rule:

- **K1 — Valid Transition:** economic state changes only through a satisfied and economically valid condition under the interaction's bound ruleset.
- **K2 — Attributed Discretion:** discretionary judgment must be attributable to a specific actor and bound to the exact interaction and transition.
- **K3 — Semantic Settlement Independence:** execution may translate an authorized outcome into a mechanism, but may not alter its economic meaning.
- **Assertion rule:** an assertion is an attributable, interaction-bound statement; it is never truth by itself.

### 3.2 Constitution and invariants

The current-version constitutional rules are broader than semantic identity. They are governed by [PROTOCOL_INVARIANTS.md](PROTOCOL_INVARIANTS.md) and the normative [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md).

```mermaid
flowchart LR
    K["Semantic Kernel<br/>What must remain true<br/>for Sails to remain Sails"]
    I["Protocol Invariants<br/>Current-version constitution"]
    S["Protocol Specification<br/>Normative primitives & conformance"]
    C["Pure Core<br/>Software materialization"]
    R["Runtime / Modules / Providers<br/>Execution"]

    K --> C
    K --> I
    I --> S
    S --> R
    C --> R
```

**Governing sources:** [SEMANTIC_KERNEL.md](SEMANTIC_KERNEL.md) · [PROTOCOL_INVARIANTS.md](PROTOCOL_INVARIANTS.md) · [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md) · [CORE_ARCHITECTURE.md](CORE_ARCHITECTURE.md)

---

## 4. Integration Freedom — Where Protocol Meaning Begins

Integration freedom ends where protocol meaning begins.

An application, wallet, provider, adapter, transport, AI system, operator or external marketplace may contribute capability. None acquires economic authority merely by being integrated.

This boundary is developed in [External Extensibility Precedent Consolidation](EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md), [Adaptive Execution / Capability Routing](ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md), and the authority ADRs.

```mermaid
flowchart LR
    X["External technology"]
    D["Public Contract / Declaration"]
    C["Constraints / Conformance"]
    E["Evidence"]
    EL["Eligibility"]
    RP["Runtime Participation"]
    SEM["Sails Economic Meaning"]

    X --> D --> C --> E --> EL --> RP
    SEM --> C
    SEM --> EL
    RP -. "cannot redefine" .-> SEM
```

The governed extension lifecycle is:

**External Capability → Public Contract → Capability Declaration → Constraints → Conformance → Evidence → Eligibility → Runtime Participation**

**Governing sources:** [EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md](EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md) · [ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md](ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md)

---

## 5. Open* Building Blocks

The reference architecture defines **eight official modules/capabilities**. Their names are not interchangeable with the nine protocol primitives: modules are service/domain boundaries that implement or orchestrate primitives.

| Module | Anatomical role | Important boundary |
|---|---|---|
| **OpenIdentity** | Portable participant identity and proof-of-control context | Identity/Participant ≠ Authority |
| **OpenReputation** | Outcome-derived reputation and trust signals | Reputation ≠ Protocol Truth |
| **OpenSettlement** | Settlement, escrow and today's Dispute implementation | Settlement mechanism ≠ economic meaning |
| **OpenLiquidity** | Discovery and routing of liquidity; owns the `Offer` domain | Offer belongs here, **not** OpenP2P |
| **OpenProof** | Cross-module Claim → Proof → Verification and evidence infrastructure | Proof/evidence ≠ truth; EvidenceProvider ≠ authority |
| **OpenP2P** | Application module orchestrating the P2P Trade Lifecycle and negotiation | Orchestration does not make it owner of cross-module internals |
| **OpenAgents** | Agent automation/risk/mediation assistance under delegated scope | Agent recommendation/action ≠ independent authority |
| **OpenFinance** | Future Loan/Swap/Earn expansion reusing shared modules | **Aspirational / outside MVP**, not current capability to overclaim |

The repository also groups these modules by present architectural role: OpenIdentity, OpenReputation, OpenSettlement, OpenLiquidity and OpenProof are cross-module services; OpenP2P and OpenAgents are application/cross-cutting capability consumers; OpenFinance is future-facing. This grouping is explanatory architecture, not a new protocol layer.

### 5.1 Primitive ↔ module relationship

A primitive and a module are deliberately not one-to-one. Examples:

- **Identity primitive → OpenIdentity** today.
- **Discovery primitive → OpenLiquidity** for marketplace liquidity discovery.
- **Settlement primitive → OpenSettlement** through rail/provider-specific execution.
- **Reputation primitive → OpenReputation**.
- **Proof primitive → OpenProof**.
- **Dispute primitive → OpenSettlement today**, while the primitive remains reusable by future modules.
- **Negotiation / Trade Lifecycle → OpenP2P orchestration**, consuming shared services rather than owning them all.
- **Agent primitive → OpenAgents**, always under delegation/authority boundaries.

This many-to-many distinction prevents a common anatomy error: treating the Open* names as aliases for primitives.

**Governing sources:** [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) · [ROADMAP.md](ROADMAP.md)

### 5.2 Open Extension is not another Open* module

**Open Extension** is the cross-cutting extensibility principle under which new technologies can participate without rewriting Core meaning. It is not being classified here as an eighth/ninth peer module.

**Governing source:** [EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md](EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md)

---

## 6. Primitives

Protocol primitives belong to the technology-independent contract and are governed normatively by [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md). Anatomy does not redefine their semantics, but it should make the canonical vocabulary visible.

The current specification defines **nine protocol primitives**:

| Primitive | Canonical question |
|---|---|
| **Identity** | WHO is participating |
| **Intent** | WHAT someone wants to happen |
| **Discovery** | WHO ELSE this could happen with |
| **Negotiation** | HOW terms get agreed |
| **Settlement** | HOW value actually moves |
| **Reputation** | WHY to trust a counterparty |
| **Agent** | WHO (or what) acts on someone's behalf |
| **Proof** | HOW a claim gets verified by someone else |
| **Dispute** | HOW a disagreement gets formally resolved |

Two nearby concepts are deliberately **not** protocol primitives: **Capability** and **Policy** are supporting coordination components. The specification also explicitly rejects **Participant**, **Offer**, and **Event** as primitives. In particular, `Participant` is the abstraction referenced by other primitives; `Identity` is the current concrete participant implementation described by the specification.

The important anatomical distinction is:

**Primitive ≠ Module ≠ Provider ≠ Product.**

A primitive is protocol meaning. A Module organizes domain responsibility. A Provider executes or supplies an external mechanism. A Product exposes or consumes protocol behavior.

**Governing source:** [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md)

---

## 7. Capabilities & Authority

Capability describes what an actor/component can participate in; authority determines whether a particular action is authorized.

Mandatory separations include:

**Authentication ≠ Authorization**  
**Identity ≠ Authority**  
**Execution Authority ≠ Economic Disposition Authority**  
**Recommendation ≠ Authority**

Temporal capability authority is governed by [ADR-004](adr/ADR-004-capability-grant-temporal-authority.md). Economic disposition after rulings/appeals is governed by [ADR-005](adr/ADR-005-ruling-generation-economic-disposition-authority.md). Broader authority discovery is recorded in [AUTHORITY_MODEL_DISCOVERY.md](AUTHORITY_MODEL_DISCOVERY.md).

---

## 8. SDKs & Integration Surface

The first concrete developer product is the **Sails P2P Trading SDK**. SDKs expose integration surfaces; they do not own protocol semantics.

The current developer path and contract are documented in [SDK_GUIDE.md](SDK_GUIDE.md), [API_STABLE.md](API_STABLE.md), [API_REFERENCE.md](API_REFERENCE.md), and [SDK Family Release Governance](SDK_FAMILY_RELEASE_GOVERNANCE.md).

**SDK convenience ≠ protocol truth.**

---

## 9. Adapters

Adapters translate between stable Sails-facing contracts and replaceable external implementation stacks. They belong at the edge: an adapter can change *how* a capability is reached without changing *what* the authorized economic meaning is.

Important concrete distinctions include:

**WalletAdapter ≠ SettlementProvider ≠ TransportProvider ≠ EvidenceProvider ≠ ArbitrationProvider ≠ External Wallet Connector.**

- A **Wallet Adapter** bridges a wallet implementation into the wallet-facing Sails contract.
- A **Settlement Provider** executes settlement/escrow mechanics for an eligible Asset × Rail scope.
- A **Transport Provider** moves opaque communication payloads; transport is not economic state.
- An **Evidence Provider** stores/retrieves evidence bytes or references for OpenProof; storage does not make the provider a truth authority.
- An **Arbitration Provider** connects an application to an arbitration mechanism/actor; it does not make the protocol the arbiter.
- An **External Wallet Connector** establishes access/session connectivity and is not thereby a Wallet Adapter or Settlement Provider.

A wallet SDK/package existing in the ecosystem does not itself establish Sails support, maturity or production eligibility.

**Governing sources:** [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) · [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md) · [ROADMAP.md](ROADMAP.md) · [EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md](EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md)

---

## 10. Rails

An Asset, Network/Rail, Wallet Adapter, Settlement Capability, Provider and Production Eligibility are distinct dimensions.

```mermaid
flowchart LR
    A["Asset"]
    N["Network / Rail"]
    W["Wallet Adapter"]
    SC["Settlement Capability"]
    P["Provider"]
    M["Maturity / Evidence"]
    PE["Production Eligibility"]

    A --> N --> SC
    W --> SC
    SC --> P --> M --> PE
```

A shared SDK or implementation does not collapse distinct rails into one capability or one maturity state.

**Governing sources:** [ADR-002](adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md) · [Asset / Settlement Rail Architecture Discovery](ASSET_SETTLEMENT_RAIL_ARCHITECTURE_DISCOVERY_2026-09-12.md) · [ROADMAP.md](ROADMAP.md)

---

## 11. Providers & Nodes

Providers are replaceable execution mechanisms. A provider may execute or report; it may not redefine the authorized economic outcome.

Provider is a family of roles rather than one universal interface. Current architecture includes distinct provider classes such as settlement, evidence, transport, arbitration and liquidity-related providers. Their capability and maturity must be evaluated per contract and per scope.

A Sails node/runtime instance is an **operator surface**, not protocol identity and not a privileged semantic authority. Multiple conformant operators may participate without making one operator the owner of shared semantics.

A crucial Day-0 distinction is that **conformance alone does not prove shared-market reachability**: three perfectly conformant nodes whose liquidity universes remain isolated still fail the shared-market property.

**Provider implementation ≠ Provider maturity ≠ Production eligibility.**  
**Sails Protocol ≠ Satsails server.**

**Governing sources:** [CORE_ARCHITECTURE.md](CORE_ARCHITECTURE.md) · [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) · [ADR-001](adr/ADR-001-day0-multi-operator-network.md) · [Day-0 Multi-Operator Network Architecture Discovery](DAY0_MULTI_OPERATOR_NETWORK_ARCHITECTURE_DISCOVERY.md)

---

## 12. Identity, Proof & Reputation

### 12.1 Participant and portable identity

The protocol specification's important boundary is **Participant before concrete identity technology**. Other primitives reference the abstract `Participant` contract rather than depending directly on one identity format. `Identity` is the current concrete implementation described by the specification.

The positioning term is **Portable Identity Layer**, not “the DID layer.” DID, Nostr identity, Pubky-style identity or future formats may participate as interoperability choices without becoming protocol identity merely because an implementation supports them.

Identity establishes attributable participation and proof of control; it does **not** automatically grant authority.

### 12.2 Proof and evidence

OpenProof handles evidence/proof concerns under explicit authorization, provenance and economic-scope boundaries.

**Evidence bytes ≠ truth.**  
**Storage provider ≠ protocol authority.**  
**Availability ≠ integrity.**  
**Authentication ≠ evidence authorization.**

A Proof/Assertion may become input to an evaluation; it does not acquire truth-status merely by existing or being cryptographically well-formed.

### 12.3 Reputation

Reputation is downstream interpretation of attributable economic facts and evidence, not an alternate source of protocol truth. Cross-node architecture should favor re-verifiable underlying facts/events over treating a precomputed reputation score as globally authoritative.

**Governing sources:** [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md) · [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) · [AUTHORITY_MODEL_DISCOVERY.md](AUTHORITY_MODEL_DISCOVERY.md) · [CRYPTOGRAPHIC_MODEL.md](CRYPTOGRAPHIC_MODEL.md) · [TRUST_BOUNDARY.md](TRUST_BOUNDARY.md) · [Day-0 Multi-Operator Network Architecture Discovery](DAY0_MULTI_OPERATOR_NETWORK_ARCHITECTURE_DISCOVERY.md)

---

## 13. Discovery & Transport

Discovery answers how participants and markets find relevant economic opportunities or peers. Transport answers how messages move. They are related but anatomically different.

Neither transport nor discovery owns economic state.

**Economic state ≠ transport state.**  
**Connected ≠ Responsive ≠ Synchronized ≠ Economically Current.**  
**Liquidity propagation authority ≠ Settlement authority ≠ Protocol authority.**

The Day-0 multi-operator architecture separates at least four concerns:

- **Discovery plane:** offers, liquidity advertisements, provider capabilities, availability and expiry must be economically reachable across conformant nodes.
- **Coordination plane:** trade initiation and negotiation are primarily counterparty-scoped rather than globally replicated.
- **Economic truth plane:** settlement/evidence/outcome need independent verifiability for the parties that need them; they do not become correct merely by being globally propagated.
- **Identity/reputation plane:** identity assertions need cross-node verifiability; reputation may be derived from bounded, re-verifiable underlying facts rather than requiring a globally synchronized score.

Pears/HyperDHT or another transport may be used by a reference implementation without becoming protocol identity or economic authority.

**Governing sources:** [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DAY0_MULTI_OPERATOR_NETWORK_ARCHITECTURE_DISCOVERY.md](DAY0_MULTI_OPERATOR_NETWORK_ARCHITECTURE_DISCOVERY.md)

---

## 14. Trade Lifecycle & State Machines

A useful end-to-end economic journey is:

```mermaid
flowchart LR
    P["Participant"] --> I["Intent"]
    I --> O["Discovery / Offer"]
    O --> N["Negotiation"]
    N --> T["Trade / Agreed Terms"]
    T --> S["Settlement / Escrow"]
    S --> PAY["Payment / Funding"]
    S --> EV["Evidence / OpenProof"]
    PAY --> D{"Authorized disposition"}
    EV --> D
    D --> R["Release"]
    D --> F["Refund"]
    D --> Q["Dispute / Arbitration"]
    R --> OUT["Economic Outcome"]
    F --> OUT
    Q --> OUT
    OUT --> REP["Reputation / Accounting / Projections"]
```

State transition semantics are governed, not inferred from message arrival order or transport state.

**Governing sources:** [STATE_LIFECYCLE_DISCOVERY.md](STATE_LIFECYCLE_DISCOVERY.md) · [TRANSACTION_WALKTHROUGH.md](TRANSACTION_WALKTHROUGH.md) · [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md)

---

## 15. Public & Private Markets

Sails can support shared/open markets and restricted/private market contexts without changing economic semantics.

For the shared/open Day-0 topology, the frozen property is stronger than “multiple nodes run the same API”:

**Node choice must not partition the economic market.**  
**All conformant Sails Nodes must be able to participate in the same protocol-level liquidity universe.**  
**Shared Market Universe ≠ Instantaneous Identical View.**  
**Eventual propagation ≠ Economic fragmentation.**

Private/closed contexts may restrict admission, discovery or visibility while preserving the same underlying economic semantics.

**Market admission policy ≠ protocol truth.**  
**Private market ≠ different economic semantics.**  
**Private visibility ≠ public identity requirement.**

**Governing sources:** [ADR-001](adr/ADR-001-day0-multi-operator-network.md) · [DAY0_MULTI_OPERATOR_NETWORK_ARCHITECTURE_DISCOVERY.md](DAY0_MULTI_OPERATOR_NETWORK_ARCHITECTURE_DISCOVERY.md)

---

## 16. Cross-App Coordination

Sails is designed so multiple applications can coordinate around shared protocol semantics without one reference application becoming a mandatory gateway.

```mermaid
flowchart TB
    SEM["Shared Sails semantics"]
    M["Sails Market"]
    W["Satsails Wallet"]
    A["Third-party App A"]
    B["Third-party App B"]
    N1["Operator / Node A"]
    N2["Operator / Node B"]

    M --> SEM
    W --> SEM
    A --> SEM
    B --> SEM
    N1 --> SEM
    N2 --> SEM
```

Reference application control does not imply protocol control.

**Governing sources:** [README](../README.md) · [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) · [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) · [ADR-001](adr/ADR-001-day0-multi-operator-network.md)

---

## 17. Trust & Failure Boundaries

Sails treats failure semantics as part of correctness.

Examples of required distinctions include:

**UNKNOWN ≠ FAILED**  
**UNAVAILABLE ≠ INVALID**  
**Missing evidence bytes ≠ evidence never existed**  
**State snapshot ≠ complete economic truth**

Trust boundaries and security assumptions are governed by [TRUST_BOUNDARY.md](TRUST_BOUNDARY.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [THREAT_MODEL.md](THREAT_MODEL.md), and specialized evidence/recovery documents.

---

## 18. Economic Safety

Economic safety requires authority, state, persistence and external side effects to preserve the authorized meaning across concurrency, retries, crashes and recovery.

A retry does not create new authority. A provider does not acquire authority because it can execute. A later mechanism does not get to reinterpret an earlier authorized outcome.

**Governing sources:** [CORE_ARCHITECTURE.md](CORE_ARCHITECTURE.md) · [ADR-004](adr/ADR-004-capability-grant-temporal-authority.md) · [ADR-005](adr/ADR-005-ruling-generation-economic-disposition-authority.md) · [SECURITY_MODEL.md](SECURITY_MODEL.md)

---

## 19. Conformance & Replaceability

Replaceability is safe only when semantic compatibility is governed.

```mermaid
flowchart LR
    CONTRACT["Stable contract"]
    CONF["Conformance"]
    EVID["Evidence"]
    ELIG["Eligibility"]
    EXEC["Replaceable implementation"]
    MEANING["Stable economic meaning"]

    CONTRACT --> CONF --> EVID --> ELIG --> EXEC
    MEANING --> CONTRACT
    EXEC -. "must preserve" .-> MEANING
```

**Compatible code ≠ trusted code.**  
**Protocol-representable ≠ Product/Deployment-eligible.**  
**Implementation existence ≠ production evidence.**

**Governing sources:** [EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md](EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md) · [ENGINEERING_GOVERNANCE.md](ENGINEERING_GOVERNANCE.md) · [TEST_HARNESS_RELIABILITY.md](TEST_HARNESS_RELIABILITY.md)

---

## 20. Protocol vs Product

Sails Protocol, Sails Market and Satsails Wallet are different things.

- **Sails Protocol** owns shared economic coordination semantics.
- **Sails P2P Trading SDK** is the first concrete developer product/integration surface.
- **Sails Market** is a first-party/reference market application.
- **Satsails Wallet** is a first-party/reference integrator and validation environment.
- **Third-party applications** may consume Sails without surrendering product ownership or becoming subordinate to a first-party UI.

**No interface or reference implementation owns protocol semantics.**

**Governing sources:** [README](../README.md) · [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) · [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)

---

## 21. End-to-End Examples

Concrete developer and transaction examples should remain derived from verified public surfaces rather than duplicated here.

Start with:

- [Getting Started](GETTING_STARTED.md)
- [Simple Wallet example](../examples/simple-wallet/)
- [SDK Guide](SDK_GUIDE.md)
- [Transaction Walkthrough](TRANSACTION_WALKTHROUGH.md)
- [API Reference](API_REFERENCE.md)

Future Anatomy revisions may add short explanatory examples only when they can remain traceable to these verified paths.

---

## 22. Architecture Diagrams

This document intentionally embeds explanatory Mermaid diagrams next to the concepts they explain. Rendered system-level architecture remains available through the repository's architecture-diagram surface.

Every Anatomy diagram is a **reading aid**, never independent protocol truth. Its governing sources are listed immediately below it.

See also [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 23. Implementation Status Matrix

Anatomical existence and implementation maturity are separate claims.

| Anatomical area | Meaning/source status | Implementation/maturity source |
|---|---|---|
| Semantic Kernel | Frozen semantic identity | [SEMANTIC_KERNEL.md](SEMANTIC_KERNEL.md) |
| Pure Core | Frozen architecture; implementation surface exists | [CORE_ARCHITECTURE.md](CORE_ARCHITECTURE.md), [CORE_IMPLEMENTATION_ARCHITECTURE.md](CORE_IMPLEMENTATION_ARCHITECTURE.md) |
| Runtime | Current reference execution layer | [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md), [BACKLOG.md](BACKLOG.md) |
| Open* Modules | Mixed current/roadmap maturity | [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md), [ROADMAP.md](ROADMAP.md), [BACKLOG.md](BACKLOG.md) |
| SDK / API | Published/developer-facing surfaces with explicit release governance | [SDK_GUIDE.md](SDK_GUIDE.md), [API_STABLE.md](API_STABLE.md), [SDK_RELEASE.md](SDK_RELEASE.md) |
| Adapters / Providers | Per-capability maturity; never infer eligibility from existence | [ROADMAP.md](ROADMAP.md), [BACKLOG.md](BACKLOG.md) |
| Multi-operator network | Architecture defined; Day-0 evidence gated | [ADR-001](adr/ADR-001-day0-multi-operator-network.md), [BACKLOG.md](BACKLOG.md) |
| Production-open | **Not yet production-open** | [ROADMAP.md](ROADMAP.md), [BACKLOG.md](BACKLOG.md) |

This table is orientation. Current operational truth belongs to the live backlog/issues/evidence, not to a static Anatomy snapshot.

---

## 24. ADR / Evidence Map

| Question | Governing source |
|---|---|
| What must remain true for Sails to remain Sails? | [Semantic Kernel](SEMANTIC_KERNEL.md) |
| What software architecture materializes the Kernel? | [Core Architecture](CORE_ARCHITECTURE.md) |
| What must a conformant implementation respect? | [Protocol Specification](PROTOCOL_SPECIFICATION.md) |
| What are the current constitutional invariants? | [Protocol Invariants](PROTOCOL_INVARIANTS.md) |
| How do multiple operators share a Sails network? | [ADR-001](adr/ADR-001-day0-multi-operator-network.md) |
| How are asset, rail, adapter and provider separated? | [ADR-002](adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md) |
| How is arbitration scoped to rails? | [ADR-003](adr/ADR-003-rail-scoped-arbitration-policy.md) |
| How does CapabilityGrant temporal authority work? | [ADR-004](adr/ADR-004-capability-grant-temporal-authority.md) |
| How does ruling-generation economic disposition authority work? | [ADR-005](adr/ADR-005-ruling-generation-economic-disposition-authority.md) |
| How may external capabilities enter without rewriting semantics? | [External Extensibility](EXTERNAL_EXTENSIBILITY_PRECEDENT_CONSOLIDATION.md) |
| How does adaptive execution/capability routing fit? | [Adaptive Execution](ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md) |
| Where is current unresolved implementation reality? | [Backlog](BACKLOG.md) |
| What is the current system-level technical entry point? | [System Design](SYSTEM_DESIGN.md) |

---

## Closing Mental Model

```text
Sails identity
    Semantic Kernel
          ↓
Sails meaning in software
    Pure Core
          ↓
Sails execution
    Runtime + Modules
          ↓
Replaceable capability
    Adapters + Providers + Transport
          ↓
External mechanisms
    Rails + Networks + Infrastructure
          ↓
User-facing realization
    SDKs + Sails Market + Satsails Wallet + Third-party applications

Across every layer:
Open Extension may expand capability.
It may not rewrite economic meaning.
```

> **New technologies should expand capability, not rewrite semantics.**