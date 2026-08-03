# CODE_STYLE.md

> **Read this before writing a single line, if you're a new contributor
> or a different AI tool joining this codebase.** `CONTRIBUTING.md`
> covers architecture (module boundaries, naming, the four-layer rule) —
> this document covers something narrower and easier to get wrong when
> more than one person/tool touches the same repo: the actual *voice* of
> the code. This project has one consistent style across hundreds of
> files. If your code doesn't sound like it was written by the same
> engineer as the surrounding file, that's a real defect, not a
> nitpick — it makes the codebase harder to trust and harder to read,
> the same way a document with three different authors' voices is
> harder to read than one with a single author's.
>
> Every rule below is real, extracted from this codebase's own actual
> history — not invented for this document. Grep for the file named
> next to each rule if you want the full, real context.

## 1. Comments explain WHY, never WHAT

A well-named function or variable already says *what* it does. A
comment that repeats that is noise. Only write a comment when there's a
non-obvious reason someone reading the code cold would otherwise miss:
a hidden constraint, a subtle invariant, a workaround for a specific
real bug, a limitation that isn't visible from the code's shape alone.

```typescript
// ❌ WRONG — restates what the code obviously does
// Loop through the users and update their reputation
for (const user of users) { ... }

// ✅ RIGHT — explains a non-obvious real constraint
// Volume tracking isn't outcome-sensitive elsewhere in this codebase —
// a SPLIT counts the full trade.amount as volume for both parties, same
// as a full release, rather than the actual (smaller) amount each side
// received. A deliberate simplification, not an oversight.
await prisma.user.update({ where: { id: trade.buyerId }, data: { totalVolumeBtc: { increment: trade.amount } } })
```

## 2. Never fabricate a value to make something "work"

If a real value is genuinely missing, unverifiable, or would require
guessing, **throw a specific, clear error naming exactly what's
missing and why** — never invent a plausible-looking placeholder that
could be mistaken for something real.

Real example (`src/modules/open-settlement/dispute.service.ts`,
`sweepExpiredAutoResolutions()`): a RELEASE recommendation needs a real
payout address, and no schema field stores one yet. The fix was **not**
to fabricate one from a participant UUID — it was to throw:

```typescript
if (dispute.autoResolutionRecommendation === 'RELEASE') {
  throw new ValidationError(
    `Dispute ${dispute.id}: auto-applying a RELEASE recommendation needs a real payout address this system ` +
    'does not yet store for any participant — falling through to the assigned human arbiter instead of guessing one.'
  )
}
```

Same discipline for **unsupported capability, not a missing one**: when
a real, structural limitation exists (not just "not implemented yet"),
say so explicitly with the technical reason, citing the actual
contract/protocol constraint — see `safe-guard-evm.provider.ts`'s
`buildUnsignedSplit()` (cites the exact Solidity `require` that makes it
impossible) or `lightning-hodl.provider.ts`'s equivalent (cites the
exact script-leaf structure).

## 3. The atomic-claim race-protection idiom

Before calling anything real and side-effecting (a payment provider, a
blockchain broadcast, an external API) that a concurrent duplicate call
would corrupt, **atomically claim the state transition first**, and only
proceed if the claim actually landed:

```typescript
const claim = await prisma.escrow.updateMany({
  where: { id: escrowId, status: escrow.status },   // only succeeds if status hasn't already moved
  data: { status: 'COMPLETED' },
})
if (claim.count === 0) {
  throw new EscrowError(`Escrow ${escrowId} was already transitioned by a concurrent request`)
}
// only now call the real, side-effecting provider
```

This exact pattern appears throughout `escrow.service.ts`
(`lockFunds()`, `releaseFunds()`, `refundFunds()`, `splitFunds()`) and
`dispute.service.ts`. Use it anywhere a double-click, a retried request,
or two concurrent handlers could otherwise trigger the same real-world
action twice.

## 4. Money is always a decimal string, never a JS number

RFC-009's rule, enforced everywhere including at event-bus payload
boundaries. A JS `number` cannot represent arbitrary-precision decimal
amounts safely — `Prisma.Decimal` internally, `string` at every
serialization boundary (API responses, event payloads, SDK types).
Never `parseFloat()` an amount to do math and hand the result onward as
a number; convert back to a decimal string (or keep it a
`Prisma.Decimal`) before it leaves your function.

## 5. Use the specific existing error class, not a generic `Error`

`NotFoundError`, `ValidationError`, `ForbiddenError`, `EscrowError`,
`SailsTransportError` (SDK side) and friends exist so callers (and HTTP
error-mapping middleware) can distinguish failure modes. Throwing a bare
`Error('something went wrong')` loses that distinction. If none of the
existing classes fit, that's worth a moment's thought about whether one
should be added — not a reason to fall back to a generic one.

## 6. When you fix a real bug, say how it was found

This codebase's comments routinely disclose the *provenance* of a fix —
not just what changed, but what real, concrete symptom led to finding
it. This turns bug fixes into durable institutional knowledge instead of
a diff that looks arbitrary six months later.

```typescript
// --ignore-scripts: found the hard way (first real `docker build` attempt,
// 2026-08-03) — `redis-memory-server`/`embedded-postgres` (devDependencies
// used only for local test infra)... [full reasoning follows]
```

(`Dockerfile`, `dispute.service.ts`'s `applyRuling()`, and dozens of
other files all follow this same pattern — grep `"found the hard way"`
or `"Real bug found"` across the repo for more real examples.)

## 7. Verify claims against the real system before trusting them

This project's own established discipline: before hardcoding a contract
address, an API endpoint shape, or a "this package behaves like X"
assumption, verify it against the real, live thing (a live RPC call, an
actual `docker build`/`docker run`, a real test against the real
crypto library) — not documentation, not memory, not what "should" be
true. Several real production bugs this session (a stale
`package-lock.json`, a missing nested `node_modules` copy, a devDependency
trying to compile a full Redis from source) were only found by actually
running the built artifact, not by `tsc`/`npm test`/code review alone.
If you're about to assert something works, ask whether you've actually
run it.

## 8. Testing conventions

- Mock the network/database *boundary*, not the business logic being
  tested — see any `*.test.ts` file's own `jest.mock('../src/common/database', ...)` pattern.
- Heavy/ESM-only SDKs (`@qvac/sdk`, `@arkade-os/sdk`, etc.) are
  `require()`'d lazily inside the function that needs them, specifically
  so tests that don't exercise that path never need to mock them.
- Where real cryptography is being tested (Ed25519 signing, PSBT
  construction), use the *real* library, not a mock of it —
  `tests/identity.test.ts`/`tests/multisigProvider.test.ts` exercise real
  `tweetnacl`/`bitcoinjs-lib` calls and verify the result against the
  real server-side verification logic, not a faked "looks plausible"
  signature.
- `export {}` at the top of a test file that uses `require()` internally
  forces real module scoping — copy this pattern from an existing test
  file rather than reinventing it.

## 9. File header comments

Most files in `src/` and `packages/sails-sdk/src/` open with a real,
substantial header comment: what this file actually does, what's
disclosed as a known limitation, and pointers to the relevant RFC/doc.
This is not boilerplate — write a real one for any new file, matching
the depth of the files around it, not a one-line summary.

## 10. See also

- `CONTRIBUTING.md` — architecture-level rules (module boundaries, the
  four-layer rule, naming conventions, singleton discipline).
- `docs/BACKLOG.md` — current project status, the actual source of truth
  over `HANDOFF.md`/`TODO.md` if they disagree.
- `docs/rfcs/` — every structural protocol decision, numbered.
