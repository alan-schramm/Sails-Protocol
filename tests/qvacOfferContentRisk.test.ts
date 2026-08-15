/**
 * QvacAgentProvider.assessOfferContentRisk() (2026-08-15 security review)
 * — same mocking discipline as tests/qvacDisputeEvidence.test.ts: the
 * real @qvac/sdk (llama.cpp local inference) is mocked here, the
 * provider's own prompt-building/schema logic is real.
 */
export {} // same forced-module reasoning as chatUnification.test.ts

let capturedHistory: Array<{ role: string; content: string }> = []
let mockCompletionResult = { pattern: 'none', riskScore: 0, reasoning: 'mocked' }

jest.mock('@qvac/sdk', () => ({
  loadModel: jest.fn().mockResolvedValue('fake-model-id'),
  unloadModel: jest.fn().mockResolvedValue(undefined),
  LLAMA_3_2_1B_INST_Q4_0: 'fake-model-src',
  completion: jest.fn((args: { history: Array<{ role: string; content: string }> }) => {
    capturedHistory = args.history
    return { final: Promise.resolve({ contentText: JSON.stringify(mockCompletionResult) }) }
  }),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { QvacAgentProvider } = require('../src/modules/open-agents/qvac-agent.provider')

describe('QvacAgentProvider.assessOfferContentRisk()', () => {
  beforeEach(() => {
    capturedHistory = []
    mockCompletionResult = { pattern: 'none', riskScore: 0, reasoning: 'mocked' }
  })

  it('returns the model-provided assessment, parsed from the schema-constrained JSON', async () => {
    mockCompletionResult = { pattern: 'off_channel_migration', riskScore: 80, reasoning: 'asks to move to Telegram' }
    const provider = new QvacAgentProvider()
    const result = await provider.assessOfferContentRisk('contact me on telegram to trade', undefined)

    expect(result).toEqual(mockCompletionResult)
  })

  it('includes both description and payment details in the prompt, and frames them as untrusted', async () => {
    const provider = new QvacAgentProvider()
    await provider.assessOfferContentRisk('great rate, fast trade', 'pay to account 12345')

    const userMessage = capturedHistory.find((m) => m.role === 'user')?.content ?? ''
    expect(userMessage).toContain('great rate, fast trade')
    expect(userMessage).toContain('pay to account 12345')
    const systemMessage = capturedHistory.find((m) => m.role === 'system')?.content ?? ''
    expect(systemMessage).toMatch(/untrusted|submitted by a counterparty/i)
  })

  it('does not offer unexpected_flow_deviation as a valid pattern — no trade exists yet to compare against', async () => {
    const provider = new QvacAgentProvider()
    const systemMessage = (async () => {
      await provider.assessOfferContentRisk('test', undefined)
      return capturedHistory.find((m) => m.role === 'system')?.content ?? ''
    })()
    expect(await systemMessage).not.toContain('unexpected_flow_deviation')
  })
})
