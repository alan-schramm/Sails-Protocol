# Universal Systems Completeness Checklist

**Type:** Institutional Memory / Completeness Discovery / Production Reality  
**Status:** Question framework only. No implementation is authorized by this document.  
**Purpose:** Prevent universal software/system requirements from remaining hidden merely because they are not specific to one Sails module, ADR, provider, rail, or current Master Backlog item.

---

## 1. Why this exists

Sails has strong architecture-specific review processes, but a second class of blind spot exists:

> requirements that are common to almost every serious software system, distributed system, protocol, runtime, financial system, or developer platform.

Examples include:

- error semantics;
- user/developer feedback;
- retryability;
- unknown outcomes;
- idempotency;
- resource bounds;
- configuration failure;
- upgrade compatibility;
- degraded-state visibility;
- backup/restore;
- cancellation;
- timeouts;
- clock correctness;
- partial success;
- recovery;
- safe shutdown;
- version negotiation.

These can be missed precisely because they feel "obvious" or "generic".

This checklist exists to make them explicit and falsifiable.

It is **not** a feature backlog and must not become one automatically.

> **Checklist item ≠ Sails obligation.**

A checklist item becomes a Sails obligation only after:

1. confrontation with current repository truth;
2. duplicate check against existing Institutional Memory / Backlog / ADR / Technical Debt / evidence obligations;
3. Day-0 / beta / production / future-scope classification;
4. CTO decision.

---

## 2. Governing principles

Preserve:

> **Simple at the center. Open at the edges.**

> **Stable semantics, replaceable edges.**

> **Interfaces can multiply. Semantics should not.**

> **Adopt capabilities, not dependencies as architecture.**

> **Complexity must earn its place.**

> **Simple, not simplified.**

> **Do not make the test pass. Make reality pass the test.**

> **OUTPUT ≠ EVIDENCE ≠ PROPERTY ≠ CLAIM.**

The checklist must discover missing properties without turning Sails into a generic framework for every software concern.

---

# 3. Universal completeness domains

Each domain below is a source of questions, not pre-authorized implementation.

## 3.1 Errors & Feedback

Questions:

- Does every meaningful failure have machine-readable semantics?
- Can callers distinguish temporary from permanent failure?
- Can callers distinguish retryable from non-retryable failure?
- Can callers distinguish rejection from unknown outcome?
- Can partial success be represented?
- Is the affected operation/state identifiable?
- Is correlation available without leaking sensitive information?
- Are internal/debug details separated from public-safe details?
- Can independent implementations interpret the same protocol-level error consistently?
- Can UX translate the failure without becoming protocol semantics?
- Can developers programmatically branch on errors without parsing human strings?

Preserve:

> **Error Semantics ≠ Error Transport ≠ User Message.**

Candidate conceptual boundary, not a frozen schema:

```
Protocol / Domain Error Semantics
    ↓
machine-readable code/category
retryability/permanence
affected operation/state
safe structured metadata
correlation/evidence reference where justified
    ↓
Transport representation
    ↓
Implementation / SDK
    ↓
Human UX message
```

Do **not** infer from this section that Sails needs a universal error registry.  
The property must be proven necessary before any abstraction is added.

---

## 3.2 State & Consistency

Questions:

- Are all valid states explicit?
- Are illegal transitions rejected?
- Is stale state detectable?
- Are concurrent operations safe?
- Are duplicate requests safe?
- Is idempotency defined where required?
- Is ordering required, and if so, what defines it?
- Is eventual consistency acceptable for this object?
- Can two conformant implementations converge from the same facts?
- Can an old valid fact incorrectly resurrect state?
- Can local projections diverge without redefining protocol truth?

---

## 3.3 Failure & Recovery

Questions:

- What happens on process crash?
- What happens on restart?
- What happens when a dependency times out?
- What happens when a dependency returns an ambiguous result?
- What happens when the network partitions?
- What happens when one party disappears?
- What happens when a provider is offline?
- What is retry-safe?
- What requires reconciliation instead of retry?
- Can work resume after interruption?
- Is rollback real, or only local-state rollback?
- Can failover create economic amnesia?

Preserve:

