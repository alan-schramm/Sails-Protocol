/**
 * scripts/run-conformance-harness.ts — Sails Core Implementation
 * Program, Phase 2 (M2 — Canonical Evaluator Identity, Semantic
 * Profile & Conformance Harness).
 *
 * Loads a semantic definition and its conformance vectors from
 * `conformance/`, resolves a supplied evaluator implementation, and
 * reports whether that implementation's actual output matches every
 * vector's expected output — using Pure Core's own
 * `runConformanceVectors` for the comparison itself
 * (`packages/sails-core/src/conformance.ts`). This file is
 * deliberately NOT part of Pure Core: it does filesystem I/O, which
 * `scripts/check-core-boundary.ts` would (correctly) reject inside
 * `packages/sails-core/src`.
 *
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §6: "recognized" (does a
 * semantic definition exist and resolve for this identity) is
 * necessarily a tooling-level fact here, since it requires reading a
 * file — Core itself never gains an `isRecognized` concept. §9:
 * "conformant" (does a SPECIFIC supplied implementation's behavior
 * match) is exactly what `checkEvaluatorConformance` below determines,
 * and it is never inferred from an implementation merely declaring the
 * right identity — see `evaluatorImplementation.identity` is read only
 * for the report, never used to decide the pass/fail verdict itself,
 * which comes entirely from running the vectors.
 *
 * The `evaluatorRegistry` below is an explicitly local,
 * repository-internal map from identity to a TypeScript implementation
 * — not network discovery, not governance, not certification
 * infrastructure (all explicitly out of M2 scope). A future Rust or Go
 * team would build their own equivalent local registry from the same
 * public `conformance/evaluators/*.json` definitions; nothing about
 * this file's own shape is required of them.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  ConformanceVector,
  LeafEvaluator,
  runConformanceVectors,
  allPassed,
  createEvaluationTime,
  createCanonicalEvaluatorIdentity,
  createCanonicalSemanticProfileIdentity,
} from '../packages/sails-core/src'
import { referenceTimelockEvaluator, TimelockInput } from '../packages/sails-core/src/evaluators/timelock-evaluator'

const REPO_ROOT = path.resolve(__dirname, '..')

interface RawVector {
  readonly vectorId: string
  readonly evaluatorIdentity: { readonly name: string; readonly version: string }
  readonly profileIdentity: { readonly name: string; readonly version: string }
  readonly semanticDefinitionReference: string
  readonly input: unknown
  readonly expectedOutput: string
}

/** Converts one evaluator's raw JSON vector input into its typed input shape. */
type InputParser<TInput> = (raw: unknown) => TInput

interface RegistryEntry<TInput> {
  readonly evaluator: LeafEvaluator<TInput>
  readonly parseInput: InputParser<TInput>
}

function parseTimelockInput(raw: unknown): TimelockInput {
  const r = raw as { readonly deadline: number; readonly evaluationTime: number }
  return {
    deadline: createEvaluationTime(r.deadline),
    evaluationTime: createEvaluationTime(r.evaluationTime),
  }
}

/**
 * Local, repository-internal identity -> reference-implementation
 * registry. Keyed by "name@version" — the Canonical Evaluator Identity
 * itself, never a package name.
 */
const evaluatorRegistry: Record<string, RegistryEntry<any>> = {
  'sails-timelock-evaluator@1.0': {
    evaluator: referenceTimelockEvaluator,
    parseInput: parseTimelockInput,
  },
}

export interface ConformanceReport {
  readonly evaluatorIdentity: string
  readonly definitionPath: string
  readonly vectorsPath: string
  readonly recognized: boolean
  readonly conformant: boolean
  readonly outcomes: ReadonlyArray<{ readonly vectorId: string; readonly passed: boolean; readonly expected: string; readonly actual: string }>
}

/**
 * Loads the semantic definition + vectors for `evaluatorIdentityKey`
 * ("name@version") and checks the SUPPLIED `implementation` against
 * them — never the registry's own default implementation, so a test
 * can supply a deliberately wrong or identity-spoofing implementation
 * and this function will still faithfully report what actually
 * happened, never silently substituting the "real" one.
 */
export function checkEvaluatorConformance<TInput>(
  evaluatorIdentityKey: string,
  implementation: LeafEvaluator<TInput>,
  parseInput: InputParser<TInput>,
): ConformanceReport {
  const definitionPath = path.join(REPO_ROOT, 'conformance', 'evaluators', `${evaluatorIdentityKey.replace('@', '-')}.json`)
  const recognized = fs.existsSync(definitionPath)

  const definition = recognized ? JSON.parse(fs.readFileSync(definitionPath, 'utf8')) : undefined
  const vectorsRelativePath: string = recognized
    ? definition.conformanceVectors
    : path.join('conformance', 'vectors', `${evaluatorIdentityKey.replace('@', '-')}.vectors.json`)
  const vectorsPath = path.join(REPO_ROOT, vectorsRelativePath)

  const rawVectors: RawVector[] = fs.existsSync(vectorsPath) ? JSON.parse(fs.readFileSync(vectorsPath, 'utf8')) : []

  const vectors: ConformanceVector<TInput>[] = rawVectors.map((raw) => ({
    vectorId: raw.vectorId,
    evaluatorIdentity: createCanonicalEvaluatorIdentity(raw.evaluatorIdentity.name, raw.evaluatorIdentity.version),
    profileIdentity: createCanonicalSemanticProfileIdentity(raw.profileIdentity.name, raw.profileIdentity.version),
    semanticDefinitionReference: raw.semanticDefinitionReference,
    input: parseInput(raw.input),
    expectedOutput: raw.expectedOutput as ConformanceVector<TInput>['expectedOutput'],
  }))

  const outcomes = runConformanceVectors(implementation.evaluate, vectors)

  return {
    evaluatorIdentity: evaluatorIdentityKey,
    definitionPath: path.relative(REPO_ROOT, definitionPath),
    vectorsPath: path.relative(REPO_ROOT, vectorsPath),
    recognized,
    conformant: recognized && vectors.length > 0 && allPassed(outcomes),
    outcomes,
  }
}

function main(): void {
  const reports: ConformanceReport[] = []
  for (const [key, entry] of Object.entries(evaluatorRegistry)) {
    reports.push(checkEvaluatorConformance(key, entry.evaluator, entry.parseInput))
  }

  let anyFailed = false
  for (const report of reports) {
    console.log(`\n${report.evaluatorIdentity}`)
    console.log(`  definition: ${report.definitionPath} (recognized: ${report.recognized})`)
    console.log(`  vectors:    ${report.vectorsPath}`)
    for (const outcome of report.outcomes) {
      const mark = outcome.passed ? 'PASS' : 'FAIL'
      console.log(`  [${mark}] ${outcome.vectorId} — expected ${outcome.expected}, actual ${outcome.actual}`)
      if (!outcome.passed) anyFailed = true
    }
    console.log(`  conformant: ${report.conformant}`)
    if (!report.conformant) anyFailed = true
  }

  process.exit(anyFailed ? 1 : 0)
}

if (require.main === module) {
  main()
}
