/**
 * Sails OpenAgents — SocialEngineeringAgent
 * RFC-007 D7 (rfcs/RFC-007-real-world-p2p-requirements.md), real as of
 * RFC-017 (rfcs/RFC-017-timeline-and-social-engineering-agent.md).
 *
 * `evaluate(event)` is D7's own interface, unchanged. A cheap pre-filter
 * runs first — only a chat message with real text content ever reaches
 * QVAC. Every other Timeline event type (escrow/trade status changes,
 * peer connect/disconnect, ...) returns null immediately: neither
 * detectable pattern below can be read from anything but message text,
 * so spending a local-LLM call on them would be pure cost, no signal.
 *
 * Detects, never acts — the same trust boundary as every other agent in
 * this module (qvac-agent.provider.ts's own doc comment). The RiskSignal
 * this produces is a signal, not an action; what happens with it (today:
 * a chat RISK_WARNING — common/events/handlers.ts + chat.routes.ts) is
 * decided elsewhere, exactly matching D7's "the agent detects, it does
 * not act unilaterally."
 *
 * Two of D7's three named patterns are implemented for real
 * (off_channel_migration, payment_instruction_change — both readable
 * from message text with QVAC's help, qvac-agent.provider.ts's
 * `assessSocialEngineeringRisk()`). `unexpected_flow_deviation` is not
 * detected in this pass — it needs real state-machine awareness (what
 * counts as "expected" for a given trade's current status), a
 * meaningfully larger scope than reading one message, and is left as
 * explicit future work rather than faked.
 */
import { qvacAgentProvider, type QvacAgentProvider } from './qvac-agent.provider'
import { getTimeline, type TimelineEntry } from '../../core/timeline'

export type RiskPattern = 'off_channel_migration' | 'payment_instruction_change' | 'unexpected_flow_deviation' | string

export interface RiskSignal {
  correlationId: string
  pattern: RiskPattern
  riskScore: number
  reasoning: string
  detectedAt: string
  sourceEventId: string
}

// How many prior chat messages give QVAC conversational context (e.g. "is
// this the third time this trade's counterparty has pushed toward
// WhatsApp?") — not the whole trade's history, which would grow the
// prompt unboundedly on a long-running negotiation for no added signal.
const CONTEXT_WINDOW = 5

export class SocialEngineeringAgent {
  constructor(private readonly provider: QvacAgentProvider = qvacAgentProvider) {}

  async evaluate(event: TimelineEntry): Promise<RiskSignal | null> {
    if (event.eventType !== 'openp2p.message.sent') return null

    const payload = event.payload as { tradeId: string; content: string }
    if (!payload.content?.trim()) return null // empty content = a media (IMAGE/VIDEO) message, nothing to analyze

    const recentContext = await this.recentMessageContext(payload.tradeId, event.eventId)
    const signal = await this.provider.assessSocialEngineeringRisk(payload.content, recentContext)
    if (signal.pattern === 'none') return null

    return {
      correlationId: payload.tradeId,
      pattern: signal.pattern,
      riskScore: signal.riskScore,
      reasoning: signal.reasoning,
      detectedAt: new Date().toISOString(),
      sourceEventId: event.eventId,
    }
  }

  private async recentMessageContext(tradeId: string, beforeEventId: string): Promise<string[]> {
    const entries = await getTimeline(tradeId).getEvents()
    return entries
      .filter((e) => e.eventType === 'openp2p.message.sent' && e.eventId !== beforeEventId)
      .slice(-CONTEXT_WINDOW)
      .map((e) => (e.payload as { content: string }).content)
  }
}

export const socialEngineeringAgent = new SocialEngineeringAgent()
