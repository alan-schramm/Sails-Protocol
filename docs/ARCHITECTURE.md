# ARCHITECTURE.md
### Sails Protocol — Engineering Handoff · Document 2 of 20

> Read `PROJECT_CONTEXT.md` first if you haven't. This document assumes you
> understand the Protocol/Module/Reference-Implementation hierarchy.

---

## 1. Layered Architecture — Protocol / Application / Infrastructure / Domain

This is the mandatory separation across the entire codebase. Every file you
write must belong to exactly one of these four layers, and must not reach
into another layer's responsibilities directly — only through events or
well-defined interfaces.

```
┌─────────────────────────────────────────────────────────────────┐
│ PROTOCOL LAYER                                                   │
│ Interfaces, event contracts, type definitions. Technology-        │
│ agnostic. Lives conceptually in packages/protocol-spec.           │
│ Examples: SettlementProvider interface, IntentPrimitive type,     │
│ EventContract type map.                                           │
├─────────────────────────────────────────────────────────────────┤
│ APPLICATION LAYER                                                 │
│ Orchestration of primitives to deliver a use case. This is where  │
│ Sails OpenP2P's trade lifecycle logic lives — it calls into        │
│ cross-module services but owns none of their internals.           │
├─────────────────────────────────────────────────────────────────┤
│ DOMAIN LAYER                                                      │
│ The actual business entities and their rules: Trade, Escrow,      │
│ Offer, User/Participant, ReputationEvent. Each entity belongs to   │
│ exactly one module (see moduleId in DATABASE.md).                 │
├─────────────────────────────────────────────────────────────────┤
│ INFRASTRUCTURE LAYER                                              │
│ How bytes actually move: HyperDHT/Hyperswarm P2P transport,       │
│ PostgreSQL connection, Redis connection, HTTP server (Fastify).   │
│ Infrastructure code must never know what a "Trade" or an "Offer"  │
│ is — it moves opaque payloads.                                    │
└─────────────────────────────────────────────────────────────────┘
```

### A real example of a layer violation that was found and fixed

During the last code review pass, `escrow.service.ts` (Domain/Application,
belongs to OpenSettlement) was calling `prisma.trade.update(...)` and
`prisma.user.update(...)` directly — reaching into Trade (owned by OpenP2P)
and User/reputation stats (owned by OpenReputation). This is exactly the
kind of violation this separation exists to prevent.

**Fix applied:** `escrow.service.ts` now only emits
`settlement.escrow.*` events. A new file, `common/events/handlers.ts`,
listens for those events and performs the Trade and User updates — keeping
each write inside the module that owns that data.

Another real example: `pear.service.ts` (HyperDHT/Hyperswarm transport —
pure Infrastructure) used to live inside `modules/identity/` (Domain). It
was moved to `infrastructure/p2p/pear.service.ts`. It was also found to
accept an `Offer`-shaped object in its `broadcastOffer()` method signature —
a Domain concept leaking into Infrastructure. Fixed by making the broadcast
method accept a generic `Record<string, unknown>` payload instead.

**The rule going forward:** if you're writing Infrastructure code and you
find yourself importing a type from a Domain module (`Offer`, `Trade`,
`User`), stop — that's a violation. Either the Infrastructure code should
accept an opaque payload, or the logic belongs in the Domain/Application
layer instead.

---

## 1B. The Core — 6 Formal Components (v7.1 — Principal Engineer decision)

Following the CTO architectural review and a formal test applied to every
proposed addition (see `PROTOCOL_SPECIFICATION.md` sections 1.10-1.11), the
Core is now six named components — not an implicit grab-bag of logic
scattered across `common/`:

