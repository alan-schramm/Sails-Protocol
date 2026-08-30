/**
 * economic-outcome.ts — Sails Core Implementation Program M7
 * (Authoritative Economic Outcome). Domain-level Reference
 * Implementation content for `@sails/core`'s already-frozen (M1)
 * `Outcome<TContent, TDestination>`/`DestinationBinding<TReference>` —
 * neither type changes in this mission; M7's job is to prove a real,
 * deterministic, adversarially-tested domain content model composes
 * correctly through them, through M5 attribution, and through M6
 * correspondence, without inventing anything Core-level.
 *
 * M8 W1 REMEDIATION (Provider Dispatch Gate mission): M7's original
 * remainder rule ("canonically-last beneficiary by sorted name")
 * survived M7's own adversarial pass only because that pass never
 * questioned whether `beneficiary` itself was a stable identity.
 * Attacked directly under M8: nothing in M7 guaranteed `beneficiary`
 * was a permanent identifier rather than mutable display text, so an
 * incidental string-sort order could end up deciding a real (if often
 * small) money allocation. Fixed by requiring an EXPLICIT
 * `remainderBeneficiary` field — see that field's own doc comment.
 * `canonicalAllocations()`'s sort is retained, but narrowed to its one
 * legitimate purpose: making the commitment hash independent of the
 * caller's own array order, never deciding value.
 *

 * NOT WIRED INTO ANY LIVE PATH. `dispute.service.ts`'s `applyRuling()`
 * is completely untouched — see this file's own "WHY NO LIVE MIGRATION"
 * below, which restates and reconfirms discretionary-authority.ts's
 * (M5) own finding: the fusion of verification, decision, and fund
 * dispatch inside one synchronous call has not changed since M5, so the
 * same STOP applies here.
 *
 * WHY NO LIVE MIGRATION (mission's own §4/§26): `applyRuling()`
 * (dispute.service.ts) verifies the signed decision AND immediately
 * dispatches fund movement in the same synchronous flow. Making Outcome
 * authority genuinely live would require rewiring that same function so
 * its execution call reads destination/amount/beneficiary FROM the Core
 * Outcome rather than from `resolveDispute()`'s own raw parameters —
 * touching fund-movement-adjacent code in the very function this whole
 * Core Implementation Program has consistently declined to touch
 * without first proving the underlying primitive in isolation (M4's own
 * discipline: build and validate first, migrate live only when doing so
 * cannot create dual authority). §26's own test is decisive: deleting
 * this file's code changes nothing about `applyRuling()`'s existing
 * economic decisions — it remains, today, the sole (legacy) authority
 * for what RELEASE/REFUND/SPLIT economically means. This module
 * therefore stops at: the generalized Outcome primitive implemented,
 * composed with M5/M6, and adversarially validated against real
 * Mission13-shaped material — zero change to any live authority path.
 *
 * COMPOSITION BOUNDARY THIS FILE MAINTAINS: the signed authority
 * decision's own commitment (`arbitration-authority.ts`'s
 * `hashAuthorityDecision`, unchanged) covers exactly what the arbiter
 * signed — `ruling` and `buyerBps`. This Outcome's own, separate
 * commitment (`hashOutcomeContent` below) covers the FULL economic
 * meaning, including `asset`/`totalUnits` — facts already established
 * by the escrow record itself (ordinary already-verified data, not a
 * new claim the arbiter must separately attest to). The two
 * commitments are NEVER interchangeable and are computed by two
 * distinct functions over two distinct canonical strings — proven
 * directly in tests/economicOutcome.test.ts.
 */
import { createHash } from 'crypto'
import {
  DestinationBinding,
  Outcome,
  createOutcome,
  ExecutionObservation,
  CorrespondenceResult,
  TransitionRecord,
  createTransitionRecord,
  createCandidateTransition,
  RulesetRef,
  DiscretionaryAttributionMaterial,
  AttributionClaim,
} from '@sails/core'
import { evaluateSettlementCorrespondence } from './destination-correspondence'
import { ESCROW_DISPUTE_RULING_TRANSITION_TYPE } from './discretionary-authority'