> **FAILED CALL ≠ PROVEN NO SIDE EFFECT.**

> **Unknown outcome ≠ failed economic action.**

---

## 3.4 Time

Questions:

- Which semantics depend on wall-clock time?
- What happens under clock skew?
- Are expiries local or consensus-relevant?
- Are deadlines explicit?
- Are timeouts bounded?
- Can ordering accidentally depend on unsynchronized clocks?
- Are timestamps evidence, metadata, or authority?
- What happens when a node clock is materially wrong?

---

## 3.5 Input & Validation

Questions:

- Are malformed inputs rejected before meaningful side effects?
- Are unsupported values fail-closed?
- Are size limits explicit?
- Is semantic validation distinct from structural validation?
- Are canonical encodings deterministic?
- Are ambiguous values rejected?
- Can one implementation accept input another conformant implementation interprets differently?

---

## 3.6 Security & Authority

Questions:

- Who is authenticated?
- Who is authorized?
- Who controls funds?
- Who can authorize an economic transition?
- Who merely hosts or transports the decision?
- Are secrets scoped and isolated?
- Are keys rotatable?
- Are superseded keys distrusted?
- Are replay and impersonation bounded?
- Can one infrastructure component silently gain economic authority?

Always attack cardinality and authority conflation:

> Participant Economic Identity  
> ≠ Participant Transport Identity  
> ≠ Operational Node Identity  
> ≠ Operator Economic Recipient

---

## 3.7 Privacy

Questions:

- What is public?
- What is pairwise/private?
- What is only locally required?
- Are raw database rows accidentally exposed?
- Is metadata more identifying than payload content?
- Does persistence increase linkability?
- Does recovery create public cross-protocol correlation?
- Is retention bounded?
- Can analytics/accounting create a global tracking graph?
- Can logs/errors leak secrets or payment instructions?

---

## 3.8 Networking & Distributed Operation

Questions:

- How are peers discovered?
- What happens if discovery is stale?
- How are reconnects handled?
- Can late joiners catch up?
- Can partitions heal?
- Can one malicious peer define a node's market view?
- Are resource and peer-count bounds explicit?
- Is backpressure real?
- Can selective forwarding fragment the market?
- Are protocol/wire versions negotiated safely?

---

## 3.9 Compatibility & Evolution

Questions:

- How does a live peer know another peer is compatible?
- How are wire/object versions declared?
- Is backward compatibility required?
- Are historical semantics immutable?
- Can schemas evolve without reinterpreting old signed facts?
- Are migrations explicit?
- Is deprecation observable?
- Can TypeScript/Rust/Go implementations interpret the same object identically?

Preserve:

> **Conformance ≠ Interoperability.**

> **TypeScript is first, not authoritative.**

---

## 3.10 Observability & Degraded State

Questions:

- Can operators distinguish healthy from degraded?
- Can "not invoked" be distinguished from "invoked and succeeded"?
- Can failure be distinguished from clean result?
- Are economically relevant operations traceable without leaking private data?
- Are metrics bounded in cardinality?
- Are correlation IDs useful?
- Can an operator know when a protective subsystem silently stopped working?
- Does observability describe reality rather than create authority?

---

## 3.11 Resource Safety & Abuse

Questions:

- Are message/request sizes bounded?
- Is CPU amplification bounded?
- Is signature-verification amplification bounded?
- Are queues bounded?
- Are caches bounded?
- Is storage growth bounded?
- Is bandwidth bounded?
- Are peer counts bounded?
- Can validly signed garbage exhaust the system?
- Can malformed input be disproportionately expensive?

---

## 3.12 Configuration & Environment

Questions:

- Are defaults safe?
- Does invalid configuration fail clearly?
- Are missing secrets distinguishable from first boot?
- Can environment drift silently change economic behavior?
- Are critical policies/versioned configuration bound before economic commitment?
- Can configuration rotation reinterpret existing interactions?

---

## 3.13 Data Durability & Integrity

Questions:

- What does "persisted" actually prove?
- Is crash/power-loss durability required?
- Are corruption and absence distinguishable?
- Are backups/restores defined?
- Can a restore resurrect stale economic state?
- Are migrations reversible or at least safely recoverable?
- Is filesystem/database durability being overclaimed?
- Is append-only evidence actually append-only under failure?

