# Sails Node Network & Shared Liquidity Architecture Discovery

**Type:** Architecture Discovery / Network Topology / Economic
Coordination / Incentives. **Priority:** High / Day-0 architecture.
**Execution:** parallel, isolated mission. **Status:** discovery only —
no implementation, no ADR authorized by this document. This document
is intentionally self-contained and does not assume or depend on any
other in-flight branch's own files.

**Isolation note:** this branch was created from the exact commit PR
#92 merged into `main` (`f7119aea8e21a9dae4b4f51360e8a90a65dec993`), as
instructed, specifically so this discovery did not depend on or
conflict with concurrent institutional-document work happening on
`main` past that point. Only this one file was created; no institutional
document (`BACKLOG.md`, `ROADMAP.md`, `NORTE_FIXO.md`,
`TECHNICAL_DEBT_AUDIT.md`, `CRYPTOGRAPHIC_MODEL.md`), Project, or Issue
was touched by the original discovery pass. Rebased onto current `main`
(2026-09-09) for merge, per CTO instruction — no content changed by the
rebase itself.

**Institutional standing, stated explicitly (2026-09-09, CTO
instruction):** **this document is a historical/research/evidence
artifact.** `ADR-001-day0-multi-operator-network.md`
(`docs/adr/ADR-001-day0-multi-operator-network.md`) is the architecture
decision authority for the Day-0 Multi-Operator Sails Network — where
this document's own findings informed or were reconciled into that
ADR, the ADR's own text governs. **Model-letter naming is local to each
document and is not shared vocabulary** — this document's own Models
A-E (§7) describe a different set of topology shapes than ADR-001's own
A-E (Central Index / Federation / Signed Gossip / DHT Discovery /
Hybrid); compare the underlying topology descriptions across documents,
never the letter names alone, exactly as ADR-001's own disambiguation
note (added the same day) also states.

---

## 1. Scope

**Central question:**

> How can multiple independently operated Sails Nodes participate in
> one shared economic network from Day 0, without a central authority
> being required to determine market membership, liquidity truth, or
> participant legitimacy?

Preserved throughout: **node choice must not define market
membership**; **liquidity should be network-level, node operation
should be service-level**; **multiple nodes must not silently become
multiple isolated marketplaces.**

---

## 2. Current Sails topology (repository truth, checked before proposing anything)

Verified directly against the code at this commit, classified per the
mission's own scale:

- **`SailsClient.baseUrl`** — a single, hardcoded HTTP/WS endpoint per
  client instance (`packages/sails-sdk/src/client.ts`). **CURRENT
  IMPLEMENTATION.** No multi-endpoint, failover, or node-list concept
  exists in the SDK today.
- **HTTP/API topology** — one Fastify server (`src/app.ts`) backed by
  one Postgres database via Prisma. **CURRENT IMPLEMENTATION.**
- **Pears/HyperDHT usage** — real, serverless peer discovery and direct
  connections (`infrastructure/p2p/pear.service.ts`), used today
  **only** for pairwise chat/negotiation transport between two already-
  matched trade counterparties. **CURRENT IMPLEMENTATION**, narrowly
  scoped. **Not used for offer/order discovery, liquidity propagation,
  or any node-to-node communication today** — confirmed by direct
  reading, not inferred. **Pears does not already solve federation or
  liquidity propagation** — it solves *pairwise, already-matched*
  connectivity, a materially different problem.
- **OpenLiquidity / `InternalOrderBook`** — `liquidity.service.ts`'s
  `getOffers()` reads directly from the local Postgres `Offer` table,
  with real pagination (`limit`/`offset`) and filters
  (`priceMin`/`priceMax`/`paymentMethod`). **CURRENT IMPLEMENTATION.**
  No cross-node query path exists.
- **Offer persistence/discovery** — `Offer` rows, per-node, no
  signature field tying terms to their claimed owner. **CURRENT
  IMPLEMENTATION.**
- **Trade persistence** — `Trade` rows, per-node, `buyerId`/`sellerId`
  are foreign keys into that node's own `User` table. **CURRENT
  IMPLEMENTATION.**
