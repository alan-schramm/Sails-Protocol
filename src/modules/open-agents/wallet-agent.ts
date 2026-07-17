/**
 * Sails OpenAgents — WalletAgent (base class)
 *
 * A local agent simulating a Satsails Wallet instance acting
 * autonomously on a participant's behalf — the shape `Intent`'s own
 * `agentId?` field (common/types/intent.ts, already frozen since
 * Protocol Freeze v8.8, threaded through by `core/intent-engine.ts`'s
 * `create()`) was designed for. `BuyerAgent`/`SellerAgent` extend this
 * with the specific autonomous capability each side needs.
 *
 * Each agent holds a `participantId` (a real registered `User`, via
 * `identity.service.ts`) and shares one `QvacAgentProvider` instance —
 * model loading is expensive (first call downloads ~737MB), so two
 * agents in the same process load the model once, not twice.
 */
import type { QvacAgentProvider } from './qvac-agent.provider'

export interface WalletAgentConfig {
  participantId: string
  label: string
}

export abstract class WalletAgent {
  readonly participantId: string
  readonly label: string
  protected readonly provider: QvacAgentProvider

  constructor(provider: QvacAgentProvider, config: WalletAgentConfig) {
    this.provider = provider
    this.participantId = config.participantId
    this.label = config.label
  }

  // A stable agentId distinct from participantId — the field records
  // *which agent* acted on a participant's behalf (Intent.agentId), not
  // *who* the participant is (Intent.participantId). Two different
  // agents could in principle act for the same participant; keeping
  // them as separate identifiers is what makes that distinguishable
  // later, even though this pass only ever has one agent per participant.
  get agentId(): string {
    return `agent:${this.label}:${this.participantId}`
  }
}
