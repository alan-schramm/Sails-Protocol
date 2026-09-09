# ADR-001: Day-0 Multi-Operator Sails Network

**Status:** Accepted (architecture decision only — no implementation
authorized by this document). **Type:** Architecture Decision Record.
**Origin:** CTO mission, 2026-09-08/09, following
`docs/DAY0_MULTI_OPERATOR_NETWORK_ARCHITECTURE_DISCOVERY.md` (PR #96)
and `docs/BACKLOG.md`'s "Day-0 Multi-Operator Sails Network / Node
Independence" entry (PR #93/#94). This ADR freezes the smallest correct
architecture for multiple independent Sails Nodes to share one economic
market at Day-0, without a mandatory central authority. **Not
authorized here:** any implementation, Core changes, Hyperbee/Hypercore
adoption, a node registry, node-reward code, gossip code, or new
schemas/APIs. Property first, mechanism second — every decision below
states the property it satisfies before naming the mechanism.

---

## Decision

Sails adopts a **signed-offer, pairwise-gossip** network model:
economic advertisements (`Offer`s) become self-authenticating, signed
envelopes with a creator-assigned logical identity, propagated between
nodes over direct Hyperswarm/HyperDHT connections (already a proven
capability in this codebase) using flood-gossip with revision-based
deduplication — **not** a DHT-stored, content-addressed advertisement
system, and **not** a federated/replicated shared database. Trade
coordination remains pairwise between the two actual counterparties;
no Trade, Escrow, or reputation state is globally replicated. No node
economics are activated in this ADR — the shared-liquidity property
does not depend on paying anyone.

---

## Alternatives — why they lost

Reusing `docs/DAY0_MULTI_OPERATOR_NETWORK_ARCHITECTURE_DISCOVERY.md`
§15/§22's own comparison, resolved to a final decision here:

- **Model A (centralized shared index):** rejected outright — directly
  violates the frozen invariant that no Satsails-operated node may be a
  mandatory authority for membership or truth (§1 below). Not a close
  call.
- **Model B (federated replication):** rejected for Day-0 — requires
  replica-set membership and conflict resolution machinery
  (operational complexity: High) with no natural relationship to any
  capability already proven in this codebase, for a property (§5's
  convergence rule) that signed-gossip already satisfies more simply.
  Not ruled out forever; revisit only if gossip's own scaling limits
  are hit in practice.
- **Model D (DHT/content-addressed discovery):** the real runner-up —
  HyperDHT is a genuine, already-used dependency. Rejected **for Day-0
  specifically**, not on principle, because: (a) storing structured
  Offer records in a DHT designed for peer-lookup key→address mappings
  is an unconfirmed capability (`docs/DAY0_...md` §23, unknown #1) —
  adopting it now would mean building on an unverified assumption; (b)
  it would most naturally be paired with Hyperbee/Hypercore for the
  actual structured storage, which is **explicitly not authorized in
  this mission** and is not currently a dependency; (c) signed-gossip
  (Model C) already satisfies the frozen invariants at Day-0 beta scale
  (a bounded number of nodes, not millions) without either risk.
  **Complexity test applied:** the property gained by D over C at this
  scale (network-wide lookup without maintaining many direct
  connections) does not yet justify its added dependency and unverified
  capacity — Rube Goldberg Check: fails (a heavier mechanism than the
  problem currently requires).
- **Hybrid C/D:** not adopted now for the same reason D alone isn't —
  named as the most likely *next* evolution if/when gossip fan-out
  alone stops scaling, not designed further here.

**Model C (signed gossip) wins** because it is the only option that
simultaneously satisfies the sovereignty invariant, builds on an
already-proven capability in this exact codebase (Hyperswarm/HyperDHT
peer discovery and direct connections, `pear.service.ts`), and requires
no new external dependency.

---

## 1. Shared Market Invariant (frozen)

- **Node choice must not define market membership.**
- **All conformant nodes must be capable of reaching the same
  protocol-level liquidity universe** — "capable of reaching," not
  "instantaneously observing" (next point).
- **Shared market universe ≠ instantaneous identical view** — bounded
  gossip-propagation delay is expected and acceptable; it is not
  fragmentation.
- **No Satsails-operated node, index, registry, or bootstrap service
  may be a mandatory authority for membership or truth.** A Satsails
  bootstrap node may *assist* discovery (§6); it may never *gate* it.

## 2. Object authority

**Property, before mechanism:** the only entity that may authorize an
`Offer`'s creation, update, cancellation, or expiry is the participant
holding the private key bound to that Offer's own declared owner
identity. A relaying/gossiping node may forward an Offer; it may never
modify its terms and re-present the result as valid — a modified
envelope simply fails signature verification at any honest receiver.
**Mechanism:** the offer's owner identity is `User.publicKey` (already
real, Ed25519, no new identity primitive) — object authority *is*
"produces a valid Ed25519 signature over the offer's canonical
content," full stop. Expiry is self-enforcing (§3) — no party need
*act* to expire an offer; every verifier independently checks
`expiresAt` against its own clock.

## 3. Signed Offer envelope (Protocol Envelope)

**Property:** an Offer must be portable (verifiable by a node that
never received it directly from its owner) and tamper-evident
(a relayed copy identical to the original, or rejected — never silently
mutated).

**Reuse decision — explicit, not automatic:** `EvidenceReference`'s
*signing pattern* (Ed25519 signature by the existing `User.publicKey`,
independently verifiable without trusting the serving node) is reused
— this is a genuinely equivalent property. `EvidenceReference`'s
*schema* (a pointer to external media: provider/uri/mimeType/sha256) is
**not** reused — an Offer's terms are structured economic data, not a
media pointer; the equivalent property does not imply the equivalent
shape.

**Minimum fields, decided:**

| Field | Purpose |
|---|---|
| `logicalOfferId` | Creator-assigned UUID, signed. **The key architectural move**: today's `Offer.id` is a node-local DB primary key; the logical id decouples "this is the same offer" from "which node's row it happens to be" — any node can recognize the same offer regardless of local storage. |
| `ownerPublicKey` | The existing `User.publicKey` — no new identity concept. |
| `asset`, `side`, `priceUsd`, `minAmount`, `maxAmount`, `paymentMethod` | The existing economic terms (`Offer` model, unchanged shape). |
| `revision` | Strictly increasing integer per `logicalOfferId`, chosen by the owner. Both the convergence mechanism (§5) and replay protection. |
| `createdAt` | Owner-supplied, immutable across revisions, signed. Advisory only — never used for cross-node ordering (§5 uses `revision`, not wall-clock time, precisely because clocks aren't trusted across nodes). |
| `revisedAt` | Owner-supplied per revision, signed, same advisory status. |
| `expiresAt` | Owner-supplied, signed. Self-enforcing (§2). |
| `status` | `ACTIVE` / `CANCELLED` — cancellation is a new signed envelope at a higher revision, not a deletion (a tombstone). |
| `signature` | Ed25519 signature over the canonical serialization of every field above. |

**Canonical serialization:** a fixed, deterministically-ordered field
list (not "sorted JSON keys," which is implementation-dependent across
languages) — the exact byte layout is an implementation detail for the
beta sequence (§21a), not frozen here; the *requirement* that one
canonical form exist and be re-derivable identically by any conformant
implementation (TypeScript today, any future implementation per Issue
#75) is frozen.

**Replay protection:** a verifier discards any envelope whose
`revision` is ≤ the highest one it has already verified for that
`logicalOfferId`. This single rule also *is* the convergence rule
(§5) — no second mechanism needed.

## 4. Propagation model

**Decision: Model C — signed gossip over direct Hyperswarm/HyperDHT
peer connections.** Each node maintains connections to a bounded set of
known peer nodes (from bootstrap, §6, plus peer-exchange). A node
relays any newly-received, signature-valid, higher-revision envelope to
its own connected peers exactly once (standard flood-gossip with
per-`logicalOfferId` dedup by highest-seen `revision` — the same
counter already required for §3's replay protection, no second data
structure). **HyperDHT is used only for its already-proven capability**
(peer discovery, direct connections) — **not** as a generic key-value
store for offer records (that would be Model D, rejected above).
`Pears capability ≠ mandatory architecture`: if a future implementation
(Issue #75) uses a different P2P transport with equivalent peer-
discovery + direct-connection properties, the gossip model above is
unaffected — nothing here is Pears-specific beyond "whatever transport
is used must support direct node-to-node connections," which Pears
already does today.

## 5. Convergence / conflict

**Rule, already stated in §3/§4: highest verified `revision` wins.** A
node that has verified revision N for a `logicalOfferId` ignores any
later-arriving envelope for that id with revision ≤ N, and adopts any
verified envelope with revision > N. This requires no central
tie-breaker because only the owner's own key can ever produce a valid
signature for that `logicalOfferId` — there is structurally no
multi-party conflict to arbitrate, only single-owner sequencing.

**Named residual, not solved:** owner equivocation (the same owner
signs two *different* envelopes at the *same* revision) is possible in
principle and is not detected by the revision rule alone. This is
bounded, not exploitable by a third party: it can only confuse the
owner's *own* counterparties, never let anyone else forge or hijack the
offer. Detection (e.g., a node that observes two differently-signed
envelopes at one revision could flag the owner) is named as a future
hardening, not designed here.

## 6. Bootstrap and membership

**Property:** a new node must be able to find the network without
asking Satsails, and Satsails' own availability must not gate anyone
else's membership. **Mechanism:** each node ships with an
operator-editable list of bootstrap peer addresses/public keys.
Satsails may publish a well-known default list — a *suggestion*, freely
replaceable or extended by any operator, never the only valid list.
Peer-exchange (an already-standard Hyperswarm-family capability) lets a
newly-connected node discover further peers transitively, beyond
whatever bootstrap set it started with. **A censored or offline
bootstrap list degrades discovery speed for brand-new joiners; it
revokes nothing for nodes already connected**, and it never determines
who is "allowed" to join — there is no admission list at all. Any node
that can establish a connection and speak the gossip protocol (§4) is a
de facto participant.

## 7. Node identity and Sybil

**Node identity ≠ participant identity**, kept separate deliberately:
a node's own keypair (today: HyperDHT's per-session, ephemeral
`peerId`, confirmed this session, `docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`)
signs only gossip-relay/transport-level metadata — never an Offer's
economic terms, which are signed solely by the participant (§2/§3).
**Decision, made persistent for this ADR's own beta sequence (§21b):**
a node's transport keypair should become *persistent* (a real seed,
stored, not regenerated every session) so that peer relationships and
gossip reputation (if any is ever built) survive restarts — a small,
concrete, already-identified change (§21 item b), not a new primitive.

**Sybil resistance: explicitly not promised, per instruction.** No
strong Sybil-resistance mechanism is designed here, because none is
*needed* for the shared-liquidity property itself: a farm of fake node
identities can waste bandwidth relaying gossip, but cannot forge a
single valid Offer signature (§2/§3 already prevent that regardless of
how many fake nodes exist) and — because **no node economics are
activated in this ADR (§16)** — a Sybil farm has no economic payoff to
chase either. Sybil resistance becomes a real, separate requirement
only if/when node-economic attribution (§16) is ever activated, and is
named there as an explicit precondition, not solved now.

## 8. Trade ownership / handoff

**Property:** the trade must not require a "home node" whose
disappearance kills it, and `buyerId`/`sellerId` (node-local foreign
keys today, confirmed `docs/DAY0_...md` §12) must never become the
*economic* authority over the trade.

**Decision: pairwise coordination, no globalized Trade state.** When
Buyer (on Node B) discovers Seller's gossiped Offer (originally signed
by Seller, who happens to be connected via Node A), Buyer's client
connects **directly to Seller's own public key** via Pears — exactly
how Pears connections already work today (keyed by participant public
key, not by node). Node A is not an intermediary in this connection at
all. Each party's own node persists its own local `Trade` row
(`buyerId`/`sellerId` remain valid as *that node's own bookkeeping*
references into its own `User` table) — the two rows are tied together
by a **jointly-signed trade-open handshake**: both parties countersign
a small message (`logicalOfferId` + a mutually-derived `tradeId`,
neither node unilaterally assigning it) at trade start. This
jointly-signed handshake, not either node's own row, is the actual
cross-node economic anchor. **Escrow/settlement is already
provider-mediated** (a real transaction hash, a real multisig PSBT) —
neither node needs to trust the other's database at all once
settlement moves; they each independently verify the same on-chain (or
provider-attested) fact. **No Trade globalization is needed** because
pairwise, mutually-signed coordination is sufficient for the two
parties who actually need to agree — no third party (including either
node's own operator) needs a global view of the trade to exist.

## 9. Offline / restart / resume

**Property, not "retry everything":** a party must be able to
reconstruct a trade's current state from artifacts it already holds
plus the settlement provider's own authoritative record — never by
guessing.

Minimum facts required, per scenario: (a) **app/process
restart** — already solved intra-node (Postgres durability, this
session's own WDK safety remediation); (b) **counterparty reconnects**
— Pears' existing backoff/reconnect (confirmed, this session's SDK
network-reliability work) plus the jointly-signed trade handshake
(§8) as the re-anchor point; (c) **the original coordinating node goes
permanently offline** — the surviving party's *own* node, holding its
own copy of the signed trade handshake and the settlement provider's
own on-chain/PSBT state, can independently reconstruct the trade's
status without the vanished node at all — **provided** that party's own
signed artifacts were themselves durably stored somewhere the party
controls, which loops into the separately-tracked, not-yet-solved
device/identity-recovery gap (`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`)
— named as a dependency, not re-solved here.

## 10. Reputation portability

**Three things kept explicit and distinct, per instruction:**

- **Observation:** what a participant can *present* to a new
  counterparty or node — e.g., "here are N signed settlement receipts
  proving completed trades." Portable in principle once §11's signature
  requirement lands.
- **Evidence:** the underlying signed artifacts themselves
  (`EvidenceReference.signature`, and — once §11 lands — signed release
  authorizations). Already partially real, extended by this ADR.
- **Score calculation:** turning observed evidence into a number.
  **Remains a local, per-node/per-application policy decision** — not
  standardized, not synchronized, not globally computed. **No global
  reputation database is created.** A node may choose to weight
  presented, externally-verifiable evidence however it likes; this ADR
  does not mandate a formula.

## 11. Settlement / evidence portability

**Preserved: `Durable ≠ Portable ≠ Independently Verifiable`**
(`docs/DAY0_...md` §10/§4, demonstrated not asserted).

**Real, positive finding carried into this decision:** for on-chain
rails (`WDK_USDT_EVM`, `MULTISIG`, `LIGHTNING_HODL`), the settlement
*transaction* itself is already maximally portable and independently
verifiable — a real transaction hash checkable against the chain by
anyone, no Sails-specific mechanism required at all. **The actual gap
is narrower**: authorizing an ordinary (non-disputed) release/refund
has no equivalent to `DisputeOutcome.attributionRawProof`'s
participant-signed attestation today.

**Decision:** a settlement release/refund's authorization must be
accompanied by the authorizing participant's (or mutual parties')
Ed25519 signature over the release decision, stored alongside the
transaction hash — reusing the *exact* existing signature pattern
(same key, same curve, same verification logic already proven for
`EvidenceReference`/`DisputeOutcome`), not a new primitive. This single
change closes the gap between "this node's DB says the release was
authorized" and "any stranger node can verify the release was
authorized," for the ordinary (non-dispute) path.

## 12. Privacy

**Preserved: `Shared market ≠ shared private state`.** Only signed
`OfferEnvelope`s (§3) are gossiped network-wide — their terms are
inherently public by the nature of advertising liquidity. **Trade
coordination, negotiation, and chat remain strictly pairwise** (direct
Pears connection between the two actual counterparties, already
sealed-box encrypted, confirmed this session's identity-architecture
work) — **never gossiped, never sent through relay nodes**. Reputation
evidence (§10) is presented by the participant on demand — opt-in
disclosure, not broadcast. **Cost of the chosen model, disclosed
honestly:** more nodes observe *that an offer exists and who signed it*
than under a strictly pairwise-only design — an inherent, unavoidable
cost of any discovery mechanism, not specific to gossip over DHT.
Network-metadata correlation (which node relayed which offer, IP-level
observation) inherits HyperDHT/Hyperswarm's own known trade-offs,
already accepted for today's pairwise Pears usage — not a new risk this
ADR introduces.

## 13. Professional liquidity provider

**Tested explicitly, per instruction:** a professional web BTC/USDT/
DePix service publishes liquidity (a signed `OfferEnvelope`, §3, same
primitive a person or wallet-embedded offer uses — confirmed no second
marketplace needed, `docs/PARTNER_BETA_INTEGRATION_REALITY.md` §6/§13,
`docs/DAY0_...md` §18) and receives demand from multiple wallets/nodes
via the same gossip mechanism (§4) — structurally identical to any
other offer's propagation.

**Resolved or explicitly sequenced, not silently dropped:**
- **Quote expiry:** resolved by §3's `expiresAt` field — Day-0.
- **Min/max:** already real (`Offer.minAmount`/`maxAmount`) — no change
  needed.
- **Inventory reservation / double-commit:** resolved as a **local**
  concern — only the offer *owner's own node* ever needs to arbitrate
  acceptance of *its own* offer (optimistic-lock the local row at
  trade-acceptance time, reject/refresh if already claimed). No
  cross-node mechanism is needed because authority over "is this offer
  still available" is exactly the same object authority already
  established in §2 — Day-0.
- **Partial fill:** explicitly **deferred past Day-0 beta** — named
  here, not silently dropped, tracked in the beta sequence's own
  "later" bucket (§21, footnote).
- **Automated acceptance:** remains the current default (immediate,
  per `docs/PARTNER_BETA_INTEGRATION_REALITY.md` §6's finding) —
  unchanged by this ADR; a review-gate feature is a future, separate
  decision, not blocking.
- **Event/callback delivery:** WebSocket remains the interim mechanism;
  outbound webhooks are **deferred past Day-0 beta**, named explicitly.

## 14. Liquidity discovery scaling

**Property:** a valid offer must not need to manipulate its own price
to become discoverable merely because many other offers exist —
already the frozen property from
`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §5.

**Finding carried forward:** the underlying pagination/filter mechanism
(`limit`/`offset`, `priceMin`/`priceMax`, `paymentMethod`) is **already
real and shipped** (`liquidity.service.ts`, confirmed this session) —
only `examples/simple-wallet`'s own documentation is stale. **This
generalizes for free to the multi-node case**: once gossip-received
offers land in the same local `Offer`-equivalent table a node already
serves `GET /v1/liquidity/offers` from, the exact same pagination/
filtering code already handles a larger, multi-source result set — no
new discovery mechanism is required. **Exits this ADR as a Day-0 beta
obligation** (§21e): fix the stale example/doc so real integrators
actually use the existing mechanism, and verify (not assume) it behaves
correctly once offers originate from more than one source.

## 15. Capability / rail discovery

**Decision: a capability-specific surface, not a universal interface**
— per instruction, explicitly rejecting a generic `supportedCapabilities()`
framework. Extends the existing, already-real `custodyModel`
per-escrow pattern (`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §8) with
one new, narrow, **pre-creation** read: a node exposes which
`EscrowType`s it currently has configured/enabled, at what disclosed
maturity/custody label — read directly from that node's own already-
loaded provider configuration (no new registry, no new primitive,
just introspection of state that already exists in memory). Named for
the beta sequence (§21e/§15's own item), not designed at the wire-
format level here.

## 16. Node economics

**Principle frozen, no percentages:** `Node existence ≠ economic
contribution`. Fee entitlement requires verifiable contribution to a
confirmed economic outcome, under the applicable frozen
`DistributionPolicyVersion` (unchanged from `docs/BACKLOG.md`'s own
prior registration).

**Contribution types evaluated separately, per instruction:**
- **Coordination** — naturally verifiable once §8's jointly-signed
  trade handshake exists (it directly names which node each party used,
  if that even matters — arguably coordination credit should attach to
  *participants*, not nodes, since coordination in this ADR's own
  design is pairwise, not node-mediated). **This is the only
  contribution type with a plausible verification path today.**
- **Discovery, propagation, routing** — **no verification mechanism
  exists or is designed here.** Explicitly, **no payment is authorized
  for gossip relaying** in this ADR — a naive "pay per message relayed"
  design is **rejected outright** (not merely deferred) because it
  trivially incentivizes spam and self-relay loops (relay your own
  garbage to yourself for a stipend). Any future design for these
  contribution types must solve that problem before activation, not
  after.
- **Availability** — no attestation mechanism exists; unaddressed,
  consistent with `docs/PROTOCOL_ECONOMY.md` §4.2's own,
  now-Day-0-capability-corrected (not Day-0-*activated*) timeline.

**No node economics are activated by this ADR.** This is a deliberate,
load-bearing choice, not an oversight: it is what makes §7's Sybil-
resistance deferral and §17's incentive test both hold cleanly at
Day-0.

## 17. No-cannibalization incentive test

**Explicit test, per instruction:** does hiding competitor offers
rationally increase a node's revenue under this design? **No** —
because §16 activates zero node-side, offer-visibility-based revenue
lever at Day-0. A node earns nothing extra from relaying (or
withholding) more of *other* participants' offers; there is no
"exclusive discovery" fee to protect. The only lever an operator has to
attract genuine volume is service quality (uptime, latency, honest
relay, support) — the already-registered "compete on service quality,
not by capturing users into isolated liquidity" principle. **This
passes the Day-0 incentive test structurally**, not by hoping operators
behave — there is simply no economic mechanism in this ADR that
withholding liquidity could exploit.

## 18. Stranger-node test (future evidence gate)

An independent operator installs a Sails Node from published material
alone, joins the network via a bootstrap list it obtained from public
documentation (not a private conversation with Satsails), discovers an
`OfferEnvelope` originated by a different, unrelated operator, and
**independently verifies that envelope's signature** without querying
any Satsails-controlled database or allowlist. **Not demonstrated
today** — this is the direct successor to
`docs/DAY0_...md` §21's own "Stranger Node Test," now scoped precisely
against this ADR's chosen mechanism (§3's signature, §6's bootstrap
model) rather than an abstract placeholder.

## 19. Stranger-developer test (future evidence gate)

A developer external to this project installs `@satsails/p2p-trading-sdk`
from the published package alone, using only published documentation,
connects a wallet or web service to a real (multi-operator) market,
and executes a permitted flow (discover → trade → settle) with zero
support from the Sails team. **Every question that developer would need
to ask the team is, by definition, a DX or documentation gap until
proven otherwise** — direct continuation of
`docs/PARTNER_BETA_INTEGRATION_REALITY.md` §10's own already-defined
test, now including the multi-node discovery step this ADR adds.

## 20. Partner-wallet evidence gate

An independently-maintained wallet or service — not Satsails, not this
repository — installs the SDK, uses only the public integration
surface, and participates in the *same* liquidity universe as at least
one other, unrelated operator (via this ADR's own gossip mechanism, not
a private arrangement). **Preserved, verbatim, per prior registration:**
Satsails Wallet's own success proves reference-implementation
viability, not independent interoperability — this gate is not
satisfied until a genuinely separate party clears it.

## 21. Implementation Sequence (obligatory order, not a "future" list)

None of the following may silently become "later roadmap" if it is
required for Day-0 beta — each is either in this sequence or explicitly
named as deferred-past-beta (§13's partial-fill/webhooks are the only
two items in this entire ADR granted that status):

**(a) Portable signed Offers** — `logicalOfferId`, canonical
serialization, Ed25519 signature, `revision`/`expiresAt`/tombstone
semantics (§3).
**(b) Propagation/bootstrap** — persistent node transport keypair
(§7), bootstrap peer list, flood-gossip with revision-dedup (§4/§6).
**(c) Multi-node discovery/convergence** — highest-revision-wins
verification at the receiving node (§5), feeding into the existing
local `Offer` table.
**(d) Cross-node trade coordination** — jointly-signed trade-open
handshake, pairwise Pears connection keyed by participant public key,
not node (§8).
**(e) Pagination/discovery scaling** — fix the stale
`examples/simple-wallet` documentation, verify existing pagination/
filter code against a multi-source local offer table, add the
capability/rail pre-creation discovery surface (§14/§15).
**(f) Professional provider flow** — inventory reservation/optimistic
locking on the offer owner's own node (§13); quote expiry and min/max
already covered by (a).
**(g) Restart/offline/resume** — extend existing intra-node durability
with the jointly-signed trade handshake as the cross-node re-anchor
point (§9).
**(h) Stranger-node test** (§18).
**(i) Stranger-developer test** (§19).
**(j) First independent partner-wallet beta** (§20).

**Deferred past Day-0 beta, named explicitly, not silently dropped:**
partial fill (§13); outbound webhook delivery (§13); any node-economic
payment activation (§16); formal Sybil-resistance mechanism (§7);
Model D/hybrid propagation (Alternatives section).

## 22. Complexity tests (applied to this ADR's own new artifacts)

**New artifact 1: the signed `OfferEnvelope` schema (§3).**
- *Property gained:* portable, independently verifiable offer
  authenticity — the single most concrete prerequisite this entire ADR
  depends on (`docs/DAY0_...md`'s own headline finding).
- *Simpler alternative considered:* trusting the relaying node's own
  claim about an offer's authenticity (no signature at all) — rejected,
  since it reintroduces exactly the "node authority over economic
  content" this ADR exists to prevent (§2).
- *Coupling:* couples every Offer-consuming code path to a signature-
  verification step — a real, disclosed cost, bounded to one
  well-understood operation (Ed25519 verify), not a new dependency.
- *Operational cost:* one signature computation per offer creation/
  update/cancellation — negligible.
- *Privacy cost:* none beyond what publishing an offer already implies
  (§12).
- *Attack surface:* signature-forgery is the new surface — bounded by
  Ed25519's own well-understood security properties, the same curve
  already used for `User.publicKey` (no new cryptographic primitive
  introduced).
- **COBRA Check:** does not touch settlement/escrow/authority code
  directly — a discovery/advertisement-layer addition only.
- **Rube Goldberg Check:** passes — the mechanism (sign a fixed field
  set, verify on receipt) is the minimum necessary for the property
  claimed, no generic framework introduced.

**New artifact 2: gossip propagation (§4).**
- *Property gained:* offers reach nodes beyond their origin without a
  central index (§1's own core requirement).
- *Simpler alternative considered:* Model D (DHT storage) — rejected
  above (Alternatives section) as heavier than currently justified.
- *Coupling:* couples node operation to maintaining peer connections —
  already true today for Pears' existing chat/negotiation use, not a
  new class of coupling.
- *Operational cost:* bandwidth for relaying (bounded by revision-
  dedup, §4 — a node never relays the same revision twice).
- *Privacy cost:* addressed in §12 (offer visibility broadens, private
  trade content does not).
- *Attack surface:* flooding/spam (named, §14 threat table, not solved
  here); Sybil relay abuse (§7, bounded because it can't forge content,
  only waste bandwidth).
- **COBRA Check:** does not touch settlement/escrow/authority — a
  discovery-layer mechanism only.
- **Rube Goldberg Check:** passes — flood-gossip with revision-dedup is
  a standard, minimal pattern for this exact problem class, not a
  bespoke invention.

## 23. Claims not yet demonstrated (discipline, restated)

None of the following may be used as a demonstrated claim until its
named evidence gate (§18/§19/§20) actually passes: **decentralized,
permissionless, shared liquidity, portable, multi-node, censorship
resistant, production-ready.** This ADR is a decision about what to
build, not evidence that it exists yet.

## 24. Migration from current single-node topology

No breaking change to the existing single-node `Offer`/`Trade`/`User`
schema is required to *begin* this sequence — `logicalOfferId` and the
envelope's signed fields are additive columns/derived data on top of
the existing `Offer` model, not a replacement of it. A node running
today, before any of §21's sequence lands, continues to behave exactly
as it does now (a self-contained, correctly-functioning single-node
deployment) — this ADR describes an additive capability, not a
rewrite, consistent with `docs/PARTNER_BETA_INTEGRATION_REALITY.md`'s
own finding that the single-node SDK/API surface is already largely
sound.

## 25. BACKLOG DELTA

**Not forced to zero.** This ADR reveals concrete, implementation-
shaped obligations materially more specific than the abstract Day-0
obligation already registered — see the accompanying `docs/BACKLOG.md`
update for the itemized new delta (the §21 implementation sequence
itself, registered as the executable form of the existing obligation,
plus the settlement-release-signature requirement from §11, which is a
genuinely new, previously-unregistered obligation on its own).
