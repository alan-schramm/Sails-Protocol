# @sails/core (internal, unpublished)

Pure Semantic Core for Sails Protocol. See `docs/SEMANTIC_KERNEL.md`,
`docs/CORE_ARCHITECTURE.md`, and `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md`
before touching this package — architecture is frozen; this package must
conform to it, never the reverse.

**Status**: M0 (mechanical boundary) + M1 (semantic model foundation) +
M2 (Canonical Evaluator Identity, Semantic Profile & conformance
harness) only. No shadow evaluation, no authority transfer, no
Ruleset-admission/governance tooling. The current, legacy
implementation remains 100% authoritative — nothing in this package is
invoked by any Runtime path yet.

## Commands (no runtime infrastructure required)

```bash
npm run typecheck -w @sails/core   # tsc --noEmit, no Postgres/Redis/network needed
npm run build -w @sails/core       # tsc, emits dist/ (not published, not consumed anywhere yet)
npm run check:boundary -w @sails/core  # scripts/check-core-boundary.ts against src/
npm run check:conformance          # scripts/run-conformance-harness.ts against conformance/
```

## Boundary

`src/` may depend on nothing external — no runtime dependency at all,
not even `typescript` (that's a devDependency needed only to build/
typecheck this package, never imported by its own source). Enforced two
ways:

1. `scripts/check-core-boundary.ts` statically parses every file under
   `src/` and rejects any non-relative import, `require(...)`, or
   dynamic `import(...)`, plus any reference to an ambient-effect global
   (`process`, `fetch`, timers, `Math.random`, `Date.now()`/bare `new
   Date()`, `__dirname`/`__filename`). This is a **declaration-level**
   check — it never trusts what would or wouldn't actually resolve at
   runtime, because this repository's own npm workspace hoisting was
   directly verified (during Core Implementation Architecture
   validation) to make resolution-based enforcement alone insufficient.
2. `tsconfig.json` sets `"types": []` and `"lib": ["ES2020"]` (no
   `"DOM"`), so `@types/node`'s ambient globals and browser-only globals
   are outside the type-checker's scope entirely — a second, independent
   layer: referencing `process` or `fetch` fails to *compile*, not just
   fails the boundary script.

See `tests/coreBoundaryCheck.test.ts` for fixtures proving both layers
actually reject representative violations and accept legitimate pure
code.

## Semantic roles implemented now, and why

| Role | Status | File |
|---|---|---|
| Interaction identity | implemented | `identifiers.ts` |
| Actor / Source reference | implemented (kept distinct — see file) | `identifiers.ts` |
| ConditionResult (4-state + algebra) | implemented | `condition-result.ts` |
| Canonical Evaluator/Profile Identity | implemented, minimal | `evaluator-identity.ts` |
| RulesetRef (hybrid identity) | implemented, minimal | `ruleset.ts` |
| Assertion envelope | implemented, 7-field minimum | `assertion.ts` |
| Outcome + DestinationBinding | implemented, opaque content | `outcome.ts` |
| SemanticHistoryPosition | implemented, storage-neutral | `semantic-history-position.ts` |
| Explicit time input | implemented, language-neutral | `time.ts` |
| CandidateTransition / TransitionRecord | implemented, conditional shape | `transition.ts` |
| LeafEvaluator contract | implemented (M2) | `leaf-evaluator.ts` |
| Reference timelock evaluator | implemented (M2), see `conformance/evaluators/sails-timelock-evaluator-1.0.json` for the semantic definition it implements | `evaluators/timelock-evaluator.ts` |
| Conformance vector comparison (pure) | implemented (M2) | `conformance.ts` |

## Deliberately deferred (not missing — scoped out, with reason)

- **Role reference** — folds fully into a ruleset-evaluated leaf
  predicate ("does Actor X hold Role R" is itself an ordinary evaluated
  condition); no persisted type is needed until leaf-predicate
  evaluation logic exists (M2+).
- **State** — Runtime/Module-owned projection with no universal
  Core-level shape; introducing a generic `State` type now would invent
  structure Core doesn't actually own. Deferred to when leaf-predicate
  logic is built.
- **CorrespondenceResult / ExecutionValidityResult** — explicitly M6/M8
  scope per the migration sequence (`CORE_IMPLEMENTATION_ARCHITECTURE.md`
  §29), not part of the M1 role list.
- **Attribution *verification* logic** — M5 scope; only the minimal
  `DiscretionaryAttributionMaterial` envelope shape exists now
  (`transition.ts`).
- **Ruleset admission / governance tooling** — deciding whether a
  Ruleset/Evaluator/Profile combination is *trusted* for use (as
  opposed to merely *resolvable*, which M2 now provides) remains open,
  tracked as Technical Debt item 38. `see ../../conformance/README.md`
  for the recognized-vs-conformant mechanism M2 actually built.

## What this package must never become

No service classes, no repositories, no ORM entities, no Runtime
orchestration, no Provider abstractions — see
`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §11. Small immutable data
shapes and pure functions only.
