# Participant Transport Identity — Evidence

> **Status: CORRECTED, Second Pass (2026-09-09, CTO Gate B on PR #108).**
> Renamed from `PERSISTENT_NODE_IDENTITY_EVIDENCE.md`. The First Pass
> closed ADR-001 §21 step (b) under the name "Persistent Node Identity"
> and claimed BACKLOG DELTA: ZERO. A CTO Gate B correction found that
> claim conflated two distinct concepts never previously distinguished
> in ADR-001's own text: **Participant Transport Identity** (one
> participant's own stable `peerId`, what this module actually
> persists — confirmed directly against `pear.service.ts`'s own
> `prisma.user.update({ where: { id: this.ownerUserId }, data: {peerId}
> })`) and **Sails Node Operator Identity** (a cryptographic identity
> for the operator/deployment itself, independent of any hosted
> participant, required by ADR-001 §4's gossip-relay peer model and
> §16's trade-serving-node compensation — confirmed, by direct code and
> schema search, **not to exist anywhere in this codebase**). See
> `docs/adr/ADR-001-day0-multi-operator-network.md` §7.2 for the full
> correction narrative and `docs/BACKLOG.md` item 5 for the newly
> registered, still-undesigned Operator Identity gap. This Second Pass
> also fixed a real concurrent first-initialization race (Property
> below) and reassessed the privacy wording accordingly. Everything in
> this document describes the corrected, current state; nothing from
> the First Pass is preserved as separately-cited history because the
> underlying mechanism (not just its name) changed.

## 1. Property

> "A Sails Node participating in network discovery must have a stable
> operational identity across ordinary restarts." (ADR-001 §7)

**Scope, precisely, per the §7.2 correction:** this document proves the
property as it applies to **Participant Transport Identity** — one
participant's own Pears/HyperDHT `peerId`, persisted per `ownerUserId`.
It does **not** prove, and does not claim to prove, a stable identity
for a Sails Node *operator/runtime* independent of any participant — no
such identity exists in this codebase (§6 below).

Preserved without exception: **Node Identity ≠ Participant Identity**
(economic-authority sense) — a transport key signs only its own
gossip-relay/transport-level metadata, never an Offer's economic terms.
This property is about authority, not database association; it is not
violated by scoping a transport identity per participant (§7 of the
ADR's own §7.2 correction).

## 2. What `PearNode`'s per-`ownerUserId` identity actually is — confirmed, not assumed

Directly confronted against the real code (not inferred):

- `pear.service.ts`'s own pre-existing header comment (predating this
  PR): `PearNode → one DHT node for ONE user... PearNodeRegistry → owns
  a Map<userId, PearNode>`.
- `PearNode.start()`: `await prisma.user.update({ where: { id:
  this.ownerUserId }, data: { peerId } })` — the derived `peerId` is
  written directly onto the `User` row.
- `verifyHandshakeIdentity()` reads `User.peerId` to authenticate an
  incoming claimed `userId` against its real connection.

**Conclusion: Participant Transport Identity, not Sails Node Operator
Identity, and not "both" as a deliberate design** — the code has zero
awareness of an "operator" concept; it is always, structurally, scoped
to one `User` row. The coincidence that a single-tenant, self-hosted
deployment's one user happens to equal its own operator is cardinality,
not architecture: a multi-tenant deployment hosting many users would
spin up one `PearNode` per hosted user, with no single entity
representing the operator itself.

## 3. Does a Sails Node Operator/runtime identity exist today?

**No — confirmed by direct search, not inferred.** `prisma/schema.prisma`
has no `Operator`/`NodeOperator` identity model; the only matches for
"node operator" are `nodeOperatorShare`/`nodeOperatorPct` `Decimal`
fields inside distribution-policy models (§16's payout-recipient
*category*, a percentage, never an identity). No code path in
`pear.service.ts`, this module, or anywhere else creates, persists, or
exposes a keypair independent of a specific `ownerUserId`. This is
declared UNKNOWN/NOT YET DESIGNED, not invented in this pass — see
`docs/BACKLOG.md` item 5.

## 4. Previous behavior — confirmed, not inferred

**OFFICIAL IMPLEMENTATION evidence** (`node_modules/hyperdht/index.js`,
`node_modules/hyperdht/lib/crypto.js`, `hyperdht@6.33.2`, read directly):

```js
static keyPair (seed) { return createKeyPair(seed) }
```

