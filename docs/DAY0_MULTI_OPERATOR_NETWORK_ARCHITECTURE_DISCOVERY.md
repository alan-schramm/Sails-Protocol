# Day-0 Multi-Operator Network Architecture Discovery

**Type:** Architecture Discovery (OpenP2P / OpenLiquidity / Interoperability
/ Economics / Security). **Priority:** blocker for Partner Beta.
**Status:** discovery only. No federation protocol, gossip algorithm,
DHT design, CRDT, replicated database, blockchain, consensus mechanism,
global order book mechanism, Nostr dependency, Pears-specific solution,
relay network, node registry, proof-of-relay, proof-of-coordination, fee
percentage, or leader election is chosen or implemented here. Property
first, mechanism second.

**Origin:** CTO mission, 2026-09-08, following PR #94's Day-0 Network
Property Correction. Every finding below is verified directly against
the current repository state (file, model, or line cited throughout) —
nothing is assumed true because it would be architecturally convenient.

---

## 1. Scope

**Objective:** discover the smallest architecture capable of satisfying
the Shared Market Universe property at Day-0, without a mandatory
central authority. Frozen properties (§2) are the starting point, not
a conclusion to re-derive. This document does not select a consistency
model, a transport, or an economic-attribution mechanism — it maps what
exists, what's missing, and what a future ADR must decide between.

---

## 2. Frozen properties

Carried forward verbatim from `docs/BACKLOG.md`'s Day-0 entry (PR #93/
#94), not re-litigated here:

- **Node choice must not partition the economic market.**
- **All conformant Sails Nodes must be able to participate in the same
  protocol-level liquidity universe.**
- **Shared Market Universe ≠ Instantaneous Identical View.**
- **Eventual propagation ≠ Economic fragmentation.**
- **Sails Protocol ≠ Satsails server.**
- **Liquidity propagation authority ≠ Settlement authority ≠ Protocol
  authority.**

**Failure case, frozen:**

```
Node A → liquidity A only
Node B → liquidity B only
Node C → liquidity C only

= FAIL
```

— even if A/B/C implement exactly the same, fully conformant API.
Conformance is not the property under test; economic reachability is.

---

## 3. Current topology

Traced directly against the real code, not assumed:

```
Wallet
  → SailsClient (packages/sails-sdk)
    → HTTP/WS to one baseUrl
      → Sails Node (this repository's own Fastify server, app.ts)
        → Postgres (Prisma) — Offer, Trade, Intent, User, Escrow,
          Dispute, ReputationEvent, IntentEvent, EscrowEvent, Proof,
          EvidenceReference, FeeObligation, EntitlementLedgerEntry
        → OpenLiquidity (liquidity.service.ts) reads/writes Offer rows
        → OpenP2P (trade.service.ts, chat) reads/writes Trade rows
        → Pears (pear.service.ts) — a per-session HyperDHT/Hyperswarm
          keypair, used only for direct peer-to-peer chat/negotiation
          transport, never for Offer/Trade/Identity storage or lookup
```

**Confirmed, directly:** every one of these — `Offer`, `Trade`,
`Intent`, `User` (identity + reputation), `Escrow`, evidence
(`Proof`/`EvidenceReference`) — is a Postgres row, owned exclusively by
whichever single node's database it lives in. Pears/HyperDHT is real
and serverless *at the connection layer*, but it is not, today, used to
store or discover any of the above — confirmed by direct reading of
`pear.service.ts` (peer discovery/connection only) and
`liquidity.service.ts`/`trade.service.ts` (both `prisma`-only, no
transport-layer read path at all).

---

## 4. Truth-location matrix

