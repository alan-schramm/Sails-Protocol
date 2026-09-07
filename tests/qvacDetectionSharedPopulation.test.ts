/**
 * F8 (docs/TECHNICAL_DEBT_AUDIT.md #54, CTO Gate correction 2026-09-07)
 * — proves the property the Gate correction specifically required:
 * sails_qvac_detection_invocations_total and
 * sails_qvac_detection_failures_total{path="social_engineering"} share
 * ONE population across their real split-file wiring (the invocation
 * increment lives in social-engineering-agent.ts's evaluate(), the
 * failure increment lives one layer up in handlers.ts's catch around
 * that same call). Every other test file mocks one side of that split
 * (tests/socialEngineeringAgent.test.ts calls evaluate() directly,
 * never touching handlers.ts's catch; tests/socialEngineeringDetection.test.ts
 * mocks social-engineering-agent.ts entirely) — neither can prove the
 * two counters stay consistent with each other for real. This file
 * mocks only @qvac/sdk and the database, wiring the REAL
 * social-engineering-agent.ts through the REAL handlers.ts reaction.
 */
export {} // same forced-module reasoning as every other test file here

let socialEngineeringDetection = true
jest.mock('../src/config', () => ({
  get config() {
    return { features: { autoSettleOnMatch: false, socialEngineeringDetection } }
  },
}))

const mockCompletion = jest.fn()
jest.mock('@qvac/sdk', () => ({
  loadModel: jest.fn().mockResolvedValue('fake-model-id'),
  completion: (...args: unknown[]) => mockCompletion(...args),
  unloadModel: jest.fn().mockResolvedValue(undefined),
  LLAMA_3_2_1B_INST_Q4_0: { name: 'LLAMA_3_2_1B_INST_Q4_0' },
}))

function fakeCompletionRun(contentText: string) {
  return { final: Promise.resolve({ contentText }) }
}

let durableEvents: any[] = []
const mockDurableEventRecordDelegate = {
  create: jest.fn(async (args: any) => { const row = { ...args.data }; durableEvents.push(row); return row }),
  findFirst: jest.fn(async (args: any) => {
    const matching = durableEvents.filter((e) => e.correlationId === args.where.correlationId)
    return matching.length === 0 ? null : matching[matching.length - 1]
  }),
  findMany: jest.fn(async (args: any) => durableEvents.filter((e) => e.correlationId === args.where.correlationId)),
}
const mockTransaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
  callback({ durableEventRecord: mockDurableEventRecordDelegate, $executeRaw: jest.fn().mockResolvedValue(0) })
)

// Trade lookup for buildTradeStateContext() (real trade-repository.ts,
// NOT mocked — only its underlying prisma.trade.findUnique is). Toggled
// per-test between resolving (context prep succeeds) and rejecting
// (context prep fails, before QVAC is ever reached).
let tradeLookupShouldFail = false
const mockTradeFindUnique = jest.fn(async () => {
  if (tradeLookupShouldFail) throw new Error('database unavailable')
  return null // no real trade found — buildTradeStateContext() returns undefined, same as every other test's default case
})

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: { update: jest.fn(), findUnique: () => mockTradeFindUnique() },
    dispute: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { update: jest.fn() },
    durableEventRecord: mockDurableEventRecordDelegate,
    $transaction: (...args: unknown[]) => mockTransaction(...(args as [any])),
  },
}))

jest.mock('../src/modules/open-settlement/settlement-orchestrator', () => ({ executeSettlement: jest.fn() }))
jest.mock('../src/modules/open-settlement/wdk-settlement.provider', () => ({
  wdkSettlementProvider: { getAccountAddress: jest.fn() },
  buyerIndexFor: jest.fn(),
}))
jest.mock('../src/modules/open-p2p/reconciliation.service', () => ({
  reconciliationService: { reconcilePeerPair: jest.fn().mockResolvedValue([]) },
}))
jest.mock('../src/modules/open-p2p/chat-room-registry', () => ({ broadcastToTrade: jest.fn() }))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerEventHandlers } = require('../src/common/events/handlers')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { eventBus } = require('../src/common/events/event-bus')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { metricsRegistry } = require('../src/common/metrics')

