# Portable Signed Offers — Evidence

> **Status: CORRECTED, Sixth Pass (2026-09-09).** A Third-Pass CTO Gate
> correction found a real, confirmed owner-takeover vulnerability plus
> six related correctness gaps (Properties A-G) in the implementation
> this document originally described as closed. A Fourth-Pass
> correction found that the Third Pass's own Property A fix ("first
> accepted envelope wins") was itself defective — it let arrival order
> decide offer ownership across independent nodes — plus one related
> ADR-invariant enforcement gap (Property I). A Fifth-Pass correction
> then asked the central distributed-convergence question directly
> ("do two nodes that eventually see the same facts ever end with
> different economic interpretations, purely due to arrival order?")
> and found two more real gaps: **Property J** (the same owner
> equivocating — signing two different envelopes at the identical
> revision — let arrival order decide WHICH conflicting price a node
> accepted; fixed, fail-closed, not first-writer-wins) and **Property K**
> (the Fourth Pass's own `createdAt`-immutability enforcement was itself
> order-dependent and is **retracted**, not repaired). **Property L**
> (a higher revision deterministically resolves post-equivocation state
> without erasing the evidence) was verified alongside J. A Sixth-Pass
> correction then found the Fifth Pass's own equivocation mechanism
> itself carried a real vulnerability plus two more gaps: **Property O**
> (Ed25519 signatures are malleable, confirmed via a controlled test —
> the Fifth Pass's `signature`-keyed identity let a mere OBSERVER, not
> the owner, manufacture a false `EQUIVOCATED` state; fixed by re-keying
> on a content-derived `contentDigest` instead), **Property M**
> (concurrent identical-fact ingestion leaked a raw, uncaught Prisma
> exception, reproduced against real Postgres; fixed by relying on the
> database's own atomic uniqueness check), and **Property P** (a node
> observing a lower revision after a higher one was itself discarding
> that fact as "stale," losing equivocation evidence order-dependently;
> fixed by retaining all valid signed facts regardless of arrival order,
> Option B, evaluated explicitly against reputation/storage/bandwidth/
> replay/privacy/simplicity). **Property N** corrected every ADR
> statement conflating fact-identity deduplication with revision-number
> comparison (documentation only, no code change). Sixteen properties
> total across four passes (A-P, with I explicitly **retracted** rather
> than fixed) are now in their evidenced final state — see **"CTO Gate
> Correction (2026-09-09, Third Pass — Properties A-G)"**, **"...Fourth
> Pass — Properties H, I)"**, **"...Fifth Pass — Properties J, K, L)"**,
> and **"...Sixth Pass — Properties M, N, O, P)"** below, the last being
> the authoritative current state. The sections above them describe the
> implementation as it stood at earlier closures and are preserved
> verbatim as history; where a number or claim has since changed again,
> the latest correction section states the corrected value — treat this
> document's own
> internal cross-references as pointing there for anything in scope of
> Properties A-P. This document does not, and has never, claimed general
> distributed consensus — see the Fifth Pass's own "Claim correction —
> scope of convergence" for the precise, bounded property actually
> demonstrated.

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

Strictly increasing integer per **offer identity** — the pair
`(ownerPublicKey, logicalOfferId)`, not `logicalOfferId` alone (see the
"CTO Gate Correction (2026-09-09), Property H" section below for why) —
chosen by the owner. `OfferEnvelopeRepository.ingest()` rejects any
envelope whose revision does not strictly exceed the highest one
already stored for that identity — **timestamps are never used as
ordering authority**; `createdAt`/`revisedAt` are advisory only, exactly
as ADR-001 §3 specifies, because wall-clock time is not trusted across
independently-operated nodes.

> **Claim correction (2026-09-09):** this paragraph originally read
> "Because only the true owner can ever produce a valid signature for a
> given `logicalOfferId`, there is no multi-party conflict to
> arbitrate." That statement is false as originally scoped — two
> *different* owners can each produce a validly-signed envelope for the
> identical `logicalOfferId` string, because `logicalOfferId` is only
> ever creator-local. The corrected claim: **for a canonical offer
> identity scoped by `(ownerPublicKey, logicalOfferId)`, only that
> owner can ever produce a valid higher revision** — there is no
> multi-party conflict *within one offer identity*, but a bare
> `logicalOfferId` was never itself a single object with one owner to
> begin with. See "CTO Gate Correction (2026-09-09), Property H" below.

A relay cannot forge a competing revision for a real offer identity
(proven, test 14), and a lower revision within that same identity is
simply discarded (test 10).

> **Claim correction (2026-09-09, Fifth Pass):** this paragraph and the
> line above it ("rejects any envelope whose revision does not strictly
> exceed the highest one already stored") both originally treated the
> EQUAL-revision case as a uniform rejection alongside the lower-revision
> case. That is no longer accurate: an equal revision is now either an
> idempotent resend (identical signature) or owner equivocation
> (different signature) — see "CTO Gate Correction (2026-09-09, Fifth
> Pass — Properties J, K, L)" below. Only a STRICTLY LOWER revision is
> unconditionally discarded.

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

## CTO Gate Correction (2026-09-09, Third Pass — Properties A-G)

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

> **Superseded (2026-09-09, Property H below).** This fix's own
> "first accepted envelope establishes its owner (first-writer-wins)"
> rule was itself a defect: it made **arrival order** decide who owned
> a `logicalOfferId`, which two nodes observing the identical facts in
> different orders could — and, reproduced directly, did — resolve
> differently. `first-writer-wins` is retracted as an authority rule.
> The corrected model (Property H) makes offer identity the pair
> `(ownerPublicKey, logicalOfferId)`, which removes the need for this
> section's owner-continuity check entirely — see below for why it is
> now structurally unreachable rather than merely re-verified. This
> section is preserved as an accurate record of what was implemented
> and why it still wasn't sufficient, not as current behavior.

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

## CTO Gate Correction (2026-09-09, Fourth Pass — Properties H, I)

