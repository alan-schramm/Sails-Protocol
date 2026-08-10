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
 * All three of D7's named patterns are implemented for real, as of
 * 2026-08-09 (closing RFC-017's own "Alternatives Considered #5"
 * deferral). off_channel_migration/payment_instruction_change are
 * readable from message text alone (qvac-agent.provider.ts's
 * `assessSocialEngineeringRisk()`). `unexpected_flow_deviation` needed
 * real state-machine awareness — what's genuinely happened for THIS
 * trade, not what a message claims — so `evaluate()` now fetches the
 * trade's real status via `TradeRepository.findByIdWithEscrow()` (the
 * same repository trade.service.ts/reconciliation.service.ts already
 * use) and passes a short factual summary into the QVAC prompt as
 * ground truth. A message claiming "já paguei, libera" while the real
 * escrow status is still FUNDS_LOCKED (no PAYMENT_PENDING transition —
 * escrow.service.ts's markPaymentSent()) is now genuinely detectable;
 * a message consistent with the real status, or with no trade-progress
 * claim at all, correctly is not flagged (the model is explicitly told
 * to only flag a real contradiction, never to guess).
 */
import { qvacAgentProvider, type QvacAgentProvider } from './qvac-agent.provider'
import { getTimeline, type TimelineEntry } from '../../core/timeline'
import { tradeRepository, type TradeRepository } from '../open-p2p/trade-repository'

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

// Plain-English gloss per EscrowStatus (prisma/schema.prisma) — same
// "deliberately plain, no jargon a small model might latch onto instead
// of reasoning" discipline qvac-agent.provider.ts's own prompts already
// follow. Only the statuses relevant to a buyer/seller chat claim need
// one; COMPLETED/REFUNDED/SPLIT/DISPUTED are terminal-ish states a
// still-open chat rarely needs glossed, but included for completeness
// since a message can still arrive after them.
const ESCROW_STATUS_GLOSS: Record<string, string> = {
  CREATED: 'escrow created, funds not locked yet',
  FUNDS_LOCKED: 'funds locked, payment not yet marked as sent by the buyer',
  PAYMENT_PENDING: 'buyer has marked payment as sent, awaiting seller confirmation to release',
  COMPLETED: 'funds already released to the seller — trade is done',
  DISPUTED: 'trade is in dispute — an arbiter is involved',
  REFUNDED: 'funds already refunded to the buyer — trade is over',
  SPLIT: 'funds already split between buyer and seller by dispute ruling — trade is over',
}

export class SocialEngineeringAgent {
  constructor(
    private readonly provider: QvacAgentProvider = qvacAgentProvider,
    private readonly tradeRepo: TradeRepository = tradeRepository
  ) {}

  async evaluate(event: TimelineEntry): Promise<RiskSignal | null> {
    if (event.eventType !== 'openp2p.message.sent') return null

    const payload = event.payload as { tradeId: string; content: string }
    if (!payload.content?.trim()) return null // empty content = a media (IMAGE/VIDEO) message, nothing to analyze

    const recentContext = await this.recentMessageContext(payload.tradeId, event.eventId)
    const tradeStateContext = await this.buildTradeStateContext(payload.tradeId)
    const signal = await this.provider.assessSocialEngineeringRisk(payload.content, recentContext, tradeStateContext)
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

  // Real ground truth for unexpected_flow_deviation — undefined (not a
  // guessed/empty string) when the trade can't be found, so the caller's
  // own prompt instruction ("never flag ... if no real trade status is
  // given") applies rather than silently comparing against nothing.
  private async buildTradeStateContext(tradeId: string): Promise<string | undefined> {
    const trade = await this.tradeRepo.findByIdWithEscrow(tradeId)
    if (!trade) return undefined

    const escrowClause = trade.escrow ? ESCROW_STATUS_GLOSS[trade.escrow.status] ?? trade.escrow.status : 'no escrow created yet'
    return `Trade status ${trade.status}; escrow status: ${escrowClause}.`
  }
}

export const socialEngineeringAgent = new SocialEngineeringAgent()