```
Intent Engine        → routes Intents by type, never knows about modules
                        (PROTOCOL_SPECIFICATION.md section 2)
Coordination Engine   → receives Intent + Policy + Capability + Events,
                        decides, then activates modules. No module ever
                        calls another module directly — only the Core.
Event Bus             → namespaced {module}.{entity}.{action} events.
                        Exposes a per-Intent Timeline read projection
                        (RFC-007, rfcs/RFC-007-real-world-p2p-requirements.md,
                        decision D5) — ordered events for one intentId.
                        Considered and rejected as a 10th primitive in
                        that RFC; it lives here instead, consistent with
                        Event itself never being a primitive
                        (PROTOCOL_SPECIFICATION.md section 1.11).
                        RFC-008 (rfcs/RFC-008-verifiable-timestamps-and-
                        chained-timeline.md) hash-chains each
                        TimelineEntry (entryHash/prevHash, persisted on
                        EscrowEvent/ReputationEvent) so tampering is
                        detectable — this is the one place D5's original
                        "no new write path" claim was later corrected.
                        RFC-010 (rfcs/RFC-010-durable-event-store.md)
                        makes durability pluggable via a new EventStore
                        Adapter (protocol says "must be durable and
                        correlated," never names a backend — Redis
                        Streams/BullMQ stays a Reference Implementation
                        choice) and requires every event to carry a
                        correlationId (tradeId today, intentId once
                        Intent persistence exists; userId for
                        peer/transport events with no trade to correlate
                        to).
State Machine          → the canonical Intent lifecycle (9 states)
Capability Registry    → tracks which Capability (functional category,
                        e.g. trade-coordination) each moduleId implements,
                        and issues/checks CapabilityGrants (permissions) —
                        two related interfaces per RFC-005
                        (rfcs/RFC-005-capability-model.md), not one
Policy / Rules Engine  → FeePolicy, TrustPolicy, RoutingPolicy — consulted
                        by the Coordination Engine, never read directly
                        by a module. This is what turns PROTOCOL_ECONOMY.md's
                        prose-only fee model into an actual architectural
                        concept.
```

**Why Coordination Engine matters specifically:** today, cross-module
reactions live in `common/events/handlers.ts` (see section 5 below) — a
flat, reactive event listener. The Coordination Engine is the same idea
formalized and given real decision-making inputs (Policy + Capability, not
just the event payload) — the actual "brain" that decides what happens
next, rather than a bag of independent `eventBus.on(...)` handlers. This is
a Months 1-3 roadmap item, not something the current code fragment already
implements — see `TODO.md`.

## 1C. Four Layers (v7.1 — replaces an earlier 7-layer proposal)

```
Tether Ecosystem
    │
    ▼
Open Infrastructure Stack (WDK + Pears + QVAC)
    │
    ▼
Sails Protocol — Core Coordination Tier
    │   (Intent Engine · Coordination Engine · Event Bus ·
    │    State Machine · Capability Registry · Policy/Rules Engine)
    ▼
Capabilities (the 8 modules: OpenP2P · OpenSettlement · OpenLiquidity ·
              OpenIdentity · OpenReputation · OpenAgents · OpenFinance ·
              OpenProof — added RFC-006)
    │
    ▼
Applications (Reference Implementations + third-party integrations)
```

An earlier draft proposed seven numbered layers (Transport, Identity,
Coordination, Capabilities, Modules, SDK, Applications). This four-layer
version replaces it — simpler, and it was the CTO's own final synthesis
after reviewing the more granular version. Use this one.

## 2. The Economic Sub-Capabilities Grouping (conceptual middle layer)

Between the Protocol Layer's abstract interfaces and the concrete modules
sits a conceptual grouping of 7 sub-capabilities that any application
module draws on. **Naming note (v7.3):** this grouping was previously
called "Economic Coordination Layer" — renamed here to avoid colliding
with section 1C's "Sails Protocol — Core Coordination Tier," which is a
different thing (the whole protocol's position in the 4-tier ecosystem
view, not this 7-item internal grouping).

```
Participant Layer   — identity, trust, reputation
Discovery Layer      — find counterparties, liquidity, opportunities
Negotiation Sub-Layer — negotiate, agree, commit (chat + state machine)
Escrow Layer         — lock, protect, release funds
Settlement Layer     — on-chain execution (via WDK)
Communication Layer  — E2E channels (via Secretstream/Pears)
Intelligence Layer   — QVAC local AI (cross-cutting, not an isolated layer)
```

Note: "Intelligence Layer" (QVAC) is listed here for completeness, but it is
explicitly **not** a layer that other layers depend on. It is a
cross-cutting accelerator — any layer above can optionally call into it, but
none require it to function. This is intentional: the protocol must work
completely with human participants alone; QVAC is the natural evolution, not
the foundation. See `PROJECT_CONTEXT.md` section on the causal adoption
argument for why this distinction matters strategically as well as
technically.