---

## 3.14 Dependency Boundaries

For every external dependency/provider:

- What capability does it provide?
- What happens when it disappears?
- What happens when its API changes?
- What happens when it times out ambiguously?
- Is it architecture or an adapter?
- Can it be replaced without Core semantic change?
- Does dependency failure create economic authority ambiguity?

Apply explicitly to current/future edges such as transport, wallet stacks,
settlement providers, RPCs, AI agents, databases, caches, evidence stores,
and third-party integrations.

Preserve:

> **Adopt capabilities, not dependencies as architecture.**

---

## 3.15 UX / Human Feedback

Questions:

- Does the user know what is happening now?
- Can the user distinguish pending, failed, cancelled, completed, and unknown?
- Is retry shown only when retry is actually safe?
- Can the user cancel when cancellation is economically meaningful?
- Can the user recover after closing the app?
- Is protocol/internal complexity hidden by default?
- Can an advanced user still exercise sovereign choices when needed?
- Do messages avoid false certainty?

Goal:

> centralized-grade UX without centralized authority.

The protocol should increasingly disappear from the user's mental model.

---

## 3.16 Developer Experience

Questions:

- Can a developer integrate without private assistance?
- Are errors programmatically usable?
- Are examples truthful to production semantics?
- Can developers discover supported capabilities?
- Can an unsupported operation fail clearly?
- Are version requirements visible?
- Does the SDK hide implementation detail without hiding economic meaning?
- Can a backend/service integration recover missed events?

Each mandatory support question from a competent integrator is potentially:

> a DX, documentation, abstraction-boundary, or product-surface defect.

---

## 3.17 Operations

Questions:

- Can an independent operator deploy?
- Upgrade?
- Roll back?
- Back up?
- Restore?
- Rotate keys?
- Recover from compromise?
- Observe health?
- Shut down safely?
- Migrate nodes?
- Change configuration without redefining open economic commitments?
- Respond to incidents using public runbooks?

---

## 3.18 Testing & Evidence

For every important property ask for:

- happy path;
- negative path;
- adversarial path;
- concurrency;
- restart;
- partition;
- duplicate/replay;
- stale state;
- dependency failure;
- ambiguous outcome;
- independent implementation;
- independent operator;
- independent developer;
- real partner integration where relevant.

Testing rule:

> **A passing test proves only the property actually exercised by that test.**

Never promote test output directly into a broad production claim.

---

## 3.19 Claims & Maturity

Questions:

- Is the feature implemented?
- Is the property evidenced?
- Is the provider mature?
- Is the integration production-eligible?
- Is the advertised scope bounded?
- Is the claim broader than the evidence?
- Is roadmap presence being mistaken for runtime support?

Preserve:

> **Provider implementation ≠ provider maturity ≠ production eligibility.**

> **Roadmap Asset ≠ SDK-Representable Asset ≠ Settlement-Supported Asset ≠ Beta-Enabled Asset.**

> **Production readiness ≠ accumulation of completed tickets.**

---


## 3.20 Sybil / Multiplicity / Influence Without Authority

This domain asks whether multiplying identities, nodes, messages, or infrastructure instances can create power merely through quantity.

Core question:

> **Can an operator increase influence, visibility, economic entitlement, liquidity control, or censorship power merely by multiplying Sails Nodes?**

The desired system property is not necessarily to make Sybil identities impossible. A permissionless system may allow cheap identity creation. The stronger question is whether cheap multiplicity creates cheap authority.

Preserve as candidate properties to confront against Sails:

> **More nodes ≠ more protocol authority.**

> **More messages ≠ more economic entitlement.**

> **More identities ≠ more economic rights.**

> **More relay activity ≠ more reward.**

> **Node multiplicity must not manufacture liquidity.**

> **Topology presence must not become economic authority.**

> **Valid signatures prove authority over facts; they do not prove economic value or justify unbounded resource consumption.**

Questions:

