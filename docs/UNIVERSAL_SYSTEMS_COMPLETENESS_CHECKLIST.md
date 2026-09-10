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


## 3.22 Arbitration / Dispute Authority / Adversarial Justice

Arbitration is a distinct security, governance, economic, privacy and liveness surface.
It must not be treated as a small branch of the happy-path trade state machine.

Core principle:

> **Dispute Hosting Node ≠ Arbitration Authority ≠ Funds Authority.**

Preserve additionally:

> **Arbitration Policy ≠ Node Local Configuration once a trade is committed.**

> **Ruling Attribution ≠ Funds Authority.**

> **Evidence Hosting ≠ Evidence Authority.**

> **Arbiter Selection ≠ Arbiter Legitimacy.**

> **A valid ruling must not depend on one operator remaining online.**

This checklist entry does not select an arbitration mechanism. It creates the questions that any future Sails arbitration design must survive.

### Authority and commitment

Questions:

- At what exact point is the arbitration authority selected?
- Is the applicable arbitration policy committed before funds become economically at risk?
- Can either party, node, provider, or operator substitute the arbiter after trade commitment?
- Is the selected authority independently verifiable by both parties?
- Does the trade commit to the exact arbitration policy/version?
- Can policy updates retroactively alter an existing dispute?
- Can a hosting node gain authority merely because it received `raiseDispute()` first?
- Can settlement-provider configuration silently redefine the arbiter?
- Can an arbiter ruling itself move funds, or is separate rail-specific authorization required?

### Arbiter capture and collusion

Questions:

- What if the arbiter colludes with buyer?
- With seller?
- With node operator?
- With settlement provider?
- With liquidity provider?
- With another arbiter?
- Can one economic operator control multiple apparently independent arbiters?
- Does Sybil multiplicity create fake arbitration diversity?
- Can an arbiter favor counterparties that generate future fees?
- Can a node route users toward economically affiliated arbiters without disclosure?
- Can a cartel make honest arbitration economically irrational?

### Availability and censorship

Questions:

- What if the selected arbiter disappears?
- Refuses to accept the dispute?
- Delays indefinitely?
- Selectively ignores one party?
- Refuses certain jurisdictions/assets/users?
- Is there an explicit timeout?
- Is fallback/appeal defined before commitment?
- Can a party progress if the dispute-hosting node disappears?
- Can evidence and rulings be retrieved from another node?
- Can an operator censor evidence without destroying the underlying verifiable facts?

### Evidence integrity

Questions:

- What evidence is admissible?
- Who can create it?
- Who can attest it?
- Who stores it?
- Can evidence be modified, withheld, reordered, truncated, or selectively presented?
- Are hashes/signatures sufficient to prove exactly what was submitted?
- Can private evidence remain private while still being verifiable by authorized arbiters?
- Can metadata leak sensitive financial or identity information?
- Can one party flood the arbiter with valid but irrelevant evidence?
- Is there a canonical reference to the evidence set considered by a ruling?
- Can two honest reviewers independently verify what evidence a ruling relied on?

### Identity and conflicts of interest

Questions:

- How is an arbiter identified?
- Is arbiter identity operational, economic, legal, reputational, or some combination?
- Can arbiter keys rotate without invalidating prior rulings?
- How are superseded/compromised arbiter keys handled?
- Must an arbiter disclose conflicts of interest?
- Can participants distinguish one human/legal arbiter from many technical identities?
- Can reputation remain portable without becoming a global surveillance score?

### Ruling semantics

Questions:

- What exactly does a ruling state?
- Is the ruling deterministic enough for independent implementations to interpret identically?
- Is the ruling signed?
- Does it bind the dispute/trade/evidence set/policy version/appeal round?
- Can an old ruling be replayed against another trade?
- Can contradictory rulings exist at the same appeal level?
- Is equivocation detectable?
- What is the current-state rule if a higher appeal round exists?
- Can a ruling be partially executable depending on settlement rail?

### Funds authority

Questions:

- Who actually authorizes release/refund after a ruling?
- Does the arbiter control funds directly?
- Does the settlement provider require a separate authorization artifact?
- Can a node fabricate "arbiter approved" without the arbiter's signature?
- Can a ruling be valid but not executable under a particular rail?
- Can a settlement mechanism give an arbiter more authority than participants believed they accepted?

Always preserve:

> **Authorization Evidence ≠ Funds Authority.**

> **Interface uniformity ≠ Security uniformity.**

### Appeals and finality

Questions:

- Is appeal supported?
- Who may appeal?
- What is the deadline?
- Is the appeal authority precommitted?
- Can appeal policy change mid-trade?
- Does a higher ruling supersede or merely append to a prior ruling?
- Is finality explicit?
- Can funds move before the appeal window closes?
- Can an unavailable appeals layer lock funds forever?
- Can a malicious party abuse appeals purely for griefing or capital lockup?

### Economic attacks against arbitration

Questions:

- Can disputing become cheaper than honest completion?
- Can attackers grief counterparties by repeatedly forcing arbitration?
- Can arbitrers be bribed more cheaply than the value they control?
- Can fees create incentives to manufacture disputes?
- Can an operator earn more when users enter disputes?
- Can colluding accounts farm arbiter reputation or fees?
- Can bond/deposit mechanisms, if ever proposed, be Sybil-farmed or become censorship tools?
- Can a wealthy actor economically exhaust honest counterparties through repeated disputes?

### Privacy and coercion

Questions:

- Does dispute resolution force public disclosure of payment details?
- Can an arbiter infer more participant identity than required?
- Can evidence create cross-trade/cross-wallet correlation?
- Can arbitration logs become a permanent surveillance graph?
- Can a malicious arbiter retain private evidence beyond necessity?
- Can parties prove enough without globally publishing sensitive data?

### Cross-node and independent-operation reality

Required future adversarial evidence should include, where applicable:

- Buyer-node disappearance during dispute.
- Seller-node disappearance during dispute.
- Dispute-hosting-node failover.
- Arbiter unavailable before accepting dispute.
- Arbiter unavailable after accepting evidence.
- Conflicting node-local arbitration configuration.
- Arbiter-key rotation/compromise.
- Contradictory ruling / arbiter equivocation.
- Appeal-round consistency.
- Evidence withholding / partial evidence set.
- Malicious evidence flood.
- Settlement-provider substitution attempt after dispute begins.
- Fee/policy rotation after dispute begins.
- Independent stranger node verifies ruling and evidence references.
- Independent implementation interprets the same ruling identically.

### Adversarial design rule

For every arbitration proposal ask:

> Can a malicious but protocol-conformant arbiter exploit this?

> Can a malicious node exploit this without controlling the arbiter?

> Can a malicious settlement provider exploit this while returning valid responses?

> Can two colluding roles gain authority that neither role has alone?

> Does the proposed safeguard create hidden central authority?

No universal arbiter registry, token, staking model, legal identity layer, reputation formula, multisig structure, or appeal hierarchy is authorized by this checklist.

A future dedicated **Sails Arbitration Adversarial Sweep** must confront these questions against current dispute code, settlement rails, evidence model, economic policy and cross-node architecture, then classify surviving gaps into ADR / Backlog / Technical Debt / Evidence / Partner Beta / Production Readiness.

**BACKLOG DELTA: NOT YET DETERMINED by this checklist entry.**

---


## 3.23 Day-0 Non-Negotiables / Bitcoin-Like Conservative Core

This section captures properties that should be confronted before Sails
earns the right to call itself a serious open financial coordination protocol.

The analogy to Bitcoin is about engineering posture, not copying Bitcoin's
consensus mechanism, proof-of-work, UTXO model or network topology.

Bitcoin's history shows that catastrophic classes include consensus divergence,
inflation/double-spend bugs, remotely-triggerable denial of service, memory/
CPU exhaustion, unsafe dependency behavior, and upgrade incompatibility.
Sails must extract the violated property from those classes rather than copy
their implementation-specific fixes.

