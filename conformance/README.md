# conformance/

Public, language-neutral semantic material for Sails Core — the answer
to "how can an implementation claim it evaluates the same Sails
semantics as another, without saying 'because both use this TypeScript
package'?" See `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` sections
5-7 and 19 before changing anything here.

**None of this is normative on its own.** It exists to make the
already-frozen `docs/SEMANTIC_KERNEL.md` and `docs/CORE_ARCHITECTURE.md`
independently implementable — it never redefines them, and if anything
here appears to conflict with either, they govern and this is wrong.

## Layout

```
conformance/
  profiles/    Canonical Semantic Profile definitions
  evaluators/  Canonical Evaluator Identity semantic definitions
  vectors/     Conformance vectors (one file per evaluator version)
```

Every file has a stable, repository-relative path — never a line
number, a private URL, a local absolute path, or an invented registry
URL (`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §36's own requirement).

## What a Canonical Evaluator Identity actually is

None of these alone define semantic identity, and none is compared
anywhere in this directory's own JSON: npm package name, npm package
version, a Git commit, a binary or source-code hash, a TypeScript
class/function name, a module path, a container image, a deployment ID.
A **Canonical Evaluator Identity** (`{ name, version }`) is a label that
*resolves to* one JSON file under `evaluators/` — that file, not any
TypeScript source, is the semantic definition. `packages/sails-core/src/evaluators/`
contains a **Reference TypeScript Evaluator** — one conformant
*implementation* of that definition, in this language, in this
repository. A Rust or Go implementation of the exact same identity,
built only from the JSON file and its vectors, is an equally valid,
equally first-class implementation of the same semantics.

## Evaluator definition shape (`evaluators/*.json`)

`evaluatorIdentity`, `semanticProfileIdentity`, `inputs` (name + type +
description, per input — the evaluator's full input contract),
`output` (the ConditionResult type, which of the four values are
actually reachable and why, per `docs/CORE_ARCHITECTURE.md`'s own
four-state model), `rule` (the exact deterministic behavior, in prose
precise enough to implement from), `determinism` (a purity/no-hidden-input
statement), `normativeReferences` (pointers into the already-frozen
documents — never duplicated here), `conformanceVectors` (a
repository-relative path).

## Profile shape (`profiles/*.json`)

Only the cross-language ambiguity classes the *current* evaluators
actually depend on — integer representation and comparison, the
canonical `ConditionResult` string values, and which vector fields are
semantically binding versus documentation-only. A profile version's
`notSpecifiedByThisVersion` field lists what is deliberately still
open, so absence reads as a disclosed scope boundary, never a silent
gap. A new rule is added only when a real evaluator needs it — see
`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §12's own minimality
instruction.

## Vector shape (`vectors/*.vectors.json`)

A JSON array of `{ vectorId, evaluatorIdentity, profileIdentity, semanticDefinitionReference, input, expectedOutput }`.
**Only `input` and `expectedOutput` are semantically binding** — the
other four fields are documentation/bookkeeping only, never compared
during conformance checking (this is what makes an identity-spoofing
test meaningful: a vector can carry whatever labels a test wants while
the actual check still runs correctly). Every value is plain JSON —
no `undefined`, `BigInt`, `Date`, functions, class instances, `Map`,
`Set`, `NaN`, or `Infinity` — a constraint the JSON format itself
enforces, not merely a style guide.

## Recognized ≠ conformant

"Recognized" means a semantic definition file exists and resolves for
a claimed identity — necessarily a tooling-level fact, since it
requires reading a file; Pure Core itself never gains an "is this
recognized" concept. "Conformant" means a *specific supplied
implementation*, when actually run against the vectors, produces
matching output — determined only by running it, never by whether it
merely *declares* the right identity. `scripts/run-conformance-harness.ts`
keeps these two facts separate in its own report; neither implies the
other, and no boolean anywhere in this repository claims an
implementation is "certified."

## Running it

```bash
npm run check:conformance
```

Loads every registered evaluator, checks it against its real vectors,
and exits non-zero if anything fails or is unrecognized. This script
lives outside Pure Core's own boundary (`packages/sails-core/src/`) —
it does real file I/O, which the M0 boundary checker correctly forbids
inside Core itself. The pure comparison logic it calls
(`runConformanceVectors`, `packages/sails-core/src/conformance.ts`) does
live inside Core, since comparing an already-computed actual value
against an already-supplied expected one is ordinary pure computation.

## What conformance vectors are, and are not

Conformance vectors are **evidence of behavioral conformance** for the
specific inputs they cover — never **formal proof of semantic
equivalence** across all possible inputs. Passing every vector here
does not prove an implementation is correct for untested inputs; it
proves it agrees with the reference on the inputs someone thought to
write down. This is a permanent, honest limit of testing-based
conformance, not a defect this directory tries to paper over — see
`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §6.

## Status

One evaluator (`sails-timelock-evaluator@1.0`) and one profile
(`sails-semantic-profile@1.0`) exist as of this writing — sufficient to
prove the mechanism, not a complete semantic surface. Ruleset admission
tooling (deciding whether a Ruleset/Evaluator/Profile combination is
*trusted*, as opposed to merely *resolvable*) and a general external
publication process for evaluator identities remain open — see
Technical Debt item 38.