- Can one operator run thousands of nodes without gaining protocol authority merely from node count?
- Can a node farm increase the probability of surrounding/eclipse-isolating honest nodes?
- Can one operator dominate bootstrap or peer neighborhoods through cheap multiplicity?
- Can repeated relay of the same signed fact create additional visibility, weight, ranking, or reward?
- Can many distinct but low-value validly signed facts exhaust CPU, memory, storage, or bandwidth?
- Can an operator split one economic actor across many node identities to multiply future contribution accounting or entitlement?
- Can multiple nodes make one operator's liquidity appear larger than it economically is?
- Can node count influence market membership, discovery ranking, routing preference, fee entitlement, reputation, or arbitration authority?
- Can honest peers locally bound the cost imposed by one peer or one apparent operator without requiring central admission control?
- Does peer diversity actually create operator diversity, or only identity diversity?
- Does any future node-economic mechanism accidentally reward unverifiable activity?
- Is withholding competing liquidity ever rationally more profitable than propagating it honestly?
- Can a Sybil farm gain durable advantage by selective forwarding?
- Can identity rotation evade local abuse controls without also gaining new protocol rights?
- Does an anti-Sybil mechanism introduce more centralization, surveillance, token dependence, or architectural weight than the attack it prevents?

Existing Sails properties that already reduce Sybil value must be treated as evidence candidates, not assumed sufficient:

- participant signatures, not node votes, authorize Offer facts;
- duplicate signed facts must not multiply economic truth;
- node count is not a voting mechanism;
- no naive pay-per-relay mechanism is authorized;
- shared liquidity must not be enclosed by node choice;
- peer diversity / eclipse / selective-forwarding resilience is already an evidence obligation;
- gossip resource bounds / backpressure are already a Day-0 completeness concern;
- Node Contribution Accounting must be based on **verified contribution**, not raw presence or message count;
- Incentive Compatibility / No-Cannibalization must prove that suppressing competing liquidity does not create durable economic advantage.

Important distinction:

> **Sybil resistance ≠ making identity expensive by default.**

Bitcoin uses proof-of-work to make influence over block production costly, but Sails must not copy PoW, staking, tokens, allowlists, or identity registries merely by analogy. Any mechanism must first answer:

> **What exact power does cheap multiplicity buy in Sails today or in the proposed design?**

Only then may a mitigation be selected.

The preferred architectural direction is to make multiplicity naturally low-value where possible:

```
cheap node creation
        ↓
does not imply
        ↓
more authority
more liquidity
more reward
more truth
more settlement power
```

A future Sails confrontation pass must classify each discovered multiplicity risk as one of:

- already structurally neutralized;
- resource-abuse problem;
- topology/eclipse problem;
- economic-incentive problem;
- identity/accounting problem;
- evidence gap;
- real architectural gap.

No Sybil mechanism is selected or authorized by this checklist.

---


## 3.21 Adversarial Security / Continuous Red Team / Unknown-Unknowns

This domain exists because a serious open protocol must assume that once valuable enough, it will be continuously inspected by skilled, automated, and economically-motivated attackers.

Security review is therefore not a one-time pre-launch ceremony.

> **Security is a permanent adversarial process, not a final checklist.**

> **Production exposure changes the attacker model.**

> **A vulnerability surviving for years is still a vulnerability.**

> **Human review limits are no longer a sufficient threat model in the era of automated AI-assisted offensive analysis.**

The Sails security program must reason about at least four attack classes:

### A. Known attacks

Attacks already well understood in software, distributed systems, financial infrastructure, wallets, P2P systems, APIs, cryptographic protocols, databases, supply chains, and operational infrastructure.

Examples of categories to confront:

- authentication / authorization bypass;
- key theft / key substitution;
- replay;
- signature misuse / malleability / domain-confusion;
- request smuggling / injection classes;
- SSRF / path traversal / unsafe deserialization;
- dependency / supply-chain compromise;
- secret leakage;
- privilege escalation;
- race conditions / TOCTOU;
- double-spend / double-commit / duplicate execution;
- stale-state resurrection;
- equivocation;
- eclipse / Sybil / selective forwarding;
- DoS / amplification / resource exhaustion;
- malformed-message parser attacks;
- unsafe upgrade / downgrade paths;
- version-confusion;
- privacy / metadata-correlation attacks;
- recovery / backup compromise;
- logging / observability leakage;
- configuration poisoning;
- compromised infrastructure / CI / package publication;
- social-engineering paths that lead to protocol or operator compromise.