async function invocations(): Promise<number> {
  const m = await metricsRegistry.getSingleMetricAsString('sails_qvac_detection_invocations_total')
  return Number(m.match(/path="social_engineering"\} (\d+)/)?.[1] ?? 0)
}
async function failures(): Promise<number> {
  const m = await metricsRegistry.getSingleMetricAsString('sails_qvac_detection_failures_total')
  return Number(m.match(/path="social_engineering"\} (\d+)/)?.[1] ?? 0)
}

function messagePayload(eventId: string, content: string) {
  return { messageId: eventId, tradeId: 'trade-1', senderId: 'u1', content, msgType: 'TEXT', timestamp: '2026-01-01T00:00:00.000Z' }
}

// eventBus.emit()'s returned promise resolves once the event is durably
// published — it does not wait for an onDurable subscriber's own async
// body (registerEventHandlers()'s socialEngineeringDetection reaction is
// itself async) to finish running. Same "flush" pattern
// tests/offerContentScreening.test.ts already uses for its own
// fire-and-forget async reaction.
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('sails_qvac_detection_{invocations,failures}_total share one population (social_engineering, real wiring)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    durableEvents = []
    tradeLookupShouldFail = false
    socialEngineeringDetection = true
    metricsRegistry.resetMetrics()
    registerEventHandlers()
  })

  it('failures never exceeds invocations across a mixed batch: clean, threat, context-prep failure, provider failure', async () => {
    // 1. clean
    mockCompletion.mockReturnValueOnce(fakeCompletionRun(JSON.stringify({ pattern: 'none', riskScore: 0, reasoning: 'ok' })))
    await eventBus.emit('openp2p.message.sent', messagePayload('e1', 'clean message'), 'trade-1')
    await flush()
    expect(await invocations()).toBe(1)
    expect(await failures()).toBe(0)

    // 2. threat
    mockCompletion.mockReturnValueOnce(
      fakeCompletionRun(JSON.stringify({ pattern: 'off_channel_migration', riskScore: 80, reasoning: 'moved to whatsapp' }))
    )
    await eventBus.emit('openp2p.message.sent', messagePayload('e2', 'lets talk on whatsapp'), 'trade-1')
    await flush()
    expect(await invocations()).toBe(2)
    expect(await failures()).toBe(0)

    // 3. context-preparation failure — QVAC never reached
    tradeLookupShouldFail = true
    await eventBus.emit('openp2p.message.sent', messagePayload('e3', 'another message'), 'trade-1')
    await flush()
    tradeLookupShouldFail = false
    expect(await invocations()).toBe(3)
    expect(await failures()).toBe(1)
    expect(mockCompletion).toHaveBeenCalledTimes(2) // still only the 2 real calls from steps 1-2

    // 4. QVAC provider failure
    mockCompletion.mockImplementationOnce(() => { throw new Error('model unavailable') })
    await eventBus.emit('openp2p.message.sent', messagePayload('e4', 'yet another message'), 'trade-1')
    await flush()
    expect(await invocations()).toBe(4)
    expect(await failures()).toBe(2)

    // The property the CTO Gate correction requires: for every evaluated
    // item, failures never exceeds invocations within this path.
    expect(await failures()).toBeLessThanOrEqual(await invocations())
  })

  it('a filtered-out event (empty content) increments neither counter', async () => {
    await eventBus.emit('openp2p.message.sent', messagePayload('e5', ''), 'trade-1')
    await flush()
    expect(await invocations()).toBe(0)
    expect(await failures()).toBe(0)
    expect(mockCompletion).not.toHaveBeenCalled()
  })
})