`createKeyPair(seed)` calls libsodium's
`crypto_sign_seed_keypair(publicKey, secretKey, seed)` when a seed is
given (standard, deterministic Ed25519 derivation), else
`crypto_sign_keypair(publicKey, secretKey)` (random). A seed of any
length other than 32 bytes throws `"seed must be
'crypto_sign_SEEDBYTES' bytes"`.

**OBSERVED IMPLEMENTATION evidence**: before this change,
`PearNode.start()` called `HyperDHT.keyPair()` with no argument on every
call — every ordinary server restart produced a different `peerId` for
the same participant.

**Directly executed** (`tests/participantTransportIdentity.test.ts`,
`"CONFIRMED PRE-FIX GAP"`): two real, back-to-back `HyperDHT.keyPair()`
calls with no seed produce two different `publicKey` values every time.

## 5. Mechanism selected

`loadOrCreateParticipantTransportIdentitySeed(ownerUserId, storageDir)`
(`src/infrastructure/p2p/participant-transport-identity.ts`):

- First call for a given `ownerUserId`: generates 32 random bytes,
  attempts an **exclusive, atomic create** (`fs.writeFile(seedPath,
  seed, {flag: 'wx'})` — POSIX `O_CREAT|O_EXCL` / Windows `CREATE_NEW`).
- On success: this call's seed is now durably persisted and
  authoritative; a WARN is logged naming the new `peerId`.
- On `EEXIST` (another concurrent caller already won): reads back the
  winner's persisted seed instead of returning its own candidate — see
  §7 (concurrency fix) below.
- Every subsequent call (ordinary restart, or a subsequent read after
  losing a creation race): reads the same file back, returns the
  identical bytes, no regeneration.

`PearNode.start()`:
```ts
const seed = await loadOrCreateParticipantTransportIdentitySeed(this.ownerUserId)
const keyPair = HyperDHT.keyPair(seed)
```
No other line of `start()` changed.

## 6. Where the secret lives

- **Location**: `config.pear.participantTransportIdentityStorageDir`,
  default `./data/participant-transport-identity/<ownerUserId>.seed`
  (env override `PARTICIPANT_TRANSPORT_IDENTITY_STORAGE_DIR`).
- **Permissions**: mode `0o600` at creation.
- **Not a new custody boundary**: the server already generated and held
  this exact Ed25519 secret in process memory before this change
  (2026-08-09 precedent) — persisting it makes an already-server-held
  secret durable, exposing nothing new.
- **Absent**: treated as first initialization — generates, attempts to
  persist via exclusive create, WARN-logs the new `peerId` only if the
  create actually won.
- **Corrupted** (wrong length, including zero bytes): throws
  `ParticipantTransportIdentityCorruptedError`. Never silently discarded
  or regenerated.
- **Replaced**: the only rotation path today — indistinguishable, from
  this module's own perspective, from data loss.
- **Backup/migration**: a plain file — ordinary filesystem backup
  practice applies.

## 7. Concurrent first-initialization — real defect found and fixed

**Defect (First Pass):** the original implementation read-then-generate-
then-plain-`writeFile`d a seed with no exclusivity check. Two concurrent
callers for the same, not-yet-initialized `ownerUserId` (e.g. two
near-simultaneous requests both triggering `PearNodeRegistry.start()`)
could each generate a *different* random seed and both write, the last
writer silently winning while the *other* caller's in-memory `PearNode`
continued running under its own seed, which was never durably the
winner — exactly "one runtime continues with a losing transient
identity."

**Fix:** `fs.writeFile(seedPath, seed, {flag: 'wx'})` — an OS-level
atomic exclusive create, the same primitive lockfile implementations
universally rely on, effective across separate processes by
construction (not a Node.js-internal-only guarantee). On `EEXIST`, the
loser calls `readWinnerAfterLosingRace()`, which reads back the actual
on-disk winner and returns *that* — never its own candidate. A bounded,
dependency-free retry (5 attempts, 10ms apart) tolerates the
sub-millisecond window in which the winner's own `open`-then-`write` has
not yet fully landed (a torn/short read), before concluding real
corruption.

**No new dependency**: no Redis, no Postgres lock, no distributed-lock
framework, no retry library — a bounded in-function loop and a native
`fs` flag only.

## 8. Properties demonstrated (`tests/participantTransportIdentity.test.ts`, real `HyperDHT.keyPair()` + real filesystem, no mocking of either)

