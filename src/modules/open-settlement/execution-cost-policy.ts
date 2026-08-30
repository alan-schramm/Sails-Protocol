/**
 * execution-cost-policy.ts — Sails Core Implementation Program M8.6
 * (Execution Cost Semantics & Live Correspondence Closure).
 *
 * ANSWERS THE CENTRAL SEMANTIC QUESTION: how does an external rail's
 * execution cost (Bitcoin's miner fee) relate to an authorized economic
 * Outcome? This is Runtime/domain code — deliberately NOT
 * `packages/sails-core` (Pure Core stays Bitcoin-free, §9 of this
 * mission) — layered on top of M7's already-frozen `ArbitrationOutcomeContent`/
 * `allocateExactUnitsOverTotal()` (economic-outcome.ts), which needed no
 * change to support this.
 *
 * SELECTED MODEL — Model B, NET DISTRIBUTABLE VALUE, validated against
 * the REAL, EXISTING, UNCHANGED `multisig.provider.ts` construction
 * logic, not chosen for convenience:
 *
 *   distributable = gross(totalUnits) - executionCost
 *   each beneficiary's delivered amount = allocateExactUnitsOverTotal(
 *     content, distributable)
 *
 * WHY THIS DOES NOT VIOLATE K3 ("that outcome's meaning is defined
 * independently of whatever mechanism executes it... never alter what
 * was authorized"): the arbiter's signed content
 * (`arbitration-authority.ts`'s `AuthorityDecisionPayload.buyerBps`,
 * or "100% to X" for RELEASE/REFUND) is a RATIO/disposition, never an
 * absolute sat amount. `multisig.provider.ts`'s own real
 * `buildUnsignedSplit()`/`buildUnsignedRelease()` (unchanged by this
 * mission) have ALWAYS computed `buyerPool = spendableValue` (gross
 * minus the real miner fee) and split THAT pool by the exact authorized
 * bps — meaning the fee is deducted from the total pie BEFORE the
 * authorized ratio is applied, preserving the ratio (what was actually
 * signed) exactly; only the absolute sat amounts scale down by a
 * rail-inherent, physically necessary cost. This is precisely the
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §25 "pricing rule was part
 * of what was authorized; a Provider applies it using externally
 * submitted data" pattern — the RULE (the bps ratio) was authorized;
 * the miner fee is externally-submitted data (the rail's own market
 * rate) the rule is applied against, never the Provider's own
 * reinterpretation of what a beneficiary is owed.
 *
 * WHY THIS COST IS RAIL EXECUTION COST, NOT SAILS PROTOCOL FEE: the
 * Sails 0.40% protocol fee is a separate, currently-INACTIVE (never
 * raised above 0, `escrow-lifecycle.ts`'s own comment) economic/revenue
 * mechanism with its own reserve/collection machinery
 * (`fee-reserve-math.ts`, `escrow-fee-snapshot.service.ts`). This file
 * NEVER activates, computes, or references it. Miner fee is a physical
 * cost the Bitcoin network itself requires to include a transaction at
 * all — a rail property, present regardless of whether the Sails
 * protocol fee is ever activated.
 *
 * SKIM PROTECTION (mission §16/§20, M8-R's own disclosed weak point):
 * without a bound, "the missing value was execution cost" is an
 * unlimited economic escape hatch — this is what makes a
 * single-beneficiary RELEASE/REFUND's "100% to the sole beneficiary"
 * allocation UN-checkable by a pure ratio comparison alone (any real
 * delivered amount trivially satisfies "100%"). Two INDEPENDENT,
 * deterministic bounds close this, neither requiring a fee-market oracle
 * (mission §15 explicitly forbids introducing one):
 *
 *  1. RATE BOUND — a MULTISIG spend's transaction shape (one witness
 *     input, N outputs, no per-output covenant) is fully known at
 *     Outcome-authorization time from nothing but the ruling's own
 *     beneficiary count. `estimatedVBytesForOutputCount()` is the EXACT,
 *     unmodified formula `multisig.provider.ts` has always used to
 *     estimate its own fee (moved here as the shared, single source of
 *     truth, imported back by that file — never duplicated). Multiplying
 *     that deterministic vsize by an explicit, deployment-wide ceiling
 *     rate (`config.multisig.maxFeeRateSatsPerVByte`) yields a hard
 *     maximum the real, market-rate-derived fee may never exceed —
 *     sized for real fee-market spikes, generous by design.
 *
 *  2. PROPORTIONAL BOUND — a pure rate bound alone scales badly for a
 *     SMALL escrow: a rate generous enough to survive a real fee spike
 *     can still represent a large FRACTION of a tiny trade's total
 *     value, leaving room for a real, bounded skim on a small escrow
 *     even while technically respecting the rate ceiling (found directly
 *     while testing this exact scenario, not assumed). A second,
 *     independent ceiling — the fee may never exceed
 *     `config.multisig.maxFeeProportionOfGrossBasisPoints` of the
 *     escrow's own gross value — closes it. Deliberately generous (a
 *     legitimate on-chain fee is virtually always a tiny fraction of any
 *     real trade's value); this exists to catch a skim, not to
 *     second-guess a normal, if unusually fee-heavy, small trade.
 *
 * DISCLOSED RESIDUAL (found directly while calibrating the default, not
 * assumed): the proportional bound's default (20%,
 * `config.multisig.maxFeeProportionOfGrossBasisPoints`'s own comment has
 * the full derivation) is deliberately loose enough to never reject a
 * real, honest fee-spike settlement on a small escrow — which also means
 * it does NOT catch a moderate (e.g. ~10%) skim on a small escrow. That
 * specific case is honestly indistinguishable from a legitimately high
 * fee during real network congestion without an external fee-market
 * oracle, which mission M8.6 §15 explicitly forbids introducing. This
 * policy closes the EXTREME case (mission §16's own worked example: an
 * attacker claiming 50% of an escrow as "fee") — it does not, and by
 * design cannot, claim fee-market optimality.
 *
 * The EFFECTIVE ceiling is the SMALLER of the two — a fee must be
 * plausible both as a market rate for this transaction's own byte size
 * AND as a small fraction of the value actually being moved. This is
 * FEE POLICY VALIDITY (bounded, checkable) not FEE MARKET OPTIMALITY
 * (this file makes no claim about whether a fee is well-priced,
 * economical, or likely to confirm promptly).
 */
