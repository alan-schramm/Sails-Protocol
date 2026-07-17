/**
 * @sails/sdk — SailsClient (SDK_GUIDE.md section 2)
 *
 * The single object a wallet imports. Internally composed of the four
 * layers SDK_GUIDE.md section 4B specifies (Transport at the bottom,
 * Protocol SDK modules in the middle, the Intent facade above them) —
 * a Capability SDK layer is deliberately not built yet: the Capability
 * Registry it would call into (`ARCHITECTURE.md` §1B,
 * `src/core/capability-registry.ts`) is still a stub in the reference
 * implementation itself, so a Capability SDK layer here would have
 * nothing real to check against. Adding one now would be exactly the
 * "logic that isn't already in a module's service layer" SDK_GUIDE.md
 * section 1 calls a design smell.
 */
import { SailsTransport, type SailsTransportOptions } from './transport'
import { SailsIdentityModule } from './modules/identity'
import { SailsReputationModule } from './modules/reputation'
import { SailsLiquidityModule } from './modules/liquidity'
import { SailsOpenP2PModule } from './modules/openp2p'
import { SailsSettlementModule } from './modules/settlement'
import { SailsPeersModule } from './modules/peers'
import { SailsIntentFacade } from './intent-facade'

export interface SailsClientOptions {
  /** e.g. 'http://localhost:3000' — never hardcoded (SDK_GUIDE.md section 6). */
  baseUrl: string
  fetchImpl?: typeof fetch
  webSocketImpl?: typeof WebSocket
}

export class SailsClient {
  private readonly transport: SailsTransport

  readonly identity: SailsIdentityModule
  readonly reputation: SailsReputationModule
  readonly liquidity: SailsLiquidityModule
  readonly openp2p: SailsOpenP2PModule
  readonly settlement: SailsSettlementModule
  readonly peers: SailsPeersModule
  private readonly intents: SailsIntentFacade

  constructor(options: SailsClientOptions) {
    const transportOptions: SailsTransportOptions = { baseUrl: options.baseUrl }
    if (options.fetchImpl) transportOptions.fetchImpl = options.fetchImpl
    if (options.webSocketImpl) transportOptions.webSocketImpl = options.webSocketImpl
    this.transport = new SailsTransport(transportOptions)

    this.identity = new SailsIdentityModule(this.transport)
    this.reputation = new SailsReputationModule(this.transport)
    this.liquidity = new SailsLiquidityModule(this.transport)
    this.openp2p = new SailsOpenP2PModule(this.transport)
    this.settlement = new SailsSettlementModule(this.transport)
    this.peers = new SailsPeersModule(this.transport)
    this.intents = new SailsIntentFacade(this.transport)
  }

  // ── Intent-oriented facade (SDK_GUIDE.md section 2) — delegates to
  // intent-facade.ts; see that file's header for exactly which of these
  // six are genuinely implemented vs. throw SailsNotImplementedError.
  createIntent: SailsIntentFacade['createIntent'] = (...args) => this.intents.createIntent(...args)
  cancelIntent: SailsIntentFacade['cancelIntent'] = (...args) => this.intents.cancelIntent(...args)
  negotiate: SailsIntentFacade['negotiate'] = (...args) => this.intents.negotiate(...args)
  submitProof: SailsIntentFacade['submitProof'] = (...args) => this.intents.submitProof(...args)
  releaseAsset: SailsIntentFacade['releaseAsset'] = (...args) => this.intents.releaseAsset(...args)
  dispute: SailsIntentFacade['dispute'] = (...args) => this.intents.dispute(...args)

  /** Escape hatch for direct/advanced use not covered by a module above. */
  setSessionToken(token: string | null): void {
    this.transport.setSessionToken(token)
  }

  getSessionToken(): string | null {
    return this.transport.getSessionToken()
  }
}