| # | Property | Test | Result |
|---|---|---|---|
| A | Restart persistence | `2.` | PASS |
| — | Pre-fix gap, directly executed | `"CONFIRMED PRE-FIX GAP"` | PASS |
| B | Independent participants stay independent | `3.` | PASS |
| C | Participant isolation (`User.publicKey` never reused) | `6.` + isolation-check test | PASS |
| D | Economic-authority isolation | see §9 | PASS (structural) |
| E | Corruption/missing-secret behavior | `4.`, `4b.`, `5.`, quiet-restart test | PASS |
| F | Ordinary restart ≠ rotation | `5.` / quiet-restart test | PASS |
| G | Concurrent first-init converges, no losing transient identity | `7.` | PASS — 12 concurrent `Promise.all` callers, one on-disk file, one winning seed returned to all 12, one derived `peerId` |
| — | First boot | `1.` | PASS |

11/11 tests pass (`npx jest tests/participantTransportIdentity.test.ts`,
~4s, real `hyperdht`, real `fs`, no mocks on either except the two tests
that assert WARN-log call counts).

**Evidence boundary for Property G, stated explicitly, not overclaimed:**
the concurrency test proves same-process concurrent async calls (real
interleaving within one Node.js event loop via `Promise.all`) converge
correctly. It does **not** directly execute true separate-OS-process
concurrency. The underlying primitive (`O_CREAT|O_EXCL`/`CREATE_NEW`) is
a standard, documented OS/filesystem guarantee that holds across
processes by construction — the same guarantee every `mkstemp`-style
lockfile implementation relies on — but that specific cross-process
claim rests on the OS's own documentation, not on this test having
spawned separate processes.

## 9. Economic-authority isolation — structural, not just tested

`src/modules/open-liquidity/offer-envelope.ts`'s `signOfferEnvelope()` /
`verifyOfferEnvelope()` — the only place any `Offer`-level signature is
produced or checked in this codebase — imports only `tweetnacl`,
`crypto`, `@prisma/client` (confirmed by direct read), never
`participant-transport-identity.ts`, `PearNode`, or `hyperdht`. No code
path lets this transport key sign, cancel, or act as authority for an
Offer, Trade, or settlement.

## 10. Privacy — corrected

Since `ownerUserId` is a participant, not an operator, the correct
framing (superseding the First Pass's "node operator" language) is:

> A persistent Participant Transport Identity intentionally makes that
> *participant's* `peerId` linkable across their own connection
> sessions/restarts. It does not automatically make it linkable to
> their economic identity (`User.publicKey`) — that binding is §7.1/step
> (c)'s own explicit, still-undesigned scope — but a network observer
> who has, through any means, previously associated a `peerId` with a
> real participant can now recognize that same participant returning,
> rather than seeing a fresh, unlinkable `peerId` every session.

There is no "operator linkability" claim to make here, because no
operator identity exists (§3).

## 11. Residuals — named, not solved

1. First boot vs. data loss are cryptographically indistinguishable;
   only a WARN log signals it.
2. No dedicated rotation API.
3. **Sails Node Operator Identity does not exist and is not designed
   here** — registered as `docs/BACKLOG.md` item 5, a real,
   previously-unregistered gap, exact sequence placement left to CTO.
4. Property G's cross-process guarantee rests on OS documentation, not
   on this suite having executed separate processes (§8).

## 12. Claims

**Permitted after PASS**: "A Sails Node's participant transport
identity can remain stable across ordinary restarts." (Narrower than
the First Pass's "A Sails Node can maintain the same operational node
identity across ordinary restarts" — that phrasing is retired because it
invited exactly the operator-identity conflation this correction found.)

**Forbidden**: decentralized; permissionless; shared liquidity;
multi-node network demonstrated; censorship resistant; Sybil resistant;
**Sails Node operator identity demonstrated** (newly forbidden by this
correction — it does not exist).

## 13. BACKLOG DELTA

**NOT zero — corrected from the First Pass's "ZERO" claim.** Item 4
(Persistent Participant Transport Identity, renamed) genuinely is closed
by this PR with zero delta of its own. But §7.2's correction surfaced
item 5, **Sails Node Operator Identity**, a real, previously-unregistered,
still-undesigned obligation — see `docs/BACKLOG.md`. The First Pass's
zero-delta claim was wrong only in assuming item 4 was the entire
content of ADR-001 §7; it was not.
