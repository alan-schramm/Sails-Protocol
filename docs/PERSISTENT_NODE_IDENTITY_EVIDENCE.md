# Persistent Node Identity — Evidence

> **Status: First Pass, 2026-09-09.** ADR-001 Implementation Sequence
> step (b) (`docs/adr/ADR-001-day0-multi-operator-network.md` §7/§21).
> Scope is deliberately narrow: make the existing `PearNode`'s own node
> identity persist across an ordinary restart. Step (c) (Economic
> Identity ↔ Transport Identity Binding, ADR-001 §7.1) is explicitly
> **not** started here.

## 1. Property

> "A Sails Node participating in network discovery must have a stable
> operational identity across ordinary restarts."

Preserved without exception: **Node Identity ≠ Participant Identity**,
and node identity must never become economic authority — a node's own
key signs only its own operational/transport/gossip material, never an
Offer's economic terms on behalf of any owner, buyer, seller, or
settlement authority.

## 2. Previous behavior — confirmed, not inferred

**OFFICIAL IMPLEMENTATION evidence** (`node_modules/hyperdht/index.js`,
`node_modules/hyperdht/lib/crypto.js`, `hyperdht@6.33.2`, read directly):

```js
static keyPair (seed) { return createKeyPair(seed) }
```

`createKeyPair(seed)` calls libsodium's
`crypto_sign_seed_keypair(publicKey, secretKey, seed)` when a seed is
given (standard, deterministic Ed25519 derivation — the same primitive
`tweetnacl`'s `sign.keyPair.fromSeed()` wraps), else
`crypto_sign_keypair(publicKey, secretKey)` (random). A seed of any
length other than 32 bytes throws `"seed must be
'crypto_sign_SEEDBYTES' bytes"`.

**OBSERVED IMPLEMENTATION evidence** (`src/infrastructure/p2p/pear.service.ts`,
`PearNode.start()`, before this change): `HyperDHT.keyPair()` was called
with **no** argument, on every call — `PearNode` holds all state in
process memory only, so every ordinary server restart produced a brand
new, unrelated keypair.

**Directly executed, not just read** (`tests/nodeIdentity.test.ts`,
test `"CONFIRMED PRE-FIX GAP"`): two real, back-to-back
`HyperDHT.keyPair()` calls with no seed, in the actual installed
package, produce two different `publicKey` values every time — the
exact defect this mission targets, reproduced by direct execution
rather than by reading source alone.

## 3. Mechanism selected

`loadOrCreateNodeIdentitySeed(ownerUserId, storageDir)`
(`src/infrastructure/p2p/node-identity.ts`, new file):

- First call for a given `ownerUserId`: generates 32 random bytes
  (`crypto.randomBytes(32)`, `NODE_IDENTITY_SEED_BYTES`), persists them
  to `<storageDir>/<ownerUserId>.seed` (mode `0o600`), logs a WARN
  naming the new `peerId`.
- Every subsequent call (ordinary restart): reads the same file back
  and returns the identical bytes, no regeneration.
- `pear.service.ts`'s `PearNode.start()` now does:
  ```ts
  const seed = await loadOrCreateNodeIdentitySeed(this.ownerUserId)
  const keyPair = HyperDHT.keyPair(seed)
  ```
  replacing the old `HyperDHT.keyPair()` (no argument) call. No other
  line of `start()` changed. `HyperDHT.keyPair(seed)`'s own official,
  already-in-use derivation is the only cryptography involved — this
  module introduces no new primitive.

Persisted **per `ownerUserId`**, matching this codebase's existing
architecture directly: `PearNodeRegistry` already runs one `PearNode`
per active user (`Map<userId, PearNode>`), not one server-wide node.
ADR-001 §7 itself describes "today's node-level keypair" in the present
tense, referring to this exact mechanism — persisting per-owner is the
minimal change matching the shape that already exists, not a redesign
of it.

## 4. Where the secret lives

- **Location**: `config.pear.nodeIdentityStorageDir`, default
  `./data/node-identity/<ownerUserId>.seed` (env override
  `NODE_IDENTITY_STORAGE_DIR`) — the same `./data/<name>` +
  env-var-override convention `evidence-provider.ts`'s
  `LocalFilesystemEvidenceProvider` already established in this
  codebase, chosen over Postgres for defense-in-depth (raw secret
  material does not belong in the primary relational DB alongside
  public data) and because it requires zero schema migration.
- **Permissions**: written with mode `0o600` at creation.
- **Not a new custody boundary**: `PearNode.start()`'s own pre-existing
  2026-08-09 comment records that the server already generates and
  holds this exact Ed25519 secret in process memory today (replacing an
  older design where the client sent its secret key over HTTP) —
  persisting it to disk makes an already-server-held secret durable; it
  exposes nothing that was not already server-held.
- **Absent** (first boot, or the file was lost): treated as
  initialization — a new seed is generated, persisted, and a WARN is
  logged naming the derived `peerId`, so an operator who did *not*
  expect a new identity has a loud, concrete signal. This module cannot
  cryptographically distinguish genuine first boot from data loss by
  itself — named as a residual (§8), not solved by inventing an
  external registry (explicitly out of scope).
- **Corrupted** (present, wrong length — including zero bytes): throws
  `NodeIdentityCorruptedError` immediately. Never silently discarded,
  never silently regenerated. `PearNode.start()` propagates the throw —
  a corrupted identity fails startup rather than masquerading as a
  fresh or fabricated one.
- **Replaced** (operator deliberately writes a new 32-byte file): next
  load reads it as the new identity — this is the *only* rotation path
  today; there is no dedicated rotate API. See §8.
- **Backup/migration**: a plain file — ordinary filesystem backup
  practice applies; no special tooling exists or is implied.

## 5. Properties demonstrated (`tests/nodeIdentity.test.ts`, real
`HyperDHT.keyPair()` + real filesystem, no mocking of either)

