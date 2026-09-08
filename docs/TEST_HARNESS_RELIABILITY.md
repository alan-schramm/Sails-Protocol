# Test-Harness Reliability — `.claude/worktrees/` Haste Module-Map Collision (#57)

**Property investigated:** the full test suite should fail because the
code is wrong, not because unrelated local worktrees or test-discovery
artifacts collide.

**Status: ROOT CAUSE DEMONSTRATED, MINIMUM FIX IMPLEMENTED AND VERIFIED.**
This closes the long-standing, repeatedly-disclosed "`.claude/worktrees/`
Haste-map collision" condition every WDK mission this session (#56, #58,
the fund-moving sweep, and the bounded remediations) reported and worked
around locally via an ad-hoc CLI flag, never fixed in the repository
itself until now.

---

## 1. Observed Failure

A plain `npm test` (no CLI workaround) on this machine consistently
failed with hundreds of suite errors, all carrying the identical symptom:

```
The name `@satsails/p2p-trading-sdk` was looked up in the Haste module
map. It cannot be resolved, because there exists several different
files, or packages, that provide a module for that particular name and
platform. ...
  at ModuleMap._assertNoDuplicates (node_modules/jest-haste-map/build/index.js:244:11)
  at Object.<anonymous> (src/modules/open-settlement/safe-guard-evm.provider.ts:91:1)
  at Object.<anonymous> (src/modules/open-settlement/escrow-providers.ts:9:1)
  at Object.<anonymous> (src/modules/open-settlement/escrow.service.ts:7:1)
  at Object.<anonymous> (<some test file>:N:1)
```

Every prior mission this session that needed to run tests locally
disclosed this exact condition (most recently the WDK fund-moving
remediation passes) and worked around it with a local, non-committed CLI
flag (`--modulePathIgnorePatterns='<rootDir>/.claude/worktrees/'`),
never fixing the repository's own `jest.config.js`.

---

## 2. Reproduction

REPOSITORY OBSERVED, `.claude/worktrees/` (immediately before this fix):

```
.claude/worktrees/
  agent-a0485ab5b840843fb/   (real git worktree, dated Sep 6)
  agent-a6f07e2a4c954f686/   (real git worktree, dated Sep 6)
  agent-a969c446b58a32101/   (real git worktree, dated Sep 6)
  agent-ad6779ee6389b9e59/   (real git worktree, dated Sep 6)
```

