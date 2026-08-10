/**
 * SocialEngineeringAgent.evaluate() (RFC-007 D7, real as of RFC-017).
 * @qvac/sdk is mocked the same way tests/walletAgents.test.ts mocks it —
 * verified there is that a live run against the real SDK was already
 * done for this class's shared structuredCompletion() helper
 * (qvac-agent.provider.ts's own doc comment); re-downloading/running a
 * ~737MB model on every `npm test` run isn't viable for CI. What's
 * verified here: the pre-filter (only real chat-message content ever
 * reaches QVAC), the Timeline-context lookup, and turning QVAC's
 * structured output into a RiskSignal.
 */
const mockLoadModel = jest.fn().mockResolvedValue('fake-model-id')
const mockCompletion = jest.fn()
const mockUnloadModel = jest.fn().mockResolvedValue(undefined)

jest.mock('@qvac/sdk', () => ({
  loadModel: (...args: unknown[]) => mockLoadModel(...args),
  completion: (...args: unknown[]) => mockCompletion(...args),
  unloadModel: (...args: unknown[]) => mockUnloadModel(...args),
  LLAMA_3_2_1B_INST_Q4_0: { name: 'LLAMA_3_2_1B_INST_Q4_0' },
}))

function fakeCompletionRun(contentText: string) {
  return { final: Promise.resolve({ contentText }) }
}

import { QvacAgentProvider } from '../src/modules/open-agents/qvac-agent.provider'
import { SocialEngineeringAgent } from '../src/modules/open-agents/social-engineering-agent'
import { eventBus } from '../src/common/events/event-bus'
import type { TimelineEntry } from '../src/core/timeline'
import type { TradeRepository } from '../src/modules/open-p2p/trade-repository'

// No trade found by default — same as every test below wants (they're
// not exercising unexpected_flow_deviation), matching the "constructor
// seam over module-path mocking" convention TradeRepository itself was
// introduced for. A real `tradeRepository` singleton wraps real Prisma —
// injecting a fake here instead of mocking common/database entirely.
function fakeTradeRepo(overrides: Partial<TradeRepository> = {}): TradeRepository {
  return { findByIdWithEscrow: jest.fn().mockResolvedValue(null), ...overrides } as unknown as TradeRepository
}

function messageEntry(tradeId: string, content: string, eventId = 'evt-1'): TimelineEntry {
  return {
    eventId,
    eventType: 'openp2p.message.sent',
    occurredAt: new Date().toISOString(),
    payload: { messageId: 'm1', tradeId, senderId: 'u1', content, msgType: 'TEXT', timestamp: new Date().toISOString() },
    // RFC-008 D2 fields — this agent doesn't consult the hash chain, so
    // fixture values are fine here (real chaining is exercised for real
    // in tests/timeline.test.ts).
    entryHash: 'test-entry-hash',
    prevHash: 'test-prev-hash',
  }
}