export type ArbitrationRuling = 'RELEASE' | 'REFUND' | 'SPLIT'

/** One beneficiary's share, expressed in basis points of the total — never a float, never a rail-specific unit. */
export interface AllocationInput {
  readonly beneficiary: string
  readonly basisPoints: number
}

/**
 * The full authorized economic meaning for one arbiter ruling.
 * `totalUnits` is an integer string in the asset's smallest unit (e.g.
 * satoshis for BTC) — never a float, never a Decimal object (this
 * codebase's own existing convention for authoritative value, reused
 * here at the smallest-unit level specifically so allocation is exact
 * integer arithmetic with zero rounding ambiguity).
 */
export interface ArbitrationOutcomeContent {
  readonly ruling: ArbitrationRuling
  readonly totalUnits: string
  readonly asset: string
  readonly allocations: readonly AllocationInput[]
  /**
   * M8 W1 remediation (Sails Core Implementation Program M8 — Provider
   * Dispatch Gate): which beneficiary absorbs the exact rounding
   * remainder — EXPLICIT and REQUIRED, never inferred from array order
   * or from sorting `beneficiary` strings. M7's original design used
   * "canonically-last by sorted name," attacked and found insufficient
   * during M8: `beneficiary` was never guaranteed to be a stable,
   * non-display identifier, so an incidental sort order could end up
   * deciding a real (if small) money allocation — exactly the class of
   * bug this field exists to make structurally impossible. Must
   * reference one of `allocations`' own beneficiaries (validated below).
   */
  readonly remainderBeneficiary: string
}

export interface BeneficiaryDestination {
  readonly beneficiary: string
  readonly destination: string
}

function assertWellFormedOutcomeContent(content: ArbitrationOutcomeContent): void {
  if (!/^\d+$/.test(content.totalUnits)) {
    throw new Error('ArbitrationOutcomeContent.totalUnits must be a non-negative integer string')
  }
  if (content.allocations.length === 0) {
    throw new Error('ArbitrationOutcomeContent requires at least one allocation')
  }
  const beneficiaries = new Set(content.allocations.map((a) => a.beneficiary))
  if (beneficiaries.size !== content.allocations.length) {
    throw new Error('ArbitrationOutcomeContent allocations must have distinct beneficiaries')
  }
  for (const a of content.allocations) {
    if (!Number.isInteger(a.basisPoints) || a.basisPoints < 1 || a.basisPoints > 10000) {
      throw new Error(`allocation basisPoints must be an integer in [1, 10000], got ${a.basisPoints}`)
    }
  }
  const sum = content.allocations.reduce((s, a) => s + a.basisPoints, 0)
  if (sum !== 10000) {
    throw new Error(`ArbitrationOutcomeContent allocations must sum to exactly 10000 basis points, got ${sum}`)
  }
  if (!beneficiaries.has(content.remainderBeneficiary)) {
    throw new Error(`ArbitrationOutcomeContent.remainderBeneficiary "${content.remainderBeneficiary}" must be one of the allocation beneficiaries`)
  }
}

/**
 * Canonical, deterministic ordering — sorted by beneficiary name. This
 * ordering is used ONLY to make the COMMITMENT (a hash) independent of
 * the caller's own array order — it is NEVER used to decide who
 * receives value (see `remainderBeneficiary` above and M8's own W1
 * finding for why an economic decision must never ride on incidental
 * sort order). Neither the caller's own array order nor which
 * allocation "comes first" carries economic meaning; only the
 * (beneficiary -> basisPoints) MAPPING does — "70% buyer / 30% seller"
 * always canonicalizes identically regardless of input order, while
 * "30% buyer / 70% seller" — a genuinely different economic fact —
 * never collides with it.
 */
function canonicalAllocations(content: ArbitrationOutcomeContent): readonly AllocationInput[] {
  return [...content.allocations].sort((a, b) => a.beneficiary.localeCompare(b.beneficiary))
}

/**
 * Deterministic, exact-conservation integer allocation — BigInt only,
 * never floating point. The EXPLICITLY named `remainderBeneficiary`
 * (never an incidental sort-order pick — M8's own W1 remediation)
 * receives the exact remainder after every OTHER allocation's
 * floor(basisPoints * totalUnits / 10000) — guaranteeing
 * sum(allocatedUnits) === totalUnits always, regardless of how
 * basisPoints divides totalUnits.
 */