The Third Pass's own Property A fix ("first accepted envelope
establishes its owner") was itself found defective for a multi-operator
network: it let **arrival order** decide who owned a `logicalOfferId`.
A Fourth Gate correction found this plus one related ADR-invariant
enforcement gap. Both are now fixed, tested, and evidenced below.

### Property H — Order-independent offer ownership / no first-writer authority

**Reproduced against the real, pre-fix repository logic before writing
any fix.** Setup: two independent nodes, each with their own empty
store. Alice and Mallory each independently sign a genuinely valid
revision-0 envelope for the identical `logicalOfferId = X` (a real,
distinct keypair each — no forgery involved on either side). Node A
ingests Alice's envelope first, then Mallory's. Node B ingests the
*identical two envelopes*, in the opposite order: Mallory first, then
Alice.

**Result before this fix:** Node A converged on `owner = Alice` (Alice
arrived first, so the Third Pass's continuity check rejected Mallory's
envelope as "a different key can't take over an already-owned
`logicalOfferId`"). Node B converged on `owner = Mallory` (Mallory
arrived first there, so *Alice's* envelope was the one rejected). **Two
nodes, given the identical two independently-valid facts, disagreed
about who owned the object — purely because of the order they happened
to observe those facts in.** Classified: **CONFIRMED CONVERGENCE /
NAMESPACE DEFECT.** Root cause: `logicalOfferId` is only ever
creator-local (never checked or coordinated across owners) — it never
named one shared object that two owners could compete over. Treating it
as if it did, and picking whichever owner arrived first as "the" owner,
was the actual defect, not a missing check.

**Required property, frozen:** offer identity MUST be owner-namespaced
and order-independent. A node's observation order MUST NOT establish
economic authority. Two distinct owners using the same creator-local
`logicalOfferId` MUST represent two distinct economic objects, never
competing claims over one.

**Fix — chosen canonical offer identity:**

```
Offer Identity = (ownerPublicKey, logicalOfferId)
```

No derived/hashed `canonicalOfferId` was added — the composite identity
is already sufficient for every consequence below, and ADR-001's own
Rube Goldberg discipline (property first, mechanism second; no
mechanism beyond what a property actually requires) rules out adding
one "for elegance" alone.

**Why this is order-independent:** with the lookup itself scoped to
`(ownerPublicKey, logicalOfferId)`, Alice's rows and Mallory's rows are,
by construction, two entirely disjoint row-sets — there is no shared
"highest revision for X" for them to race over, and therefore nothing
left that could depend on which one a node happened to observe first.
Order independence is not a rule bolted on top of the identity model;
it falls out of the identity model being correct.

**Implementation consequences, reviewed and adjusted:**

1. **Persistence lookup identity** — `ingest()`'s `highest` query
   (`src/modules/open-liquidity/offer-envelope-repository.ts`) now
   filters on `{ ownerPublicKey, logicalOfferId }`, not `logicalOfferId`
   alone.
2. **Uniqueness constraint** — `prisma/schema.prisma`:
   `@@unique([ownerPublicKey, logicalOfferId, revision])`, replacing
   `@@unique([logicalOfferId, revision])`.
3. **Revision ordering** — now scoped to `ownerPublicKey +
   logicalOfferId` (via the same `highest` query above), not bare
   `logicalOfferId`.
4. **`getLatest()`** — signature changed to
   `getLatest(ownerPublicKey, logicalOfferId)`; no caller outside this
   module and its own tests existed yet (step (a) exposes no HTTP
   route), so this is not a breaking public-API change.
5. **Replay protection** — unchanged in mechanism (still "revision must
   strictly exceed the highest already stored"), now correctly scoped
   to the real offer identity instead of a shared, ambiguous namespace.
6. **Cancellation/tombstone lookup** — uses the identical scoped
   `highest` query; a tombstone from one owner can now never be looked
   up against, or affect, a different owner's rows for the same
   `logicalOfferId` string.
7. **Tests** — see below.
8. **Evidence documentation** — this section, plus the corrected
   "Revision semantics" paragraph and retraction note under Property A
   above.

**Property A's own explicit owner-continuity check is now removed as
dead code**, not merely redundant: every row `highest` can ever return
for a given `(ownerPublicKey, logicalOfferId)` pair already carries that
exact `ownerPublicKey` by construction of the query itself, so a
separate inequality check can never trigger. The property emerges from
the signed object identity and the scoped lookup, not from an
additional rule layered on top (COBRA discipline: no first-seen trust
flag, no rule that could itself encode a new failure mode).

**Not implemented, per explicit CTO instruction:** no central namespace
registry, no first-seen trust, no ownership-rotation mechanism.

**Tests added** (`tests/offerEnvelope.test.ts`, describe block "offer
identity is order-independent (Property H...)"):
- The exact two-node reproduction above, now proving both nodes
  converge identically (both envelopes accepted on both nodes,
  regardless of order).
- Cross-owner collision test: two owners, identical `logicalOfferId`,
  both independently accepted.
- Cross-owner cancellation test: Mallory's tombstone has zero effect on
  Alice's offer at the same `logicalOfferId`.
- Same-owner revision test: Alice's higher revision supersedes only her
  own prior revision, zero effect on Mallory's offer.
- **CONVERGENCE TEST:** `History A: Alice/X/0, Mallory/X/0, Alice/X/1`
  and `History B: Mallory/X/0, Alice/X/0, Alice/X/1` — genuinely
  different arrival orders of the identical set of facts — both proven
  to converge to exactly `Alice/X latest = revision 1`, `Mallory/X
  latest = revision 0`. This is the load-bearing Day-0 property.
- A real-Postgres version of the cross-owner case
  (`tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`,
  "Property H (real DB)"): two owners insert under the identical
  `logicalOfferId` against a real database — proving the corrected
  composite unique constraint itself permits this (the old constraint
  would have thrown a real Postgres unique-violation on the second
  insert), not just that the mocked unit logic allows it.

### Property I — `createdAt` immutability

ADR-001 states `createdAt` does not change across an offer's own
revisions. `ingest()` did not enforce this — a later revision of the
same offer identity could claim any `createdAt` and it would be
accepted and stored as-is. **Reproduced directly:** owner submits
revision 0 with `createdAt = 2026-09-09T00:00:00.000Z`, then the same
owner/logicalOfferId's revision 1 with `createdAt =
2026-09-10T00:00:00.000Z` — accepted before this fix. Classified:
**CONFIRMED ADR INVARIANT ENFORCEMENT GAP.**

**Fix:** `ingest()` now requires, whenever a `highest` row exists for
the offer identity, that the new envelope's `createdAt` exactly equals
that row's `createdAt` (compared via `formatCanonicalTimestamp()`, the
same canonical-reconstruction helper Property E already established) —
rejected, not silently normalized or replaced, on any mismatch. Because
`highest.createdAt` was itself validated against whichever row preceded
it at the time it was accepted, this single comparison is transitively
sufficient: it is not possible for a chain of accepted revisions to
ever disagree with the original `createdAt` two or more steps back.

**Tests added** (`tests/offerEnvelope.test.ts`, describe block
"createdAt immutability across revisions (Property I...)"): the exact
reproduction case above, now proving rejection with a reason matching
`/createdAt is immutable/`; a later revision carrying the identical
`createdAt` is still accepted; the first revision for a new offer
identity may set `createdAt` freely (no prior value to conflict with).

> **Retracted (2026-09-09, Fifth Pass below).** This fix's own
> enforcement mechanism — compare against the ingesting node's own
> locally-first-observed `highest.createdAt` — was itself found to be
> order-dependent: a node that happens to observe a later revision
> before an earlier one has no prior value to compare against and
> accepts it unconditionally, then *rejects* a legitimately-signed
> further revision carrying the TRUE original value purely because its
> own first-observed reference point differs from what a node that saw
> the facts in the true historical order would use. Reproduced directly:
> two nodes given the same eventual two facts (revision 0 and revision 2
> with different `createdAt` values) converged on different
> highest-known-revisions entirely (0 on one node, 2 on the other) — a
> second, independent instance of exactly the order-dependence defect
> this whole correction pass exists to close. `createdAt` immutability
> is **retracted as an enforced protocol rule**, not repaired — no
> order-independent mechanism exists without full-history replication
> (a later, unauthorized step), and it was never load-bearing for any of
> the seven originally-frozen ADR-001 §3 properties. See "CTO Gate
> Correction (2026-09-09, Fifth Pass — Properties J, K, L)" below. This
> section is preserved as an accurate record of what was implemented and
> why it still wasn't correct, not as current behavior — the tests it
> describes no longer exist in this form; see the corrected test file.

### Database changes (Properties H/I)

`prisma/schema.prisma`: `@@unique([ownerPublicKey, logicalOfferId,
revision])` replaces `@@unique([logicalOfferId, revision])` — the only
schema change. Because PR #100 has not merged and this table has never
existed in any shared environment, the existing, unmerged
`prisma/migrations/20260909000000_offer_envelope/migration.sql` was
corrected in place (its `CREATE UNIQUE INDEX` statement updated to the
three-column form) rather than adding a second migration purely to
patch the first — no migration-history noise for a change to a
never-applied migration. `npx prisma validate`: schema valid. Real
Postgres evidence: `tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`'s
new "Property H (real DB)" test proves the corrected composite unique
constraint itself (not just the mocked application logic) permits two
different owners under the identical `logicalOfferId`.

### Updated counts (Fourth Pass)

`tests/offerEnvelope.test.ts`: **57 tests** (up from 53 — the Property
A describe block was replaced by 6 Property H tests, plus 3 new
Property I tests; net +4).
`tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`: **4
tests** (the 3 from the Third Pass, plus the new "Property H (real DB)"
test). **Full `npm run test:unit`: 155/155 suites, 1980/1980 tests,
zero failures.** `npx tsc --noEmit`: clean. `npx prisma validate`:
schema valid; `npx prisma generate`: regenerated client, no type
errors. `git diff --check`: clean.

### COBRA Check (Fourth Pass)

The fix does not introduce: a global registry; consensus; server-
assigned IDs; a trusted bootstrap authority; a centralized uniqueness
service; a mutable ownership mapping; or a first-seen trust flag —
Property A's own first-seen check is *removed*, not replaced by a
different one. The property (no arrival-order-dependent authority)
emerges from the signed object identity itself: `(ownerPublicKey,
logicalOfferId)` is derivable from the envelope alone, by any verifier,
with no reference to which node saw what first.

### Rube Goldberg Check (Fourth Pass)

Chosen: `owner key + creator-local id` (a plain composite identity) —
no derived/hashed `canonicalOfferId`, no DID, no blockchain registry,
no CRDT, no distributed lock, no ownership service. The fix touches
exactly: one query's `where` clause, one Prisma `@@unique` annotation
(and its already-unmerged migration, corrected in place), one new
equality check (`createdAt`), and `getLatest()`'s parameter list. This
remains a bounded OpenLiquidity envelope correction.

### ADR-001 step (a) status (Fourth Pass)

Reverted to **CORRECTION REQUIRED** at the start of this pass (from the
Third Pass's `CORRECTED AND RE-CLOSED`); **re-closed as CLOSED
(2026-09-09, corrected — Fourth Pass)** now that Properties H and I are
fixed, tested, and evidenced. See
`docs/adr/ADR-001-day0-multi-operator-network.md` §21(a).

### BACKLOG DELTA (Fourth Pass)

**ZERO.** Properties H and I are defects in the implementation of the
already-authorized step (a) — the offer-identity model was wrong, not
missing architecture. No new obligation is registered in
`docs/BACKLOG.md`.

---

## CTO Gate Correction (2026-09-09, Fifth Pass — Properties J, K, L)

The central question this pass answers directly: **do two conformant
nodes that eventually observe the same set of valid signed
`OfferEnvelope` facts ever end with different economic interpretations
solely because those facts arrived in a different order?** Two more
real cases were found where the answer was yes, and one where a prior
fix's own mechanism was itself the source of the problem.

### Property J — Same-owner / same-revision equivocation

**Reproduced against the real, pre-fix repository logic before writing
any fix.** Setup: owner Alice signs two genuinely different, both
independently-valid envelopes — E1 (price 65000) and E2 (price 70000) —
at the identical `(ownerPublicKey, logicalOfferId, revision=5)`. Node A
ingests E1-then-E2; Node B ingests E2-then-E1.

**Result before this fix:** Node A's final state: price 65000 (E1).
Node B's final state: price 70000 (E2). **Two nodes, given the identical
two facts, disagreed about the offer's actual economic terms, purely
because of arrival order.** Root cause: the (correct, as of the Fourth
Pass) rule "an envelope whose revision does not strictly exceed the
highest already stored is rejected" applied uniformly to the EQUAL-
revision case too — so whichever of E1/E2 arrived second was silently
discarded as "does not supersede," which is exactly
arrival-order-determines-truth restated for revisions instead of for
ownership (Property H's original defect, one layer up). Classified:
**CONFIRMED CONVERGENCE / EQUIVOCATION DEFECT.**

**Chosen equivocation semantics, fail-closed (evaluated, not
pre-authorized, per the mission's own framing):** an envelope whose
revision exactly equals the current highest is either (a) a
byte-identical resend of an already-stored fact (`signature` matches
exactly) — idempotent, a no-op, never stored twice — or (b) genuinely
different signed content at that revision — equivocation. Ed25519
signing is deterministic, so a different signature at the identical
`(ownerPublicKey, logicalOfferId, revision)` always means different
signed content; there is no ambiguity in telling the two cases apart.
Case (b) is stored as a SECOND row, never used to silently overwrite the
first, never discarded. `getLatest()` was changed from returning a
single row-or-null to a three-way `LatestOfferState`
(`RESOLVED` / `EQUIVOCATED` / `NOT_FOUND`): when more than one distinct
signed envelope exists at the current highest revision, it returns
`EQUIVOCATED` naming every conflicting row. `isOfferStateEconomicallyActive()`
(new, `offer-envelope-repository.ts`) treats `EQUIVOCATED` and
`NOT_FOUND` as never economically active — fail-closed, not an arbitrary
pick.

**Why this is deterministic and order-independent:** the verdict is
recomputed fresh from the FULL currently-stored history every time
`getLatest()` is called, never cached from "whichever fact was ingested
most recently." Both E1 and E2 end up stored regardless of which node
saw which first, so both nodes' `getLatest()` calls, once both facts
have arrived, examine the identical row-set and necessarily return the
identical `EQUIVOCATED` verdict — order-independence falls out of
"always look at everything currently known," not out of a rule that
depends on order.

**Not implemented, per explicit CTO instruction:** no consensus, no
global registry, no trusted authority, no distributed lock, no
blockchain anchoring, no server-assigned offer IDs, no CRDT.

**DB / persistence:** confirmed directly that the Fourth Pass's own
`@@unique([ownerPublicKey, logicalOfferId, revision])` constraint,
combined with the "revision does not supersede → reject" pre-check,
meant the SECOND conflicting envelope never even reached `create()` at
all — the application logic discarded it before any database
constraint was even relevant. This is exactly the failure mode named in
the mission: a uniqueness constraint turning "the second conflicting
fact cannot be stored" into "the second conflicting fact did not
exist." Fixed by widening the constraint to
`@@unique([ownerPublicKey, logicalOfferId, revision, signature])` —
justified precisely because two different signed facts at the same
revision are now a real, intended, storable state, not a bug to prevent.
The still-unmerged migration was corrected in place (its `CREATE UNIQUE
INDEX` statement extended to the fourth column and given an explicit
short name — Prisma's auto-generated name for the four-column
constraint exceeds Postgres's 63-byte `NAMEDATALEN` limit and would
otherwise be silently truncated) rather than adding a second migration.

**Tests added** (`tests/offerEnvelope.test.ts`, describe block "owner
equivocation (Property J...)"): the exact two-node reproduction above,
now proving both nodes converge to the identical `EQUIVOCATED` verdict
naming both prices; a byte-identical resend is idempotent, not
equivocation; `EQUIVOCATED` and `NOT_FOUND` are never economically
active. Real-Postgres version:
`tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`'s new
"Property J (real DB)" test proves the corrected 4-column constraint
itself (not just mocked logic) permits two different signed envelopes
at the identical revision.

> **Superseded in part (2026-09-09, Sixth Pass, Property O below).**
> This section's own identity mechanism — "a different `signature`
> means different signed content, there is no ambiguity" — is FALSE as a
> general claim: confirmed directly that Ed25519 signatures are
> malleable, so a byte-different `signature` can exist over IDENTICAL
> content, with no secret key required. The `@@unique([...,
> signature])` constraint described here was itself a vulnerability — a
> mere observer, not the offer's owner, could manufacture a malleated
> signature and falsely trigger `EQUIVOCATED` against an offer that was
> never actually double-signed. The equivocation PROPERTY itself
> (Property J, above) is unchanged and remains correct; only the
> mechanism for detecting "is this genuinely different content" changed
> — from comparing `signature` to comparing `contentDigest` (a hash of
> the content, excluding `signature`). See "CTO Gate Correction
> (2026-09-09, Sixth Pass — Properties M, N, O, P)" below.

### Property K — `createdAt` immutability, retracted

**Reproduced against the real, pre-fix repository logic (the Fourth
Pass's own Property I fix) before touching it.** Setup: owner Alice
signs revision 0 (`createdAt=T0`) and revision 2 (`createdAt=T1`, a
genuinely different value), both legitimately. Node A ingests
rev0-then-rev2; Node B ingests rev2-then-rev0.

**Result before this fix:** Node A: rev0 accepted (T0, the first fact it
ever saw for this identity, nothing to compare against); rev2 REJECTED
— its `createdAt` (T1) didn't match Node A's own locally-first-observed
reference point (T0). Node A's final highest-known-revision: **0**.
Node B: rev2 accepted first (T1, again the first fact it saw, nothing to
compare against); rev0 REJECTED — but for an entirely different reason
(stale, lower revision, checked before `createdAt` is ever compared).
Node B's final highest-known-revision: **2**. **Two nodes, given the
identical eventual set of facts, converged on different
highest-known-revisions entirely — not merely a different verdict on
one field, a materially different accepted economic state.** Classified:
**CONFIRMED ORDER-DEPENDENCE (worse than Property J's own initial
hypothesis — this broke revision convergence itself, not just one
field's validation).**

**Decision: Option B — retract the enforcement, do not invent a
mechanism.** Property first, mechanism second: no order-independent way
exists to enforce `createdAt` immutability using only a node's own
locally-first-observed reference point, because which fact a node
happens to observe first is itself arbitrary and un-coordinated (step
(a) has no full-history replication; that is a later, unauthorized
step). A global-minimum-tracking scheme could theoretically be
constructed, but `createdAt` is not load-bearing for any of ADR-001 §3's
seven originally-frozen properties (identifiable / authenticable /
independently-verifiable / immutable-without-invalidating-signature /
updatable-via-revision / cancellable-via-tombstone / expirable-
independently) — inventing machinery to preserve a claim that isn't
required, at the cost of introducing a second, confirmed source of
non-convergence, fails the mission's own "do not preserve a property
merely because a prior pass named it" instruction. `createdAt` is
narrowed back to what it always structurally was: **signed
(tamper-evident — no relay can alter it without invalidating the
signature) and advisory (never used for ordering)** — the Fourth Pass's
`ingest()`-level rejection is removed entirely, not replaced by a
different mechanism.

**Tests added** (`tests/offerEnvelope.test.ts`, describe block
"createdAt is advisory only, not enforced (Property K...)"): the exact
reproduction case above, now proving a differing `createdAt` is
ACCEPTED, not rejected; a matching `createdAt` is still accepted (as
always); a dedicated convergence test proving Node A (rev0→rev2) and
Node B (rev2→rev0) now both converge to the identical final state
(revision 2, the true highest, on both).

### Property L — Higher revision after equivocation

**Question:** can a correctly signed higher revision deterministically
restore one current offer state after equivocation, without erasing the
evidence? **Answer: yes.** Demonstrated directly: after Alice
equivocates at revision 5 (E1 price 65000, E2 price 70000,
`getLatest()` reports `EQUIVOCATED`), a legitimately-signed revision 6
(price 68000) is ingested. `getLatest()` now reports `RESOLVED` with
revision 6's content — the higher revision resolves what is CURRENT,
deterministically, regardless of which of E1/E2 a given node happened to
store first (both nodes converge to revision 6 in the dedicated
convergence test below). **What is preserved:** both revision-5 rows
(E1 and E2) remain in the table, un-deleted, permanently queryable —
directly confirmed by re-querying `revision: 5` after the resolution and
finding both rows still present with both original prices. **What is
resolved:** only the question of what is CURRENTLY economically active;
the historical fact that this owner equivocated once is never erased.

**Tests added** (`tests/offerEnvelope.test.ts`, describe block "higher
revision after equivocation (Property L...)"): the exact scenario above,
asserting both the resolved current state AND the preserved historical
evidence; a `CONVERGENCE TEST WITH RECOVERY` proving `History A = E1,
E2, rev6` and `History B = E2, E1, rev6` both converge to the identical
resolved state (revision 6, price 68000). Real-Postgres version:
`tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`'s new
"CONVERGENCE TEST (real DB)" test proves the identical property against
an actual database, using two independent `logicalOfferId`s (History A
and History B) so the two runs don't interfere with each other in the
shared test database, exactly as `E1, E2, rev6` vs `E2, E1, rev6` in
opposite arrival order.

### Claim correction — scope of "convergence"

Nothing in this pass, or any prior pass, claims general distributed
consensus. The property demonstrated is narrower and precisely bounded:
**for THIS bounded object model (a single owner's signed, revision-
ordered offer), two nodes that eventually observe the same set of valid
facts arrive at the identical eventual interpretation** — including,
now, correctly classifying owner equivocation as equivocation rather
than picking an arbitrary winner. This is not: Byzantine fault
tolerance, a consensus protocol, or a claim that arbitrary distributed
disagreement of any kind is solved. Every phrase flagged for audit in
the mission brief was checked against this document, the ADR, and
source comments: "highest revision wins" is now always stated scoped to
one offer identity, never unconditionally; "owner continuity" is
retired terminology (superseded by "offer identity" per Property H);
"createdAt immutability" is retracted, not claimed; "no multi-party
conflict" is now always qualified ("within one offer identity," with
the same-owner-equivocation exception named explicitly); no sentence in
any of these three documents claims "all properties fixed" as a
terminal, final statement — every closure is dated and explicitly
superseded by the next correction where applicable, and Property I is
explicitly listed as **retracted**, not fixed.

### Updated counts (Fifth Pass)

`tests/offerEnvelope.test.ts`: **63 tests** (up from 57 — the Property I
describe block was replaced by 3 Property K tests, plus 4 new Property J
tests and 2 new Property L tests; net +6).
`tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`: **6
tests** (the 4 from the Fourth Pass, plus 2 new: "Property J (real DB)"
and the "CONVERGENCE TEST (real DB)"). **Full `npm run test:unit`:
155/155 suites, 1986/1986 tests, zero failures.** `npx tsc --noEmit`:
clean. `npx prisma validate`: schema valid; `npx prisma generate`:
regenerated client, no type errors. `git diff --check`: clean.

### SDK compatibility / OpenLiquidity regression / new dependencies

Unchanged from the Fourth Pass: `packages/sails-sdk` untouched, no
route changes; `liquidity.service.ts`/`Offer`/`liquidity.routes.ts`
untouched; no new dependencies (only `tweetnacl`, Node's built-in
`crypto`, and `@prisma/client`, all already in use).

### COBRA Check (Fifth Pass)

Does not introduce: consensus; a global registry; a trusted authority;
a distributed lock; blockchain anchoring; server-assigned offer IDs; or
a CRDT adopted merely for sophistication. Equivocation detection is a
pure function of the signed facts already stored (a count of distinct
signatures at the current highest revision) — no external coordination,
no voting, no quorum. Fail-closed semantics (`EQUIVOCATED` → never
active) rather than an arbitrary first-writer-wins pick.

### Rube Goldberg Check (Fifth Pass)

Complexity earned its place, nothing added beyond it: one widened
uniqueness constraint (three columns → four), one three-way return type
replacing a row-or-null, one small pure fail-closed helper function.
Property K went the other direction — complexity was REMOVED (an entire
enforcement branch deleted) rather than added, because no mechanism
could satisfy the property correctly. No new abstraction, framework, or
generic "conflict resolution" system was introduced.

### ADR-001 step (a) status (Fifth Pass)

Reverted to **CORRECTION REQUIRED** at the start of this pass (from the
Fourth Pass's `CORRECTED AND RE-CLOSED AGAIN`); **re-closed as CLOSED
(2026-09-09, corrected — Fifth Pass)** now that Properties J, K
(retracted), and L are fixed/resolved, tested, and evidenced. See
`docs/adr/ADR-001-day0-multi-operator-network.md` §21(a).

### BACKLOG DELTA (Fifth Pass)

**ZERO.** Properties J, K, and L are defects (and one retracted
over-claim) in the implementation and specification of the
already-authorized step (a) — not new architecture fronts. No new
obligation is registered in `docs/BACKLOG.md`.

---

## CTO Gate Correction (2026-09-09, Sixth Pass — Properties M, N, O, P)

Before freezing step (a), this pass established that **fact identity,
revision ordering, current-state convergence, and historical-evidence
semantics** are four different questions this document and its
implementation had been conflating, and required that a delivery race
or gossip dedup rule must never suppress a valid signed fact needed to
detect equivocation. Two real defects, one real vulnerability, and one
documentation-only conflation were found.

### Property M — Concurrent identical-fact ingestion

**Reproduced against a real local Postgres instance before writing any
fix**, per explicit instruction. Setup: two genuinely concurrent calls,
`Promise.all([ingest(E1), ingest(E1)])`, for the exact same signed
envelope, against a real, running Postgres database (not mocked).

**Result before this fix:** one call succeeded (`{accepted: true, id:
...}`); the other's promise **rejected** with a raw
`PrismaClientKnownRequestError` (`code: 'P2002'`) — an unhandled
exception propagating out of `ingest()`, confirmed via Postgres's own
query log showing the real `UniqueConstraintViolation`. Exactly the
forbidden outcome named by the mission ("one caller succeeds, one leaks
a Prisma unique-constraint exception"), not a hypothesis.

**Fix:** `ingest()` no longer performs a separate pre-check-then-insert
sequence for idempotency (which is itself race-prone — a classic TOCTOU
gap: the pre-check and the insert are two separate round-trips, and two
concurrent callers can both pass the check before either writes).
Instead, `create()` is attempted directly, and a `P2002` on this table's
one uniqueness constraint is caught (`catch (err: any) { if (err?.code
=== 'P2002') { ... } }`, the exact convention already established
elsewhere in this codebase — `dispute.service.ts`, `reputation.service.ts`,
`escrow-repository.ts`) and converted into the identical graceful
"already known, here is its id" result. The database's own atomic
uniqueness check IS the concurrency control — no application-level
lock, no serialization, nothing added beyond a `try`/`catch` and one
follow-up `findFirst` inside the `catch` branch.

**Real Postgres evidence (post-fix):** re-ran the identical
`Promise.all([ingest(E1), ingest(E1)])` reproduction against the same
real database — both promises now resolve successfully (`fulfilled`)
with `accepted: true` and the identical `id`; exactly one row exists in
the table afterward. Also verified with three concurrent identical
calls (all three resolve to the same id) and with a genuinely unrelated
database error (a plain `Error`, not P2002) — confirmed it is NOT
swallowed and still propagates, so this fix narrowly targets the one
specific, real error class it was written for. Formalized as
`tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`'s
"Property M (real DB)" test (real `Promise.allSettled` against real
Postgres) plus four mocked unit tests
(`tests/offerEnvelope.test.ts`, describe block "concurrent
identical-fact ingestion (Property M...)").

**Not implemented, per explicit instruction:** no global lock, no
distributed lock, no serialization of `ingest()` calls.

### Property N — Gossip-dedup semantic contradiction (documentation only)

**No gossip mechanism exists or was designed in this pass** — this is a
documentation audit of ADR-001's own prose, not a code change. Found and
corrected every statement conflating **fact identity** with **revision-
number deduplication**:
- §3's "Replay protection: a verifier discards any envelope whose
  `revision` is ≤ the highest one it has already verified" — corrected
  to state deduplication is by signed-fact identity (now
  `contentDigest`, Property O below), not by revision comparison; a
  lower-or-equal revision is not, by itself, a reason to discard an
  envelope this node has never seen (Property P).
- §4's "a node relays any newly-received, signature-valid, higher-
  revision envelope... per-`logicalOfferId` dedup by highest-seen
  `revision`" — corrected to freeze only the PROPERTY a future gossip
  design (§21(d), not designed here) must satisfy: a node must never
  suppress relay of a genuinely new, distinct signed fact merely because
  that revision number was already seen. The exact relay-dedup data
  structure remains explicitly undesigned, per the mission's own "freeze
  only the property, not the eventual gossip data structure" instruction.
- §22's complexity-test bandwidth/Rube-Goldberg bullets ("bounded by
  revision-dedup... a node never relays the same revision twice",
  "flood-gossip with revision-dedup") — corrected to "fact-identity
  dedup" throughout.
- §21(d)'s one-line sequence-item description — corrected similarly.

**Required distinction, now stated explicitly wherever these claims
appear:** revision determines ordering and CURRENT-STATE selection only;
signed-fact identity (`contentDigest`) determines deduplication. A
second, different valid fact at the same revision must never be
suppressed merely because that revision number was already observed.

### Property O — Signed-fact identity

Three questions, answered directly against real, controlled evidence,
not assumption:

**1. Can two valid Ed25519 signatures accepted by the exact current
verifier exist for identical canonical content?** **Yes — confirmed.**
A real, controlled test (plain `tweetnacl`, no mocking): sign a message,
parse the resulting signature into its `(R, S)` components, compute
`S' = S + L` where `L = 2^252 + 27742317777372353535851937790883648493`
is the Ed25519 group order, and re-encode `(R, S')` as a new 64-byte
signature. This new signature is BYTE-DIFFERENT from the original (`S'
≠ S` as a byte string) yet `nacl.sign.detached.verify()` accepts it
against the identical message and public key — because scalar
multiplication by `S` is already implicitly reduced mod `L`
(`S'·B = (S + L)·B = S·B + L·B = S·B`, since `L·B` is the identity —
`B` has order `L`). No knowledge of the secret key was used or required
— this is a purely public, structural property of the Ed25519 group,
not a bug specific to `tweetnacl`; `tweetnacl`'s verifier simply doesn't
additionally reject non-canonical `S` values, which is common among
Ed25519 implementations that don't specifically add that check.

**2. Is signature uniqueness a property Sails should depend on?** **No.**
Answer 1 directly implies it: anyone who has observed one valid signed
envelope (which is the entire point of it being *portable* — ADR-001's
own core property) can derive a second, byte-different, still-valid
signature over the identical content, without the owner's key. Any
mechanism that treats `signature` as an identity — deduplication,
equivocation detection, or otherwise — is exploitable by a mere
observer, not even the offer's owner.

**3. Should fact identity instead be `hash(canonical content)` while
signature remains authorization evidence?** **Yes — implemented exactly
this way.** `contentDigest` is `hashOfferEnvelope()`'s existing sha256
hex digest of the canonical serialization (the same function already
used to compute what gets signed) — a pure function of the CONTENT
fields only, excluding `signature` itself. No new hash function, no new
generic "signed-object identity" abstraction — this reuses the exact
digest this module already computes for signing, applied to a second
purpose (identity) it was already structurally suited for.

**Consequence, confirmed directly (both mocked and real Postgres):** a
malleated signature over IDENTICAL content is now recognized as the
SAME fact (idempotent, `equivocationDetected` is `undefined`), not
equivocation — closing the griefing vector Property O's answer to
question 1 makes possible. `contentDigest` is identical for the original
and malleated signature pair (confirmed directly: `hashOfferEnvelope()`
never reads the `signature` field at all).

**Database change:** `prisma/schema.prisma`'s `OfferEnvelope` model
gained one column, `contentDigest String`; the unique constraint is now
`@@unique([ownerPublicKey, logicalOfferId, revision, contentDigest],
map: "offer_envelopes_identity_revision_digest_key")`, replacing the
Fifth Pass's `signature`-keyed constraint. `signature` remains stored in
full — nothing about authorization evidence changed, only what
constitutes "identity." The still-unmerged migration was corrected in
place (new column + replaced index), not superseded by a second one.

**Tests added:** `tests/offerEnvelope.test.ts`, describe block "signature
malleability / signed-fact identity (Property O...)" — the exact
malleation confirmed directly and independently of `ingest()`; a
malleated resend proven idempotent, not equivocation; `contentDigest`
proven identical for original vs. malleated signature. Real-Postgres:
`tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`'s
"Property O (real DB)" test proves the identical property against an
actual database.

### Property P — Historical evidence convergence

**Reproduced directly, both against a mocked in-memory store and a real
Postgres database, before writing any fix.** "History A": E1 (rev 5,
price 65000), E2 (rev 5, price 70000), then a resolving rev 6 (price
68000) — arriving in that order. "History B": the identical set of
facts, with rev 6 arriving FIRST, before E1/E2.

**Answered separately, not forced into one verdict, per explicit
instruction:**
- **Current economic state:** both histories converge to the identical
  `RESOLVED` state (revision 6, price 68000) — this held true even
  BEFORE this fix, since `getLatest()` only ever examines the actual
  highest revision present in storage.
- **Historical signed-fact set:** before this fix, History A retained
  all 3 rows (E1, E2, rev6); History B retained only 1 row (rev6) — its
  own E1/E2 were rejected outright as "stale" (a revision below the
  already-known rev6), because the ingest-time rejection ran before this
  node had any chance to recognize them as genuinely new facts it had
  simply never seen. **Order-dependent, confirmed.**
- **Equivocation evidence:** as a direct consequence, History A could
  prove the owner equivocated at revision 5; History B could not — it
  never even stored the second fact needed to detect the conflict.
  **Absence of local equivocation evidence proved nothing about whether
  equivocation occurred**, and this absence depended purely on arrival
  order.

**Decision, evaluated explicitly against every named criterion (property
first, mechanism second):**

| Criterion | Evaluation |
|---|---|
| Reputation/abuse evidence | Favors Option B strongly — losing equivocation evidence purely as an artifact of arrival order undermines exactly the kind of accountability ADR-001 already cares about. |
| Disputes | Favors Option B — a dispute over historical offer terms benefits from the fullest available signed record. |
| Storage amplification | Bounded either way by cryptography, not policy: an attacker without the owner's private key cannot manufacture new distinct valid facts (only replay/malleate existing ones, and Property M/O's own contentDigest-based idempotency makes replay free — zero additional storage). Option B's cost is bounded by however many genuinely distinct facts the TRUE owner ever signed. |
| Gossip bandwidth | Not yet applicable — step (a) has no propagation/relaying of any kind; this is a future step (d) sizing question, not a reason to lose local evidence today. |
| Replay abuse | Unaffected by the choice between A and B — replaying an already-stored fact is idempotent under both. |
| Future node economics | No direct bearing either way. |
| Privacy | No material difference — both options store the same category of data (signed economic facts); Option B simply doesn't discard some of it based on timing. |
| Simplicity | **Option B is the simpler implementation** — it is the ABSENCE of a special case ("if this revision is lower than the current highest, reject before storing"), not an added one. `ingest()` shed a whole rejection branch. |

**Decision: Option B.** All valid signed facts are retained as
historical/equivocation evidence, regardless of whether their revision
is lower than one already known. Implemented as the minimum step (a)
requires: `ingest()`'s `revision < highest → reject` branch is removed
entirely; storage and equivocation-detection now apply uniformly to
every validly-signed envelope. `getLatest()`'s CURRENT-STATE semantics
are completely unaffected — it already only ever examines the actual
highest revision present in storage, independent of insertion order.

**Rejected: Option A** (drop stale facts; document that local absence of
equivocation evidence proves nothing) — not chosen because Option B costs
less code, not more, and the reputation/dispute value of retained
evidence is real and already named by this ADR, with no countervailing
cost identified in the table above.

**Real Postgres evidence (post-fix):** re-ran History A and History B
against real Postgres (two different `logicalOfferId`s, since changing
`logicalOfferId` changes the signed bytes — these are **structurally
equivalent (isomorphic) histories**, not literally identical envelopes;
worded precisely as such throughout, per explicit instruction) — both
retained exactly 2 rows at revision 5 with both prices present, and both
converged to `RESOLVED`/revision 6/price 68000.

### Deterministic `EQUIVOCATED` representation

`getLatest()`'s own `findMany()` call carries no `orderBy` — Postgres
does not guarantee row order without one, so returning rows in whatever
order the database happened to hand them back would make `EQUIVOCATED.rows`'
array order an accident of storage engine behavior, not a property of
the actual facts. Checked: nothing in this codebase relied on any
particular `rows` order before this pass (step (a) has no HTTP route or
other consumer yet). Fixed anyway, because a deterministic
representation IS part of what this correction pass's own tests need to
assert reliably (`toEqual` on an array is order-sensitive) and because a
future audit/evidence consumer comparing two nodes' `EQUIVOCATED`
results benefits from not needing to sort them itself: `rows` is now
sorted by `contentDigest` (ascending, lexicographic) before being
returned — the one stable, content-derived identity every conformant
node can compute independently, with no dependency on insertion order or
database-internal row order. Confirmed by test: two histories that
equivocate in opposite insertion order (E1-then-E2 vs. E2-then-E1)
produce `rows` arrays in the identical order.

### Real DB evidence, summarized

All four items the mission required, each executed against a real,
running local Postgres instance before this correction, not simulated:
1. **Concurrent identical resend** — `Promise.allSettled([ingest(E1),
   ingest(E1)])`, real concurrency: both fulfilled, one row, identical
   id.
2. **Same-revision distinct facts** — `ingest(E1)` then `ingest(E2)`
   (same identity/revision, different price): both accepted, second
   flagged `equivocationDetected`, `getLatest()` reports `EQUIVOCATED`
   naming both prices.
3. **History A vs. History B** — structurally equivalent histories
   (see Property P above), opposite arrival order: identical current
   state AND identical retained historical evidence in both.
4. **Post-equivocation higher-revision recovery** — a resolving revision
   6 after the rev-5 equivocation: `getLatest()` resolves to `RESOLVED`/
   revision 6 in both histories; the rev-5 evidence rows remain queryable
   and unmodified afterward.

Formalized as `tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`'s
four new/extended tests ("Property J (real DB)", the extended
"CONVERGENCE TEST (real DB, Property P)", "Property M (real DB)",
"Property O (real DB)") — **8 real-Postgres integration tests total**,
up from 4.

### Updated counts (Sixth Pass)

`tests/offerEnvelope.test.ts`: **72 tests** (up from 63 — 4 new Property
M tests, 3 new Property O tests, 2 new Property P tests, plus test 10's
assertion deliberately reversed for Option B).
`tests/integration/offerEnvelopePersistenceRoundTrip.test.ts`: **8
tests** (up from 6 — new Property M and Property O real-DB tests, the
existing convergence test extended in place for Property P's historical-
evidence check rather than duplicated). **Full `npm run test:unit`:
155/155 suites, 1995/1995 tests, zero failures.** `npx tsc --noEmit`:
clean. `npx prisma validate`: schema valid; `npx prisma generate`:
regenerated, no type errors. `git diff --check`: clean.

### SDK compatibility / OpenLiquidity regression / new dependencies

Unchanged: `packages/sails-sdk` untouched, no route changes;
`liquidity.service.ts`/`Offer`/`liquidity.routes.ts` untouched; no new
dependencies (`tweetnacl`, Node's built-in `crypto`, and
`@prisma/client` — all already in use; the Ed25519 group-order arithmetic
for Property O's malleation test uses plain JavaScript `BigInt`, a
language built-in, not a library).

### COBRA Check (Sixth Pass)

Property M: no global lock, no distributed lock, no serialization of
`ingest()` — concurrency control is the database's own atomic
constraint, already there. Property O: no new generic signed-object
identity framework — reuses the exact existing `hashOfferEnvelope()`
digest for a second purpose. Property P: no central registry, no
trusted authority, no consensus — retained facts are exactly the signed
facts this node has independently verified, nothing synthesized. No
cached "verified" flags introduced anywhere in this pass.

### Rube Goldberg Check (Sixth Pass)

Property M's fix is a `try`/`catch` around an existing `create()` call
plus one follow-up lookup — smaller than the pre-check it replaced.
Property O's fix is one column, one constraint change, one already-
existing hash function reused for a second purpose. Property P's fix
REMOVES a branch (`revision < highest → reject`) rather than adding one
— net negative code. Property N is a documentation correction with zero
code. Total footprint across all four properties is smaller than any
single property from the Third or Fourth pass.

### ADR-001 step (a) status (Sixth Pass)

Reverted to **CORRECTION REQUIRED** at the start of this pass (from the
Fifth Pass's `CORRECTED AND RE-CLOSED A THIRD TIME`); **re-closed as
CLOSED (2026-09-09, corrected — Sixth Pass)** now that Properties M, N,
O, and P are fixed/resolved, tested (including real Postgres concurrency
evidence), and evidenced. See
`docs/adr/ADR-001-day0-multi-operator-network.md` §21(a).

### BACKLOG DELTA (Sixth Pass)

**ZERO.** Properties M, O, and P are defects in the implementation of
the already-authorized step (a); Property N is a documentation-only
correction. None are new architecture fronts. No new obligation is
registered in `docs/BACKLOG.md`.

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