- **Participant identity** — `User.publicKey`, Ed25519, client-
  generated, uniqueness enforced only within one node's own database
  (`identity.service.ts`). **CURRENT IMPLEMENTATION.** The same
  keypair registered on two nodes today creates two unrelated
  identities. **PROPERTY, not yet true:** identity should be portable
  in principle (it's just a keypair) — **INFERENCE**, not yet built.
- **Reputation** — `User.reputationScore`, a mutable per-node `Float`,
  partially backed by durable `ReputationEvent` rows (star ratings) and
  partially not (fee/vouch-penalty increments have no matching
  per-delta event log). **CURRENT IMPLEMENTATION.**
- **Settlement orchestration** — `escrow.service.ts` plus per-rail
  `SettlementProvider`s (`MOCK`, `WDK_USDT_EVM`, `MULTISIG`,
  `LIGHTNING_HODL`), each producing a real, independently-verifiable
  on-chain artifact (transaction hash / PSBT) for on-chain rails.
  **CURRENT IMPLEMENTATION**, and a genuinely positive one: on-chain
  settlement truth is already maximally portable — the chain itself is
  the shared, neutral record, no Sails-specific mechanism needed for
  that part.
- **Event bus** — an in-process/Postgres-backed event system with a
  Redis Pub/Sub **cross-instance fan-out** for horizontally-scaled
  copies of the *same* deployment (multiple server processes sharing
  one Postgres/Redis). **CURRENT IMPLEMENTATION**, and explicitly **not**
  a cross-*operator* mechanism — it assumes one owner's own multiple
  processes, not independent nodes.
- **Existing node/operator concept** — **UNKNOWN/absent.** No schema,
  API, or documentation anywhere in this codebase names a "node" as a
  distinct economic or network actor. There is no operator registry,
  no node identity, no node capability advertisement.
- **Existing economic allocation for node operators** — a real,
  already-shipped chain exists for economic attribution in general:
  `FeeCollectionEvidence(CONFIRMED) → FeeObligation →
  DistributionPolicyVersion → EntitlementLedgerEntry`
  (`prisma/schema.prisma`). **CURRENT IMPLEMENTATION** for the
  mechanism; **UNKNOWN/not yet decided** whether "Node Operator" is
  itself an eligible recipient category within it — no such category
  is named in the schema or any policy today.

**Headline conclusion for this section:** Sails today is architecturally
a **single-node, single-database system** with two genuinely reusable
building blocks for a multi-node future (real Ed25519 identity
signatures already used elsewhere in the codebase, and already-portable
on-chain settlement truth) — but zero existing multi-node discovery,
propagation, or coordination mechanism of any kind.

---

## 3. Mostro

**Real, sourced findings** (directly fetched/verified, not recalled
from memory):

- **Architecture:** each Mostro instance (`mostrod`) is simultaneously
  the order publisher *and* the Lightning hold-invoice escrow
  custodian for the orders it creates — "non-custodial escrow
  coordinator between buyers and sellers using the Lightning Network."
  [MostroP2P/mostro](https://github.com/MostroP2P/mostro)
- **Order discovery is genuinely network-wide, settlement authority is
  not:** orders publish as **NIP-33 replaceable events** (kind
  `38384`) to public Nostr relays — a client connected to multiple
  relays sees orders from many independent Mostro operators in one
  unified view. **But settling a trade always requires working with
  the specific `mostrod` that created that order**, since only that
  node holds the Lightning hold invoice — trust and settlement
  authority never transfer to a different node just because discovery
  is shared. **No mechanism exists for one Mostro node to take over or
  coordinate another's trade** — confirmed, no such reference found.
  This is the cleanest real-world precedent found for exactly the
  property this document's own §5 needs: **discovery ≠ execution ≠
  settlement authority.**
- **Node identity/capability advertisement:** operators publish
  **kind `38385` "operator info" events** advertising node policies,
  fees, and reputation — a real, working precedent for node capability
  advertisement (§12) that does not require a central registry.
- **Fees:** each node operator sets its own fee, typically ~0.3% for
  both sides — no protocol-mandated percentage.
- **Anti-abuse bond:** an *optional*, node-level Lightning hold-invoice
  bond for makers/takers, released on honest trades, slashed only on a
  dispute-solver directive or a timeout — **enabled per-operator, not
  network-wide**, explicitly trading off marketplace friction against
  abuse resistance at each node's own discretion.
- **Reputation/trust:** a peer-rating system lets users rate Mostro
  *nodes themselves*, not just counterparties — "users should reject
  bad Mostros, which will lose incentives to keep existing." A market-
  based, not centrally-enforced, node-quality mechanism.
- **Node trust assumptions / failover / fragmentation risk:** trust is
  fundamentally per-node for settlement (the custodial hold-invoice
  holder), which is a real, disclosed limitation of the Mostro model
  itself — a node's disappearance mid-trade is a genuine open risk in
  that architecture too, not solved by Nostr's own discovery layer.
  **Not copied automatically** — Sails' own on-chain settlement rails
  (unlike Lightning hold invoices specifically) already produce a
  neutral, third-party-verifiable artifact (§2), which is a materially
  different, stronger starting position than Mostro's own
  single-custodian-per-trade model for at least the on-chain rails.

## 4. Nostr

- **Relay model:** relays are independently operated, permissionless to
  run, and clients choose which ones to connect to — no membership
  authority of any kind. A relay can refuse to store or serve events
  (its own policy), but this only affects *that relay's* visibility of
  the event, not the event's own validity (it's signed by the author,
  independently verifiable by anyone).
- **Multi-relay publishing / discovery:** a client typically publishes
  to several relays at once and reads from several, precisely to avoid
  depending on any one relay's availability or policy — directly
  analogous to Mostro's own "publish to Nostr, discover from any relay"
  pattern above.
- **Event replication:** relays do not coordinate with each other or
  guarantee replication — a client that wants broad reach publishes
  redundantly itself; there is no relay-to-relay gossip protocol in the
  base spec.
- **Relay independence / censorship resistance:** the core resistance
  property comes from redundant publishing plus client-side relay
  choice, not from any single relay's behavior — censorship by one
  relay operator degrades reach, it does not remove the signed event
  from existence.
- **Duplicate/stale events — directly relevant precedent:** **NIP-33
  "parameterized replaceable events"** (the same event kind Mostro uses
  for orders) resolve exactly the convergence problem this document's
  own §6 needs: a newer event with the same author + kind + "d tag"
  replaces an older one, ordered by timestamp. This is architecturally
  the same shape as a monotonic-revision scheme — strong, independent
  confirmation that "newest signed version wins, no central
  arbitration needed" is a proven, real-world pattern for exactly this
  problem class.
- **Trust model:** entirely signature-based — a relay is a dumb
  storage/relay point, never an authority over content validity.
- **Relay selection UX:** most Nostr clients ship sensible default
  relays and let advanced users add/remove relays in settings — the
  same "advanced setting, not mandatory cognitive load" shape this
  document's own §17 (User UX) independently arrives at.
- **Incentives / paid relays:** some relays charge a small fee or
  require a proof-of-work/allowlist to reduce spam — a real, disclosed
  example of a relay-level anti-spam mechanism that doesn't require
  network-wide central authority (each relay sets its own policy).

## 5. Bitcoin lessons (architecture/incentive reference only)

Used strictly as a reference for the *properties* Bitcoin demonstrates,
**not** claimed as consensus-equivalent to anything Sails needs:

- **Node independence:** any full node validates the chain independently;
  no node's cooperation is required for another to function correctly.
- **Common protocol truth without a privileged membership server:** the
  chain itself (an append-only, globally agreed structure) is the
  shared truth — no operator "owns" network membership.
- **Ability to choose peers:** nodes connect to whichever peers they
  like; peer selection affects propagation speed, not correctness.
- **Economic incentives where applicable:** miners are compensated for
  a *specific, verifiable* service (finding a valid block) — directly
  analogous to this document's own §13 principle that node
  compensation must attach to *verifiable contribution*, not mere
  existence.

**Not claimed:** Sails does not need Bitcoin-style global consensus —
Sails' actual shared-state need (per §5 below) is far narrower
(advertisements, not a total-ordered ledger), so a consensus mechanism
would solve a stronger property than required.

## 6. Other relevant systems (only where materially useful)

- **Bisq:** a fully P2P, no-central-server Bitcoin exchange using its
  own P2P network (not Nostr) for order-book propagation, with
  security deposits (bonds) to discourage trade griefing — a real,
  independent confirmation that "bonded, no-central-authority P2P
  order book" is a proven category of system, reinforcing rather than
  contradicting Mostro's own bond mechanism.
- **RoboSats:** Lightning-settled, uses a small number of coordinator
  servers (not fully decentralized network-wide discovery) — a real
  example of the "Model B/hybrid" trade-off this document's own §7
  compares, useful as a data point that not every real P2P Bitcoin
  exchange chooses full decentralization at the discovery layer.
- **Federated vs. replicated marketplace models generally:** the
  broader pattern (a bounded set of known, cooperating operators
  replicating shared state) is Model C below — not researched further
  here beyond what §7/§21 already need, per the mission's own
  instruction not to expand by curiosity.

---

## 7. Topology models compared (A-E)

**Model A — Central Sails Coordinator.** Baseline negative control:
wallets → one Sails-operated node. Rejected as a Day-0 default: directly
contradicts "node choice must not define market membership" by making
node choice moot (there is only one). No censorship resistance, no
operator independence, single point of failure for the entire market.

**Model B — Independent Isolated Nodes** (today's actual reality,
confirmed §2): `Wallet A → Node A → Market A`, `Wallet B → Node B →
Market B`, no cross-node discovery. **Demonstrated failure mode,
concretely:** if Node A accumulates 100 offers and Node B only 3, a
wallet connected to Node B sees a materially worse market than one
connected to Node A, for no reason related to the actual global
liquidity available — three isolated marketplaces, not one Sails
economic network, exactly contradicting the network-effect premise
`PROJECT_CONTEXT.md`-level positioning already claims (a claim this
document does not re-litigate, only confirms the current gap against).

**Model C — Federated Nodes.** A bounded set of known, mutually-
trusting nodes replicate shared state (offers, possibly more) between
each other. **Membership:** requires an explicit join process (whom do
existing federation members trust?) — this reintroduces a de facto
admission gate, in tension with "no central authority" unless the
federation itself has an open, permissionless join rule (rare in
practice for federated systems). **Trust:** each member must trust
every other member's own data at some level. **Censorship:** a
federation can collectively exclude a non-member's node. **Reconciliation:**
requires real conflict-resolution machinery for replicated state.

**Model D — P2P Shared Discovery Layer.** Nodes participate in a shared
discovery mechanism (e.g., signed-event gossip or relay-style
publishing, per Mostro/Nostr's own real precedent, §3/§4) without any
membership gate — any node that can connect and speak the protocol
participates. Offers/participants are discovered independently by each
node choosing its own set of peers/relays to consult, mirroring Nostr's
own multi-relay client pattern exactly.

**Model E — Hybrid.** Local node (full economic authority over its own
participants' trades) + P2P/relay-style discovery layer (shared
advertisements) + direct pairwise participant-to-participant
communication for anything private (negotiation, trade coordination) —
this is architecturally what Mostro *already is* in practice (local
escrow authority per node, Nostr for discovery, and off-relay/direct
messaging for the sensitive trade-execution steps in its newer
protocol versions, confirmed §3's "NIP-44 direct transport... without
round-tripping the trade conversation through public addressable
events").

**No preference chosen here** — §20/§23 discuss what the evidence
supports without selecting a final model, per the mission's own
instruction.

---

## 8. Shared liquidity semantics

**Property, precisely defined, not assumed:** "shared liquidity" is not
one property but several, and conflating them is a real risk this
document explicitly avoids:

> **Discovery ≠ Execution ≠ Settlement Authority.**

- **Offer discoverability:** can a participant *see* that an offer
  exists, regardless of which node they're connected through? This is
  the narrowest, cheapest property to satisfy (Mostro/Nostr's own
  model proves it's achievable with no central authority).
- **Offer availability:** is the offer still open (not yet fully
  matched/cancelled/expired) at the moment of discovery? Requires
  freshness, not just existence — directly related to §9's replay/
  staleness concerns.
- **Executable liquidity:** can the discovering participant actually
  *act* on the offer (initiate a trade), or only observe it? This
  requires reaching the offer's actual owner/originating node, which
  is exactly Mostro's own "you must work with the originating node to
  settle" finding (§3) — discoverability does not imply
  executability without a real connection path to the owner.
- **Settlement capability/authority:** even once a trade is initiated,
  who/what actually has authority over the trade's economic outcome?
  For Sails, this is properly the two **participants themselves**
  (via the relevant `SettlementProvider`'s own signature/receipt
  mechanism), never "whichever node happened to relay the discovery" —
  the node that helped a participant *find* an offer gains no claim
  over what happens once a trade begins.

**Explicit rejection of the naive claim:** "Node B sees offer ⇒ Node B
can settle offer" is **false** under every model compared in §7 except
Model A (and even there, only trivially, since there's only one node).
Under B/C/D/E, seeing an offer and being able to execute against it are
genuinely separate capabilities requiring a real connection to the
offer's actual owner, not merely visibility of its existence.

---

## 9. Offer propagation

**Critical question, answered structurally (mechanism-agnostic), per
the mission's own instruction not to choose a mechanism yet:**

> If Alice publishes an offer through Node A, how does Bob — connected
> only to Node B — discover and safely act on it?

**Discovery half:** requires *some* mechanism (Model C/D/E, §7) that
carries Alice's offer beyond Node A's own database to somewhere Bob's
Node B can observe it. Mostro/Nostr's own NIP-33 pattern (§4) is a
proven, real precedent for this half specifically.

**"Safely" half — the harder, more Sails-specific requirement:** for
Bob to *act* on a discovered offer without trusting Node A's own
database integrity, the offer itself must be **self-authenticating** —
carrying Alice's own signature over its economic terms (asset, side,
price, min/max, payment method), independently verifiable by Bob's own
Node B without asking Node A to vouch for it. **Today, `Offer` has no
signature field at all** (§2) — this is the single most concrete,
mechanism-independent prerequisite this section surfaces: *whatever*
propagation mechanism is eventually chosen (§7), an unsigned offer
cannot be safely relayed by a third party, because nothing stops a
relaying party from silently altering it.

**Sub-questions, answered as properties, not mechanisms:**
- **Publishing/update/cancellation:** must all be operations only the
  offer's own signer can produce (the same signature requirement, not
  a new one per operation).
- **Deduplication/replay protection/stale detection:** structurally the
  same problem NIP-33 already solves for Nostr — a monotonically
  increasing revision/version number per logical offer, with
  "newest-signed-wins" as the resolution rule, requiring no central
  arbiter (confirmed as a real, working pattern, §4).
- **Expiration:** must be self-enforcing (an owner-signed, time-bound
  claim any verifier checks against its own clock), not requiring an
  action from anyone once set.
- **Price update / availability / min/max / payment methods / assets /
  rails / capability declaration:** all just fields within the same
  signed-offer envelope — no separate mechanism needed per field.

---

## 10. Trade coordination

**Once two participants enter a trade — property-first, not mechanism-first:**

> Operator availability must not silently become economic authority.

- **Who coordinates?** Structurally, the two participants themselves —
  Sails' own pairwise transport (Pears, §2) already connects
  participants by public key, not by node, so "coordination" need not
  mean "one privileged node arbitrates" at all.
- **Originating node / buyer node / seller node / both / direct P2P?**
  The evidence (Mostro's own settlement-authority-stays-with-originator
  finding, §3, plus Sails' own already-pairwise transport, §2) points
  toward: discovery may happen via any node, but **actual trade
  coordination is naturally pairwise between the two real participants**
  — each participant's own node is simply that participant's local
  bookkeeping/UI backend, not a third-party authority over the trade.
- **Can coordination migrate if one node disappears?** Only if the
  surviving participant retains their own copy of whatever the two
  parties mutually agreed to (a real, durable, ideally jointly-signed
  artifact) — this is a property requirement for any future design,
  not yet satisfied by anything in this codebase today (§2 found no
  such artifact exists yet).
- **What evidence must survive?** At minimum, the trade's own terms and
  the settlement provider's own authoritative record (a transaction
  hash, a PSBT) — both of which, for on-chain rails, are **already**
  independently verifiable without needing either node's own database
  intact (§2's positive finding).
- **What is protocol truth vs. runtime projection?** The **settlement
  provider's own on-chain/receipt state** is protocol truth (verifiable
  by anyone); a `Trade` row in any one node's Postgres is a *runtime
  projection* of that truth for that node's own UI/bookkeeping purposes
  — a real, useful distinction this document introduces precisely to
  avoid over-trusting either party's own local database as if it were
  the authoritative record.

---

## 11. Node failure

Ten scenarios, each classified honestly (**Possible today** / **Possible
with a future mechanism, not yet built** / **Unresolved**):

| Scenario | Status |
|---|---|
| Node disappears before trade | **Possible today** — the offer (once signed/propagated, a future capability) simply becomes unreachable for new discovery from that source; no economic harm, nothing was committed |
| Node disappears after match | **Unresolved today** — no jointly-signed trade-open artifact exists yet (§10) for the surviving party to fall back on; **possible with a future mechanism** once one does |
| Node disappears after fiat payment | Same as above, materially worse (real off-chain value has moved) — **unresolved today**, a strong argument for prioritizing the jointly-signed handshake artifact in any future design |
| Node disappears during escrow | **Partially possible today** for on-chain rails — the escrow's own on-chain state is independently verifiable (§2); the *off-chain authorization* (who approved release) is not yet signed by participants for ordinary releases, only for `DisputeOutcome` — **unresolved for the general case** |
| Node disappears during dispute | Same as above; `DisputeOutcome.attributionRawProof` (already real, signed by the arbiter) is a genuine positive precedent that *could* extend to non-dispute cases, not yet applied there |
| Node censors participant | **Unresolved today** — no multi-node model exists yet in which "switch to another node" is even a coherent recovery action |
| Node refuses offer | Same — moot until a propagation mechanism (§9) exists to refuse *from* |
| Node lies about available offer | **Directly prevented once §9's signature requirement lands** — a lying relay cannot fabricate a signature it doesn't hold |
| Node presents stale state | **Directly prevented once §9's revision/newest-wins rule lands** (proven pattern, §4) |
| Node partitions from network | **Possible today, trivially** — since no network exists yet, "partition" is not yet a meaningful failure mode; becomes relevant once §7's chosen model is built |

**Dispositive question, answered honestly:** *"Can the participant
continue/recover through another node without changing the economic
meaning of the trade?"* — **Not today.** The two genuine building
blocks that would make this possible (a jointly-signed trade-open
artifact, and signed authorization for ordinary settlement releases)
do not yet exist in this codebase. This is the single clearest Day-0
gap this section surfaces.

---

## 12. Identity / reputation portability

**Preserved:** node selection must not redefine participant identity.

- **Participant identity portability:** the underlying keypair
  (`User.publicKey`) is portable in principle; **not portable in
  practice** — registering on two nodes creates two unrelated `User`
  rows (§2, confirmed). The existing challenge-response authentication
  primitive (`common/middleware/auth.ts`) is directly reusable for a
  second node to verify "this really is the holder of this key" — no
  new cryptographic primitive needed, just a coordination question of
  whether/how a second node chooses to recognize a key it has never
  seen register before.
- **Reputation read/write, proof portability:** reputation is only
  partially event-sourced today (§2) — star ratings are durable and in
  principle re-derivable by a party with access to the underlying
  `Trade`/`ReputationEvent` rows; fee/vouch contributions are not
  backed by an equivalent granular ledger.
- **Node-local caches / signed state / binding / privacy:** any future
  design must distinguish a node's own *local cache* of another
  party's reputation (convenient, not authoritative) from *signed
  state* a participant can independently present and any node can
  verify (the direction with real portability value) — not designed
  here.
- **`reputation@NodeA` vs. `reputation@NodeB` as accidentally distinct
  economic identities:** confirmed as the **actual current behavior**
  (§2) — not a hypothetical risk, a demonstrated fact of today's
  schema. This is a real, present-tense gap, not a future risk.

---

## 13. Privacy

Investigated risks, each named honestly:

- **Global liquidity visibility:** any discovery mechanism (Model C/D/E)
  inherently makes offer terms visible beyond the originating node —
  unavoidable, the whole point of discovery; the question is scope
  (who sees it), not whether visibility exists at all.
- **IP/network metadata:** whatever transport carries propagation
  (Pears/HyperDHT, a relay-style system, or something else) inherits
  that transport's own metadata-exposure properties — Pears/Hyperswarm's
  own known trade-off (connections reveal real network addresses,
  even though peers are keyed by public key) already applies to
  today's pairwise usage and would extend to any propagation use.
- **Cross-node correlation / identity correlation:** a participant
  whose offers appear identically across many nodes' own discovery
  views becomes correlatable by anyone observing multiple nodes —
  inherent to any broad discovery mechanism, not specific to one model.
- **Node observing the full trade graph:** mitigated structurally by
  §10's own finding — if trade coordination stays pairwise (direct
  participant-to-participant), no single node ever needs to see a full
  graph of who trades with whom; a node only sees its *own* users'
  trades, the same privacy boundary that already exists today.
- **Nodes colluding:** a real, unresolved risk under any federated
  model (C) specifically — two colluding federation members could pool
  observations neither could gather alone. Weaker concern under
  D/E (no membership to collude *within*, only whichever nodes a
  participant's own traffic happens to touch).
- **Wallet always using the same node:** creates a durable, node-level
  correlation handle for that wallet's users over time — a real,
  disclosed cost of *any* fixed default-node configuration, mitigated
  only by making node choice (or rotation) genuinely available, not
  necessarily mandatory (§17).
- **Discovery leaking intent:** a participant who queries for a
  specific asset/side/price range reveals *something* about their own
  intent to whichever node/relay serves that query — inherent to
  query-based discovery generally, not unique to Sails.
- **Professional provider fingerprinting:** a professional provider's
  offers, if consistently signed by the same key and advertised
  identically everywhere, becomes a stable, trackable fingerprint —
  arguably an acceptable, even desired, property for a business
  wanting to be found (unlike an individual privacy-seeking
  participant) — a real distinction between actor types worth naming
  for a future design, not resolved here.

**Minimization options, named not designed:** pairwise-only trade
content (already true today, §10); narrower, filtered discovery queries
rather than "give me everything" (already partially real, §2's
pagination/filter mechanism); node/relay rotation for advanced users
(§17). **Not sacrificing privacy merely to get simple replication** —
Model C's own federated-replication shape is exactly the model with the
weakest privacy profile compared here (full members see everything
replicated to them), a real, evidence-based argument against defaulting
to it, not an aesthetic one.

---

## 14. Node discovery / membership

> **Bootstrap ≠ authority.**

Models available, none chosen:

- **Static bootstrap list:** simplest, works today conceptually (a
  config file of known peer addresses) — Satsails could publish one
  without it being the *only* valid one, any operator free to publish
  or use an alternative.
- **DNS/bootstrap seed:** Bitcoin's own precedent (§5) — a well-known,
  low-trust discovery aid, not membership control.
- **DHT discovery:** HyperDHT (already a dependency, §2) is a real
  candidate for this specific role (peer lookup), separate from
  whether it's also used for offer-content storage (a materially
  different, unconfirmed capability).
- **Gossip:** peer-exchange, letting a newly-connected node discover
  further peers transitively beyond its initial bootstrap set —
  standard in Hyperswarm-family protocols already.
- **Signed node announcements:** Mostro's own kind `38385` "operator
  info" events (§3) are a real, working precedent for this — a node
  publishes a signed statement of its own existence/capabilities,
  discoverable the same way offers are.
- **Social/web-of-trust:** not evaluated in depth here — plausible as a
  *complement* (a user manually adding a trusted friend's node) but not
  a substitute for a base discovery mechanism.
- **No formal membership, at all:** the option most consistent with
  "bootstrap ≠ authority" taken to its logical conclusion — any node
  that can be reached and speaks the protocol is a de facto
  participant; there is no admission list to be a member of in the
  first place.
- **Hybrid bootstrap:** combining a static/DNS seed for the *very first*
  connection with gossip/peer-exchange for everything after — the
  shape most real P2P systems (including Bitcoin, Hyperswarm itself)
  actually use in practice.

**Preserved, demonstrated by Mostro's own architecture (§3) as a real,
working pattern, not merely a hoped-for property:** a bootstrap
relay/server can genuinely help discovery without being economic
authority — Mostro's own bootstrap-relay-discovery mechanism helps a
new client find relays; it grants that relay operator zero authority
over any Mostro node's own escrow/settlement function.

---

## 15. Node identity

Investigated as properties a node *may* need to advertise, **no schema
designed**:

- **Stable public key:** plausible, mirrors Mostro's own operator-info
  pattern (§3) and would let a signed node-announcement (§14) be
  independently verifiable the same way an Offer would be (§9) — reuses
  the same cryptographic primitive class already used elsewhere in this
  codebase, not a new one.
- **Metadata:** service capabilities, supported assets, supported
  settlement rails, fee policy, version, uptime signal, optional
  jurisdiction metadata, endpoint(s), reputation — all directly
  mirrored by Mostro's own real, shipped "operator info" event fields
  (fees, policy, reputation, §3) — a proven, minimal set, not
  speculative.
- **Not designed:** exact wire format, exact field list, exact
  verification flow — all deferred to a future ADR, consistent with
  the mission's own "no schema" instruction.

---

## 16. Incentives / fees (qualitative only, no percentages, no policy change)

**Actors:** maker, taker, wallet/integrator, node operator, liquidity
provider, arbitrator, Sails protocol itself.

**Dispositive question:** *what useful economic service does a node
perform that could justify compensation?*

Candidate services, evaluated for verifiability (not assumed
legitimate):
- **Discovery availability** — hard to verify after the fact without a
  signed record of which node served which query to whom; no such
  record exists or is proposed here.
- **Routing/relay** — more verifiable *if* the propagation mechanism
  itself is signed/versioned (§9's own requirement) — a relay's
  contribution could in principle be proven by showing it forwarded a
  specific signed message, not designed further here.
- **Persistence** — a node storing/serving offer or evidence data for
  others is a real, nameable service, verifiable to the extent the
  stored data itself carries the requester's own record of having
  fetched it from that node.
- **Coordination** — the most naturally verifiable candidate: directly
  derivable from an already-durable `Trade`/`Escrow` row (which node a
  real participant actually used), requiring no new proof mechanism.
- **Evidence availability** — hosting `EvidenceReference` media is at
  least as verifiable as the participant signature the evidence itself
  already carries (§2's existing precedent).
- **Anti-spam / infrastructure generally** — real value, but no
  verification mechanism proposed here.

**Preserved, verbatim:**

> Node operators should earn by providing useful infrastructure, not by
> fragmenting or capturing liquidity.

> Integration open ≠ economic coordination free.

**No percentages, no fee-split formula, no economic-policy change
authorized by this document.**

---

## 17. Anti-fragmentation analysis (Nash / incentive-compatibility, qualitative)

**Bad equilibrium, named explicitly:** a node hides externally-
discovered offers → captures more of its own local trade volume →
earns more of whatever local fee it charges → but network-wide
liquidity fragments → every node (including the hider, eventually) sees
a shallower, worse market than a genuinely shared one would provide.

**Desired equilibrium:** a node exposes the shared market fully → its
own users get better execution (deeper liquidity, better prices) →
attracts more users/trades to that node specifically, *because* of
better service, not exclusive access → the operator earns more through
genuinely useful service (§16's verifiable-coordination category),
not through enclosure.

**Whether the architecture naturally points this way, as a
hypothesis, not a proof:** **it depends entirely on whether any future
compensation mechanism (§16) rewards raw discovery/relay volume
(which a hiding node could game by relaying nothing and still
"existing") versus rewarding only verified coordination of real,
confirmed outcomes (which a hiding node cannot fake, since it requires
an actual completed trade through that node).** This document's own
recommendation (§27) is to compensate only the latter — under that
constraint specifically, hiding offers has **no** compensating
upside: a node earns nothing extra for volume of offers *seen or
withheld*, only for trades it actually, verifiably coordinates, so
withholding liquidity can only ever *reduce* a node's own trade volume
(fewer users choose a worse market), never increase its earnings.

**Named, not solved:** free-rider problem (a node that never
propagates anything but still benefits from others' propagation);
Sybil node problem (§19); fee-routing gaming, fake routing, self-
dealing, wash volume (all require the same underlying verifiability
gap named in §16 to be closed before any of them can be meaningfully
prevented). **No claim of a formally modeled Nash equilibrium** —
stated as an **incentive-compatible direction**, consistent with the
evidence above, not a proof.

---

## 18. Professional liquidity providers

**Scenario, explicit:** a web service selling BTC/USDT/DePix connects
to Sails, publishes quotes/liquidity, and any wallet on the network can
discover it.

**Do current primitives naturally support this? Evaluated field by
field, gaps classified, no second marketplace proposed:**

| Need | Current support | Gap classification |
|---|---|---|
| Quote (price) | Yes — `Offer.priceUsd` | NO GAP |
| Expiration | **No field exists** | PRODUCTION INFRASTRUCTURE GAP — needed for *any* propagated offer, not provider-specific (§9) |
| Inventory | **No aggregate-inventory tracking** — only per-trade `minAmount`/`maxAmount` | PRODUCTION INFRASTRUCTURE GAP |
| Min/max | Yes | NO GAP |
| Payment methods | Yes — `Offer.paymentMethod` | NO GAP |
| Automated acceptance | Always-on today (no review gate) — acceptable default, not a gap for Day-0 | KNOWN RESIDUAL |
| Service availability | `Offer.status` exists; no uptime/health signal beyond that | DX GAP |
| Webhook/event | **No outbound webhook mechanism** — WebSocket only | PRODUCTION INFRASTRUCTURE GAP, reasonably deferrable past Day-0 beta |
| Settlement capability | Real, per-rail `SettlementProvider`s already exist | NO GAP |

**Critical test, answered:** *"Professional liquidity should compose
through Sails primitives rather than requiring a parallel provider-
specific market model unless evidence proves the existing semantics
insufficient."* **Evidence does not prove insufficiency** — every gap
found is an *additive* field/mechanism on the existing `Offer`/`Trade`
model (expiry, inventory, webhooks), not evidence that a professional
provider is a structurally different kind of economic actor requiring
its own object model. **No second marketplace is warranted.**

---

## 19. Developer UX

**Target:** `npm install @satsails/p2p-trading-sdk` → configure node/
bootstrap → connect wallet adapter → discover capabilities → discover
market → publish/consume offer → trade.

**Can a developer integrate without contacting the Sails team?**
**Partially, today, and only for the single-node case.** The
`npm install` → wallet-adapter → publish/consume-offer → trade steps
already work end-to-end against a self-hosted node (confirmed,
`docker compose up` + the SDK's existing public surface). **The
"configure node/bootstrap" and "discover capabilities" steps have no
real answer today** — there is no documented, public way to point a
client at a *shared* market rather than an empty, self-hosted island
(§2's own topology finding), and no live API to ask "what does this
specific node support" before committing to it (only static,
repository-level documentation exists for that).

**Hidden assumptions identified:** every existing example/doc assumes
the developer is standing up their *own* isolated node and never asks
"how do I join the real network" — because, honestly, there currently
isn't one to join (§2).

---

## 20. User UX

**Target:** an ordinary user sees `Buy BTC` / `Sell BTC` / `Buy USDT`,
never `select transport` / `select coordination protocol` / `select
order-book server`. Node selection, if it exists at all, belongs in
advanced/privacy/developer settings — never required for ordinary
operation.

**Compared with Mostro's own UX, not copied:** Mostro clients today
generally *do* surface node/operator choice more visibly than an
ideal Sails experience should (a user picks a specific Mostro
instance's order book, seeing its fee/reputation) — a reasonable
design for Mostro's own trust model (§3, since settlement authority
genuinely is per-node there), but **not automatically the right choice
for Sails**, where discovery could in principle be unified across
nodes in a way that hides node identity from the ordinary buy/sell flow
entirely, surfacing it only where it's genuinely load-bearing (e.g., an
advanced user picking which node executes a specific action). This is a
real, disclosed design-space difference from Mostro, not a copy.

---

## 21. Capability discovery

**Property, not an API design:** a wallet should be able to know,
without guesswork, which combinations of `wallet capability / node
capability / liquidity capability / settlement capability / production
maturity` are actually available — each a **separate claim**, none
implied by another (mirroring the same discipline already applied to
wallet-adapter vs. settlement-provider claims elsewhere in this
codebase's own documentation). **Not designed as an API here** — Mostro's
own kind `38385` operator-info event (§3/§15) is real, working
precedent for the *shape* such a thing could take (a signed,
discoverable capability statement), not a specification adopted here.

---

## 22. Threat model

Minimum threats named, each classified honestly:

| Threat | Property threatened | Handled today? | Mitigation candidate | Unresolved? |
|---|---|---|---|---|
| Malicious node | Discovery integrity | No — no multi-node model exists yet | Offer signatures (§9) prevent content forgery regardless of relay honesty | Yes, for relay-level abuse (drop/delay) |
| Sybil nodes | Fair participation / economics | No | §17's "no reward for mere existence" design already blunts the economic motive | Yes, structurally, if any future mechanism ever rewards raw node count |
| Eclipse attack | Discovery completeness | No | Multi-relay/multi-peer client behavior (Nostr's own precedent, §4) | Yes |
| Selective offer suppression | Discovery completeness | No | Same as above — redundant sourcing | Yes |
| Stale offer replay | Discovery correctness | No | Monotonic revision/newest-wins (§9, proven pattern §4) | Bounded once built |
| Fake liquidity | Offer authenticity | No — no signature exists today | Offer signature requirement (§9) | Bounded once built |
| Fee theft/misattribution | Node economics | N/A — no node economics active | §16's verifiability-first design | Yes, until built |
| Node identity spoofing | Node trust | No — no node identity exists today | Signed node announcements (§14/§15) | Bounded once built |
| Participant deanonymization | Privacy | Partially (§13) | Pairwise-only trade content (already true) | Yes, at the discovery-visibility layer |
| Trade-state equivocation | Economic correctness | No | A jointly-signed trade-open artifact (§10, not yet built) | Yes |
| Node collusion | Privacy, fairness | No | Weaker under Model D/E than C (§13) | Yes |
| DOS/spam | Availability | No | Nostr's own relay-level anti-spam precedent (fees, PoW, §4) | Yes |
| Bootstrap censorship | Discovery availability | Bounded by "bootstrap ≠ authority" (§14) | Multiple independent bootstrap sources | Partially |
| Compromised node | Everything that node touches | No | Scoped by pairwise trade design (§10) — a compromised node cannot forge another party's signature | Bounded, not solved |
| Inconsistent network partitions | Convergence | No | Newest-signed-wins (§9) converges once partitions heal | Bounded once built |

---

## 23. Day-0 minimum

**Separated explicitly, "future" not used to hide a real Day-0
requirement:**

**DAY-0 REQUIRED** (without which multiple independent operators would
be dishonest theater — i.e., claiming a "network" that is actually
Model B in disguise):
1. Signed `Offer` envelope (§9) — the single most concrete prerequisite
   found anywhere in this document.
2. Some working discovery/propagation mechanism satisfying Model D/E's
   own shape (§7) — mechanism choice deferred to a future ADR, but
   *a* mechanism, however minimal, is Day-0-required for the network
   to be real at all.
3. A jointly-signed trade-open artifact (§10/§11) — without it, "node
   disappears mid-trade" (§11) remains an unresolved economic-harm risk,
   not an acceptable Day-0 posture.
4. Signed authorization for ordinary settlement releases (§11), closing
   the gap between `DisputeOutcome`'s already-real signature pattern
   and everyday releases.

**BETA HARDENING** (important, can follow a controlled initial beta):
Sybil-resistance mechanism (§17/§19's own economics-first mitigation
already blunts urgency); node capability/identity advertisement
wire-format (§14/§15/§21); professional-provider inventory/webhook
gaps (§18); privacy minimization beyond pairwise-trade-content (§13).

**LATER** (non-blocking evolution): node economic compensation
activation of any kind (§16 — explicitly zero at Day-0, per the
"no reward for mere existence" incentive-compatibility argument, §17);
Model C-style federation, if ever pursued; formal Nash-equilibrium
modeling (§17).

---

## 24. Required output matrix

| Property | Central (A) | Isolated (B, today) | Federated (C) | P2P Shared (D) | Hybrid (E) |
|---|---|---|---|---|---|
| Shared liquidity | Trivially yes (one node) | **No — demonstrated failure mode, §7** | Yes, among members only | Yes, network-wide | Yes, network-wide |
| No central membership authority | **No** | Yes (but isolated) | Partial — federation membership is itself a gate | Yes | Yes |
| Censorship resistance | Very low | N/A (nothing to censor across) | Medium — depends on federation rules | High | High |
| Failure recovery | Poor (single point of failure) | Good, locally; N/A cross-node | Medium — surviving members continue | Good — no single node blocks the rest | Good |
| Privacy | Poor (one operator sees all) | Good, locally | Medium — member collusion risk (§13) | Good | Good |
| Operator incentives | None needed (one operator) | Perverse (isolation may look "successful" locally) | Requires federation-level agreement | Service-quality-based (§17) | Service-quality-based |
| Complexity | Lowest | Lowest (accidentally) | High (membership + replication + conflict resolution) | Medium (signature + gossip/relay) | Medium-High (adds pairwise-coordination layer) |
| Day-0 feasibility | Rejected on principle | **Current actual state — rejected as inadequate** | Low (membership-gate tension, high complexity) | **Highest among the real options** | High, once D's own pieces exist |

---

## 25. Final questions, answered explicitly

1. **Can Sails launch Day 0 with multiple independent node operators?**
   Not yet — the Day-0-required items in §23 do not exist today. They
   are buildable (nothing found requires an unavailable capability),
   but none is built.
2. **Can all nodes share one economic market?** Structurally yes, under
   Model D/E — Discovery ≠ Execution ≠ Settlement Authority (§8) means
   sharing the discovery plane doesn't require sharing (or globalizing)
   the settlement/trade-coordination plane at all.
3. **What must be protocol-level vs. runtime-level?** Protocol-level:
   the signed-offer envelope format, the identity/signature scheme
   (already real). Runtime-level: which specific discovery/propagation
   mechanism a given node implementation uses, how it chooses peers/
   relays, its own local reputation-scoring policy (§12).
4. **Does Pears already solve this? Exactly what and what not?**
   **Solves:** pairwise, NAT-traversed, public-key-addressed direct
   connections (already proven, §2). **Does not solve:** offer/order
   discovery, liquidity propagation, node identity/capability
   advertisement, or any node-to-node coordination — none of these is
   implemented today regardless of Pears' own underlying capability.
5. **Is a federation mechanism necessary?** Not demonstrated as
   necessary — Model D (no membership gate) satisfies the frozen
   properties without one, and scores better on Day-0 feasibility and
   censorship resistance (§24).
6. **Is a DHT/gossip mechanism necessary?** Some propagation mechanism
   is necessary (§23); whether it's DHT-based, gossip-based, or
   relay-based (Nostr/Mostro's own proven pattern) is a mechanism
   choice for a future ADR, not decided here.
7. **Can nodes remain economically independent while liquidity is
   shared?** Yes — Mostro's own real, working architecture (§3) is
   direct existence proof: shared discovery (Nostr) coexists today with
   fully independent, per-node settlement authority and fee-setting.
8. **How should node failure affect active trades?** Ideally, not at
   all, for the two actual participants — contingent on §23 item 3
   (jointly-signed trade-open artifact) existing; today, node failure
   mid-trade is a genuine, unresolved economic-harm risk (§11).
9. **Can users switch nodes without losing identity/reputation/trade
   context?** Not today (§12, demonstrated, not hypothetical) — the
   underlying keypair is portable in principle, the node-side
   recognition of it is not.
10. **What does a node actually earn fees for?** Nothing, today (no
    mechanism exists) — and per §16/§17, *should* eventually earn only
    for verifiable, confirmed contribution (coordination being the
    clearest candidate), never for mere existence or offer-visibility
    volume.
11. **What prevents liquidity hoarding?** Structurally, under the
    "compensate verified coordination only" design (§17): nothing to
    gain from hoarding, since hoarding reduces a node's own attractable
    volume without any compensating reward for withheld visibility.
12. **What prevents fake/Sybil nodes?** Not fully solved (§19/§22) —
    bounded by the same economics-first argument (no reward for mere
    node existence removes the primary incentive to Sybil-farm at
    Day-0), not a cryptographic Sybil-resistance mechanism.
13. **What Day-0 properties are currently missing?** Exactly the four
    items in §23's "Day-0 required" list — nothing more, nothing less,
    per this document's own evidence.
14. **Does this require a Core change?** Not established as required —
    every gap found (signed offers, jointly-signed trade handshake,
    release authorization) reads as additive to `OpenP2P`/
    `OpenLiquidity`/`OpenSettlement`, reusing the existing Core identity
    primitive (`User.publicKey`, Ed25519), not a Core-level redesign.
15. **Does this require a new protocol primitive?** Likely a new
    *envelope/schema* (the signed Offer, the trade-handshake artifact),
    not a new *cryptographic* primitive — the signing mechanism itself
    already exists and is reused (§2's `EvidenceReference`/
    `DisputeOutcome` precedent).
16. **Does this conflict with current architecture?** No direct
    conflict found — every proposed addition composes with, rather
    than replaces, the existing `Offer`/`Trade`/`User` schema and the
    existing Pears/HyperDHT dependency.
17. **What can be achieved using existing Pears/OpenLiquidity/OpenProof/
    etc.?** Pears: the pairwise connection layer for trade coordination
    (§10), already proven. OpenLiquidity: the local storage/query
    surface for discovered offers, including its already-real
    pagination/filtering, which generalizes for free once offers
    originate from more than one source. OpenProof: the
    `EvidenceReference`/`DisputeOutcome` signature pattern, directly
    reusable for both the signed-offer envelope and the settlement-
    release-authorization gap.
18. **What remains UNKNOWN?** Whether HyperDHT's own DHT capacity is
    suitable for advertisement-record storage at real scale (not
    benchmarked here); the exact Sybil-resistance mechanism if node
    economics are ever activated beyond Day-0; the precise reputation-
    recomputation algorithm and its staleness trade-offs; whether
    Model D's gossip/relay choice should more closely resemble Nostr's
    own relay model or a Hyperswarm-native peer-exchange gossip —
    genuinely open, not decided by this document.

---

## 26. Recommendation

**Evidence supports a directional shape, not a final mechanism choice**
— consistent with the mission's own instruction not to pick a winner
by aesthetics. The strongest, most evidence-backed direction found:

- **Model D (P2P shared discovery, no membership gate) over Model C
  (federated)** — Model C's own membership-gate tension with "no
  central authority" and its weaker privacy profile (§13, §24) are
  real, demonstrated costs; Model D satisfies the frozen properties
  more directly, and has a genuine, working real-world precedent
  (Mostro's own Nostr-based architecture, §3) proving the *pattern* —
  not a specific mechanism — is sound.
- **Discovery ≠ Execution ≠ Settlement Authority (§8) as the organizing
  principle** for any future ADR — this single distinction, borrowed
  directly from Mostro's own real, working architecture, resolves most
  of this document's own open questions (§25 items 2, 7, 8) once
  accepted as the starting frame.
- **The four Day-0-required items (§23)** — especially the signed-Offer
  envelope — as the concrete, mechanism-independent starting point any
  future ADR should treat as non-negotiable, since every other finding
  in this document (propagation safety, node-lie prevention, staleness
  resolution) depends on it existing first.

**Not recommended:** adopting Model C, adopting any node-economics
activation before a verifiability mechanism exists (§16/§17), or
treating this document's own comparative research (§3-§6) as
license to copy Mostro's or Nostr's architecture wholesale — every
citation above is used as *evidence for a property*, not as a
blueprint to replicate.

---

## Decisions requiring a future ADR

1. Final propagation mechanism: gossip over Pears/Hyperswarm, a
   Nostr-relay-style model, HyperDHT-based advertisement storage, or a
   composition — not decided here.
2. Exact signed-Offer envelope wire format and canonical serialization.
3. Exact jointly-signed trade-open handshake format.
4. Whether/how Sybil resistance is ever formally addressed if node
   economics activate beyond Day-0.
5. Exact reputation-recomputation algorithm and caching/staleness
   policy.
6. Whether "Node Operator" becomes a formal `DistributionPolicyVersion`
   recipient category, and if so, its eligibility criteria (explicitly
   not decided by this document or by `docs/PROTOCOL_ECONOMY.md`'s own
   already-registered non-normative open question).
7. Node identity/capability-advertisement wire format.

---

## Backlog Delta Candidates (not registered — CTO to reconcile after PR #93)

Per this mission's explicit isolation instruction, `docs/BACKLOG.md` is
not edited by this document. Candidates, classified for the CTO's own
reconciliation:

1. **Signed Offer envelope** — classification: **implementation
   obligation (Day-0 required)**. Likely overlaps with any other
   parallel Day-0 network work already in flight; CTO to check for
   duplication before registering.
2. **Jointly-signed trade-open handshake** — classification:
   **implementation obligation (Day-0 required)**.
3. **Signed authorization for ordinary settlement releases** —
   classification: **implementation obligation (Day-0 required)**,
   extends the existing `DisputeOutcome` signature pattern.
4. **`reputation@NodeA` vs `reputation@NodeB` accidental identity
   split** — classification: **evidence obligation / architecture
   gap**, demonstrated as a current, present-tense fact (§12), not
   hypothetical.
5. **Node identity/capability advertisement mechanism** — classification:
   **research question / beta-hardening obligation**, not Day-0
   required per §23's own separation.
6. **Node Operator as a `DistributionPolicyVersion` recipient category**
   — classification: **research question**, already partially
   registered non-normatively elsewhere per this document's own §2
   finding; CTO to confirm no duplicate registration results.
7. **Professional-provider quote-expiry/inventory/webhook gaps** —
   classification: **production infrastructure gap**, likely already
   represented elsewhere; CTO to cross-check before registering as new.
8. **Privacy minimization design for multi-node discovery** —
   classification: **research question / beta-hardening obligation**.
9. **Sybil-resistance mechanism (if/when node economics activate)** —
   classification: **research question**, explicitly deferred, not
   Day-0 blocking per §17's own economics-first mitigation.

**No BACKLOG DELTA is claimed as ZERO or forced to any particular
count** — this list is handed to the CTO for reconciliation against
whatever else is registered elsewhere, per this mission's own explicit
isolation and non-duplication instructions.
