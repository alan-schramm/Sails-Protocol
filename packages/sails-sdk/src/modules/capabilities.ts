/**
 * @sails/sdk — Capability declaration module (verified against
 * src/modules/open-agents/capability.routes.ts directly).
 *
 * rfcs/RFC-013-capability-registry-and-wallet-adapter.md. Self-issued
 * grants only, matching the real route's current scope — a caller
 * declares and grants themselves scope over their own capabilities.
 */
import type { SailsTransport } from '../transport'
import type { CapabilityGrant } from '../types'
import type { WalletAdapter } from '../wallet-adapter'

export interface RegisterCapabilityInput {
  capabilityName: string
  scope: string[]
  constraints?: Record<string, unknown>
}

export class SailsCapabilitiesModule {
  constructor(private readonly transport: SailsTransport) {}

  /** Requires an active session. */
  async register(input: RegisterCapabilityInput): Promise<CapabilityGrant> {
    return this.transport.post<CapabilityGrant>('/v1/capabilities/register', input, true)
  }

  async list(participantId: string): Promise<CapabilityGrant[]> {
    return this.transport.get<CapabilityGrant[]>(`/v1/capabilities/${participantId}`)
  }

  /** Requires an active session. */
  async revoke(grantId: string): Promise<void> {
    await this.transport.post(`/v1/capabilities/${grantId}/revoke`, undefined, true)
  }

  /**
   * Convenience: registers a `trade-coordination` grant scoped to
   * exactly what `wallet.getCapabilities()` declares, without the caller
   * re-assembling the declaration into a register() call by hand —
   * SDK_GUIDE.md section 1's "one typed client" promise, applied to this
   * module the same way `identity.authenticate()` composes three raw
   * calls into one for the challenge-response flow.
   */
  async registerFromWallet(wallet: WalletAdapter): Promise<CapabilityGrant> {
    const declared = await wallet.getCapabilities()
    const scope: string[] = []
    if (declared.supportsP2PTrading) scope.push('trade-coordination')
    if (declared.supportsOnchainSettlement) scope.push('settlement')
    return this.register({
      capabilityName: 'trade-coordination',
      scope,
      constraints: { assets: declared.assets, fiatRails: declared.fiatRails },
    })
  }
}
