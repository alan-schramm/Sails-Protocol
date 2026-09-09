# Portable Signed Offers — Evidence

> **Status: CORRECTED (2026-09-09).** A CTO Gate correction pass found a
> real, confirmed owner-takeover vulnerability plus six related
> correctness gaps in the implementation this document originally
> described as closed. All seven have since been fixed and re-evidenced
> — see **"CTO Gate Correction (2026-09-09)"** below, which is the
> authoritative current state. The sections above it describe the
> implementation as it stood at the *original* step (a) closure and are
> preserved verbatim as history; where a number or claim below has since
> changed (test counts, the independent-verifier claim), the correction
> section states the corrected value — treat this document's own
> internal cross-references as pointing there for anything in scope of
> Properties A-G.

**Scope:** ADR-001 Day-0 Multi-Operator Sails Network
(`docs/adr/ADR-001-day0-multi-operator-network.md`), Implementation
Sequence step **(a) Portable Signed Offers** — the first authorized
implementation of that sequence. **Step (b) and beyond (persistent node
identity, identity↔transport binding, gossip, bootstrap, multi-node
propagation, cross-node trades, node rewards, contribution accounting,
payout, any registry, Hyperbee/Hypercore, any new Core primitive) are
explicitly NOT implemented or started here** — this document proves
Offer portability and authenticity, nothing more.

---

## Property

An `Offer` must be able to leave the node that originally received it
and remain:

- identifiable as the same offer (`logicalOfferId`);
- authenticable (an Ed25519 signature over its own content);
- independently verifiable (by any party, without trusting the
  delivering node's database);
- immutable without invalidating the signature (any field change breaks
  verification);
- updatable by the owner via `revision` (strictly increasing, no
  central arbiter needed to resolve ordering);
- cancellable via a signed tombstone (portable, not a local `DELETE`);
- expirable independently (self-enforcing against any verifier's own
  clock).

Authority remains, throughout: **the offer's owner, never a relay
node.**

---

## Implementation

**Files added:**

- `prisma/schema.prisma` — new `OfferEnvelope` model + `OfferEnvelopeStatus`
  enum, additive only. The existing `Offer` model is **completely
  untouched** — zero changes to its fields, its Prisma relations, or any
  code path that reads/writes it.
- `prisma/migrations/20260909000000_offer_envelope/migration.sql` —
  hand-authored (no live Postgres reachable in this session, same
  established convention as `20260908000000_wdk_transfer_attempt` and
  `20260831003019_m9f_escrow_release_evidence`), one new enum, one new
  table, three indexes, zero changes to any existing table.
- `src/modules/open-liquidity/offer-envelope.ts` — canonical
  serialization, signing (reference utility), and verification.
- `src/modules/open-liquidity/offer-envelope-repository.ts` — local,
  non-authoritative persistence: `ingest()` (verify → convergence check
  → store) and `getLatest()`.
- `tests/offerEnvelope.test.ts` — 20 tests, all 16 mission-required
  adversarial cases covered (several required cases map to more than
  one test for precision — see the table below).
- `docs/PORTABLE_SIGNED_OFFERS_EVIDENCE.md` — this document.

**No route, no SDK change, no existing file modified beyond
`prisma/schema.prisma`'s pure addition.** This is a deliberate scope
decision, not an oversight — see "Migration compatibility" below.

### `OfferEnvelope` exact fields

| Field | Type | Purpose |
|---|---|---|
| `id` | UUID (local PK) | This node's own row identifier — never part of the signed content, never sent across a wire, purely local bookkeeping. |
| `logicalOfferId` | String | Owner-assigned logical identity — the key move that decouples "this is the same offer" from "which node's row it happens to be." |
| `ownerPublicKey` | String (hex) | The existing `User.publicKey` (Ed25519) — no new identity primitive introduced. |
| `asset`, `side`, `priceUsd`, `minAmount`, `maxAmount`, `paymentMethod` | Reused existing enums/types | The same economic terms `Offer` already has — reused, not reinvented. |
| `revision` | Int | Strictly increasing per `logicalOfferId` — convergence rule and replay protection, one field. |
| `createdAt`, `revisedAt` | DateTime | Owner-supplied, advisory only, never used for cross-node ordering. |
| `expiresAt` | DateTime | Self-enforcing — checked against the verifier's own clock, no action required. |
| `status` | `ACTIVE` \| `CANCELLED` | `CANCELLED` is a signed tombstone at a higher revision, not a deletion. |
| `signature` | String (hex) | Ed25519 signature over `hashOfferEnvelope()`'s sha256 digest of the canonical serialization. |
| `receivedAt` | DateTime | Local-only bookkeeping (when this node first verified/stored it) — never part of the signed content, never authoritative. |

### Canonical serialization

Fixed field order, `\x1f` (ASCII Unit Separator) delimiter, **not
JSON** — JSON object key ordering is not a cross-language guarantee;
this repository's own `IntentEvent`/`EscrowEvent` `entryHash` precedent
(`sha256(fromStatus+toStatus+triggeredBy+prevHash)`) already avoids
JSON for the identical reason, reused here rather than inventing a new
convention.

```
sails-offer-envelope-v1 \x1f logicalOfferId \x1f ownerPublicKey \x1f
asset \x1f side \x1f priceUsd \x1f minAmount \x1f maxAmount \x1f
paymentMethod \x1f revision \x1f createdAt \x1f revisedAt \x1f
expiresAt \x1f status
```

The leading `sails-offer-envelope-v1` domain-separation tag prevents a
signature produced for any other message class (a different protocol,
or a future v2 of this same envelope shape) from ever being replayed as
a valid `OfferEnvelope` signature.

**Deterministic test vector (`tests/offerEnvelope.test.ts`, "15b"):** a
fixed, hardcoded input produces the exact canonical string above and
the sha256 digest `634577a0f860f90d84d5e957fd688ad081b8b9b5e1b922924faf29636e227ff7`
— independently recomputed with plain Node `crypto.createHash('sha256')`
outside the module under test, not merely asserted internally
consistent with itself. **Any conformant implementation (a future Rust
or Go protocol implementation, per Issue #75) reproducing this exact
canonical string from the same fields must arrive at this exact digest**
— this is the actual cross-implementation determinism proof the
mission requires, not a self-referential check.

### Signing mechanism

`nacl.sign.detached(digest, secretKey)` — `tweetnacl`, the exact same
library and call shape `common/middleware/auth.ts`'s
`verifySignedChallenge()` and `proof.service.ts`'s `attachEvidence()`
already use for `EvidenceReference.signature`. The digest signed is the
sha256 of the canonical bytes (not the raw canonical bytes directly) —
the same "sign the digest, not the payload" shape `attachEvidence()`
already establishes for media evidence, reused for the identical
reason (a fixed-size, unambiguous signing target).

`signOfferEnvelope()` is a **reference client-side utility** — it is
never called by this backend with a caller-supplied secret key. No
server-side code in this change ever sees or handles a secret key.

### Verification mechanism

`verifyOfferEnvelope(envelope)`:

```
OfferEnvelope → canonical bytes → sha256 digest → ownerPublicKey
              → nacl.sign.detached.verify() → { valid: true } | { valid: false, reason }
```

Any field change (price, amount, payment method, expiry, revision,
owner, or logical id) changes the canonical bytes, changes the digest,
and invalidates the signature — proven directly by the adversarial
tests (§ below), not merely asserted.

### Revision semantics

Strictly increasing integer per `logicalOfferId`, chosen by the owner.
`OfferEnvelopeRepository.ingest()` rejects any envelope whose revision
does not strictly exceed the highest one already stored for that
`logicalOfferId` — **timestamps are never used as ordering authority**;
`createdAt`/`revisedAt` are advisory only, exactly as ADR-001 §3
specifies, because wall-clock time is not trusted across
independently-operated nodes. Because only the true owner can ever
produce a valid signature for a given `logicalOfferId`, there is no
multi-party conflict to arbitrate — a relay cannot forge a competing
revision (proven, test 14), and a lower/equal revision is simply
discarded (tests 9/10).

### Expiry semantics

`expiresAt` is part of the signed content — a verifier checks it
against its own clock every time (`isOfferEnvelopeEconomicallyActive()`),
never cached as a one-time verdict. **A genuinely, correctly-signed
envelope can still be expired** — tested explicitly (test 8): the
signature verifies `true` while the economic-activity check
independently returns `false`, proving these are two separate checks,
not one conflated verdict. No action or central authority is required
to "expire" an offer — it becomes economically inactive the moment any
verifier's clock passes `expiresAt`, regardless of whether the
originating node is online.

### Tombstone semantics

Cancellation is a new signed envelope at a higher revision with
`status: CANCELLED` — the exact same signature/revision machinery as
any other update, not a separate mechanism. Portable by construction:
a cancellation propagates (once propagation exists, step (d)) exactly
like any other revision, and never depends on a `DELETE` in the origin
node's own database to produce network-wide truth — tested directly
(tests 11/12): a validly-signed tombstone is accepted like any other
update; a tombstone with a forged signature is rejected the same way
any other tampered envelope is (no special-cased path).

---

## Evidence

### Adversarial tests — all 16 required cases covered

| # | Required case | Test(s) |
|---|---|---|
| 1 | Valid signature | `1. valid signature verifies` |
| 2 | Invalid signature | `2. invalid signature (garbage bytes) is rejected` |
| 3 | Price altered after signing | `3. price altered after signing invalidates the signature` |
| 4 | Owner altered | `4. owner altered (different ownerPublicKey, same signature) invalidates` |
| 5 | `logicalOfferId` altered | `5. logicalOfferId altered invalidates` |
| 6 | Revision altered | `6. revision altered invalidates` |
| 7 | `expiresAt` altered | `7. expiresAt altered invalidates` |
| 8 | Expired offer | `8. an expired offer is rejected as economically active, independent of signature validity` |
| 9 | Higher revision supersedes | `9. a higher revision supersedes a previously-stored one and is accepted` |
| 10 | Older revision does not overwrite | `10. an equal-or-lower revision does not overwrite the newer stored one` |
| 11 | Valid tombstone cancels | `11. a validly-signed tombstone (CANCELLED at a higher revision) is accepted` |
| 12 | Forged tombstone rejected | `12. a tombstone with a forged/invalid signature is rejected, never stored` (+ `a false tombstone (bad signature) is rejected the same way any other tampered envelope is`) |
| 13 | Relay can copy byte-for-byte | `13. a byte-for-byte copy of a valid envelope (as any relay would forward it) verifies identically` |
| 14 | Relay cannot forge a valid update | `14. a relay cannot create a valid update by reusing the old signature at a bumped revision` |
| 15 | Deterministic canonical serialization | `15. produces byte-identical canonical output for identical input, twice` + `15b. hardcoded deterministic test vector` |
| 16 | Two independent verifier instances agree | `16. two independently-constructed verifier calls agree on the same envelope (no hidden per-call state)` |

Plus: an `ingest()`-level rejection test (invalid signature never
reaches the database), and a dedicated **COBRA check** test.

### Independent verifier evidence

Test 16 constructs two separate `verifyOfferEnvelope()` calls against
independently-spread copies of the same envelope object and confirms
identical `{ valid: true }` verdicts with no shared mutable state
between calls — the function is pure with respect to its input, exactly
the property "two conformant nodes agree" requires at the unit level.
(Full cross-node/cross-process agreement is a step (d)/(e) concern,
not claimed here — see "Forbidden claims.")

### Existing OpenLiquidity regression

`npx tsc --noEmit` — clean. `npx jest tests/offerEnvelope.test.ts` —
20/20 pass. **Full `npm run test:unit`** — **155/155 suites, 1943/1943
tests, zero failures** (up from the pre-existing 154/154 suites,
1923/1923 tests — the +1 suite/+20 tests are exactly this change's own
new file; nothing else moved). `liquidity.service.ts`, `Offer`,
`liquidity.routes.ts`, and every SDK module were not touched — no
existing test needed updating.

### SDK compatibility

`packages/sails-sdk` is untouched. No new route exists for a client to
call yet — this is a deliberate scope decision (see "Migration
compatibility"), not an incomplete implementation of step (a) itself.

### New dependencies

**None.** `tweetnacl` and Node's built-in `crypto` are both already
real, existing dependencies of this repository, used identically
elsewhere (`common/middleware/auth.ts`, `proof.service.ts`).

### Security findings

- Domain-separation tag prevents cross-protocol signature reuse.
- Digest-then-sign (not raw-payload-sign) bounds the signing input to a
  fixed 32 bytes regardless of field content size.
- `ingest()` verifies the signature **before** any database read/write
  — an invalid envelope never reaches the convergence-check or storage
  path (tested directly).
- No secret key ever appears in server-side code — `signOfferEnvelope()`
  is a reference utility, not a server capability.
- **Residual, disclosed, not solved here:** the exact byte-level
  encoding contract for `logicalOfferId`/`ownerPublicKey` (are these
  guaranteed lowercase hex? Fixed length?) is enforced only implicitly
  by whatever the caller supplies — malformed input fails verification
  safely (caught by the `try`/`catch` around `Buffer.from(...)`), but
  no explicit input-shape validation layer exists yet. Not a security
  hole (malformed input never produces a false-positive verification),
  but worth hardening in a later step once a real ingestion API exists.

### Privacy effects

None beyond what this document's own scope touches — no network
transport, no cross-node visibility, no new data leaves this node.
`ownerPublicKey` sits in a local table exactly as `User.publicKey`
already does elsewhere in this schema; the broader offer-signer
correlation question ADR-001 §12 already names is a step (d)
(propagation) concern, not something this step's purely local
persistence introduces or changes.

### COBRA Check

**Confirmed directly, by test:** the stored `OfferEnvelope` row always
carries the real `signature` field — never a cached `trusted`/`verified`
boolean in its place. `ingest()` calls `verifyOfferEnvelope()` fresh
against the raw content on every call; nothing about acceptance is
ever pre-computed or trusted from a prior check. The dedicated test
(`COBRA check: the stored row carries the real signature, never a bare
"trusted" boolean`) asserts this directly against the actual `create()`
call payload.

### Rube Goldberg Check

No framework, no generic "signed object" abstraction, no new identity
primitive, no new cryptographic curve. Reuses: the existing
`User.publicKey` Ed25519 identity, the existing `tweetnacl` library and
call shape, the existing "sign a digest, not the payload" pattern, and
this repository's own existing plain-string-concatenation canonical-
serialization convention (`IntentEvent`/`EscrowEvent`'s `entryHash`).
The only genuinely new pieces are the specific field list and the
`logicalOfferId` concept itself — both directly required by the
property, nothing speculative added alongside them.

---

## CTO Gate Correction (2026-09-09)

The original evidence above proved the seven properties it set out to
prove (portability, authenticity, revision ordering, tombstones,
expiry). It did not prove — and did not claim to prove — that the
implementation was safe against a **different key** claiming authority
over an **already-owned** `logicalOfferId`, nor that the canonical
serialization was injective over the full range of inputs a real
verifier might receive. A CTO Gate correction pass found both gaps for
real, plus five related correctness properties. All seven are now
fixed, tested, and evidenced below.

### Property A — Owner continuity (the confirmed vulnerability)

**Reproduced against the real, pre-fix repository logic before writing
any fix**, per explicit CTO instruction. Setup: Alice's revision-1
envelope for a `logicalOfferId` is already accepted and stored.
Attacker "Mallory" — who owns a completely real, valid Ed25519 keypair
— signs her own revision-2 envelope for that *same* `logicalOfferId`
with her own key and submits it to `OfferEnvelopeRepository.ingest()`.

**Result before the fix:** `{"accepted":true,"id":"row-2"}` — the
forged takeover was accepted. Root cause: `ingest()` only checked
`envelope.revision > highest.revision`, and `verifyOfferEnvelope()`
only checks that an envelope's signature matches whichever
`ownerPublicKey` it *itself* claims — neither function ever compared
that claimed owner against the owner *previously accepted* for that
`logicalOfferId`. Mallory's envelope was completely valid by every
check that existed; the missing check was continuity, not validity.

**Fix:** `ingest()` (`src/modules/open-liquidity/offer-envelope-repository.ts`)
now fetches the highest existing revision for a `logicalOfferId` and,
if one exists, rejects any envelope whose `ownerPublicKey` differs from
that row's `ownerPublicKey` — **before** the revision-ordering check,
and regardless of how much higher the new revision is. Exact rule: once
a `logicalOfferId` has an accepted owner, every later revision or
tombstone for it MUST come from that same owner; a higher revision
number does not, by itself, grant authority. The first accepted
envelope for a new `logicalOfferId` establishes its owner
(first-writer-wins) — there is no ownership-rotation mechanism (`v1`:
owner is immutable for the lifetime of a `logicalOfferId`; a genuine
future rotation need is an explicitly separate, not-yet-authorized,
signed-transition design).

**Tests added** (`tests/offerEnvelope.test.ts`, describe block "owner
continuity (Property A, CTO Gate correction 2026-09-09)"): attacker
higher ACTIVE revision rejected (the exact reproduction case, now
proven fixed), attacker higher CANCELLED tombstone rejected, legitimate
same-owner higher revision still accepted, legitimate same-owner
cancellation still accepted, first-writer-wins for a brand-new
`logicalOfferId`.

### Property B — Canonical serialization must be injective

**Reproduced directly**, via a standalone script: two distinct field
tuples — `{logicalOfferId: 'a\x1fb', ownerPublicKey: 'owner'}` and
`{logicalOfferId: 'a', ownerPublicKey: 'b\x1fowner'}` — produced
byte-identical canonical output
(`sails-offer-envelope-v1abownerBTCSELL111PIX1tttACTIVE`), because
nothing validated that `FIELD_SEPARATOR` (`\x1f`) was absent from any
field before joining. The original code's own comment claimed this
"never happens" — it was never actually enforced.

**Fix:** `validateOfferEnvelopeFields()` (`src/modules/open-liquidity/offer-envelope.ts`)
now runs before canonicalization on every call path and rejects any
occurrence of `\x1f` or any other control character (`\x00`-`\x1f`,
`\x7f`) in `logicalOfferId`. Combined with Properties C/D/F below (every
other field now has exactly one accepted lexical shape, none of which
can contain a control character or exceed the enum sets), the specific
collision demonstrated above is now provably unreachable — both
half-formed tuples are rejected outright by shape validation, never
reaching `canonicalizeOfferEnvelope()`.

### Property C — Canonical numeric representation

**Decision: reject non-canonical input outright; never silently
renormalize after signing.** Exactly one accepted lexical form for
`priceUsd`/`minAmount`/`maxAmount`: `^(0|[1-9]\d{0,15})\.\d{8}$` (digits
only, no sign, no exponent, no whitespace, exactly 8 fractional digits
— matching `@db.Decimal(24, 8)`'s own declared scale), plus an explicit
additional check that the value is strictly greater than zero. Rejected
by test: exponent notation, a leading `+`, leading/trailing whitespace,
wrong fractional-digit count (both too few and too many), negative
values, exact zero, non-numeric strings, and an integer with no
fractional part at all.

Persistence round-trip fidelity (Property E) required a matching
reconstruction helper: `formatCanonicalDecimal()` calls
`Prisma.Decimal.toFixed(8)`, never bare `.toString()` — confirmed by
direct execution that `new Prisma.Decimal('1.00000000').toString()`
returns `"1"` (trailing zeros stripped) while `.toFixed(8)` returns
`"1.00000000"` (canonical form preserved).

### Property D — Timestamp canonicality

Exactly one accepted lexical form for `createdAt`/`revisedAt`/`expiresAt`:
`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` — `Date.prototype.toISOString()`'s
own exact output shape, always UTC, always millisecond-padded.
Validated with the regex AND a parse-then-reserialize round-trip check
(`new Date(value).toISOString() === value`) specifically to reject
shapes that match the regex's general form but aren't real calendar
dates (e.g. `2026-13-45T00:00:00.000Z`). A timezone-offset
representation of the identical instant (`...+00:00`) is a different
byte string and is rejected, not treated as equivalent. `revision`
ordering continues to never depend on these fields (unchanged — they
were already advisory-only); verifier-local clock expiry semantics
(`isOfferEnvelopeEconomicallyActive()`) are unchanged.

### Property E — Persistence round-trip

New real-Postgres integration test:
`tests/integration/offerEnvelopePersistenceRoundTrip.test.ts` (added to
`package.json`'s `test:integration:postgres` script list — **not** a
mock-only test, per explicit CTO instruction). Three tests, all against
a real ephemeral Postgres instance (this repository's established
`SAILS_INTEGRATION_TEST_DB_CONFIRMED` / `postgresTestHarness.ts` gate):

1. A signed envelope with realistic amounts is inserted directly,
   read back, reconstructed via the repository's new
   `reconstructSignedEnvelope()`, and its canonical bytes are proven
   byte-identical to the original signed content — and the original
   signature still verifies against the reconstructed content.
2. The specific trailing-zero risk named under Property C is proven
   real against the actual database (`row.priceUsd.toString()` really
   does return `"1"` for a stored `"1.00000000"`), and proven fixed
   (`reconstructSignedEnvelope()` still recovers `"1.00000000"` and the
   signature still verifies).
3. `OfferEnvelopeRepository.ingest()` itself, run end-to-end against
   real Postgres (not mocked), produces a row that reconstructs and
   re-verifies.

No schema change was needed — `Prisma.Decimal`/`DateTime` storage was
never lossy; the defect was in a hypothetical *naive* reconstruction
path (bare `.toString()`) that this correction never allows to exist,
by only ever exposing the canonical-formatting helpers.

### Property F — Revision domain

`revision` must be an integer in `[0, 2147483647]` (Postgres `INT4`
range, matching the existing `revision Int` column — no schema change).
Rejected by test: negative, fractional, one above the `INT4` max, a
JS-unsafe integer, and `NaN`. Accepted by test: `0` and exactly
`2147483647`.

### Property G — Shape validation before crypto/DB

`verifyOfferEnvelope()` now calls `validateOfferEnvelopeFields()` first
and returns its specific, named reason (e.g. `"asset must be one
of: ..."`, `"revision must be an integer between 0 and ... inclusive"`)
without ever reaching the cryptographic check — distinguishable by test
from `"signature does not verify..."`. `ingest()` inherits this for
free (it calls `verifyOfferEnvelope()` first, unchanged) — a malformed
envelope never reaches `prisma.offerEnvelope.findFirst()`/`create()`,
confirmed by a dedicated test asserting neither mock is ever called for
a malformed input (revision `-1`).

### Independent-verifier claim, narrowed

The original "Independent verifier evidence" section above is
preserved verbatim, but its underlying claim needs a correction stated
explicitly: **test 16 proves verification is deterministic and has no
hidden per-call state — it does not, and never did, prove independent
Rust/Go implementation conformance.** The hardcoded digest test vector
(test 15b) remains useful conformance material for a *future*
independently-built implementation to check itself against, but its
existence is not itself evidence that such an implementation exists
today. **TypeScript implementation ≠ protocol truth** — unchanged,
restated.

### Updated counts

`tests/offerEnvelope.test.ts`: **53 tests**, all passing (up from the
original 20 — the +33 are the new Property A-G adversarial cases above,
using `it.each` for the C/D/F boundary sweeps rather than one test per
value). `tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`:
**3 new tests** (real Postgres, gated by
`SAILS_INTEGRATION_TEST_DB_CONFIRMED`, run in CI's `test` job).
**Full `npm run test:unit`: 155/155 suites, 1976/1976 tests, zero
failures.** `npx tsc --noEmit`: clean. `npx prisma validate`: schema
valid, **no schema change was required** for this correction (all
seven fixes are application-level validation/reconstruction logic, not
new columns or constraints). `git diff --check`: clean.

### COBRA Check (re-confirmed)

The fix does not: make `logicalOfferId` node-local; trust first-seen
node metadata as a substitute for signed history; introduce a central
owner registry; accept a cached "trusted" flag in place of
re-verification; or hide conflicting revisions instead of rejecting
them with a stated reason. Owner continuity is derived purely from
signed portable facts (the previously-accepted envelope's own
`ownerPublicKey`, itself only ever accepted after signature
verification) plus the new envelope's own claim — nothing outside that.

### Rube Goldberg Check (re-confirmed)

No blockchain, DID, consensus layer, CRDT framework, Merkle tree,
distributed database, new identity system, rotation protocol, or
generic signed-object framework was added. The fix is exactly: one new
equality check in `ingest()` (Property A), one shape-validation
function with a fixed field list (Properties B/C/D/F/G), and two
canonical-formatting helper functions for reconstruction (Property E).
This remains a bounded OpenLiquidity envelope correction.

### ADR-001 step (a) status

Reverted to **CORRECTION REQUIRED** at the start of this pass (from the
prior, premature `CLOSED (2026-09-09)`); **re-closed as CLOSED
(2026-09-09, corrected)** now that all seven properties above are
fixed, tested, and evidenced. See
`docs/adr/ADR-001-day0-multi-operator-network.md` §21(a) for the exact
status line and its own dated correction note.

### BACKLOG DELTA (re-confirmed)

**ZERO.** All seven properties are defects in the implementation of the
already-authorized step (a), not new architecture fronts — no new
obligation is registered in `docs/BACKLOG.md` by this correction.

---

## Residuals

- No HTTP route exposes `OfferEnvelope` ingestion/query yet — deferred
  to step (d) (propagation/bootstrap), where a real consumer for such a
  route first exists. Exposing one now would be premature surface
  area with no real caller.
- The exact byte-level input-shape validation gap noted under
  "Security findings" above.
- Cross-process/cross-language determinism is proven at the level of a
  hardcoded, independently-computed test vector (the actual mechanism
  by which a *different* implementation would prove agreement) — a
  second, real, independently-built verifier (e.g., a small Rust/Go
  reference implementation) has not been built to literally exercise
  against this vector. The vector exists precisely so that can happen
  later without depending on this codebase's own internal consistency.
- `logicalOfferId` uniqueness/collision handling across independent
  owners choosing the same string is not addressed — plausible
  mitigation (owner-namespaced ids, e.g. prefixed by `ownerPublicKey`)
  is a step (d)/(e) design question, not resolved here.
- **Superseded by the CTO Gate Correction above:** the "Security
  findings" residual note above, about `logicalOfferId`/`ownerPublicKey`
  byte-level encoding not being explicitly validated, is now closed —
  `validateOfferEnvelopeFields()` enforces an explicit hex/shape/charset
  contract for every field. Left in place above as history of what was
  true at original closure, not as a currently-open gap.
- No ownership-rotation mechanism exists (deliberately, per Property A
  above) — a legitimate owner who loses their key has no way to recover
  or transfer a `logicalOfferId`. Named, not solved: a future
  signed-transition rotation design is a separate, not-yet-authorized
  obligation if this is ever needed.

---

## Forbidden claims — explicitly not made by this document

This step proves **Offer portability and authenticity, nothing more.**
Not claimed: `shared liquidity demonstrated`, `decentralized`,
`permissionless`, `multi-node operational`, `censorship resistant`. No
propagation exists yet; no second node has ever verified an envelope
produced by a different node; no network of any kind is running. Those
remain the explicit, separately-gated evidence obligations of steps
(d) through (n) of ADR-001 §21.

---

## BACKLOG DELTA

**ZERO.** Step (a) was already registered in `docs/adr/ADR-001-day0-multi-operator-network.md`
§3/§21 and `docs/BACKLOG.md`'s own Implementation Sequence entry before
this implementation began — this document is the evidence for an
already-registered obligation, not a new one. No new obligation was
discovered during implementation that isn't already covered by the
existing residuals list above (all of which are either already-named
ADR-001 unknowns or narrowly scoped to this step's own deferred
surface).
