# Sails P2P Trading SDK Paper

### Why a Wallet Integrates the First Product Built on Sails Protocol
### September 2026

> **Document role:** Product and integration companion for the Sails P2P Trading SDK. This paper translates the same Institutional Truth used by the Sails Protocol Whitepaper and Sails Technical Paper. It does not govern the protocol or the SDK API contract.
>
> **API authority:** `docs/API_STABLE.md` governs the real frozen public SDK surface. `docs/SDK_GUIDE.md` is onboarding and integration guidance. If this paper ever disagrees with either on a concrete method or contract, `API_STABLE.md` wins.
>
> **Current system map:** `docs/SYSTEM_DESIGN.md` is the consolidated technical orientation path for how the SDK sits inside the wider Sails architecture. It summarizes current architecture and routes readers to governing sources; it does not replace them.

---

# 1. Why Integrate?

A non-custodial wallet is already good at the things it was built to do:

- hold keys;
- derive addresses;
- sign transactions;
- receive assets;
- send assets;
- show balances and history.

That does not automatically make it a marketplace.

The moment users want to transact economically with strangers, the wallet needs capabilities that ordinary wallet infrastructure does not provide by itself:

- discovery;
- negotiation;
- offer management;
- counterparty context;
- settlement coordination;
- disputes;
- evidence;
- reputation;
- recovery;
- operational state.

A wallet team can build all of that alone.

Or it can integrate a shared coordination layer.

The Sails P2P Trading SDK exists for the second path.

> **The SDK is not valuable because it is a library. It is valuable if it lets a wallet participate in economic activity it would otherwise have to build, operate, and bootstrap alone.**

---

# 2. What a Wallet Stops Having to Build Itself

The core integration thesis is practical.

| Capability | Building Alone | With Sails P2P Trading SDK |
|---|---|---|
| Offer publishing and discovery | Build marketplace backend and API | Use Sails liquidity / offer surfaces |
| Trade lifecycle | Design and persist state machine | Use OpenP2P lifecycle |
| Negotiation / chat | Build realtime transport and reconnect behavior | Use SDK trade/chat capability |
| Settlement coordination | Build rail/provider abstraction and lifecycle | Use OpenSettlement surfaces |
| Dispute flow | Design roles, state, evidence, rulings | Use Sails dispute capabilities |
| Reputation | Build isolated trust history | Use OpenReputation capability |
| Evidence / proofs | Build ad hoc evidence format and verification | Use OpenProof surfaces |
| Agent assistance | Build local intelligence integration and controls | Use OpenAgents / QVAC-backed capabilities |
| Capability / permission model | Build per-action policy semantics | Use Sails capability architecture where enforced |
| Partner interoperability | Build custom contracts per counterparty | Integrate against one public SDK surface |

This does not mean the wallet stops owning its product.

The wallet still controls:

- brand;
- customer relationship;
- UI and product experience;
- wallet keys and custody model;
- jurisdiction-specific obligations;
- which Sails capabilities it exposes;
- which product journeys it considers eligible.

Sails supplies coordination infrastructure.

The wallet remains the wallet.

---

# 3. The SDK Is the Entry Point, Not the Protocol

The Sails P2P Trading SDK is the first concrete developer product built on Sails Protocol.

It is not the semantic definition of Sails.

The relationship is:

```text
Wallet / Application
       ↓
Sails P2P Trading SDK
       ↓
Sails Protocol capabilities
       ↓
Runtime / Modules / Providers
       ↓
Settlement, transport, intelligence and external systems
```

The SDK provides a typed integration surface so an application does not need to integrate each module through unrelated APIs.

The SDK should contain as little independent business logic as possible.

Where economic semantics belong to a protocol module, the SDK should expose them rather than reinvent them.

This boundary is important for partner parity.

A reference UI should not have privileged economic behavior unavailable to an external integrator using the public SDK.

---

# 4. One Client, Multiple Capability Surfaces

The current SDK exposes one `SailsClient` with protocol-oriented module surfaces and friendly aliases where useful.

Examples include areas such as:

- `identity` / `auth`;
- `liquidity` / `offers`;
- `openp2p` / `trades`;
- `settlement` / `escrow`;
- `reputation` / `trustScore`;
- `peers`;
- `capabilities`;
- `arbitration`;
- `paymentAccounts`;
- `proof`;
- `agents`.

The exact contract is deliberately not duplicated here.

`API_STABLE.md` is the frozen source for method names, parameter shapes, return shapes, aliases, and stability tiers.

This paper explains the product meaning of the surface, not its TypeScript declaration file.

---

# 5. Stability Matters More Than Feature Count

For an external wallet, an SDK is only useful if the public surface is dependable.

The Sails SDK therefore distinguishes between:

- frozen methods;
- additive methods;
- experimental methods.

The current v0.1 contract explicitly commits not to make silent breaking changes to frozen public surfaces before v1.

This is more useful to an integrator than claiming every experimental capability is already stable.

A smaller honest surface is more valuable than a larger misleading one.

---

# 6. Integration Paths

An integrator does not need to consume Sails in only one way.

The current product model supports two practical integration paths inside the same integrator role.

## 6.1 Wallet-integrated path

The wallet owns the user experience and wallet signing.

Sails supplies economic coordination capabilities behind that interface.

This is the path most aligned with the thesis:

> **one economic reality, multiple actor-specific experiences.**

## 6.2 Service / backend path

A fintech, marketplace, or service can integrate Sails capabilities without necessarily shipping its own wallet UI.

The same protocol semantics should remain available through the public integration surface.

The two paths should not create two different versions of economic truth.

---

# 7. Wallet Authority Stays With the Wallet

Integration must not silently transfer sovereignty.

The SDK may request signatures or wallet operations through defined adapters.

It should not require the integrating wallet to surrender raw private keys to the protocol.

The architecture preserves distinctions such as:

> **Wallet capability ≠ economic authority.**
>
> **Authentication ≠ authorization.**
>
> **Technical capability ≠ protocol permission.**
>
> **Protocol permission ≠ economic authority.**

A wallet can technically sign a transaction without being economically authorized to perform every possible transaction.

This is one of the reasons Sails separates wallet adapters, settlement providers, destination authority, and execution authority.

---

# 8. Partner Wallet Integration

Partner integration is a core product concern, not an afterthought.

The architectural objective is that an independent wallet can participate without needing privileged knowledge of Satsails internals.

That requires:

- a public SDK surface;
- stable method contracts;
- explicit capability requirements;
- documented session/auth behavior;
- no hidden reference-UI-only economic path;
- provider and rail semantics that do not depend on one wallet implementation;
- errors meaningful enough for a third-party product to handle correctly.

Partner parity does not mean every wallet must expose the same UI.

It means the reference implementation must not depend on secret semantic privilege unavailable to an external integrator.

---

# 9. P2P Trading as the First Product

P2P trading was chosen because it forces the coordination layer to confront real economic complexity early.

A functioning P2P trade may require:

```text
Identity
→ Offer / Discovery
→ Intent
→ Trade
→ Negotiation
→ Settlement coordination
→ Payment evidence
→ Release / Refund / Dispute
→ Outcome
→ Reputation
```

This is a much stronger proving ground than a demo that merely routes a payment.

P2P trading exposes failure modes such as:

- counterparties disappearing;
- disputed external payments;
- settlement timing uncertainty;
- duplicate requests;
- stale authority;
- wrong destination handling;
- arbiter behavior;
- evidence quality;
- provider availability;
- reconciliation.

The SDK therefore acts as the first product-level stress test of the broader Sails architecture.

---

# 10. Settlement Reality

An integrator must distinguish product scope from implementation reality.

Sails Day-0 architecture models settlement through:

```text
Asset
+
SettlementRail
```

This is different from the older pattern of encoding asset and network into one flat identifier.

A product scope may be registered even when no provider exists yet.

A provider may exist without being production eligible.

A provider registration may be structurally compatible without being currently available.

Therefore:

> **Protocol-representable ≠ Product-eligible.**

and:

> **Registration ≠ Availability ≠ Health ≠ Eligibility.**

An integrating wallet should expose only journeys whose product eligibility has actually been established.

---

# 11. Adaptive Execution Is Not Magic Routing

The settlement architecture is moving toward explicit execution candidates.

The intended model is:

> **One intent. Many possible paths. One economic truth.**

Today, the real implementation supports a bounded structural resolution case where one compatible provider candidate exists.

It does not yet implement a general production policy engine that chooses among several eligible providers using cost, risk, liquidity, availability, or preference.

This is important for integrators.

The SDK should not market "smart routing" ahead of the actual eligibility and selection architecture.

**Status: In Validation / bounded implementation.**

---

# 12. Reputation: Real Capability, Bounded Claim

OpenReputation is real.

A wallet can retrieve reputation information through the SDK.

The protocol direction is that economic history should not inherently belong to one application interface.

But three claims must remain separate.

## Implemented

Reputation capability exists and is associated with participant identity.

## Architectural portability

The model is intended to remain independent from one wallet UI.

## Ecosystem portability

Multiple independent wallets actually recognizing and reusing the same history at scale requires ecosystem adoption and interoperability evidence.

The third is not assumed merely because the first two exist.

---

# 13. Evidence and Disputes

A P2P wallet needs more than a "report problem" button.

Sails exposes real dispute and proof capabilities through the SDK.

The broader model distinguishes:

- a claim;
- an assertion;
- evidence;
- verification;
- a dispute decision;
- settlement execution.

These distinctions matter because a submitted screenshot, message, agent inference, or provider report is not automatically truth.

The integrating wallet should preserve the same boundaries the protocol now makes explicit:

```text
Evidence bytes ≠ Evidence truth
Evidence availability ≠ Evidence integrity
Authentication ≠ Evidence Authorization
Valid evidence ≠ authorized evidence placement
Evidence storage provider ≠ protocol authority
```

Real media/file evidence belongs on the OpenProof path rather than being treated as an opaque field on a dispute record. Production storage hardening remains active Day-0 work; the existence of an S3-compatible adapter must not be marketed as live production-provider validation until that evidence actually exists.

The integrating wallet should present evidence honestly rather than flattening it into certainty the protocol does not possess.

**General Evidence / Auditability architecture remains In Validation.**

---

# 14. Agents and QVAC

The SDK exposes agent capability without treating AI as sovereign authority.

Current QVAC-backed functionality can support activities such as:

- structured intent generation;
- offer generation or interpretation;
- risk assessment;
- negotiation assistance.

The governing boundaries are:

> **Intelligence ≠ Authority.**
>
> **Recommendation ≠ Authorization.**
>
> **Inference ≠ Evidence.**
>
> **Model confidence ≠ Protocol truth.**

Today, assistive agents are real.

A future delegated-authority agent would require an explicit mandate model and separate authorization semantics.

That future capability should not be implied by today's SDK access to `agents`.

---

# 15. What Integration Should Feel Like

The integrator should not need to understand every internal module to complete a normal product journey.

The desired experience is:

```text
User economic action
        ↓
Wallet product flow
        ↓
Sails SDK
        ↓
Protocol capabilities
```

The user should experience:

- create or discover an offer;
- negotiate;
- pay;
- confirm;
- dispute if necessary;
- complete.

The user should not need to reason about:

- provider registries;
- evaluator profiles;
- internal transition records;
- transport implementation details;
- adapter class names.

The design rule is:

> **Hide complexity, preserve truth.**

The wallet may compress architecture.

It should not conceal economically relevant uncertainty, authority, fees, destination, or recovery state.

---

# 16. Why a Shared Marketplace Matters

The SDK's long-term value grows if independent wallets participate in the same economic environment.

A shared market does not require one mandatory Sails-operated application or node. The Day-0 architecture targets multiple independent node/runtime operators participating in the same economic market universe, with node choice treated as a service-level decision rather than market membership.

The same SDK can also participate in bounded private/permissioned market contexts. An OTC desk, business, community, or professional group may restrict admission or discovery while preserving the same Sails trade, settlement, evidence and outcome semantics.

```text
Node choice ≠ market membership
Market admission policy ≠ protocol truth
Private market ≠ different economic semantics
```

Without shared coordination:

```text
Wallet A → Market A
Wallet B → Market B
Wallet C → Market C
```

Each wallet bootstraps:

- counterparties;
- liquidity;
- trust;
- market activity;
- dispute history;
- economic relationships.

With interoperable coordination, the target direction becomes:

```text
Wallet A ─┐
Wallet B ─┼→ Shared economic coordination → multiple interfaces
Wallet C ─┘
```

This does not mean all wallets become one product.

Each keeps its interface, brand, and user relationship.

The network effect remains a hypothesis until independent integrations actually create it.

The architecture makes it possible.

Adoption must prove it.

---

# 17. Economic Case

A wallet integration must justify engineering cost.

The economic case for Sails comes from capabilities a wallet would otherwise need to build or outsource, combined with the possibility of shared economic activity across integrations.

The protocol economy does not require a native speculative token.

The broader economic architecture includes concepts such as protocol fees and future integration or infrastructure business models.

Not every revenue path is implemented today.

The SDK paper therefore makes a narrower claim:

> **Sails can lower the cost of adding a P2P marketplace capability and creates architecture for an integrator to participate in future shared economic activity.**

It does not promise a specific revenue amount or existing network-effect income.

---

# 18. Reference Implementation Evidence

Satsails is valuable to the SDK story because it gives Sails contact with a real product environment.

It should not be used to collapse:

```text
Satsails Wallet = Sails Protocol
```

or:

```text
Satsails production history = proof that every SDK path is production-ready
```

The correct use of the reference implementation is narrower:

- validate product assumptions;
- exercise real integration flows;
- expose lifecycle problems;
- reveal API friction;
- test whether abstractions survive a real wallet product;
- produce evidence that can be inspected and corrected.

The same SDK should remain usable by an independent partner wallet without relying on Satsails-only semantics.

---

# 19. API and Developer Journey

This paper deliberately avoids duplicating the full API.

The current documentation roles are:

## `API_STABLE.md`

The frozen public contract.

Use it to determine exactly what names and shapes an integration may depend on.

## `SDK_GUIDE.md`

How to build a real integration.

Use it after the golden path to understand module surfaces, retries, wallet compatibility, and integration details.

## `TRANSACTION_WALKTHROUGH.md`

How a concrete transaction flows through the system.

## `DEVELOPER_JOURNEY.md`

How a developer moves from first working example to deeper integration understanding.

## This paper

Why the integration exists, where responsibilities sit, and what an integrator should understand strategically before adopting it.

---

# 20. Day-0 SDK Reality

| Area | Current status |
|---|---|
| `@satsails/p2p-trading-sdk` package | **Implemented** |
| Core public module surfaces | **Implemented** |
| Pre-v1 API compatibility contract (originated in v0.1; current package line 0.2.0) | **Frozen by tier** |
| Identity/auth | **Implemented** |
| Offer/liquidity surfaces | **Implemented** |
| Trade lifecycle | **Implemented** |
| Realtime trade chat | **Implemented** |
| Settlement surfaces | **Implemented; rail/provider maturity varies** |
| Dispute surfaces | **Implemented** |
| Reputation surfaces | **Implemented** |
| Proof surfaces | **Implemented / broader auditability still In Validation** |
| Production evidence-provider durability / provenance | **In Validation; live provider evidence not yet claimed** |
| Multi-operator shared-market topology | **Frozen Day-0 target / external reality evidence incomplete** |
| Open/private market participation semantics | **Supported by architecture; concrete product/network behavior remains deployment/context specific** |
| Agent surfaces | **Implemented for assistive use** |
| Delegated agent authority | **Future Vision / not Day-0 authorized** |
| Asset + SettlementRail architecture | **Frozen** |
| General provider selection | **In Validation / not implemented** |
| Settlement eligibility pipeline | **In Validation / incomplete** |
| Provider availability / health semantics | **In Validation** |
| Full cross-wallet network effect | **Future ecosystem outcome, not current proof** |

---

# 21. What the SDK Does Not Promise

Integrating Sails does not automatically mean:

- every asset or rail is executable;
- every registered provider is available;
- every settlement path is production-ready;
- every external payment can be cryptographically proven;
- every dispute will be resolved automatically;
- an agent can move funds autonomously;
- portable reputation has already achieved universal ecosystem portability;
- a second wallet automatically creates liquidity;
- the integrator can ignore its own legal or product obligations.

The SDK gives access to capabilities.

It also does not require one universal Sails identity. The Participant/economic identity remains distinct from wallet funds authority and transport identity; optional external identity ecosystems such as Nostr or Pubky must not be treated as mandatory SDK identity dependencies or as automatic economic authority.

Product eligibility remains a product responsibility informed by protocol truth.

---

# 22. The Integration Boundary

A clean mental model is:

## The wallet owns

- user relationship;
- UI;
- wallet keys;
- wallet-specific product policy;
- final human authorization where required;
- its own compliance and jurisdictional responsibilities;
- which protocol capabilities become user-facing product journeys.

## Sails coordinates

- protocol interaction semantics;
- shared P2P marketplace capabilities;
- offer/trade lifecycle;
- dispute and evidence surfaces;
- reputation semantics;
- settlement coordination abstractions;
- agent assistance boundaries;
- public integration contracts.

## Providers execute

- mechanism-specific settlement or external capabilities.

This boundary is healthier than asking one component to own all three roles.

---

# 23. Why Integrate Now?

The strongest reason to integrate early is not that every future capability already exists.

It is that the architectural foundations now distinguish the things a partner integration needs to trust:

- protocol semantics from implementation detail;
- wallet capability from economic authority;
- product scope from provider maturity;
- provider registration from availability;
- settlement meaning from execution mechanism;
- AI recommendation from authorization;
- reference implementation from protocol identity;
- stable API from experimental capability.

That makes the integration surface more credible than a feature checklist alone.

An early integrator still accepts real project maturity risk.

What it should not have to accept is ambiguity about what is real versus planned.

---

# Conclusion

A wallet does not need Sails to hold keys.

It does not need Sails to sign a normal transaction.

It needs Sails if it wants to participate in a broader economic environment without rebuilding the entire P2P coordination stack alone.

The integration proposition is therefore not:

> Install another wallet library.

It is:

> Keep your wallet, your brand, your custody model, and your user relationship while gaining a reusable coordination layer for discovery, negotiation, settlement coordination, disputes, evidence, reputation, and agent-assisted interaction.

The SDK is the door.

The protocol is the shared economic infrastructure behind it.

The long-term value appears if multiple independent applications walk through that door while preserving the same economic meaning.

> **Different interfaces. Different stacks. Shared economic meaning.**
