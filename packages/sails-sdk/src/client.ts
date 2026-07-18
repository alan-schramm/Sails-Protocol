/**
 * @sails/sdk — SailsClient (SDK_GUIDE.md section 2)
 *
 * The single object a wallet imports. Internally composed of the four
 * layers SDK_GUIDE.md section 4B specifies (Transport at the bottom,
 * Protocol SDK modules in the middle, the Intent facade above them).
 * A Capability SDK layer (`client.capabilities`) was added by
 * rfcs/RFC-013-capability-registry-and-wallet-adapter.md, once the
 * Capability Registry it calls into (`src/core/capability-registry.ts`)
 * stopped being a stub — adding it before that RFC would have been
 * exactly the "logic that isn't already in a module's service layer"
 * SDK_GUIDE.md section 1 calls a design smell; it's real now.
 */
import { SailsTransport, type SailsTransportOptions } from './transport'
import { SailsIdentityModule } from './modules/identity'
import { SailsReputationModule } from './modules/reputation'
import { SailsLiquidityModule } from './modules/liquidity'
import { SailsOpenP2PModule } from './modules/openp2p'
import { SailsSettlementModule } from './modules/settlement'
import { SailsPeersModule } from './modules/peers'
import { SailsCapabilitiesModule } from './modules/capabilities'
import { SailsIntentFacade } from './intent-facade'
import type { WalletAdapter } from './wallet-adapter'

export interface SailsClientOptions {
  /** e.g. 'http://localhost:3000' — never hardcoded (SDK_GUIDE.md section 6). */
  baseUrl: string
  fetchImpl?: typeof fetch
  webSocketImpl?: typeof WebSocket
  // RFC-013 — optional: every v0.1 module already works without one
  // (HTTP/WS only, never a private key). Supplying one unlocks
  // capabilities.registerFromWallet() and is where a wallet's own
  // signing stack (WDK-based or otherwise) plugs in going forward.
  wallet?: WalletAdapter
}

export class SailsClient {
  private readonly transport: SailsTransport

  readonly identity: SailsIdentityModule
  readonly reputation: SailsReputationModule
  readonly liquidity: SailsLiquidityModule
  readonly openp2p: SailsOpenP2PModule
  readonly settlement: SailsSettlementModule
  readonly peers: SailsPeersModule
  readonly capabilities: SailsCapabilitiesModule
  readonly wallet?: WalletAdapter
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
    this.capabilities = new SailsCapabilitiesModule(this.transport)
    this.intents = new SailsIntentFacade(this.transport)
    if (options.wallet) this.wallet = options.wallet
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