### B. Known-industry incident classes

For relevant incidents in Bitcoin, Lightning, sidechains, wallets, payment servers,
cryptographic libraries, exchanges, P2P networks and adjacent infrastructure,
the process should ask:

> What property failed?

> Could the same class of failure exist in Sails, even through a different implementation?

The purpose is not to copy incident-specific fixes blindly. It is to extract
the underlying violated property and confront Sails against it.

### C. AI-amplified attacks

Assume attackers can use highly capable models and autonomous tooling to:

- read the whole repository continuously;
- compare releases and diffs;
- generate exploit hypotheses;
- fuzz APIs and wire formats;
- synthesize malformed protocol objects;
- search for invariant violations;
- chain individually-low-severity bugs;
- inspect dependency behavior;
- generate race/concurrency schedules;
- search for secret-handling mistakes;
- simulate malicious integrators, nodes, wallets and providers;
- continuously retry novel attack combinations at machine speed.

Defensive implication:

> **The attacker can automate scrutiny. Sails must automate adversarial scrutiny too.**

No specific offensive model/tool is made part of the architecture.
The property is that defensive review capability must keep pace with automated attack capability.

### D. Unknown-unknowns

The hardest class is not a known CVE pattern but a valid-looking interaction
that violates an assumption nobody explicitly wrote down.

Questions:

- What assumption exists only in a developer's head?
- What two individually-correct components become unsafe when composed?
- What happens if an attacker violates our expected sequence but still sends valid inputs?
- What happens if all dependencies behave within their documented contracts but at adversarial timing?
- What can a malicious but protocol-conformant participant do?
- What can a malicious node do without forging signatures?
- What can a malicious provider do while returning syntactically valid responses?
- What can two or more colluding actors do that one actor cannot?
- What happens if one security control itself becomes unavailable or compromised?
- Which safety property currently depends on "nobody would do that"?
- Which assumptions were inherited from the reference implementation rather than the protocol?
- Which bugs could remain latent because happy-path tests never create the triggering state?

Preserve:

> **Valid input ≠ safe behavior.**

> **Authenticated actor ≠ honest actor.**

> **Conformant message ≠ benign message.**

> **One secure component + another secure component ≠ secure composition.**

---

### Continuous Red Team rule

Sails should maintain a permanent adversarial-review discipline across its lifecycle.

At minimum:

1. **Pre-implementation adversarial design review**
   - attack the property before choosing the mechanism;
   - identify trust boundaries and authority escalation paths;
   - challenge assumptions and cardinalities.

2. **Implementation red team before freeze**
   - adversarial code review;
   - negative-path tests;
   - fuzz/property-based testing where justified;
   - concurrency/race tests;
   - malformed-object and boundary testing;
   - dependency behavior confrontation.

3. **Pre-beta red team**
   - attack the real integrated system;
   - multi-node / multi-party abuse;
   - privacy leakage;
   - operator compromise scenarios;
   - resource exhaustion;
   - recovery and degraded-state tests.

4. **Pre-production security gate**
   - Network Simulation + Final Red Team;
   - external security audit/remediation;
   - production provider eligibility;
   - bounded real-value validation.

5. **Post-production continuous red team**
   - recurring adversarial reassessment after meaningful releases;
   - new dependency / new provider / new transport / new rail review;
   - incident-driven replay against Sails;
   - periodic unknown-unknown sweep;
   - attack-surface review after architectural changes;
   - regression tests for every confirmed vulnerability class.

A security finding must not disappear after remediation.

Required lifecycle:

```
finding
→ root violated property
→ exploit/evidence
→ fix
→ adversarial regression
→ institutional memory
→ future release gate where applicable
```

---

### Security research discipline

Do not optimize for "number of vulnerabilities found."

Preserve:

> **Finding count ≠ security.**

> **No findings ≠ no vulnerabilities.**

