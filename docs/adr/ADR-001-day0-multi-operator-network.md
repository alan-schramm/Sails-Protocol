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

**CTO Gate Correction Pass (2026-09-09).** The original pass overclaimed
that Pears connections are already "keyed by participant public key" —
false; see the new §7.1 for the corrected current truth (economic
identity and transport identity are separate, unbound today) and the
new Day-0 requirement this creates. Also corrected in this pass: §10's
reputation claim (narrowed to evidence/facts, not the score itself),
§11's settlement-authorization precision (attribution ≠ funds
authority), §16's node-economics framing (reconciling "Day-0-capable"
with "not activated," adding a full verifiability classification), §6's
bootstrap independence from any Satsails default list, §7's persistent-
node-identity gap now classified as a Day-0 implementation obligation,
§12's privacy review of the new binding requirement, and the model-
naming ambiguity against the independent, parallel
`docs/SAILS_NODE_SHARED_LIQUIDITY_DISCOVERY.md` (PR #98) discovery
document. All corrections preserve the original decision (Model C,
signed gossip) — none reverses it.

**Second CTO Gate Correction Pass (2026-09-09, economics/institutional).**
Registers the Product Direction that independent Sails Nodes must be
economically viable participants from Day 0 (§16, distinguishing
capability/accounting/entitlement/payout as four separate decisions,
only the last deferred); narrows §17's no-cannibalization claim so it
no longer depends solely on node economics being disabled; adds two new
Day-0 sequence items, Node Contribution Accounting and Incentive
Compatibility Evidence (§21 (j)/(k)); extends §12's privacy review to
the new accounting mechanism. `docs/SAILS_NODE_SHARED_LIQUIDITY_DISCOVERY.md`
(PR #98) is rebased and merged as a historical/research/evidence
artifact in this same pass — this ADR remains the architecture decision
authority.

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

**Model naming reconciliation (2026-09-09, CTO Gate):** the isolated,
parallel discovery document
(`docs/SAILS_NODE_SHARED_LIQUIDITY_DISCOVERY.md`) uses its own A-E
lettering for a *different* set of topology descriptions than this
ADR's own A-E letters — the letters are **local to each document, not
a shared vocabulary**. Compare the underlying topology descriptions
across documents, never the letter names alone. This ADR's own letters,
named descriptively from here on to prevent exactly this ambiguity:
**A = Central Index, B = Federation, C = Signed Gossip, D = DHT
Discovery, (C/D) = Hybrid.**

Reusing `docs/DAY0_MULTI_OPERATOR_NETWORK_ARCHITECTURE_DISCOVERY.md`
§15/§22's own comparison, resolved to a final decision here:

- **Model A — Central Index (centralized shared index):** rejected outright — directly
  violates the frozen invariant that no Satsails-operated node may be a
  mandatory authority for membership or truth (§1 below). Not a close
  call.
- **Model B — Federation (federated replication):** rejected for Day-0 — requires
  replica-set membership and conflict resolution machinery
  (operational complexity: High) with no natural relationship to any
  capability already proven in this codebase, for a property (§5's
  convergence rule) that signed-gossip already satisfies more simply.
  Not ruled out forever; revisit only if gossip's own scaling limits
  are hit in practice.
- **Model D — DHT Discovery (DHT/content-addressed discovery):** the real runner-up —
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
- **Hybrid (Signed Gossip + DHT Discovery, "C/D"):** not adopted now for
  the same reason D alone isn't — named as the most likely *next*
  evolution if/when gossip fan-out alone stops scaling, not designed
  further here.

**Model C — Signed Gossip wins** because it is the only option that
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

**Confirmed, 2026-09-09 (CTO Gate):** a Satsails-published default list
is **not necessary for the network to function** — an operator may
configure zero Satsails-provided peers and still join the network via
any independently published bootstrap list, a direct peer address
obtained out-of-band, or transitive peer-exchange from any single
already-connected node. Day-0 architecture permits multiple,
independent, operator-defined bootstrap configurations simultaneously —
no central bootstrap registry exists or is proposed.

## 7. Node identity and Sybil

**Property, frozen 2026-09-09:**

> A Sails Node participating in network discovery must have a stable
> operational identity across ordinary restarts.

> **Node Identity ≠ Participant Identity.** Never transform node
> identity into economic authority — a node's own key signs only
> gossip-relay/transport-level metadata, never an Offer's economic
> terms (§2/§3 remain participant-signed, exclusively).

**Current implementation gap, classified explicitly against the
accepted Day-0 architecture (not a future nicety):** today's node-level
keypair is HyperDHT's per-session, ephemeral `peerId` (confirmed,
`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`) — regenerated on every
restart, satisfying neither the frozen property above nor this ADR's
own reliance (§4, gossip relay/dedup) on stable peer relationships
surviving ordinary restarts. **This is registered as a Day-0
implementation obligation (§21), not a beta-hardening nicety** — a
node whose peer identity changes on every restart cannot maintain the
gossip peer relationships §4's own propagation model depends on.

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

## 7.1 Economic Identity ↔ Transport Identity Binding (correction, 2026-09-09, CTO Gate)

**Correction — the original §8 below overclaimed that Pears connections
are already "keyed by participant public key." False, confirmed
directly against this session's own prior work
(`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` §2/§3.3):**

> **Economic participant identity = `User.publicKey`.**
> **Transport identity = Pears/HyperDHT `peerId`.**
> **Today: no cryptographic binding exists between them.** `peerId` is
> generated fresh by `HyperDHT.keyPair()` with no seed on every
> `PearNode.start()` call — cryptographically unrelated to
> `User.publicKey`, and not even stable across sessions.

**Preserved:** `Economic Identity ≠ Transport Identity` — this was
already true before this correction and remains true after; what
changes here is that the ADR stops *assuming* a binding exists and
instead names the gap explicitly.

**Day-0 requirement, frozen:**

> A participant must be able to prove an authorized binding between its
> economic identity and the transport identity used to establish direct
> trade communication.

**Explicitly not decided here:** the final binding format (e.g., a
signed statement — "economic key X authorizes transport key Y for
session/interaction Z" — or a session-scoped derivation) is a real
cryptographic design decision this ADR does not make. **Explicitly
forbidden:** reusing `User.publicKey` directly *as* the Pears transport
key — collapsing the two would defeat the domain-separation reasoning
`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` already established (economic
key compromise must not equal transport key compromise, and vice
versa). Whatever binding mechanism is eventually chosen must produce a
*separate*, transport-scoped key, cryptographically *linked* to the
economic identity by a verifiable statement — not identical to it.

**Effect on §8 below:** every place §8 says a buyer "connects directly
to the seller's own public key," read as: *the buyer connects to
whatever transport identity the seller has authorized-bound to their
economic identity, verified via that binding* — not a literal claim
that Pears already resolves participant public keys today. §8's own
architectural conclusion (pairwise coordination, no globalized Trade
state) is unaffected by this correction; only the mechanism-level claim
about *how* the connection is keyed changes.

## 8. Trade ownership / handoff

**Property:** the trade must not require a "home node" whose
disappearance kills it, and `buyerId`/`sellerId` (node-local foreign
keys today, confirmed `docs/DAY0_...md` §12) must never become the
*economic* authority over the trade.

**Decision: pairwise coordination, no globalized Trade state.** When
Buyer (on Node B) discovers Seller's gossiped Offer (originally signed
by Seller, who happens to be connected via Node A), Buyer's client
connects to **Seller's own transport identity, verified via the
Economic Identity ↔ Transport Identity Binding (§7.1)** — *not*
directly to `User.publicKey` itself, which corrects this section's own
prior overclaim that Pears connections are "already keyed by
participant public key" (§7.1 demonstrates this is false today). Node A
is not an intermediary in this connection at all. Each party's own node
persists its own local `Trade` row
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

**Correction, 2026-09-09 (CTO Gate).** The broad frozen claim carried
from `docs/BACKLOG.md` ("changing node must not inherently change
participant economic identity, reputation or historical rights") reads
as a guarantee over the *number* itself. Narrowed to what this ADR can
actually support:

> Changing nodes must not inherently erase or invalidate portable
> reputation evidence, participant identity, historical economic
> facts, or historical rights.

> **Reputation Evidence ≠ Reputation Score.** A node or application may
> compute a different score from the same evidence, under its own
> local policy, provided it does not invent or erase the underlying
> verifiable economic facts.

This is not a weaker property, only a more precise one: it protects the
*facts* a participant can prove (a completed trade, a signed receipt),
not any particular node's own arithmetic over those facts — the
distinction §10 below already draws between Evidence and Score
Calculation, now stated as the frozen property itself rather than left
implicit.

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

**Precision, added 2026-09-09 (CTO Gate) — what this signature does and
does not prove:**

> **Participant-signed authorization proves authorization attribution;
> it does not by itself prove custody or funds authority.**

> **Authorization Evidence ≠ Funds Authority.**

A signature over "I authorize this release" is evidence of *who
decided*, verifiable by any stranger node — it is not evidence that the
signer *controlled the funds* being released, which is a separate,
rail-specific fact. **Evaluated per rail, not assumed uniform:**
`WDK_USDT_EVM` is server-custodial (one operator-held seed actually
moves funds; the participant's authorization signature and the
provider's own custody are two different things, confirmed
`docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md`); `MULTISIG`/
`LIGHTNING_HODL` are client-held-key rails where the authorizing
signature is closer to, but still not identical to, funds authority
(the actual PSBT/HTLC signature is the funds-authority artifact; the
authorization-decision signature this ADR adds is a separate, simpler
attestation of intent, useful for cross-node verification even where
it doesn't itself move funds). This ADR closes the *attribution*
gap (§11's own decision above); it does not claim to have unified or
simplified each rail's own, already-disclosed custody model
(`README.md`'s "Rail readiness" table remains the authoritative source
on that).

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

**Reviewed specifically, 2026-09-09 (CTO Gate), following §7.1's own
new binding requirement:**

- **Offer-signer correlation:** every gossiped `OfferEnvelope` carries
  `ownerPublicKey` (§3) — an offer owner's economic identity is
  inherently, permanently correlatable across every offer they ever
  sign, by construction of the discovery mechanism itself. Not a new
  cost introduced by this ADR beyond what any signed-advertisement
  system requires.
- **Node-relay metadata correlation:** unchanged from the general
  finding above — which nodes relay which offers is observable to
  anyone watching enough of the network, an inherent property of any
  gossip/relay mechanism, not specific to signed offers.
- **Economic identity ↔ transport identity binding privacy — the
  genuinely new question §7.1 raises:** if the binding statement
  itself (economic key → transport key) is gossiped or stored the same
  way an Offer is, it becomes a **permanent, public link** between a
  participant's economic identity and every transport session they've
  ever bound to it — a materially worse correlation surface than the
  offer-signer correlation above, since it could deanonymize *all* of
  a participant's transport-layer activity, not just their offers.
- **Whether the binding must be public, selectively disclosed, or
  interaction-specific — not decided here, evidence insufficient.**
  Three shapes are plausible and not evaluated in enough depth to
  choose: (a) a public, offer-attached binding (simplest, worst
  privacy — every discoverer of an offer also learns the owner's
  current transport identity); (b) a selectively-disclosed binding
  (shared only with the specific counterparty once a trade begins,
  better privacy, requires an extra disclosure step in the trade-open
  flow, §8); (c) an interaction-specific, rotating binding (a fresh
  transport identity bound per trade/session, best privacy, most
  mechanism complexity). **This ADR does not choose among them** — §7.1
  registers the requirement; this section registers that its privacy
  shape is a real, undecided design question for whatever mechanism
  closes §21(c), not an oversight. **Kept explicit and reusable, since
  the same shape question applies elsewhere in this repository's own
  identity work:** `Recovery relationship ≠ Public identity
  relationship` (`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md`) — the
  binding statement here is exactly a recovery/linkage relationship of
  that same class, and the same caution against making it automatically
  public applies.

**Reconfirmed, 2026-09-09 (CTO Gate, Fase 8) — extended to §16's new
Node Contribution Accounting (§21(j)):**

> **Economic contribution attribution ≠ Global participant
> surveillance.**

Recording that a node genuinely served a confirmed trade (§16's
"trade-serving" row, the only verifiable contribution today) requires
only that trade's own already-durable `Trade`/`Escrow` rows and the
trade-open handshake (§8) — it does **not** require, and this ADR does
not authorize, any mechanism that aggregates a participant's activity
*across* trades into a single trackable profile for contribution-
accounting purposes. **Node contribution accounting must not require
global user tracking; economic attribution must not create a universal
participant tracking graph** — a design that needed either would be
solving a much larger problem than "did this node serve this one
confirmed trade," and is explicitly out of scope for §21(j)/(k).

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

**Product Direction, registered 2026-09-09 (CTO Gate, Fase 2):**

> Independent Sails Nodes are intended to participate economically from
> Day 0 of the production network.

**Four distinct things, not one, per instruction — collapsing them is
exactly the mistake this correction fixes:**

- **Economic capability** — does the architecture allow contribution to
  be attributed at all? Yes, for participant-facing coordination
  (table below), the moment §21(a)/(f) land — no new primitive
  required.
- **Contribution accounting** — is a contribution actually being
  recorded/tracked as it happens? **Must be built and testable before
  the independent partner-wallet beta (§20, §21(n))** — this is new,
  registered as Implementation Sequence item (j).
- **Entitlement recognition** — does a `DistributionPolicyVersion`
  actually name the contribution as eligible and specify (whatever)
  share? A policy decision, separate from accounting — **must also be
  testable before the partner-wallet beta**, without requiring any
  particular percentage to be chosen yet (a policy can name eligibility
  with a placeholder/test share for the purpose of exercising the
  mechanism).
- **Actual payout execution** — real value moving to a node operator.
  **Remains gated by the Production Readiness Consolidated Gate
  (`docs/BACKLOG.md`) — may stay disabled through the entire beta.**

**For beta, precisely:** real payout activation MAY remain disabled.
**Contribution accounting and entitlement semantics must be testable**
— meaning: a real contribution can be recorded, and a real
`DistributionPolicyVersion` can name it eligible and compute what it
*would* pay, end to end, without a single unit of value actually
moving. **No payout percentage is invented here. No new token is
introduced. No production fee is activated by this ADR.**

**Precision, unchanged from the prior correction — a third term, not
two:**

> **Coordination Attempt ≠ Verified Contribution ≠ Fee Entitlement.**

An attempt (a node tries to relay, tries to coordinate) is not itself a
contribution; a verified contribution (something independently checkable
actually happened) is not itself an entitlement (the applicable
`DistributionPolicyVersion` must still name it as eligible and specify
its share — a policy decision, never automatic from verification
alone).

**Contribution sources, classified by verifiability today, expanded
per instruction to cover all six evaluation dimensions — no
percentages set for any of them:**

| Contribution source | Verifiability today | Basis |
|---|---|---|
| **Trade-serving node compensation** (a node was genuinely used by a real participant to reach a real, confirmed trade) | **Verifiable today** | Directly derivable from the already-durable `Trade`/`Escrow` rows plus §8's jointly-signed trade-open handshake — no new proof primitive needed. |
| **Offer-origin contribution** (the node where a winning offer's owner was connected when the offer was created/signed) | **Potentially verifiable** — the signed `OfferEnvelope` (§3) already names `ownerPublicKey`, and §7.1's own binding (once built) could extend to naming an origin node — but attributing *origin*, as distinct from *serving the eventual trade*, is not yet designed. Considered explicitly, per instruction: the offer-origin identity plus the trade-open handshake together provide **durable attribution sufficient for trade-serving compensation specifically** (the row above) — they do not, by themselves, resolve origin-vs-serving-node attribution when those differ. |
| **Settlement contribution** (a node's own settlement-provider infrastructure processed a release/refund) | **Potentially verifiable** — the transaction hash and (once §11 lands) the signed release authorization are both real, checkable artifacts; attributing them to a specific *node's own infrastructure* rather than the settlement provider itself is not yet designed. |
| **Discovery / propagation contribution** (a node helped an offer be found/relayed) | **Potentially verifiable** — *only if* the propagation mechanism itself is signed/versioned (§9's own revision requirement); even then, no design here proves *which specific hop* mattered to a specific outcome. |
| **Routing** | **Not currently verifiable** — same gap as discovery/propagation, no proof mechanism proposed. |
| **Wallet/integrator rebate** (compensating the *wallet*, not the node, for bringing a transacting user) | **Verifiable today**, and structurally simpler than any node-side row above — a wallet/integrator is already identifiable via whichever `WalletAdapter`/API credential originated the request; this is a genuinely different recipient class from "node," not evaluated further here (out of this ADR's own node-economics scope, named only so it isn't confused with a node-side lever). |
| **Treasury/protocol share** | Not a contribution-verifiability question at all — a `DistributionPolicyVersion` policy choice (how much of a confirmed fee goes to the protocol treasury vs. any other named recipient), unrelated to whether any *node* contribution can be verified. |

**No new generic economic primitive is introduced** — every
potentially-verifiable row above extends an already-real, already-
proven mechanism (signed envelopes, signed release authorizations,
transaction hashes), consistent with the instruction that a new
primitive is authorized only if evidence demands it; none of this
evidence does.

**Explicitly, no payment is authorized for gossip relaying in this
ADR** — a naive "pay per message relayed" design is **rejected
outright** (not merely deferred) because it trivially incentivizes
spam and self-relay loops (relay your own garbage to yourself for a
stipend). Any future design for the "potentially verifiable" and "not
currently verifiable" rows must close that verifiability gap before
activation, not after. **Availability** — no attestation mechanism
exists; unaddressed, consistent with `docs/PROTOCOL_ECONOMY.md` §4.2's
own, now-Day-0-capability-corrected (not Day-0-*activated*) timeline.

**No real payout is activated by this ADR.** This remains a deliberate,
load-bearing choice: it is what makes §7's Sybil-resistance deferral
hold cleanly at Day-0, while contribution accounting and entitlement
recognition themselves become real, testable, Day-0 obligations per the
Product Direction above — capability, accounting, and entitlement
recognition are no longer treated as "later," only payout execution is.

## 17. Incentive compatibility / no-cannibalization property

**Narrowed, 2026-09-09 (CTO Gate) — the prior claim depended entirely
on node economics being disabled, which stops holding the moment
accounting/entitlement become Day-0-testable (§16). Replaced with a
property that holds independent of that:**

> A conformant node must not gain durable economic advantage by
> withholding valid competing liquidity.

> Honest liquidity propagation must remain economically rational
> relative to liquidity suppression.

**Evaluated explicitly against each of §16's six dimensions, not
assumed to hold uniformly:**

- **Trade-serving node compensation:** compensates a node only for
  trades it actually, verifiably served — withholding a *competitor's*
  offer earns nothing extra here, since compensation attaches to the
  node's own served trades, not to the volume of offers it chose to
  show or hide. **Property holds.**
- **Wallet/integrator rebate:** same reasoning, one layer up — a wallet
  rebate rewards bringing a real transacting user, not suppressing
  competing liquidity that user might otherwise have found elsewhere.
  **Property holds**, contingent on the rebate never being computed as
  a function of "share of visible market," which would invert the
  incentive — named as a design constraint for whenever this mechanism
  is built, not designed further here.
- **Offer-origin contribution:** if ever activated, rewards accurately
  attributing where a winning offer came from — has no natural
  incentive to suppress *other* offers, since suppressing a competitor
  doesn't make one's own offer's origin more "contributory." **Property
  holds under the same accurate-attribution assumption §16 already
  names as undesigned.**
- **Settlement contribution:** rewards processing confirmed outcomes,
  which requires trades to actually happen — suppressing liquidity
  network-wide reduces the total number of trades available to settle,
  a direct disincentive to suppression. **Property holds, and is
  actively reinforcing.**
- **Discovery/propagation contribution:** the one dimension with a real,
  disclosed risk if ever activated naively — a poorly designed
  discovery/propagation reward *could* create an incentive to relay
  more (even spam) rather than relay honestly, which is exactly why
  §16 rejects "pay per relay" outright rather than merely deferring it.
  **Property does not automatically hold here — it is exactly why this
  dimension stays unverifiable/unpaid until a real design closes the
  gap**, not an oversight.
- **Treasury/protocol share:** a fixed policy allocation, not
  contribution-dependent — no incentive effect on any individual node's
  behavior either way.

**Explicit withholding-liquidity threat analysis:** the failure mode
named by the mission — "if hiding liquidity can rationally increase
revenue, the design fails the Day-0 incentive test" — is evaluated per
dimension above, not asserted globally. Four of six dimensions
structurally cannot reward withholding (trade-serving, rebate,
offer-origin, settlement); one (treasury share) is neutral; one
(discovery/propagation) is the one genuine risk, and is precisely the
one this ADR keeps unpaid until it can be designed safely. **This is a
stronger, more defensible position than the prior "economics are
disabled" framing** — it holds for four of six real dimensions on
their own structural merits, and names the one real remaining risk
explicitly rather than hiding it behind "nothing is paid yet."

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
**(b) Persistent node identity** — a stable operational node keypair
across ordinary restarts (§7), closing the confirmed current gap
(ephemeral, per-session `peerId`) this ADR's own gossip model (§4)
depends on.
**(c) Economic Identity ↔ Transport Identity Binding** — the
participant-signed statement binding `User.publicKey` to a
session/interaction-scoped transport identity (§7.1) — **added
2026-09-09, a genuinely new Day-0 sequence item**, since without it
step (e) below has no real mechanism to connect the discovering buyer
to the actual offer owner.
**(d) Propagation/bootstrap** — bootstrap peer list, flood-gossip with
revision-dedup (§4/§6), building on (b)'s now-stable node identity.
**(e) Multi-node discovery/convergence** — highest-revision-wins
verification at the receiving node (§5), feeding into the existing
local `Offer` table.
**(f) Cross-node trade coordination** — jointly-signed trade-open
handshake, pairwise Pears connection to the seller's transport
identity as authorized by (c)'s binding, not a claimed direct
public-key connection (§7.1/§8).
**(g) Pagination/discovery scaling** — fix the stale
`examples/simple-wallet` documentation, verify existing pagination/
filter code against a multi-source local offer table, add the
capability/rail pre-creation discovery surface (§14/§15).
**(h) Professional provider flow** — inventory reservation/optimistic
locking on the offer owner's own node (§13); quote expiry and min/max
already covered by (a).
**(i) Restart/offline/resume** — extend existing intra-node durability
with the jointly-signed trade handshake as the cross-node re-anchor
point (§9).
**(j) Node Contribution Accounting** — **added 2026-09-09**: recording
a verified contribution (§16's trade-serving row, the only one
verifiable today) as it happens — economic *capability* without
payout, must exist and be testable before (n) below.
**(k) Incentive Compatibility / No-Cannibalization Evidence** — **added
2026-09-09**: demonstrating §17's property actually holds against (j)'s
real accounting mechanism once built, not only as a structural argument
on paper — must exist and be testable before (n) below.
**(l) Stranger-node test** (§18).
**(m) Stranger-developer test** (§19).
**(n) First independent partner-wallet beta** (§20).

**Actual payout execution remains gated by the Production Readiness
Consolidated Gate (`docs/BACKLOG.md`)** — separate from, and later
than, this sequence; (j)/(k) make accounting and entitlement
*testable*, they do not activate any real payment.

**Deferred past Day-0 beta, named explicitly, not silently dropped:**
partial fill (§13); outbound webhook delivery (§13); any real
node-economic **payout activation** (§16 — capability/accounting/
entitlement recognition are Day-0 sequence items (j)/(k), payout
execution is not); formal Sybil-resistance mechanism (§7); Model
D/hybrid propagation (Alternatives section).

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

**Updated 2026-09-09 (CTO Gate correction pass) — two further genuinely
new obligations**, surfaced by this correction and by reconciling
`docs/SAILS_NODE_SHARED_LIQUIDITY_DISCOVERY.md`'s (PR #98) independent
findings: **Economic Identity ↔ Transport Identity Binding** (§7.1) and
**Persistent Node Identity** (§7) — both now registered as Day-0
implementation-sequence items (§21 (b)/(c)), both genuinely new (neither
was represented anywhere in this repository before this pass), neither
duplicating an existing entry. See `docs/BACKLOG.md`'s own updated
entry for the full registration and the explicit check against
duplication with PR #98's own candidate list.

**Count correction, 2026-09-09.** `docs/BACKLOG.md`'s own entry for
this ADR now states explicitly: the original registration pass counted
**2** distinct obligations (items 1-2 there); this correction pass
added **2 further** (items 3-4); **total: 4**, not left implicit.

**Updated again, 2026-09-09 (Fase 2-5/9) — Node Contribution Accounting
and Incentive Compatibility (§21 (j)/(k))** are new *sequence items*
inside the already-counted Implementation Sequence obligation (item 2)
— deliberately **not** registered as separate fifth/sixth top-level
obligations, to avoid double-counting the same "build this ordered
sequence" obligation twice. Checked against `docs/PROTOCOL_ECONOMY.md`
§4.2 — no duplication: that section's own Node Operator Pool/routing-
fee content is the future payout-*rollout* layer; §21(j)/(k) are the
Day-0 accounting/entitlement-*capability* layer underneath it.


## 26. Day-0 Completeness Cold Sweep — implementation consequence (2026-09-09)

**This section does not change the accepted topology decision.** Signed
Offer envelopes + direct node-to-node gossip remain the Day-0
architecture. It corrects a completeness omission in §21: a clean
happy-path propagation flow is not enough to demonstrate one durable
economic market across time, failure and adversarial network
conditions.

Full evidence/registration:
`docs/DAY0_COMPLETENESS_COLD_SWEEP.md`.

The §21 implementation sequence is therefore interpreted as requiring
the following additional properties before the corresponding evidence
gates can pass:

### 26.1 Propagation completeness

§21(d)/(e) **Propagation/bootstrap + discovery/convergence** are not
complete until they also demonstrate:

- late-joining-node catch-up / anti-entropy;
- partition healing;
- delivery of revisions/tombstones created while a node was offline;
- stale-resurrection prevention after local compaction/garbage
  collection.

> **New-event gossip ≠ Network convergence over time.**

### 26.2 Node discoverability and compatibility

§21(b)/(d)/(g) are not complete until a peer can self-authenticate the
minimum information required to decide whether interaction is safe:

- persistent node identity;
- reachable endpoint/transport information;
- compatible protocol/wire version;
- relevant enabled capabilities;
- relevant settlement rails with disclosed maturity/custody posture;
- applicable node fee/policy disclosure;
- freshness/expiry of that advertisement.

No central node registry is authorized.

> **Node discoverability ≠ Node authority.**

### 26.3 Node identity lifecycle

§21(b)'s “persistent node identity” means more than “write a private key
to disk.” Before production it must define bounded behavior for backup,
loss, compromise, rotation/replacement and superseded-key distrust.

Preserved and strengthened:

> **Node Identity ≠ Participant Identity ≠ Operator Economic Recipient.**

This section does not authorize a new operator-identity primitive.

### 26.4 Network-view resilience

§21(d)/(e) and §21(k)'s no-cannibalization evidence must include
adversarial topology, not only honest topology:

- selective forwarding;
- one malicious bootstrap/relay peer;
- attempted eclipse/isolation;
- alternate honest paths;
- peer diversity/rotation sufficient to avoid one operator defining a
  node's entire market view.

No perfect censorship-resistance claim is created.

### 26.5 Resource safety

A valid signature proves authorship, not economic relevance. Gossip
implementation must have explicit, testable resource bounds for message
size, ingress rate, duplicate/revision cache growth, tombstone
retention, malformed messages, signature-verification amplification,
peer count and backpressure.

Formal Sybil resistance remains separately tracked exactly as §7
already states.

### 26.6 Clock-dependent expiry

`revision` ordering remains clock-independent as already frozen.
`expiresAt`, however, is evaluated against local time. Production node
operation must therefore define a bounded clock-health expectation and
visible degraded/fail behavior for materially incorrect clocks.

No global clock or consensus-time mechanism is introduced.

### 26.7 Node switching / operator independence evidence

§21(i)/(l)/(n) are not complete if a wallet can technically connect to
another node but loses its economic continuity when doing so.

Evidence must establish that node switching does not inherently erase
or redefine:

- participant identity;
- signed trade-open anchors;
- portable evidence;
- historical economic rights;
- access to the same reachable liquidity universe.

Local policy and locally-computed reputation scores may differ.

### 26.8 Independent node-operator test

Add an operator-side evidence gate alongside Stranger Node and Stranger
Developer:

> A competent independent operator, with no private Satsails assistance,
> can deploy, configure, join, observe, upgrade, back up, recover and
> safely stop a conformant Sails Node using only public supported
> artifacts.

This is a **Day-0 operational decentralization property**, not merely
documentation polish.

### 26.9 Production service event consumption

§13's outbound-webhook deferral remains valid for the first partner beta,
but it is not a production waiver. Before public production, a
backend/service integrator must have a documented recoverable way to
consume economically relevant state changes without relying on a
best-effort WebSocket session that can lose continuity.

No delivery mechanism is selected by this ADR correction.

### 26.10 Added evidence cases

The evidence program must now explicitly include:

1. Late Join Test.
2. Partition Heal Test.
3. Tombstone Resurrection Test.
4. Malicious Selective Forwarding Test.
5. Eclipse / Bootstrap Diversity Test.
6. Node Descriptor Authenticity / Staleness Test.
7. Wire-Version Mismatch Test.
8. Node-Key Rotation / Compromise Test.
9. Node Switch / Economic Continuity Test.
10. Gossip Resource-Exhaustion Test.
11. Clock-Skew / Offer-Expiry Test.
12. Independent Node Operator No-Assistance Test.

These are implementation/evidence consequences of the already-accepted
architecture, not a new topology model.

**BACKLOG DELTA:** DETECTED AND SYNCED in `docs/BACKLOG.md`.