export function allocateExactUnits(content: ArbitrationOutcomeContent): readonly { readonly beneficiary: string; readonly units: string }[] {
  return allocateExactUnitsOverTotal(content, BigInt(content.totalUnits))
}

/**
 * M8-R (Live Dispatch Retry) — the SAME floor+remainder algorithm as
 * `allocateExactUnits()` above, parameterized by an explicit `total`
 * rather than always reading `content.totalUnits`. Exists because a real
 * Bitcoin RELEASE/SPLIT deducts a miner fee from the spendable value
 * BEFORE splitting it between beneficiaries (`multisig.provider.ts`'s
 * `buildUnsignedSpend()`, unchanged) — the authoritative Outcome commits
 * to the ECONOMIC RULE (ruling + bps + the escrow's full locked amount as
 * the gross basis), never a pre-computed net-of-fee sat amount that would
 * require knowing a network-observed miner fee at authorization time.
 * `dispatch-translation-guard.ts` uses this to re-derive the EXPECTED
 * per-beneficiary split against the REAL, PSBT-observed spendable total
 * (gross minus the REAL miner fee actually present in the built PSBT) —
 * this is the K3-compliant "Provider applies the authorized rule using
 * externally-submitted data" pattern
 * (`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §25), never the Provider
 * substituting its own interpretation of what a beneficiary is owed.
 */
export function allocateExactUnitsOverTotal(content: ArbitrationOutcomeContent, total: bigint): readonly { readonly beneficiary: string; readonly units: string }[] {
  assertWellFormedOutcomeContent(content)
  let allocated = BigInt(0)
  const results: { beneficiary: string; units: string }[] = []
  for (const a of content.allocations) {
    if (a.beneficiary === content.remainderBeneficiary) continue // computed last, below
    const units = (total * BigInt(a.basisPoints)) / BigInt(10000)
    allocated += units
    results.push({ beneficiary: a.beneficiary, units: units.toString() })
  }
  results.push({ beneficiary: content.remainderBeneficiary, units: (total - allocated).toString() })
  return results
}

const ECONOMIC_OUTCOME_DOMAIN = 'SAILS_ECONOMIC_OUTCOME_V1' as const
const ECONOMIC_OUTCOME_VERSION = 1 as const

/**
 * Explicit field order, explicit stringification — the exact same
 * discipline `arbitration-authority.ts`'s own `canonicalizeAuthorityDecision`
 * already established (never JSON.stringify). A SEPARATE domain
 * separator from `AUTHORITY_DECISION_DOMAIN` — this commits to the full
 * economic meaning, not the signed decision, and the two must never be
 * interchangeable (see this file's own header).
 */
export function canonicalizeOutcomeContent(content: ArbitrationOutcomeContent): string {
  assertWellFormedOutcomeContent(content)
  const allocationsPart = canonicalAllocations(content).map((a) => `${a.beneficiary}:${a.basisPoints}`).join(',')
  return [ECONOMIC_OUTCOME_DOMAIN, String(ECONOMIC_OUTCOME_VERSION), content.ruling, content.asset, content.totalUnits, allocationsPart, content.remainderBeneficiary].join('|')
}

export function hashOutcomeContent(content: ArbitrationOutcomeContent): string {
  return createHash('sha256').update(canonicalizeOutcomeContent(content)).digest('hex')
}

/** Structurally visible destinations (outcome.ts's own "never buried entirely inside opaque Outcome bytes") — one opaque string reference per beneficiary, canonically sorted. */
export function buildOutcomeDestinationBinding(
  destinations: readonly BeneficiaryDestination[],
): DestinationBinding<readonly BeneficiaryDestination[]> {
  return { reference: [...destinations].sort((a, b) => a.beneficiary.localeCompare(b.beneficiary)) }
}

