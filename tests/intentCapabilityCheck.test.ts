/**
 * RFC-014's first real capability-registry.ts caller: intentEngine.create()
 * for TradeIntent. Gated behind config.features.enforceCapabilities
 * (default false) — same "mock config with a mutable getter" pattern
 * tests/autoSettleHandler.test.ts already established for testing a
 * config-gated code path without needing a real env var per test. A
 * separate file from settlementCapabilityCheck.test.ts (not one combined
 * file) because jest.mock() calls are hoisted to module scope regardless
 * of which describe block they're written in — two conflicting mocks of
 * ../src/common/database in one file would silently collide.
 */
export {} // see chatUnification.test.ts's identical comment

let enforceCapabilities = false
jest.mock('../src/config', () => ({
  get config() {
    return { features: { enforceCapabilities } }
  },
}))

const mockCheck = jest.fn()
jest.mock('../src/core/capability-registry', () => ({
  capabilityRegistry: { check: (...args: unknown[]) => mockCheck(...args) },
  CAPABILITY_IMPLEMENTATIONS: { openp2p: 'trade-coordination', opensettlement: 'settlement' },
}))

const mockIntentCreate = jest.fn()
const mockIntentFindUnique = jest.fn()
const mockIntentUpdate = jest.fn()
const mockIntentEventCreate = jest.fn()
const mockIntentEventFindFirst = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    intent: {
      create: (...args: unknown[]) => mockIntentCreate(...args),
      findUnique: (...args: unknown[]) => mockIntentFindUnique(...args),
      update: (...args: unknown[]) => mockIntentUpdate(...args),
    },
    intentEvent: {
      create: (...args: unknown[]) => mockIntentEventCreate(...args),
      findFirst: (...args: unknown[]) => mockIntentEventFindFirst(...args),
    },
  },
}))

const mockEmit = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { intentEngine } = require('../src/core/intent-engine')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OpenP2PTradeIntentHandler } = require('../src/modules/open-p2p/intent-handler')

// RFC-018 Phase 3 — validateStructure() delegates to whichever handler is
// registered for the Intent type; register the real one here the same
// way app.ts's buildApp() does at real boot.
intentEngine.registerHandler(OpenP2PTradeIntentHandler)

const payload = { asset: 'BTC', side: 'BUY' as const, maxValue: '0.5', minValue: '0.01' }

describe('intentEngine.create() — RFC-014 capability check (TradeIntent)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    enforceCapabilities = false
    mockIntentEventFindFirst.mockResolvedValue(null)
    mockIntentCreate.mockResolvedValue({
      id: 'intent-1', type: 'TradeIntent', participantId: 'user-1', moduleId: 'openp2p',
      status: 'CREATED', payload,
    })
    mockIntentFindUnique
      .mockResolvedValueOnce({ id: 'intent-1', status: 'CREATED', moduleId: 'openp2p', payload })
      .mockResolvedValueOnce({ id: 'intent-1', status: 'VALIDATED', moduleId: 'openp2p', payload })
      .mockResolvedValueOnce({ id: 'intent-1', status: 'VALIDATED', moduleId: 'openp2p', payload })
    mockIntentUpdate.mockResolvedValue({ id: 'intent-1', status: 'COORDINATED' })
  })

  it('never calls capabilityRegistry.check when enforceCapabilities is false (the default)', async () => {
    enforceCapabilities = false
    await intentEngine.create('TradeIntent', payload, 'user-1')
    expect(mockCheck).not.toHaveBeenCalled()
    expect(mockIntentCreate).toHaveBeenCalled()
  })

  it('rejects with ForbiddenError, before ever calling Prisma, when enforcement is on and no grant covers it', async () => {
    enforceCapabilities = true
    mockCheck.mockResolvedValue(false)

    await expect(intentEngine.create('TradeIntent', payload, 'user-1')).rejects.toThrow(
      /no active 'trade-coordination' capability grant/
    )
    expect(mockCheck).toHaveBeenCalledWith('user-1', 'trade-coordination', 'intent.created')
    expect(mockIntentCreate).not.toHaveBeenCalled()
  })

  it('proceeds normally when enforcement is on and a grant covers it', async () => {
    enforceCapabilities = true
    mockCheck.mockResolvedValue(true)

    const intent = await intentEngine.create('TradeIntent', payload, 'user-1')
    expect(intent.status).toBe('COORDINATED')
    expect(mockCheck).toHaveBeenCalledWith('user-1', 'trade-coordination', 'intent.created')
    expect(mockIntentCreate).toHaveBeenCalled()
  })
})