### 1. Semantic core minimization

> **The smaller the protocol-authoritative semantic core, the smaller the blast radius of a bug.**

Questions:

- What absolutely must every conformant implementation agree on?
- What can remain local policy?
- What can remain provider-specific?
- What can remain UI-only?
- What can remain adapter-specific?
- Does any convenience feature accidentally enter protocol truth?
- Can a bug in an edge component redefine economic meaning?

Preserve:

> **Stable semantics, replaceable edges.**

> **Interfaces can multiply. Semantics should not.**

### 2. No implicit majority authority

Sails must not accidentally create a hidden "majority of nodes = truth"
assumption.

Questions:

- Does node count ever determine economic validity?
- Does relay count affect truth?
- Does popularity/ranking affect authority?
- Can a Sybil majority reinterpret signed participant facts?
- Can multiple nodes make one operator's economic claim stronger?

Desired property:

> **Economic truth follows explicit authority and signed evidence, not node count.**

### 3. Deterministic validation / split resistance

Bitcoin's history demonstrates that implementation disagreement on validation
can split a network.

Sails must ask:

- Can two conformant implementations receive the same economic object and
  disagree on validity?
- Can language/runtime differences change canonical serialization,
  signature verification, numeric precision, timestamp interpretation,
  enum handling, Unicode/string normalization, or overflow behavior?
- Can one version accept what another rejects?
- Can database or platform limits create divergent interpretation?

Desired property:

> **Same authoritative facts + same protocol version → same validity result.**

This does not imply identical local policy or identical market projection.

### 4. Upgrade and downgrade safety

Questions:

- Can a protocol upgrade reinterpret already-signed historical facts?
- Can old nodes and new nodes safely coexist?
- When must incompatible versions refuse interaction?
- Can an attacker downgrade negotiation to weaker semantics?
- Can a rollout create two economic universes?
- Is there a rollback path that does not corrupt open economic state?

Preserve:

> **Upgrade safety ≠ backward compatibility at any cost.**

> **Failing closed is preferable to silently disagreeing on economic meaning.**

### 5. Economic invariant protection

For every value-moving or commitment-making flow ask:

- Can value be created, duplicated, counted twice, released twice, or
  economically committed twice?
- Can fees be applied twice?
- Can one accepted Offer produce conflicting mutually-exclusive commitments?
- Can replay create another valid economic action?
- Can a bug turn advisory metadata into economic authority?
- Can accounting create entitlement without verifiable contribution?

Desired property:

> **No implementation defect may manufacture economic authority or economic value.**

### 6. State-machine totality

Questions:

- Is every externally reachable state transition either valid or explicitly rejected?
- What happens for every invalid transition?
- Can an object become permanently stuck in an impossible intermediate state?
- Can a crash occur between two side effects and leave ambiguous truth?
- Can an unknown outcome be retried into double execution?
- Can cancellation race completion?
- Can dispute race settlement?

Desired property:

> **Every economically meaningful state transition must have explicit authority, preconditions and recovery semantics.**

### 7. Fail-closed ambiguity

Where economic meaning is ambiguous:

- unknown provider outcome;
- incompatible version;
- equivocation;
- corrupted evidence;
- unknown identity binding;
- conflicting policy;
- incomplete payment commitment;
- conflicting ruling;

the system should not invent certainty.

Preserve:

> **Unknown ≠ Failed.**

> **Ambiguous ≠ Authorized.**

> **Unable to prove safe continuation → do not silently continue.**

### 8. Cryptographic domain separation

Questions:

- Is every signature bound to its purpose/domain?
- Can a signature valid for one object be replayed as another object type?
- Are protocol/version/context identifiers bound where required?
- Are identity keys reused across transport/economic/recovery roles?
- Can cross-protocol signature confusion occur?
- Is canonical encoding unambiguous?

Desired property:

> **A valid signature proves only the exact statement and authority domain it was created for.**

### 9. Key lifecycle is part of the protocol threat model

Questions:

- How are keys created?
- Where are secrets held?
- What happens if generation is weak?
- What happens if keys are lost?
- What happens if keys are compromised?
- What happens when keys rotate?
- How are superseded keys distrusted?
- What signed history remains valid after rotation?
- Can recovery create identity-linkage or privilege escalation?

Important lesson from wallet incidents:

> **An update can fix future key generation without repairing already-compromised key material.**

Therefore remediation semantics must distinguish:
software fixed
≠
existing secret safe.

### 10. Dependency compromise containment

Questions:

- If Pears, WDK, QVAC, a settlement provider, DB driver, crypto library,
  HTTP framework, package manager dependency, CI runner or build chain is
  compromised, what authority can it gain?
- Can one compromised edge dependency forge protocol authority?
- Are dangerous capabilities isolated?
- Can dependencies be upgraded/replaced without semantic redesign?
- Are transitive dependencies part of threat review?

Desired property:

> **Dependency compromise should be contained to the minimum authority that dependency actually needs.**

### 11. Build / release / supply-chain integrity

Questions:

- Who can publish SDK/package releases?
- Can CI secrets be used to impersonate maintainers?
- Are release artifacts reproducible or independently verifiable where justified?
- Can a compromised dependency enter unnoticed?
- Are lockfiles/pinned versions/verification procedures appropriate?
- Are emergency releases distinguishable from normal releases?
- Can users/operators verify what they are running?

### 12. Resource asymmetry

A tiny attacker input must not trigger unbounded defender work.

Attack surfaces include:

- signature verification;
- parsing;
- decompression;
- database lookups;
- gossip fan-out;
- tombstone/history growth;
- evidence upload;
- dispute evidence;
- connection setup;
- retries;
- AI/agent invocation if ever exposed.

Desired property:

> **Attacker cost and defender cost must not have catastrophic asymmetry.**

### 13. Local policy must not become global truth

Nodes may differ in:

- score calculation;
- fees;
- presentation;
- preferred providers;
- local risk tolerance;
- local caching;
- routing preference.

But local policy must not redefine signed economic facts.

Preserve:

> **Local policy ≠ Protocol truth.**

### 14. Recovery without authority escalation

Questions:

- Can a new device recover identity without learning unrelated protocol keys?
- Can node failover recover open trades without changing historical authority?
- Can backups restore stale/cancelled state?
- Can recovery credentials authorize more than recovery?
- Can operator recovery become participant custody?

### 15. Incident response is part of production architecture

Before production Sails must define:

- private vulnerability reporting path;
- severity classification;
- emergency triage;
- coordinated disclosure;
- patch/release process;
- key/credential rotation guidance;
- operator notification;
- partner notification;
- evidence preservation;
- postmortem;
- regression tests;
- institutional-memory update.

Preserve:

> **Fixing the code is not the end of an incident.**

### 16. Security regression permanence

Every confirmed vulnerability class must become a durable adversarial regression
or durable evidence obligation where executable regression is impossible.

Desired flow:

```
incident / vulnerability
→ root violated property
→ fix
→ adversarial regression
→ institutional memory
→ future release gate
```

### 17. Cross-role collusion

Do not test roles only independently.

Attack combinations include:

- participant + node;
- node + arbiter;
- node + settlement provider;
- liquidity provider + arbiter;
- integrator + participant;
- two nodes under one hidden operator;
- multiple Sybil participants under one operator;
- compromised provider + malicious counterparty.

Question:

> **What authority appears only when two individually-limited roles collude?**

### 18. Graceful degradation

Questions:

- What still works when a provider is unavailable?
- What becomes read-only?
- What must halt?
- What can safely retry?
- What must reconcile later?
- Can degraded mode accidentally weaken validation or privacy?
- Is degraded state visible to user/operator/integrator?

### 19. Safe defaults

Questions:

