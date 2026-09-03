# CONDITION_ALGEBRA_CONFORMANCE_EVIDENCE.md

### Ruleset Composition Conformance Mission — Evidence Record

> Follows this repository's own evidence-artifact convention
> (`docs/MAINNET_MULTISIG_PROOF.md`'s "What was proven" / "What was NOT
> proven" structure). This is evidence, not a marketing document —
> `OUTPUT != EVIDENCE != PROPERTY != CLAIM`.

## 1. Baseline

- **Commit:** `2474eb9` (`main`, clean working tree at mission start —
  verified via `git status --short` before any file was touched)
- **`@satsails/p2p-trading-sdk` version:** `0.1.3` (unchanged by this mission)
- **Protocol fee:** `PROTOCOL_FEE_RATE` default `0` (unchanged; not touched)
- **Ruleset under test:** `sails-escrow-timelock-expiry-ruleset@1.0`
  (`conformance/rulesets/sails-escrow-timelock-expiry-ruleset-1.0.json`)
- **New conformance identity registered:** `sails-condition-algebra@1.0`

## 2. Scope Correction Found During This Mission

The mission's own framing anticipated testing "the published ruleset's
own composition." Direct inspection of
`conformance/rulesets/sails-escrow-timelock-expiry-ruleset-1.0.json`
found this assumption does not hold: **the one currently-published
Ruleset declares no composition at all** — its own text states its
content is exactly "the timelock-evaluator's own rule... No other
condition is part of this Ruleset's content," and its
`expectedEvaluatorIdentity` names exactly one evaluator. Further
confirmed by direct `grep`: `conditionAnd`/`conditionOr`/
`conditionThreshold` (`packages/sails-core/src/condition-result.ts`)
are referenced nowhere in production code (`src/`) or any other package
— **composition is currently unused by any real Ruleset in this
repository.**

This mission was reframed accordingly, disclosed rather than silently
substituted: it validates the shared **Condition Algebra** mechanism
(`docs/CORE_ARCHITECTURE.md` §13) any future composing Ruleset would
need to rely on — a Ruleset-independent, Core-level primitive — not a
specific Ruleset's own composition fidelity, because none currently
exists to test.

## 3. Semantic Authority Order (established before any vector was written)

1. `docs/SEMANTIC_KERNEL.md` §5 (K1 — Valid Transition, frozen)
2. `docs/CORE_ARCHITECTURE.md` §12 (Condition Semantics — the four-state definitions)
3. `docs/CORE_ARCHITECTURE.md` §13 (Condition Algebra — AND=min, OR=max,
   N-of-M threshold formula, explicitly pre-verified in the document
   itself for commutativity/associativity/idempotence/monotonicity/
   internal-consistency before being recorded)
4. `docs/CORE_ARCHITECTURE.md` §14 (UNKNOWN / System-Error Boundary —
   governs empty-input rejection)
5. `conformance/profiles/sails-semantic-profile-1.0.json` (fixes the
   canonical `ConditionResult` string representation)
6. `packages/sails-core/src/condition-result.ts` — **the defendant**,
   evaluated against 1-5, never the source of 1-5

No contradiction was found among 1-5. **COMPOSITION SEMANTIC AUTHORITY: ESTABLISHED.**

## 4. Composition Model Inventory

| Construct | Declared | Implemented | Unit-Tested | Conformance-Covered (before this mission) |
|---|---|---|---|---|
| AND | Yes (§13) | Yes | Yes (`conditionResult.test.ts`) | No |
| OR | Yes (§13) | Yes | Yes | No |
| N-of-M threshold | Yes (§13) | Yes | Yes | No |
| Order-independence | Yes (§13's own verification note) | Yes (min/max are commutative) | Yes (identity tests) | No |
| Repeated/idempotent children | Yes (§13's own verification note) | Yes | Yes | No |
| Nesting | Implicit (type-closure; not a named §13 construct) | Yes (functions are input/output-closed) | Not directly | No |
| Empty composition | Underspecified by §13's own prose; resolved via §14's general principle | Rejects (throws), never fabricates a result | Not directly | Not representable in the existing vector schema (see §9) |
| Short-circuit | Not discussed by §13 (pure function of the full set by definition) | N/A — no short-circuiting exists | N/A | Covered indirectly via permutation vectors |

## 5. Independent Expected-Value Derivation

Every vector's `expectedOutput` was transcribed directly from §13's own
AND/OR tables and N-of-M formula into
`conformance/evaluators/sails-condition-algebra-1.0.json` and
`conformance/vectors/sails-condition-algebra-1.0.vectors.json` **before
`packages/sails-core/src/condition-result.ts` was executed against
them.** For every vector, the expected value is answerable from the
table/formula alone — e.g. `AND(SATISFIED, UNSATISFIABLE, UNSATISFIABLE)
= UNSATISFIABLE` because §13's AND row/column for UNSATISFIABLE is
UNSATISFIABLE against every other value, never because "the TypeScript
implementation returns it."

## 6. Positive Vectors — 39 total

12 AND, 10 OR, 9 threshold, 6 permutation, 2 nesting. Committed at
`conformance/vectors/sails-condition-algebra-1.0.vectors.json`. Each
targets a semantically distinct cell/branch (not maximized for count):
every reachable AND/OR table cell that distinguishes it from an
adjacent cell, all four N-of-M formula branches at real boundary
values, both reduction identities (`threshold(1,...) == OR`,
`threshold(M,...) == AND`), and the specific asymmetric
`OR(NOT_YET_SATISFIED, UNKNOWN) = NOT_YET_SATISFIED` vs.
`AND(NOT_YET_SATISFIED, UNKNOWN) = UNKNOWN` pair the mission's own
Phase 3 explicitly asked about.

## 7. Negative / Adversarial Vectors and Mutant Challenge Results

All required Attacks A-G are covered by the positive-vector set itself
(each cell that a specific miscomposition would get wrong). Confirmed
by explicit mutant execution — 9 deliberately-wrong implementations
(local, throwaway, never committed), each run against the same 39
vectors:

| Mutant | Attack | Vectors failed |
|---|---|---|
| A — AND implemented as OR | A | 12 / 40 |
| B — OR implemented as AND | B | 12 / 40 |
| C — UNKNOWN collapsed to UNSATISFIABLE | C | 5 / 40 |
| D — UNKNOWN collapsed to SATISFIED | D | 9 / 40 |
| E — NOT_YET_SATISFIED collapsed into UNSATISFIABLE | E | 4 / 40 |
| F — UNSATISFIABLE collapsed into NOT_YET_SATISFIED | F | 7 / 40 |
| G — threshold off-by-one (strict `>`/`<=` instead of `>=`/`<`) | G | 7 / 40 |
| H — arity-truncation (ignores children past the first two) | (own addition) | 1 / 40 |
| I — composition ignored, first child forced | (own addition) | 15 / 40 |

**Every mutant failed at least one vector.** The suite discriminates
correct from deliberately incorrect composition behavior — the
required Phase 8 evidence.

## 8. Metamorphic Relations

**Accepted** (source, precondition, what it detects):
- **Permutation invariance** — §13's own "checked for commutativity."
  Applies to AND, OR, and threshold (threshold explicitly
  "grouping-independent by construction, a flat count"). Detects
  position/order-dependent bugs (caught mutants A, B, F above via the
  `perm-*` vectors).
- **Idempotence** — §13's own verification note. `AND(x,x)=x`,
  `OR(x,x)=x`. Detects double-counting/duplicate-weighting bugs.
- **Monotonicity** — §13's own verification note. Replacing one child
  with a result higher in the total order can only move AND/OR's
  result toward SATISFIED or leave it unchanged, never the reverse.
  Detects inverted-comparison bugs.
- **Threshold boundary preservation** — derived directly from the
  four-branch N-of-M formula. Moving one child from
  NOT_YET_SATISFIED to SATISFIED only ever moves the aggregate toward
  SATISFIED. Detects off-by-one bugs generally (caught mutant G).

**Explicitly rejected:** "Nesting equivalence" as a general law (e.g.
treating `AND(OR(a,b),c)` as reducible to some flattened form) — §13
never claims general distributivity across mixed AND/OR, and standard
boolean algebra's own distributive law is not assumed to transfer to
this four-state model without evidence. Nesting is instead verified
only as two independently-authoritative sequential table lookups (§9's
own disclosed limitation), never as a claimed algebraic law.

## 9. Harness Integration

Integrated through the **existing** conformance architecture with
**zero schema or type changes**: `ConformanceVector<TInput>` and
`runConformanceVectors()` (`packages/sails-core/src/conformance.ts`)
were already fully generic over `TInput` and already output
`ConditionResult` — exactly the algebra's own result type. Added:
`conformance/evaluators/sails-condition-algebra-1.0.json` (new semantic
definition, explicitly disclosed as "NOT a LeafEvaluator," following
the same role-distinctness precedent `correspondence-conformance.ts`
already established for `CorrespondenceEvaluator`),
`conformance/vectors/sails-condition-algebra-1.0.vectors.json` (39
vectors), and one registry entry in `scripts/run-conformance-harness.ts`
(a thin dispatch wrapper, outside Pure Core's own boundary, adding no
new behavior beyond routing to the three already-frozen functions).
`RECOGNIZED != CONFORMANT` preserved exactly — the harness reports both
facts separately for this identity, as it already does for the other three.

**One disclosed conformance-artifact gap:** the empty-input "must
reject, never fabricate a ConditionResult" requirement (§14) is not
representable in the existing `{input, expectedOutput: ConditionResult}`
vector shape, since rejection isn't a `ConditionResult` value. Verified
directly (not through the committed vector file) that both
`conditionAnd()` and `conditionOr()` throw on empty input, consistent
with §14 — recorded here as evidence, not as a formal vector, and
disclosed as a real, minor artifact-representation limitation rather
than silently worked around or schema-changed (schema changes were not
pre-authorized and none were made).

## 10. Current Implementation Trial (Phase 10)

**Outcome A — implementation conforms.** All 39 committed vectors pass
against the real `packages/sails-core/src/condition-result.ts`
(`npm run check:conformance`, `conformant: true` for
`sails-condition-algebra@1.0`), on the first run, with zero vectors
adjusted afterward. No implementation defect was found; nothing was
fixed. The existing internal identity test suite
(`packages/sails-core/tests/conditionResult.test.ts`, 24/24) further
corroborates this independently.

**Minor documentation-precision finding, not fixed (out of this
mission's scope):** `condition-result.ts`'s own header comment cites
"`condition-result.test.ts`"; the real file is
`packages/sails-core/tests/conditionResult.test.ts` (camelCase). Noted
for a future minimal citation fix, not corrected here.

## 11. Regression Results

- `npm run check:core-boundary` — clean, no forbidden imports (this
  mission never touched `packages/sails-core/src`)
- `npx tsc --noEmit` (root) — clean
- `npm run build -w @sails/core` — clean
- `npm run check:conformance` — **7/7 identities conformant**
  (timelock, attribution, condition-algebra [new], destination-correspondence),
  exit code 0
- `npx jest tests/conformanceHarness.test.ts packages/sails-core/tests/leafEvaluatorAndConformance.test.ts` — 24/24 passed
- `npx jest packages/sails-core/tests/conditionResult.test.ts` — 24/24 passed

No existing conformance behavior regressed.

## 12. Files Changed

- `scripts/run-conformance-harness.ts` (modified — one new import block, one wrapper, one registry entry)
- `conformance/evaluators/sails-condition-algebra-1.0.json` (new)
- `conformance/vectors/sails-condition-algebra-1.0.vectors.json` (new)
- `docs/CONDITION_ALGEBRA_CONFORMANCE_EVIDENCE.md` (this file, new)

No Core semantics, Semantic Kernel, Ruleset content, SDK, or schema changed.

## 13. Smallest Defensible Claim

**"The shared Sails Condition Algebra (AND/OR/N-of-M threshold,
`sails-condition-algebra@1.0`) has published, adversarially-validated
conformance vectors, independently derived from
`docs/CORE_ARCHITECTURE.md` §13, that the reference implementation
passes and that 9 deliberately-incorrect implementations each fail, as
of commit [this mission's merge commit]."**

## 14. NOT PROVEN

- **The published Ruleset's own composition is conformant** — it has
  none; nothing was tested at the Ruleset-composition level, because no
  Ruleset currently composes anything.
- Any future Ruleset that does declare AND/OR/threshold composition —
  untested until it exists and is checked against this same identity.
- Nesting as a general law — only verified as two independently-correct
  sequential lookups, never as a recursive input structure exercised in
  one call.
- Other rulesets, other evaluators, future composition operators.
- Multi-language conformance, second independent implementation,
  provider substitution, recovery conformance, interoperability, formal
  verification, exhaustive correctness, or production correctness.
- Full K1 conformance or full Sails conformance of any kind.
