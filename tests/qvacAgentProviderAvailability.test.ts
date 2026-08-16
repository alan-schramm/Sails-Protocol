/**
 * Missão 02 Fase 5 item 10 ("agente indisponível") — proves QVAC's real
 * local inference (llama.cpp, no cloud fallback) failing propagates as a
 * real rejected promise, never a swallowed error or a fabricated result
 * that could look like a legitimate (if useless) generated Intent/offer.
 * Same mocking discipline as qvacDisputeEvidence.test.ts: the real
 * @qvac/sdk is mocked, the provider's own logic is real.
 */
export {} // same forced-module reasoning as chatUnification.test.ts

jest.mock('@qvac/sdk', () => ({
  loadModel: jest.fn().mockResolvedValue('fake-model-id'),
  unloadModel: jest.fn().mockResolvedValue(undefined),
  LLAMA_3_2_1B_INST_Q4_0: 'fake-model-src',
  completion: jest.fn(() => {
    throw new Error('model unavailable — no GPU/model loaded in this environment')
  }),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { QvacAgentProvider } = require('../src/modules/open-agents/qvac-agent.provider')

describe('QvacAgentProvider — agent unavailable (Missão 02 Fase 5 item 10)', () => {
  it('generateTradeIntent() rejects, rather than returning a fabricated result, when the model call fails', async () => {
    const provider = new QvacAgentProvider()
    await expect(provider.generateTradeIntent('quero comprar bitcoin via PIX')).rejects.toThrow(/unavailable/)
  })

  it('assessIntentRisk() rejects the same way — an unavailable agent never silently produces a "safe" advisory signal', async () => {
    const provider = new QvacAgentProvider()
    await expect(provider.assessIntentRisk({
      asset: 'BTC', side: 'BUY', maxValue: '0.5', minValue: '0.01',
    })).rejects.toThrow(/unavailable/)
  })
})