- Does the default deployment expose dangerous ports?
- Are insecure optional modes clearly non-default?
- Are production-ineligible providers disabled by default?
- Are debug endpoints disabled?
- Are secrets required explicitly?
- Does missing configuration fail safely rather than silently falling back?

### 20. No irreversible trust shortcut

Temporary beta conveniences must not become permanent protocol dependencies.

Questions:

- Is any Satsails-operated server becoming de facto mandatory?
- Is any private allowlist becoming membership authority?
- Is any temporary centralized database becoming protocol truth?
- Is any "only for beta" key becoming permanent root authority?
- Can every temporary trust assumption be removed without changing economic semantics?

Preserve:

> **Temporary infrastructure must not become permanent protocol authority by inertia.**

---

### Day-0 security posture

The desired posture is:

```
small authoritative core
+ explicit authority
+ deterministic validation
+ bounded resources
+ fail-closed ambiguity
+ replaceable dependencies
+ adversarial evidence
+ safe upgrades
+ permanent red team
```

No claim is made that Sails already satisfies all properties above.

This section is a **Day-0 completeness question framework**, not automatic backlog.
A dedicated confrontation pass must classify each item as:

- already proven;
- already represented but unproven;
- current implementation defect;
- Day-0 blocker;
- Partner Beta blocker;
- Production Readiness requirement;
- future hardening;
- not applicable.

**BACKLOG DELTA: NOT YET DETERMINED by this checklist entry.**

---


## 3.24 Technology / Provider Attack Surface / Agnostic-Edge Risk

Sails is intentionally infrastructure-agnostic. That increases interoperability,
but also increases the number of replaceable edges that can fail, be compromised,
change semantics, or introduce hidden authority.

Core principle:

> **Technology agnosticism ≠ technology risk neutrality.**

> **Replaceable edge ≠ harmless edge.**

> **Capability adoption ≠ trust delegation.**

Every supported technology, protocol, provider, SDK, transport, wallet stack,
settlement rail, database, AI agent, cloud/runtime, or external service must be
treated as an independent attack and failure surface.

### Core question

> **If this technology is malicious, compromised, buggy, unavailable, upgraded incompatibly, or simply behaves differently than expected, what power does it gain over Sails?**

The ideal answer is:

> only the minimum capability that edge was explicitly authorized to provide.

---

### 1. Transport technologies

Examples include Pears/HyperDHT today and any future alternative transport.

Questions:

- Can transport impersonate participant economic identity?
- Can transport metadata leak identity relationships?
- Can peer discovery be eclipsed or poisoned?
- Can malformed transport frames exhaust resources?
- Can transport upgrades change identity semantics?
- Can a transport implementation silently become membership authority?
- Can one transport-specific assumption leak into protocol semantics?
- Can a transport compromise modify economic facts, or only delay/drop them?

Desired boundary:

> **Transport Authority ≠ Economic Authority.**

---

### 2. Wallet infrastructure / key-management technologies

Examples include WDK and future wallet stacks/adapters.

Questions:

- Can wallet infrastructure change key derivation semantics?
- Can an SDK update compromise key generation or signing?
- Can a wallet adapter gain authority beyond signing the explicitly authorized action?
- Can one provider's seed/key model become protocol identity?
- Can backup/recovery semantics leak across domains?
- Can wallet infrastructure silently downgrade custody or signer assumptions?

Preserve:

> **WalletAdapter ≠ SettlementProvider.**

> **Wallet stack ≠ Protocol identity definition.**

---

### 3. Settlement providers and rails

Examples may include on-chain Bitcoin, Lightning/Spark-like rails, Liquid,
EVM stablecoin rails, DePix providers, sidechains and future settlement systems.

Questions:

- What is authoritative: chain state, provider API, attestation, multisig artifact,
  invoice state, or local database?
- Can provider API success lie about final settlement?
- Can timeout produce unknown economic outcome?
- Can provider substitute a rail or custody posture?
- Can the provider censor release/refund?
- Can provider downtime freeze open trades?
- Can reorg/finality assumptions differ by rail?
- Can one generic interface hide materially different security semantics?

Preserve:

> **Interface uniformity ≠ Security uniformity.**

> **Settlement Provider ≠ Settlement Authority unless the rail explicitly gives it that role.**

---

### 4. AI / agent technologies

Examples include QVAC or future negotiation/automation agents.

Questions:

- Can an agent create economic commitments?
- What authority is delegated to the agent?
- Can prompt/input manipulation cause unauthorized actions?
- Can model hallucination become protocol truth?
- Can an external model/provider observe private trade data?
- Can model updates change economic behavior without protocol/version change?
- Can an agent be induced to reveal secrets or payment instructions?
- Is every agent action bounded by cryptographic/user authorization?

Desired boundary:

> **Agent Recommendation ≠ Economic Authority.**

> **Model Output ≠ Evidence.**

> **Autonomy must never exceed explicitly delegated authority.**

---

### 5. Databases / caches / queues

Questions:

- Can Redis/cache disagreement redefine economic truth?
- Can database corruption resurrect stale state?
- Can replica lag create double-commit behavior?
- Can cache poisoning alter validation?
- Can queue redelivery duplicate economic actions?
- Can schema migration reinterpret historical facts?
- Does losing a cache merely degrade performance, or corrupt semantics?

Preserve:

> **Storage representation ≠ Protocol truth.**

---

### 6. Cryptographic libraries

Questions:

- Does the library actually enforce the canonical signature rules Sails assumes?
- Can malleability or permissive parsing change fact identity?
- Are public-key encodings validated canonically?
- Can version upgrades alter verification behavior?
- Are domain-separation requirements enforced by Sails rather than assumed from the library?
- Is cryptographic failure fail-closed?

Preserve lesson:

> **Library verification success ≠ protocol-semantic validity.**

---

### 7. API frameworks / serialization / parsers

Questions:

- Can parser ambiguity create cross-implementation disagreement?
- Can unknown fields be interpreted differently?
- Can numeric coercion change value?
- Can JSON ordering/Unicode/float behavior alter signatures?
- Can request middleware bypass authentication/authorization?
- Can framework defaults expose internal objects?
- Can deserialization trigger dangerous behavior?

---

### 8. Third-party identity / authentication systems

Questions:

- Can external auth become protocol membership authority?
- Can account recovery override economic identity?
- Can OAuth/session compromise sign economic actions?
- Can identity-provider outage lock users out of sovereign assets?
- Can email/phone identity become conflated with cryptographic authority?

Desired boundary:

> **Application Authentication ≠ Protocol Economic Identity.**

---

### 9. Cloud / hosting / deployment infrastructure

Questions:

- What happens if the cloud account is compromised?
- Can infrastructure admin access participant secrets?
- Can snapshots/backups expose keys?
- Can DNS/TLS compromise redirect clients?
- Can one hosting provider take down a large fraction of nodes?
- Can autoscaling/redeployment accidentally rotate node identity?
- Can observability vendors ingest private trade data?

---

### 10. Package managers / build tools / CI/CD

Questions:

- Can dependency confusion or typosquatting compromise builds?
- Can a maintainer account publish malicious packages?
- Can generated code differ from reviewed source?
- Can CI secrets sign/publish attacker-controlled artifacts?
- Can post-install scripts execute dangerous behavior?
- Are transitive dependency changes visible and reviewed?

---

### 11. Bridge / wrapper / adapter risk

Agnostic systems often concentrate danger in adapters.

Questions:

- Does the adapter translate semantics losslessly?
- Does it invent defaults when the source system is ambiguous?
- Does it hide unsupported states?
- Can two adapters map the same external state differently?
- Does adapter fallback silently switch providers?
- Can adapter convenience create hidden custody or trust?

Preserve:

> **Adapter compatibility ≠ semantic compatibility.**

---

### 12. Version and dependency drift

Questions:

- Can a minor dependency update change security-relevant behavior?
- Are breaking changes detected before release?
- Can two node operators run dependency versions with divergent semantics?
- Is protocol compatibility independent from library version compatibility?
- Can an emergency upstream patch create a rushed Sails regression?

---

### 13. Provider maturity and eligibility

For each provider/technology distinguish:

> **Available ≠ Integrated ≠ Evidenced ≠ Mature ≠ Production Eligible.**

Questions:

- Has it been adversarially tested?
- Has it survived real production exposure?
- Is incident history understood?
- Does it expose sufficient evidence for Sails to verify outcomes?
- Is fallback possible?
- Is blast radius bounded?
- Does provider compromise require halting only one rail, or the whole protocol?

---

### 14. Cross-technology composition attacks

The largest risk may exist between technologies rather than inside one.

Examples of questions:

- Can transport identity + wallet identity composition leak correlation?
- Can provider timeout + retry logic create duplicate settlement?
- Can AI agent + permissive API create unauthorized commitment?
- Can cache lag + provider response create stale release?
- Can identity provider recovery + wallet binding hijack account authority?
- Can two individually-correct adapters disagree on the same asset/network semantics?

Preserve:

> **Secure component A + secure component B ≠ secure composition.**

---

### 15. Technology-removal test

For every dependency ask:

> **If this technology disappeared tomorrow, what protocol semantics would break?**

Interpretation:

- If only capability disappears, boundary is probably healthy.
- If protocol truth becomes undefined, the edge may have become architecture.
- If users lose authority because a provider disappears, hidden centralization may exist.

This is a permanent Architecture Drift check.

---

### 16. Blast-radius test

For each technology/provider define:

- maximum funds/value it can affect;
- identities it can impersonate;
- data it can observe;
- state it can mutate;
- nodes/users it can isolate;
- claims it can falsify;
- availability it can remove.

Desired property:

> **Compromise of one replaceable edge must not grant unrelated authority elsewhere.**

---

### 17. Technology incident replay

Whenever any relevant external technology or adjacent ecosystem suffers a
security incident:

1. identify the root violated property;
2. ignore brand-specific details initially;
3. ask whether the same property exists anywhere in Sails;
4. inspect all adapters/providers that share the class;
5. add adversarial regression/evidence if applicable;
6. classify any real gap institutionally.

This creates the desired "natural antibodies":

> **External incident → Sails hypothesis → adversarial confrontation → durable evidence.**

---

### 18. Agnostic-edge threat matrix

A future dedicated sweep should create a matrix for each real Sails technology:

```
Technology / Provider
→ Capability supplied
→ Authority granted
→ Secrets/data exposed
→ Failure modes
→ Compromise modes
→ Semantic assumptions
→ Replaceability
→ Blast radius
→ Existing evidence
→ Missing evidence
→ Production eligibility
```

Candidate surfaces to confront include current or planned technologies such as:

- Pears / HyperDHT;
- WDK;
- QVAC;
- Bitcoin node/RPC infrastructure;
- Lightning / Spark-like infrastructure;
- Liquid / Elements ecosystem;
- EVM networks and RPC/providers;
- Solana / Tron / TON / BNB-style rails where supported;
- DePix and fiat/PIX providers;
- settlement/custody/escrow providers;
- database/cache/event infrastructure;
- cryptographic libraries;
- authentication/wallet-integration providers;
- package/build/CI supply chain;
- AI/model providers;
- future adapters and independent implementations.

This list is a discovery seed, not a statement that every technology above is
currently implemented or production-supported.

No technology is rejected merely for having risk.
No technology is trusted merely because it is widely used.

> **Agnosticism means replaceability with explicit trust boundaries, not blind compatibility.**

A future **Sails Technology Attack-Surface Sweep** must confront each actual
repository dependency/integration against this matrix and classify surviving
gaps into ADR / Backlog / Technical Debt / Evidence / Partner Beta /
Production Readiness.

**BACKLOG DELTA: NOT YET DETERMINED by this checklist entry.**

---


## 3.25 Blind-Spot Attack Vectors / Adversarial Use of Valid Features

This section exists to hunt attack classes that are easy to miss because
the attacker may use valid identities, valid messages, valid protocol states,
valid incentives, or legitimate operational features.

Core principle:

> **The most dangerous attacker may be protocol-conformant.**

> **Valid use ≠ benign use.**

> **Protocol correctness ≠ economic safety ≠ operational safety.**

The purpose is to search for blind spots outside ordinary exploit classes.

### 1. Economic griefing

Questions:

- Can an attacker impose cost without seeking direct profit?
- Can they lock counterparties' capital cheaply?
- Can they force repeated disputes?
- Can they create offers they never intend to settle?
- Can they repeatedly start and abandon trades?
- Can they create asymmetric operational cost for honest nodes/providers?
- Can cancellation/retry fees be weaponized?
- Can a wealthy attacker rationally burn money just to damage the market?

Desired property:

> **Attacker cost should not be tiny while honest-party cost is large or irreversible.**

### 2. Liquidity poisoning / fake market depth

Questions:

- Can valid offers create the appearance of liquidity that is not realistically executable?
- Can one actor publish fragmented offers across many identities/nodes to fake depth?
- Can quote expiry be manipulated to keep stale liquidity visible?
- Can repeated cancellations manipulate perceived market quality?
- Can low-quality offers crowd out honest discovery?
- Can an operator bias sorting/ranking toward affiliated liquidity?

Preserve:

> **Visible liquidity ≠ executable liquidity.**

> **Advertised capacity ≠ committed capacity.**

### 3. Reputation laundering / reputation poisoning

Questions:

- Can colluding identities manufacture positive history?
- Can one identity transfer reputation to another illegitimately?
- Can reputation evidence be selectively disclosed?
- Can attackers generate cheap successful trades to farm reputation?
- Can adversaries poison another participant with misleading or unverifiable claims?
- Can node-local scoring become de facto censorship?
- Can one operator's scoring policy create hidden market partition?

Preserve:

> **Reputation Evidence ≠ Reputation Score.**

### 4. Identity farming / identity churn

Questions:

- Can an attacker discard bad history by creating a new identity cheaply?
- Can rotation that exists for security become a reputation reset?
- Can recovery be abused to fork identity?
- Can multiple identities be presented as independent counterparties?
- Can anti-abuse logic accidentally create permanent surveillance identity?

Goal:

> **Security rotation must not automatically erase accountability, and accountability must not require global identity surveillance.**

### 5. Cross-market / cross-rail semantic arbitrage

Questions:

- Can the same asset symbol mean materially different risk across rails?
- Can users be tricked by identical-looking assets on different networks?
- Can price feeds or quote currencies mismatch across providers?
- Can settlement finality differences be exploited between rails?
- Can an attacker intentionally route toward the weakest custody/finality model?
- Can a bridge/wrapper asset be mistaken for the native asset?

Preserve:

> **Asset identity ≠ Network identity ≠ Settlement-provider identity.**

### 6. Transaction / fee manipulation

Questions:

- Can fee estimation be manipulated?
- Can an attacker force expensive settlement paths?
- Can fee spikes make already-committed trades uneconomic?
- Can replacement/fee-bumping semantics conflict with trade state?
- Can a provider hide or rotate fees after commitment?
- Can dust/minimum-value edge cases become DoS vectors?

### 7. Oracle / price-source attacks

If any price reference, FX source, market index, or provider quote becomes economically relevant:

- Can stale price data be accepted?
- Can one provider become hidden oracle authority?
- Can a thin market be manipulated?
- Can local currency conversion create rounding asymmetry?
- Can timestamp skew make stale quotes appear fresh?
- Can two parties bind different price-source versions?

Preserve:

> **Price source ≠ economic authority unless explicitly committed.**

### 8. Rounding / precision / denomination attacks

Questions:

- Are decimals canonical?
- Can float usage create divergent economic values?
- Can truncation benefit one side?
- Can repeated small rounding differences be farmed?
- Are minimum units defined per rail?
- Can currency conversions overflow or underflow?
- Can locale formatting alter parsed amounts?

Desired property:

> **Economic quantities must be represented deterministically and exactly enough for the rail.**

### 9. Race-to-authority / first-seen manipulation

Questions:

- Does "first node to observe" ever gain authority?
- Does arrival order affect ownership, ranking, arbitration, or entitlement?
- Can faster infrastructure gain semantic advantage?
- Can a malicious relay delay one fact to create temporary authority for another?
- Can front-running exist in offer acceptance, arbitration selection, or policy binding?

Preserve:

> **Arrival order must not create authority unless explicitly part of the protocol.**

### 10. Front-running / information leakage

Questions:

- Can observing an intent before commitment let another participant exploit it?
- Can nodes see trade interest and race to alter offers?
- Can payment-method or amount metadata reveal profitable information?
- Can an operator trade against users based on private order flow?
- Can a gossip layer leak economically sensitive intentions before necessary?

### 11. Censorship by quality degradation

An attacker may not fully block the network; they may make it unreliable enough that users leave.

Questions:

- Can selective delay make honest offers look stale?
- Can targeted packet loss cause one participant to appear unreliable?
- Can nodes selectively degrade certain assets/providers/users?
- Can attackers increase timeout/dispute frequency without obvious censorship?
- Can degraded service be attributed/evidenced?

### 12. Strategic partition / market fragmentation

Questions:

- Can different operator clusters see systematically different liquidity?
- Can regional bootstrap lists create semi-permanent markets?
- Can policy defaults fragment the market even if protocol allows interoperability?
- Can incompatible versions create accidental liquidity islands?
- Can one operator make "its" market better enough that users never leave, recreating enclosure economically rather than technically?

### 13. Dependency fallback attacks

Questions:

- Can an attacker force the preferred provider to fail so Sails falls back to a weaker one?
- Is fallback security-equivalent?
- Can fallback silently change custody, fees, privacy, or finality?
- Can repeated induced failures steer users to attacker-controlled infrastructure?

Preserve:

> **Availability fallback ≠ security-equivalent fallback.**

### 14. Recovery-path attacks

Attackers often target recovery because controls are intentionally weaker.

Questions:

- Can recovery bypass normal authorization?
- Can social/account recovery hijack economic identity?
- Can old backups resurrect revoked keys?
- Can recovery create two simultaneously-valid identities?
- Can operator recovery expose participant secrets?
- Can emergency recovery procedures be socially engineered?

### 15. Emergency-mode abuse

Questions:

- Is there any emergency flag, kill switch, pause, maintenance mode, admin bypass, migration shortcut, or incident-only permission?
- Who can activate it?
- Can it become permanent?
- Can it alter economic facts?
- Can a compromised operator abuse it?
- Does emergency operation preserve verifiable evidence?

Desired property:

> **Emergency authority must be narrower, not broader, than ordinary economic authority.**

### 16. Governance capture / maintainer compromise

Questions:

- Can one maintainer merge consensus-critical semantics unilaterally?
- Can GitHub/admin compromise redefine protocol truth?
- Can release signing keys be abused?
- Can maintainers be socially engineered into emergency shortcuts?
- Can governance process be DoS'd or captured?
- Are frozen properties protected from casual rewrite?

Preserve:

> **Repository write authority ≠ protocol economic authority.**

### 17. Documentation / specification attacks

Questions:

- Can ambiguous docs cause independent implementations to diverge?
- Can examples contradict normative semantics?
- Can stale documentation become de facto API truth?
- Can generated docs omit critical security caveats?
- Can attackers exploit the difference between spec and implementation?

Desired property:

> **Ambiguous specification is a security defect when independent economic interpretation depends on it.**

### 18. Test-suite blind spots / test gaming

Questions:

- Can implementation special-case known tests?
- Are tests overfitted to fixtures?
- Are property tests broad enough?
- Are adversarial states reachable outside tests?
- Does CI success hide environment-specific failure?
- Can mocks falsely prove provider behavior?
- Are real concurrency/network/DB conditions represented?

Preserve:

> **Passing known tests ≠ surviving unknown adversarial states.**

### 19. Monitoring and alert manipulation

Questions:

- Can attackers generate alert fatigue?
- Can logs be flooded to hide meaningful events?
- Can metrics be manipulated?
- Can cardinality explosions break observability?
- Can attackers trigger false incident responses?
- Can a compromised node falsify health status?

### 20. Abuse of optionality

Every optional feature can create combinatorial state space.

Questions:

- Can optional rails/providers/policies interact in unsafe combinations?
- Are unsupported combinations rejected?
- Can "optional" become implicitly required by another feature?
- Does feature negotiation prevent invalid combinations?

### 21. Dormant / rarely-used code paths

Questions:

- Which branches execute only during recovery, dispute, migration, upgrade, or failure?
- Are they tested under real conditions?
- Can old compatibility paths contain stale assumptions?
- Are dead features still reachable?
- Can deprecated APIs bypass newer controls?

### 22. Long-horizon state attacks

Questions:

- What happens after months/years of accumulated offers, tombstones, evidence, identities and policy versions?
- Can storage growth become attack leverage?
- Can ancient signed data become unexpectedly valid again?
- Can old keys/policies create ambiguity?
- Does compaction preserve all required monotonic knowledge?

### 23. Multi-party collusion beyond pairs

Do not stop at two-role collusion.

Questions:

- buyer + seller + arbiter;
- node + provider + integrator;
- several nodes under one hidden operator;
- liquidity cartel;
- many Sybil participants + one honest victim;
- maintainer + compromised dependency;
- provider + oracle/price source.

Core question:

> **What attack becomes possible only when several individually-limited actors coordinate?**

### 24. Legal/operational coercion as a technical attack surface

Without making legal policy protocol authority, ask:

- Can one operator be compelled to censor?
- Can one provider freeze a rail?
- Can one jurisdiction-dependent dependency become a global choke point?
- Can private legal requests silently change node behavior?
- Can architecture route around operator/provider disappearance without redefining truth?

### 25. Human-interface deception

Questions:

- Can a UI display a different asset/network/provider than the signed object actually commits to?
- Can truncation hide destination identifiers?
- Can Unicode/lookalike strings deceive users?
- Can "success" be shown before authoritative settlement?
- Can users be tricked into approving a different economic statement than displayed?

Preserve:

> **What the user sees must correspond to what the cryptographic/economic commitment actually authorizes.**

### 26. AI-agent / autonomous-tool escalation

Beyond ordinary model hallucination:

- Can an AI repeatedly call valid APIs until it finds an exploitable state?
- Can it autonomously create Sybil identities?
- Can it learn local rate limits?
- Can prompt injection from counterparty-controlled data alter tool use?
- Can a model be induced to sign/approve beyond intent?
- Can agents collude or recursively delegate authority?
- Can an AI-generated "explanation" override machine-verifiable truth in UX?

### 27. Attack-surface emergence

Every new capability must trigger a delta question:

> **What new authority, state, data, timing dependency, resource cost, or trust edge did this feature introduce?**

This must run for:
- new asset;
- new rail;
- new provider;
- new transport;
- new identity mechanism;
- new arbitration model;
- new agent;
- new API;
- new SDK language;
- new node economics;
- new recovery mechanism.

---

### Blind-spot sweep method

A dedicated future sweep should use several attacker mindsets:

1. **Profit attacker** — wants money.
2. **Griefer** — accepts financial loss to damage users/network.
3. **Censor** — wants specific participants/assets hidden.
4. **Cartel** — wants market control.
5. **Insider** — has legitimate operational access.
6. **Compromised dependency** — trusted edge behaves maliciously.
7. **Protocol-conformant adversary** — never sends invalid messages.
8. **AI-scale adversary** — automates search and chaining of weaknesses.
9. **Long-horizon adversary** — exploits state accumulated over months/years.
10. **Unknown-unknown hunter** — attacks assumptions rather than features.