---

## 3. The 8 Official Modules

Full detail (responsibilities, interfaces, event namespaces) is in
`PROTOCOL_SPECIFICATION.md`. Summary here:

### Cross-module services (used by any application module)

| Module | Responsibility |
|---|---|
| **Sails OpenIdentity** | Ed25519 keypair as sovereign identity. Every participant, regardless of which application module they're using, has exactly one OpenIdentity. Growth path: Keys → DID → Credentials → Trust Graph, plus Operational Profiles (RFC-007) — a module-level, Policy-Engine-facing role attribute (`regular_trader`, `liquidity_provider`, `merchant`, `arbitrator`, `agent`), not KYC and not part of the `Identity` primitive's core contract. |
| **Sails OpenReputation** | Portable score tied to the keypair, not to any platform. Any module can read or write reputation. Outcome-based (RFC-007): `recordOutcome()` is the sole `ReputationScore` input via an internal Outcome Engine; star ratings (`rate()`) are informational feedback only and never move the score. A cancelled-by-agreement trade always classifies Neutral, never Negative. |
| **Sails OpenSettlement** | Abstract escrow via the `SettlementProvider` interface. Pluggable: Mock → Multisig 2-of-3 → Lightning HODL → Liquid Covenant. Settlement status gains `PendingBankSettlement` (RFC-007) for payment held/processing at a financial institution before it clears. Also implements Dispute, with an explicit escalation order — Policy Engine → OpenAgents → Trusted Arbitrator (via the new `ArbitrationProvider` interface) → Settlement — before falling back to human arbitration (RFC-007). |
| **Sails OpenLiquidity** | Discovery and routing of liquidity. The order book (the `Offer` entity) belongs here, not to OpenP2P — this is what lets OpenFinance reuse the same discovery mechanism in the future without duplicating it. |
| **Sails OpenProof** | Standardizes `Claim` → `Proof` → `Verification` (RFC-003) for every other module — Dispute evidence, Negotiation payment proof, future OpenFinance underwriting all consume this instead of each building their own evidence format. Added as the 8th module by RFC-006. RFC-007 adds a Proof Registry (fingerprints evidence, flags reuse across Intents), an `EvidenceProvider` adapter interface (Nostr.build/S3/R2/IPFS/Arweave — the protocol never hosts media itself), and `getEvidenceBundle(intentId)`, a read aggregate over Claims/Proofs/Verifications/Timeline/external references for one Intent. RFC-008 adds an optional `TimestampAnchor` adapter (OpenTimestamps/RFC 3161) so evidence timestamps can be proven, not just self-declared — policy-gated, not mandatory. |

### Application modules (build on the above)

| Module | Responsibility | Status |
|---|---|---|
| **Sails OpenP2P** | Orchestrates the Trade Lifecycle (9 states, see `PROTOCOL_SPECIFICATION.md`) using the five cross-module services above. Owns the Secretstream chat / negotiation channel. | ✅ Proven |
| **Sails OpenAgents** | QVAC integration as a cross-cutting SDK. Any module can request matching, fraud detection, or risk analysis locally, without cloud dependency. Includes a Social Engineering Agent (RFC-007) that watches the Timeline for fraud-precursor patterns (off-channel migration, unexpected payment-instruction changes) and raises a risk signal to the Policy Engine — detection only, never unilateral action. | 📋 Aspirational |
| **Sails OpenFinance** | Future financial modules: `LoanIntent`, `SwapIntent`, `EarnIntent`. Reuses OpenSettlement, OpenLiquidity, OpenReputation without duplicating logic. | 📋 Aspirational |
| **Sails SDK** | `@sails/sdk` — a TypeScript wrapper (`SailsClient`) around every module's API, for integrators. Adds no new logic — pure interface encapsulation. | 📋 Aspirational (spec only, see `SDK_GUIDE.md`) |

**Why the OpenP2P/OpenLiquidity split matters:** a common mistake is putting
the `Offer` entity inside the OpenP2P module because "that's where trading
happens." This was corrected — `Offer` belongs to OpenLiquidity
(`moduleId: "openliquidity"`) precisely because OpenFinance will need offers
and liquidity discovery too, someday, without rebuilding it from scratch.