| # | Property | Test | Result |
|---|---|---|---|
| A | Restart persistence | `2.` | PASS — identical seed and `peerId` across two independent loads |
| — | Pre-fix gap, directly executed | `"CONFIRMED PRE-FIX GAP"` | PASS — two unseeded calls differ |
| B | Independent nodes stay independent | `3.` | PASS — two `ownerUserId`s get two different seeds/`peerId`s |
| C | Participant isolation (`User.publicKey` never reused) | `6.` + isolation-check test | PASS — module has zero Prisma/`User` dependency; seed structurally unrelated to an independently generated Ed25519 keypair |
| D | Economic-authority isolation | see §6 | PASS — structural, not test-only |
| E | Corruption/missing-secret behavior | `4.`, `4b.`, `5.`, quiet-restart test | PASS — wrong-length and empty files both throw `NodeIdentityCorruptedError`, file left untouched; absent file WARN-logs the new identity exactly once, not on subsequent ordinary restarts |
| F | Ordinary restart ≠ rotation | `5.` / quiet-restart test | PASS — restart is silent; only an absent/replaced file triggers the "new identity" WARN |
| — | First boot | `1.` | PASS — file created, correct length, matches returned seed |

10/10 tests pass (`npx jest tests/nodeIdentity.test.ts`, 5.5s, real
`hyperdht`, real `fs`, no mocks on either).

## 6. Economic-authority isolation — structural, not just tested

`src/modules/open-liquidity/offer-envelope.ts`'s `signOfferEnvelope()` /
`verifyOfferEnvelope()` — the only place any `Offer`-level signature is
produced or checked in this codebase — takes its own, independent
`ownerPublicKey`/secret material, built directly on `tweetnacl`, and its
import list (`tweetnacl`, `crypto`, `@prisma/client` only, confirmed by
direct read) never references `node-identity.ts`, `PearNode`, or
`hyperdht` at all. There is no code path by which the
node identity's private key could sign, cancel, or otherwise act as
authority for an Offer, a Trade action, or settlement release. This was
confirmed by direct inspection of both modules' import graphs, not
merely asserted.

## 7. Privacy

Verbatim, as required:

> "A persistent node identity intentionally makes the node operator
> linkable across ordinary restarts. It must not automatically make
> individual participant identities or trades publicly linkable to that
> node beyond what the protocol requires."

Assessment: this mechanism makes a node's `peerId` durable rather than
regenerated every restart, which is a **new** correlation property
(previously a network observer's identifier for a given operator reset
on every restart; now it does not). It does **not** introduce any new
linkage between a `peerId` and a participant's `User.publicKey`, an
Offer, or a Trade beyond what already exists — the transport/economic
separation (§6) is unchanged, and `PearNodeRegistry` already keys nodes
by `ownerUserId` internally, so the durable `peerId` reveals no more
about *which* user operates a node than the pre-existing, already-merged
`User.peerId` column does today (ADR-001 §7.1, step (c), not modified
here). No new privacy-solving layer is introduced or attempted.

## 8. Residuals — named, not solved

1. First boot vs. data loss are cryptographically indistinguishable to
   this module; only an operator-facing WARN log signals it.
2. No dedicated rotation API — replacing/deleting the seed file is the
   only way to force a new identity today, indistinguishable from data
   loss from the module's own perspective. Deliberate, safety-railed
   rotation (deprecation announcement, grace-period peer handoff) is
   real future work, not designed here.
3. Whether a single server-wide node identity is ever needed instead of
   the current per-`ownerUserId` shape is an open question, not decided
   in this pass — the current implementation matches the architecture
   ADR-001 §7 already describes as "today's node-level keypair."

## 9. Claims

**Permitted after PASS**: "A Sails Node can maintain the same
operational node identity across ordinary restarts."

**Forbidden**: decentralized; permissionless; shared liquidity;
multi-node network demonstrated; censorship resistant; Sybil resistant.
None of these are claimed here.

## 10. BACKLOG DELTA

**ZERO.** `docs/BACKLOG.md` line 1425 already registers "Persistent
Node Identity (ADR-001 §7)" as a Day-0 obligation, verbatim matching
this mission's central property. This pass closes that existing
obligation; no genuinely new, previously-unregistered obligation
surfaced during implementation.
