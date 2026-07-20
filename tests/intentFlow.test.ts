/**
 * Intent flow — happy path TDD (03-implementation_plan.md section 4).
 * Envio -> IntentEngine -> PolicyEngine -> StateMachine (Timeline/audit
 * record). No live Postgres in this environment (or in CI, necessarily) —
 * the database layer is mocked so this test verifies the actual business
 * logic (validation order, what gets persisted, what gets emitted), the
 * standard TDD pattern for isolating Core logic from infrastructure. This
 * is a different thing from faking an unverified external integration
 * (Lightspark, Redis Streams) — mocking Prisma here to unit-test
 * intent-engine.ts's own code is legitimate; claiming a Lightspark call
 * works without ever calling it would not be.
 */
import { assertValidTransition, isExpired } from '../src/core/state-machine'
import { validateFinancialSanity } from '../src/core/policy-engine'

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

// Imported after the mocks above so intent-engine.ts picks up the mocked
// prisma/eventBus, not the real ones.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { intentEngine } = require('../src/core/intent-engine')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OpenP2PTradeIntentHandler } = require('../src/modules/open-p2p/intent-handler')

// RFC-018 Phase 3 — validateStructure() now delegates to whichever
// handler is registered for the Intent type, same as app.ts's real boot
// sequence (buildApp()). Registered once here, at module load, since
// intentEngine's handler Map is a module-scoped singleton shared by
// every test in this file.
intentEngine.registerHandler(OpenP2PTradeIntentHandler)

describe('State Machine (pure functions, no mocking needed)', () => {
  it('allows CREATED -> VALIDATED -> COORDINATED -> DISCOVERING -> MATCHED -> NEGOTIATING -> COMMITTED -> SETTLING -> FULFILLED (RFC-012)', () => {
    expect(() => assertValidTransition('CREATED', 'VALIDATED')).not.toThrow()
    expect(() => assertValidTransition('VALIDATED', 'COORDINATED')).not.toThrow()
    expect(() => assertValidTransition('COORDINATED', 'DISCOVERING')).not.toThrow()
    expect(() => assertValidTransition('DISCOVERING', 'MATCHED')).not.toThrow()
    expect(() => assertValidTransition('MATCHED', 'NEGOTIATING')).not.toThrow()
    expect(() => assertValidTransition('NEGOTIATING', 'COMMITTED')).not.toThrow()
    expect(() => assertValidTransition('COMMITTED', 'SETTLING')).not.toThrow()
    expect(() => assertValidTransition('SETTLING', 'FULFILLED')).not.toThrow()
  })

  it('rejects skipping VALIDATED/COORDINATED directly from CREATED to DISCOVERING (RFC-012)', () => {
    expect(() => assertValidTransition('CREATED', 'DISCOVERING')).toThrow(/Invalid Intent transition/)
  })

  it('rejects an invalid transition (e.g. skipping straight to FULFILLED)', () => {
    expect(() => assertValidTransition('CREATED', 'FULFILLED')).toThrow(/Invalid Intent transition/)
  })

  it('flags an Intent past its expiresAt window as expired (Free Option attack defense)', () => {
    const pastWindow = { status: 'COMMITTED' as const, expiresAt: new Date(Date.now() - 1000) }
    expect(isExpired(pastWindow)).toBe(true)
  })

  it('does not flag a terminal-state Intent as expired even past its window', () => {
    const fulfilled = { status: 'FULFILLED' as const, expiresAt: new Date(Date.now() - 1000) }
    expect(isExpired(fulfilled)).toBe(false)
  })
})