describe('SocialEngineeringAgent.evaluate', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns null without calling QVAC for a non-message event type', async () => {
    const agent = new SocialEngineeringAgent(new QvacAgentProvider(), fakeTradeRepo())
    const result = await agent.evaluate({
      eventId: 'e1', eventType: 'settlement.escrow.locked', occurredAt: new Date().toISOString(), payload: {},
      entryHash: 'test-entry-hash', prevHash: 'test-prev-hash',
    })

    expect(result).toBeNull()
    expect(mockCompletion).not.toHaveBeenCalled()
  })

  it('returns null without calling QVAC for an empty-content (media) message', async () => {
    const agent = new SocialEngineeringAgent(new QvacAgentProvider(), fakeTradeRepo())
    const result = await agent.evaluate(messageEntry('trade-x', ''))

    expect(result).toBeNull()
    expect(mockCompletion).not.toHaveBeenCalled()
  })

  it('returns null when QVAC classifies the message as "none"', async () => {
    mockCompletion.mockReturnValueOnce(
      fakeCompletionRun(JSON.stringify({ pattern: 'none', riskScore: 0, reasoning: 'Nothing unusual.' }))
    )
    const agent = new SocialEngineeringAgent(new QvacAgentProvider(), fakeTradeRepo())
    const result = await agent.evaluate(messageEntry('trade-x', 'Sure, sending PIX now.'))

    expect(result).toBeNull()
  })

  it('returns a RiskSignal when QVAC detects off_channel_migration', async () => {
    mockCompletion.mockReturnValueOnce(
      fakeCompletionRun(JSON.stringify({ pattern: 'off_channel_migration', riskScore: 72, reasoning: 'Asked to continue on WhatsApp.' }))
    )
    const agent = new SocialEngineeringAgent(new QvacAgentProvider(), fakeTradeRepo())
    const result = await agent.evaluate(messageEntry('trade-x', "Let's finish this on WhatsApp instead", 'evt-42'))

    expect(result).toEqual({
      correlationId: 'trade-x',
      pattern: 'off_channel_migration',
      riskScore: 72,
      reasoning: 'Asked to continue on WhatsApp.',
      detectedAt: expect.any(String),
      sourceEventId: 'evt-42',
    })
  })

  it('sends the requested schema name and the message text to QVAC', async () => {
    mockCompletion.mockReturnValueOnce(
      fakeCompletionRun(JSON.stringify({ pattern: 'payment_instruction_change', riskScore: 55, reasoning: 'New PIX key given mid-trade.' }))
    )
    const agent = new SocialEngineeringAgent(new QvacAgentProvider(), fakeTradeRepo())
    await agent.evaluate(messageEntry('trade-x', 'Actually send to this new PIX key instead'))

    expect(mockCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: expect.objectContaining({
          type: 'json_schema',
          json_schema: expect.objectContaining({ name: 'social_engineering_signal' }),
        }),
        history: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: expect.stringContaining('new PIX key') }),
        ]),
      })
    )
  })

  it('includes prior messages from the real Timeline as conversational context', async () => {
    const tradeId = `trade-context-${Date.now()}`
    for (let i = 0; i < 3; i++) {
      await eventBus.emit('openp2p.message.sent', {
        messageId: `m${i}`, tradeId, senderId: 'u1', content: `msg ${i}`, msgType: 'TEXT', timestamp: new Date().toISOString(),
      }, tradeId)
    }
    mockCompletion.mockReturnValueOnce(fakeCompletionRun(JSON.stringify({ pattern: 'none', riskScore: 0, reasoning: 'ok' })))

    const agent = new SocialEngineeringAgent(new QvacAgentProvider(), fakeTradeRepo())
    await agent.evaluate(messageEntry(tradeId, 'msg 3', 'evt-current'))

    expect(mockCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: expect.stringContaining('msg 0') }),
        ]),
      })
    )
  })

  describe('unexpected_flow_deviation (real trade-state ground truth)', () => {
    it('passes the real trade/escrow status into the prompt when a trade is found', async () => {
      const repo = fakeTradeRepo({
        findByIdWithEscrow: jest.fn().mockResolvedValue({ status: 'ACTIVE', escrow: { status: 'FUNDS_LOCKED' } }),
      })
      mockCompletion.mockReturnValueOnce(fakeCompletionRun(JSON.stringify({ pattern: 'none', riskScore: 0, reasoning: 'ok' })))

      const agent = new SocialEngineeringAgent(new QvacAgentProvider(), repo)
      await agent.evaluate(messageEntry('trade-x', 'Já paguei, pode liberar!'))

      expect(mockCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          history: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Trade status ACTIVE; escrow status: funds locked, payment not yet marked as sent'),
            }),
          ]),
        })
      )
    })

    it('returns an unexpected_flow_deviation RiskSignal when QVAC detects one', async () => {
      const repo = fakeTradeRepo({
        findByIdWithEscrow: jest.fn().mockResolvedValue({ status: 'ACTIVE', escrow: { status: 'FUNDS_LOCKED' } }),
      })
      mockCompletion.mockReturnValueOnce(
        fakeCompletionRun(JSON.stringify({
          pattern: 'unexpected_flow_deviation',
          riskScore: 80,
          reasoning: 'Buyer claims payment sent, but escrow is still funds-locked with no confirmation.',
        }))
      )

      const agent = new SocialEngineeringAgent(new QvacAgentProvider(), repo)
      const result = await agent.evaluate(messageEntry('trade-x', 'Já paguei, pode liberar!', 'evt-77'))

      expect(result).toEqual({
        correlationId: 'trade-x',
        pattern: 'unexpected_flow_deviation',
        riskScore: 80,
        reasoning: 'Buyer claims payment sent, but escrow is still funds-locked with no confirmation.',
        detectedAt: expect.any(String),
        sourceEventId: 'evt-77',
      })
    })

    it('sends no trade-state line when the trade cannot be found', async () => {
      mockCompletion.mockReturnValueOnce(fakeCompletionRun(JSON.stringify({ pattern: 'none', riskScore: 0, reasoning: 'ok' })))

      const agent = new SocialEngineeringAgent(new QvacAgentProvider(), fakeTradeRepo())
      await agent.evaluate(messageEntry('trade-unknown', 'Já paguei, pode liberar!'))

      const [call] = mockCompletion.mock.calls
      const userMessage = call[0].history.find((m: { role: string }) => m.role === 'user').content
      expect(userMessage).not.toContain('Trade status')
    })
  })
})
