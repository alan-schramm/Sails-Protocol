/**
 * @satsails/p2p-trading-sdk — Arbitration module (RFC-021 D2, verified against
 * src/modules/open-settlement/settlement.routes.ts's new
 * /v1/settlement/arbitration/* routes directly).
 *
 * Permissionless arbiter registration — any authenticated participant
 * may call `register()` for themselves, no approval step. This is
 * additive to `settlement`'s existing `dispute()`/`resolveDispute()` —
 * an application only needs this module if it wants participants to be
 * able to become arbiters via `MarketArbitrationProvider`
 * (`config.settlement.arbitrationMode === 'market'` on the server); a
 * deployment using the original `TrustedArbitratorProvider` allowlist
 * has no use for it.
 */
import type { SailsTransport } from '../transport'

export interface ArbiterCandidate {
  participantId: string
  monetaryCollateral: string
  collateralAsset: string | null
  arbiterReputation: number
  effectiveStake: number
}

export class SailsArbitrationModule {
  constructor(private readonly transport: SailsTransport) {}

  /** Requires an active session — registers (or tops up) the caller's own ArbiterProfile. */
  async register(monetaryCollateral: string, collateralAsset?: string): Promise<ArbiterCandidate> {
    return this.transport.post<ArbiterCandidate>(
      '/v1/settlement/arbitration/register',
      { monetaryCollateral, collateralAsset },
      true
    )
  }

  /** No active session required. Throws SailsNotFoundError if this participant never registered. */
  async getProfile(participantId: string): Promise<ArbiterCandidate> {
    return this.transport.get<ArbiterCandidate>(`/v1/settlement/arbitration/profile/${participantId}`)
  }
}