Each `.claude/worktrees/agent-*` is a genuine, linked `git worktree`
checkout — confirmed via each one's own `.git` file (`gitdir:
.../.git/worktrees/<name>`, the standard git-worktree pointer format, not
an independent clone) — created by the Agent tool's `isolation:
"worktree"` feature (or any other tool invoking `git worktree add`),
which only auto-removes a spawned agent's worktree when that agent made
no changes; one that did make changes leaves its worktree behind for
later inspection. Each is a full source checkout (~18MB, no
`node_modules`) including its own `packages/sails-sdk/package.json` —
the exact file whose `"name"` field (`@satsails/p2p-trading-sdk`) is
named in every collision error.

**Minimal reproduction matrix, built by direct, controlled experiment
(not assumed):**

| Environment | Worktrees present | `npx jest <file importing escrow.service.ts>` result | Failure class |
|---|---|---|---|
| Current workspace as-is | 4 | FAIL — Haste collision naming 5 candidates (4 worktrees + real repo) | Systemic |
| Same workspace, `.claude/worktrees/` excluded via CLI flag | 4 (present, just excluded from scan) | PASS | N/A |
| Same workspace, 3 of 4 worktrees excluded via CLI flag, 1 left scannable | 1 (deliberately isolated) | FAIL — Haste collision naming exactly 2 candidates (the 1 remaining worktree + real repo) | Systemic |
| A single test file with **no runtime import reaching `escrow.service.ts`** (`tests/wdkExecutionTruth.test.ts` — only a `import type` reference) | 4 (present, unaffected either way) | PASS, with or without the exclusion | N/A — this file never asks Jest to resolve the colliding name at all |
| CI (`.github/workflows/ci.yml`, fresh `actions/checkout`) | 0 (this directory is a local, untracked, host-machine-only artifact — never part of the git repository at all) | PASS (every CI run this entire session) | N/A |

**Clean temp checkout (a fresh `git clone` + `npm install` elsewhere on
disk) was judged not worth the time/disk cost given CI's own repeated,
real green runs already constitute direct "zero worktrees present"
evidence at least as strong as a fresh local clone would provide** — not
performed, disclosed rather than silently skipped.

**A single stray worktree is fully sufficient to reproduce the failure**
— this is not a "4 is too many, but 1 or 2 would be fine" threshold
problem; any count ≥ 1 collides, because Jest's Haste map treats 2+
providers of the same declared package name as an unconditional error
regardless of how many total providers exist beyond the first.

---

## 3. Root Cause

**DEMONSTRATED** (by the controlled reproduction above, not merely
inferred): Jest's `jest-haste-map` module builds a project-wide index of
every `package.json` under the configured `roots` (default:
`<rootDir>`), keyed by each file's own declared `"name"` field — a
legacy Haste/Metro-style package-name registry, separate from and in
addition to plain Node module resolution. `jest.config.js`'s own
`modulePathIgnorePatterns`, before this fix, excluded only `<rootDir>/dist/`
(added earlier for the *identical class* of problem — a built copy of
the root `package.json` colliding with the real one — see that entry's
own pre-existing comment). Nothing excluded `.claude/worktrees/`, so
every worktree's own `packages/sails-sdk/package.json` (declaring the
same `"name": "@satsails/p2p-trading-sdk"` as the real
`packages/sails-sdk/package.json`) was indexed as an additional,
colliding provider of that name. The error fires specifically at the
moment something actually asks Jest's resolver to resolve that name —
observed precisely, every time, at `safe-guard-evm.provider.ts:91`'s own
`import ... from '@satsails/p2p-trading-sdk'` — which is why a test file
whose import graph never reaches that line (`wdk-execution-truth.ts`'s
own tests, which only reference `escrow.service.ts` via an erased
`import type`) never triggers it, while any file that DOES reach it
(directly or transitively, via `escrow.service.ts` → `escrow-providers.ts`
→ `safe-guard-evm.provider.ts`) fails 100% of the time, regardless of
whether it's run alone or as part of a larger batch.

**INFERRED, not fully reverse-engineered:** the exact internal reason
`jest.config.js`'s own `moduleNameMapper` entry for
`'^@satsails/p2p-trading-sdk$'` does not appear to pre-empt this specific
failure (`moduleNameMapper` is checked by Jest's resolver, but the
Haste-map's own `ModuleMap._assertNoDuplicates` check evidently still
fires for this name independent of that mapping's existence) is not
traced down to the exact line inside `jest-resolve`/`jest-haste-map`
responsible for that ordering. This does not weaken the fix's own
correctness — the fix removes the duplicate providers from the scanned
tree entirely, which closes the collision regardless of the precise
internal resolver call order — but it is disclosed as unresolved
internal-mechanism detail rather than claimed as fully understood.

**A second, independent, empirically-confirmed effect of the same root
cause:** Jest's `testMatch` pattern (`**/tests/**/*.test.ts`) has no
exclusion for `.claude/worktrees/` either, and each worktree's own nested
`tests/` directory contains its own (slightly older) full copy of this
project's test files. Before this fix, Jest was discovering and
attempting to run these as additional, phantom, duplicate suites — see
§5 for the exact accounting.

---

## 4. Why CI Never Reproduces This

`.claude/worktrees/` is a purely local, host-machine artifact of running
Agent-tool worktree-isolated agents on this development machine — it is
never committed to git (confirmed: absent from `.gitignore`, simply
never `git add`ed by anyone) and therefore does not exist at all in any
`actions/checkout` clone CI performs. CI has run dozens of times across
this session's own missions (every merged PR from #79 through #89) with
`build`/`test` consistently green — direct, repeated, real evidence that
the *product code* was never at fault; only this one local machine's
accumulated tooling artifacts were.

---

## 5. Test-Discovery Accounting (before → after, exact)

REPOSITORY OBSERVED, counted directly, not estimated:

| | Count |
|---|---|
| Real `.test.ts` files in this repository (`find tests -iname '*.test.ts'`) | **155** |
| `.test.ts` files inside `.claude/worktrees/agent-a0485ab5b840843fb/tests/` (one representative worktree) | **148** |
| Same count, each of the other 3 worktrees | **148** each (all four worktrees carry an identical, slightly older snapshot) |
| `npm run test:unit` total suites, **before** this fix (most recent full `npm test` run prior to this mission, unit-test phase only) | **742** (`442 failed, 300 passed, 742 total`) |
| `npm run test:unit` total suites, **after** this fix | **154** (`154 passed, 154 total`) |
| Arithmetic check: `155 (real, minus 1 excluded by test:unit's own integration-file exclusion list) + 4 × 148 (worktree duplicates)` | `154 + 592 = 746` — within a small margin of the observed 742 pre-fix total (the residual few-file difference is consistent with a handful of test files added/renamed in this repository since each worktree's own, slightly older snapshot was created, and is not investigated further as immaterial to the root-cause conclusion) |

