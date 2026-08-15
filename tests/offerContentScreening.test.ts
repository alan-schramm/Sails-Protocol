/**
 * liquidity.service.ts's screenOfferContent() — the wiring between
 * createOffer() and QvacAgentProvider.assessOfferContentRisk(): gated
 * behind config.features.socialEngineeringDetection, skips the QVAC call
 * entirely when there's no text to screen (same cheap pre-filter
 * discipline social-engineering-agent.ts's own evaluate() uses), and is
 * fire-and-forget — never awaited by createOffer(), so a slow/failed
 * QVAC call can't fail or delay offer creation.
 */
export {} // same forced-module reasoning as chatUnification.test.ts

let socialEngineeringDetection = false
jest.mock('../src/config', () => ({
  get config() {
    return { features: { socialEngineeringDetection } }
  },
}))

const mockAssessOfferContentRisk = jest.fn()
jest.mock('../src/modules/open-agents/qvac-agent.provider', () => ({
  qvacAgentProvider: { assessOfferContentRisk: (...args: unknown[]) => mockAssessOfferContentRisk(...args) },
}))

const mockEmit = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}))

// liquidity.service.ts's module-scope imports (prisma, intentEngine)
// aren't exercised by screenOfferContent() itself — it's a standalone
// function — but importing the file still needs these to not blow up at
// module-load time (common/database's own module constructs a real
// Prisma adapter from config.database.url at import time).
jest.mock('../src/common/database', () => ({ prisma: {} }))
jest.mock('../src/core/intent-engine', () => ({ intentEngine: { create: jest.fn() } }))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { screenOfferContent } = require('../src/modules/open-liquidity/liquidity.service')

const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('screenOfferContent()', () => {
  beforeEach(() => {
    socialEngineeringDetection = false
    jest.clearAllMocks()
  })

  it('never calls QVAC when the flag is off, even with real text content', async () => {
    socialEngineeringDetection = false
    screenOfferContent('offer-1', 'user-1', 'contact me on telegram', undefined)
    await flush()
    expect(mockAssessOfferContentRisk).not.toHaveBeenCalled()
  })

  it('never calls QVAC when both description and paymentDetails are empty, even with the flag on', async () => {
    socialEngineeringDetection = true
    screenOfferContent('offer-1', 'user-1', undefined, undefined)
    screenOfferContent('offer-1', 'user-1', '   ', '')
    await flush()
    expect(mockAssessOfferContentRisk).not.toHaveBeenCalled()
  })

  it('is fire-and-forget — returns before the QVAC call resolves', () => {
    socialEngineeringDetection = true
    let resolved = false
    mockAssessOfferContentRisk.mockReturnValueOnce(
      new Promise((resolve) => setTimeout(() => { resolved = true; resolve({ pattern: 'none', riskScore: 0, reasoning: '' }) }, 50))
    )

    screenOfferContent('offer-1', 'user-1', 'some description', undefined)

    expect(resolved).toBe(false) // proves the function returned synchronously, not after the QVAC call
  })

  it('emits liquidity.offer.content_risk_detected when a pattern is detected', async () => {
    socialEngineeringDetection = true
    mockAssessOfferContentRisk.mockResolvedValueOnce({ pattern: 'off_channel_migration', riskScore: 85, reasoning: 'asks to move off-platform' })

    screenOfferContent('offer-1', 'user-1', 'contact me on telegram to negotiate', undefined)
    await flush()

    expect(mockEmit).toHaveBeenCalledWith(
      'liquidity.offer.content_risk_detected',
      expect.objectContaining({ offerId: 'offer-1', userId: 'user-1', pattern: 'off_channel_migration', riskScore: 85 }),
      'offer-1'
    )
  })

  it('does not emit anything when the pattern is none', async () => {
    socialEngineeringDetection = true
    mockAssessOfferContentRisk.mockResolvedValueOnce({ pattern: 'none', riskScore: 0, reasoning: 'looks fine' })

    screenOfferContent('offer-1', 'user-1', 'great rate, fast and friendly', undefined)
    await flush()

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('does not throw when the QVAC call itself fails', async () => {
    socialEngineeringDetection = true
    mockAssessOfferContentRisk.mockRejectedValueOnce(new Error('model unavailable'))

    expect(() => screenOfferContent('offer-1', 'user-1', 'some text', undefined)).not.toThrow()
    await flush()
    expect(mockEmit).not.toHaveBeenCalled()
  })
})