For every finding classify:

- protocol semantic flaw;
- implementation defect;
- economic design flaw;
- privacy flaw;
- resource-abuse flaw;
- operational flaw;
- governance/process flaw;
- evidence gap;
- production-readiness gap;
- not applicable.

No mitigation is authorized merely by this checklist.

**BACKLOG DELTA: NOT YET DETERMINED by this checklist entry.**

---


## 3.26 Independent Multi-Agent / Multi-Model Red Team

Sails already carries Red Team, Network Simulation, Threat Model and external-audit
obligations elsewhere in the repository. This entry adds a missing institutional
property: **the same intelligence that helps design/build the system must not be
the only intelligence that tries to break it.**

Preserve:

> **Builder intelligence ≠ sole adversarial reviewer.**

> **Model agreement ≠ evidence.**

> **Multiple reviewers repeating the same assumptions ≠ independent scrutiny.**

> **A Red Team should try to falsify properties, not merely accumulate findings.**

### Independent-review principle

Where practical, important security/architecture gates should be challenged by
independent reviewers that did not participate in the same reasoning chain.

This may include:
- different AI models/providers;
- separate AI sessions with intentionally different context;
- external human security reviewers;
- independent implementers/operators;
- external auditors.

No specific model/vendor is required or made part of Sails architecture.

### Three AI Red Team modes

#### 1. White-box Red Team

Receives:
- repository/code;
- architecture docs;
- ADRs;
- threat model;
- known assumptions;
- current evidence.

Mission:

> attack the implementation and try to falsify the properties the project
> explicitly believes are true.

Useful for:
- invariant attacks;
- cross-document contradictions;
- exploit chaining;
- concurrency/state-machine flaws;
- authority-boundary violations.

#### 2. Black-box Red Team

Receives only what a public attacker/integrator reasonably has:
- public API;
- public docs;
- wire behavior;
- deployed endpoints where authorized.

Mission:

> discover what can be inferred, manipulated, exhausted, confused or abused
> without privileged design context.

Useful for:
- external attack surface;
- information disclosure;
- protocol fingerprinting;
- API abuse;
- UX/DX ambiguity;
- assumption leakage.

#### 3. Blind / Hostile Architecture Review

Receives enough artifacts to inspect the system but deliberately does **not**
inherit the project's architectural justifications or prior conclusions.

Mission examples:

> Find how to steal value, create double commitments, fragment liquidity,
> censor participants, gain economic authority, exploit arbitration, violate
> privacy, or produce catastrophic resource exhaustion.

The purpose is to reduce shared-bias contamination.

### Diversity requirement

For high-impact gates, ask whether independent reviewers differ in at least one
of:

- model/provider;
- prompt/mission;
- context exposure;
- attacker objective;
- implementation language assumptions;
- knowledge of prior findings.

If every Red Team receives the same narrative and reaches the same answer, that
may be correlated reasoning rather than independent evidence.

### Findings are not votes

Never use:
"3 AIs say it is safe"
as evidence.

Instead require:
- reproduced exploit;
- falsified property;
- concrete counterexample;
- adversarial test;
- independently verifiable reasoning;
- or explicit failure to falsify within a bounded tested scope.

Preserve:

> **Consensus among reviewers ≠ protocol consensus.**

> **No exploit found ≠ no exploit exists.**

### Role separation in current Sails workflow

Conceptually preserve:

- **Executor / Builder**: implements scoped missions.
- **CTO Gate**: classifies evidence, architecture and claims.
- **Independent Red Team(s)**: attempts to falsify assumptions/properties.
- **External human review/audit**: independent scrutiny before high-risk production.
- **Production feedback / incident replay**: continuously updates the threat model.

These are roles, not permanent vendor assignments.

### When mandatory

Independent adversarial review should be strongly considered for:

- protocol-semantic changes;
- cryptographic changes;
- identity/recovery changes;
- settlement/funds-authority changes;
- arbitration changes;
- node-economics/incentive changes;
- cross-node/distributed-state changes;
- new transports/providers/rails;
- production security gates;
- remediation of critical vulnerabilities.

### Anti-Goodhart rule

Do not optimize for:
- number of AI reviewers;
- number of vulnerabilities reported;
- number of pages in security reports;
- reviewer agreement percentage.

Optimize for:

> **How many important properties survived serious independent attempts to falsify them?**

### Institutional flow

```
property / claim
→ builder evidence
→ CTO Gate
→ independent adversarial review
→ falsification attempt
→ correction if needed
→ durable regression/evidence
→ bounded freeze
```

This entry strengthens existing Red Team / Network Simulation / external audit
obligations; it does not duplicate or replace them.

**BACKLOG DELTA: candidate process/evidence delta only; requires dedicated
reconciliation before promotion to Master Backlog.**

---


## 3.27 Incident Replay Case — lnp2pBot / Duplicate Economic Identifier Semantic Split

This entry preserves a concrete external incident as an adversarial reference
case for Sails Day-0 completeness.

The purpose is not to make Lightning or BOLT11 part of Sails architecture.
The purpose is to extract the violated property and replay that class of failure
against every Sails technology boundary.

### External incident pattern

A downstream application and the execution system consumed the same economic
object but derived different authoritative identifiers from it.

In the cited lnp2pBot incident, a BOLT11 invoice containing duplicate
`payment_hash` fields was interpreted differently across components:

- the downstream parser/library selected one occurrence;
- the Lightning node selected another;
- both components operated on the same serialized object;
- bookkeeping truth and settlement truth diverged.

The relevant upstream parser correction changed behavior from overwriting the
payment identifier on every occurrence to retaining the first observed
identifier.

Important lesson:

> **Same bytes ≠ same semantic interpretation across components.**

> **Cryptographically valid object ≠ semantically unambiguous object.**

> **Component conformance ≠ composition safety.**

> **Parsed economic identifier ≠ settlement identifier actually used by the rail.**

### Day-0 property for Sails

For every economically authoritative object crossing a trust boundary:

> **Sails' interpretation must correspond exactly to the interpretation used by the component that actually executes or verifies the economic action.**

No adapter/provider/parser may silently reinterpret a signed or committed
economic object into a different value, identifier, destination, asset,
network, rail, amount, policy, or authority domain.

### Required adversarial questions

For every parser/provider/rail/adapter boundary ask:

- Can duplicate fields be accepted?
- If duplicates exist, which occurrence wins?
- Does Sails choose the same occurrence as the executing system?
- Are unknown fields ignored, rejected, or preserved differently?
- Can ordering alter meaning?
- Can different parsers normalize the same bytes differently?
- Can numeric coercion, whitespace, Unicode, case, encoding, or canonicalization
  produce different interpretation?
- Can one implementation accept what another rejects?
- Can a provider execute a destination/identifier different from what Sails
  persisted as the intended one?
- Can parsing success occur while semantic equivalence is false?

### Candidate mutation classes

Future Red Team / conformance tests should generate, where applicable:

- duplicate semantic identifiers;
- duplicated fields with conflicting values;
- repeated tags;
- unknown fields;
- out-of-order fields;
- non-canonical encodings;
- alternate but valid encodings;
- boundary-size values;
- numeric precision edge cases;
- Unicode/lookalike data;
- cross-version representations;
- malformed-but-accepted objects;
- valid-but-weird objects.

The test question is not merely:

> "Does Sails parse this?"

It is:

> **"Do Sails and the real executing/verifying component derive exactly the same economic meaning from this object?"**

### Reconciliation lesson

This incident also reinforces a second property:

> **Intended action identity must be durably comparable with execution reality.**