---

## 4. Actual Code Inventory (verified against the filesystem — do not assume more exists)

As of this handoff, the following files exist in the reference
implementation fragment:

```
src/
├── app.ts                              (Fastify app bootstrap — PARTIAL,
│                                         several route imports are commented
│                                         out because those files are missing)
├── common/
│   └── events/
│       ├── event-bus.ts                (typed event bus, namespaced events)
│       └── handlers.ts                 (Coordination Protocol — cross-module
│                                         reactions to events)
├── infrastructure/
│   └── p2p/
│       └── pear.service.ts             (PearNode + PearNodeRegistry —
│                                         HyperDHT/Hyperswarm transport)
└── modules/
    ├── open-settlement/
    │   └── escrow.service.ts           (Escrow state machine, SettlementProvider)
    └── open-liquidity/
        └── liquidity.service.ts        (LiquidityRouter, InternalOrderBook,
                                          HodlHodl stub)
```

**Missing from this environment** (referenced by `app.ts` but not present —
recover from an earlier build or rewrite from the specs in this handoff):

- `config/index.ts` — environment variable loading
- `common/database/index.ts` — Prisma client singleton
- `common/redis/index.ts` — Redis client
- `common/errors/index.ts` — `AppError`, `NotFoundError`, `EscrowError` classes
- `modules/open-identity/` — identity routes + service (Ed25519 auth,
  challenge-response)
- `modules/open-p2p/` — trade routes, chat routes/service (Secretstream
  negotiation channel)
- `modules/open-reputation/` — reputation routes + service
- All `*.routes.ts` files for every module (only service-layer files survived)
- `prisma/schema.prisma` — **this one does exist** and was updated with
  `moduleId`/`protocolVersion` fields; see `DATABASE.md`

If you're rebuilding these, follow the naming and event conventions in this
handoff exactly — do not reintroduce the old unnamespaced patterns (see
`CONTRIBUTING.md` for the specific rules and a worked example).

---

## 5. Event-Driven Coordination (the "zero coupling" mechanism)

No module imports another module's service directly. Ever. The only shared
dependency between modules is the typed event bus
(`common/events/event-bus.ts`).

```
EscrowService (OpenSettlement)
   │  emits 'settlement.escrow.released'
   ▼
eventBus  ──────────────────────────────────────►  handlers.ts
                                                    (Coordination Protocol)
                                                       │
                                    reacts by updating Trade (OpenP2P)
                                    and User stats (OpenReputation)
```

This is what makes the "eliminate unnecessary coupling" requirement concrete
and checkable: grep the codebase for any module importing another module's
service class directly. If you find one, it's a bug — replace it with an
event emission + a handler.

Full event catalog with exact names is in `PROTOCOL_SPECIFICATION.md` and
mirrored in `API_REFERENCE.md` for the WebSocket-facing subset.

---

## 6. Monorepo Target Structure (where the code is going, not yet where it is)

```
sails-protocol/                    ← monorepo root (does not exist yet)
├── packages/
│   ├── protocol-spec/             ← @sails/protocol-spec (npm, technology-agnostic)
│   │   └── src/
│   │       ├── core/              (IntentPrimitive, ParticipantIdentity, types)
│   │       ├── modules/           (one interfaces.ts per module)
│   │       └── events/            (EventContract, typed per module)
│   └── sdk/                       ← @sails/sdk (npm, consumer-facing)
│       └── src/SailsClient.ts
└── apps/
    └── satsails-reference/        ← THIS is where today's code fragment lives
        └── src/... (see inventory above)
```

The current fragment lives conceptually where `apps/satsails-reference/src/`
would be — there is no monorepo tooling (no `packages/` split, no
`turbo.json`/`nx.json`) set up yet. That's a `Meses 1-3` roadmap item, not
something to invent ad hoc.

---

## 7. Diagram Reference (canonical, use exactly this shape in any deck or doc)

See `PROJECT_CONTEXT.md` section 3 for the full ecosystem diagram
(Tether → WDK+Pears+QVAC → Sails Protocol → 8 modules → SDK → Applications →
Reference Implementations). Do not redraw this differently between
documents — consistency here was a specific, deliberate fix applied after a
strategic review found the diagram drifting between documents.