import { config } from '../../config'
import { createHash } from 'crypto'

/**
 * Conservative, documented vByte estimate for a 2-of-3 P2WSH spend — the
 * EXACT formula `multisig.provider.ts`'s own (private, pre-M8.6)
 * `estimateFeeSats()` has always used. Moved here so both the real
 * transaction construction AND this file's independent bound share one
 * canonical source (INV-OP-9's own "exactly one normative algorithm"
 * principle) rather than two copies that could silently drift.
 */
export function estimatedVBytesForOutputCount(outputCount: number): number {
  return 11 + 110 + 43 * outputCount
}

/**
 * The hard ceiling: no legitimate MULTISIG execution cost may ever
 * imply a fee exceeding the LARGER of (a) `config.multisig.minFeeFloorSats`
 * (an absolute floor, so a legitimately tiny escrow's own real,
 * honest fee — e.g. a dust-policy test fixture — is never rejected
 * merely because it represents a large percentage of a very small
 * total) and (b) the SMALLER of the deterministic rate bound for a
 * transaction of this shape and a generous proportional bound of the
 * escrow's own gross value — see this file's own header for why both
 * (b)'s components are necessary together. Deterministic given only
 * `outputCount` (derivable from the authorized Outcome's own allocation
 * count) and `grossSats` (the escrow's own committed, pre-dispute
 * funding amount) — no live data, no oracle.
 */
export function maxExecutionCostSats(outputCount: number, grossSats: bigint): bigint {
  const rateBound = BigInt(Math.ceil(config.multisig.maxFeeRateSatsPerVByte * estimatedVBytesForOutputCount(outputCount)))
  const proportionalBound = (grossSats * BigInt(config.multisig.maxFeeProportionOfGrossBasisPoints)) / 10000n
  const tightest = rateBound < proportionalBound ? rateBound : proportionalBound
  const floor = BigInt(config.multisig.minFeeFloorSats)
  return tightest > floor ? tightest : floor
}

export type DistributableDerivation =
  | { readonly ok: true; readonly distributable: bigint; readonly impliedFeeSats: bigint }
  | { readonly ok: false; readonly reason: string }