export function buildArbitrationOutcome(
  content: ArbitrationOutcomeContent,
  destinationBinding: DestinationBinding<readonly BeneficiaryDestination[]>,
): Outcome<ArbitrationOutcomeContent, readonly BeneficiaryDestination[]> {
  assertWellFormedOutcomeContent(content)
  // Every beneficiary the content actually allocates value to MUST have
  // a bound destination — an omitted destination is a construction-time
  // error here, never a silently-skipped correspondence check later
  // (mission's own "omitted destination where required" attack, §28.R:
  // evaluateOutcomeCorrespondence() below has no way to check a
  // dimension it was never given, so the failure mode must be closed
  // HERE, at construction, not discovered as a missing check downstream).
  const boundBeneficiaries = new Set(destinationBinding.reference.map((d) => d.beneficiary))
  for (const allocation of content.allocations) {
    if (!boundBeneficiaries.has(allocation.beneficiary)) {
      throw new Error(`ArbitrationOutcome: beneficiary "${allocation.beneficiary}" has an allocation but no bound destination`)
    }
  }
  return createOutcome({ content, destinationBinding })
}

/**
 * The full M5 + M7 composition: an attributed discretionary decision
 * (M5's own verdict, unchanged — see discretionary-authority.ts) plus
 * this file's own economic Outcome, combined into one durable-shaped
 * Core `TransitionRecord`. Never constructed except from an already
 * ATTRIBUTED verdict — there is no parameter path here that lets a
 * caller supply attribution material Core/M5 didn't itself produce.
 *
 * `escrowId` is used as the Core `InteractionId` — the same convention
 * M4/M5 already established (the escrow is the semantic scope whose
 * State actually changes).
 */
export function buildAttributedArbitrationTransitionRecord(
  escrowId: string,
  attributionClaim: AttributionClaim,
  attribution: DiscretionaryAttributionMaterial,
  outcome: Outcome<ArbitrationOutcomeContent, readonly BeneficiaryDestination[]>,
  rulesetRef: RulesetRef,
): TransitionRecord<{ readonly escrowId: string }, ArbitrationOutcomeContent, readonly BeneficiaryDestination[]> {
  const interaction = attributionClaim.claimedInteraction
  return createTransitionRecord({
    interaction,
    priorPosition: 'LEGACY_UNVERIFIED',
    transition: createCandidateTransition({
      interaction,
      type: ESCROW_DISPUTE_RULING_TRANSITION_TYPE,
      payload: { escrowId },
    }),
    rulesetRef,
    evaluatorIdentity: rulesetRef.expectedEvaluatorIdentity,
    profileIdentity: rulesetRef.expectedProfileIdentity,
    conditionResult: 'SATISFIED',
    attribution,
    outcome,
  })
}

/**
 * Composes with M6 correspondence PER BENEFICIARY LEG — never a single
 * compound comparison (M6's evaluator compares one opaque reference
 * with `===`; a SPLIT's two legs are independently, correctly checked
 * this way, with zero changes to the M6 evaluator itself).
 *
 * `buildArbitrationOutcome()` already guarantees every allocated
 * beneficiary has a bound destination, so `authorizedDestination` below
 * is never silently `undefined` for a real Outcome — an unreported
 * EXECUTION observation for a beneficiary still correctly yields
 * UNKNOWN (via the default IRRESOLVABLE fallback), never a skipped
 * check.
 */
export function evaluateOutcomeCorrespondence(
  outcome: Outcome<ArbitrationOutcomeContent, readonly BeneficiaryDestination[]>,
  observations: ReadonlyMap<string, ExecutionObservation<string>>,
): ReadonlyMap<string, CorrespondenceResult> {
  const units = allocateExactUnits(outcome.content)
  const destinations = outcome.destinationBinding?.reference ?? []
  const results = new Map<string, CorrespondenceResult>()
  for (const allocation of units) {
    const destination = destinations.find((d) => d.beneficiary === allocation.beneficiary)
    const authorizedDestination = destination ? { reference: destination.destination } : undefined
    const observation = observations.get(allocation.beneficiary) ?? { status: 'IRRESOLVABLE' as const }
    results.set(
      allocation.beneficiary,
      evaluateSettlementCorrespondence(authorizedDestination, allocation.units, outcome.content.asset, observation),
    )
  }
  return results
}