Where external execution occurs, Sails should be able to reconcile:

```
intended economic action
→ durable intended identifier / commitment
→ external execution
→ externally observed authoritative result
→ reconciliation
→ divergence = explicit incident / fail-closed state
```

A parser-derived identifier must not be treated as sufficient proof of what the
external rail actually executed.

### Security-signaling lesson

The incident also demonstrates an operational supply-chain risk:
security-relevant behavior may change inside an ordinary dependency release
without sufficiently explicit security signaling.

Therefore dependency review should ask:

- Did a release change security-relevant parsing or validation semantics?
- Did the changelog disclose that significance?
- Did the release combine a security correction with unrelated breaking
  infrastructure changes?
- Could maintainers downstream reasonably interpret the release as optional
  maintenance rather than urgent remediation?

This reinforces the previously registered technology-incident replay and
dependency-monitoring obligations.

### Sails application domains

Replay this failure class against any relevant boundary including:

- OfferEnvelope parsing;
- trade-open anchors;
- asset/network/rail identifiers;
- quote and amount representation;
- payment-destination commitments;
- wallet adapters;
- settlement providers;
- WDK-backed actions;
- Lightning/Spark integrations;
- Liquid/Elements integrations;
- EVM transaction intent/execution;
- DePix/PIX provider payloads;
- arbitration evidence/rulings;
- identity and transport bindings;
- future independent SDK implementations.

No claim is made that any of these boundaries currently contain this flaw.

### Institutional classification

This is an **Incident Replay / Evidence Obligation seed**.

It does not automatically create one implementation ticket per integration.

During the Day-0 confrontation pass, classify each real boundary as:

- structurally impossible;
- already covered by canonical semantics/evidence;
- requires adversarial conformance test;
- current implementation defect;
- provider-specific production gate;
- not applicable.

Preserve the compact rule:

> **One serialized economic object must not have two authoritative meanings.**

**BACKLOG DELTA: NOT YET DETERMINED by this incident-memory entry.**

---


## 3.28 Incident Replay Tasks — Historical Failures as Day-0 Antibodies

This section turns selected historical incidents from Bitcoin, Lightning and
adjacent financial infrastructure into reusable Sails adversarial tasks.

The purpose is not to collect famous hacks.
Each incident earns a place only if it contributes a distinct violated property
that Sails should be forced to confront.

### A. Implementation resource limit becomes protocol validity

Historical reference class: Bitcoin's 2013 Berkeley DB / LevelDB chain split.

Extracted property:

> **Local implementation constraints must never silently become protocol validity rules.**

Sails replay questions:

- Can database limits cause one conforming implementation to reject an object another accepts?
- Can cache size, transaction limits, queue limits, parser limits or runtime limits alter economic validity?
- Can Postgres/Prisma behavior become de facto protocol semantics?
- Can different SDK/runtime languages disagree because one hits implementation-specific limits first?
- Can a large but valid Offer/evidence/dispute object split interpretation across implementations?

Task outcome classification:
already impossible / evidence required / implementation defect / protocol ambiguity / not applicable.

---

### B. Optimization bypasses an economic invariant

Historical reference class: Bitcoin CVE-2018-17144.

Extracted property:

> **Optimization must not bypass an invariant merely because another layer is expected to enforce it.**

Sails replay questions:

- Can dedup skip a validation previously enforced elsewhere?
- Can cache shortcuts bypass signature/authority checks?
- Can batching alter exact-once or replay semantics?
- Can pagination/projection omit state required for safety?
- Can performance work around reconciliation/state-machine code skip an invariant?
- Can “fast path” and “slow path” produce different economic outcomes?

Permanent review question:

> **What invariant disappeared because this code became faster?**

---

### C. Boundary value breaks control-flow completeness

Historical reference class: Lightning/LND malformed or edge-valued gossip DoS classes.

Extracted property:

> **Boundary-valid or parser-valid values must be tested across complete control flow, not only input validation.**

Sails mutation tasks should include, where applicable:

- zero;
- empty;
- minimum;
- maximum;
- first/last;
- duplicate;
- missing optional field;
- unexpected-but-valid enum/version;
- stale timestamp;
- far-future timestamp;
- exact expiry boundary;
- single-element / zero-element collections.

Required question:

> **Does a boundary value create an uninitialized, unreachable, contradictory or panic-producing state later in the flow?**

---

### D. Valid parameter becomes an economic weapon

Historical reference class: Lightning fee/state interactions where individually
valid parameters can become destructive when combined with later state transitions.

Extracted property:

> **Valid parameter in isolation ≠ economically safe parameter across state transitions.**

Replay against Sails:

- fees;
- quote expiry;
- settlement timeout;
- appeal deadline;
- dispute fee;
- slashing;
- collateral;
- trade limits;
- retry count;
- provider finality thresholds;
- inventory reservation;
- reputation thresholds.

Attack question:

> **Can an attacker choose a protocol-valid value today that becomes coercive, destructive, censoring or value-extracting in a later state?**

---

### E. False independence between trust domains

Historical reference class: systems with multiple validators/verifiers that rely
on the same compromised RPC, cloud, oracle or infrastructure provider.

Extracted property:

> **Independent components ≠ independent trust domains.**

> **Redundancy without control-plane diversity may be one dependency wearing several names.**

For every apparently-independent path map:

- cloud provider;
- RPC provider;
- DNS;
- package registry;
- CI/release infrastructure;
- bootstrap source;
- oracle/price source;
- identity provider;
- model/AI provider;
- storage provider;
- settlement infrastructure.

Required question:

> **What single upstream dependency can simultaneously corrupt several supposedly independent observations?**

Future evidence should distinguish:
logical diversity
≠
operator diversity
≠
infrastructure diversity
≠
trust-domain diversity.

---

### F. Peripheral dependency compromises the whole process

Historical reference class: Bitcoin/Bitcoin-Core adjacent dependency RCE classes
and other supply-chain vulnerabilities.

Extracted property:

> **A non-economic dependency can still gain process-level authority.**

Sails replay questions:

- Can a UI/docs/static-file dependency execute inside the main node process?
- Can a parser, logger, metrics library or image processor access secrets?
- Can an SDK transitive dependency gain filesystem/network/process authority?
- Can post-install/build scripts alter release artifacts?
- Can dependency compromise reach signing material or settlement credentials?

Desired property:

> **Peripheral capability should run with peripheral authority.**

---

### G. Security fix hidden inside ordinary dependency release

Historical reference class: lnp2pBot / `invoices` semantic-split incident.

Extracted operational property:

> **Security relevance must be detected independently of changelog quality.**

Task:

For critical dependencies, future dependency monitoring should be able to ask:

- what code actually changed?
- did parsing/validation/crypto/authority behavior change?
- did the release quietly close an exploitable condition?
- did a security correction ship together with unrelated breaking changes?
- would waiting for a routine upgrade leave Sails exposed?

Preserve:

> **Changelog silence ≠ security irrelevance.**

---

### Historical-incident replay rule

For every future relevant incident:

```
incident
→ identify violated property
→ check if property is already institutionalized
→ if new, add property
→ replay against actual Sails boundaries
→ evidence / defect / backlog classification
→ durable regression where justified
```

Do not add incidents that merely repeat an already-catalogued property without
adding useful evidence or a stronger adversarial formulation.

### Day-0 usage

These tasks must be brought back when their corresponding Sails surface becomes
real, especially during:

- independent implementation/conformance work;
- performance optimization;
- distributed-state/gossip implementation;
- settlement and fee design;
- provider/RPC redundancy design;
- dependency upgrades;
- Production Readiness and Final Red Team.

**BACKLOG DELTA: NOT YET DETERMINED by these incident-replay tasks.**

---


## 3.29 Incident Replay Tasks — Deployment, Recovery, Control-Plane and Economic Manipulation