/**
 * The central check this whole file exists for. Given the AUTHORIZED
 * gross total (from the durable Outcome, never from the observation
 * itself — the independent anchor that makes this non-tautological) and
 * the REAL total actually delivered across every beneficiary (observed
 * from the real, decoded transaction), derives the implied execution
 * cost and verifies it is a NON-NEGATIVE value not exceeding the
 * deterministic ceiling for this transaction's own known shape.
 *
 * Never used to determine WHO gets what — only whether the total
 * (gross - deliveredTotal) gap is explicable as legitimate rail cost.
 * The actual per-beneficiary ratio check (does each beneficiary's own
 * delivered amount match `allocateExactUnitsOverTotal(content,
 * distributable)` exactly) is a SEPARATE, subsequent check — this
 * function only answers "is the gap itself plausible," not "was it
 * distributed correctly."
 */
export function deriveDistributableTotal(grossSats: bigint, deliveredTotalSats: bigint, outputCount: number): DistributableDerivation {
  const impliedFeeSats = grossSats - deliveredTotalSats
  if (impliedFeeSats < 0n) {
    return { ok: false, reason: `delivered total (${deliveredTotalSats} sats) exceeds the authorized gross entitlement (${grossSats} sats) — impossible under conservation` }
  }
  const ceiling = maxExecutionCostSats(outputCount, grossSats)
  if (impliedFeeSats > ceiling) {
    return {
      ok: false,
      reason: `implied execution cost (${impliedFeeSats} sats, gross ${grossSats} minus delivered ${deliveredTotalSats}) exceeds the deterministic ceiling for a ${outputCount}-output MULTISIG spend (${ceiling} sats — the smaller of ${config.multisig.maxFeeRateSatsPerVByte} sat/vB and ${config.multisig.maxFeeProportionOfGrossBasisPoints / 100}% of gross) — refusing to accept an unexplained gap this large as legitimate rail cost`,
    }
  }
  return { ok: true, distributable: deliveredTotalSats, impliedFeeSats }
}

/**
 * Sails Core Implementation Program M9-R (Recovery Closure), Part 6 —
 * closes R5 (found during the M9 analytical gate: replaying
 * correspondence for an old execution could silently use whatever
 * execution-cost bounds happen to be configured NOW, not the ones in
 * force when that execution actually happened).
 *
 * FIRST DISTINGUISHES semantic input from operational configuration, per
 * the mission's own explicit test: "could changing this value cause the
 * SAME historical Outcome and SAME historical execution to produce a
 * DIFFERENT CorrespondenceResult?" For every value this file's own
 * `maxExecutionCostSats()` reads:
 *   - `maxFeeRateSatsPerVByte`   — YES: directly gates what counts as a
 *     legitimate fee; a looser/tighter rate changes MATCH vs DIVERGENT
 *     for the exact same real transaction.
 *   - `maxFeeProportionOfGrossBasisPoints` — YES: same reasoning.
 *   - `minFeeFloorSats`         — YES: same reasoning.
 * All three are SEMANTIC INPUTS and are bound into this identity.
 * `config.multisig.network`/`explorerApiUrl` are DELIBERATELY EXCLUDED —
 * changing which chain/explorer is queried is an operational deployment
 * concern (and would break approximately everything else in this system
 * far more severely than correspondence replay specifically), never a
 * value whose change is meant to reinterpret what an ALREADY-DECODED,
 * FIXED `rawTxHex`'s outputs mean relative to a FIXED historical Outcome.
 * Arbitrary environment variables are never swept in wholesale — only
 * the three named values that actually participate in
 * `maxExecutionCostSats()`'s own ceiling computation.
 *
 * A deterministic hash (not a manually-bumped version string) — so an
 * operator changing any of these three env vars WITHOUT a corresponding
 * code change automatically produces a new, distinguishable identity,
 * rather than silently sharing the old one and defeating the whole point
 * of historical binding. "Prefer a versioned/referenceable... identity if
 * sufficient" (mission's own wording) — this is that identity: sufficient
 * because it is a pure, reproducible function of exactly the semantic
 * inputs identified above, never a manually-maintained number that could
 * drift out of sync with what actually changed.
 */
export function computeExecutionCostPolicyIdentity(): string {
  const semanticInputs = {
    maxFeeRateSatsPerVByte: config.multisig.maxFeeRateSatsPerVByte,
    maxFeeProportionOfGrossBasisPoints: config.multisig.maxFeeProportionOfGrossBasisPoints,
    minFeeFloorSats: config.multisig.minFeeFloorSats,
  }
  return createHash('sha256').update(JSON.stringify(semanticInputs)).digest('hex').slice(0, 32)
}
