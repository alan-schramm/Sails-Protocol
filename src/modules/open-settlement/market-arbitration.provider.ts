/**
 * MarketArbitrationProvider — Sails OpenSettlement Adapter
 * RFC-021 D1-D3 (`docs/rfcs/RFC-021-market-based-arbitration-and-payment-trust.md`).
 *
 * Replaces (does not remove — see below) `TrustedArbitratorProvider`'s
 * static, application-curated `TRUSTED_ARBITRATORS` allowlist with
 * permissionless registration: any participant may become an arbiter
 * candidate by posting collateral, and eligibility/selection for a given
 * dispute is a function of `effectiveStake` (monetary collateral +
 * reputation-at-risk), not a fixed list anyone approves.
 *
 * Implements the exact `ArbitrationProvider` interface RFC-007 D4 already
 * defined (`arbitration-provider.ts`) — `DisputeService` needs zero code
 * changes; `assign()` is the only method it calls. `TrustedArbitratorProvider`
 * is not deleted: a deployment that wants a curated, closed arbiter set
 * (e.g. a regulated context) can still choose it via
 * `config.settlement.arbitrationMode` — see `settlement.routes.ts`'s
 * `getDisputeService()`.
 *
 * D1's load-bearing legal framing, unchanged by this provider: an arbiter
 * never moves funds directly. `assign()` only returns a participantId;
 * `dispute.service.ts`'s `resolveDispute()` writes `Dispute.ruling`, and
 * it is *that* write `escrowService.releaseFunds()`/`refundFunds()` react
 * to — verified directly in that file before writing this one, not
 * assumed.
 */
import { prisma } from '../../common/database'
import { EscrowError } from '../../common/errors'
import { AssetType } from '../../common/types'
import type { ArbitrationProvider } from './arbitration-provider'

// RFC-021 D3 — starting parameters. Explicitly not claimed as final
// (PROTOCOL_ECONOMY.md §7's own "not fixed forever" precedent for every
// economic parameter in this codebase).
//
// REPUTATION_STAKE_FACTOR: each arbiterReputation point counts as this
// fraction of one notional collateral unit toward effectiveStake — e.g.
// an arbiter with 100 reputation and 0 collateral has the same
// effectiveStake as one who posted 1 unit of real collateral. Low on
// purpose: reputation alone should let an arbiter compete for small
// disputes, not instantly out-collateralize someone with real capital.
export const REPUTATION_STAKE_FACTOR = 0.01

// K_ELIGIBILITY — effectiveStake must be at least this multiple of the
// disputed value. 1.5x sits inside the real-world 1.2x-2x range
// bonding/insurance over-collateralization ratios typically use — not
// asserted without that comparison.
export const K_ELIGIBILITY = 1.5

export interface ArbiterCandidate {
  participantId: string
  monetaryCollateral: string // decimal string, RFC-009
  collateralAsset: string | null
  arbiterReputation: number
  effectiveStake: number
}

export class MarketArbitrationProvider implements ArbitrationProvider {
  name = 'market-arbitration'
  // Satisfies the ArbitrationProvider interface's `arbitrators: string[]`
  // field structurally — this provider has no fixed list (that's the
  // entire point of D2), so it always reports empty here. Real candidate
  // discovery goes through eligibleFor()/register() below, not this
  // property; nothing in dispute.service.ts reads it.
  arbitrators: string[] = []

  /**
   * D2 — permissionless registration. No approval step: any participant
   * may call this for themselves. Creates the ArbiterProfile if one
   * doesn't exist yet, or tops up collateral on an existing one.
   */
  async register(participantId: string, monetaryCollateral: string, collateralAsset?: string): Promise<ArbiterCandidate> {
    const existing = await prisma.arbiterProfile.findUnique({ where: { participantId } })

    const profile = existing
      ? await prisma.arbiterProfile.update({
          where: { participantId },
          data: {
            monetaryCollateral: { increment: monetaryCollateral },
            collateralAsset: (collateralAsset as AssetType | undefined) ?? existing.collateralAsset ?? undefined,
          },
        })
      : await prisma.arbiterProfile.create({
          data: {
            participantId,
            monetaryCollateral,
            collateralAsset: collateralAsset as AssetType | undefined,
          },
        })

    return this.toCandidate(profile)
  }

  async getProfile(participantId: string): Promise<ArbiterCandidate | null> {
    const profile = await prisma.arbiterProfile.findUnique({ where: { participantId } })
    return profile ? this.toCandidate(profile) : null
  }

  private toCandidate(profile: {
    participantId: string
    monetaryCollateral: unknown
    collateralAsset: string | null
    arbiterReputation: number
  }): ArbiterCandidate {
    const monetaryCollateral = Number(profile.monetaryCollateral)
    const effectiveStake = monetaryCollateral + profile.arbiterReputation * REPUTATION_STAKE_FACTOR
    return {
      participantId: profile.participantId,
      monetaryCollateral: String(profile.monetaryCollateral),
      collateralAsset: profile.collateralAsset,
      arbiterReputation: profile.arbiterReputation,
      effectiveStake,
    }
  }

  /**
   * D3 — filters registered candidates to those whose effectiveStake
   * clears K_ELIGIBILITY * disputeValue. disputeValue is a decimal
   * string (RFC-009); Number() here is a bounds comparison only, never
   * stored or propagated as a number — same precedent
   * `policy-engine.ts`'s `validateFinancialSanity` already established.
   */
  async eligibleFor(disputeValue: string): Promise<ArbiterCandidate[]> {
    const profiles = await prisma.arbiterProfile.findMany({ where: { slashedAt: null } })
    const threshold = Number(disputeValue) * K_ELIGIBILITY
    return profiles.map((p) => this.toCandidate(p)).filter((c) => c.effectiveStake >= threshold)
  }

  /**
   * The real assign() the ArbitrationProvider interface requires.
   * Weighted-random selection among eligible candidates, weight =
   * effectiveStake — replaces TrustedArbitratorProvider's round-robin.
   * tradeId isn't needed for this provider's own logic (kept in the
   * signature only to satisfy the shared interface); disputeId is used
   * to look up the dispute's real value so eligibility can be computed
   * against it.
   */
  async assign(disputeId: string, _tradeId: string): Promise<string> {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new EscrowError(`MarketArbitrationProvider: no dispute found for id ${disputeId}`)
    const escrow = await prisma.escrow.findUnique({ where: { id: dispute.escrowId } })
    if (!escrow) throw new EscrowError(`MarketArbitrationProvider: no escrow found for dispute ${disputeId}`)

    const eligible = await this.eligibleFor(String(escrow.lockedAmount))
    if (eligible.length === 0) {
      throw new EscrowError(
        `MarketArbitrationProvider: no registered arbiter clears the ${K_ELIGIBILITY}x eligibility threshold ` +
        `for a dispute of value ${escrow.lockedAmount} — register more collateral/reputation, or configure ` +
        'TRUSTED_ARBITRATORS and set ARBITRATION_MODE=trusted-list instead.'
      )
    }

    return this.weightedRandomPick(eligible)
  }

  private weightedRandomPick(candidates: ArbiterCandidate[]): string {
    const totalWeight = candidates.reduce((sum, c) => sum + c.effectiveStake, 0)
    let roll = Math.random() * totalWeight
    for (const candidate of candidates) {
      roll -= candidate.effectiveStake
      if (roll <= 0) return candidate.participantId
    }
    // Floating-point edge case (roll never went <= 0 due to rounding) —
    // the last candidate is the correct fallback, not an error.
    return candidates[candidates.length - 1].participantId
  }
}

export const marketArbitrationProvider = new MarketArbitrationProvider()
