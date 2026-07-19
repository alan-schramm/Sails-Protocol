/**
 * common/events/handlers.ts's openp2p.message.sent -> SocialEngineering
 * Agent.evaluate() reaction (RFC-017) — verifies it's gated behind
 * config.features.socialEngineeringDetection (default false) rather than
 * running a real QVAC call on every chat message unconditionally, per
 * that handler's own doc comment. Same mocking shape as
 * tests/autoSettleHandler.test.ts for the same reason (config-gated
 * handler reacting to an event, calling a service).
 */
export {} // see autoSettleHandler.test.ts's identical comment

let socialEngineeringDetection = false
jest.mock('../src/config', () => ({
  get config() {
    return { features: { autoSettleOnMatch: false, socialEngineeringDetection } }
  },
}))

const mockEvaluate = jest.fn()
jest.mock('../src/modules/open-agents/social-engineering-agent', () => ({
  socialEngineeringAgent: { evaluate: (...args: unknown[]) => mockEvaluate(...args) },
}))

jest.mock('../src/modules/open-settlement/settlement-orchestrator', () => ({
  executeSettlement: jest.fn(),
}))
jest.mock('../src/modules/open-settlement/wdk-settlement.provider', () => ({
  wdkSettlementProvider: { getAccountAddress: jest.fn() },
  buyerIndexFor: jest.fn(),
}))
jest.mock('../src/common/database', () => ({
  prisma: {
    trade: { update: jest.fn() },
    dispute: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { update: jest.fn() },
  },
}))
jest.mock('../src/modules/open-p2p/reconciliation.service', () => ({
  reconciliationService: { reconcilePeerPair: jest.fn().mockResolvedValue([]) },
}))
jest.mock('../src/modules/open-p2p/chat-room-registry', () => ({
  broadcastToTrade: jest.fn(),
}))

const onHandlers: Record<string, (payload: unknown) => Promise<void> | void> = {}
const onDurableHandlers: Record<string, (event: unknown) => Promise<void> | void> = {}
const mockEmit = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: {
    emit: (...args: unknown[]) => mockEmit(...args),
    on: (event: string, handler: (payload: unknown) => Promise<void> | void) => {
      onHandlers[event] = handler
    },
    onDurable: (event: string, handler: (event: unknown) => Promise<void> | void) => {
      onDurableHandlers[event] = handler
    },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerEventHandlers } = require('../src/common/events/handlers')

const durableMessageEvent = {
  eventId: 'evt-1',
  eventName: 'openp2p.message.sent',
  correlationId: 'trade-1',
  publishedAt: '2026-01-01T00:00:00.000Z',
  payload: {
    messageId: 'm1', tradeId: 'trade-1', senderId: 'u1',
    content: "let's move to whatsapp", msgType: 'TEXT', timestamp: '2026-01-01T00:00:00.000Z',
  },
}

describe('openp2p.message.sent -> SocialEngineeringAgent.evaluate (config-gated detection)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    socialEngineeringDetection = false
    registerEventHandlers()
  })

  it('does nothing when socialEngineeringDetection is false (the default)', async () => {
    socialEngineeringDetection = false
    await onDurableHandlers['openp2p.message.sent'](durableMessageEvent)

    expect(mockEvaluate).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalledWith('agents.social_engineering.risk_detected', expect.anything(), expect.anything())
  })

  it('evaluates the message (as a TimelineEntry) and emits a risk-detected event when a signal is returned', async () => {
    socialEngineeringDetection = true
    mockEvaluate.mockResolvedValueOnce({
      correlationId: 'trade-1',
      pattern: 'off_channel_migration',
      riskScore: 80,
      reasoning: 'Asked to move to WhatsApp.',
      detectedAt: '2026-01-01T00:00:01.000Z',
      sourceEventId: 'evt-1',
    })

    await onDurableHandlers['openp2p.message.sent'](durableMessageEvent)

    expect(mockEvaluate).toHaveBeenCalledWith({
      eventId: 'evt-1',
      eventType: 'openp2p.message.sent',
      occurredAt: '2026-01-01T00:00:00.000Z',
      payload: durableMessageEvent.payload,
    })
    expect(mockEmit).toHaveBeenCalledWith('agents.social_engineering.risk_detected', {
      tradeId: 'trade-1',
      pattern: 'off_channel_migration',
      riskScore: 80,
      reasoning: 'Asked to move to WhatsApp.',
      sourceEventId: 'evt-1',
      detectedAt: '2026-01-01T00:00:01.000Z',
    }, 'trade-1')
  })

  it('emits nothing when evaluate() returns null', async () => {
    socialEngineeringDetection = true
    mockEvaluate.mockResolvedValueOnce(null)

    await onDurableHandlers['openp2p.message.sent'](durableMessageEvent)

    expect(mockEmit).not.toHaveBeenCalledWith('agents.social_engineering.risk_detected', expect.anything(), expect.anything())
  })

  it('does not throw when evaluate() fails — a detection failure must not break message sending', async () => {
    socialEngineeringDetection = true
    mockEvaluate.mockRejectedValueOnce(new Error('QVAC unavailable'))

    await expect(onDurableHandlers['openp2p.message.sent'](durableMessageEvent)).resolves.not.toThrow()
  })
})