| Object | Truth location today | Classification |
|---|---|---|
| Offer | `Offer` row, this node's Postgres | Local node truth. **No signature field exists on `Offer`** (verified, `prisma/schema.prisma:143-173`) — nothing cryptographically ties an Offer's economic terms to its claimed owner beyond "this node's database says so." |
| Trade | `Trade` row, this node's Postgres | Local node truth. |
| Intent | `Intent` + `IntentEvent` (hash-chained: `entryHash`/`prevHash`, `sha256(fromStatus+toStatus+triggeredBy+prevHash)`, RFC-008) | **Durable, tamper-evident *within this node*** — the hash chain proves this node's own history wasn't silently edited after the fact. **Not independently verifiable by a foreign party**: the hash is computed server-side, over server-observed fields; no participant signature is part of it. A second node must trust the first node's own database, not just its math. |
| Participant identity | `User.publicKey` (Ed25519, client-generated) | **Portable in principle** — it's a bare keypair a participant already controls, nothing server-specific about the key itself. **Not portable in practice today**: registering the same `publicKey` on two nodes creates two unrelated `User` rows (confirmed, `identity.service.ts:52-60`'s uniqueness check is per-node, no cross-node registry). |
| `peerId` (Pears) | `User.peerId`, generated fresh every `PearNode.start()` call, no seed | **Purely transport-level, and ephemeral** — confirmed this session (`docs/IDENTITY_ARCHITECTURE_DISCOVERY.md` §2/§3.3): not persisted across sessions, not derived from `publicKey`, carries zero economic meaning. |
| Reputation | `User.reputationScore` (`Float`, `{ increment: delta }`) | **Operator-mediated, partially derivable.** The star-rating contributor is backed by a real, durable `ReputationEvent` row per trade (unique `[tradeId, raterId]`) — in principle re-derivable by replaying those rows. The fee-based (`cumulativeFeesObserved`) and vouch-penalty contributors mutate the score directly with no exactly-matching, separately queryable event ledger of their own deltas (confirmed, `reputation.service.ts:64-91`). **Not uniformly re-derivable from events today.** |
| Escrow | `Escrow` row + `EscrowEvent` (same hash-chain class as `IntentEvent`) + `WdkTransferAttempt` (this session's own remediation) | Local node truth, durable/tamper-evident within the node, not independently verifiable externally — same class as Intent above. |
| Evidence | `Proof`/`EvidenceReference` — **`EvidenceReference.signature` is "signed by the submitting Participant's key"** (confirmed, `prisma/schema.prisma:2091-2104`) | **Externally verifiable truth** — a real, positive exception to the pattern above. Any party holding the submitting participant's `publicKey` can verify this signature independently of trusting the serving node's database integrity. |
| Outcome (dispute rulings specifically) | `DisputeOutcome`'s `attributionRawProof` — "the raw Ed25519 signature hex" over the arbiter's resolved identity (confirmed, `prisma/schema.prisma:1548-1550`) | **Externally verifiable truth** — a second real, positive exception: dispute rulings already carry an independently-checkable arbiter signature. Ordinary (non-disputed) escrow release/refund outcomes do **not** carry an equivalent participant/provider signature — only the hash-chain class above. |
| Timeline | `Timeline`/aggregate read over Claims/Proofs/Verifications/events (RFC-007 D5) | Derivable/local — a read projection, inherits the durability class of whatever it aggregates. |
| Provider capability | `Escrow.data.custodyModel` (per-escrow, post-creation) + static README/docs tables (pre-creation) | Local node truth for the live field; documentation-only for pre-creation discovery — confirmed this session, `docs/PARTNER_BETA_INTEGRATION_REALITY.md` §8. |

**Headline finding:** Sails already possesses the cryptographic
building blocks for portable, independently verifiable truth
(participant-signed `EvidenceReference`, arbiter-signed
`DisputeOutcome`) — it simply hasn't applied that pattern to the two
objects that most need it for cross-node propagation: **`Offer`**
(needs a participant signature over its economic terms) and the
ordinary state-transition hash chains (`EscrowEvent`/`IntentEvent`,
which today prove tamper-evidence to a node that already trusts the
server, not authenticity to a stranger node).

---

## 5. Shared-state minimum

**Central question:** what is the smallest amount of state that must
cross nodes to get one economic market?

Evaluated by plane, per the mission's own structure — complexity must
earn its place, not be assumed necessary:

- **Discovery plane** (offers, liquidity advertisements, provider
  capabilities, availability, quote expiry): **must cross nodes** — this
  is definitionally what "shared market" means. This is also the plane
  where the least trust is required: a discovered Offer is an
  *advertisement*, not a commitment, so a wrong/stale/malicious one is
  low-consequence if the *acceptance* step (below) independently
  verifies it.
- **Coordination plane** (trade initiation, negotiation/session,
  participant binding): **must cross nodes only between the two actual
  counterparties**, not broadcast — this is already Pears' natural
  shape (direct peer connection), not a network-wide propagation
  problem at all. Confirmed: `pear.service.ts` already does exactly
  this, just not yet wired to cross-node-discovered offers.
- **Economic truth plane** (settlement, evidence, outcome, dispute):
  **does not need to cross nodes for correctness** — the trade's
  economic truth can remain owned by whichever node(s) the actual
  parties are on, *as long as* both parties (and, if needed, a neutral
  arbiter) can independently verify it (§10). This is the plane where
  signatures matter most and propagation matters least.
- **Identity/reputation plane** (identity, reputation, historical
  continuity): **identity assertion must be cross-node-verifiable**
  (a node must be able to confirm "this is really the holder of
  `publicKey` X," which a bare signature already allows, §8) but
  **reputation aggregation does not need real-time cross-node
  synchronization** — a bounded, eventual, re-verifiable propagation
  of the underlying events (not the pre-computed score) is sufficient,
  consistent with "Eventual propagation ≠ Economic fragmentation."

**Answer to the dispositive question:** the minimum is **signed
discovery advertisements** (Offers + capability/availability) crossing
nodes, plus **verifiable identity assertions** (a public key + proof of
control) crossing nodes on demand. Trade coordination, settlement, and
detailed reputation history do **not** need to be globally replicated —
they need to be *fetchable and independently verifiable* by whichever
party actually needs them, when they need them. This is a materially
smaller shared-state surface than "replicate everything," and it is
this narrower surface the rest of this document evaluates mechanisms
against.

---

## 6. Discovery plane

Already covered in §5's framing; expanded here per the mission's own
list:

- **Offers / liquidity advertisements:** must propagate; today have no
  signature (§4) — this is the first, most concrete gap to close before
  any propagation mechanism matters at all. A propagated, unsigned
  Offer is trivially forgeable by whichever node relays it.
- **Provider capabilities / availability:** exist today only as
  per-node, post-creation (`custodyModel`) or static-documentation
  facts (§4's last row) — no advertisement format exists for a node to
  say, cross-network, "I support `MULTISIG`/`WDK_USDT_EVM` at this
  maturity level" before a specific escrow is created.
- **Quote expiry:** does not exist on `Offer` at all (confirmed this
  session, `docs/PARTNER_BETA_INTEGRATION_REALITY.md` §6) — directly
  relevant here too, since a propagated offer with no expiry is a worse
  discovery-plane citizen (stale offers linger network-wide, not just
  locally).

---

## 7. Coordination plane

**Finding, favorable:** trade initiation and negotiation are already
architecturally suited to cross-node operation, because they are
already pairwise, not broadcast. `pear.service.ts`'s connection model
doesn't care which node either party registered on — it connects two
public keys directly. The gap is not the coordination mechanism itself;
it's that **today, a Trade row's own lifecycle
(`trade.service.ts`/`escrow.service.ts`) still assumes one node owns
the authoritative row for both parties** — there is no concept of "my
counterparty's node" in the current schema (`Trade.buyerId`/`sellerId`
are `User.id` foreign keys into *this node's own* `User` table, not a
portable identity reference). This is the real coordination-plane gap:
not the peer connection, but the assumption that both trade parties are
rows in the same database.

---

## 8. Identity cross-node

**Investigated: does the same participant key get recognized across
Node A/B/C without creating three separate economic identities?**

**No, not today — confirmed directly.** `identity.service.ts:52-60`'s
uniqueness check (`prisma.user.findUnique({ where: { publicKey } })`)
only ever queries its own node's table. The same keypair registered on
three nodes creates three unrelated `User.id` rows, three separate
reputation counters, three separate trade histories.

**What already exists that a solution could build on:**
`common/middleware/auth.ts`'s challenge-response mechanism
(server-issued nonce, Ed25519 signature, one-time-use, replay-protected
— confirmed real and already hardened, RT-002) is **exactly** the
primitive a second node would need to accept "prove you control this
key" from a stranger it has never seen before. It does not need to be
invented — it needs to be pointed at a *different* node's own
registration/lookup, which is a coordination question (does Node B
trust Node A's claim that this key is already known, or does it just
independently verify the signature itself, needing no trust in Node A
at all?), not a missing cryptographic primitive.

Preserved: **participant identity ≠ node account** — a `User` row is
today conflating "this keypair" with "this node's own record of this
keypair's activity." **Node migration must not inherently destroy
economic identity** — confirmed as *not yet true* today: moving to a
new node means starting from a fresh `User` row with zero history,
exactly the "reputation resets to zero" failure case §9 investigates.

---

## 9. Reputation portability

**Investigated: minimum property so a user's reputation earned via
Node A, connecting through Node B, neither resets to zero nor accepts
an unverifiable score Node A simply asserts.**

Per §4's matrix, reputation is **partially event-sourced**: star
ratings (`ReputationEvent`, real durable rows, one per `[tradeId,
raterId]`) could in principle be *recomputed* by a second node that
also has visibility into the underlying `Trade` rows — but the
fee-based and vouch-penalty contributions to `reputationScore` are not
backed by an equivalently granular, independently replayable event
per-delta.

**Minimum property, derived, not invented from nothing:**

1. **Recomputation over propagation** — a second node should be able to
   *recompute* a reputation figure from a verifiable set of underlying
   events (ratings, completed trades, fee contributions), not simply
   accept a pre-computed number handed to it by the origin node.
   Recomputation is inherently tamper-resistant (the receiving node
   does its own arithmetic); propagation of a bare number is not.
2. **This requires the underlying events themselves to be
   independently verifiable** — which loops back to §4's finding that
   only *some* reputation-relevant events (star ratings, and by
   extension the `Trade`/`Escrow` rows they reference) have any
   candidate path to portability, and none of them currently carry a
   participant signature the way `EvidenceReference` does.
3. **Duplicate-counting / conflicting-history / pruning** are all
   real, unresolved threats *given* recomputation-based portability
   (§11) — not solved by this document, named as open questions for
   whatever mechanism is eventually chosen.

**No global reputation database is proposed** — the direction is
"recompute from verifiable local events when needed," not "replicate a
single authoritative score everywhere."

---

## 10. Evidence / outcome portability

**Investigated: is the current Durable Protocol Truth mechanism
sufficient for Node B to verify economic history produced through Node
A?**

**No, not uniformly — confirmed by the split found in §4.** Preserved
distinction, demonstrated rather than asserted:

> **Durable ≠ Portable ≠ Independently Verifiable.**

- **Durable:** `EscrowEvent`/`IntentEvent`'s hash chains — real,
  already shipped, proves *this node's own* history is internally
  consistent since the chain began. **Not portable**: the chain lives
  only in this node's Postgres; nothing exports or re-anchors it
  elsewhere. **Not independently verifiable**: no participant signs any
  link in this chain — a second node would have to trust the first
  node's server, not just its math.
- **Portable + Independently Verifiable (the positive exception):**
  `EvidenceReference.signature` and `DisputeOutcome.attributionRawProof`
  — both already real, already participant/arbiter-signed, and would
  remain verifiable by any party holding the relevant public key,
  regardless of which node ends up serving the record. **This is the
  existing precedent a cross-node evidence/outcome design should
  extend**, not a new invention.

**What's missing, concretely:** ordinary (non-disputed) escrow
release/refund/split outcomes have no equivalent to
`DisputeOutcome.attributionRawProof` — the settlement provider that
executed them (or the parties themselves) do not sign a portable
attestation of the outcome today. Closing this gap (not designed here)
would extend an existing, proven pattern to a class of events that
doesn't have it yet, rather than inventing a new evidence primitive.

---

## 11. Offer propagation

**Investigated directly against `Offer`'s real schema and
`liquidity.service.ts`:**

- **Who signs the Offer today? Nobody.** Confirmed, §4 — no signature
  field exists.
- **Who could republish it?** Today, only the originating node — no
  republication mechanism exists at all.
- **How would alteration be detected?** Not possible today without a
  signature — a relaying node could silently change `priceUsd` and
  nothing would catch it.
- **Expiry:** does not exist (§6, and confirmed independently this
  session, `docs/PARTNER_BETA_INTEGRATION_REALITY.md` §6).
- **Cancellation:** exists locally (`Offer.status`), but has no
  propagation story — a cancelled offer that already reached other
  nodes has no way to be retracted there.
- **Stale offers / replay / duplicate propagation:** all real risks
  *once* any propagation mechanism exists — none is mitigated today
  because none exists to be attacked yet.
- **Malicious mutation / conflicting versions:** same — moot until a
  propagation mechanism exists, but directly implies that mechanism
  **must** carry a signature and a monotonic version/timestamp from day
  one, not as an afterthought.
- **Provider/owner offline, spam:** unaddressed; candidate mitigations
  (rate-limiting who can advertise, requiring a minimum reputation to
  propagate — not designing this here) are noted as open design
  surface for the eventual mechanism.

**Preserved, confirmed structurally sound as a design principle even
before any mechanism is chosen:**

> **Offer propagation ≠ Offer authority.**

A relaying node forwarding a *signed* Offer changes nothing about who
is authoritative over its terms (the signer is) — this is exactly the
same "propagation authority ≠ economic authority" split already frozen
for nodes generally (§2's third distinction), applied one level down to
the Offer object specifically.

---

## 12. Cross-node trade

**Scenario walked through exactly as specified** (Seller on Node A,
Buyer on Node B, Buyer discovers Seller's Offer via a hypothetical
shared market, trade begins, **Node A disappears**):

- **Who knows the Trade?** Today: only Node A (the `Trade` row is
  entirely local to wherever `createTrade()` ran, `trade.service.ts`).
  Node B, in the current schema, has no representation of this trade at
  all unless the Buyer independently registered on Node A too — which
  defeats the entire premise of cross-node participation.
- **Who can continue if Node A disappears?** Nobody, today — the
  Escrow's own durability (Postgres, this session's WDK safety work) is
  real, but it's durability *on Node A specifically*. If Node A's
  database is gone, the trade's state is gone with it; there is no
  second copy anywhere.
- **Does a "home node" concept exist?** Implicitly yes (whichever node
  ran `createTrade()`), but never named or made explicit anywhere in
  the code or docs — this document is the first place it's stated
  plainly.
- **Can a trade migrate? Can a counterparty switch nodes mid-trade?**
  No mechanism exists for either today.
- **What state would be necessary for either?** At minimum: the Offer's
  signed terms (§11), the Trade's current lifecycle status, the
  Escrow's current status and (per this session's own remediation)
  `WdkTransferAttempt` state, and enough of the evidence chain (§10) for
  a new home to pick up where the old one left off *without* re-trusting
  a vanished server's own say-so — which is exactly why §10's
  signature gap matters here, not just abstractly.
- **Who is authority over a state transition, and how are two nodes
  prevented from advancing conflicting states?** Unaddressed today —
  there is no multi-writer conflict model of any kind, because there
  has never been more than one writer. This is a genuine open question
  for whatever consistency model (§15) is eventually chosen, not
  resolved here.

**No implementation attempted** — per the mission's own instruction,
this section only maps the scenario's real, current answer ("nobody
survives Node A's disappearance today"), which is itself the strongest
concrete argument in this document for why the Day-0 property matters.

---

## 13. Bootstrap / node discovery

**Day-0 target:** a new operator installs a Sails Node, discovers the
network, and joins the economic universe without asking Satsails for
permission.

**Investigated, not assumed:** nothing in this codebase today
implements node discovery, bootstrap peers, static seeds, DHT-based
discovery, peer exchange, or signed node advertisements — confirmed,
no such mechanism exists (this is new territory, not a hidden existing
feature). What *does* exist and is directly relevant: HyperDHT's own
peer-discovery model (§16) is precisely the class of mechanism a
bootstrap/discovery layer would need, and Sails already depends on the
`hyperdht` package for an unrelated purpose (pairwise chat transport) —
meaning the *dependency* is already present, even though the
*capability* is unused for this purpose today.

**Preserved:**

> **Bootstrap assistance ≠ membership authority.**

Satsails running one or more well-known bootstrap nodes (a real,
common pattern — Bitcoin's own DNS seeds, Tor's directory authorities)
does not require Satsails to *own* network membership — a bootstrap
node's only job is helping a new node find *other* nodes; it grants no
authority over who else may join, matching §2's "propagation authority
≠ protocol authority" distinction applied to the bootstrap role
specifically.

---

## 14. Multi-node failure model

Threats named by the mission, each classified honestly (no threat is
claimed mitigated by a mechanism this document doesn't build):

| Threat | Status today |
|---|---|
| Malicious node | Unaddressed — no multi-node trust model exists yet to be attacked or defended |
| Offline node | Partially addressed *within* one node (Postgres durability, this session's reconciliation work) — cross-node offline handling (§12) is unaddressed |
| Censoring node | Unaddressed |
| Node selectively hides offers | Unaddressed — no propagation exists to be selectively hidden from yet |
| Node publishes fake offers | Directly enabled by §11's missing-signature gap — the most concrete, immediately-actionable finding in this threat table |
| Replay | Unaddressed at the propagation layer (no propagation exists); addressed at the auth layer already (`common/middleware/auth.ts`'s nonce-burn mechanism, a real, reusable precedent) |
| Stale propagation | Directly related to §11's missing expiry field |
| Node equivocates (tells two peers different things) | Unaddressed |
| Two nodes disagree | Unaddressed — no conflict-resolution model exists (§12) |
| Sybil nodes | Unaddressed |
| Node flooding | Unaddressed |
| Malicious bootstrap node | Unaddressed, but bounded by §13's "bootstrap assistance ≠ membership authority" — a malicious bootstrap node can mislead a new node about *who else exists*, not seize authority over the network itself, if that principle is upheld |
| Colluding nodes | Unaddressed |
| Trade coordinator disappears | Directly mapped in §12 — currently a total loss, no continuity |
| Node tries to rewrite reputation | Directly bounded by §9's "recomputation over propagation" direction *if* built — a node that only recomputes from independently verifiable events cannot simply assert a rewritten score and have it accepted |
| Node tries to claim fee without contribution | Directly relevant to §19 (node economics) — unaddressed, a real open problem for whatever attribution mechanism is eventually designed |

**No threat in this table is claimed solved.** This is a threat
*inventory*, establishing what a future mechanism must defend against,
not a security proof of anything built here.

---

## 15. Consistency models A-E

Evaluated per the mission's own criteria, without selecting a winner:

| Model | Fragmentation risk | Censorship resistance | Latency | Convergence | Operational complexity | Malicious-node containment | Scalability | Privacy | Node autonomy | Failure recovery | Implementation complexity | Satsails dependence | Pears fit | Conformance testability |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A — Centralized shared index** | Low (by construction — one index) | **Very low** — the index operator can censor anyone | Low | Trivial (one writer) | Low | Weak (the index itself is the single point of trust/failure) | Bounded by the index's own capacity | Poor (index sees everything) | **Violates Day-0 sovereignty directly** — this is the exact "mandatory Satsails-operated infrastructure" the frozen properties (§2) forbid | Poor — index down means the whole market is down | Lowest | **Total** | N/A — doesn't use Pears meaningfully | Easy |
| **B — Federated replication** | Low if replication is reliable | Medium — depends on federation membership rules | Medium (replication lag) | Eventual | Medium-High (replica management, conflict resolution) | Medium — a malicious member can inject bad data into the shared replica set, contained by validation, not by exclusion alone | Medium — scales with replica count, not node count | Medium | High | Medium — surviving replicas continue | High | Low | Weak — Pears is peer-to-peer, not a replication-group protocol | Medium |
| **C — Signed gossip / event propagation** | Medium — depends on gossip reach/connectivity | High | Medium (gossip convergence time) | Eventual, probabilistic | Medium | **Strong** — every propagated item is signed at the source (§11), so a malicious relay can drop or delay but not forge | Good — gossip protocols are designed to scale with peer count | Good — no central observer required | High | Good — no single node's absence blocks propagation among the rest | Medium | Low | **Strong** — HyperDHT/Hyperswarm already provide peer discovery and direct connections; gossip is a natural layer on top | Good — a signature either verifies or doesn't |
| **D — DHT/content-addressed discovery** | Medium — depends on DHT health | High | Medium-High (DHT lookup hops) | Eventual | Medium-High (DHT maintenance) | Medium — Sybil resistance is a known hard problem for open DHTs | Good | Medium (DHT lookups can leak query patterns) | High | Good — DHTs are designed for churn | High | Low | **Partially present** — HyperDHT is a real DHT already used for peer lookup (not yet for content), Hyperbee (an unused, separate Holepunch primitive) could layer an append-only structure on top, confirmed **not currently a dependency** | Medium |
| **E — Hybrid model** | Depends on composition | Depends on composition | Depends on composition | Depends on composition | Highest (combines mechanisms) | Depends on composition | Depends on composition | Depends on composition | Depends on composition | Depends on composition | Highest | Low, if designed correctly | Depends | Hardest to test uniformly |

**No winner selected here**, per the mission's own instruction not to
choose by aesthetics. §24 names the trade-offs a future ADR must weigh.

---

## 16. Pears fit

**Investigated directly, not assumed:** HyperDHT and Hyperswarm
(already real dependencies, `pear.service.ts`) provide genuine,
serverless peer discovery and direct, NAT-traversed connections keyed
by public key — this is a real, already-proven capability this
codebase already exercises for exactly one purpose (pairwise
chat/negotiation transport). It has **not** been used for content
discovery/storage (offers, capabilities) — that would require either
(a) using HyperDHT's own DHT for small, signed advertisement records
(mechanically plausible — HyperDHT is a real DHT — but not confirmed
suitable at this repository's current dependency version without
further investigation), or (b) adopting Hyperbee or Hypercore (separate
Holepunch primitives, **confirmed not currently a dependency of this
repository** — verified, no `hyperbee`/`hypercore` package reference
found anywhere in `package.json` or `src/`), which would be a genuinely
new architectural dependency, not something "already there."

**Preserved:**

> **Pears capability ≠ mandatory architecture.**

If Model C (signed gossip) or D (DHT discovery) is eventually chosen, a
Pears-based implementation is a strong, evidence-backed *candidate*
(peer discovery + direct connections are already proven in this exact
codebase) — but this document does not conclude Pears is required.
Model B (federated replication) has no natural relationship to Pears at
all and would be evaluated independently if chosen.

---

## 17. Privacy

**Property preserved:** shared liquidity must not mean a global
surveillance database.

- **What must be public:** an Offer's economic terms (asset, side,
  price, min/max, payment method) — this is the entire point of
  discovery; there's no way to advertise liquidity without disclosing
  it.
- **What must remain pairwise/private:** negotiation content, chat, the
  specific counterparty pairing for a given trade (already the case
  today — `payload-crypto.ts`'s sealed-box encryption over Pears
  ensures a payload's *content* is opaque to anyone but the intended
  recipient, confirmed this session's own identity-architecture work).
- **Offer metadata exposure:** publishing an Offer cross-node
  necessarily reveals *that* a given participant (or at least a given
  public key) has liquidity to offer — this is unavoidable in any
  discovery mechanism, not specific to one model.
- **Identity correlation / node observation:** a gossip or DHT-based
  model (C/D) means more nodes *see* a given Offer's propagation than a
  strictly pairwise model would — a real, disclosed cost of broader
  discoverability, distinct from custodial privacy.
- **IP/network metadata:** HyperDHT/Hyperswarm's own known trade-off
  (peers are identified by public key, but connecting still involves
  real network addresses) — not a new risk this document introduces,
  already the case for today's pairwise Pears usage.
- **Trade graph leakage / reputation correlation:** a naive
  reputation-propagation design (§9) risks exposing a participant's
  full trade-partner graph to any node that can query their history —
  named as a real design constraint for whatever recomputation
  mechanism is eventually built, not solved here.

**Preserved:**

> **Shared market ≠ shared private state.**

---

## 18. Professional liquidity providers (cross-node)

Building on this session's own `docs/PARTNER_BETA_INTEGRATION_REALITY.md`
§6 findings (quote expiry, inventory, min/max, partial fills,
automated/manual acceptance, callback/event delivery — all still
missing at the single-node level), the cross-node question adds:

**How would a professional provider (OTC desk, DePix/USDT/BTC web
service, market maker) publish liquidity across nodes?** The same
signed-Offer-advertisement mechanism (§6/§11) any participant would use
— a professional provider is not a structurally different actor at the
discovery-plane level, confirming §6's earlier finding
(`docs/PARTNER_BETA_INTEGRATION_REALITY.md`) that the trade lifecycle
itself doesn't need provider-specific marketplace semantics. What's
additionally needed for a *cross-node* professional provider,
specifically: their **inventory** state (once it exists, per the
already-registered Backlog delta) must not be double-committed if the
same advertised offer is discovered and accepted near-simultaneously
from two different nodes — a real, new consideration this document adds
on top of the single-node gap already registered, not previously
named anywhere.

**Day-0 beta vs. later, separated:** quote expiry and min/max are
needed even for the *simplest* honest cross-node advertisement (a
stale, unbounded offer is a worse network citizen, §11) — reasonable to
treat as Day-0-relevant. Inventory/partial-fill concurrency handling
and webhook delivery are reasonable to defer past initial beta, since a
single-provider single-node deployment (today's reality) doesn't yet
need them either. **No second marketplace is proposed** — same
conclusion as `docs/PARTNER_BETA_INTEGRATION_REALITY.md` §6, now
confirmed to hold at the cross-node level too.

---

## 19. Node economics

**Investigated only, per the mission's explicit scope: what
constitutes a verifiable node contribution to a confirmed economic
outcome — no percentage, no formula.**

Candidate contributions, evaluated for verifiability, not assumed
legitimate:

- **Discovery** (a node first surfaced an Offer to the eventual buyer)
  — hard to verify after the fact without a signed, timestamped record
  of *which* node served *which* discovery query to *which* requester;
  no such record exists today.
- **Propagation** (a node relayed a signed Offer/advertisement to
  others) — more verifiable than discovery, IF the propagation
  mechanism itself is signed/chained (§11/§15's Model C) — a relay's
  contribution could in principle be proven by showing it forwarded a
  specific signed message, though this document does not design that
  proof.
- **Coordination** (a node hosted one party of a trade that closed) —
  directly derivable from the `Trade`/`Escrow` row itself (which node
  it lived on) — the most naturally verifiable of the candidates, since
  it requires no new mechanism at all, just attribution of an already-
  durable fact.
- **Availability** — requires an uptime-attestation mechanism; none
  exists today; `docs/PROTOCOL_ECONOMY.md` §4.2 already named this as a
  Months-7-9-relevant metric for a *different* reason (Reputation
  nodes), not solved here.
- **Routing** — same verifiability gap as propagation.
- **Evidence service** — if a node hosts `EvidenceReference` media
  (§10), its contribution is at least as verifiable as the signature
  the evidence itself already carries.

**Problems named, none solved:** double attribution (two nodes both
claim credit for the same outcome); fake relay (claiming to have
propagated something never actually forwarded); self-routing (a node
routing its own operator's trades to inflate claimed contribution);
Sybil farming (many fake node identities claiming many small
contributions); circular propagation (inflating apparent reach by
relaying between colluding nodes); multiple nodes claiming the same
contribution; a user switching nodes mid-trade (which node gets
attributed?); origin node vs. relay node (does discovery credit differ
from propagation credit?); a node disappearing after contributing
(does its claim survive its own absence?).

Preserved:

> **Node existence ≠ economic contribution.**

Consistent with `docs/BACKLOG.md`'s own already-registered wording: "a
node does not earn fees merely by existing or registering."

---

## 20. Incentive compatibility

**Qualitative analysis only — no formal Nash equilibrium claimed
without a mathematical model**, per the mission's own explicit wording
requirement: **incentive-compatibility hypothesis**, not proof.

**Desired direction:** an operator should gain more from improving
service, availability, and honest participation than from isolating
liquidity, censoring competitors, running fake nodes, or withholding
offers.

**Does the architecture (as currently discoverable, before any
mechanism is chosen) naturally point this way?** Partially, as a
hypothesis:

- If Model C/D (signed gossip or DHT discovery, §15) is chosen, an
  operator that **withholds or censors** offers gains nothing
  structurally — the offers still exist, signed, and can propagate via
  any other path; the censoring node only loses relevance to its own
  users, who see a worse market than peers on a more open node. This is
  a plausible incentive-compatibility hypothesis, not a proven
  equilibrium.
- If Model A (centralized index) were chosen instead, the incentive
  runs the opposite direction — whoever operates the index has direct
  power to censor or degrade, with no structural counterweight. This is
  itself a strong, evidence-based argument (not an aesthetic one)
  against Model A, independent of §2's own sovereignty requirement.
- **Sybil/fake-node incentives (§19) remain a real, unresolved
  counter-pressure** — if economic attribution ever rewards raw node
  count or claimed contribution volume without strong verification, the
  incentive-compatibility hypothesis above could invert (more profit
  from gaming attribution than from genuine service quality). This is
  exactly why §19 refuses to design an attribution mechanism without
  first naming this risk.

**Where a mechanism (not incentive alone) may be required:** Sybil
resistance for any per-node economic attribution (§19) almost certainly
needs more than "hope operators behave" — a real design question for
whatever future mission builds node economics, not resolved by
incentive analysis alone.

---

## 21. Stranger Node Test (future evidence case, defined not performed)

Per the mission's own instruction — this is a **future Partner Beta
gate**, not evidence gathered in this pass:

```
Developer receives only: Sails Node package, docs, SDK, bootstrap information
→ run independent node
→ join network
→ discover existing liquidity
→ publish own liquidity
→ another node discovers it
→ coordinate trade
```

**Feasibility today: NOT DEMONSTRATED, and not yet demonstrable** — no
step past "run independent node" (which already works, `docker compose
up`, confirmed `docs/PARTNER_BETA_INTEGRATION_REALITY.md`) has any
supporting mechanism today. "Join network," "discover existing
liquidity" (from another operator), and "another node discovers it"
all require whichever mechanism this document's future ADR selects
(§15) to exist and be implemented first. This is not a criticism of the
current SDK/API surface (already found largely sound,
`docs/PARTNER_BETA_INTEGRATION_REALITY.md`) — it is a direct
confirmation that this Stranger Node Test cannot pass until the
network-topology gap it's designed to test is actually closed.

---

## 22. Alternatives rejected (mechanisms not selected, and why not "aesthetics")

Explicitly not chosen anywhere in this document, consistent with §2's
"property first, mechanism second":

- **Model A (centralized shared index)** — rejected as a *default*, not
  merely disfavored aesthetically: it directly violates the frozen
  "no mandatory Satsails-operated infrastructure" property (§2), and
  §20's incentive analysis independently confirms it concentrates
  censorship power with no structural counterweight. Retained in §15's
  table only as the reference/baseline case the mission itself named.
- **Global order book / global database** — not evaluated as a
  standalone model because it is architecturally equivalent to Model A
  with extra steps (one authoritative shared store is still one point
  of control), not a genuinely distinct option.
- **Blockchain/consensus mechanism** — not evaluated in depth: nothing
  in the frozen properties or the shared-state minimum (§5) requires
  global, totally-ordered agreement on economic *outcomes* (only on
  discovery advertisements, which tolerate eventual, non-total-order
  propagation) — a consensus mechanism would solve a stronger property
  than the one actually required, which is itself a Rube-Goldberg-class
  reason to set it aside, not an aesthetic one.
- **Mandatory Nostr dependency** — not evaluated as a base-layer choice
  for this reason: Nostr's own relay model is a real, valid
  discovery/gossip substrate in general, but adopting it as *the*
  mechanism would introduce an external protocol dependency this
  document's own frozen properties don't require (Pears already
  provides a comparable, already-adopted capability, §16) — worth
  revisiting only if Model C/D's own future design finds a concrete gap
  Pears can't fill.

---

## 23. Unknowns

Consolidated, disclosed rather than guessed:

1. Whether HyperDHT (already a dependency) can safely carry small,
   signed advertisement records at the volume a real Offer market would
   produce, or whether it would need Hyperbee/Hypercore (not currently
   a dependency) layered on top — not benchmarked in this pass.
2. The exact Sybil-resistance mechanism for node economic attribution
   (§19/§20) — named as unresolved, not designed.
3. Whether reputation recomputation (§9) can be made efficient enough
   for real-time use, or whether it necessarily implies asynchronous/
   cached scores with their own staleness trade-offs — not benchmarked.
4. The precise conflict-resolution rule for §12's "two nodes advance
   conflicting states" scenario — named, not designed.
5. Whether a bootstrap node's failure mode (§13, "malicious bootstrap
   node") can be fully contained by the "bootstrap ≠ membership
   authority" principle alone, or whether it needs an additional
   mechanism (e.g., multiple independent bootstrap sources) — not
   resolved here.

---

## 24. Recommendation

**B/STOP for mechanism selection — the evidence supports a strong
directional shape, not a final choice.**

This document's own evidence points toward **Model C (signed gossip/
event propagation) as the strongest evidence-backed candidate among the
five compared**, for reasons grounded in this repository's own real
state, not preference: it is the only model that (a) structurally
satisfies "no mandatory Satsails-operated infrastructure" as well as
Model B/D do, while (b) building directly on a capability already
proven in this exact codebase (HyperDHT/Hyperswarm peer discovery and
direct connections, §16), and (c) has a natural, low-complexity
answer to malicious-node containment (§15's own table: signature
verification, not exclusion) that Models A/B/D each handle less
cleanly. **This is not a final selection** — Model D remains a live
alternative if HyperDHT's own DHT capacity proves suitable for
advertisement storage (unknown #1), and Model E (hybrid) may prove
necessary once §12's trade-continuity and §19's economics questions are
designed in more depth.

**What is not in question, and should not be re-litigated by a future
ADR:** Model A is not viable given the frozen properties (§2, §22);
the smallest necessary shared-state surface is discovery
advertisements + verifiable identity assertions, not full replication
(§5); and the single most concrete, immediately actionable prerequisite
for *any* chosen mechanism is closing §11's Offer-signature gap — no
propagation mechanism can be trustworthy while Offers remain
unsigned, regardless of which model eventually carries them.

---

## 25. ADR questions

What a future architecture decision must actually resolve, precisely
because this document deliberately does not:

1. Model C, D, or E (§15/§24) — and if E, which specific composition?
2. What exact signature/versioning scheme do propagated Offers carry
   (§11), and does it reuse `EvidenceReference`'s existing pattern or
   need its own?
3. What is the exact reputation-recomputation algorithm and its
   staleness/caching trade-off (§9, unknown #3)?
4. What is the conflict-resolution rule when two nodes advance the same
   Trade/Escrow's state divergently (§12, unknown #4)?
5. Does node economic attribution (§19) require a new signed-proof
   primitive, or can it be derived entirely from already-durable
   Trade/Escrow rows for the "coordination" contribution type, deferring
   discovery/propagation/routing attribution to a later phase?
6. Is Hyperbee/Hypercore adoption justified (§16, §23 unknown #1), or
   does a simpler mechanism suffice within HyperDHT's existing
   capacity?
7. What is the actual Sybil-resistance mechanism for both node identity
   (§14) and node economic attribution (§19/§20) — are they the same
   mechanism or two different ones?
8. What is the precise identity cross-node acceptance protocol (§8) —
   does Node B independently verify a signature with zero trust in Node
   A, or is there a lighter-weight "vouch" path, and if so, what are its
   own abuse risks?

---

DO NOT MERGE. STOP AND RETURN TO CTO.
