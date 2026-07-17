/**
 * BuyerAgent/SellerAgent — the wiring logic (prompt construction, schema
 * selection, mapping QVAC's structured output into the protocol's real
 * TradeIntentPayload/offer shapes).
 *
 * @qvac/sdk is mocked here (loadModel/completion/unloadModel) rather
 * than running the real model — a live run was already done directly
 * against the real SDK (see qvac-agent.provider.ts's own doc comment and
 * TODO.md §5B for the observed timing/output), and re-running a ~737MB
 * model download + GPU inference on every test-suite run would make
 * `npm test` unusable for CI. What's verified here instead: does each
 * agent ask for the right schema, and does it correctly turn whatever
 * QVAC returns into the exact shape intent-engine.ts/liquidity.service.ts
 * expect.
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
import { BuyerAgent } from '../src/modules/open-agents/buyer-agent'
import { SellerAgent } from '../src/modules/open-agents/seller-agent'

describe('BuyerAgent.requestTradeIntent (structured Intent generation via QVAC)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('turns QVAC structured output into a real TradeIntentPayload', async () => {
    mockCompletion.mockReturnValueOnce(
      fakeCompletionRun(JSON.stringify({
        asset: 'USDT_ERC20', side: 'BUY', maxValue: '100', minValue: '10', currency: 'BRL', fiatMethod: 'PIX',
      }))
    )

    const provider = new QvacAgentProvider()
    const agent = new BuyerAgent(provider, { participantId: 'buyer-1', label: 'buyer-wallet' })
    const payload = await agent.requestUsdtViaPix('500')

    expect(payload).toEqual({
      asset: 'USDT_ERC20', side: 'BUY', maxValue: '100', minValue: '10', currency: 'BRL', fiatMethod: 'PIX',
    })
    // Every field is a string, never a JS number — RFC-009's decimal-string
    // convention, the actual thing intent-engine.ts's validateStructure()
    // rejects a non-string maxValue/minValue for.
    expect(typeof payload.maxValue).toBe('string')
    expect(typeof payload.minValue).toBe('string')
  })

  it('requests the trade_intent JSON schema with a PIX/USDT-grounded goal', async () => {
    mockCompletion.mockReturnValueOnce(
      fakeCompletionRun(JSON.stringify({ asset: 'USDT_ERC20', side: 'BUY', maxValue: '1', minValue: '1', currency: 'BRL', fiatMethod: 'PIX' }))
    )

    const provider = new QvacAgentProvider()
    const agent = new BuyerAgent(provider, { participantId: 'buyer-1', label: 'buyer-wallet' })
    await agent.requestUsdtViaPix('500')

    expect(mockCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: expect.objectContaining({
          type: 'json_schema',
          json_schema: expect.objectContaining({ name: 'trade_intent' }),
        }),
        history: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: expect.stringContaining('PIX') }),
        ]),
      })
    )
  })

  it('loads the model only once across multiple calls (shared provider instance)', async () => {
    mockCompletion.mockReturnValue(
      fakeCompletionRun(JSON.stringify({ asset: 'USDT_ERC20', side: 'BUY', maxValue: '1', minValue: '1', currency: 'BRL', fiatMethod: 'PIX' }))
    )

    const provider = new QvacAgentProvider()
    const agent = new BuyerAgent(provider, { participantId: 'buyer-1', label: 'buyer-wallet' })
    await agent.requestUsdtViaPix('100')
    await agent.requestUsdtViaPix('200')

    expect(mockLoadModel).toHaveBeenCalledTimes(1)
    expect(mockCompletion).toHaveBeenCalledTimes(2)
  })
})

describe('SellerAgent.proposeOffer (structured offer generation via QVAC)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('turns QVAC structured output into liquidity.service.ts\'s expected offer shape (minus userId/priceUsd)', async () => {
    mockCompletion.mockReturnValueOnce(
      fakeCompletionRun(JSON.stringify({
        asset: 'USDT_ERC20', side: 'SELL', minAmount: '10', maxAmount: '500', paymentMethod: 'PIX',
      }))
    )

    const provider = new QvacAgentProvider()
    const agent = new SellerAgent(provider, { participantId: 'seller-1', label: 'seller-wallet' })
    const offer = await agent.offerUsdtForPix()

    expect(offer).toEqual({ asset: 'USDT_ERC20', side: 'SELL', minAmount: '10', maxAmount: '500', paymentMethod: 'PIX' })
    // priceUsd/userId are deliberately not part of what QVAC decides —
    // seller-agent.ts's own doc comment explains why (no live price feed).
    expect(offer).not.toHaveProperty('priceUsd')
    expect(offer).not.toHaveProperty('userId')
  })
})

describe('WalletAgent.agentId', () => {
  it('is distinct from participantId and stable across calls', () => {
    const provider = new QvacAgentProvider()
    const agent = new BuyerAgent(provider, { participantId: 'buyer-1', label: 'buyer-wallet' })
    expect(agent.agentId).not.toBe(agent.participantId)
    expect(agent.agentId).toBe(agent.agentId)
    expect(agent.agentId).toContain('buyer-wallet')
    expect(agent.agentId).toContain('buyer-1')
  })
})