describe('Policy Engine — CISO Economic Rule (financial sanity)', () => {
  it('accepts a sane maxValue/minValue range', () => {
    expect(validateFinancialSanity({ maxValue: '0.5', minValue: '0.01' })).toEqual({ valid: true })
  })

  it('rejects a negative amount', () => {
    const result = validateFinancialSanity({ maxValue: '-500' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('maxValue cannot be negative: -500')
  })

  it('rejects minValue exceeding maxValue', () => {
    const result = validateFinancialSanity({ maxValue: '1', minValue: '5' })
    expect(result.valid).toBe(false)
    expect(result.errors?.some((e) => e.includes('cannot exceed'))).toBe(true)
  })
})

describe('Intent Engine — happy path (IntentEngine -> PolicyEngine -> StateMachine -> audit)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates a structurally and financially valid TradeIntent, writes the audit trail, and emits intent.created', async () => {
    mockIntentCreate.mockResolvedValue({
      id: 'intent-1',
      type: 'TradeIntent',
      participantId: 'user-1',
      moduleId: 'openp2p',
      status: 'CREATED',
      payload: { asset: 'BTC', side: 'BUY', maxValue: '0.5', minValue: '0.01' },
    })
    mockIntentEventFindFirst.mockResolvedValue(null) // no prior event -> prevHash = 'genesis'
    // RFC-012: create() now calls transition() twice more (CREATED ->
    // VALIDATED -> COORDINATED), each of which re-reads the Intent from
    // Postgres first — real DB state would show the status the *previous*
    // step just wrote, so the mock returns that in the same order:
    // findUnique #1 (transition to VALIDATED) sees CREATED, #2
    // (coordinationEngine.decide) sees VALIDATED, #3 (transition to
    // COORDINATED) also sees VALIDATED (decide() doesn't mutate anything).
    mockIntentFindUnique
      .mockResolvedValueOnce({ id: 'intent-1', status: 'CREATED', moduleId: 'openp2p', payload: { asset: 'BTC' } })
      .mockResolvedValueOnce({ id: 'intent-1', status: 'VALIDATED', moduleId: 'openp2p', payload: { asset: 'BTC' } })
      .mockResolvedValueOnce({ id: 'intent-1', status: 'VALIDATED', moduleId: 'openp2p', payload: { asset: 'BTC' } })
    mockIntentUpdate.mockResolvedValue({ id: 'intent-1', status: 'COORDINATED' })

    const payload = { asset: 'BTC', side: 'BUY' as const, maxValue: '0.5', minValue: '0.01' }
    const intent = await intentEngine.create('TradeIntent', payload, 'user-1')

    expect(intent.id).toBe('intent-1')
    // RFC-012: create() now returns the Intent in COORDINATED status, not CREATED
    expect(intent.status).toBe('COORDINATED')
    // CISO Byzantine + Economic rules both ran and passed *before* persistence
    expect(mockIntentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'TradeIntent', status: 'CREATED' }) })
    )
    // Timeline/audit write (IntentEvent) happened for CREATED...
    expect(mockIntentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ intentId: 'intent-1', toStatus: 'CREATED', prevHash: 'genesis' }),
      })
    )
    // ...and for the two new RFC-012 transitions
    expect(mockIntentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ intentId: 'intent-1', toStatus: 'VALIDATED' }) })
    )
    expect(mockIntentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ intentId: 'intent-1', toStatus: 'COORDINATED' }) })
    )
    // correlationId (RFC-010) = intentId, for all three lifecycle events
    expect(mockEmit).toHaveBeenCalledWith('intent.created', expect.objectContaining({ intentId: 'intent-1' }), 'intent-1')
    expect(mockEmit).toHaveBeenCalledWith('intent.validated', expect.objectContaining({ intentId: 'intent-1' }), 'intent-1')
    expect(mockEmit).toHaveBeenCalledWith('intent.coordinated', expect.objectContaining({ intentId: 'intent-1', targetModule: 'openp2p' }), 'intent-1')
  })

  it('rejects a malformed Intent (missing side) before ever calling Prisma — CISO Byzantine Rule', async () => {
    await expect(
      intentEngine.create('TradeIntent', { asset: 'BTC' }, 'user-1')
    ).rejects.toThrow(/Malformed Intent rejected/)
    expect(mockIntentCreate).not.toHaveBeenCalled()
  })

  it('rejects a financially insane Intent before ever calling Prisma — CISO Economic Rule', async () => {
    await expect(
      intentEngine.create('TradeIntent', { asset: 'BTC', side: 'BUY', maxValue: '-500' }, 'user-1')
    ).rejects.toThrow(/financial sanity/)
    expect(mockIntentCreate).not.toHaveBeenCalled()
  })
})