This section adds historical incident classes that contribute distinct adversarial
properties not already captured strongly enough elsewhere.

The rule remains:

> **Incident name is not the lesson. The violated property is the lesson.**

### A. Knight Capital — partial deployment + dormant code + reused control flag

Reference class: the 2012 Knight Capital incident in which one production server
remained on old code while a repurposed flag activated dormant behavior, producing
catastrophic unintended trading.

Extracted properties:

> **Partial deployment must never create multiple economic meanings for the same control signal.**

> **Dormant code is still attack surface if it remains executable.**

> **Deployment completeness is a safety property, not an operations nicety.**

Sails replay questions:

- Can two nodes on supposedly the same release interpret the same flag/config differently?
- Can a deprecated feature remain reachable through a reused enum, flag, route, or message type?
- Can one stale operator instance remain economically active after a rollout?
- Can a config key acquire a new meaning while old binaries still interpret the old one?
- Is there machine-verifiable evidence that all instances intended for a coordinated rollout run compatible code/config?
- Can an emergency rollback reactivate previously-dead behavior?

Required future attack:
mixed-version / stale-instance execution against a real economic flow.

---

### B. GitLab 2017 — recovery plan exists, backups fail when actually needed

Reference class: GitLab.com's 2017 database outage and partial data loss, where an
operational mistake deleted primary data and several backup/recovery paths were
unusable or stale.

Extracted properties:

> **Backup existence ≠ recoverability.**

> **Recovery procedure not exercised under failure conditions ≠ recovery capability.**

> **The recovery system must not depend on the failed system remaining healthy.**

Sails replay questions:

- Are node identity backups actually restorable?
- Can signed economic state be reconstructed after DB loss?
- Can backups restore stale/cancelled facts and accidentally resurrect them?
- Does recovery require the same cloud/account/control plane that may be unavailable?
- Are recovery credentials themselves protected and tested?
- Can disaster recovery preserve authority boundaries instead of recreating them manually?

Required evidence:
destructive restore drill / clean-environment recovery, not merely backup creation.

---

### C. Cloudflare 2019 — safety mechanism removed during optimization + global rollout

Reference class: Cloudflare's 2019 WAF outage, where a pathological regular
expression exhausted CPU globally; a protection against excessive CPU usage had
previously been removed during a refactor, the test suite did not measure the
resource property, and rollout was global.

Extracted properties:

> **A functional test suite can pass while a resource-safety invariant is absent.**

> **Safety mechanisms removed during refactoring must be treated as semantic changes.**

> **Global rollout multiplies local mistakes into systemic failure.**

Sails replay questions:

- Do tests assert bounded CPU/memory/bandwidth, not only correct output?
- Can regex/parser/canonicalization complexity be adversarially superlinear?
- Can a refactor silently remove rate/resource guards?
- Can one configuration/rule update hit every Sails-operated or partner node simultaneously?
- Can staged rollout/canarying limit blast radius for reference infrastructure without becoming protocol authority?

Required future evidence:
complexity/property tests and staged-failure simulation for critical runtime rules.

---

### D. Cloudflare 2023/2025 — control plane depends on the failed dependency

Reference class: incidents where Workers KV failures impacted services and even
tools needed to roll back or authenticate into recovery paths.

Extracted properties:

> **Control plane must not share the exact failure domain of the system it must recover.**

> **Break-glass that has never been exercised is an assumption, not a capability.**

Sails replay questions:

- Can node operators still stop/rollback/rotate credentials if their normal auth/provider is down?
- Does incident communication depend on the same infrastructure being recovered?
- Can a dependency outage prevent access to secrets needed for remediation?
- Is there a minimal recovery path with fewer dependencies than normal operation?
- Can emergency control be exercised without granting broader economic authority?

---

### E. Nomad Bridge — default/zero state accidentally treated as trusted

Reference class: Nomad's 2022 bridge incident, where an initialization/configuration
state caused unproven messages to be accepted as proven and made exploitation
trivially copyable.

Extracted properties:

> **Default / zero / uninitialized state must never mean authorized unless explicitly proven safe.**

> **Fail-open initialization in value-moving systems is catastrophic.**

> **An exploit that is easy to copy changes attacker population from one adversary to everyone watching.**

Sails replay questions:

- Can zero hash / empty signer / missing policy / null binding / default enum become "valid"?
- Does database migration create temporary permissive states?
- Can unset maturity/custody/rail fields fall back to production-eligible defaults?
- Can an uninitialized arbitration/provider state become implicitly trusted?
- If one exploit transaction/message becomes public, can arbitrary observers cheaply replay it?

Required mutation:
zero/default/uninitialized values across every authority-bearing object.

---

### F. Ronin Bridge — quorum diversity was nominal, not operationally independent

Reference class: the 2022 Ronin bridge compromise, where enough validator keys
were compromised to satisfy the bridge's authorization threshold, including an
old delegated authorization path that had remained active.

Extracted properties:

> **Threshold count ≠ trust-domain diversity.**

> **Revoked-in-intent but still-active delegation is live authority.**

> **Authorization topology must be evaluated by who controls the keys, not how many keys exist.**

Sails replay questions:

- Can multiple apparently independent roles/keys be controlled by one operator?
- Can old delegated capabilities remain valid after their operational purpose ends?
- Can one cloud/account/host compromise reach several signers?
- Does a threshold policy actually cross organizational/infrastructure trust domains?
- Are temporary grants automatically expired/revoked?

---

### G. Mango Markets — valid market actions manipulate an externalized economic oracle

Reference class: Mango Markets 2022, where market activity manipulated an oracle-
derived price and inflated collateral value sufficiently to withdraw assets.

Extracted properties:

> **Externally observed market price can be protocol-valid and economically manipulated at the same time.**

> **Oracle correctness ≠ market integrity.**

> **An attacker may use legitimate trades to manufacture the state that authorizes a later action.**

Sails replay questions:

- Can thin-liquidity price sources be moved cheaply relative to economic exposure?
- Can a participant trade against themselves/colluders to alter reputation, price, liquidity or entitlement?
- Can one observed market feed unlock a larger withdrawal/limit/reputation benefit?
- Are price-source liquidity/depth/freshness properties part of risk assessment?
- Can external valid state be economically adversarial even if cryptographically authentic?

---

### H. Parity multisig freeze — shared library becomes shared catastrophic dependency

Reference class: the 2017 Parity multisig freeze, where many wallets depended on
a shared library contract whose destruction rendered dependent wallets unable to
execute their logic.

Extracted properties:

> **Shared code reuse can create shared fate.**

> **Replaceable implementation is not truly replaceable if all live state depends on one instance.**

> **Dependency destruction/unavailability can be as catastrophic as dependency compromise.**

Sails replay questions:

- Can one shared service/library/provider disappearance freeze many open trades?
- Does a supposedly replaceable provider hold unique state needed to complete existing commitments?
- Can adapters be replaced mid-lifecycle without changing economic meaning?
- Are historical commitments executable if the original dependency disappears?
- Does a common library or service create a protocol-wide single point of liveness?

---

### Composite adversarial rule

These incidents add a broader Day-0 question:

> **Can a locally reasonable operational choice become globally economic because deployment, recovery, control-plane, or dependency boundaries were not modeled as part of protocol safety?**

Future Red Team passes should explicitly include:

- mixed-version fleet;
- stale binary/config;
- dormant code reactivation;
- failed restore;
- unavailable control plane during incident;
- zero/default authorization state;
- nominally-diverse but commonly-controlled signers;
- market-manipulated external state;
- shared dependency disappearance.

Do not create one implementation ticket per historical incident.
During the relevant Sails phase, replay the violated property and classify the
actual result into Backlog / Technical Debt / Evidence / Partner Beta /
Production Readiness / Not Applicable.

**BACKLOG DELTA: NOT YET DETERMINED by these incident-replay tasks.**

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