> **Scanner clean ≠ secure.**

> **Audit complete ≠ attack surface complete.**

> **Red Team result ≠ permanent proof.**

The purpose is to continuously reduce unexamined attack surface and convert
security discoveries into durable properties/evidence.

---

### Attacker-model breadth

Every major Sails surface should eventually be confronted against at least:

- malicious participant;
- malicious counterparty;
- malicious Sails Node;
- malicious node operator;
- malicious liquidity provider;
- malicious settlement provider;
- malicious wallet/integrator;
- compromised dependency;
- compromised CI/release pipeline;
- compromised operator host;
- network observer;
- colluding actors;
- resource-rich Sybil adversary;
- AI-assisted automated adversary.

Where relevant, test both:
- attacker violates the protocol;
- attacker remains protocol-conformant but exploits economics, ordering, timing, privacy, or resource asymmetry.

---

### Scope discipline

This section does **not** authorize a universal security framework,
mandatory proof-of-work, token, global identity registry, centralized firewall,
or any specific AI security product.

For each candidate mitigation ask:

> What exact attack/property does this mitigate?

> Does the mitigation introduce a larger trust, privacy, centralization or complexity cost?

> Can the risk be structurally neutralized instead of centrally policed?

Apply Goodhart, Cobra, Rube Goldberg, Sacrifice and Core/Edge checks.

A future dedicated Sails Security Adversarial Sweep should transform this
question framework into a threat-model matrix against the actual repository,
then classify each surviving gap into Backlog / Technical Debt / Evidence /
Partner Beta / Production Readiness.

**BACKLOG DELTA: NOT YET DETERMINED by this checklist entry.**

---

# 4. How this checklist is used against Sails

The execution flow is:

```
Universal checklist question
        ↓
Confront current Sails truth
        ↓
Already represented?
  ├─ YES → cross-link / strengthen evidence, do not duplicate
  └─ NO
        ↓
Does the property actually apply to Sails?
  ├─ NO → record Not Applicable / reason where useful
  └─ YES
        ↓
Classify
  ├─ Institutional Memory
  ├─ Master Backlog obligation
  ├─ Technical Debt
  ├─ ADR consequence
  ├─ Evidence obligation
  ├─ Partner Beta gate
  ├─ Production Readiness gate
  └─ Future Roadmap
        ↓
CTO decision
        ↓
Only then authorize implementation
```

---

# 5. Required adversarial checks

For every candidate delta run:

## Goodhart Check
Are we optimizing checklist completeness rather than system correctness?

## Cobra Check
Did solving one generic concern create a larger authority/security problem?

## Rube Goldberg Check
Did a universal best practice become an unnecessary subsystem?

## Sacrifice Check
What capability did the solution gain, and what simplicity/privacy/sovereignty did it sacrifice?

## Core/Edge Check
Does this belong in stable semantics or replaceable implementation edges?

## Claim Check
What is the narrowest statement evidence would permit after completion?

---

# 6. Immediate Sails discovery candidate: error semantics

This checklist was triggered by an unresolved but important question:

> How should Sails represent errors and feedback across protocol semantics,
> reference implementations, SDKs, transports, and user interfaces?

This document does **not** decide an error model.

The first future sweep should investigate:

- current backend error shapes;
- SDK error handling;
- protocol/domain error semantics, if any;
- HTTP status usage;
- Pears/direct transport failure representation;
- settlement-provider errors;
- retryable vs non-retryable distinction;
- unknown economic outcomes;
- correlation/evidence linkage;
- safe/public vs internal error metadata;
- UX translation boundaries;
- cross-implementation determinism requirements.

The required principle to test is:

> **Error Semantics ≠ Error Transport ≠ User Message.**

A future CTO Gate must decide whether this requires any protocol-level
standardization at all, and if so, the smallest semantics that earn their place.

---

# 7. Institutional status

**BACKLOG DELTA: NOT YET DETERMINED.**

That is deliberate.

This artifact registers the discovery framework and the error-semantics
question so they cannot disappear from conversation.

No checklist item becomes a Master Backlog obligation until a dedicated
Sails confrontation pass classifies it.

No implementation is authorized by this document.
