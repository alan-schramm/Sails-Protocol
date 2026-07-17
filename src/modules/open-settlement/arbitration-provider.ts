/**
 * ArbitrationProvider — Sails OpenSettlement Adapter
 * RFC-007 (rfcs/RFC-007-real-world-p2p-requirements.md), decision D4.
 *
 * Specified in RFC-007 but never implemented (BACKLOG.md: 🔲 Not started)
 * until now (04-Deepseek Review.md's raiseDispute() task). Deliberately
 * not called "Guardian" or any protocol-native role — RFC-007's own
 * reasoning: the protocol defines the interface, each application
 * registers its own Trusted Arbitrators, the protocol itself never
 * arbitrates or claims authority over the outcome.
 *
 * Unlike RedisStreamsEventStore/StubLightsparkClient, this ships as a
 * real, working implementation — `assign()` is simple, local,
 * deterministic logic with no external dependency to verify against, not
 * an unverifiable third-party API call.
 *
 * Refined from RFC-007 D4's original interface: that RFC's `rule()`
 * signature (`rule(disputeId, arbiterId): Promise<Dispute['ruling']>`)
 * implied the provider computes a ruling — but a Trusted Arbitrator's
 * ruling is a human decision, an external input, not something this
 * provider can compute. `rule()` is dropped; `dispute.service.ts`'s
 * `resolveDispute()` is the real entry point for an arbiter's decision,
 * taking `ruling` as a parameter rather than deriving it.
 */

export interface ArbitrationProvider {
  name: string
  // Registers a per-application list of trusted arbiters — RFC-007's
  // "each wallet/application registers its own Trusted Arbitrators," not
  // a protocol-wide list.
  arbitrators: string[]
  assign(disputeId: string, tradeId: string): Promise<string>
}

/**
 * Simple round-robin assignment across the configured trusted-arbiter
 * list. Deterministic, real, and fully testable — no external I/O.
 */
export class TrustedArbitratorProvider implements ArbitrationProvider {
  name = 'trusted-arbitrator-list'
  private cursor = 0

  constructor(public readonly arbitrators: string[]) {
    if (arbitrators.length === 0) {
      throw new Error('TrustedArbitratorProvider requires at least one configured arbiter')
    }
  }

  async assign(_disputeId: string, _tradeId: string): Promise<string> {
    const arbiterId = this.arbitrators[this.cursor % this.arbitrators.length]
    this.cursor++
    return arbiterId
  }
}