**This is the second half of the root cause, not a separate bug:** the
pre-fix "742 total" figure was never 742 *genuinely distinct* test
suites — it was the real 154-155 plus four essentially-duplicate copies
of most of them, sourced from stale worktree checkouts. `npm run
test:unit`'s own historical "442 failed" count is best understood as
"every discovered suite (real or duplicate) whose import graph reaches
`escrow.service.ts`'s chain" — a large fraction of the total precisely
because that chain is central to this codebase's own OpenSettlement
module, imported (directly or transitively) by a large share of the real
suite too, and identically inherited by every duplicate worktree copy of
those same files.

**Cobra Check — proof that no real coverage was lost:** `npm run
test:unit` **after** this fix reports **154 passed, 154 total** — matching
this repository's own real `tests/` directory almost exactly (155 files
found by direct filesystem search; `test:unit`'s own npm script excludes
one class of integration file by name, accounting for the 1-file
difference). Every one of the 154 real suites **passes**, not merely
"is still discovered" — nothing was hidden, silenced, or skipped to
produce this number; the reduction from 742 to 154 is accounted for
entirely by the disappearance of the four stale, tooling-generated
worktree duplicates (742 − 154 = 588 ≈ 4 × 148, matching the worktree
`.test.ts` counts above almost exactly), not by any real test file
ceasing to be collected.

---

## 6. Candidate Fixes Considered

- **Chosen: add `<rootDir>/.claude/worktrees/` to `jest.config.js`'s
  existing `modulePathIgnorePatterns` array**, alongside the pre-existing
  `<rootDir>/dist/` entry — the smallest possible change (one array
  element), reusing an already-established, already-justified mechanism
  in this exact file for the exact same class of problem, with no new
  configuration key, no new tooling, no framework change.
- **Rejected: raise Jest's timeout, reduce worker count, or use
  `--runInBand` as a "fix."** None of these address the actual
  cause (a name collision, not a timing/resource-contention issue) and
  were explicitly disallowed by this mission's own scope.
- **Rejected: delete the stale worktrees.** Would mask the *next*
  occurrence (any future Agent-tool worktree-isolated run that makes
  changes recreates this exact condition) rather than closing the
  underlying gap in `jest.config.js` itself. Also risks destroying
  another session's genuinely in-progress work without their knowledge —
  explicitly avoided (`.claude/worktrees/` was never touched, deleted, or
  moved anywhere in this investigation; every reproduction step used only
  Jest CLI exclusion flags, never filesystem mutation).
- **Rejected: exclude all of `.claude/`** rather than just
  `.claude/worktrees/` specifically. `.claude/` also holds
  `launch.json`, `settings.local.json`, and `skills/` — none of which
  are repository checkouts or contain colliding `package.json` files;
  the narrower, evidenced exclusion is preferred (complexity/scope must
  earn its place — excluding more than the demonstrated cause requires
  is not justified by anything found in this investigation).
- **Rejected: a `.hasteignore` file or disabling Haste validation
  globally.** Both are blunter, undocumented-in-this-repo mechanisms for
  a problem `modulePathIgnorePatterns` (already established, already
  commented, already proven to work by the `dist/` precedent) solves
  precisely.

---

## 7. Chosen Fix — Implemented

`jest.config.js`:

```diff
- modulePathIgnorePatterns: ['<rootDir>/dist/'],
+ modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/.claude/worktrees/'],
```

With a comment explaining the root cause and pointing at this document,
matching the file's own existing documentation convention for its
`dist/` entry and its `transformIgnorePatterns`/`@prisma/client`
entries.

---

## 8. Before/After Evidence

- **Before** (most recent full run prior to this mission, unit-test
  phase): `442 failed, 300 passed, 742 total` suites.
- **After** (this fix, `npm run test:unit`): **`154 passed, 154 total`
  suites; `1923 passed, 1923 total` tests. Zero failures.**
- **`npm test` (the full chained script — `test:unit` then
  `test:integration:postgres`) after this fix:** the unit phase above
  (100% pass), followed by the *separate, pre-existing, unrelated*
  27-suite integration-test phase failing exactly as it has throughout
  this entire session — each with the same clear, deliberate
  `TestDatabaseSafetyError` (`SAILS_INTEGRATION_TEST_DB_CONFIRMED` not
  set, no reachable local Postgres in this environment). **This is not a
  Haste-map issue, not caused by worktrees, and out of this mission's
  scope** — it is the same "no live Postgres available in this session"
  condition disclosed repeatedly across the WDK missions
  (`localhost:5432` connection refused), unrelated to test-harness
  reliability as a *property*.
- `npx tsc --noEmit`: clean.
- `git diff --check`: clean.

---

## 9. Residuals

- **The internal Jest/`jest-resolve` reason `moduleNameMapper` does not
  pre-empt the Haste-map's own duplicate check for this specific name is
  INFERRED, not traced to source.** Does not weaken the fix (which
  removes the duplicate providers entirely, independent of resolver
  internals), but is disclosed as an open, shallow gap in understanding
  rather than claimed as fully reverse-engineered.
- **This fix addresses `.claude/worktrees/` specifically, evidenced by
  this investigation.** If a *different* tool ever creates full-repo
  checkouts under a *different* untracked local path, the identical class
  of collision could recur there — this document does not claim to have
  made the harness immune to every conceivable future local-tooling
  artifact, only to have closed the one demonstrated, currently-present
  cause.
- **A clean, fresh-clone-elsewhere reproduction was not performed** (§2)
  — CI's own repeated real evidence was judged sufficient and the
  clean-clone reproduction's marginal evidentiary value did not justify
  its time/disk cost in this pass.
- **`.claude/` is still not listed in `.gitignore`.** A minor, separate
  hygiene gap noticed in passing (a careless `git add -A` could
  accidentally stage these full repo copies) — not fixed here, since it
  is a distinct concern from the Jest-scanning property this mission
  investigates, and disclosed rather than silently expanded into.

---

## 10. Verdict

**Root cause: DEMONSTRATED**, by direct, controlled inclusion/exclusion
experiments — not assumed, not inferred from Jest being "flaky."
**`.claude/worktrees/` is fully causal**, confirmed sufficient at a count
of exactly 1 stray worktree, and confirmed absent (hence non-reproducing)
in every CI run this session.

**Fix: IMPLEMENTED, bounded, minimal** — one array entry in an
already-established configuration mechanism, mirroring an existing,
already-justified precedent in the same file for the identical class of
problem. No timeout changes, no worker-count changes, no `--runInBand`
reliance, no framework change, no test skipped, no real coverage lost
(§5's exact accounting).

**Claude recommendation: CLOSE #57.** The property this mission was
scoped to investigate — "the full test suite should fail because the
code is wrong, not because of unrelated local artifacts" — now holds:
`npm run test:unit` passes 100% locally, matching CI's own long-standing
result exactly, for the first time this session without any ad-hoc CLI
workaround.
